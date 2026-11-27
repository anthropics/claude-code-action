import { describe, expect, test } from "bun:test";
import {
  filterOrcaRouterModels,
  parseOrcaRouterCatalog,
} from "../../src/orcarouter/catalog";
import { ORCAROUTER_VERIFIED_SEED } from "../../src/orcarouter/catalog";
import {
  ORCAROUTER_PROVIDER,
  orcaRouterEnvironment,
  resolveOrcaRouter,
} from "../../src/orcarouter/provider";
import { maskSecret } from "../../src/orcarouter/endpoints";

/**
 * Live checks. These are the only tests that touch the network, and they run
 * only when ORCAROUTER_API_KEY is present, so the offline suite is unaffected.
 *
 * Everything here goes through the provider code path that was just added:
 * `resolveOrcaRouter` performs live model discovery, and `orcaRouterEnvironment`
 * is the same environment the wired provider hands to the Claude CLI.
 */
const apiKey = process.env.ORCAROUTER_API_KEY;
const live = test.skipIf(!apiKey);

/**
 * A model verified reachable by this workspace's key. The seed carries it, and
 * the live catalog is asserted to still offer it before it is called, so a
 * catalog change fails the test loudly instead of silently calling nothing.
 */
const LIVE_MODEL = "deepseek/deepseek-v4-pro";

describe("OrcaRouter live provider path", () => {
  live("discovers the real catalog and filters it by capability", async () => {
    const resolution = await resolveOrcaRouter({
      env: { INPUT_ORCAROUTER_API_KEY: apiKey! },
      log: () => {},
    });

    expect(resolution.errors).toEqual([]);
    expect(resolution.credential?.source).toBe("api-key");
    expect(resolution.origins.apiBaseV1Url).toBe(
      "https://api.orcarouter.ai/v1",
    );
    expect(resolution.origins.authBaseUrl).toBe("https://www.orcarouter.ai");

    // Live discovery must be authoritative here: the seed is fallback-only.
    expect(resolution.degraded).toBe(false);
    expect(resolution.modelOptions.length).toBeGreaterThan(0);

    // Every text option is a genuine text chat model.
    for (const model of resolution.modelOptions) {
      const textEndpoints = model.supportedEndpointTypes.filter((type) =>
        ["openai", "anthropic", "gemini", "openai-response"].includes(type),
      );
      expect(textEndpoints.length).toBeGreaterThan(0);
      expect(model.supportedEndpointTypes).not.toContain("image-generation");
      expect(model.supportedEndpointTypes).not.toContain("openai-video");
      expect(model.supportedEndpointTypes).not.toContain("jina-rerank");
    }

    console.log(
      `Live catalog: ${resolution.modelOptions.length} text chat model(s); credential ${maskSecret(apiKey)}`,
    );
  });

  live(
    "the multimodal dropdown is a strict, declared subset of the text dropdown",
    async () => {
      const base = { apiBaseV1Url: "https://api.orcarouter.ai/v1" };
      const fetcher = async (url: string) => {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return {
          ok: response.ok,
          status: response.status,
          text: () => response.text(),
        };
      };
      const { fetchOrcaRouterCatalog } = await import(
        "../../src/orcarouter/catalog"
      );
      const liveCatalog = await fetchOrcaRouterCatalog({
        ...base,
        apiKey: apiKey!,
        capability: "chat",
        fetchImpl: fetcher,
      });
      expect(liveCatalog.source).toBe("live");

      const text = filterOrcaRouterModels(liveCatalog.models, {
        capability: "chat",
      });
      const multimodal = filterOrcaRouterModels(liveCatalog.models, {
        capability: "chat",
        inputModalities: ["image"],
      });

      // The vision dropdown must never be broader than the text one.
      for (const model of multimodal) {
        expect(text.map((m) => m.id)).toContain(model.id);
        // And every entry must explicitly declare image input.
        expect(model.inputModalities).toContain("image");
      }
      console.log(
        `Live catalog: ${text.length} text model(s), ${multimodal.length} image-input model(s)`,
      );
    },
  );

  live(
    "makes a real inference call through the provider's own environment",
    async () => {
      const resolution = await resolveOrcaRouter({
        env: { INPUT_ORCAROUTER_API_KEY: apiKey! },
        log: () => {},
      });
      expect(resolution.errors).toEqual([]);

      // The model must genuinely be offered by the selector before it is called.
      expect(resolution.modelOptions.map((m) => m.id)).toContain(LIVE_MODEL);

      if (resolution.selectedModel !== LIVE_MODEL) {
        // Re-resolve with the verified model selected, the way a user would.
        const pinned = await resolveOrcaRouter({
          env: {
            INPUT_ORCAROUTER_API_KEY: apiKey!,
            INPUT_ORCAROUTER_MODEL: LIVE_MODEL,
          },
          log: () => {},
        });
        expect(pinned.selectionCleared).toBe(false);
        expect(pinned.selectedModel).toBe(LIVE_MODEL);
        Object.assign(resolution, pinned);
      }

      const environment = orcaRouterEnvironment(resolution);
      expect(environment.ANTHROPIC_BASE_URL).toBe("https://api.orcarouter.ai");
      expect(environment.ANTHROPIC_AUTH_TOKEN).toBe(apiKey!);

      // This is the request shape the wired provider produces for the Claude CLI:
      // the Anthropic client appends /v1/messages to the base origin.
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
            max_tokens: 16,
            messages: [
              { role: "user", content: "Reply with the single word: ok" },
            ],
          }),
        },
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number };
      };
      expect(Array.isArray(payload.content)).toBe(true);
      expect(payload.usage?.input_tokens ?? 0).toBeGreaterThan(0);
      console.log(
        `Live inference ok via ${environment.ANTHROPIC_MODEL} against ${environment.ANTHROPIC_BASE_URL}/v1/messages`,
      );
    },
  );

  live(
    "every advertised seed model is still a valid text chat selection",
    () => {
      const catalog = parseOrcaRouterCatalog({
        data: ORCAROUTER_VERIFIED_SEED.map((model) => ({
          id: model.id,
          context_length: model.contextLength,
          supported_endpoint_types: model.supportedEndpointTypes,
          architecture: { input_modalities: model.inputModalities },
        })),
      });
      expect(
        filterOrcaRouterModels(catalog, { capability: "chat" }).length,
      ).toBe(ORCAROUTER_VERIFIED_SEED.length);
      expect(ORCAROUTER_PROVIDER.apiBaseUrl).toBe("https://api.orcarouter.ai");
    },
  );
});
