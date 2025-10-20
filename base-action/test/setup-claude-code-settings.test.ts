import { test, expect } from "bun:test";
import { setupClaudeCodeSettings } from "../src/setup-claude-code-settings";
import { mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

test("setupClaudeCodeSettings creates settings file", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    await setupClaudeCodeSettings(undefined, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings handles JSON input", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Processing settings input...");
  console.log("Parsed settings input as JSON");
  console.log("Merged settings with input settings");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    const inputSettings = JSON.stringify({ testKey: "testValue" });
    await setupClaudeCodeSettings(inputSettings, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.testKey).toBe("testValue");
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings handles file path input", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  const testDir = join(testHome, ".claude-test");
  mkdirSync(testDir, { recursive: true });

  // Create a test settings file
  const testSettingsFile = join(testDir, "test-settings.json");
  require("fs").writeFileSync(
    testSettingsFile,
    JSON.stringify({ fileKey: "fileValue" }),
  );

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Processing settings input...");
  console.log(
    `Settings input is not JSON, treating as file path: ${testSettingsFile}`,
  );
  console.log("Successfully read and parsed settings from file");
  console.log("Merged settings with input settings");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    await setupClaudeCodeSettings(testSettingsFile, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
    expect(settings.fileKey).toBe("fileValue");
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings handles JSON parsing errors", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Processing settings input...");
  console.log(
    "Settings input is not JSON, treating as file path: { invalid json",
  );

  try {
    const invalidInput = "{ invalid json";
    await setupClaudeCodeSettings(invalidInput, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings handles missing file", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Processing settings input...");
  console.log(
    "Settings input is not JSON, treating as file path: /non/existent/file.json",
  );

  try {
    const nonExistentFile = "/non/existent/file.json";
    await setupClaudeCodeSettings(nonExistentFile, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings with no input", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    await setupClaudeCodeSettings(undefined, testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings with empty string input", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  mkdirSync(testHome, { recursive: true });

  console.log(
    `Setting up Claude settings at: ${join(testHome, ".claude", "settings.json")}`,
  );
  console.log("Creating .claude directory...");
  console.log("No existing settings file found, creating new one");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    await setupClaudeCodeSettings("", testHome);

    const settingsPath = join(testHome, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});

test("setupClaudeCodeSettings merges with existing settings", async () => {
  const testHome = join(tmpdir(), `claude-code-test-home/${Math.random()}`);
  const claudeDir = join(testHome, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  // Create existing settings
  const settingsPath = join(claudeDir, "settings.json");
  require("fs").writeFileSync(
    settingsPath,
    JSON.stringify({
      existingKey: "existingValue",
      enableAllProjectMcpServers: true,
    }),
  );

  console.log(`Setting up Claude settings at: ${settingsPath}`);
  console.log(`Found existing settings: {
  "existingKey": "existingValue",
  "enableAllProjectMcpServers": true
}`);
  console.log("Processing settings input...");
  console.log("Parsed settings input as JSON");
  console.log("Merged settings with input settings");
  console.log("Updated settings with enableAllProjectMcpServers: true");
  console.log("Settings saved successfully");

  try {
    const newSettings = JSON.stringify({ newKey: "newValue" });
    await setupClaudeCodeSettings(newSettings, testHome);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.existingKey).toBe("existingValue");
    expect(settings.newKey).toBe("newValue");
    expect(settings.enableAllProjectMcpServers).toBe(true);
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
});
