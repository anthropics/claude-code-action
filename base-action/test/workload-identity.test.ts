#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as core from "@actions/core";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isWorkloadIdentityConfigured,
  setupWorkloadIdentity,
} from "../src/workload-identity";

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
    delete process.env.ANTHROPIC_SERVICE_ACCOUNT_ID;
    delete process.env.ANTHROPIC_WORKSPACE_ID;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_SCOPE;
    delete process.env.ANTHROPIC_CONFIG_DIR;
    delete process.env.ANTHROPIC_PROFILE;

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

    test("writes a minimal federation profile and selects it", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      process.env.ANTHROPIC_SERVICE_ACCOUNT_ID = "svac_test";
      process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_test";

      const handle = await setupWorkloadIdentity();
      try {
        const configDir = process.env.ANTHROPIC_CONFIG_DIR;
        expect(configDir).toBeDefined();
        expect(
          configDir!.startsWith(
            join(tempDir, "claude-workload-identity", "config-"),
          ),
        ).toBe(true);
        expect(process.env.ANTHROPIC_PROFILE).toBe("default");

        const profilePath = join(configDir!, "configs", "default.json");
        expect(statSync(profilePath).mode & 0o777).toBe(0o600);
        // Minimal on purpose: the SDK gap-fills the federation fields from
        // the ANTHROPIC_* env vars the action exports.
        expect(JSON.parse(readFileSync(profilePath, "utf-8"))).toEqual({
          version: "1.0",
          authentication: { type: "oidc_federation" },
        });
      } finally {
        handle?.stop();
      }
    });

    test("derives the config dir from the federation inputs", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_a";

      (await setupWorkloadIdentity())?.stop();
      const firstConfigDir = process.env.ANTHROPIC_CONFIG_DIR;
      expect(firstConfigDir).toBeDefined();

      // A later step in the same job with a different workspace must not
      // share the first step's credentials cache.
      delete process.env.ANTHROPIC_CONFIG_DIR;
      delete process.env.ANTHROPIC_PROFILE;
      process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_b";

      (await setupWorkloadIdentity())?.stop();
      const secondConfigDir = process.env.ANTHROPIC_CONFIG_DIR;
      expect(secondConfigDir).toBeDefined();
      expect(secondConfigDir).not.toBe(firstConfigDir);

      // Same inputs land in the same dir, so an unchanged config can still
      // reuse a cached token.
      delete process.env.ANTHROPIC_CONFIG_DIR;
      delete process.env.ANTHROPIC_PROFILE;

      (await setupWorkloadIdentity())?.stop();
      expect(process.env.ANTHROPIC_CONFIG_DIR).toBe(secondConfigDir!);
    });

    test("does not overwrite an operator-set ANTHROPIC_PROFILE", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      process.env.ANTHROPIC_PROFILE = "operator";

      const handle = await setupWorkloadIdentity();
      try {
        expect(process.env.ANTHROPIC_PROFILE).toBe("operator");
        expect(process.env.ANTHROPIC_CONFIG_DIR).toBeUndefined();
        expect(warningSpy).toHaveBeenCalled();

        const entries = readdirSync(join(tempDir, "claude-workload-identity"));
        expect(entries.filter((e) => e.startsWith("config-"))).toEqual([]);

        // The identity token file is still provisioned for the operator's
        // profile (or the env-var fallback) to consume.
        expect(process.env.ANTHROPIC_IDENTITY_TOKEN_FILE).toBe(
          handle!.tokenFile,
        );
      } finally {
        handle?.stop();
      }
    });

    test("does not overwrite an operator-set ANTHROPIC_CONFIG_DIR", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";
      const operatorConfigDir = join(tempDir, "operator-config");
      process.env.ANTHROPIC_CONFIG_DIR = operatorConfigDir;

      const handle = await setupWorkloadIdentity();
      try {
        expect(process.env.ANTHROPIC_CONFIG_DIR).toBe(operatorConfigDir);
        expect(process.env.ANTHROPIC_PROFILE).toBeUndefined();
        expect(warningSpy).toHaveBeenCalled();
      } finally {
        handle?.stop();
      }
    });

    test("stop removes the identity token and credential cache", async () => {
      process.env.ANTHROPIC_FEDERATION_RULE_ID = "fdrl_test";
      process.env.ANTHROPIC_ORGANIZATION_ID =
        "00000000-0000-0000-0000-000000000000";

      const handle = await setupWorkloadIdentity();
      const tokenDir = join(tempDir, "claude-workload-identity");
      expect(existsSync(handle!.tokenFile)).toBe(true);
      expect(existsSync(process.env.ANTHROPIC_CONFIG_DIR!)).toBe(true);

      handle!.stop();

      expect(existsSync(tokenDir)).toBe(false);
    });
  });
});
