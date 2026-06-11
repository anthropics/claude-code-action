import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import * as core from "@actions/core";
import type { RetryOptions } from "../base-action/src/retry";

// Drop-in replacement for retryWithBackoff with the same semantics but no
// sleep between attempts, so the failure paths run instantly. Only
// src/github/token.ts and an MCP server (never imported by other suites)
// use this module, so the mock cannot leak meaningfully.
mock.module("../src/utils/retry", () => ({
  retryWithBackoff: async <T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> => {
    const { maxAttempts = 3, shouldRetry } = options;
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (shouldRetry && !shouldRetry(lastError)) {
          throw lastError;
        }
      }
    }
    throw lastError;
  },
}));

import {
  parseAdditionalPermissions,
  setupGitHubToken,
  WorkflowValidationSkipError,
} from "../src/github/token";

const EXCHANGE_URL =
  "https://api.anthropic.com/api/github/github-app-token-exchange";

const originalOverrideToken = process.env.OVERRIDE_GITHUB_TOKEN;
const originalAdditionalPermissions = process.env.ADDITIONAL_PERMISSIONS;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

let getIDTokenSpy: ReturnType<typeof spyOn<typeof core, "getIDToken">>;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let setSecretSpy: ReturnType<typeof spyOn<typeof core, "setSecret">>;
let warningSpy: ReturnType<typeof spyOn<typeof core, "warning">>;
let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let errorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeEach(() => {
  delete process.env.OVERRIDE_GITHUB_TOKEN;
  delete process.env.ADDITIONAL_PERMISSIONS;

  getIDTokenSpy = spyOn(core, "getIDToken");
  fetchSpy = spyOn(globalThis, "fetch");
  setSecretSpy = spyOn(core, "setSecret").mockImplementation(() => {});
  warningSpy = spyOn(core, "warning").mockImplementation(() => {});
  logSpy = spyOn(console, "log").mockImplementation(() => {});
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  getIDTokenSpy.mockRestore();
  fetchSpy.mockRestore();
  setSecretSpy.mockRestore();
  warningSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

afterAll(() => {
  if (originalOverrideToken === undefined) {
    delete process.env.OVERRIDE_GITHUB_TOKEN;
  } else {
    process.env.OVERRIDE_GITHUB_TOKEN = originalOverrideToken;
  }
  if (originalAdditionalPermissions === undefined) {
    delete process.env.ADDITIONAL_PERMISSIONS;
  } else {
    process.env.ADDITIONAL_PERMISSIONS = originalAdditionalPermissions;
  }
});

describe("setupGitHubToken", () => {
  test("returns the override token without touching OIDC", async () => {
    process.env.OVERRIDE_GITHUB_TOKEN = "ghp_override";

    const token = await setupGitHubToken();

    expect(token).toBe("ghp_override");
    expect(getIDTokenSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "Using provided GITHUB_TOKEN for authentication",
    );
  });

  test("exchanges the OIDC token for an app token", async () => {
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(jsonResponse(200, { token: "app-tok" }));

    const token = await setupGitHubToken();

    expect(token).toBe("app-tok");
    expect(getIDTokenSpy).toHaveBeenCalledWith("claude-code-github-action");
    expect(setSecretSpy).toHaveBeenCalledWith("app-tok");

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXCHANGE_URL);
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer oidc-123",
    );
    expect(options.body).toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Requesting OIDC token...");
    expect(logSpy).toHaveBeenCalledWith("OIDC token successfully obtained");
    expect(logSpy).toHaveBeenCalledWith(
      "Exchanging OIDC token for app token...",
    );
    expect(logSpy).toHaveBeenCalledWith("App token successfully obtained");
    expect(logSpy).toHaveBeenCalledWith("Using GITHUB_TOKEN from OIDC");
  });

  test("accepts the app_token response field as fallback", async () => {
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(jsonResponse(200, { app_token: "alt-tok" }));

    const token = await setupGitHubToken();

    expect(token).toBe("alt-tok");
  });

  test("sends merged permissions when ADDITIONAL_PERMISSIONS is set", async () => {
    process.env.ADDITIONAL_PERMISSIONS = "actions : read";
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(jsonResponse(200, { token: "app-tok" }));

    await setupGitHubToken();

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(options.body as string)).toEqual({
      permissions: {
        contents: "write",
        pull_requests: "write",
        issues: "write",
        actions: "read",
      },
    });
  });

  test("throws when the response carries no token", async () => {
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(jsonResponse(200, {}));

    await expect(setupGitHubToken()).rejects.toThrow(
      "App token not found in response",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("fails with permissions guidance when OIDC token cannot be obtained", async () => {
    getIDTokenSpy.mockRejectedValue(new Error("no id token"));

    await expect(setupGitHubToken()).rejects.toThrow("id-token: write");
    expect(getIDTokenSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to get OIDC token:",
      expect.any(Error),
    );
  });

  test("propagates the API error message on non-ok responses", async () => {
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(
      jsonResponse(401, { error: { message: "Bad credentials" } }),
    );

    await expect(setupGitHubToken()).rejects.toThrow("Bad credentials");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      "App token exchange failed: 401 Error - Bad credentials",
    );
  });

  test("falls back to Unknown error when the error body is empty", async () => {
    getIDTokenSpy.mockResolvedValue("oidc-123");
    fetchSpy.mockResolvedValue(jsonResponse(500, {}));

    await expect(setupGitHubToken()).rejects.toThrow("Unknown error");
    expect(errorSpy).toHaveBeenCalledWith(
      "App token exchange failed: 500 Error - Unknown error",
    );
  });

  describe("workflow validation skip", () => {
    const skipBody = {
      message: "workflow file not on default branch",
      error: {
        message: "inner message",
        details: { error_code: "workflow_not_found_on_default_branch" },
      },
    };

    test("throws WorkflowValidationSkipError without retrying", async () => {
      getIDTokenSpy.mockResolvedValue("oidc-123");
      fetchSpy.mockResolvedValue(jsonResponse(400, skipBody));

      const error = await setupGitHubToken().catch((e: Error) => e);

      expect(error).toBeInstanceOf(WorkflowValidationSkipError);
      expect((error as Error).name).toBe("WorkflowValidationSkipError");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(warningSpy).toHaveBeenCalledWith(
        "Skipping action due to workflow validation: workflow file not on default branch",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Action skipped due to workflow validation error. This is expected when adding Claude Code workflows to new repositories or on PRs with workflow changes. If you're seeing this, your workflow will begin working once you merge your PR.",
      );
    });

    test("uses the top-level message when present", async () => {
      getIDTokenSpy.mockResolvedValue("oidc-123");
      fetchSpy.mockResolvedValue(jsonResponse(400, skipBody));

      await expect(setupGitHubToken()).rejects.toThrow(
        "workflow file not on default branch",
      );
    });

    test("falls back to the inner error message", async () => {
      getIDTokenSpy.mockResolvedValue("oidc-123");
      fetchSpy.mockResolvedValue(
        jsonResponse(400, {
          error: {
            message: "inner message",
            details: { error_code: "workflow_not_found_on_default_branch" },
          },
        }),
      );

      await expect(setupGitHubToken()).rejects.toThrow("inner message");
    });

    test("falls back to a generic message when the body has none", async () => {
      getIDTokenSpy.mockResolvedValue("oidc-123");
      fetchSpy.mockResolvedValue(
        jsonResponse(400, {
          error: {
            details: { error_code: "workflow_not_found_on_default_branch" },
          },
        }),
      );

      await expect(setupGitHubToken()).rejects.toThrow(
        "Workflow validation failed",
      );
    });
  });
});

describe("parseAdditionalPermissions boundary cases", () => {
  test("line with an empty value is ignored", () => {
    process.env.ADDITIONAL_PERMISSIONS = "actions:";

    expect(parseAdditionalPermissions()).toBeUndefined();
  });

  test("line with an empty key is ignored", () => {
    process.env.ADDITIONAL_PERMISSIONS = ": read";

    expect(parseAdditionalPermissions()).toBeUndefined();
  });

  test("input with only invalid lines yields undefined", () => {
    process.env.ADDITIONAL_PERMISSIONS = "no colon here";

    expect(parseAdditionalPermissions()).toBeUndefined();
  });
});
