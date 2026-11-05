import {
  ORCA_DEFAULT_API_BASE_URL,
  ORCA_DEFAULT_AUTH_BASE_URL,
  ORCA_KEY_DASHBOARD_URL,
  ORCA_SCOPE,
  maskSecret,
  resolveOrcaRouterOrigins,
  type OrcaRouterOrigins,
} from "./endpoints";
import {
  apiKeyCredentialSource,
  inspectStoredCredential,
  pkceCredentialSource,
  resolveOrcaRouterCredential,
  type OrcaRouterCredential,
  type OrcaRouterCredentialStore,
} from "./credentials";
import {
  OrcaRouterCatalogCache,
  fetchOrcaRouterCatalog,
  filterOrcaRouterModels,
  reconcileSelectedModel,
  type FetchLike,
  type OrcaRouterModel,
} from "./catalog";

/**
 * OrcaRouter as a first-class, named provider.
 *
 * OrcaRouter is an OpenAI-compatible AI gateway that routes many providers
 * behind one endpoint. It is surfaced by its own name and its own configuration
 * — never as a bare "custom base URL" escape hatch.
 *
 * The provider consumes the credential seam in `credentials.ts`, so the API-key
 * adapter and the PKCE adapter are interchangeable here and neither is
 * re-implemented for any entry point.
 */
export const ORCAROUTER_PROVIDER = {
  id: "orcarouter",
  displayName: "OrcaRouter",
  authBaseUrl: ORCA_DEFAULT_AUTH_BASE_URL,
  apiBaseUrl: ORCA_DEFAULT_API_BASE_URL,
  apiKeyEnv: "ORCAROUTER_API_KEY",
  scope: ORCA_SCOPE,
  keyDashboardUrl: ORCA_KEY_DASHBOARD_URL,
  /**
   * The two explicit, independently usable entry points. Kept as distinct
   * choices so logout, support, and reauthentication stay unambiguous.
   */
  authMethods: [
    { id: "api-key", label: "OrcaRouter – API" },
    { id: "pkce", label: "OrcaRouter – Auth" },
  ],
} as const;

export type OrcaRouterResolution = {
  /** True when this run is routed through OrcaRouter. */
  enabled: boolean;
  origins: OrcaRouterOrigins;
  credential?: OrcaRouterCredential;
  /** Model options the selector is allowed to offer, already capability-filtered. */
  modelOptions: OrcaRouterModel[];
  /** The model actually selected for this run. */
  selectedModel?: string;
  /** True when a persisted selection was dropped because it is no longer valid. */
  selectionCleared: boolean;
  /** True when the live catalog was unavailable and the verified seed is in use. */
  degraded: boolean;
  degradeReason?: string;
  errors: string[];
  warnings: string[];
};

export type ResolveOrcaRouterOptions = {
  env?: Record<string, string | undefined>;
  store?: OrcaRouterCredentialStore;
  fetchImpl?: FetchLike;
  cache?: OrcaRouterCatalogCache;
  /** Non-text modalities this entry point will actually upload. */
  inputModalities?: ("image" | "audio" | "video")[];
  log?: (message: string) => void;
};

function readEnv(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * The credential the environment already provides, if any. `INPUT_*` names are
 * what the composite action sets; the bare name is accepted so the same code
 * path works for a direct CLI invocation.
 */
export function apiKeyFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  return (
    readEnv(env, "INPUT_ORCAROUTER_API_KEY") ??
    readEnv(env, "ORCAROUTER_API_KEY")
  );
}

/**
 * Whether this run is routed through OrcaRouter.
 *
 * Activation is an explicit opt-in. Crucially, an ambient `ORCAROUTER_API_KEY`
 * is treated only as a *credential source*, never as a switch: a user who
 * happens to export that variable for another tool must not have their action
 * silently routed through OrcaRouter. The action input
 * (`INPUT_ORCAROUTER_API_KEY`) does count, because setting the OrcaRouter input
 * is itself the opt-in.
 */
export function isOrcaRouterEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const truthy = (name: string) =>
    ["true", "1"].includes((readEnv(env, name) ?? "").toLowerCase());
  if (truthy("INPUT_ORCAROUTER_PROVIDER") || truthy("ORCAROUTER_PROVIDER")) {
    return true;
  }
  if (truthy("INPUT_ORCAROUTER_AUTH") || truthy("ORCAROUTER_AUTH")) return true;
  return readEnv(env, "INPUT_ORCAROUTER_API_KEY") !== undefined;
}

/**
 * Resolve everything a run needs to talk to OrcaRouter: credential, origins,
 * capability-filtered model options, and the model selection.
 *
 * Never throws for a recoverable condition; outcomes are reported so the caller
 * can fail with an actionable message.
 */
