import {
  ORCA_APP_NAME,
  ORCA_AUTHORIZE_PATH,
  ORCA_AUTHORIZED_APPS_URL,
  ORCA_KEY_DASHBOARD_URL,
  ORCA_SCOPE,
  ORCA_TOKEN_PATH,
} from "./endpoints";
import {
  AUTHORIZATION_TIMEOUT_MS,
  CodeExchangeTracker,
  createPkceAttempt,
  stateMatches,
} from "./pkce";
import {
  OrcaRouterCredentialStore,
  scopeIsSufficient,
  type CredentialFailureKind,
  type OrcaRouterCredential,
} from "./credentials";

/**
 * "Connect with OrcaRouter" — OAuth 2.0 + PKCE (RFC 7636) with S256.
 *
 * Flow choice: **B — out-of-band code** (`callback_url=oob`). This client is a
 * GitHub Actions step: it runs headless inside a job container with no
 * dependable listener address and often no browser of its own, so a loopback
 * redirect cannot be relied on. The literal `oob` marker is required and S256 is
 * mandatory for a displayed code. `state` is still generated per attempt and is
 * verified whenever the user pastes back the full callback URL.
 *
 * There is no client secret and no pre-registered redirect URI. The verifier
 * never leaves this process until the exchange, and never enters a URL, a log,
 * or an error message.
 */

export type OrcaRouterAuthErrorKind =
  | "denied"
  | "state-mismatch"
  | "code-expired-or-used"
  | "method-downgrade"
  | "scope-downgrade"
  | "rate-limited"
  | "timeout"
  | "cancelled"
  | "malformed-response"
  | "network"
  | "unknown";

const ACTIONABLE: Record<OrcaRouterAuthErrorKind, string> = {
  denied: "Authorization was declined. Nothing was stored; you can try again.",
  "state-mismatch":
    "The returned state did not match this attempt, so the code was rejected. Start a new login.",
  "code-expired-or-used":
    "The authorization code is unknown, expired, or already used. Codes are single-use with a 10 minute TTL — start a new login.",
  "method-downgrade":
    "The authorization was not bound to S256. Start a new login; do not accept a downgraded challenge method.",
  "scope-downgrade":
    "The authorization was granted with a scope that does not permit API access. Ask an administrator to allow the 'api' scope.",
  "rate-limited":
    "OrcaRouter refused a new key: a user may be issued at most 10 PKCE keys per 24 hours. Reuse the stored key, or revoke unused apps.",
  timeout: "The login window closed before approval. Start a new login.",
  cancelled: "Login was cancelled before it completed.",
  "malformed-response":
    "The authorization response did not contain a usable key.",
  network:
    "The authorization server could not be reached. Check network access and retry.",
  unknown:
    "Authorization failed. Retry, or use an existing OrcaRouter API key.",
};

export class OrcaRouterAuthError extends Error {
  readonly kind: OrcaRouterAuthErrorKind;
  readonly status?: number;
  /** User-facing next step. Never contains credential material. */
  readonly action: string;

  constructor(kind: OrcaRouterAuthErrorKind, detail?: string, status?: number) {
    super(detail ? `${ACTIONABLE[kind]} (${detail})` : ACTIONABLE[kind]);
    this.name = "OrcaRouterAuthError";
    this.kind = kind;
    this.status = status;
    this.action = ACTIONABLE[kind];
  }
}

export function isOrcaRouterAuthError(
  value: unknown,
): value is OrcaRouterAuthError {
  return value instanceof OrcaRouterAuthError;
}

/**
 * Build the consent URL. `debug`-safe: the verifier is absent by construction —
 * only the challenge travels here.
 */
export function buildAuthorizeUrl(options: {
  authBaseUrl: string;
  challenge: string;
  state: string;
  appName?: string;
  /**
   * Flow B uses the literal `oob`. A `https://` or loopback `http://` value
   * selects Flow A semantics; `oob` is what this client requests.
   */
  callbackUrl?: string;
}): string {
  const url = new URL(ORCA_AUTHORIZE_PATH, options.authBaseUrl);
  url.searchParams.set("callback_url", options.callbackUrl ?? "oob");
  url.searchParams.set("code_challenge", options.challenge);
  // Always S256: the consent screen lets a user choose "show me a code", which
  // puts a displayed code in human hands even for a redirect flow.
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  url.searchParams.set("app_name", options.appName ?? ORCA_APP_NAME);
  url.searchParams.set("scope", ORCA_SCOPE);
  return url.toString();
}

