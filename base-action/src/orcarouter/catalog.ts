import { ORCA_MODELS_PATH } from "./endpoints";

/**
 * OrcaRouter model catalog and capability filtering.
 *
 * `GET {apiBaseUrl}/v1/models` under the configured origin is the single source
 * of truth for model lists. Model IDs keep their `vendor/model` namespace
 * verbatim. A model is only offered for an entry point when the catalog's own
 * metadata proves the entry point is compatible — capability is never guessed
 * from a model's name.
 */

export type OrcaRouterCapability =
  | "chat"
  | "embedding"
  | "image"
  | "video"
  | "rerank";

/** Non-text modalities a caller can actually attach to an entry point. */
export type OrcaRouterInputModality = "image" | "audio" | "video";

export type OrcaRouterReasoning = {
  efforts: string[];
  default?: string;
};

export type OrcaRouterModel = {
  id: string;
  name?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  supportedEndpointTypes: string[];
  inputModalities?: string[];
  reasoning?: OrcaRouterReasoning;
  /** True only for entries that carry hand-verified metadata. */
  verified?: boolean;
};

export type OrcaRouterModelQuery = {
  capability: OrcaRouterCapability;
  /**
   * Non-text input modalities the entry point actually uploads. Every listed
   * modality must be explicitly declared by the model.
   */
  inputModalities?: OrcaRouterInputModality[];
};

/**
 * Endpoint types that can carry a text chat/agent request.
 */
const TEXT_ENDPOINT_TYPES = [
  "openai",
  "anthropic",
  "gemini",
  "openai-response",
] as const;

/**
 * Endpoint types that are dedicated to a non-text workload. Their presence
 * disqualifies a model from the text chat selector even when the model also
 * advertises a chat endpoint.
 */
const NON_TEXT_ENDPOINT_TYPES = [
  "image-generation",
  "openai-video",
  "jina-rerank",
  "embeddings",
] as const;

const EMBEDDING_ENDPOINT_TYPES = ["embeddings"] as const;
const IMAGE_ENDPOINT_TYPES = ["image-generation"] as const;
const VIDEO_ENDPOINT_TYPES = ["openai-video"] as const;
const RERANK_ENDPOINT_TYPES = ["jina-rerank"] as const;

const CAPABILITY_QUERY: Record<OrcaRouterCapability, string> = {
  chat: "chat",
  embedding: "embedding",
  image: "image",
  video: "video",
  rerank: "rerank",
};

/** Hard ceilings so a catalog response cannot consume unbounded memory. */
export const CATALOG_TIMEOUT_MS = 10_000;
export const CATALOG_MAX_BYTES = 1_000_000;
export const CATALOG_MAX_ITEMS = 500;
export const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

function intersects(values: string[], allowed: readonly string[]): boolean {
  return values.some((value) => allowed.includes(value));
}

function hasNonTextEndpoint(model: OrcaRouterModel): boolean {
  return intersects(model.supportedEndpointTypes, NON_TEXT_ENDPOINT_TYPES);
}

/**
 * Exact predicate for one entry point. A model is compatible only when the
 * catalog metadata positively proves it; missing metadata fails closed.
 */
export function modelSupportsQuery(
  model: OrcaRouterModel,
  query: OrcaRouterModelQuery,
): boolean {
  const endpoints = model.supportedEndpointTypes;
  switch (query.capability) {
    case "chat": {
      if (hasNonTextEndpoint(model)) return false;
      if (!intersects(endpoints, TEXT_ENDPOINT_TYPES)) return false;
      // Multimodal entry points must be declared, never inferred.
      for (const modality of query.inputModalities ?? []) {
        if (!model.inputModalities?.includes(modality)) return false;
      }
      return true;
    }
    case "embedding":
      return intersects(endpoints, EMBEDDING_ENDPOINT_TYPES);
    case "image":
      return intersects(endpoints, IMAGE_ENDPOINT_TYPES);
    case "video":
      return intersects(endpoints, VIDEO_ENDPOINT_TYPES);
    case "rerank":
      return intersects(endpoints, RERANK_ENDPOINT_TYPES);
    default:
      return false;
  }
}

export function filterOrcaRouterModels(
  models: OrcaRouterModel[],
  query: OrcaRouterModelQuery,
): OrcaRouterModel[] {
  return models.filter((model) => modelSupportsQuery(model, query));
}

/**
 * Drop a previously selected model that the current capability query no longer
 * accepts, so a selector can never silently keep an incompatible value.
 */
export function reconcileSelectedModel(
  selected: string | undefined,
  options: OrcaRouterModel[],
): { selected: string | undefined; cleared: boolean } {
  if (!selected) return { selected: undefined, cleared: false };
  const stillValid = options.some((model) => model.id === selected);
  return stillValid
    ? { selected, cleared: false }
    : { selected: undefined, cleared: true };
}

/**
 * Bounded, hand-verified cold-start catalog used only when live discovery is
 * unavailable. It is deliberately small: live discovery is authoritative, and
 * this exists so a fresh installation is not left with an empty selector.
 *
 * Entries are marked `verified` so callers can label them as fallback data. The
 * list is never merged into a successful live result.
 */