export async function resolveOrcaRouter(
  options: ResolveOrcaRouterOptions = {},
): Promise<OrcaRouterResolution> {
  const env = options.env ?? process.env;
  const log = options.log ?? (() => {});
  const errors: string[] = [];
  const warnings: string[] = [];
  const origins = resolveOrcaRouterOrigins(env);

  const enabled = isOrcaRouterEnabled(env);
  const base: OrcaRouterResolution = {
    enabled,
    origins,
    modelOptions: [],
    selectionCleared: false,
    degraded: false,
    errors,
    warnings,
  };
  if (!enabled) return base;

  const apiKey = apiKeyFromEnv(env);
  if (apiKey && inspectStoredCredential(apiKey) === "corrupted") {
    errors.push(
      `The supplied OrcaRouter API key does not have the expected sk-orca- prefix. Check the orcarouter_api_key value, or use the OrcaRouter – Auth entry point (orcarouter_auth: true) instead.`,
    );
    return base;
  }

  const sources = [];
  if (apiKey) sources.push(apiKeyCredentialSource(apiKey));
  if (options.store) sources.push(pkceCredentialSource(options.store));

  const credential = await resolveOrcaRouterCredential(sources);
  if (!credential) {
    errors.push(
      `OrcaRouter is selected but no credential is available. Paste an sk-orca-… API key through orcarouter_api_key (${ORCA_KEY_DASHBOARD_URL}), or use the OrcaRouter – Auth entry point: set orcarouter_auth: true and orcarouter_stage: connect to sign in with an OrcaRouter account.`,
    );
    return base;
  }

  const stored = await options.store?.read();
  if (credential.source === "pkce" && stored?.needsReauth) {
    warnings.push(
      "The stored OrcaRouter login was reported as revoked and is awaiting reauthentication. Re-run the OrcaRouter – Auth connect flow; there is no refresh grant to retry.",
    );
  }

  base.credential = credential;
  log(
    `OrcaRouter: using the ${credential.source === "pkce" ? "account login (PKCE)" : "API key"} credential ${maskSecret(credential.key)}`,
  );

  const capability = "chat" as const;
  const catalog =
    options.cache?.get(capability) !== undefined
      ? {
          models: options.cache.get(capability)!,
          source: "live" as const,
          degraded: false,
        }
      : await fetchOrcaRouterCatalog({
          apiBaseV1Url: origins.apiBaseV1Url,
          apiKey: credential.key,
          capability,
          fetchImpl: options.fetchImpl,
        });

  if (catalog.source === "live") options.cache?.set(capability, catalog.models);
  base.degraded = catalog.degraded;
  base.degradeReason = catalog.reason;
  if (catalog.degraded) {
    warnings.push(
      `OrcaRouter model discovery is degraded (${catalog.reason}); using the verified fallback catalog.`,
    );
  }

  const modelOptions = filterOrcaRouterModels(catalog.models, {
    capability,
    inputModalities: options.inputModalities,
  });
  base.modelOptions = modelOptions;

  const requested =
    readEnv(env, "INPUT_ORCAROUTER_MODEL") ?? readEnv(env, "ANTHROPIC_MODEL");
  const reconciled = reconcileSelectedModel(requested, modelOptions);
  base.selectionCleared = reconciled.cleared;
  if (reconciled.cleared) {
    warnings.push(
      `The selected OrcaRouter model "${requested}" is not available for this entry point and was cleared. Choose a model from the refreshed list.`,
    );
  }
  base.selectedModel = reconciled.selected ?? modelOptions[0]?.id;

  if (base.selectedModel === undefined) {
    errors.push(
      "OrcaRouter returned no model that supports a text chat entry point. Choose a different provider or retry once discovery recovers.",
    );
  }
  return base;
}

/**
 * Environment a downstream Claude CLI needs to reach OrcaRouter. Returned rather
 * than assigned so the caller owns process-environment mutation.
 *
 * `ANTHROPIC_BASE_URL` is the *origin*: the Anthropic SDK appends `/v1/messages`
 * itself, so including `/v1` here would produce `/v1/v1/messages` (a 404). The
 * catalog URL in `catalog.ts` builds its own `/v1/models` path.
 */
export function orcaRouterEnvironment(
  resolution: OrcaRouterResolution,
): Record<string, string> {
  if (!resolution.enabled || !resolution.credential) return {};
  const environment: Record<string, string> = {
    ANTHROPIC_BASE_URL: resolution.origins.apiBaseUrl,
    ANTHROPIC_AUTH_TOKEN: resolution.credential.key,
  };
  if (resolution.selectedModel) {
    environment.ANTHROPIC_MODEL = resolution.selectedModel;
  }
  return environment;
}
