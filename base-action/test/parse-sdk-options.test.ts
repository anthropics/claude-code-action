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

    test("should handle hyphenated --allowed-tools flag", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowed-tools "Edit,Read,Write"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual(["Edit", "Read", "Write"]);
      expect(result.sdkOptions.extraArgs?.["allowed-tools"]).toBeUndefined();
    });

    test("should accumulate multiple --allowed-tools flags (hyphenated)", () => {
      // This is the exact scenario from issue #746
      const options: ClaudeOptions = {
        claudeArgs:
          '--allowed-tools "Bash(git log:*)" "Bash(git diff:*)" "Bash(git fetch:*)" "Bash(gh pr:*)"',
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Bash(git log:*)",
        "Bash(git diff:*)",
        "Bash(git fetch:*)",
        "Bash(gh pr:*)",
      ]);
    });

    test("should handle mixed camelCase and hyphenated allowedTools flags", () => {
      const options: ClaudeOptions = {
        claudeArgs: '--allowedTools "Edit,Read" --allowed-tools "Write,Glob"',
      };

      const result = parseSdkOptions(options);

      // Both should be merged - note: order depends on which key is found first
      expect(result.sdkOptions.allowedTools).toContain("Edit");
      expect(result.sdkOptions.allowedTools).toContain("Read");
      expect(result.sdkOptions.allowedTools).toContain("Write");
      expect(result.sdkOptions.allowedTools).toContain("Glob");
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

  describe("mcp-config merging", () => {
    test("should pass through single mcp-config in extraArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{"command":"cmd1"}}}'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBe(
        '{"mcpServers":{"server1":{"command":"cmd1"}}}',
      );
    });

    test("should merge multiple mcp-config flags with inline JSON", () => {
      // Simulates action prepending its config, then user providing their own
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node","args":["server.js"]}}}' --mcp-config '{"mcpServers":{"user_server":{"command":"custom","args":["run"]}}}'`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
      expect(mcpConfig.mcpServers).toHaveProperty("user_server");
      expect(mcpConfig.mcpServers.github_comment.command).toBe("node");
      expect(mcpConfig.mcpServers.user_server.command).toBe("custom");
    });

    test("should merge three mcp-config flags", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{"command":"cmd1"}}}' --mcp-config '{"mcpServers":{"server2":{"command":"cmd2"}}}' --mcp-config '{"mcpServers":{"server3":{"command":"cmd3"}}}'`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("server1");
      expect(mcpConfig.mcpServers).toHaveProperty("server2");
      expect(mcpConfig.mcpServers).toHaveProperty("server3");
    });

    test("should handle mcp-config file path when no inline JSON exists", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config /tmp/user-mcp-config.json`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBe(
        "/tmp/user-mcp-config.json",
      );
    });

    test("should merge inline JSON configs when file path is also present", () => {
      // When action provides inline JSON and user provides a file path,
      // the inline JSON configs should be merged (file paths cannot be merged at parse time)
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node"}}}' --mcp-config '{"mcpServers":{"github_ci":{"command":"node"}}}' --mcp-config /tmp/user-config.json`,
      };

      const result = parseSdkOptions(options);

      // The inline JSON configs should be merged
      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
      expect(mcpConfig.mcpServers).toHaveProperty("github_ci");
    });

    test("should handle mcp-config with other flags", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{}}}' --model claude-3-5-sonnet --mcp-config '{"mcpServers":{"server2":{}}}'`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("server1");
      expect(mcpConfig.mcpServers).toHaveProperty("server2");
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-3-5-sonnet");
    });

    test("should handle real-world scenario: action config + user config", () => {
      // This is the exact scenario from the bug report
      const actionConfig = JSON.stringify({
        mcpServers: {
          github_comment: {
            command: "node",
            args: ["github-comment-server.js"],
          },
          github_ci: { command: "node", args: ["github-ci-server.js"] },
        },
      });
      const userConfig = JSON.stringify({
        mcpServers: {
          my_custom_server: { command: "python", args: ["server.py"] },
        },
      });

      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '${actionConfig}' --mcp-config '${userConfig}'`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      // All servers should be present
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
      expect(mcpConfig.mcpServers).toHaveProperty("github_ci");
      expect(mcpConfig.mcpServers).toHaveProperty("my_custom_server");
    });
  });

  describe("other extraArgs passthrough", () => {
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

  describe("shell comment handling", () => {
    test("should strip shell-style comments from claudeArgs", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude-haiku'
# This is a comment
--allowed-tools 'Edit,Read'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual(["Edit", "Read"]);
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
    });

    test("should handle multiline comments before flags", () => {
      // This is the exact scenario from issue #800
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude-haiku-4-5'
--fallback-model 'claude-sonnet-4-5'

# Bug workaround: 'mcp__github_*' tools MUST be in the first --allowed-tools flag.
# parseAllowedTools() only reads the first flag.
# https://github.com/anthropics/claude-code-action/issues/800
--allowed-tools 'mcp__github_inline_comment__create_inline_comment'

--mcp-config '{"mcpServers": {"context7": {"type": "http"}}}'
--allowed-tools 'mcp__context7__*'`,
      };

      const result = parseSdkOptions(options);

      // All flags should be parsed correctly, comments stripped
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku-4-5");
      expect(result.sdkOptions.extraArgs?.["fallback-model"]).toBe(
        "claude-sonnet-4-5",
      );
      expect(result.sdkOptions.allowedTools).toContain(
        "mcp__github_inline_comment__create_inline_comment",
      );
      expect(result.sdkOptions.allowedTools).toContain("mcp__context7__*");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeDefined();
    });

    test("should handle comments containing quoted strings", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude-haiku'
# Note: 'mcp__github_*' must be first
--allowed-tools 'Edit'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
      expect(result.sdkOptions.allowedTools).toEqual(["Edit"]);
    });

    test("should handle comments containing flag-like text", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude-haiku'
# Use --allowed-tools to specify tools
--allowed-tools 'Edit'`,
      };

      const result = parseSdkOptions(options);

      // The --allowed-tools in the comment should not be parsed
      // Only the actual flag should be parsed
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
      expect(result.sdkOptions.allowedTools).toEqual(["Edit"]);
    });

    test("should handle indented comments", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude-haiku'
  # This is an indented comment
--allowed-tools 'Edit'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
      expect(result.sdkOptions.allowedTools).toEqual(["Edit"]);
    });

    test("should preserve hash characters inside quoted strings", () => {
      // Hash characters inside quotes are NOT comments
      const options: ClaudeOptions = {
        claudeArgs: `--model 'claude#haiku'`,
      };

      const result = parseSdkOptions(options);

      // The hash inside quotes should be preserved
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude#haiku");
    });
  });
});
