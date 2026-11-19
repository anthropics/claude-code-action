import { describe, expect, test } from "bun:test";
import {
  CATALOG_MAX_ITEMS,
  OrcaRouterCatalogCache,
  ORCAROUTER_VERIFIED_SEED,
  filterOrcaRouterModels,
  modelSupportsQuery,
  orcaRouterCatalogUrl,
  parseOrcaRouterCatalog,
  reconcileSelectedModel,
} from "../../src/orcarouter/catalog";

/**
 * Fixture payloads shaped like a real OrcaRouter `/v1/models` response, covering
 * every capability the integration distinguishes.
 */
const CATALOG_FIXTURE = {
  data: [
    // text-only chat, OpenAI wire
    {
      id: "deepseek/deepseek-v4-pro",
      context_length: 1048576,
      supported_endpoint_types: ["openai", "openai-response"],
      architecture: { input_modalities: ["text"] },
    },
    // chat + image input, Anthropic wire
    {
      id: "anthropic/claude-opus-4.8",
      context_length: 200000,
      supported_endpoint_types: ["anthropic", "openai"],
      architecture: { input_modalities: ["text", "image"] },
    },
    // chat + audio + video input, gemini wire
    {
      id: "google/gemini-3.5-flash",
      context_length: 1000000,
      supported_endpoint_types: ["gemini", "openai", "openai-response"],
      architecture: { input_modalities: ["text", "image", "audio", "video"] },
    },
    // chat with reasoning metadata
    {
      id: "openai/gpt-5.5",
      context_length: 400000,
      supported_endpoint_types: ["openai", "anthropic", "openai-response"],
      architecture: { input_modalities: ["text"] },
      reasoning: {
        supported_efforts: ["low", "medium", "high", "xhigh"],
        default_effort: "medium",
      },
    },
    // router alias with no architecture metadata at all
    {
      id: "orcarouter/auto",
      supported_endpoint_types: [
        "openai",
        "anthropic",
        "gemini",
        "openai-response",
      ],
    },
    // non-text dedicated endpoints
    {
      id: "openai/gpt-image-1",
      supported_endpoint_types: ["image-generation"],
    },
    {
      id: "google/veo-3",
      supported_endpoint_types: ["openai-video"],
    },
    {
      id: "jina/jina-reranker-v3",
      supported_endpoint_types: ["jina-rerank"],
    },
    {
      id: "openai/text-embedding-4",
      supported_endpoint_types: ["embeddings"],
    },
    // a chat model that also advertises an image route must not reach the text selector
    {
      id: "recraft/recraft-v4",
      supported_endpoint_types: ["openai", "image-generation"],
      architecture: { input_modalities: ["text"] },
    },
    // malformed records that must be ignored
    { id: "" },
    { not_a_model: true },
    "a string",
    null,
  ],
};

