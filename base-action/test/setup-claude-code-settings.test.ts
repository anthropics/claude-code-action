#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClaudeCodeSettings } from "../src/setup-claude-code-settings";
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
  });

  afterEach(async () => {
    // Clean up test home directory
    await rm(testHomeDir, { recursive: true, force: true });
  });

  test("should always set enableAllProjectMcpServers to true when no input", async () => {
    await setupClaudeCodeSettings(undefined, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should merge settings from JSON string input", async () => {
    const inputSettings = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      env: { API_KEY: "test-key" },
    });

    await setupClaudeCodeSettings(inputSettings, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
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

    await setupClaudeCodeSettings(testSettingsPath, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.hooks).toEqual(testSettings.hooks);
    expect(settings.permissions).toEqual(testSettings.permissions);
  });

  test("should override enableAllProjectMcpServers even if false in input", async () => {
    const inputSettings = JSON.stringify({
      enableAllProjectMcpServers: false,
      model: "test-model",
    });

    await setupClaudeCodeSettings(inputSettings, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.model).toBe("test-model");
  });

  // JSON Syntax Error Tests
  test("should provide detailed error for JSON syntax error with trailing comma", async () => {
    const invalidJson = `{
  "model": "test-model",
  "permissions": {
    "allow": ["Bash", "Read",]
  }
}`;

    await expect(
      setupClaudeCodeSettings(invalidJson, testHomeDir),
    ).rejects.toThrow(/JSON syntax error.*input settings.*comma/);
  });

  test("should provide helpful error for missing quotes on property names", async () => {
    const invalidJson = `{
  model: "test-model",
  "permissions": {}
}`;

    await expect(
      setupClaudeCodeSettings(invalidJson, testHomeDir),
    ).rejects.toThrow(/JSON syntax error.*input settings/);
  });

  test("should provide helpful error for single quotes instead of double quotes", async () => {
    const invalidJson = `{
  'model': 'test-model'
}`;

    await expect(
      setupClaudeCodeSettings(invalidJson, testHomeDir),
    ).rejects.toThrow(/JSON syntax error.*input settings.*Single quotes/);
  });

  test("should provide detailed error for unclosed braces", async () => {
    const invalidJson = `{
  "model": "test-model",
  "permissions": {
    "allow": ["Bash"]

}`;

    await expect(
      setupClaudeCodeSettings(invalidJson, testHomeDir),
    ).rejects.toThrow(/JSON syntax error/);
  });

  // Schema Validation Error Tests
  test("should provide detailed error for invalid permissions type", async () => {
    const invalidSettings = JSON.stringify({
      permissions: {
        allow: "should be array", // wrong type
      },
    });

    await expect(
      setupClaudeCodeSettings(invalidSettings, testHomeDir),
    ).rejects.toThrow(/permissions\.allow.*Expected array/);
  });

  test("should provide detailed error for invalid hooks structure", async () => {
    const invalidSettings = JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            // missing hooks array
          },
        ],
      },
    });

    await expect(
      setupClaudeCodeSettings(invalidSettings, testHomeDir),
    ).rejects.toThrow(/hooks\.PreToolUse\.0\.hooks.*Required/);
  });

  test("should provide detailed error for empty tool names in permissions", async () => {
    const invalidSettings = JSON.stringify({
      permissions: {
        allow: ["Bash", "", "Read"], // empty string not allowed
      },
    });

    await expect(
      setupClaudeCodeSettings(invalidSettings, testHomeDir),
    ).rejects.toThrow(/permissions\.allow\.1.*Tool name cannot be empty/);
  });

  // File Path Error Tests
  test("should provide helpful error for non-existent file path", async () => {
    await expect(
      setupClaudeCodeSettings("/non/existent/file.json", testHomeDir),
    ).rejects.toThrow(
      /Settings input is neither valid JSON nor a readable file path/,
    );
  });

  test("should provide detailed error for file with JSON syntax error", async () => {
    const invalidJsonContent = `{
  "model": "test",
  "permissions": {
    "allow": ["Bash",] // trailing comma
  }
}`;

    await writeFile(testSettingsPath, invalidJsonContent);

    await expect(
      setupClaudeCodeSettings(testSettingsPath, testHomeDir),
    ).rejects.toThrow(/JSON syntax error.*test-settings\.json.*comma/);
  });

  test("should handle empty string input", async () => {
    await setupClaudeCodeSettings("", testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should handle whitespace-only input", async () => {
    await setupClaudeCodeSettings("   \n\t  ", testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
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

    await setupClaudeCodeSettings(newSettings, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.existingKey).toBe("existingValue");
    expect(settings.newKey).toBe("newValue");
    expect(settings.model).toBe("claude-opus-4-1-20250805");
  });

  // Backward Compatibility Tests
  test("should handle valid settings with unknown properties (passthrough)", async () => {
    const settingsWithUnknownProps = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      customProperty: "should be preserved",
      futureFeature: { nested: "object" },
    });

    await setupClaudeCodeSettings(settingsWithUnknownProps, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.model).toBe("claude-sonnet-4-20250514");
    expect(settings.customProperty).toBe("should be preserved");
    expect(settings.futureFeature).toEqual({ nested: "object" });
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should provide helpful error message with examples for common validation issues", async () => {
    const invalidSettings = JSON.stringify({
      permissions: {
        allow: "Bash", // should be array
      },
      env: ["should", "be", "object"], // should be object
    });

    let errorMessage = "";
    try {
      await setupClaudeCodeSettings(invalidSettings, testHomeDir);
    } catch (error) {
      errorMessage = (error as Error).message;
    }

    expect(errorMessage).toContain("permissions.allow");
    expect(errorMessage).toContain("Expected array");
    expect(errorMessage).toContain("env");
    expect(errorMessage).toContain("Examples of correct format");
  });

  // Complex Valid Settings Test
  test("should accept complex valid settings with all supported features", async () => {
    const complexValidSettings = JSON.stringify({
      model: "claude-opus-4-1-20250805",
      env: {
        DEBUG: "true",
        API_URL: "https://api.example.com",
        CUSTOM_VAR: "value",
      },
      permissions: {
        allow: ["Bash(git:*)", "Read", "Write", "Edit"],
        deny: ["WebFetch", "Bash(rm:*)", "Bash(sudo:*)"],
      },
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              { type: "command", command: "echo Starting bash command..." },
              { type: "log", command: "console.log('Pre-bash hook')" },
            ],
          },
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "echo Writing file..." }],
          },
        ],
      },
      includeCoAuthoredBy: true,
      customExtension: {
        experimental: true,
        features: ["feature1", "feature2"],
      },
    });

    await setupClaudeCodeSettings(complexValidSettings, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.model).toBe("claude-opus-4-1-20250805");
    expect(settings.env.DEBUG).toBe("true");
    expect(settings.permissions.allow).toHaveLength(4);
    expect(settings.permissions.deny).toHaveLength(3);
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].hooks).toHaveLength(2);
    expect(settings.includeCoAuthoredBy).toBe(true);
    expect(settings.customExtension).toEqual({
      experimental: true,
      features: ["feature1", "feature2"],
    });
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });
});
