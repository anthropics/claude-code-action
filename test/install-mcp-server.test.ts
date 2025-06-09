import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { prepareMcpConfig } from "../src/mcp/install-mcp-server";
import * as core from "@actions/core";

describe("prepareMcpConfig", () => {
  let consoleInfoSpy: any;
  let consoleWarningSpy: any;
  let setFailedSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleInfoSpy = spyOn(core, "info").mockImplementation(() => {});
    consoleWarningSpy = spyOn(core, "warning").mockImplementation(() => {});
    setFailedSpy = spyOn(core, "setFailed").mockImplementation(() => {});
    processExitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarningSpy.mockRestore();
    setFailedSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("should return base config when no additional config is provided and no allowed_tools", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    expect(parsed.mcpServers.github_file_ops.env.GITHUB_TOKEN).toBe(
      "test-token",
    );
    expect(parsed.mcpServers.github_file_ops.env.REPO_OWNER).toBe("test-owner");
    expect(parsed.mcpServers.github_file_ops.env.REPO_NAME).toBe("test-repo");
    expect(parsed.mcpServers.github_file_ops.env.BRANCH_NAME).toBe(
      "test-branch",
    );
  });

  test("should include github MCP server when mcp__github__ tools are allowed", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    expect(parsed.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
      "test-token",
    );
  });

  test("should not include github MCP server when only file_ops tools are allowed", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: [
        "mcp__github_file_ops__commit_files",
        "mcp__github_file_ops__update_claude_comment",
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should include file_ops server even when no GitHub tools are allowed", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: ["Edit", "Read", "Write"],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should return base config when additional config is empty string", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: "",
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    expect(consoleWarningSpy).not.toHaveBeenCalled();
  });

  test("should return base config when additional config is whitespace only", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: "   \n\t  ",
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    expect(consoleWarningSpy).not.toHaveBeenCalled();
  });

  test("should merge valid additional config with base config", async () => {
    const additionalConfig = JSON.stringify({
      mcpServers: {
        custom_server: {
          command: "custom-command",
          args: ["arg1", "arg2"],
          env: {
            CUSTOM_ENV: "custom-value",
          },
        },
      },
    });

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: additionalConfig,
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
    });

    const parsed = JSON.parse(result);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Merging additional MCP server configuration with built-in servers",
    );
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    expect(parsed.mcpServers.custom_server).toBeDefined();
    expect(parsed.mcpServers.custom_server.command).toBe("custom-command");
    expect(parsed.mcpServers.custom_server.args).toEqual(["arg1", "arg2"]);
    expect(parsed.mcpServers.custom_server.env.CUSTOM_ENV).toBe("custom-value");
  });

  test("should override built-in servers when additional config has same server names", async () => {
    const additionalConfig = JSON.stringify({
      mcpServers: {
        github: {
          command: "overridden-command",
          args: ["overridden-arg"],
          env: {
            OVERRIDDEN_ENV: "overridden-value",
          },
        },
      },
    });

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: additionalConfig,
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
    });

    const parsed = JSON.parse(result);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Merging additional MCP server configuration with built-in servers",
    );
    expect(parsed.mcpServers.github.command).toBe("overridden-command");
    expect(parsed.mcpServers.github.args).toEqual(["overridden-arg"]);
    expect(parsed.mcpServers.github.env.OVERRIDDEN_ENV).toBe(
      "overridden-value",
    );
    expect(
      parsed.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    ).toBeUndefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should merge additional root-level properties", async () => {
    const additionalConfig = JSON.stringify({
      customProperty: "custom-value",
      anotherProperty: {
        nested: "value",
      },
      mcpServers: {
        custom_server: {
          command: "custom",
        },
      },
    });

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: additionalConfig,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.customProperty).toBe("custom-value");
    expect(parsed.anotherProperty).toEqual({ nested: "value" });
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.custom_server).toBeDefined();
  });

  test("should handle invalid JSON gracefully", async () => {
    const invalidJson = "{ invalid json }";

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: invalidJson,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse additional MCP config:"),
    );
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should handle non-object JSON values", async () => {
    const nonObjectJson = JSON.stringify("string value");

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: nonObjectJson,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse additional MCP config:"),
    );
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining("MCP config must be a valid JSON object"),
    );
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should handle null JSON value", async () => {
    const nullJson = JSON.stringify(null);

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: nullJson,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse additional MCP config:"),
    );
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining("MCP config must be a valid JSON object"),
    );
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should handle array JSON value", async () => {
    const arrayJson = JSON.stringify([1, 2, 3]);

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: arrayJson,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    // Arrays are objects in JavaScript, so they pass the object check
    // But they'll fail when trying to spread or access mcpServers property
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Merging additional MCP server configuration with built-in servers",
    );
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
    // The array will be spread into the config (0: 1, 1: 2, 2: 3)
    expect(parsed[0]).toBe(1);
    expect(parsed[1]).toBe(2);
    expect(parsed[2]).toBe(3);
  });

  test("should merge complex nested configurations", async () => {
    const additionalConfig = JSON.stringify({
      mcpServers: {
        server1: {
          command: "cmd1",
          env: { KEY1: "value1" },
        },
        server2: {
          command: "cmd2",
          env: { KEY2: "value2" },
        },
        github_file_ops: {
          command: "overridden",
          env: { CUSTOM: "value" },
        },
      },
      otherConfig: {
        nested: {
          deeply: "value",
        },
      },
    });

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      additionalMcpConfig: additionalConfig,
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.server1).toBeDefined();
    expect(parsed.mcpServers.server2).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops.command).toBe("overridden");
    expect(parsed.mcpServers.github_file_ops.env.CUSTOM).toBe("value");
    expect(parsed.otherConfig.nested.deeply).toBe("value");
  });

  test("should preserve GITHUB_ACTION_PATH in file_ops server args", async () => {
    const oldEnv = process.env.GITHUB_ACTION_PATH;
    process.env.GITHUB_ACTION_PATH = "/test/action/path";

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_file_ops.args[1]).toBe(
      "/test/action/path/src/mcp/github-file-ops-server.ts",
    );

    process.env.GITHUB_ACTION_PATH = oldEnv;
  });

  test("should use process.cwd() when GITHUB_WORKSPACE is not set", async () => {
    const oldEnv = process.env.GITHUB_WORKSPACE;
    delete process.env.GITHUB_WORKSPACE;

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      allowedTools: [],
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_file_ops.env.REPO_DIR).toBe(process.cwd());

    process.env.GITHUB_WORKSPACE = oldEnv;
  });
});
