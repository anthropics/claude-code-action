/**
 * OrcaRouter endpoint resolution.
 *
 * Authentication and inference live on *different* public origins:
 *
 *   - auth + code exchange: `https://www.orcarouter.ai`
 *     (its API paths are under `/api/v1/auth`)
 *   - inference + model catalog: `https://api.orcarouter.ai/v1`
 *
 * `https://api.orcarouter.ai/v1/auth/keys` is a 404. Never derive one public
 * origin from the other by swapping a hostname or blindly appending `/v1`.
 *
 * Both origins are configurable. Self-hosted deployments may use a single shared
 * origin or two separate ones, so a shared `ORCA_BASE_URL` fallback is supported
 * alongside the explicit `ORCA_AUTH_BASE_URL` / `ORCA_API_BASE_URL` overrides.
 * Explicit overrides always win.
 */

export const ORCA_DEFAULT_AUTH_BASE_URL = "https://www.orcarouter.ai";
export const ORCA_DEFAULT_API_BASE_URL = "https://api.orcarouter.ai";

export const ORCA_AUTHORIZE_PATH = "/auth";
export const ORCA_TOKEN_PATH = "/api/v1/auth/keys";
export const ORCA_DEVICE_CODE_PATH = "/api/v1/auth/device/code";
export const ORCA_DEVICE_TOKEN_PATH = "/api/v1/auth/device/token";
export const ORCA_MODELS_PATH = "/models";

/** The only scope this integration requests. */
export const ORCA_SCOPE = "api";

export const ORCA_APP_NAME = "Claude Code Action";
export const ORCA_KEY_PREFIX = "sk-orca-";

export const ORCA_KEY_DASHBOARD_URL = "https://www.orcarouter.ai/console/token";
export const ORCA_AUTHORIZED_APPS_URL =
  "https://www.orcarouter.ai/console/authorized-apps";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export type OrcaRouterOrigins = {
  /** Origin that serves the consent screen and the auth-code exchange. */
  authBaseUrl: string;
  /** Origin that serves inference and the model catalog. */
  apiBaseUrl: string;
  /** `apiBaseUrl` normalised to end in `/v1`. */
  apiBaseV1Url: string;
};

function trimOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

/**
 * Remote origins must be HTTPS; plain HTTP is allowed only for loopback
 * development. This is enforced rather than documented so a mistyped override
 * cannot silently downgrade credential exchange onto the wire.
 */
function assertTransportAllowed(origin: string, variable: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(
      `${variable} is not a valid absolute URL. Expected an origin such as https://api.orcarouter.ai`,
    );
  }
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return;
  throw new Error(
    `${variable} must use https:// (plain http:// is only accepted for loopback development hosts).`,
  );
}

/** Normalise an inference origin so model/chat paths resolve under `/v1`. */
function withApiVersion(origin: string): string {
  const url = new URL(origin);
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/v1") ? path : `${path}/v1`;
  return url.toString().replace(/\/+$/, "");
}

export function resolveOrcaRouterOrigins(
  env: Record<string, string | undefined> = process.env,
): OrcaRouterOrigins {
  const shared = trimOrigin(env.ORCA_BASE_URL);
  const auth =
    trimOrigin(env.ORCA_AUTH_BASE_URL) ?? shared ?? ORCA_DEFAULT_AUTH_BASE_URL;
  const api =
    trimOrigin(env.ORCA_API_BASE_URL) ?? shared ?? ORCA_DEFAULT_API_BASE_URL;

  assertTransportAllowed(auth, "ORCA_AUTH_BASE_URL");
  assertTransportAllowed(api, "ORCA_API_BASE_URL");

  return {
    authBaseUrl: auth,
    apiBaseUrl: api,
    apiBaseV1Url: withApiVersion(api),
  };
}

/** True when the origin is a loopback host, i.e. an in-process callback target. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Lightweight shape check only. An `sk-orca-` prefix is *not* proof that a
 * credential is valid — it exists so a mistyped value produces a useful message
 * instead of a confusing upstream error.
 */
export function looksLikeOrcaRouterKey(value: string | undefined): boolean {
  return Boolean(value?.trim().startsWith(ORCA_KEY_PREFIX));
}

/**
 * Display form of a secret. Keeps a short, non-reversible tail so a user can tell
 * two keys apart without the value ever being recoverable from a log.
 */
export function maskSecret(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "(unset)";
  if (trimmed.length <= 12) return `${ORCA_KEY_PREFIX}…`;
  return `${trimmed.slice(0, 9)}…${trimmed.slice(-4)}`;
}

const ORCA_KEY_PATTERN = /sk-orca-[A-Za-z0-9_-]+/g;

/** Redact every OrcaRouter credential-shaped token from a string. */
export function redactOrcaRouterKeys(text: string): string {
  return text.replace(ORCA_KEY_PATTERN, "[REDACTED_ORCAROUTER_KEY]");
}
