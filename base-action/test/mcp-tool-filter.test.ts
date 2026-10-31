#!/usr/bin/env bun

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Options as SdkOptions } from "@anthropic-ai/claude-agent-sdk";
import {
  disallowUnlistedMcpTools,
  expandEnvVars,
  findUnlistedMcpTools,
  loadMcpServers,
  normalizeMcpName,
} from "../src/mcp-tool-filter";

const fixtureServer = join(import.meta.dir, "fixtures", "mcp-tools-server.ts");

function stdioServer(toolNames: string[]) {
  return {
    command: process.execPath,
    args: [fixtureServer],
    env: { TOOL_NAMES: toolNames.join(",") },
  };
}

describe("normalizeMcpName", () => {
  test("replaces characters Claude Code does not keep in tool names", () => {
    expect(normalizeMcpName("my.server name")).toBe("my_server_name");
    expect(normalizeMcpName("github_ci-2")).toBe("github_ci-2");
  });
});

describe("expandEnvVars", () => {
  test("expands set variables and defaults, keeps unset ones", () => {
    const env = { TOKEN: "abc" };
    expect(expandEnvVars("Bearer ${TOKEN}", env)).toBe("Bearer abc");
    expect(expandEnvVars("${MISSING:-fallback}", env)).toBe("fallback");
    expect(expandEnvVars("${MISSING}", env)).toBe("${MISSING}");
  });
});

describe("findUnlistedMcpTools", () => {
  const serverTools = {
    github: ["get_file_contents", "create_pull_request", "merge_pull_request"],
    slack: ["post_message", "list_channels"],
    jira: ["get_issue", "create_issue"],
  };

  test("returns the unlisted tools of a partly allowed server", () => {
    expect(
      findUnlistedMcpTools(["mcp__github__get_file_contents"], serverTools),
    ).toEqual([
      "mcp__github__create_pull_request",
      "mcp__github__merge_pull_request",
    ]);
  });

  test("only lists tools of partly allowed servers", () => {
    expect(
      findUnlistedMcpTools(
        ["mcp__slack", "mcp__jira__*", "Bash(git diff:*)"],
        serverTools,
      ),
    ).toEqual([]);
  });

  test("keeps tools that a wildcard entry matches", () => {
    expect(
      findUnlistedMcpTools(["mcp__github__get_*"], {
        github: ["get_file_contents", "get_commit", "create_pull_request"],
      }),
    ).toEqual(["mcp__github__create_pull_request"]);
  });

  test("does not mix up servers that share a name prefix", () => {
    expect(
      findUnlistedMcpTools(["mcp__github_comment__update_claude_comment"], {
        github: ["get_file_contents"],
        github_comment: ["update_claude_comment"],
      }),
    ).toEqual([]);
  });

  test("normalizes server and tool names", () => {
    expect(
      findUnlistedMcpTools(["mcp__my_server__read"], {
        "my.server": ["read", "write.all"],
      }),
    ).toEqual(["mcp__my_server__write_all"]);
  });
});

describe("loadMcpServers", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  test("reads inline JSON and config files", async () => {
    const config = { mcpServers: { a: { command: "a" } } };
    expect(await loadMcpServers(JSON.stringify(config))).toEqual(
      config.mcpServers,
    );

    tempDir = await mkdtemp(join(tmpdir(), "mcp-config-"));
    const configPath = join(tempDir, "mcp.json");
    await writeFile(configPath, JSON.stringify(config));
    expect(await loadMcpServers(configPath)).toEqual(config.mcpServers);
  });
});

describe("disallowUnlistedMcpTools", () => {
  test("disallows the unlisted tools of a running server and keeps existing entries", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const sdkOptions: SdkOptions = {
      allowedTools: ["mcp__tools__read", "Read"],
      disallowedTools: ["WebFetch"],
      extraArgs: {
        "mcp-config": JSON.stringify({
          mcpServers: { tools: stdioServer(["read", "write", "delete"]) },
        }),
      },
      env: { ...process.env },
    };

    try {
      await disallowUnlistedMcpTools(sdkOptions);
    } finally {
      logSpy.mockRestore();
    }

    expect(sdkOptions.disallowedTools).toEqual([
      "WebFetch",
      "mcp__tools__write",
      "mcp__tools__delete",
    ]);
  });

  test("skips servers it cannot reach or that time out", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const sdkOptions: SdkOptions = {
      allowedTools: [
        "mcp__missing__read",
        "mcp__hanging__read",
        "mcp__remote__read",
      ],
      extraArgs: {
        "mcp-config": JSON.stringify({
          mcpServers: {
            missing: { command: "/nonexistent/mcp-server" },
            hanging: { command: "sleep", args: ["10"] },
            remote: { type: "http", url: "http://127.0.0.1:9/mcp" },
          },
        }),
      },
      env: { ...process.env },
    };

    try {
      await disallowUnlistedMcpTools(sdkOptions, 500);
      expect(sdkOptions.disallowedTools).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(3);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("disallows a server with no allowed tools as a whole, without connecting to it", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const sdkOptions: SdkOptions = {
      allowedTools: ["Read", "mcp__allowed"],
      extraArgs: {
        "mcp-config": JSON.stringify({
          mcpServers: {
            "unnamed.server": { command: "/nonexistent/mcp-server" },
            allowed: { command: "/nonexistent/mcp-server" },
          },
        }),
      },
    };

    try {
      await disallowUnlistedMcpTools(sdkOptions);
      expect(sdkOptions.disallowedTools).toEqual(["mcp__unnamed_server"]);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test("leaves the tools alone when --mcp-config cannot be read", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const sdkOptions: SdkOptions = {
      allowedTools: ["mcp__tools__read"],
      extraArgs: { "mcp-config": "{ not json" },
    };
    try {
      await disallowUnlistedMcpTools(sdkOptions);
      expect(sdkOptions.disallowedTools).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
