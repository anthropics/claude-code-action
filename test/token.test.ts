import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import {
  setupGitHubToken,
  WorkflowValidationSkipError,
} from "../src/github/token";

describe("setupGitHubToken", () => {
  let originalOverrideToken: string | undefined;
  let originalAdditionalPermissions: string | undefined;
  let getIDTokenSpy: any;
  let setSecretSpy: any;
  let warningSpy: any;
  let fetchSpy: any;
  let setTimeoutSpy: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    originalOverrideToken = process.env.OVERRIDE_GITHUB_TOKEN;
    originalAdditionalPermissions = process.env.ADDITIONAL_PERMISSIONS;
    delete process.env.OVERRIDE_GITHUB_TOKEN;
    delete process.env.ADDITIONAL_PERMISSIONS;

    getIDTokenSpy = spyOn(core, "getIDToken").mockResolvedValue("oidc-token");
    setSecretSpy = spyOn(core, "setSecret").mockImplementation(() => {});
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
    fetchSpy = spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "app-token" }), {
        status: 200,
        statusText: "OK",
      }),
    );
    setTimeoutSpy = spyOn(global, "setTimeout").mockImplementation(((
      handler: any,
    ) => {
      handler();
      return 0 as any;
    }) as any);
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
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

    getIDTokenSpy.mockRestore();
    setSecretSpy.mockRestore();
    warningSpy.mockRestore();
    fetchSpy.mockRestore();
    setTimeoutSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test("returns app token from OIDC exchange", async () => {
    await expect(setupGitHubToken()).resolves.toBe("app-token");

    expect(getIDTokenSpy).toHaveBeenCalledWith("claude-code-github-action");
    expect(setSecretSpy).toHaveBeenCalledWith("app-token");
  });

  test("skips without retrying when workflow is missing from default branch", async () => {
    const message =
      "Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.";
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message,
            details: {
              error_code: "workflow_not_found_on_default_branch",
            },
          },
        }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );

    await expect(setupGitHubToken()).rejects.toBeInstanceOf(
      WorkflowValidationSkipError,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith(
      `Skipping action due to workflow validation: ${message}`,
    );
  });

  test("skips without retrying when workflow validation message has no error code", async () => {
    const message =
      "Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.";
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message,
          },
        }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );

    await expect(setupGitHubToken()).rejects.toBeInstanceOf(
      WorkflowValidationSkipError,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).toHaveBeenCalledWith(
      `Skipping action due to workflow validation: ${message}`,
    );
  });

  test("retries ordinary token exchange errors instead of skipping", async () => {
    const message = "Bad credentials";
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message,
            },
          }),
          { status: 401, statusText: "Unauthorized" },
        ),
    );

    await expect(setupGitHubToken()).rejects.toThrow(message);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(warningSpy).not.toHaveBeenCalled();
  });

  test("does not skip message-only workflow validation errors with unexpected status", async () => {
    const message =
      "Workflow validation failed. The workflow file must exist and have identical content to the version on the repository's default branch.";
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message,
            },
          }),
          { status: 500, statusText: "Internal Server Error" },
        ),
    );

    await expect(setupGitHubToken()).rejects.toThrow(message);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(warningSpy).not.toHaveBeenCalled();
  });
});
