import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  ORCA_DEFAULT_API_BASE_URL,
  ORCA_DEFAULT_AUTH_BASE_URL,
  looksLikeOrcaRouterKey,
  maskSecret,
  redactOrcaRouterKeys,
  resolveOrcaRouterOrigins,
} from "../../src/orcarouter/endpoints";
import {
  base64UrlEncode,
  createPkceAttempt,
  stateMatches,
} from "../../src/orcarouter/pkce";
import { buildAuthorizeUrl } from "../../src/orcarouter/connect";

describe("OrcaRouter origins", () => {
  test("uses separate public auth and inference defaults", () => {
    const origins = resolveOrcaRouterOrigins({});
    expect(origins.authBaseUrl).toBe("https://www.orcarouter.ai");
    expect(origins.apiBaseUrl).toBe("https://api.orcarouter.ai");
    expect(origins.apiBaseV1Url).toBe("https://api.orcarouter.ai/v1");
  });

  test("never derives one public origin from the other", () => {
    const origins = resolveOrcaRouterOrigins({});
    // The inference origin must not be reachable by rewriting the auth hostname,
    // which is exactly the mistake that produces /v1/auth/keys 404s.
    expect(origins.authBaseUrl).not.toContain("api.orcarouter.ai");
    expect(origins.apiBaseV1Url).not.toContain("www.orcarouter.ai");
    expect(origins.apiBaseV1Url).not.toContain("/auth");
  });

  test("a shared self-hosted base feeds both origins", () => {
    const origins = resolveOrcaRouterOrigins({
      ORCA_BASE_URL: "https://orca.internal.example",
    });
    expect(origins.authBaseUrl).toBe("https://orca.internal.example");
    expect(origins.apiBaseV1Url).toBe("https://orca.internal.example/v1");
  });

  test("explicit auth and api overrides take precedence over the shared base", () => {
    const origins = resolveOrcaRouterOrigins({
      ORCA_BASE_URL: "https://shared.example",
      ORCA_AUTH_BASE_URL: "https://auth.example",
      ORCA_API_BASE_URL: "https://api.example",
    });
    expect(origins.authBaseUrl).toBe("https://auth.example");
    expect(origins.apiBaseV1Url).toBe("https://api.example/v1");
  });

  test("does not double-append the version segment", () => {
    const origins = resolveOrcaRouterOrigins({
      ORCA_API_BASE_URL: "https://api.example/v1",
    });
    expect(origins.apiBaseV1Url).toBe("https://api.example/v1");
  });

  test("permits http only for loopback development hosts", () => {
    expect(
      resolveOrcaRouterOrigins({ ORCA_API_BASE_URL: "http://127.0.0.1:8080" })
        .apiBaseV1Url,
    ).toBe("http://127.0.0.1:8080/v1");
    expect(
      resolveOrcaRouterOrigins({ ORCA_AUTH_BASE_URL: "http://localhost:3000" })
        .authBaseUrl,
    ).toBe("http://localhost:3000");
  });

  test("rejects plaintext http for a remote origin", () => {
    expect(() =>
      resolveOrcaRouterOrigins({ ORCA_API_BASE_URL: "http://api.example.com" }),
    ).toThrow(/must use https/);
    expect(() =>
      resolveOrcaRouterOrigins({ ORCA_AUTH_BASE_URL: "http://evil.example" }),
    ).toThrow(/must use https/);
  });

  test("defaults are https", () => {
    expect(ORCA_DEFAULT_AUTH_BASE_URL.startsWith("https://")).toBe(true);
    expect(ORCA_DEFAULT_API_BASE_URL.startsWith("https://")).toBe(true);
  });
});

