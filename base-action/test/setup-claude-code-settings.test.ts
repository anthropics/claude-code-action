#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setupClaudeCodeSettings,
  resolveEnableAllProjectMcpServers,
} from "../src/setup-claude-code-settings";
import { tmpdir } from "os";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";

const testHomeDir = join(
  tmpdir(),
  "claude-code-test-home",
  Date.now().toString(),
);
const settingsPath = join(testHomeDir, ".claude", "settings.json");
const testSettingsDir = join(testHomeDir, ".claude-test");
const testSettingsPath = join(testSettingsDir, "test-settings.json");

describe("setupClaudeCodeSettings", () => {
  beforeEach(async () => {
    // Create test home directory and test settings directory
    await mkdir(testHomeDir, { recursive: true });
    await mkdir(testSettingsDir, { recursive: true });
    delete process.env.GITHUB_EVENT_NAME;
  });

  afterEach(async () => {
    // Clean up test home directory
    await rm(testHomeDir, { recursive: true, force: true });
    delete process.env.GITHUB_EVENT_NAME;
  });

  test("should default enableAllProjectMcpServers to true when no input and event is not pull_request_target/workflow_run", async () => {
    process.env.GITHUB_EVENT_NAME = "push";
    await setupClaudeCodeSettings(undefined, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should default enableAllProjectMcpServers to false under pull_request_target", async () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    await setupClaudeCodeSettings(undefined, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
  });

  test("should set enableAllProjectMcpServers to true when explicitly opted in", async () => {
    await setupClaudeCodeSettings(undefined, testHomeDir, true);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should merge settings from JSON string input", async () => {
    const inputSettings = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      env: { API_KEY: "test-key" },
    });

    await setupClaudeCodeSettings(inputSettings, testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
    expect(settings.model).toBe("claude-sonnet-4-20250514");
    expect(settings.env).toEqual({ API_KEY: "test-key" });
  });

  test("should merge settings from file path input", async () => {
    const testSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo test" }],
          },
        ],
      },
      permissions: {
        allow: ["Bash", "Read"],
      },
    };

    await writeFile(testSettingsPath, JSON.stringify(testSettings, null, 2));

    await setupClaudeCodeSettings(testSettingsPath, testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
    expect(settings.hooks).toEqual(testSettings.hooks);
    expect(settings.permissions).toEqual(testSettings.permissions);
  });

  test("should override enableAllProjectMcpServers from settings input with action input", async () => {
    const inputSettings = JSON.stringify({
      enableAllProjectMcpServers: true,
      model: "test-model",
    });

    await setupClaudeCodeSettings(inputSettings, testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
    expect(settings.model).toBe("test-model");
  });

  test("should throw error for invalid JSON string", async () => {
    expect(() =>
      setupClaudeCodeSettings("{ invalid json", testHomeDir),
    ).toThrow();
  });

  test("should throw error for non-existent file path", async () => {
    expect(() =>
      setupClaudeCodeSettings("/non/existent/file.json", testHomeDir),
    ).toThrow();
  });

  test("should handle empty string input", async () => {
    await setupClaudeCodeSettings("", testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
  });

  test("should handle whitespace-only input", async () => {
    await setupClaudeCodeSettings("   \n\t  ", testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
  });

  test("should merge with existing settings", async () => {
    // First, create some existing settings
    await setupClaudeCodeSettings(
      JSON.stringify({ existingKey: "existingValue" }),
      testHomeDir,
    );

    // Then, add new settings
    const newSettings = JSON.stringify({
      newKey: "newValue",
      model: "claude-opus-4-1-20250805",
    });

    await setupClaudeCodeSettings(newSettings, testHomeDir, false);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(false);
    expect(settings.existingKey).toBe("existingValue");
    expect(settings.newKey).toBe("newValue");
    expect(settings.model).toBe("claude-opus-4-1-20250805");
  });
});

describe("resolveEnableAllProjectMcpServers (base-action)", () => {
  afterEach(() => {
    delete process.env.GITHUB_EVENT_NAME;
  });

  test("explicit 'true' overrides event gating", () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    expect(resolveEnableAllProjectMcpServers("true")).toBe(true);
  });

  test("explicit 'false' overrides event gating", () => {
    process.env.GITHUB_EVENT_NAME = "push";
    expect(resolveEnableAllProjectMcpServers("false")).toBe(false);
  });

  test("unset → true for ordinary events", () => {
    for (const e of ["push", "pull_request", "schedule", "workflow_dispatch"]) {
      process.env.GITHUB_EVENT_NAME = e;
      expect(resolveEnableAllProjectMcpServers("")).toBe(true);
      expect(resolveEnableAllProjectMcpServers(undefined)).toBe(true);
    }
  });

  test("unset → false under pull_request_target", () => {
    process.env.GITHUB_EVENT_NAME = "pull_request_target";
    expect(resolveEnableAllProjectMcpServers("")).toBe(false);
    expect(resolveEnableAllProjectMcpServers(undefined)).toBe(false);
  });

  test("unset → false under workflow_run", () => {
    process.env.GITHUB_EVENT_NAME = "workflow_run";
    expect(resolveEnableAllProjectMcpServers("")).toBe(false);
    expect(resolveEnableAllProjectMcpServers(undefined)).toBe(false);
  });
});
