#!/usr/bin/env bun

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { parseSdkOptions } from "../src/parse-sdk-options";
import type { ClaudeOptions } from "../src/run-claude";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

// Temp directory for test files
const TEST_TMP_DIR = join(import.meta.dir, ".test-tmp");

beforeAll(() => {
  mkdirSync(TEST_TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_TMP_DIR, { recursive: true, force: true });
});

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

    test("should read and merge mcp-config file path when no inline JSON exists", () => {
      // Create a test config file
      const configPath = join(TEST_TMP_DIR, "solo-config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            file_server: { command: "node", args: ["file-server.js"] },
          },
        }),
      );

      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config ${configPath}`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("file_server");
      expect(mcpConfig.mcpServers.file_server.command).toBe("node");
    });

    test("should merge file path config with inline JSON configs (fixes #754)", () => {
      // This is the exact scenario from issue #754
      // When action provides inline JSON and user provides a file path,
      // BOTH should be merged together
      const configPath = join(TEST_TMP_DIR, "user-config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          mcpServers: {
            my_custom_server: { command: "docker", args: ["run", "my-server"] },
          },
        }),
      );

      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node"}}}' --mcp-config '{"mcpServers":{"github_ci":{"command":"node"}}}' --mcp-config ${configPath}`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      // All servers should be present - inline JSON AND file config
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
      expect(mcpConfig.mcpServers).toHaveProperty("github_ci");
      expect(mcpConfig.mcpServers).toHaveProperty("my_custom_server");
      expect(mcpConfig.mcpServers.my_custom_server.command).toBe("docker");
    });

    test("should handle non-existent mcp-config file gracefully", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node"}}}' --mcp-config /non/existent/path.json`,
      };

      const result = parseSdkOptions(options);

      // Should still have the inline config, non-existent file is skipped with warning
      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
    });

    test("should handle invalid JSON in mcp-config file gracefully", () => {
      const configPath = join(TEST_TMP_DIR, "invalid-config.json");
      writeFileSync(configPath, "not valid json {{{");

      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node"}}}' --mcp-config ${configPath}`,
      };

      const result = parseSdkOptions(options);

      // Should still have the inline config, invalid file is skipped with warning
      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("github_comment");
    });

    test("should merge multiple file paths", () => {
      const configPath1 = join(TEST_TMP_DIR, "config1.json");
      const configPath2 = join(TEST_TMP_DIR, "config2.json");
      writeFileSync(
        configPath1,
        JSON.stringify({
          mcpServers: { server1: { command: "cmd1" } },
        }),
      );
      writeFileSync(
        configPath2,
        JSON.stringify({
          mcpServers: { server2: { command: "cmd2" } },
        }),
      );

      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config ${configPath1} --mcp-config ${configPath2}`,
      };

      const result = parseSdkOptions(options);

      const mcpConfig = JSON.parse(
        result.sdkOptions.extraArgs?.["mcp-config"] as string,
      );
      expect(mcpConfig.mcpServers).toHaveProperty("server1");
      expect(mcpConfig.mcpServers).toHaveProperty("server2");
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
});
