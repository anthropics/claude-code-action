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

  describe("mcp-config routing", () => {
    // Inline JSON --mcp-config values are routed to sdkOptions.mcpServers
    // (the SDK's typed registration path) so the spawned CLI sees them in
    // session init. File paths stay in extraArgs for the CLI to load.
    // Background: #1245 / #1191 — when inline JSON was forwarded via
    // extraArgs["mcp-config"], the spawned CLI's session init reported
    // `mcp_servers: []` despite the flag being correctly populated.
    test("routes single inline mcp-config to sdkOptions.mcpServers", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{"command":"cmd1"}}}'`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.mcpServers).toEqual({
        server1: { command: "cmd1" },
      });
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeUndefined();
    });

    test("merges multiple inline mcp-config flags into sdkOptions.mcpServers", () => {
      // Simulates action prepending its config, then user providing their own
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node","args":["server.js"]}}}' --mcp-config '{"mcpServers":{"user_server":{"command":"custom","args":["run"]}}}'`,
      };

      const result = parseSdkOptions(options);

      const servers = result.sdkOptions.mcpServers as Record<string, any>;
      expect(servers).toHaveProperty("github_comment");
      expect(servers).toHaveProperty("user_server");
      expect(servers.github_comment.command).toBe("node");
      expect(servers.user_server.command).toBe("custom");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeUndefined();
    });

    test("merges three inline mcp-config flags into sdkOptions.mcpServers", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{"command":"cmd1"}}}' --mcp-config '{"mcpServers":{"server2":{"command":"cmd2"}}}' --mcp-config '{"mcpServers":{"server3":{"command":"cmd3"}}}'`,
      };

      const result = parseSdkOptions(options);

      const servers = result.sdkOptions.mcpServers as Record<string, any>;
      expect(servers).toHaveProperty("server1");
      expect(servers).toHaveProperty("server2");
      expect(servers).toHaveProperty("server3");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeUndefined();
    });

    test("forwards mcp-config file path through extraArgs (no inline JSON)", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config /tmp/user-mcp-config.json`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBe(
        "/tmp/user-mcp-config.json",
      );
      expect(result.sdkOptions.mcpServers).toBeUndefined();
    });

    test("splits inline JSON to mcpServers and keeps file path in extraArgs", () => {
      // When action provides inline JSON and user provides a file path,
      // inline servers go to mcpServers and the file path stays in extraArgs
      // so the CLI loads it (and merges it with what the SDK already registered)
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"github_comment":{"command":"node"}}}' --mcp-config '{"mcpServers":{"github_ci":{"command":"node"}}}' --mcp-config /tmp/user-config.json`,
      };

      const result = parseSdkOptions(options);

      const servers = result.sdkOptions.mcpServers as Record<string, any>;
      expect(servers).toHaveProperty("github_comment");
      expect(servers).toHaveProperty("github_ci");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBe(
        "/tmp/user-config.json",
      );
    });

    test("routes inline mcp-config to mcpServers alongside other flags", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--mcp-config '{"mcpServers":{"server1":{}}}' --model claude-3-5-sonnet --mcp-config '{"mcpServers":{"server2":{}}}'`,
      };

      const result = parseSdkOptions(options);

      const servers = result.sdkOptions.mcpServers as Record<string, any>;
      expect(servers).toHaveProperty("server1");
      expect(servers).toHaveProperty("server2");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeUndefined();
      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-3-5-sonnet");
    });

    test("real-world scenario: action bundled config + user inline config", () => {
      // This is the exact scenario from issue #1245 — both action-prepended
      // and user-provided inline JSON should register through mcpServers so
      // the spawned CLI lists them in session init.
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

      const servers = result.sdkOptions.mcpServers as Record<string, any>;
      expect(servers).toHaveProperty("github_comment");
      expect(servers).toHaveProperty("github_ci");
      expect(servers).toHaveProperty("my_custom_server");
      expect(result.sdkOptions.extraArgs?.["mcp-config"]).toBeUndefined();
    });

    test("leaves mcpServers undefined when no --mcp-config is passed", () => {
      const options: ClaudeOptions = {
        claudeArgs: `--model claude-3-5-sonnet`,
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.mcpServers).toBeUndefined();
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

  describe("shell comment stripping", () => {
    test("should parse flags before and after a comment line", () => {
      const options: ClaudeOptions = {
        claudeArgs: "--model 'claude-haiku'\n# comment\n--allowed-tools 'Edit'",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
      expect(result.sdkOptions.allowedTools).toEqual(["Edit"]);
    });

    test("should parse flags correctly when no comments are present", () => {
      const options: ClaudeOptions = {
        claudeArgs: "--model 'claude-haiku'",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
    });

    test("should not strip inline # that appears inside a quoted value", () => {
      const options: ClaudeOptions = {
        claudeArgs: "--model 'claude-haiku' --prompt 'use color #ff0000'",
      };

      const result = parseSdkOptions(options);

      expect(result.sdkOptions.extraArgs?.["model"]).toBe("claude-haiku");
      expect(result.sdkOptions.extraArgs?.["prompt"]).toBe("use color #ff0000");
    });
  });

  describe("environment variables passthrough", () => {
    test("should include OTEL environment variables in sdkOptions.env", () => {
      // Set up test environment variables
      const originalEnv = { ...process.env };
      process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";
      process.env.OTEL_METRICS_EXPORTER = "otlp";
      process.env.OTEL_LOGS_EXPORTER = "otlp";
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http/json";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://example.com";
      process.env.OTEL_EXPORTER_OTLP_HEADERS =
        "Authorization=Bearer test-token";
      process.env.OTEL_METRIC_EXPORT_INTERVAL = "10000";
      process.env.OTEL_LOGS_EXPORT_INTERVAL = "5000";
      process.env.OTEL_RESOURCE_ATTRIBUTES = "department=test";

      try {
        const options: ClaudeOptions = {};
        const result = parseSdkOptions(options);

        // Verify OTEL env vars are passed through to sdkOptions.env
        expect(result.sdkOptions.env?.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("1");
        expect(result.sdkOptions.env?.OTEL_METRICS_EXPORTER).toBe("otlp");
        expect(result.sdkOptions.env?.OTEL_LOGS_EXPORTER).toBe("otlp");
        expect(result.sdkOptions.env?.OTEL_EXPORTER_OTLP_PROTOCOL).toBe(
          "http/json",
        );
        expect(result.sdkOptions.env?.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
          "https://example.com",
        );
        expect(result.sdkOptions.env?.OTEL_EXPORTER_OTLP_HEADERS).toBe(
          "Authorization=Bearer test-token",
        );
        expect(result.sdkOptions.env?.OTEL_METRIC_EXPORT_INTERVAL).toBe(
          "10000",
        );
        expect(result.sdkOptions.env?.OTEL_LOGS_EXPORT_INTERVAL).toBe("5000");
        expect(result.sdkOptions.env?.OTEL_RESOURCE_ATTRIBUTES).toBe(
          "department=test",
        );
      } finally {
        // Restore original environment
        process.env = originalEnv;
      }
    });

    test("should set CLAUDE_CODE_ENTRYPOINT in sdkOptions.env", () => {
      const options: ClaudeOptions = {};
      const result = parseSdkOptions(options);

      expect(result.sdkOptions.env?.CLAUDE_CODE_ENTRYPOINT).toBe(
        "claude-code-github-action",
      );
    });

    test("should strip ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN from env", () => {
      const originalEnv = { ...process.env };
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL =
        "https://token.actions.githubusercontent.com";
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = "secret-token-value";

      try {
        const options: ClaudeOptions = {};
        const result = parseSdkOptions(options);

        expect(
          result.sdkOptions.env?.ACTIONS_ID_TOKEN_REQUEST_URL,
        ).toBeUndefined();
        expect(
          result.sdkOptions.env?.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
        ).toBeUndefined();
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
