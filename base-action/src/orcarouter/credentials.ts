import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { ORCA_KEY_PREFIX, ORCA_SCOPE } from "./endpoints";

/**
 * The single credential seam for OrcaRouter.
 *
 * Both user-facing entry points — pasting an existing `sk-orca-…` key, and
 * "Connect with OrcaRouter" (OAuth 2.0 + PKCE) — are *adapters* on this
 * interface. Everything downstream (provider wiring, model discovery, terminal
 * 401 recovery) consumes the resulting `OrcaRouterCredential` and never learns
 * which adapter produced it, so no credential-acquisition logic is duplicated
 * per entry point.
 */

export type CredentialSourceId = "api-key" | "pkce";

export type OrcaRouterCredential = {
  key: string;
  source: CredentialSourceId;
  /** Scope actually granted by the exchange. Absent for pasted keys. */
  scope?: string;
  /** Monotonic counter used to bind failures to the exact credential. */
  generation: number;
};

export interface OrcaRouterCredentialSource {
  readonly id: CredentialSourceId;
  /** Human-facing label. Safe to log; contains no key material. */
  readonly label: string;
  load(): Promise<OrcaRouterCredential | null>;
}

/**
 * On-disk record. Lives in the project's existing user-scope credential
 * directory (`~/.claude/`), not in a store invented for OrcaRouter.
 */
export type OrcaRouterCredentialRecord = {
  version: 1;
  source: CredentialSourceId;
  key: string;
  scope?: string;
  generation: number;
  /**
   * Set when the provider rejected this exact generation. A PKCE-issued key is
   * durable but is **not** a refresh token: there is no refresh grant, so the
   * only recovery is a fresh login.
   */
  needsReauth?: boolean;
  /** Unix ms of the rejection, for operator-visible messaging. */
  needsReauthAt?: number;
};

export class OrcaRouterCredentialStore {
  static readonly FILENAME = "orcarouter-credentials.json";

  constructor(private readonly homeDir: string) {}

  get path(): string {
    return join(this.homeDir, ".claude", OrcaRouterCredentialStore.FILENAME);
  }

  async read(): Promise<OrcaRouterCredentialRecord | null> {
    try {
      const raw = await readFile(this.path, "utf-8");
      const parsed = JSON.parse(raw) as OrcaRouterCredentialRecord;
      if (parsed?.version !== 1 || typeof parsed.key !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Persist a new credential. The generation is always advanced so a late
   * failure from an older request can never mark the new credential broken.
   */
  async save(input: {
    key: string;
    source: CredentialSourceId;
    scope?: string;
  }): Promise<OrcaRouterCredentialRecord> {
    const previous = await this.read();
    const record: OrcaRouterCredentialRecord = {
      version: 1,
      source: input.source,
      key: input.key,
      scope: input.scope,
      generation: (previous?.generation ?? 0) + 1,
    };
    await this.write(record);
    return record;
  }

  /** Remove the stored credential. Never called before a replacement succeeds. */
  async clear(): Promise<void> {
    try {
      await unlink(this.path);
    } catch {
      // Already absent — clearing is idempotent.
    }
  }

  /**
   * Mark exactly the generation that the provider rejected. A late 401 from a
   * superseded request must not poison the credential that replaced it.
   */
  async markNeedsReauth(generation: number): Promise<boolean> {
    const current = await this.read();
    if (!current || current.generation !== generation) return false;
    await this.write({
      ...current,
      needsReauth: true,
      needsReauthAt: Date.now(),
    });
    return true;
  }

  /** Clear the reauth marker after a successful login. */
  async clearNeedsReauth(): Promise<void> {
    const current = await this.read();
    if (!current?.needsReauth) return;
    const {
      needsReauth: _dropped,
      needsReauthAt: _droppedAt,
      ...rest
    } = current;
    await this.write(rest);
  }

  private async write(record: OrcaRouterCredentialRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    // Write-then-rename so a crash cannot leave a truncated credential file.
    const temp = `${this.path}.tmp`;
    await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, this.path);
  }
}

/** Adapter for a key the user already holds and supplied directly. */
export function apiKeyCredentialSource(
  key: string | undefined,
): OrcaRouterCredentialSource {
  return {
    id: "api-key",
    label: "OrcaRouter API key",
    async load() {
      const trimmed = key?.trim();
      if (!trimmed) return null;
      return { key: trimmed, source: "api-key", generation: 0 };
    },
  };
}

/** Adapter for the key a PKCE authorization previously issued. */
export function pkceCredentialSource(
  store: OrcaRouterCredentialStore,
): OrcaRouterCredentialSource {
  return {
    id: "pkce",
    label: "OrcaRouter account login (OAuth 2.0 + PKCE)",
    async load() {
      const record = await store.read();
      if (!record || record.source !== "pkce" || !record.key) return null;
      return {
        key: record.key,
        source: "pkce",
        scope: record.scope,
        generation: record.generation,
      };
    },
  };
}

/**
 * First adapter that yields a credential wins. Order is the project's existing
 * precedence: an explicitly supplied key beats a stored login.
 */
export async function resolveOrcaRouterCredential(
  sources: OrcaRouterCredentialSource[],
): Promise<OrcaRouterCredential | null> {
  for (const source of sources) {
    const credential = await source.load();
    if (credential) return credential;
  }
  return null;
}

/**
 * How a credential-shaped value should be persisted for the Claude CLI to use.
 * Returned as a settings fragment rather than written here, so the existing
 * settings path stays the only writer.
 */
export function orcaRouterSettingsEnv(
  credential: OrcaRouterCredential,
): Record<string, string> {
  return { ANTHROPIC_AUTH_TOKEN: credential.key, ANTHROPIC_BASE_URL: "" };
}

export type CredentialFailureKind = "needs-reauth" | "transient" | "unknown";

/**
 * Classify an upstream failure. Only a genuine authentication rejection is
 * terminal: `429` and network/5xx failures are transient and must not destroy a
 * working credential. A `403` is deliberately *not* terminal — OrcaRouter uses
 * it for per-key model scope (`model_access_denied`), which is a configuration
 * problem, not a revoked credential.
 */
export function classifyCredentialFailure(
  status: number | undefined,
): CredentialFailureKind {
  if (status === 401) return "needs-reauth";
  if (status === undefined) return "transient";
  if (status === 429 || status >= 500) return "transient";
  return "unknown";
}

export type StoredCredentialState = "usable" | "missing" | "corrupted";

/**
 * A stored credential is "usable" when it has the documented public shape.
 * A value that is present but malformed can never succeed, so it is reported as
 * terminal rather than retried.
 */
export function inspectStoredCredential(
  value: string | undefined,
): StoredCredentialState {
  const trimmed = value?.trim();
  if (!trimmed) return "missing";
  return trimmed.startsWith(ORCA_KEY_PREFIX) ? "usable" : "corrupted";
}

/** The scope this integration requires the server to have granted. */
export function scopeIsSufficient(granted: string | undefined): boolean {
  if (granted === undefined) return true;
  return granted === ORCA_SCOPE;
}
