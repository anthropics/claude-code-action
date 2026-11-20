#!/usr/bin/env bun

import * as core from "@actions/core";
import { GITHUB_API_URL } from "./api/config";
import { retryWithBackoff } from "../utils/retry";

export class WorkflowValidationSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationSkipError";
  }
}

type AppTokenExchangeErrorResponse = {
  error?: {
    message?: string;
    details?: {
      error_code?: string;
    };
  };
  type?: string;
  message?: string;
};

const WORKFLOW_VALIDATION_ERROR_CODES = new Set([
  "workflow_not_found_on_default_branch",
]);
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
type TokenRequestPhase = "setup" | "renewal";

function getAppTokenExchangeErrorMessage(
  responseJson: AppTokenExchangeErrorResponse,
): string {
  return responseJson.error?.message ?? responseJson.message ?? "Unknown error";
}

function isWorkflowValidationError(
  status: number,
  responseJson: AppTokenExchangeErrorResponse,
): boolean {
  const errorCode = responseJson.error?.details?.error_code;
  if (
    errorCode !== undefined &&
    WORKFLOW_VALIDATION_ERROR_CODES.has(errorCode)
  ) {
    return true;
  }

  if (status !== 401) {
    return false;
  }

  const workflowValidationMessage = "workflow validation failed";
  return [responseJson.message, responseJson.error?.message].some((message) =>
    message?.toLowerCase().includes(workflowValidationMessage),
  );
}

async function getOidcToken(
  phase: TokenRequestPhase = "setup",
): Promise<string> {
  try {
    const oidcToken = await core.getIDToken("claude-code-github-action");

    return oidcToken;
  } catch (error) {
    if (phase === "setup") console.error("Failed to get OIDC token:", error);
    throw new Error(
      "Could not fetch an OIDC token. Did you remember to add `id-token: write` to your workflow permissions?",
    );
  }
}

const DEFAULT_PERMISSIONS: Record<string, string> = {
  contents: "write",
  pull_requests: "write",
  issues: "write",
};

export function parseAdditionalPermissions():
  | Record<string, string>
  | undefined {
  const raw = process.env.ADDITIONAL_PERMISSIONS;
  if (!raw || !raw.trim()) {
    return undefined;
  }

  const additional: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key && value) {
      additional[key] = value;
    }
  }

  if (Object.keys(additional).length === 0) {
    return undefined;
  }

  return { ...DEFAULT_PERMISSIONS, ...additional };
}

async function exchangeForAppToken(
  oidcToken: string,
  permissions?: Record<string, string>,
  phase: TokenRequestPhase = "setup",
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${oidcToken}`,
  };
  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
  };
  if (phase === "renewal") {
    fetchOptions.signal = AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS);
    fetchOptions.redirect = "error";
  }

  if (permissions) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify({ permissions });
  }

  const response = await fetch(
    "https://api.anthropic.com/api/github/github-app-token-exchange",
    fetchOptions,
  );

  if (!response.ok) {
    const responseJson =
      (await response.json()) as AppTokenExchangeErrorResponse;

    if (isWorkflowValidationError(response.status, responseJson)) {
      const message = getAppTokenExchangeErrorMessage(responseJson);
      if (phase === "setup") {
        core.warning(`Skipping action due to workflow validation: ${message}`);
        console.log(
          "Action skipped due to workflow validation error. This is expected when adding Claude Code workflows to new repositories or on PRs with workflow changes. If you're seeing this, your workflow will begin working once you merge your PR.",
        );
      }
      throw new WorkflowValidationSkipError(message);
    }

    if (phase === "renewal") {
      throw new Error(
        `GitHub App token renewal failed (HTTP ${response.status})`,
      );
    }
    const message = getAppTokenExchangeErrorMessage(responseJson);
    console.error(
      `App token exchange failed: ${response.status} ${response.statusText} - ${message}`,
    );
    throw new Error(message);
  }

  const appTokenData = (await response.json()) as {
    token?: string;
    app_token?: string;
  };
  const appToken = appTokenData.token || appTokenData.app_token;

  if (!appToken) {
    throw new Error("App token not found in response");
  }

  return appToken;
}

export async function setupGitHubToken(): Promise<string> {
  // Check if GitHub token was provided as override
  const providedToken = process.env.OVERRIDE_GITHUB_TOKEN;

  if (providedToken) {
    console.log("Using provided GITHUB_TOKEN for authentication");
    return providedToken;
  }

  console.log("Requesting OIDC token...");
  const oidcToken = await retryWithBackoff(() => getOidcToken());
  console.log("OIDC token successfully obtained");

  const permissions = parseAdditionalPermissions();

  console.log("Exchanging OIDC token for app token...");
  const appToken = await retryWithBackoff(
    () => exchangeForAppToken(oidcToken, permissions),
    {
      shouldRetry: (error) => !(error instanceof WorkflowValidationSkipError),
    },
  );
  console.log("App token successfully obtained");
  core.setSecret(appToken);

  console.log("Using GITHUB_TOKEN from OIDC");
  return appToken;
}

export async function renewGitHubAppToken(): Promise<string> {
  const oidcToken = await getOidcToken("renewal");
  const appToken = await exchangeForAppToken(
    oidcToken,
    parseAdditionalPermissions(),
    "renewal",
  );
  core.setSecret(appToken);
  return appToken;
}

export async function revokeGitHubAppToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${GITHUB_API_URL.replace(/\/+$/, "")}/installation/token`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      },
    );
    // GitHub rejects tokens that have already expired or been revoked.
    return response.status === 204 || response.status === 401;
  } catch {
    return false;
  }
}
