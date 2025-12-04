#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { parseSdkOptions } from "../src/parse-sdk-options";
import type { ClaudeOptions } from "../src/run-claude";

describe("parseSdkOptions", () => {
  describe("allowedTools merging", () => {
    test("should extract allowedTools from claudeArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowedTools "Edit,Read,Write"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual(["Edit", "Read", "Write"]);
      expect(result.sdkOptions.extraArgs?.["allowedTools"]).toBeUndefined();
    });

    test("should extract allowedTools from claudeArgs with MCP tools", () => {
      const options: ClaudeOptions = {
        claudeArgs:
          '--allowedTools "Edit,Read,mcp__github_comment__update_claude_comment"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Edit",
        "Read",
        "mcp__github_comment__update_claude_comment",
      ]);
    });

    test("should accumulate multiple --allowedTools flags from claudeArgs", () => {
      // This simulates tag mode adding its tools, then user adding their own
      const options: ClaudeOptions = {
        claudeArgs:
          '--allowedTools "Edit,Read,mcp__github_comment__update_claude_comment" --model "claude-3" --allowedTools "Bash(npm install),mcp__github__get_issue"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Edit",
        "Read",
        "mcp__github_comment__update_claude_comment",
        "Bash(npm install)",
        "mcp__github__get_issue",
      ]);
    });

    test("should merge allowedTools from both claudeArgs and direct options", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowedTools "Edit,Read"',
        allowedTools: "Write,Glob",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Edit",
        "Read",
        "Write",
        "Glob",
      ]);
    });

    test("should deduplicate allowedTools when merging", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowedTools "Edit,Read"',
        allowedTools: "Edit,Write",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual(["Edit", "Read", "Write"]);
    });

    test("should use only direct options when claudeArgs has no allowedTools", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--model "claude-3-5-sonnet"',
        allowedTools: "Edit,Read",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual(["Edit", "Read"]);
    });

    test("should return undefined allowedTools when neither source has it", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--model "claude-3-5-sonnet"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toBeUndefined();
    });

    test("should remove allowedTools from extraArgs after extraction", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowedTools "Edit,Read" --model "claude-3-5-sonnet"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["allowedTools"]).toBeUndefined();
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-3-5-sonnet");
    });
  });

  describe("disallowedTools merging", () => {
    test("should extract disallowedTools from claudeArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--disallowedTools "Bash,Write"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.disallowedTools).toEqual(["Bash", "Write"]);
      expect(result.sdkOptions.extraArgs?.["disallowedTools"]).toBeUndefined();
    });

    test("should merge disallowedTools from both sources", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--disallowedTools "Bash"',
        disallowedTools: "Write",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.disallowedTools).toEqual(["Bash", "Write"]);
    });
  });

  describe("other extraArgs passthrough", () => {
    test("should pass through mcp-config in extraArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{}}' --allowedTools "Edit"`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBe(
        '{"mcpServers":{}}',
      );
    });

    test("should pass through json-schema in extraArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--json-schema '{"type":"object"}'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["json-schema"]).toBe(
        '{"type":"object"}',
      );
      expect(result.hasJsonSchema).toBe(true);
    });
  });
});
