#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  prependSettingsArgToClaudeArgs,
  setupClaudeCodeSettings,
} from "../src/setup-claude-code-settings";
import { tmpdir } from "os";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { dirname, join } from "path";

const testHomeDir = join(
  tmpdir(),
  "claude-code-test-home",
  Date.now().toString(),
);
const sharedHomeSettingsPath = join(testHomeDir, ".claude", "settings.json");
const testSettingsDir = join(testHomeDir, ".claude-test");
const testSettingsPath = join(testSettingsDir, "test-settings.json");

let originalClaudeConfigDir: string | undefined;
let originalRunnerTemp: string | undefined;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("prependSettingsArgToClaudeArgs", () => {
  test("should create a settings arg when no claude args are provided", () => {
    expect(
      prependSettingsArgToClaudeArgs(undefined, "/tmp/settings.json"),
    ).toBe('--settings "/tmp/settings.json"');
  });

  test("should prepend settings before existing claude args", () => {
    expect(
      prependSettingsArgToClaudeArgs(
        '--model "claude-sonnet-4-20250514"',
        "/tmp/settings path/settings.json",
      ),
    ).toBe(
      '--settings "/tmp/settings path/settings.json"\n--model "claude-sonnet-4-20250514"',
    );
  });
});

describe("setupClaudeCodeSettings", () => {
  beforeEach(async () => {
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    originalRunnerTemp = process.env.RUNNER_TEMP;
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.RUNNER_TEMP;

    await mkdir(testHomeDir, { recursive: true });
    await mkdir(testSettingsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testHomeDir, { recursive: true, force: true });
    restoreEnv("CLAUDE_CONFIG_DIR", originalClaudeConfigDir);
    restoreEnv("RUNNER_TEMP", originalRunnerTemp);
  });

  test("should always set enableAllProjectMcpServers to true when no input", async () => {
    const settingsPath = await setupClaudeCodeSettings(undefined, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settingsPath).not.toBe(sharedHomeSettingsPath);
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(dirname(settingsPath));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should write settings from JSON string input to session settings", async () => {
    const inputSettings = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      env: { API_KEY: "test-key" },
    });

    const settingsPath = await setupClaudeCodeSettings(
      inputSettings,
      testHomeDir,
    );

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settingsPath).not.toBe(sharedHomeSettingsPath);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.model).toBe("claude-sonnet-4-20250514");
    expect(settings.env).toEqual({ API_KEY: "test-key" });
  });

  test("should write settings from file path input to session settings", async () => {
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

    const settingsPath = await setupClaudeCodeSettings(
      testSettingsPath,
      testHomeDir,
    );

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settingsPath).not.toBe(sharedHomeSettingsPath);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.hooks).toEqual(testSettings.hooks);
    expect(settings.permissions).toEqual(testSettings.permissions);
  });

  test("should override enableAllProjectMcpServers even if false in input", async () => {
    const inputSettings = JSON.stringify({
      enableAllProjectMcpServers: false,
      model: "test-model",
    });

    const settingsPath = await setupClaudeCodeSettings(
      inputSettings,
      testHomeDir,
    );

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.model).toBe("test-model");
  });

  test("should throw error for invalid JSON string", async () => {
    await expect(
      setupClaudeCodeSettings("{ invalid json", testHomeDir),
    ).rejects.toThrow();
  });

  test("should throw error for non-existent file path", async () => {
    await expect(
      setupClaudeCodeSettings("/non/existent/file.json", testHomeDir),
    ).rejects.toThrow();
  });

  test("should handle empty string input", async () => {
    const settingsPath = await setupClaudeCodeSettings("", testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should handle whitespace-only input", async () => {
    const settingsPath = await setupClaudeCodeSettings(
      "   \n\t  ",
      testHomeDir,
    );

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should merge with existing session settings", async () => {
    const firstSettingsPath = await setupClaudeCodeSettings(
      JSON.stringify({ existingKey: "existingValue" }),
      testHomeDir,
    );

    const secondSettingsPath = await setupClaudeCodeSettings(
      JSON.stringify({
        newKey: "newValue",
        model: "claude-opus-4-1-20250805",
      }),
      testHomeDir,
    );

    const settingsContent = await readFile(secondSettingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(secondSettingsPath).toBe(firstSettingsPath);
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.existingKey).toBe("existingValue");
    expect(settings.newKey).toBe("newValue");
    expect(settings.model).toBe("claude-opus-4-1-20250805");
  });

  test("should not merge settings input into shared home settings", async () => {
    const sharedSettings = {
      permissions: { deny: ["Write"] },
      sharedKey: "shared-value",
    };
    await mkdir(dirname(sharedHomeSettingsPath), { recursive: true });
    await writeFile(
      sharedHomeSettingsPath,
      JSON.stringify(sharedSettings, null, 2),
    );

    const settingsPath = await setupClaudeCodeSettings(
      JSON.stringify({ permissions: { allow: ["Read"] } }),
      testHomeDir,
    );

    const sharedSettingsContent = await readFile(
      sharedHomeSettingsPath,
      "utf-8",
    );
    const sessionSettingsContent = await readFile(settingsPath, "utf-8");
    const sessionSettings = JSON.parse(sessionSettingsContent);

    expect(settingsPath).not.toBe(sharedHomeSettingsPath);
    expect(JSON.parse(sharedSettingsContent)).toEqual(sharedSettings);
    expect(sessionSettings.permissions).toEqual({ allow: ["Read"] });
    expect(sessionSettings.sharedKey).toBeUndefined();
    expect(sessionSettings.enableAllProjectMcpServers).toBe(true);
  });

  test("should honor CLAUDE_CONFIG_DIR when provided", async () => {
    const configDir = join(testHomeDir, "custom-claude-config");
    process.env.CLAUDE_CONFIG_DIR = configDir;

    const settingsPath = await setupClaudeCodeSettings(
      JSON.stringify({ model: "test-model" }),
      testHomeDir,
    );

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settingsPath).toBe(join(configDir, "settings.json"));
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(configDir);
    expect(settings.model).toBe("test-model");
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });
});
