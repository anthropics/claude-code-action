import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OrcaRouterCredentialStore,
  type OrcaRouterCredential,
} from "../../src/orcarouter/credentials";
import {
  ORCAROUTER_PROVIDER,
  apiKeyFromEnv,
  isOrcaRouterEnabled,
  orcaRouterEnvironment,
  resolveOrcaRouter,
} from "../../src/orcarouter/provider";
import { OrcaRouterCatalogCache } from "../../src/orcarouter/catalog";

const CATALOG_URL_FIXTURE = {
  data: [
    {
      id: "deepseek/deepseek-v4-pro",
      supported_endpoint_types: ["openai", "openai-response"],
      architecture: { input_modalities: ["text"] },
    },
    {
      id: "anthropic/claude-opus-4.8",
      supported_endpoint_types: ["anthropic", "openai"],
      architecture: { input_modalities: ["text", "image"] },
    },
    { id: "jina/jina-reranker-v3", supported_endpoint_types: ["jina-rerank"] },
  ],
};

/** Records every request so the origin and Bearer header can be asserted. */
class FakeGateway {
  readonly requests: { method: string; path: string; auth?: string }[] = [];
  /** Response overrides for failure modes. */
  modelsStatus = 200;
  chatStatus = 200;
  private server?: http.Server;
  origin = "";

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.requests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        auth: req.headers.authorization as string | undefined,
      });
      const path = req.url ?? "";
      if (path.startsWith("/v1/models")) {
        if (this.modelsStatus !== 200) {
          res.writeHead(this.modelsStatus).end("{}");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(CATALOG_URL_FIXTURE));
        return;
      }
      if (path === "/v1/chat/completions") {
        if (this.chatStatus !== 200) {
          res.writeHead(this.chatStatus, {
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify({ error: { code: "unauthorized" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-fake",
            object: "chat.completion",
            model: "deepseek/deepseek-v4-pro",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ok" },
                finish_reason: "stop",
              },
            ],
          }),
        );
        return;
      }
      if (path === "/v1/messages") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg-fake",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            model: "deepseek/deepseek-v4-pro",
            usage: { input_tokens: 3, output_tokens: 1 },
          }),
        );
        return;
      }
      res.writeHead(404).end("{}");
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.origin = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    if (this.server)
      await new Promise<void>((r) => this.server!.close(() => r()));
  }
}

let home: string;
let gateway: FakeGateway;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "orca-provider-"));
  gateway = new FakeGateway();
  await gateway.start();
});

afterEach(async () => {
  await gateway.stop();
  await rm(home, { recursive: true, force: true });
});

function store(): OrcaRouterCredentialStore {
  return new OrcaRouterCredentialStore(home);
}

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    ORCA_API_BASE_URL: gateway.origin,
    ORCA_AUTH_BASE_URL: gateway.origin,
    ...overrides,
  };
}

