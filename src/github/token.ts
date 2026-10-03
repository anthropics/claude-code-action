#!/usr/bin/env bun

import * as core from "@actions/core";
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

// Cap how much of a non-JSON error body is surfaced. A gateway can answer with
// a whole HTML page; the opening lines are enough to identify what replied.
const MAX_ERROR_BODY_CHARS = 500;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Narrow a parsed body to the fields we understand, keeping only the ones that
 * really are strings.
 *
 * A body being JSON says nothing about its shape: a gateway can answer a 401
 * with `{"message":{"error":"unauthorized"}}`. Casting such a body to
 * `AppTokenExchangeErrorResponse` puts a non-string where the callers expect a
 * string, and `isWorkflowValidationError` then throws a TypeError on
 * `message.toLowerCase()` - masking the status exactly like the SyntaxError
 * this path exists to avoid.
 *
 * Returns undefined when the body carries none of the fields we read, so the
 * caller can fall back to the raw snippet rather than pass on an empty shape.
 */
function narrowErrorResponse(
  parsed: unknown,
): AppTokenExchangeErrorResponse | undefined {
  const root = asRecord(parsed);
  if (!root) {
    return undefined;
  }

  const errorObject = asRecord(root.error);
  // `error` is documented as an object, but tolerate `{"error":"unauthorized"}`
  // rather than discard the only message the response carries.
  const errorMessage = asString(errorObject?.message) ?? asString(root.error);
  const errorCode = asString(asRecord(errorObject?.details)?.error_code);
  const message = asString(root.message);

  if (
    message === undefined &&
    errorMessage === undefined &&
    errorCode === undefined
  ) {
    return undefined;
  }

  const narrowed: AppTokenExchangeErrorResponse = {};
  if (message !== undefined) {
    narrowed.message = message;
  }
  if (errorMessage !== undefined || errorCode !== undefined) {
    narrowed.error = {};
    if (errorMessage !== undefined) {
      narrowed.error.message = errorMessage;
    }
    if (errorCode !== undefined) {
      narrowed.error.details = { error_code: errorCode };
    }
  }

  return narrowed;
}

/**
 * Read a failed response's body without letting that body mask the failure.
 *
 * The exchange endpoint answers with JSON, but a proxy or gateway in front of
 * it can return an HTML error page or an empty body. `response.json()` then
 * throws a SyntaxError that replaces the real failure: the status and
 * statusText are never logged, `isWorkflowValidationError` never gets to run,
 * and `retryWithBackoff` retries a response that will never parse.
 */
async function readErrorResponseBody(
  response: Response,
): Promise<AppTokenExchangeErrorResponse> {
  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    return {};
  }

  try {
    const narrowed = narrowErrorResponse(JSON.parse(rawBody));
    if (narrowed) {
      return narrowed;
    }
  } catch {
    // Not JSON.
  }

  // Either not JSON, or a shape none of the callers can read. Surface the body
  // as plain text instead, so the status line below still reaches the user
  // along with whatever the gateway actually said.
  const snippet = rawBody.trim().slice(0, MAX_ERROR_BODY_CHARS);
  return snippet ? { message: snippet } : {};
}

async function getOidcToken(): Promise<string> {
  try {
    const oidcToken = await core.getIDToken("claude-code-github-action");

    return oidcToken;
  } catch (error) {
    console.error("Failed to get OIDC token:", error);
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
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${oidcToken}`,
  };
  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
  };

  if (permissions) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify({ permissions });
  }

  const response = await fetch(
    "https://api.anthropic.com/api/github/github-app-token-exchange",
    fetchOptions,
  );

  if (!response.ok) {
    const responseJson = await readErrorResponseBody(response);

    if (isWorkflowValidationError(response.status, responseJson)) {
      const message = getAppTokenExchangeErrorMessage(responseJson);
      core.warning(`Skipping action due to workflow validation: ${message}`);
      console.log(
        "Action skipped due to workflow validation error. This is expected when adding Claude Code workflows to new repositories or on PRs with workflow changes. If you're seeing this, your workflow will begin working once you merge your PR.",
      );
      throw new WorkflowValidationSkipError(message);
    }

    // Keep the status in the thrown error, not just in the log line: it is the
    // most actionable part of the failure, and for an empty body it is the only
    // information there is.
    const message = getAppTokenExchangeErrorMessage(responseJson);
    const failure = `App token exchange failed: ${response.status} ${response.statusText} - ${message}`;
    console.error(failure);
    throw new Error(failure);
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
