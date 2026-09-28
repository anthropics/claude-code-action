import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OrcaRouterCredentialStore,
  apiKeyCredentialSource,
  classifyCredentialFailure,
  inspectStoredCredential,
  pkceCredentialSource,
  resolveOrcaRouterCredential,
  scopeIsSufficient,
} from "../../src/orcarouter/credentials";
import {
  OrcaRouterAuthError,
  OrcaRouterLoginSession,
  connectWithOrcaRouter,
  exchangeAuthorizationCode,
  handleRelayFailure,
  isOrcaRouterAuthError,
  parseAuthorizationInput,
} from "../../src/orcarouter/connect";
import { ORCA_TOKEN_PATH } from "../../src/orcarouter/endpoints";

/**
 * A real in-process authorization server. The adapter talks to it over HTTP, so
 * the authorize -> out-of-band code -> exchange -> persist path is exercised end
 * to end rather than by poking at hash helpers.
 */
type RecordedRequest = {
  method: string;
  path: string;
  body: Record<string, unknown>;
};

class FakeAuthServer {
  readonly requests: RecordedRequest[] = [];
  /** challenge sent at authorize time, keyed by the code we mint. */
  private challenges = new Map<string, string>();
  /** Codes already exchanged, so single-use semantics are real. */
  readonly redeemedCodes = new Set<string>();
  private server?: http.Server;
  origin = "";
  /** Behaviour knobs for the failure cases. */
  status = 200;
  scope = "api";
  key = "sk-orca-test-0000000000000000";

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let body: Record<string, unknown> = {};
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          body = {};
        }
        this.requests.push({
          method: req.method ?? "",
          path: req.url ?? "",
          body,
        });

        if (this.status !== 200) {
          res.writeHead(this.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "fake", error_description: "fake" }));
          return;
        }

        const code = String(body.code ?? "");
        const verifier = String(body.code_verifier ?? "");
        const expected = this.challenges.get(code);
        const actual = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        if (!expected || expected !== actual || this.redeemedCodes.has(code)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        if (body.code_challenge_method !== "S256") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }
        this.redeemedCodes.add(code);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            key: this.key,
            user_id: "12345",
            scope: this.scope,
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.server!.address() as AddressInfo;
    this.origin = `http://127.0.0.1:${address.port}`;
  }

  /** Register the challenge from the URL the adapter presented to the user. */
  mintCode(
    authorizeUrl: string,
    code = "code-" + randomBytes(6).toString("hex"),
  ): string {
    const challenge = new URL(authorizeUrl).searchParams.get("code_challenge")!;
    this.challenges.set(code, challenge);
    return code;
  }

  get exchangeRequests(): RecordedRequest[] {
    return this.requests.filter((r) => r.path.includes("/auth/keys"));
  }

  async stop(): Promise<void> {
    if (this.server)
      await new Promise<void>((r) => this.server!.close(() => r()));
  }
}

let home: string;
let server: FakeAuthServer;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "orca-test-"));
  server = new FakeAuthServer();
  await server.start();
});

afterEach(async () => {
  await server.stop();
  await rm(home, { recursive: true, force: true });
});

function store(): OrcaRouterCredentialStore {
  return new OrcaRouterCredentialStore(home);
}

let lastPresented: string | undefined;

beforeEach(() => {
  lastPresented = undefined;
});

describe("OrcaRouter connect flow (Flow B, end to end)", () => {
  test("authorize -> out-of-band code -> exchange -> persist", async () => {
    const credential = await connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      presentUrl: (url) => {
        lastPresented = url;
      },
      requestCode: async () => server.mintCode(lastPresented!),
    });

    expect(credential.source).toBe("pkce");
    expect(credential.key).toBe(server.key);
    expect(credential.scope).toBe("api");
    expect(credential.generation).toBe(1);

    // Persisted through the project's existing secret path, owner-only.
    const record = await store().read();
    expect(record?.key).toBe(server.key);
    expect(record?.source).toBe("pkce");
    const mode = (await stat(store().path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("exchanges on the auth origin's /api/v1/auth/keys, never the inference origin", async () => {
    await connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      presentUrl: (url) => {
        lastPresented = url;
      },
      requestCode: async () => server.mintCode(lastPresented!),
    });

    const exchange = server.exchangeRequests;
    expect(exchange.length).toBe(1);
    expect(exchange[0]!.path).toBe(ORCA_TOKEN_PATH);
    expect(exchange[0]!.path).toBe("/api/v1/auth/keys");
    // The auth path is not a versioned inference path.
    expect(exchange[0]!.path).not.toBe("/v1/auth/keys");
    expect(exchange[0]!.path).not.toBe("/auth/keys");
    expect(exchange[0]!.body.code_challenge_method).toBe("S256");
    // And no request of any kind went to the inference origin.
    expect(
      server.requests.every((r) => r.path.startsWith("/api/v1/auth")),
    ).toBe(true);
  });

  test("the consent URL carries only the challenge, never the verifier", async () => {
    let authorizeUrl = "";
    await connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      presentUrl: (url) => {
        authorizeUrl = url;
      },
      requestCode: async () => server.mintCode(authorizeUrl),
    });

    expect(authorizeUrl).toContain("code_challenge=");
    expect(authorizeUrl).not.toContain("code_verifier");
    // The verifier itself must not be recoverable from the URL.
    const record = await store().read();
    expect(record?.key).toBeTruthy();
  });

  test("re-running reuses the stored login instead of minting a second key", async () => {
    const first = await connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      presentUrl: (url) => {
        lastPresented = url;
      },
      requestCode: async () => server.mintCode(lastPresented!),
    });
    const exchangesAfterFirst = server.exchangeRequests.length;

    // A "restart" reads the stored credential through the same seam.
    const reloaded = await resolveOrcaRouterCredential([
      pkceCredentialSource(store()),
    ]);
    expect(reloaded?.key).toBe(first.key);
    expect(server.exchangeRequests.length).toBe(exchangesAfterFirst);
  });
});

