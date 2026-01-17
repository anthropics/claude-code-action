#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import {
  prepareRunConfig,
  containsAuthenticationError,
  type ClaudeOptions,
} from "../src/run-claude";

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

describe("containsAuthenticationError", () => {
  test("should return true for 'authentication' keyword", () => {
    expect(containsAuthenticationError("authentication failed")).toBe(true);
    expect(containsAuthenticationError("Authentication error occurred")).toBe(
      true,
    );
    expect(containsAuthenticationError("AUTHENTICATION system is down")).toBe(
      true,
    );
  });

  test("should return true for 'invalid token' keyword", () => {
    expect(containsAuthenticationError("invalid token provided")).toBe(true);
    expect(containsAuthenticationError("Token is Invalid")).toBe(true);
  });

  test("should return true for 'expired' keyword", () => {
    expect(containsAuthenticationError("token expired")).toBe(true);
    expect(containsAuthenticationError("Your session has Expired")).toBe(true);
  });

  test("should return true for 'unauthorized' keyword", () => {
    expect(containsAuthenticationError("unauthorized access")).toBe(true);
    expect(containsAuthenticationError("401 Unauthorized")).toBe(true);
  });

  test("should return true for 'subscription' keyword", () => {
    expect(containsAuthenticationError("subscription has ended")).toBe(true);
    expect(containsAuthenticationError("Your Subscription expired")).toBe(true);
  });

  test("should return true for HTTP error codes", () => {
    expect(containsAuthenticationError("Error 401: Access denied")).toBe(true);
    expect(containsAuthenticationError("HTTP 403 Forbidden")).toBe(true);
  });

  test("should return false for non-auth related text", () => {
    expect(containsAuthenticationError("processing request")).toBe(false);
    expect(containsAuthenticationError("success")).toBe(false);
    expect(containsAuthenticationError("task completed")).toBe(false);
    expect(containsAuthenticationError("Error 500: Server error")).toBe(false);
  });

  test("should be case-insensitive", () => {
    expect(containsAuthenticationError("AUTHENTICATION FAILED")).toBe(true);
    expect(containsAuthenticationError("InVaLiD tOkEn")).toBe(true);
  });

  test("should detect multiple keywords in same text", () => {
    expect(
      containsAuthenticationError("authentication failed: token expired (401)"),
    ).toBe(true);
  });
});
