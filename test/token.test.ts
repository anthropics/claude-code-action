import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import { GITHUB_API_URL } from "../src/github/api/config";
import {
  renewGitHubAppToken,
  revokeGitHubAppToken,
  setupGitHubToken,
  WorkflowValidationSkipError,
} from "../src/github/token";

describe("GitHub App authentication", () => {
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

  test("renews with a fresh OIDC assertion and the original permission request", async () => {
    process.env.ADDITIONAL_PERMISSIONS = "actions: read\ncontents: read";
    getIDTokenSpy
      .mockResolvedValueOnce("oidc-token")
      .mockResolvedValueOnce("fresh-oidc-token");
    fetchSpy
      .mockResolvedValueOnce(Response.json({ token: "app-token" }))
      .mockResolvedValueOnce(Response.json({ app_token: "renewed-app-token" }));

    await expect(setupGitHubToken()).resolves.toBe("app-token");
    await expect(renewGitHubAppToken()).resolves.toBe("renewed-app-token");

    expect(getIDTokenSpy.mock.calls).toEqual([
      ["claude-code-github-action"],
      ["claude-code-github-action"],
    ]);
    const [[setupUrl, setupRequest], [renewalUrl, renewalRequest]] =
      fetchSpy.mock.calls;
    expect(renewalUrl).toBe(setupUrl);
    expect(renewalRequest).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer fresh-oidc-token",
        "Content-Type": "application/json",
      },
      body: setupRequest.body,
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(setSecretSpy).toHaveBeenLastCalledWith("renewed-app-token");
  });

  test("leaves the workflow validation veto in place without logging a startup skip during renewal", async () => {
    const message = "Workflow validation failed";
    fetchSpy.mockResolvedValue(
      Response.json({ error: { message } }, { status: 401 }),
    );

    await expect(renewGitHubAppToken()).rejects.toBeInstanceOf(
      WorkflowValidationSkipError,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warningSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).not.toHaveBeenCalled();
  });

  test("makes one bounded request to revoke the superseded credential", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(revokeGitHubAppToken("superseded-token")).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${GITHUB_API_URL.replace(/\/+$/, "")}/installation/token`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer superseded-token",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "error",
        signal: expect.any(AbortSignal),
      },
    );
  });

  test("treats HTTP 401 as already revoked and leaves other revocation failures to the caller", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockRejectedValueOnce(new Error("request with superseded-token failed"));

    await expect(revokeGitHubAppToken("superseded-token")).resolves.toBe(true);
    await expect(revokeGitHubAppToken("superseded-token")).resolves.toBe(false);
    await expect(revokeGitHubAppToken("superseded-token")).resolves.toBe(false);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(warningSpy).not.toHaveBeenCalled();
  });
});