describe("OrcaRouter catalog parsing", () => {
  test("preserves the vendor/model namespace verbatim", () => {
    const models = parseOrcaRouterCatalog(CATALOG_FIXTURE);
    const ids = models.map((m) => m.id);
    expect(ids).toContain("google/gemini-3.5-flash");
    expect(ids).toContain("orcarouter/auto");
    expect(ids).toContain("deepseek/deepseek-v4-pro");
    for (const id of ids)
      expect(id.split("/").length).toBeGreaterThanOrEqual(2);
  });

  test("reads bounded, accepted metadata and ignores unknown fields", () => {
    const models = parseOrcaRouterCatalog(CATALOG_FIXTURE);
    const gpt = models.find((m) => m.id === "openai/gpt-5.5")!;
    expect(gpt.contextLength).toBe(400000);
    expect(gpt.supportedEndpointTypes).toEqual([
      "openai",
      "anthropic",
      "openai-response",
    ]);
    expect(gpt.inputModalities).toEqual(["text"]);
    expect(gpt.reasoning?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(gpt.reasoning?.default).toBe("medium");
  });

  test("drops malformed records rather than trusting them", () => {
    const models = parseOrcaRouterCatalog(CATALOG_FIXTURE);
    expect(
      models.every((m) => typeof m.id === "string" && m.id.length > 0),
    ).toBe(true);
    expect(models.some((m) => m.id === "a string")).toBe(false);
  });

  test("bounds the accepted item count", () => {
    const huge = {
      data: Array.from({ length: CATALOG_MAX_ITEMS + 250 }, (_, i) => ({
        id: `vendor/model-${i}`,
        supported_endpoint_types: ["openai"],
      })),
    };
    expect(parseOrcaRouterCatalog(huge).length).toBe(CATALOG_MAX_ITEMS);
  });

  test("accepts a bare array as well as the data envelope", () => {
    expect(
      parseOrcaRouterCatalog([
        { id: "a/b", supported_endpoint_types: ["openai"] },
      ]).length,
    ).toBe(1);
    expect(parseOrcaRouterCatalog({ data: [] }).length).toBe(0);
    expect(parseOrcaRouterCatalog({ nonsense: true }).length).toBe(0);
  });

  test("the catalog URL follows the configured inference origin", () => {
    expect(orcaRouterCatalogUrl("https://api.orcarouter.ai/v1", "chat")).toBe(
      "https://api.orcarouter.ai/v1/models?capability=chat",
    );
    expect(orcaRouterCatalogUrl("https://self.example/v1/", "embedding")).toBe(
      "https://self.example/v1/models?capability=embedding",
    );
  });
});

describe("OrcaRouter capability filtering", () => {
  const models = parseOrcaRouterCatalog(CATALOG_FIXTURE);

  test("text chat keeps only chat-capable, text-appropriate models", () => {
    const chat = filterOrcaRouterModels(models, { capability: "chat" }).map(
      (m) => m.id,
    );
    expect(chat).toContain("deepseek/deepseek-v4-pro");
    expect(chat).toContain("anthropic/claude-opus-4.8");
    expect(chat).toContain("openai/gpt-5.5");
    expect(chat).toContain("orcarouter/auto");
    // Non-text dedicated routes are excluded.
    expect(chat).not.toContain("openai/gpt-image-1");
    expect(chat).not.toContain("google/veo-3");
    expect(chat).not.toContain("jina/jina-reranker-v3");
    expect(chat).not.toContain("openai/text-embedding-4");
    // A model carrying an image-generation route is not a text chat model.
    expect(chat).not.toContain("recraft/recraft-v4");
  });

  test("multimodal entry points fail closed on undeclared input modalities", () => {
    const vision = filterOrcaRouterModels(models, {
      capability: "chat",
      inputModalities: ["image"],
    }).map((m) => m.id);
    // Only models that explicitly declare image input survive.
    expect(vision).toEqual(
      expect.arrayContaining([
        "anthropic/claude-opus-4.8",
        "google/gemini-3.5-flash",
      ]),
    );
    expect(vision).not.toContain("openai/gpt-5.5");
    expect(vision).not.toContain("deepseek/deepseek-v4-pro");
    // "orcarouter/auto" declares no modalities, so it must not be offered.
    expect(vision).not.toContain("orcarouter/auto");
  });

  test("audio and video entry points require the exact declared modality", () => {
    const audio = filterOrcaRouterModels(models, {
      capability: "chat",
      inputModalities: ["audio"],
    }).map((m) => m.id);
    expect(audio).toEqual(["google/gemini-3.5-flash"]);

    const video = filterOrcaRouterModels(models, {
      capability: "chat",
      inputModalities: ["video"],
    }).map((m) => m.id);
    expect(video).toEqual(["google/gemini-3.5-flash"]);
  });

  test("each non-chat capability uses its own endpoint type", () => {
    expect(
      filterOrcaRouterModels(models, { capability: "embedding" }).map(
        (m) => m.id,
      ),
    ).toEqual(["openai/text-embedding-4"]);
    expect(
      filterOrcaRouterModels(models, { capability: "image" }).map((m) => m.id),
    ).toEqual(["openai/gpt-image-1", "recraft/recraft-v4"]);
    expect(
      filterOrcaRouterModels(models, { capability: "video" }).map((m) => m.id),
    ).toEqual(["google/veo-3"]);
    expect(
      filterOrcaRouterModels(models, { capability: "rerank" }).map((m) => m.id),
    ).toEqual(["jina/jina-reranker-v3"]);
  });

  test("capability is never inferred from a model name", () => {
    const byName = parseOrcaRouterCatalog({
      data: [
        {
          id: "openai/dall-e-image-embedding-vision",
          supported_endpoint_types: ["openai"],
          architecture: { input_modalities: ["text"] },
        },
      ],
    });
    // The name is full of image/embedding/vision words; the metadata says chat.
    expect(
      filterOrcaRouterModels(byName, { capability: "chat" }).map((m) => m.id),
    ).toEqual(["openai/dall-e-image-embedding-vision"]);
    expect(filterOrcaRouterModels(byName, { capability: "image" })).toEqual([]);
    expect(filterOrcaRouterModels(byName, { capability: "embedding" })).toEqual(
      [],
    );
    // ...and it still fails closed for a modality it does not declare.
    expect(
      filterOrcaRouterModels(byName, {
        capability: "chat",
        inputModalities: ["image"],
      }),
    ).toEqual([]);
  });

  test("a model with no endpoint types is offered nowhere", () => {
    const empty = parseOrcaRouterCatalog({ data: [{ id: "vendor/mystery" }] });
    for (const capability of [
      "chat",
      "embedding",
      "image",
      "video",
      "rerank",
    ] as const) {
      expect(filterOrcaRouterModels(empty, { capability })).toEqual([]);
    }
    expect(modelSupportsQuery(empty[0]!, { capability: "chat" })).toBe(false);
  });
});

describe("OrcaRouter selected-model reconciliation", () => {
  const models = parseOrcaRouterCatalog(CATALOG_FIXTURE);

  test("clears a selection that the current entry point no longer accepts", () => {
    const textOnly = filterOrcaRouterModels(models, { capability: "chat" });
    const cleared = reconcileSelectedModel("openai/gpt-image-1", textOnly);
    expect(cleared.cleared).toBe(true);
    expect(cleared.selected).toBeUndefined();
  });

  test("keeps a selection that is still compatible", () => {
    const textOnly = filterOrcaRouterModels(models, { capability: "chat" });
    const kept = reconcileSelectedModel("openai/gpt-5.5", textOnly);
    expect(kept.cleared).toBe(false);
    expect(kept.selected).toBe("openai/gpt-5.5");
  });

  test("clears a text model once an image attachment is required", () => {
    const withImage = filterOrcaRouterModels(models, {
      capability: "chat",
      inputModalities: ["image"],
    });
    expect(reconcileSelectedModel("openai/gpt-5.5", withImage).cleared).toBe(
      true,
    );
    expect(
      reconcileSelectedModel("google/gemini-3.5-flash", withImage).cleared,
    ).toBe(false);
  });

  test("an unset selection is not reported as cleared", () => {
    expect(reconcileSelectedModel(undefined, models)).toEqual({
      selected: undefined,
      cleared: false,
    });
  });
});

describe("OrcaRouter verified fallback catalog", () => {
  test("live discovery is authoritative and the seed is never merged in", async () => {
    const { fetchOrcaRouterCatalog } = await import(
      "../../src/orcarouter/catalog"
    );
    const result = await fetchOrcaRouterCatalog({
      apiBaseV1Url: "https://api.example/v1",
      apiKey: "sk-orca-test",
      capability: "chat",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(CATALOG_FIXTURE),
      }),
    });
    expect(result.source).toBe("live");
    expect(result.degraded).toBe(false);
    const ids = result.models.map((m) => m.id);
    expect(ids).not.toContain("orcarouter/auto-verified");
    for (const seed of ORCAROUTER_VERIFIED_SEED) {
      // Every seed entry also appears live here only where the fixture has it.
      if (seed.id === "orcarouter/auto") continue;
      expect(ids).toContain(seed.id);
    }
    expect(ids).toContain("google/veo-3");
  });

  test("falls back to the verified seed, clearly marked as degraded", async () => {
    const { fetchOrcaRouterCatalog } = await import(
      "../../src/orcarouter/catalog"
    );
    const result = await fetchOrcaRouterCatalog({
      apiBaseV1Url: "https://api.example/v1",
      apiKey: "sk-orca-test",
      capability: "chat",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(result.source).toBe("seed");
    expect(result.degraded).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.models.map((m) => m.id)).toEqual(
      ORCAROUTER_VERIFIED_SEED.map((m) => m.id),
    );
    expect(result.models.every((m) => m.verified === true)).toBe(true);
  });

  test("a non-2xx or oversized response also degrades to the seed", async () => {
    const { fetchOrcaRouterCatalog } = await import(
      "../../src/orcarouter/catalog"
    );
    const unauthorized = await fetchOrcaRouterCatalog({
      apiBaseV1Url: "https://api.example/v1",
      apiKey: "sk-orca-test",
      capability: "chat",
      fetchImpl: async () => ({ ok: false, status: 401, text: async () => "" }),
    });
    expect(unauthorized.source).toBe("seed");
    expect(unauthorized.reason).toContain("401");

    const oversized = await fetchOrcaRouterCatalog({
      apiBaseV1Url: "https://api.example/v1",
      apiKey: "sk-orca-test",
      capability: "chat",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "x".repeat(1_000_001),
      }),
    });
    expect(oversized.source).toBe("seed");
    expect(oversized.reason).toContain("size");
  });

  test("an empty live catalog degrades rather than emptying the selector", async () => {
    const { fetchOrcaRouterCatalog } = await import(
      "../../src/orcarouter/catalog"
    );
    const result = await fetchOrcaRouterCatalog({
      apiBaseV1Url: "https://api.example/v1",
      apiKey: "sk-orca-test",
      capability: "chat",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => '{"data":[]}',
      }),
    });
    expect(result.source).toBe("seed");
    expect(result.models.length).toBeGreaterThan(0);
  });

  test("the seed preserves verified metadata, including the reasoning ladder", () => {
    const gpt = ORCAROUTER_VERIFIED_SEED.find(
      (m) => m.id === "openai/gpt-5.5",
    )!;
    expect(gpt.contextLength).toBe(400_000);
    expect(gpt.inputModalities).toEqual(["text"]);
    expect(gpt.reasoning?.efforts).toEqual(["low", "medium", "high", "xhigh"]);
    expect(gpt.reasoning?.default).toBe("medium");

    const gemini = ORCAROUTER_VERIFIED_SEED.find(
      (m) => m.id === "google/gemini-3.5-flash",
    )!;
    expect(gemini.inputModalities).toEqual(
      expect.arrayContaining(["text", "image", "audio", "video"]),
    );

    // Every seed entry must be usable by the text chat selector.
    for (const model of ORCAROUTER_VERIFIED_SEED) {
      expect(modelSupportsQuery(model, { capability: "chat" })).toBe(true);
    }
  });

  test("the seed never regresses the text dropdown to a single unusable entry", () => {
    const chat = filterOrcaRouterModels([...ORCAROUTER_VERIFIED_SEED], {
      capability: "chat",
    });
    expect(chat.length).toBe(ORCAROUTER_VERIFIED_SEED.length);
    // An image attachment narrows it but does not empty it.
    const vision = filterOrcaRouterModels([...ORCAROUTER_VERIFIED_SEED], {
      capability: "chat",
      inputModalities: ["image"],
    });
    expect(vision.length).toBeGreaterThan(0);
    expect(vision.map((m) => m.id)).not.toContain("openai/gpt-5.5");
  });
});

describe("OrcaRouter catalog cache", () => {
  test("serves a cached result within the TTL and expires it after", () => {
    let now = 1_000;
    const cache = new OrcaRouterCatalogCache(() => now);
    const models = filterOrcaRouterModels(
      parseOrcaRouterCatalog(CATALOG_FIXTURE),
      {
        capability: "chat",
      },
    );
    expect(cache.get("chat")).toBeUndefined();
    cache.set("chat", models);
    expect(cache.get("chat")).toEqual(models);
    now += 60_000;
    expect(cache.get("chat")).toEqual(models);
    now += 5 * 60 * 1000;
    expect(cache.get("chat")).toBeUndefined();
  });

  test("keys the cache by capability", () => {
    const cache = new OrcaRouterCatalogCache();
    cache.set("chat", [{ id: "a/b", supportedEndpointTypes: ["openai"] }]);
    expect(cache.get("embedding")).toBeUndefined();
    expect(cache.get("chat")).toHaveLength(1);
  });
});
