#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isWorkloadIdentityConfigured,
  setupWorkloadIdentity,
} from "../src/auth/workload-identity";

describe("workload identity federation", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;
  let getIDTokenSpy: ReturnType<typeof spyOn>;
  let warningSpy: ReturnType<typeof spyOn>;
  let setSecretSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), "wif-test-"));
    process.env.RUNNER_TEMP = tempDir;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_FEDERATION_RULE_ID;
    delete process.env.ANTHROPIC_ORGANIZATION_ID;
    delete process.env.ANTHROPIC_OIDC_AUDIENCE;
    delete process.env.ANTHROPIC_IDENTITY_TOKEN_FILE;

    getIDTokenSpy = spyOn(core, "getIDToken").mockResolvedValue(
      "test-identity-token",
    );
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
    setSecretSpy = spyOn(core, "setSecret").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    getIDTokenSpy.mockRestore();
    warningSpy.mockRestore();
    setSecretSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("isWorkloadIdentityConfigured", () => {
    test("returns false when no federation variables are set", () => {
      expect(isWorkloadIdentityConfigured()).toBe(false);
    });

    test("returns false when only one federation variable is set", () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      expect(isWorkloadIdentityConfigured()).toBe(false);
    });

    test("returns true when rule ID and organization ID are set", () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      expect(isWorkloadIdentityConfigured()).toBe(true);
    });
  });

  describe("setupWorkloadIdentity", () => {
    test("returns undefined when federation is not configured", async () => {
      const handle = await setupWorkloadIdentity();
      expect(handle).toBeUndefined();
      expect(getIDTokenSpy).not.toHaveBeenCalled();
    });

    test("returns undefined and warns when an API key is also set", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";

      const handle = await setupWorkloadIdentity();
      expect(handle).toBeUndefined();
      expect(warningSpy).toHaveBeenCalled();
      expect(getIDTokenSpy).not.toHaveBeenCalled();
      expect(process.env.ANTHROPIC_IDENTITY_TOKEN_FILE).toBeUndefined();
    });

    test("writes the identity token file and exports its path", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";

      const handle = await setupWorkloadIdentity();
      try {
        expect(handle).toBeDefined();
        expect(handle!.tokenFile).toBe(
          join(tempDir, "claude-workload-identity", "identity-token"),
        );
        expect(process.env.ANTHROPIC_IDENTITY_TOKEN_FILE).toBe(
          handle!.tokenFile,
        );
        expect(existsSync(handle!.tokenFile)).toBe(true);
        expect(readFileSync(handle!.tokenFile, "utf-8")).toBe(
          "test-identity-token",
        );
        expect(statSync(handle!.tokenFile).mode & 0o777).toBe(0o600);
        expect(setSecretSpy).toHaveBeenCalledWith("test-identity-token");
        // Default audience scopes the JWT to the Claude API token exchange
        expect(getIDTokenSpy).toHaveBeenCalledWith("https://api.anthropic.com");
      } finally {
        handle?.stop();
      }
    });

    test("requests the configured audience", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      process.env.ANTHROPIC_OIDC_AUDIENCE = "https://example.com/custom";

      const handle = await setupWorkloadIdentity();
      try {
        expect(getIDTokenSpy).toHaveBeenCalledWith(
          "https://example.com/custom",
        );
      } finally {
        handle?.stop();
      }
    });
  });
});
