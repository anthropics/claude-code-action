import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { prepareMcpConfig } from "../src/mcp/install-mcp-server";
import * as core from "@actions/core";
import type { ParsedGitHubContext } from "../src/github/context";

describe("prepareMcpConfig", () => {
  let consoleInfoSpy: any;
  let consoleWarningSpy: any;
  let setFailedSpy: any;
  let processExitSpy: any;

  // Create a mock context for tests
  const mockContext: ParsedGitHubContext = {
    runId: "test-run-id",
    eventName: "issue_comment",
    eventAction: "created",
    repository: {
      owner: "test-owner",
      repo: "test-repo",
      full_name: "test-owner/test-repo",
    },
    actor: "test-actor",
    payload: {} as any,
    entityNumber: 123,
    isPR: false,
    inputs: {
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      allowedTools: [],
      disallowedTools: [],
      customInstructions: "",
      directPrompt: "",
      branchPrefix: "",
      useStickyComment: false,
      additionalPermissions: new Map(),
      useCommitSigning: false,
    },
  };

  const mockPRContext: ParsedGitHubContext = {
    ...mockContext,
    eventName: "pull_request",
    isPR: true,
    entityNumber: 456,
  };

  const mockContextWithSigning: ParsedGitHubContext = {
    ...mockContext,
    inputs: {
      ...mockContext.inputs,
      useCommitSigning: true,
    },
  };

  const mockPRContextWithSigning: ParsedGitHubContext = {
    ...mockPRContext,
    inputs: {
      ...mockPRContext.inputs,
      useCommitSigning: true,
    },
  };

  beforeEach(() => {
    consoleInfoSpy = spyOn(core, "info").mockImplementation(() => {});
    consoleWarningSpy = spyOn(core, "warning").mockImplementation(() => {});
    setFailedSpy = spyOn(core, "setFailed").mockImplementation(() => {});
    processExitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    // Set up required environment variables
    if (!process.env.GITHUB_ACTION_PATH) {
      process.env.GITHUB_ACTION_PATH = "/test/action/path";
    }
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
    consoleWarningSpy.mockRestore();
    setFailedSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test("should return comment server when commit signing is disabled", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: mockContext,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).not.toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
    expect(parsed.mcpServers.github_comment.env.GITHUB_TOKEN).toBe(
      "test-token",
    );
    expect(parsed.mcpServers.github_comment.env.REPO_OWNER).toBe("test-owner");
    expect(parsed.mcpServers.github_comment.env.REPO_NAME).toBe("test-repo");
  });

  test("should return file ops server when commit signing is enabled", async () => {
    const contextWithSigning = {
      ...mockContext,
      inputs: {
        ...mockContext.inputs,
        useCommitSigning: true,
      },
    };

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: contextWithSigning,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
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
      baseBranch: "main",
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
      context: mockContext,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
    expect(parsed.mcpServers.github_file_ops).not.toBeDefined();
    expect(parsed.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(
      "test-token",
    );
  });

  test("should not include github MCP server when only file_ops tools are allowed", async () => {
    const contextWithSigning = {
      ...mockContext,
      inputs: {
        ...mockContext.inputs,
        useCommitSigning: true,
      },
    };

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [
        "mcp__github_file_ops__commit_files",
        "mcp__github_file_ops__update_claude_comment",
      ],
      context: contextWithSigning,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should include comment server when no GitHub tools are allowed and signing disabled", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: ["Edit", "Read", "Write"],
      context: mockContext,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).not.toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
  });

  test("should return base config when additional config is empty string", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      additionalMcpConfig: "",
      allowedTools: [],
      context: mockContext,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
    expect(consoleWarningSpy).not.toHaveBeenCalled();
  });

  test("should return base config when additional config is whitespace only", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      additionalMcpConfig: "   \n\t  ",
      allowedTools: [],
      context: mockContext,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers.github).not.toBeDefined();
    expect(parsed.mcpServers.github_comment).toBeDefined();
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
      baseBranch: "main",
      additionalMcpConfig: additionalConfig,
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: additionalConfig,
      allowedTools: [
        "mcp__github__create_issue",
        "mcp__github_file_ops__commit_files",
      ],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: additionalConfig,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: invalidJson,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: nonObjectJson,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: nullJson,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: arrayJson,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      additionalMcpConfig: additionalConfig,
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      allowedTools: [],
      context: mockContextWithSigning,
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
      baseBranch: "main",
      allowedTools: [],
      context: mockContextWithSigning,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_file_ops.env.REPO_DIR).toBe(process.cwd());

    process.env.GITHUB_WORKSPACE = oldEnv;
  });

  test("should include github_ci server when context.isPR is true and actions:read permission is granted", async () => {
    const oldEnv = process.env.ACTIONS_TOKEN;
    process.env.ACTIONS_TOKEN = "workflow-token";

    const contextWithPermissions = {
      ...mockPRContext,
      inputs: {
        ...mockPRContext.inputs,
        additionalPermissions: new Map([["actions", "read"]]),
        useCommitSigning: true,
      },
    };

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: contextWithPermissions,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_ci).toBeDefined();
    expect(parsed.mcpServers.github_ci.env.GITHUB_TOKEN).toBe("workflow-token");
    expect(parsed.mcpServers.github_ci.env.PR_NUMBER).toBe("456");
    expect(parsed.mcpServers.github_file_ops).toBeDefined();

    process.env.ACTIONS_TOKEN = oldEnv;
  });

  test("should not include github_ci server when context.isPR is false", async () => {
    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: mockContextWithSigning,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_ci).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();
  });

  test("should not include github_ci server when actions:read permission is not granted", async () => {
    const oldTokenEnv = process.env.ACTIONS_TOKEN;
    process.env.ACTIONS_TOKEN = "workflow-token";

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: mockPRContextWithSigning,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_ci).not.toBeDefined();
    expect(parsed.mcpServers.github_file_ops).toBeDefined();

    process.env.ACTIONS_TOKEN = oldTokenEnv;
  });

  test("should parse additional_permissions with multiple lines correctly", async () => {
    const oldTokenEnv = process.env.ACTIONS_TOKEN;
    process.env.ACTIONS_TOKEN = "workflow-token";

    const contextWithPermissions = {
      ...mockPRContext,
      inputs: {
        ...mockPRContext.inputs,
        additionalPermissions: new Map([
          ["actions", "read"],
          ["future", "permission"],
        ]),
      },
    };

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: contextWithPermissions,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_ci).toBeDefined();
    expect(parsed.mcpServers.github_ci.env.GITHUB_TOKEN).toBe("workflow-token");

    process.env.ACTIONS_TOKEN = oldTokenEnv;
  });

  test("should warn when actions:read is requested but token lacks permission", async () => {
    const oldTokenEnv = process.env.ACTIONS_TOKEN;
    process.env.ACTIONS_TOKEN = "invalid-token";

    const contextWithPermissions = {
      ...mockPRContext,
      inputs: {
        ...mockPRContext.inputs,
        additionalPermissions: new Map([["actions", "read"]]),
      },
    };

    const result = await prepareMcpConfig({
      githubToken: "test-token",
      owner: "test-owner",
      repo: "test-repo",
      branch: "test-branch",
      baseBranch: "main",
      allowedTools: [],
      context: contextWithPermissions,
    });

    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.github_ci).toBeDefined();
    expect(consoleWarningSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "The github_ci MCP server requires 'actions: read' permission",
      ),
    );

    process.env.ACTIONS_TOKEN = oldTokenEnv;
  });
});