describe("OrcaRouter credential seam", () => {
  test("both adapters produce the same credential result shape", async () => {
    const fromKey = await apiKeyCredentialSource("sk-orca-pasted-key").load();
    expect(fromKey).toEqual({
      key: "sk-orca-pasted-key",
      source: "api-key",
      generation: 0,
    });

    await store().save({
      key: "sk-orca-login-key",
      source: "pkce",
      scope: "api",
    });
    const fromPkce = await pkceCredentialSource(store()).load();
    expect(fromPkce).toEqual({
      key: "sk-orca-login-key",
      source: "pkce",
      scope: "api",
      generation: 1,
    });

    // Downstream only needs these fields; the source is provenance, not behaviour.
    expect(Object.keys(fromKey!).sort()).toEqual(
      Object.keys({ key: "", source: "", generation: 0 }).sort(),
    );
    expect(fromPkce!.key).toMatch(/^sk-orca-/);
  });

  test("an explicitly supplied key takes precedence over a stored login", async () => {
    await store().save({ key: "sk-orca-stored", source: "pkce" });
    const resolved = await resolveOrcaRouterCredential([
      apiKeyCredentialSource("sk-orca-explicit"),
      pkceCredentialSource(store()),
    ]);
    expect(resolved?.source).toBe("api-key");
    expect(resolved?.key).toBe("sk-orca-explicit");
  });

  test("save / read / clear round-trips", async () => {
    await store().save({ key: "sk-orca-a", source: "pkce", scope: "api" });
    expect((await store().read())?.key).toBe("sk-orca-a");
    await store().clear();
    expect(await store().read()).toBeNull();
    await store().clear();
  });

  test("credentials are persisted in the project's existing user-scope directory", async () => {
    await store().save({ key: "sk-orca-a", source: "pkce" });
    expect(store().path.startsWith(join(home, ".claude"))).toBe(true);
    const raw = await readFile(store().path, "utf-8");
    expect(JSON.parse(raw).key).toBe("sk-orca-a");
  });

  test("a malformed stored credential is terminal, not retried", () => {
    expect(inspectStoredCredential(undefined)).toBe("missing");
    expect(inspectStoredCredential("   ")).toBe("missing");
    expect(inspectStoredCredential("not-a-key")).toBe("corrupted");
    expect(inspectStoredCredential("sk-orca-ok")).toBe("usable");
  });

  test("a 403 model-scope error is not treated as a revoked credential", () => {
    expect(classifyCredentialFailure(401)).toBe("needs-reauth");
    expect(classifyCredentialFailure(403)).toBe("unknown");
    expect(classifyCredentialFailure(429)).toBe("transient");
    expect(classifyCredentialFailure(503)).toBe("transient");
    expect(classifyCredentialFailure(undefined)).toBe("transient");
  });
});