/** Exercise the inference path exactly as the wired provider does. */
async function callInference(
  credential: OrcaRouterCredential,
  selected: string,
): Promise<{ status: number; body: unknown }> {
  const resolution = {
    enabled: true,
    origins: {
      authBaseUrl: gateway.origin,
      apiBaseUrl: gateway.origin,
      apiBaseV1Url: `${gateway.origin}/v1`,
    },
    credential,
    modelOptions: [],
    selectedModel: selected,
    selectionCleared: false,
    degraded: false,
    errors: [],
    warnings: [],
  };
  const environment = orcaRouterEnvironment(resolution);
  // This mirrors the Anthropic SDK's own URL construction: the base URL is the
  // origin and the client appends `/v1/messages`. Including `/v1` in the base
  // would produce `/v1/v1/messages` and a 404.
  const response = await fetch(
    `${environment.ANTHROPIC_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        "x-api-key": environment.ANTHROPIC_AUTH_TOKEN!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: environment.ANTHROPIC_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "hi" }],
      }),
    },
  );
  return { status: response.status, body: await response.json() };
}

describe("OrcaRouter provider identity", () => {
  test("is registered as its own named provider with both entry points", () => {
    expect(ORCAROUTER_PROVIDER.id).toBe("orcarouter");
    expect(ORCAROUTER_PROVIDER.displayName).toBe("OrcaRouter");
    expect(ORCAROUTER_PROVIDER.apiBaseUrl).toBe("https://api.orcarouter.ai");
    expect(ORCAROUTER_PROVIDER.authBaseUrl).toBe("https://www.orcarouter.ai");
    expect(ORCAROUTER_PROVIDER.authMethods.map((m) => m.id)).toEqual([
      "api-key",
      "pkce",
    ]);
    expect(ORCAROUTER_PROVIDER.authMethods.map((m) => m.label)).toEqual([
      "OrcaRouter – API",
      "OrcaRouter – Auth",
    ]);
  });

  test("requires an explicit opt-in and never an ambient environment key", () => {
    expect(isOrcaRouterEnabled({})).toBe(false);
    expect(isOrcaRouterEnabled({ INPUT_ORCAROUTER_PROVIDER: "true" })).toBe(
      true,
    );
    expect(isOrcaRouterEnabled({ INPUT_ORCAROUTER_AUTH: "true" })).toBe(true);
    // The action input is the opt-in...
    expect(isOrcaRouterEnabled({ INPUT_ORCAROUTER_API_KEY: "sk-orca-x" })).toBe(
      true,
    );
    // ...but an ambient variable must not hijack an unrelated run.
    expect(isOrcaRouterEnabled({ ORCAROUTER_API_KEY: "sk-orca-x" })).toBe(
      false,
    );
    expect(isOrcaRouterEnabled({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe(false);
  });

  test("reads the key from either the input name or the bare name", () => {
    expect(apiKeyFromEnv({ INPUT_ORCAROUTER_API_KEY: "sk-orca-a" })).toBe(
      "sk-orca-a",
    );
    expect(apiKeyFromEnv({ ORCAROUTER_API_KEY: "sk-orca-b" })).toBe(
      "sk-orca-b",
    );
    expect(apiKeyFromEnv({})).toBeUndefined();
  });

  test("a non-OrcaRouter run is left completely untouched", async () => {
    const resolution = await resolveOrcaRouter({ env: {}, store: store() });
    expect(resolution.enabled).toBe(false);
    expect(orcaRouterEnvironment(resolution)).toEqual({});
  });
});

describe("OrcaRouter provider resolution", () => {
  test("the API-key adapter produces a usable resolution with live model options", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted" }),
      store: store(),
      fetchImpl: undefined,
    });
    expect(resolution.errors).toEqual([]);
    expect(resolution.credential?.source).toBe("api-key");
    expect(resolution.selectedModel).toBe("deepseek/deepseek-v4-pro");
    expect(resolution.modelOptions.map((m) => m.id)).toEqual([
      "deepseek/deepseek-v4-pro",
      "anthropic/claude-opus-4.8",
    ]);
    // The rerank-only model is not a chat option.
    expect(resolution.modelOptions.map((m) => m.id)).not.toContain(
      "jina/jina-reranker-v3",
    );
  });

  test("the PKCE adapter produces the same downstream shape as the API-key adapter", async () => {
    await store().save({ key: "sk-orca-login", source: "pkce", scope: "api" });
    const viaPkce = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_AUTH: "true" }),
      store: store(),
    });
    // A separate cache so both paths perform their own live discovery.
    const viaKey = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-login" }),
      store: store(),
    });

    expect(viaPkce.errors).toEqual([]);
    expect(viaKey.errors).toEqual([]);
    // Identical provider wiring: same origins, same model options, same env.
    expect(viaPkce.modelOptions.map((m) => m.id)).toEqual(
      viaKey.modelOptions.map((m) => m.id),
    );
    expect(viaPkce.selectedModel!).toBe(viaKey.selectedModel!);
    const pkceBaseUrl = orcaRouterEnvironment(viaPkce).ANTHROPIC_BASE_URL!;
    const keyBaseUrl = orcaRouterEnvironment(viaKey).ANTHROPIC_BASE_URL!;
    expect(pkceBaseUrl).toBe(keyBaseUrl);
    // Only the provenance differs, and model discovery does not depend on it.
    expect(viaPkce.credential?.source).toBe("pkce");
    expect(viaKey.credential?.source).toBe("api-key");
  });

  test("both adapters reach the same inference endpoint with the same wire", async () => {
    await store().save({ key: "sk-orca-login", source: "pkce" });
    const viaPkce = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_AUTH: "true" }),
      store: store(),
    });
    const viaKey = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-login" }),
      store: store(),
    });

    const first = await callInference(
      viaPkce.credential!,
      viaPkce.selectedModel!,
    );
    const second = await callInference(
      viaKey.credential!,
      viaKey.selectedModel!,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((first.body as { content: unknown[] }).content).toBeDefined();
    expect((second.body as { content: unknown[] }).content).toBeDefined();

    const messageRequests = gateway.requests.filter(
      (r) => r.path === "/v1/messages",
    );
    expect(messageRequests.length).toBe(2);
    for (const request of messageRequests) {
      // The SDK appends /v1/messages to the base origin; a base URL containing
      // /v1 would have produced /v1/v1/messages here.
      expect(request.path).not.toContain("/v1/v1/");
      expect(request.path).toBe("/v1/messages");
    }
  });

  test("the inference base URL is the origin, so the SDK's own /v1/messages resolves", () => {
    const resolution = {
      enabled: true,
      origins: {
        authBaseUrl: "https://www.orcarouter.ai",
        apiBaseUrl: "https://api.orcarouter.ai",
        apiBaseV1Url: "https://api.orcarouter.ai/v1",
      },
      credential: {
        key: "sk-orca-wire",
        source: "api-key" as const,
        generation: 0,
      },
      modelOptions: [],
      selectedModel: "deepseek/deepseek-v4-pro",
      selectionCleared: false,
      degraded: false,
      errors: [],
      warnings: [],
    };
    const environment = orcaRouterEnvironment(resolution);
    // Anthropic-shaped clients append /v1/messages to this value.
    expect(environment.ANTHROPIC_BASE_URL).toBe("https://api.orcarouter.ai");
    expect(`${environment.ANTHROPIC_BASE_URL}/v1/messages`).toBe(
      "https://api.orcarouter.ai/v1/messages",
    );
    expect(`${environment.ANTHROPIC_BASE_URL}/v1/messages`).not.toContain(
      "/v1/v1/",
    );
  });

  test("auth origin and inference origin are used for their own purposes", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted" }),
      store: store(),
    });
    expect(resolution.origins.apiBaseV1Url).toBe(`${gateway.origin}/v1`);
    // Every request so far is a model-catalog read on the inference origin.
    expect(gateway.requests.every((r) => r.path.startsWith("/v1/models"))).toBe(
      true,
    );
    expect(
      gateway.requests.every((r) => r.auth === "Bearer sk-orca-pasted"),
    ).toBe(true);
  });

  test("the model catalog request carries the caller's key as a Bearer token", async () => {
    await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-catalog-key" }),
      store: store(),
    });
    const catalogRequest = gateway.requests.find((r) =>
      r.path.startsWith("/v1/models"),
    )!;
    expect(catalogRequest.auth).toBe("Bearer sk-orca-catalog-key");
    expect(catalogRequest.path).toBe("/v1/models?capability=chat");
  });
});

describe("OrcaRouter model selection and degradation", () => {
  test("clears a stale selection that the entry point no longer accepts", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({
        INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted",
        INPUT_ORCAROUTER_MODEL: "jina/jina-reranker-v3",
      }),
      store: store(),
    });
    expect(resolution.selectionCleared).toBe(true);
    expect(resolution.selectedModel).toBe("deepseek/deepseek-v4-pro");
    expect(resolution.warnings.join(" ")).toMatch(/was cleared/);
  });

  test("keeps a selection that is present and compatible", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({
        INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted",
        INPUT_ORCAROUTER_MODEL: "anthropic/claude-opus-4.8",
      }),
      store: store(),
    });
    expect(resolution.selectionCleared).toBe(false);
    expect(resolution.selectedModel).toBe("anthropic/claude-opus-4.8");
  });

  test("clears a text model once an image attachment is required", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({
        INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted",
        INPUT_ORCAROUTER_MODEL: "deepseek/deepseek-v4-pro",
      }),
      store: store(),
      inputModalities: ["image"],
    });
    expect(resolution.selectionCleared).toBe(true);
    expect(resolution.selectedModel).toBe("anthropic/claude-opus-4.8");
    expect(resolution.modelOptions.map((m) => m.id)).toEqual([
      "anthropic/claude-opus-4.8",
    ]);
  });

  test("degrades to the verified seed when discovery fails, never to free text", async () => {
    gateway.modelsStatus = 500;
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted" }),
      store: store(),
    });
    expect(resolution.degraded).toBe(true);
    expect(resolution.degradeReason).toContain("500");
    expect(resolution.warnings.join(" ")).toMatch(/degraded/);
    expect(resolution.modelOptions.length).toBeGreaterThan(0);
    expect(resolution.modelOptions.every((m) => m.verified === true)).toBe(
      true,
    );
    // The selector still has a usable default rather than an empty or free-form value.
    expect(resolution.selectedModel).toBe("openai/gpt-5.5");
  });

  test("caches the live catalog so repeated resolution does not refetch", async () => {
    const cache = new OrcaRouterCatalogCache();
    await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted" }),
      store: store(),
      cache,
    });
    const afterFirst = gateway.requests.length;
    await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "sk-orca-pasted" }),
      store: store(),
      cache,
    });
    expect(gateway.requests.length).toBe(afterFirst);
  });
});

describe("OrcaRouter provider error states", () => {
  test("no credential produces an actionable error from either entry point", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_PROVIDER: "true" }),
      store: store(),
    });
    expect(resolution.errors.length).toBeGreaterThan(0);
    expect(resolution.errors.join(" ")).toMatch(/orcarouter_api_key/);
    expect(resolution.errors.join(" ")).toMatch(/orcarouter_auth/);
  });

  test("a malformed pasted key is reported before any network call", async () => {
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: "definitely-not-a-key" }),
      store: store(),
    });
    expect(resolution.errors.join(" ")).toMatch(/sk-orca-/);
    expect(gateway.requests.length).toBe(0);
  });

  test("no error or log line contains the credential", async () => {
    const secret = "sk-orca-super-secret-value-1234567890";
    const logged: string[] = [];
    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_API_KEY: secret }),
      store: store(),
      log: (message) => logged.push(message),
    });
    expect(resolution.errors.join(" ")).not.toContain(secret);
    expect(resolution.warnings.join(" ")).not.toContain(secret);
    expect(logged.join(" ")).not.toContain(secret);
    // The masked form is what appears instead.
    expect(logged.join(" ")).toContain("sk-orca-s");
  });

  test("a revoked login surfaces as an outstanding reauthentication, not a retry", async () => {
    await store().save({ key: "sk-orca-login", source: "pkce" });
    const credential = (await store().read())!;
    await store().markNeedsReauth(credential.generation);

    const resolution = await resolveOrcaRouter({
      env: env({ INPUT_ORCAROUTER_AUTH: "true" }),
      store: store(),
    });
    expect(resolution.warnings.join(" ")).toMatch(/revoked/);
    expect(resolution.credential?.source).toBe("pkce");
  });
});
