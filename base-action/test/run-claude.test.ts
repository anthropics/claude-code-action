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

  describe("timeoutMinutes validation", () => {
    test("should accept valid timeoutMinutes value", () => {
      const options: ClaudeOptions = { timeoutMinutes: "15" };
      expect(() =>
        prepareRunConfig("/tmp/test-prompt.txt", options),
      ).not.toThrow();
    });

    test("should throw error for non-numeric timeoutMinutes", () => {
      const options: ClaudeOptions = { timeoutMinutes: "abc" };
      expect(() => prepareRunConfig("/tmp/test-prompt.txt", options)).toThrow(
        "timeoutMinutes must be a positive number, got: abc",
      );
    });

    test("should throw error for negative timeoutMinutes", () => {
      const options: ClaudeOptions = { timeoutMinutes: "-5" };
      expect(() => prepareRunConfig("/tmp/test-prompt.txt", options)).toThrow(
        "timeoutMinutes must be a positive number, got: -5",
      );
    });

    test("should throw error for zero timeoutMinutes", () => {
      const options: ClaudeOptions = { timeoutMinutes: "0" };
      expect(() => prepareRunConfig("/tmp/test-prompt.txt", options)).toThrow(
        "timeoutMinutes must be a positive number, got: 0",
      );
    });
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
  });
});