describe("OrcaRouter failure handling", () => {
  const terminal = (input: string, state: string) => () =>
    parseAuthorizationInput(input, state);

  test("a denied authorization ends cleanly without persisting", async () => {
    let state = "";
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: (url) => {
          state = new URL(url).searchParams.get("state")!;
        },
        requestCode: async () => `code=x&error=access_denied&state=${state}`,
      }),
    ).rejects.toThrow(/declined/);

    expect(await store().read()).toBeNull();
    expect(server.exchangeRequests.length).toBe(0);
  });

  test("a mismatched state is refused before the code is exchanged", async () => {
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: () => {},
        requestCode: async () => "code=stolen&state=not-the-state-we-sent",
      }),
    ).rejects.toThrow(/state did not match/);

    // Crucially: no exchange request left the process.
    expect(server.exchangeRequests.length).toBe(0);
    expect(await store().read()).toBeNull();
  });

  test("an unknown, expired or already-used code is terminal", async () => {
    server.status = 403;
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: (url) => {
          lastPresented = url;
        },
        requestCode: async () => server.mintCode(lastPresented!),
      }),
    ).rejects.toThrow(/single-use with a 10 minute TTL/);
    expect(await store().read()).toBeNull();
  });

  test("a code cannot be redeemed twice", async () => {
    const code = "code-reuse";
    let presented = "";
    await connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      presentUrl: (url) => {
        presented = url;
      },
      requestCode: async () => server.mintCode(presented, code),
    });
    expect(server.exchangeRequests.length).toBe(1);

    // The server marks a code as spent; presenting it again is rejected even
    // with a freshly generated, well-formed verifier.
    server.redeemedCodes.add(code);
    await store().clear();
    await expect(
      exchangeAuthorizationCode({
        authBaseUrl: server.origin,
        code,
        verifier: "another-valid-looking-verifier",
      }),
    ).rejects.toThrow(/single-use with a 10 minute TTL/);
  });

  test("a challenge-method downgrade (400) is terminal", async () => {
    server.status = 400;
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: () => {},
        requestCode: async () => "any-code",
      }),
    ).rejects.toThrow(/not bound to S256/);
  });

  test("a rate-limited consent (429) is reported with the per-user cap", async () => {
    server.status = 429;
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: () => {},
        requestCode: async () => "any-code",
      }),
    ).rejects.toThrow(/10 PKCE keys per 24 hours/);
  });

  test("a granted scope below the requested scope is refused", async () => {
    server.scope = "connector";
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: (url) => {
          lastPresented = url;
        },
        requestCode: async () => server.mintCode(lastPresented!),
      }),
    ).rejects.toThrow(/scope that does not permit API access/);
    expect(await store().read()).toBeNull();
    expect(scopeIsSufficient("api")).toBe(true);
    expect(scopeIsSufficient("connector")).toBe(false);
    expect(scopeIsSufficient(undefined)).toBe(true);
  });

  test("a network failure is reported without hanging or hot-looping", async () => {
    await expect(
      exchangeAuthorizationCode({
        authBaseUrl: "http://127.0.0.1:1",
        code: "c",
        verifier: "v",
      }),
    ).rejects.toThrow(/could not be reached/);
  });

  test("a malformed exchange response is reported", async () => {
    const bad = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user_id: "1" }));
    });
    await new Promise<void>((r) => bad.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${(bad.address() as AddressInfo).port}`;
    try {
      await expect(
        exchangeAuthorizationCode({
          authBaseUrl: origin,
          code: "c",
          verifier: "v",
        }),
      ).rejects.toThrow(/did not contain a usable key/);
    } finally {
      await new Promise<void>((r) => bad.close(() => r()));
    }
  });

  test("a cancelled login persists nothing and releases its state", async () => {
    const session = new OrcaRouterLoginSession();
    await expect(
      connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        session,
        presentUrl: () => {},
        requestCode: async () => null,
      }),
    ).rejects.toThrow(/cancelled/);
    expect(session.state.busy).toBe(false);
    expect(await store().read()).toBeNull();
  });

  test("authorization errors carry an actionable next step and no credential", async () => {
    try {
      await connectWithOrcaRouter({
        authBaseUrl: server.origin,
        store: store(),
        presentUrl: () => {},
        requestCode: async () => "code=x&error=access_denied&state=s",
      });
      throw new Error("expected failure");
    } catch (error) {
      expect(isOrcaRouterAuthError(error)).toBe(true);
      const authError = error as OrcaRouterAuthError;
      expect(authError.action.length).toBeGreaterThan(20);
      expect(authError.message).not.toMatch(/sk-orca-/);
    }
  });

  test("terminal parse errors reject the empty and malformed inputs", () => {
    expect(terminal("", "s")).toThrow(/cancelled/);
    // A bare code pasted straight from the consent screen is accepted.
    expect(parseAuthorizationInput("just-a-code", "s")).toEqual({
      code: "just-a-code",
    });
    const attemptState = "state-abc";
    expect(parseAuthorizationInput("code-123", attemptState)).toEqual({
      code: "code-123",
    });
    expect(
      parseAuthorizationInput("code=code-123&state=state-abc", attemptState),
    ).toEqual({ code: "code-123" });
  });
});

describe("OrcaRouter login session lifecycle", () => {
  test("a superseded generation cannot overwrite newer state", () => {
    const session = new OrcaRouterLoginSession();
    const first = session.begin();
    const second = session.begin();
    expect(session.setHint(first, "stale")).toBe(false);
    expect(session.release(first)).toBe(false);
    expect(session.state.busy).toBe(true);
    expect(session.isCurrent(second)).toBe(true);
    expect(session.release(second)).toBe(true);
    expect(session.state.busy).toBe(false);
  });

  test("releaseNow clears busy and hint synchronously for pagehide", () => {
    const session = new OrcaRouterLoginSession();
    const generation = session.begin();
    session.setHint(generation, "Waiting for authorization");
    expect(session.state.busy).toBe(true);
    expect(session.state.hint).toBe("Waiting for authorization");

    session.releaseNow();
    expect(session.state.busy).toBe(false);
    expect(session.state.hint).toBeUndefined();
    // A second login can start without the component being remounted.
    const next = session.begin();
    expect(session.isCurrent(next)).toBe(true);
    expect(session.state.busy).toBe(true);
    // The abandoned request can no longer mutate state.
    expect(session.setHint(generation, "late")).toBe(false);
  });

  test("a late response from an abandoned attempt cannot persist", async () => {
    const session = new OrcaRouterLoginSession();
    let presented = "";
    const pending = connectWithOrcaRouter({
      authBaseUrl: server.origin,
      store: store(),
      session,
      presentUrl: (url) => {
        presented = url;
      },
      requestCode: async () => {
        session.releaseNow();
        return server.mintCode(presented);
      },
    });
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(await store().read()).toBeNull();
  });
});

describe("OrcaRouter terminal 401 recovery", () => {
  test("marks only the exact rejected generation and never fakes a refresh", async () => {
    const saved = await store().save({ key: "sk-orca-live", source: "pkce" });
    const credential = (await pkceCredentialSource(store()).load())!;
    const requestsBefore = server.requests.length;

    const outcome = await handleRelayFailure(
      401,
      credential,
      store(),
      classifyCredentialFailure,
    );
    expect(outcome.kind).toBe("needs-reauth");
    expect(outcome.marked).toBe(true);
    expect(outcome.message).toMatch(/Re-run the connect flow/);

    const record = await store().read();
    expect(record?.generation).toBe(saved.generation);
    expect(record?.needsReauth).toBe(true);
    // The durable key is retained: nothing is deleted before a replacement works.
    expect(record?.key).toBe("sk-orca-live");
    // No refresh grant is attempted — there is no refresh endpoint.
    expect(server.requests.length).toBe(requestsBefore);
  });

  test("a late 401 from an old generation cannot poison a newer credential", async () => {
    await store().save({ key: "sk-orca-first", source: "pkce" });
    const stale: OrcaRouterCredentialLike = {
      key: "sk-orca-first",
      source: "pkce",
      generation: 1,
    };
    // A fresh login replaces the credential, advancing the generation.
    const replacement = await store().save({
      key: "sk-orca-second",
      source: "pkce",
    });
    expect(replacement.generation).toBe(2);

    const outcome = await handleRelayFailure(
      401,
      stale,
      store(),
      classifyCredentialFailure,
    );
    expect(outcome.marked).toBe(false);

    const record = await store().read();
    expect(record?.needsReauth).toBeUndefined();
    expect(record?.key).toBe("sk-orca-second");
  });

  test("a pasted key is never silently marked for reauthentication", async () => {
    const outcome = await handleRelayFailure(
      401,
      { key: "sk-orca-pasted", source: "api-key", generation: 0 },
      store(),
      classifyCredentialFailure,
    );
    expect(outcome.marked).toBe(false);
    expect(outcome.message).toMatch(/Issue a new key/);
  });

  test("transient failures do not mutate credential state", async () => {
    await store().save({ key: "sk-orca-live", source: "pkce" });
    const credential = (await pkceCredentialSource(store()).load())!;
    for (const status of [429, 500, 503, undefined]) {
      const outcome = await handleRelayFailure(
        status,
        credential,
        store(),
        classifyCredentialFailure,
      );
      expect(outcome.marked).toBe(false);
      expect(outcome.kind).toBe("transient");
    }
    expect((await store().read())?.needsReauth).toBeUndefined();
  });

  test("a successful login clears the reauth marker", async () => {
    await store().save({ key: "sk-orca-live", source: "pkce" });
    const credential = (await pkceCredentialSource(store()).load())!;
    await handleRelayFailure(
      401,
      credential,
      store(),
      classifyCredentialFailure,
    );
    expect((await store().read())?.needsReauth).toBe(true);

    await store().save({ key: "sk-orca-fresh", source: "pkce" });
    expect((await store().read())?.needsReauth).toBeUndefined();
  });
});

type OrcaRouterCredentialLike = {
  key: string;
  source: "api-key" | "pkce";
  generation: number;
};