describe("OrcaRouter secret handling", () => {
  test("recognises the documented key prefix", () => {
    expect(looksLikeOrcaRouterKey("sk-orca-abc123")).toBe(true);
    expect(looksLikeOrcaRouterKey("sk-ant-abc123")).toBe(false);
    expect(looksLikeOrcaRouterKey(undefined)).toBe(false);
  });

  test("masks a secret without exposing recoverable material", () => {
    const masked = maskSecret("sk-orca-0123456789abcdef");
    expect(masked).not.toContain("0123456789abcdef");
    expect(masked.startsWith("sk-orca-0")).toBe(true);
    expect(maskSecret(undefined)).toBe("(unset)");
  });

  test("redacts key-shaped tokens from arbitrary text", () => {
    const text = "request failed for sk-orca-9f8e7d6c5b4a3f2e1d0c";
    const redacted = redactOrcaRouterKeys(text);
    expect(redacted).not.toContain("9f8e7d6c5b4a3f2e1d0c");
    expect(redacted).toContain("[REDACTED_ORCAROUTER_KEY]");
  });
});

describe("PKCE primitives", () => {
  test("challenge is unpadded base64url(sha256(verifier))", () => {
    const attempt = createPkceAttempt();
    const expected = createHash("sha256")
      .update(attempt.verifier)
      .digest("base64url");
    expect(attempt.challenge).toBe(expected);
    expect(attempt.challenge).not.toContain("=");
    expect(attempt.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("generates a fresh verifier and state on every attempt", () => {
    const attempts = Array.from({ length: 50 }, () => createPkceAttempt());
    expect(new Set(attempts.map((a) => a.verifier)).size).toBe(50);
    expect(new Set(attempts.map((a) => a.state)).size).toBe(50);
    expect(new Set(attempts.map((a) => a.challenge)).size).toBe(50);
    for (const attempt of attempts) {
      // 32 random bytes base64url-encode to 43 characters.
      expect(attempt.verifier.length).toBe(43);
    }
  });

  test("verifier is high-entropy and not derived from anything guessable", () => {
    const attempt = createPkceAttempt();
    expect(base64UrlEncode(Buffer.from(attempt.verifier, "base64url"))).toBe(
      attempt.verifier,
    );
    expect(Buffer.from(attempt.verifier, "base64url").length).toBe(32);
  });

  test("state comparison accepts the exact echo and nothing else", () => {
    const attempt = createPkceAttempt();
    expect(stateMatches(attempt.state, attempt.state)).toBe(true);
    expect(stateMatches(attempt.state, attempt.state + "x")).toBe(false);
    expect(stateMatches(attempt.state, attempt.state.slice(0, -1))).toBe(false);
    expect(stateMatches(attempt.state, "")).toBe(false);
    expect(stateMatches(attempt.state, null)).toBe(false);
    expect(stateMatches(attempt.state, createPkceAttempt().state)).toBe(false);
  });
});

describe("OrcaRouter authorize URL", () => {
  const attempt = createPkceAttempt();

  test("targets the fixed /auth path on the auth origin only", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authBaseUrl: "https://www.orcarouter.ai",
        challenge: attempt.challenge,
        state: attempt.state,
      }),
    );
    expect(url.origin).toBe("https://www.orcarouter.ai");
    expect(url.pathname).toBe("/auth");
  });

  test("uses Flow B (callback_url=oob) with a mandatory S256 challenge", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authBaseUrl: "https://www.orcarouter.ai",
        challenge: attempt.challenge,
        state: attempt.state,
      }),
    );
    expect(url.searchParams.get("callback_url")).toBe("oob");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(attempt.challenge);
    expect(url.searchParams.get("state")).toBe(attempt.state);
    expect(url.searchParams.get("scope")).toBe("api");
    expect(url.searchParams.get("app_name")).toBe("Claude Code Action");
  });

  test("the verifier never appears in the authorize URL", () => {
    const url = buildAuthorizeUrl({
      authBaseUrl: "https://www.orcarouter.ai",
      challenge: attempt.challenge,
      state: attempt.state,
    });
    expect(url).not.toContain(attempt.verifier);
    expect(url).not.toContain(encodeURIComponent(attempt.verifier));
  });
});