export type ExchangeResult = {
  key: string;
  userId?: string;
  scope?: string;
};

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type ExchangeOptions = {
  authBaseUrl: string;
  code: string;
  verifier: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function mapExchangeStatus(status: number): OrcaRouterAuthErrorKind {
  if (status === 400) return "method-downgrade";
  if (status === 403) return "code-expired-or-used";
  if (status === 429) return "rate-limited";
  return "unknown";
}

/**
 * Redeem an auth code at the **auth** origin. The path is `/api/v1/auth/keys`
 * under `www.orcarouter.ai`; `https://api.orcarouter.ai/v1/auth/keys` is a 404
 * and is never constructed.
 */
export async function exchangeAuthorizationCode(
  options: ExchangeOptions,
): Promise<ExchangeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000,
  );
  const fetchImpl: FetchLike =
    options.fetchImpl ??
    ((input, init) => fetch(input, init) as ReturnType<FetchLike>);

  try {
    const response = await fetchImpl(
      `${options.authBaseUrl}${ORCA_TOKEN_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: options.code,
          code_verifier: options.verifier,
          code_challenge_method: "S256",
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new OrcaRouterAuthError(
        mapExchangeStatus(response.status),
        `status ${response.status}`,
        response.status,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(await response.text()) as Record<string, unknown>;
    } catch {
      throw new OrcaRouterAuthError(
        "malformed-response",
        "response was not JSON",
      );
    }

    const key = payload.key;
    if (typeof key !== "string" || !key.trim()) {
      throw new OrcaRouterAuthError("malformed-response", "no key in response");
    }

    // `scope` is what was *granted*, not what was requested.
    const scope = typeof payload.scope === "string" ? payload.scope : undefined;
    if (!scopeIsSufficient(scope)) {
      throw new OrcaRouterAuthError(
        "scope-downgrade",
        `granted scope "${scope}"`,
      );
    }

    return {
      key: key.trim(),
      userId: typeof payload.user_id === "string" ? payload.user_id : undefined,
      scope,
    };
  } catch (error) {
    if (error instanceof OrcaRouterAuthError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OrcaRouterAuthError("timeout", "exchange timed out");
    }
    throw new OrcaRouterAuthError(
      "network",
      "exchange request could not be sent",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Accept what the consent screen gave the user. A bare code, a full callback
 * URL, or a `code=...&state=...` fragment are all accepted; whenever a state is
 * present it is verified before the code is used.
 */
export function parseAuthorizationInput(
  input: string,
  expectedState: string,
): { code: string } {
  const trimmed = input.trim();
  if (!trimmed) throw new OrcaRouterAuthError("cancelled", "empty input");

  // The consent screen may hand back a bare code, a full callback URL, or a
  // `code=...&state=...` fragment. Only the last two are query-shaped.
  const queryShaped = trimmed.includes("?") || trimmed.includes("=");
  const query = trimmed.includes("?")
    ? trimmed.slice(trimmed.indexOf("?") + 1)
    : trimmed;
  const params = new URLSearchParams(query.split("#")[0]);
  const error = params.get("error");
  if (error) {
    throw new OrcaRouterAuthError(
      error === "access_denied" ? "denied" : "unknown",
      `error=${error}`,
    );
  }

  if (!queryShaped) {
    const bare = trimmed.split("#")[0]!.trim();
    if (!bare) throw new OrcaRouterAuthError("cancelled", "no code in input");
    return { code: bare };
  }

  const state = params.get("state");
  if (state !== null && !stateMatches(expectedState, state)) {
    throw new OrcaRouterAuthError("state-mismatch");
  }

  const code = params.get("code");
  if (!code) throw new OrcaRouterAuthError("cancelled", "no code in input");
  return { code: code.trim() };
}

/**
 * Login lifecycle for a host that has UI or server-side state.
 *
 * A monotonically increasing generation guards every async response, and
 * `releaseNow()` is synchronous so a `pagehide`/unmount path can clear busy and
 * hint state without relying on a guarded `finally` that will correctly refuse
 * to mutate state.
 */
export class OrcaRouterLoginSession {
  private current = 0;
  private busy = false;
  private hint: string | undefined;

  /** Start a new attempt, invalidating any in-flight predecessor. */
  begin(): number {
    this.current += 1;
    this.busy = true;
    this.hint = undefined;
    return this.current;
  }

  isCurrent(generation: number): boolean {
    return generation === this.current;
  }

  setHint(generation: number, hint: string): boolean {
    if (!this.isCurrent(generation)) return false;
    this.hint = hint;
    return true;
  }

  /** Release state, but only for the generation that is still current. */
  release(generation: number): boolean {
    if (!this.isCurrent(generation)) return false;
    this.busy = false;
    this.hint = undefined;
    return true;
  }

  /** Synchronous release for `pagehide`/window close/unmount. */
  releaseNow(): void {
    this.current += 1;
    this.busy = false;
    this.hint = undefined;
  }

  get state(): { busy: boolean; hint?: string; generation: number } {
    return { busy: this.busy, hint: this.hint, generation: this.current };
  }
}

export type ConnectOptions = {
  authBaseUrl: string;
  /** Receives the consent URL for display. Must not receive the verifier. */
  presentUrl: (url: string) => void;
  /** Returns the code the user pasted back; resolve `null` to cancel. */
  requestCode: () => Promise<string | null>;
  store: OrcaRouterCredentialStore;
  appName?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  session?: OrcaRouterLoginSession;
};

/**
 * Run the connect flow and persist the resulting key. The returned credential is
 * the same shape the API-key adapter produces, so nothing downstream needs to
 * know which entry point was used.
 */
export async function connectWithOrcaRouter(
  options: ConnectOptions,
): Promise<OrcaRouterCredential> {
  const session = options.session ?? new OrcaRouterLoginSession();
  const generation = session.begin();
  const tracker = new CodeExchangeTracker();
  const attempt = createPkceAttempt();

  try {
    const url = buildAuthorizeUrl({
      authBaseUrl: options.authBaseUrl,
      challenge: attempt.challenge,
      state: attempt.state,
      appName: options.appName,
    });
    session.setHint(generation, "Waiting for authorization in the browser");
    options.presentUrl(url);

    const pasted = await options.requestCode();
    if (pasted === null) throw new OrcaRouterAuthError("cancelled");
    if (!session.isCurrent(generation))
      throw new OrcaRouterAuthError("cancelled");

    const { code } = parseAuthorizationInput(pasted, attempt.state);
    if (tracker.consumed) {
      throw new OrcaRouterAuthError(
        "code-expired-or-used",
        "code already spent",
      );
    }
    tracker.consume();

    const result = await exchangeAuthorizationCode({
      authBaseUrl: options.authBaseUrl,
      code,
      verifier: attempt.verifier,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? AUTHORIZATION_TIMEOUT_MS,
    });

    if (!session.isCurrent(generation))
      throw new OrcaRouterAuthError("cancelled");

    const record = await options.store.save({
      key: result.key,
      source: "pkce",
      scope: result.scope,
    });
    return {
      key: record.key,
      source: "pkce",
      scope: record.scope,
      generation: record.generation,
    };
  } finally {
    session.release(generation);
  }
}

export type RelayReauthOutcome = {
  kind: CredentialFailureKind;
  marked: boolean;
  message?: string;
};

/**
 * Handle a rejected inference request. Only a `401` is terminal: it marks the
 * exact account and credential generation that made the rejected request, so a
 * late failure from a superseded request cannot poison a newer credential. A
 * PKCE-issued key is durable and has no refresh grant, so no refresh is
 * attempted — the user is sent back through the connect flow.
 */
export async function handleRelayFailure(
  status: number | undefined,
  credential: OrcaRouterCredential,
  store: OrcaRouterCredentialStore,
  classify: (status: number | undefined) => CredentialFailureKind,
): Promise<RelayReauthOutcome> {
  const kind = classify(status);
  if (kind !== "needs-reauth") return { kind, marked: false };
  if (credential.source !== "pkce") {
    return {
      kind,
      marked: false,
      message: `The OrcaRouter API key was rejected (401). Issue a new key at ${ORCA_KEY_DASHBOARD_URL}.`,
    };
  }
  const marked = await store.markNeedsReauth(credential.generation);
  return {
    kind,
    marked,
    message: `The OrcaRouter login was revoked (401). Re-run the connect flow, or review authorized apps at ${ORCA_AUTHORIZED_APPS_URL}.`,
  };
}
