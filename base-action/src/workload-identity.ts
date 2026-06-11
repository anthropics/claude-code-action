#!/usr/bin/env bun

/**
 * Workload Identity Federation support.
 *
 * When the federation inputs are configured, the action fetches a GitHub
 * Actions OIDC token (JWT), writes it to a file, and points the Claude Code
 * CLI at it via ANTHROPIC_IDENTITY_TOKEN_FILE. The CLI exchanges the JWT for
 * a short-lived Anthropic access token using the federation rule, so no
 * static ANTHROPIC_API_KEY is needed.
 *
 * GitHub's OIDC tokens are short-lived and the CLI re-reads the token file
 * every time it refreshes its Anthropic access token, so the action keeps the
 * file fresh in the background for long-running executions.
 */

import * as core from "@actions/core";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { retryWithBackoff } from "./retry";

/** How often the GitHub OIDC identity token file is rewritten. */
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

/**
 * Default audience requested on the GitHub OIDC token. Scopes the JWT to the
 * Claude API token exchange; override with the anthropic_oidc_audience input
 * if your federation rule expects a different audience.
 */
const DEFAULT_OIDC_AUDIENCE = "https://api.anthropic.com";

export type WorkloadIdentityHandle = {
  tokenFile: string;
  stop: () => void;
};

/**
 * Whether the workload identity federation inputs are configured.
 * Mirrors the Claude Code CLI's env detection, which requires the federation
 * rule ID and organization ID.
 */
export function isWorkloadIdentityConfigured(): boolean {
  return Boolean(
    process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim() &&
      process.env.ANTHROPIC_ORGANIZATION_ID?.trim(),
  );
}

async function fetchIdentityToken(audience: string) {
  return retryWithBackoff(() => core.getIDToken(audience));
}

/**
 * Writes a profile config that loads federation from the identity-token file.
 * Resolving federation through a profile (rather than bare env vars) enables
 * the SDK's on-disk credentials cache, so the several `claude` processes the
 * action spawns (plugin installs, main query) share one exchanged access token
 * instead of each re-exchanging the single-use GitHub OIDC token, which fails
 * with 401 (`jti_reused`).
 */
function writeFederationProfile(tokenFile: string): string {
  const configDir = join(
    process.env.RUNNER_TEMP || "/tmp",
    "claude-workload-identity",
    "config",
  );
  const serviceAccountId = process.env.ANTHROPIC_SERVICE_ACCOUNT_ID?.trim();
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();

  const authentication: Record<string, unknown> = {
    type: "oidc_federation",
    federation_rule_id: process.env.ANTHROPIC_FEDERATION_RULE_ID?.trim(),
    identity_token: { source: "file", path: tokenFile },
  };
  if (serviceAccountId) {
    authentication.service_account_id = serviceAccountId;
  }

  const profile: Record<string, unknown> = {
    version: "1.0",
    authentication,
    organization_id: process.env.ANTHROPIC_ORGANIZATION_ID?.trim(),
  };
  if (workspaceId) {
    profile.workspace_id = workspaceId;
  }
  if (baseUrl) {
    profile.base_url = baseUrl;
  }

  mkdirSync(join(configDir, "configs"), { recursive: true, mode: 0o700 });
  writeFileSync(
    join(configDir, "configs", "default.json"),
    JSON.stringify(profile, null, 2),
    { mode: 0o600 },
  );
  return configDir;
}

/**
 * Fetches a GitHub Actions OIDC token, writes it to a file in RUNNER_TEMP,
 * exports ANTHROPIC_IDENTITY_TOKEN_FILE, and starts a background refresh so
 * the file stays valid for long executions.
 *
 * Returns undefined when federation is not configured or is shadowed by a
 * higher-precedence credential. Callers must invoke stop() when execution
 * finishes.
 */
export async function setupWorkloadIdentity(): Promise<
  WorkloadIdentityHandle | undefined
> {
  if (!isWorkloadIdentityConfigured()) {
    return undefined;
  }

  if (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()
  ) {
    core.warning(
      "Workload identity federation inputs are set alongside anthropic_api_key or claude_code_oauth_token. The API key/OAuth token takes precedence, so federation will not be used.",
    );
    return undefined;
  }

  const audience =
    process.env.ANTHROPIC_OIDC_AUDIENCE?.trim() || DEFAULT_OIDC_AUDIENCE;
  const tokenDir = join(
    process.env.RUNNER_TEMP || "/tmp",
    "claude-workload-identity",
  );
  const tokenFile = join(tokenDir, "identity-token");

  const writeIdentityToken = async () => {
    const identityToken = await fetchIdentityToken(audience);
    core.setSecret(identityToken);
    mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
    writeFileSync(tokenFile, identityToken, { mode: 0o600 });
  };

  try {
    await writeIdentityToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch a GitHub Actions OIDC token for workload identity federation: ${message}. Did you remember to add \`id-token: write\` to your workflow permissions?`,
    );
  }

  process.env.ANTHROPIC_IDENTITY_TOKEN_FILE = tokenFile;
  process.env.ANTHROPIC_CONFIG_DIR = writeFederationProfile(tokenFile);
  process.env.ANTHROPIC_PROFILE = "default";
  console.log(
    `Workload identity federation configured (rule: ${process.env.ANTHROPIC_FEDERATION_RULE_ID}, identity token file: ${tokenFile})`,
  );

  const refreshInterval = setInterval(() => {
    writeIdentityToken().catch((error) => {
      core.warning(
        `Failed to refresh the GitHub Actions OIDC identity token: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, REFRESH_INTERVAL_MS);

  return {
    tokenFile,
    stop: () => clearInterval(refreshInterval),
  };
}