export const ORCAROUTER_VERIFIED_SEED: readonly OrcaRouterModel[] = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    contextLength: 400_000,
    supportedEndpointTypes: ["openai", "anthropic", "openai-response"],
    inputModalities: ["text"],
    reasoning: {
      efforts: ["low", "medium", "high", "xhigh"],
      default: "medium",
    },
    verified: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    contextLength: 200_000,
    supportedEndpointTypes: ["anthropic", "openai"],
    inputModalities: ["text", "image"],
    verified: true,
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    contextLength: 1_000_000,
    supportedEndpointTypes: ["gemini", "openai", "openai-response"],
    inputModalities: ["text", "image", "audio", "video"],
    verified: true,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextLength: 1_048_576,
    supportedEndpointTypes: ["openai", "openai-response"],
    inputModalities: ["text"],
    verified: true,
  },
  {
    id: "orcarouter/auto",
    name: "OrcaRouter Auto",
    supportedEndpointTypes: [
      "openai",
      "anthropic",
      "gemini",
      "openai-response",
    ],
    inputModalities: ["text"],
    verified: true,
  },
];

/**
 * Accepted item shape. Anything else in the payload is ignored rather than
 * trusted, so an unexpected record cannot advertise a route this client cannot
 * speak.
 */
function parseModel(raw: unknown): OrcaRouterModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || !id.trim()) return null;

  const endpoints = Array.isArray(record.supported_endpoint_types)
    ? record.supported_endpoint_types.filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  const architecture = record.architecture as
    | Record<string, unknown>
    | undefined;
  const rawModalities = architecture?.input_modalities;
  const inputModalities = Array.isArray(rawModalities)
    ? rawModalities.filter((v): v is string => typeof v === "string")
    : undefined;

  const rawReasoning = record.reasoning as Record<string, unknown> | undefined;
  const rawEfforts = rawReasoning?.supported_efforts;
  const reasoning = Array.isArray(rawEfforts)
    ? {
        efforts: rawEfforts.filter((v): v is string => typeof v === "string"),
        default:
          typeof rawReasoning?.default_effort === "string"
            ? rawReasoning.default_effort
            : undefined,
      }
    : undefined;

  const contextLength =
    typeof record.context_length === "number"
      ? record.context_length
      : undefined;
  const maxCompletionTokens =
    typeof record.max_completion_tokens === "number"
      ? record.max_completion_tokens
      : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;

  return {
    id,
    name,
    contextLength,
    maxCompletionTokens,
    supportedEndpointTypes: endpoints,
    inputModalities,
    reasoning,
  };
}

export function parseOrcaRouterCatalog(payload: unknown): OrcaRouterModel[] {
  const data =
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray(payload)
        ? payload
        : [];
  const models: OrcaRouterModel[] = [];
  for (const raw of data.slice(0, CATALOG_MAX_ITEMS)) {
    const model = parseModel(raw);
    if (model) models.push(model);
  }
  return models;
}

export type OrcaRouterCatalogResult = {
  models: OrcaRouterModel[];
  /**
   * `live` results are authoritative. `seed` means discovery failed and the
   * verified fallback is in use, which callers must surface as degraded.
   */
  source: "live" | "seed";
  degraded: boolean;
  reason?: string;
};

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type CatalogOptions = {
  apiBaseV1Url: string;
  apiKey: string;
  capability: OrcaRouterCapability;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: () => number;
};

/** Authoritative catalog URL for a capability, under the configured origin. */
export function orcaRouterCatalogUrl(
  apiBaseV1Url: string,
  capability: OrcaRouterCapability,
): string {
  const base = apiBaseV1Url.replace(/\/+$/, "");
  return `${base}${ORCA_MODELS_PATH}?capability=${CAPABILITY_QUERY[capability]}`;
}

/**
 * Fetch and bound the live catalog. Never throws: a failure is reported as the
 * verified seed plus a machine-readable reason, so a catalog outage degrades a
 * provider entry instead of making it unusable.
 */
export async function fetchOrcaRouterCatalog(
  options: CatalogOptions,
): Promise<OrcaRouterCatalogResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? CATALOG_TIMEOUT_MS,
  );
  const fetchImpl: FetchLike =
    options.fetchImpl ??
    ((input, init) => fetch(input, init) as ReturnType<FetchLike>);

  try {
    const response = await fetchImpl(
      orcaRouterCatalogUrl(options.apiBaseV1Url, options.capability),
      {
        headers: { Authorization: `Bearer ${options.apiKey}` },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return seedResult(
        `catalog request failed with status ${response.status}`,
      );
    }
    const body = await response.text();
    if (body.length > CATALOG_MAX_BYTES) {
      return seedResult("catalog response exceeded the accepted size");
    }
    const models = parseOrcaRouterCatalog(JSON.parse(body) as unknown);
    if (models.length === 0) {
      return seedResult("catalog returned no usable model records");
    }
    // Live discovery is authoritative: the seed is never merged in.
    return { models, source: "live", degraded: false };
  } catch (error) {
    return seedResult(
      error instanceof Error && error.name === "AbortError"
        ? "catalog request timed out"
        : "catalog request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function seedResult(reason: string): OrcaRouterCatalogResult {
  return {
    models: [...ORCAROUTER_VERIFIED_SEED],
    source: "seed",
    degraded: true,
    reason,
  };
}

type CacheEntry = {
  models: OrcaRouterModel[];
  fetchedAt: number;
};

/**
 * Small in-process cache. Not persisted: a stale persisted catalog could restore
 * a model ID the workspace can no longer call.
 */
export class OrcaRouterCatalogCache {
  private entries = new Map<OrcaRouterCapability, CacheEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(capability: OrcaRouterCapability): OrcaRouterModel[] | undefined {
    const entry = this.entries.get(capability);
    if (!entry) return undefined;
    if (this.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
      this.entries.delete(capability);
      return undefined;
    }
    return entry.models;
  }

  set(capability: OrcaRouterCapability, models: OrcaRouterModel[]): void {
    this.entries.set(capability, { models, fetchedAt: this.now() });
  }

  clear(): void {
    this.entries.clear();
  }
}
