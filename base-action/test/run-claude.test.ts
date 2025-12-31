#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { prepareRunConfig, type ClaudeOptions } from "../src/run-claude";

describe("prepareRunConfig", () => {
  test("should prepare config with basic arguments", () => {
    const options: ClaudeOptions = {};
    const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

    expect(prepared.claudeArgs).toEqual([
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
    ]);
  });

  test("should include promptPath", () => {
    const options: ClaudeOptions = {};
    const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

    expect(prepared.promptPath).toBe("/tmp/test-prompt.txt");
  });

  test("should use provided prompt path", () => {
    const options: ClaudeOptions = {};
    const prepared = prepareRunConfig("/custom/prompt/path.txt", options);

    expect(prepared.promptPath).toBe("/custom/prompt/path.txt");
  });

  describe("claudeArgs handling", () => {
    test("should parse and include custom claude arguments", () => {
      const options: ClaudeOptions = {
        claudeArgs: "--max-turns 10 --model claude-3-opus-20240229",
      };
      const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

      expect(prepared.claudeArgs).toEqual([
        "-p",
        "--max-turns",
        "10",
        "--model",
        "claude-3-opus-20240229",
        "--verbose",
        "--output-format",
        "stream-json",
      ]);
    });

    test("should handle empty claudeArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: "",
      };
      const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

      expect(prepared.claudeArgs).toEqual([
        "-p",
        "--verbose",
        "--output-format",
        "stream-json",
      ]);
    });

    test("should handle claudeArgs with quoted strings", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--system-prompt "You are a helpful assistant"',
      };
      const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

      expect(prepared.claudeArgs).toEqual([
        "-p",
        "--system-prompt",
        "You are a helpful assistant",
        "--verbose",
        "--output-format",
        "stream-json",
      ]);
    });

    test("should include json-schema flag when provided", () => {
      const options: ClaudeOptions = {
        claudeArgs:
          '--json-schema \'{"type":"object","properties":{"result":{"type":"boolean"}}}\'',
      };

      const prepared = prepareRunConfig("/tmp/test-prompt.txt", options);

      expect(prepared.claudeArgs).toContain("--json-schema");
      expect(prepared.claudeArgs).toContain(
        '{"type":"object","properties":{"result":{"type":"boolean"}}}',
      );
    });
  });
});
