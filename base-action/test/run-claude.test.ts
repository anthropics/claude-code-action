#!/usr/bin/env bun

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import {
  runClaude,
  type ClaudeOptions,
  parseCustomEnvVars,
  parseTools,
  parseMcpConfig,
} from "../src/run-claude";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

// Since we can't easily mock the SDK, let's focus on testing input validation
// and error cases that happen before the SDK is called

describe("runClaude input validation", () => {
  const testPromptPath = join(
    process.env.RUNNER_TEMP || "/tmp",
    "test-prompt-claude.txt",
  );

  // Create a test prompt file before tests
  beforeAll(async () => {
    await writeFile(testPromptPath, "Test prompt content");
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      await unlink(testPromptPath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  describe("maxTurns validation", () => {
    test("should throw error for non-numeric maxTurns", async () => {
      const options: ClaudeOptions = { maxTurns: "abc" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "maxTurns must be a positive number, got: abc",
      );
    });

    test("should throw error for negative maxTurns", async () => {
      const options: ClaudeOptions = { maxTurns: "-1" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "maxTurns must be a positive number, got: -1",
      );
    });

    test("should throw error for zero maxTurns", async () => {
      const options: ClaudeOptions = { maxTurns: "0" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "maxTurns must be a positive number, got: 0",
      );
    });
  });

  describe("timeoutMinutes validation", () => {
    test("should throw error for non-numeric timeoutMinutes", async () => {
      const options: ClaudeOptions = { timeoutMinutes: "abc" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "timeoutMinutes must be a positive number, got: abc",
      );
    });

    test("should throw error for negative timeoutMinutes", async () => {
      const options: ClaudeOptions = { timeoutMinutes: "-5" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "timeoutMinutes must be a positive number, got: -5",
      );
    });

    test("should throw error for zero timeoutMinutes", async () => {
      const options: ClaudeOptions = { timeoutMinutes: "0" };
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "timeoutMinutes must be a positive number, got: 0",
      );
    });
  });

  describe("environment variable validation from INPUT_TIMEOUT_MINUTES", () => {
    const originalEnv = process.env.INPUT_TIMEOUT_MINUTES;

    afterEach(() => {
      // Restore original value
      if (originalEnv !== undefined) {
        process.env.INPUT_TIMEOUT_MINUTES = originalEnv;
      } else {
        delete process.env.INPUT_TIMEOUT_MINUTES;
      }
    });

    test("should throw error for invalid INPUT_TIMEOUT_MINUTES", async () => {
      process.env.INPUT_TIMEOUT_MINUTES = "invalid";
      const options: ClaudeOptions = {};
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "INPUT_TIMEOUT_MINUTES must be a positive number, got: invalid",
      );
    });

    test("should throw error for zero INPUT_TIMEOUT_MINUTES", async () => {
      process.env.INPUT_TIMEOUT_MINUTES = "0";
      const options: ClaudeOptions = {};
      await expect(runClaude(testPromptPath, options)).rejects.toThrow(
        "INPUT_TIMEOUT_MINUTES must be a positive number, got: 0",
      );
    });
  });

  // Note: We can't easily test the full execution flow without either:
  // 1. Mocking the SDK (which seems difficult with Bun's current mocking capabilities)
  // 2. Having a valid API key and actually calling the API (not suitable for unit tests)
  // 3. Refactoring the code to be more testable (e.g., dependency injection)

  // For now, we're testing what we can: input validation that happens before the SDK call
});

describe("parseCustomEnvVars", () => {
  test("should parse empty string correctly", () => {
    expect(parseCustomEnvVars("")).toEqual({});
  });

  test("should parse single environment variable", () => {
    expect(parseCustomEnvVars("API_KEY: secret123")).toEqual({
      API_KEY: "secret123",
    });
  });

  test("should parse multiple environment variables", () => {
    const input = "API_KEY: secret123\nDEBUG: true\nUSER: testuser";
    expect(parseCustomEnvVars(input)).toEqual({
      API_KEY: "secret123",
      DEBUG: "true",
      USER: "testuser",
    });
  });

  test("should handle environment variables with spaces around values", () => {
    const input = "API_KEY:  secret123  \n  DEBUG  :  true  ";
    expect(parseCustomEnvVars(input)).toEqual({
      API_KEY: "secret123",
      DEBUG: "true",
    });
  });

  test("should skip empty lines and comments", () => {
    const input =
      "API_KEY: secret123\n\n# This is a comment\nDEBUG: true\n# Another comment";
    expect(parseCustomEnvVars(input)).toEqual({
      API_KEY: "secret123",
      DEBUG: "true",
    });
  });

  test("should skip lines without colons", () => {
    const input = "API_KEY: secret123\nINVALID_LINE\nDEBUG: true";
    expect(parseCustomEnvVars(input)).toEqual({
      API_KEY: "secret123",
      DEBUG: "true",
    });
  });

  test("should handle undefined input", () => {
    expect(parseCustomEnvVars(undefined)).toEqual({});
  });

  test("should handle whitespace-only input", () => {
    expect(parseCustomEnvVars("  \n  \t  ")).toEqual({});
  });
});

describe("parseTools", () => {
  test("should return undefined for empty string", () => {
    expect(parseTools("")).toBeUndefined();
  });

  test("should return undefined for whitespace-only string", () => {
    expect(parseTools("  \t  ")).toBeUndefined();
  });

  test("should return undefined for undefined input", () => {
    expect(parseTools(undefined)).toBeUndefined();
  });

  test("should parse single tool", () => {
    expect(parseTools("Bash")).toEqual(["Bash"]);
  });

  test("should parse multiple tools", () => {
    expect(parseTools("Bash,Read,Write")).toEqual(["Bash", "Read", "Write"]);
  });

  test("should trim whitespace around tools", () => {
    expect(parseTools(" Bash , Read , Write ")).toEqual([
      "Bash",
      "Read",
      "Write",
    ]);
  });

  test("should filter out empty tool names", () => {
    expect(parseTools("Bash,,Read,,,Write")).toEqual(["Bash", "Read", "Write"]);
  });
});

describe("parseMcpConfig", () => {
  test("should return undefined for empty string", () => {
    expect(parseMcpConfig("")).toBeUndefined();
  });

  test("should return undefined for whitespace-only string", () => {
    expect(parseMcpConfig("  \t  ")).toBeUndefined();
  });

  test("should return undefined for undefined input", () => {
    expect(parseMcpConfig(undefined)).toBeUndefined();
  });

  test("should parse valid JSON", () => {
    const config = { "test-server": { command: "test", args: ["--test"] } };
    expect(parseMcpConfig(JSON.stringify(config))).toEqual(config);
  });

  test("should return undefined for invalid JSON", () => {
    // Check console warning is logged
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);

    expect(parseMcpConfig("{ invalid json")).toBeUndefined();

    console.warn = originalWarn;
  });

  test("should parse complex MCP config", () => {
    const config = {
      "github-mcp": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "test-token",
        },
      },
      "filesystem-mcp": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      },
    };
    expect(parseMcpConfig(JSON.stringify(config))).toEqual(config);
  });
});
