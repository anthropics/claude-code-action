#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClaudeCodeSettings } from "../src/setup-claude-code-settings";
import { tmpdir } from "os";
import { mkdir, writeFile, readFile, rm, readdir } from "fs/promises";
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
      model: "claude-opus-4-20250514",
    });

    await setupClaudeCodeSettings(newSettings, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);

    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.existingKey).toBe("existingValue");
    expect(settings.newKey).toBe("newValue");
    expect(settings.model).toBe("claude-opus-4-20250514");
  });

  test("should copy slash commands to .claude directory when path provided", async () => {
    const testSlashCommandsDir = join(testHomeDir, "test-slash-commands");
    await mkdir(testSlashCommandsDir, { recursive: true });
    await writeFile(
      join(testSlashCommandsDir, "test-command.md"),
      "---\ndescription: Test command\n---\nTest content",
    );

    await setupClaudeCodeSettings(undefined, testHomeDir, testSlashCommandsDir);

    const testCommandPath = join(testHomeDir, ".claude", "test-command.md");
    const content = await readFile(testCommandPath, "utf-8");
    expect(content).toContain("Test content");
  });

  test("should skip slash commands when no directory provided", async () => {
    await setupClaudeCodeSettings(undefined, testHomeDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("should handle missing slash commands directory gracefully", async () => {
    const nonExistentDir = join(testHomeDir, "non-existent");

    await setupClaudeCodeSettings(undefined, testHomeDir, nonExistentDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    expect(JSON.parse(settingsContent).enableAllProjectMcpServers).toBe(true);
  });

  test("should skip non-.md files in slash commands directory", async () => {
    const testSlashCommandsDir = join(testHomeDir, "test-slash-commands");
    await mkdir(testSlashCommandsDir, { recursive: true });
    await writeFile(join(testSlashCommandsDir, "not-markdown.txt"), "ignored");
    await writeFile(join(testSlashCommandsDir, "valid.md"), "copied");
    await writeFile(join(testSlashCommandsDir, "another.md"), "also copied");

    await setupClaudeCodeSettings(undefined, testHomeDir, testSlashCommandsDir);

    const copiedFiles = await readdir(join(testHomeDir, ".claude"));
    expect(copiedFiles).toContain("valid.md");
    expect(copiedFiles).toContain("another.md");
    expect(copiedFiles).not.toContain("not-markdown.txt");
    expect(copiedFiles).toContain("settings.json"); // Settings should also exist
  });

  test("should handle slash commands path that is a file not directory", async () => {
    const testFile = join(testHomeDir, "not-a-directory.txt");
    await writeFile(testFile, "This is a file, not a directory");

    await setupClaudeCodeSettings(undefined, testHomeDir, testFile);

    const settingsContent = await readFile(settingsPath, "utf-8");
    expect(JSON.parse(settingsContent).enableAllProjectMcpServers).toBe(true);
  });

  test("should handle empty slash commands directory", async () => {
    const emptyDir = join(testHomeDir, "empty-slash-commands");
    await mkdir(emptyDir, { recursive: true });

    await setupClaudeCodeSettings(undefined, testHomeDir, emptyDir);

    const settingsContent = await readFile(settingsPath, "utf-8");
    expect(JSON.parse(settingsContent).enableAllProjectMcpServers).toBe(true);
  });
});
