#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { parseSdkOptions } from "../src/parse-sdk-options";
import type { ClaudeOptions } from "../src/run-claude";
import * as core from "@actions/core";

describe("parseSdkOptions", () => {
  let warningSpy: any;

  beforeEach(() => {
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
  });

  afterEach(() => {
    warningSpy?.mockRestore();
  });

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

  describe("multiline claude_args with spaces (issue #844)", () => {
    test("should correctly parse quoted allowedTools with Bash tools containing spaces", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--max-turns 15 --allowedTools "Bash(git diff --name-only HEAD~1),Bash(git diff HEAD~1),Read,Glob,Grep"`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Bash(git diff --name-only HEAD~1)",
        "Bash(git diff HEAD~1)",
        "Read",
        "Glob",
        "Grep",
      ]);
      expect(result.sdkOptions.extraArgs?.["max-turns"]).toBe("15");
      expect(result.sdkOptions.extraArgs?.["name-only"]).toBeUndefined();
    });

    test("should correctly parse multiline YAML with quoted allowedTools", () => {
      // Simulates multiline YAML: claude_args: |
      //   --max-turns 15
      //   --allowedTools "Bash(git diff --name-only HEAD~1),Read,Glob,Grep"
      const options: ClaudeOptions = {
        claudeArgs: `--max-turns 15
--allowedTools "Bash(git diff --name-only HEAD~1),Read,Glob,Grep"`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Bash(git diff --name-only HEAD~1)",
        "Read",
        "Glob",
        "Grep",
      ]);
      expect(result.sdkOptions.extraArgs?.["max-turns"]).toBe("15");
    });

    test("should handle unquoted allowedTools without spaces (no warning)", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--max-turns 15 --allowedTools Edit,Read,Write,Bash`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.allowedTools).toEqual([
        "Edit",
        "Read",
        "Write",
        "Bash",
      ]);
      expect(warningSpy).not.toHaveBeenCalled();
    });

    test("should warn when unquoted allowedTools with spaces are incorrectly parsed", () => {
      // This simulates the exact issue #844 scenario where unquoted values get split
      // The shell-quote parser will split "Bash(git diff --name-only HEAD~1)" into
      // ["Bash(git", "diff", "--name-only", "HEAD~1)"] or similar
      const options: ClaudeOptions = {
        claudeArgs: `--max-turns 15 --allowedTools Bash git diff`,
      };

      const result = parseSdkOptions(options);

      // The warning should be triggered because "Bash" followed by "git" suggests incorrect parsing
      expect(warningSpy).toHaveBeenCalled();
      const warningMessage = warningSpy.mock.calls[0]?.[0];
      expect(warningMessage).toContain("incorrectly parsed");
      expect(warningMessage).toContain("allowedTools");
      expect(warningMessage).toContain("quote");
    });

    test("should warn when tool name with unclosed paren is detected", () => {
      // This simulates the exact issue #844: unquoted "Bash(git diff --name-only HEAD~1)"
      // gets split into ["Bash(git", "diff"] before hitting --name-only as a separate flag
      // Note: We can't easily test the exact shell-quote behavior, but we can test
      // that our detection logic works when we manually create the split scenario
      const options: ClaudeOptions = {
        // Simulating what shell-quote would produce: Bash(git and diff as separate args
        // In reality, this would come from: --allowedTools Bash(git diff --name-only HEAD~1)
        claudeArgs: `--max-turns 15 --allowedTools Bash\(git diff`,
      };

      parseSdkOptions(options);

      // The warning should be triggered because "Bash(git" has opening paren but no closing paren
      // OR because "Bash" is followed by "git" or "diff"
      expect(warningSpy).toHaveBeenCalled();
    });
  });
});
