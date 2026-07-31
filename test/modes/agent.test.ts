import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { prepareAgentMode } from "../../src/modes/agent";
import { createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";
import * as gitConfig from "../../src/github/operations/git-config";

describe("Agent Mode", () => {
  let exportVariableSpy: any;
  let setOutputSpy: any;
  let configureGitAuthSpy: any;

  beforeEach(() => {
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    // Mock configureGitAuth to prevent actual git commands from running
    configureGitAuthSpy = spyOn(
      gitConfig,
      "configureGitAuth",
    ).mockImplementation(async () => {
      // Do nothing - prevent actual git config modifications
    });
  });

  afterEach(() => {
    exportVariableSpy?.mockClear();
    setOutputSpy?.mockClear();
    configureGitAuthSpy?.mockClear();
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
    configureGitAuthSpy?.mockRestore();
  });

  test("prepareAgentMode is exported as a function", () => {
    expect(typeof prepareAgentMode).toBe("function");
  });

  test("prepare passes through claude_args", async () => {
    // Clear any previous calls before this test
    exportVariableSpy.mockClear();
    setOutputSpy.mockClear();

    const contextWithCustomArgs = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });

    // Save original env vars and set test values
    const originalHeadRef = process.env.GITHUB_HEAD_REF;
    const originalRefName = process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_HEAD_REF;
    delete process.env.GITHUB_REF_NAME;

    // Set CLAUDE_ARGS environment variable
    process.env.CLAUDE_ARGS = "--model claude-sonnet-4 --max-turns 10";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;
    const result = await prepareAgentMode({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify claude_args includes user args (no MCP config in agent mode without allowed tools)
    expect(result.claudeArgs).toBe("--model claude-sonnet-4 --max-turns 10");
    expect(result.claudeArgs).not.toContain("--mcp-config");

    // Verify return structure - should fall back to repository.default_branch when no env vars set
    expect(result).toEqual({
      commentId: undefined,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: expect.any(String),
      claudeArgs: "--model claude-sonnet-4 --max-turns 10",
    });

    // Clean up
    delete process.env.CLAUDE_ARGS;
    if (originalHeadRef !== undefined)
      process.env.GITHUB_HEAD_REF = originalHeadRef;
    if (originalRefName !== undefined)
      process.env.GITHUB_REF_NAME = originalRefName;
  });

  test("prepare falls back to repository.default_branch when not 'main'", async () => {
    const contextWithDevelop = createMockAutomationContext({
      eventName: "workflow_dispatch",
      repository: {
        owner: "test-owner",
        repo: "test-repo",
        full_name: "test-owner/test-repo",
        default_branch: "develop",
      },
    });

    // Save and clear env vars that would otherwise override the fallback
    const originalClaudeBranch = process.env.CLAUDE_BRANCH;
    const originalHeadRef = process.env.GITHUB_HEAD_REF;
    const originalRefName = process.env.GITHUB_REF_NAME;
    delete process.env.CLAUDE_BRANCH;
    delete process.env.GITHUB_HEAD_REF;
    delete process.env.GITHUB_REF_NAME;

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;

    const result = await prepareAgentMode({
      context: contextWithDevelop,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    expect(result.branchInfo.baseBranch).toBe("develop");
    expect(result.branchInfo.currentBranch).toBe("develop");

    // Restore env vars
    if (originalClaudeBranch !== undefined)
      process.env.CLAUDE_BRANCH = originalClaudeBranch;
    if (originalHeadRef !== undefined)
      process.env.GITHUB_HEAD_REF = originalHeadRef;
    if (originalRefName !== undefined)
      process.env.GITHUB_REF_NAME = originalRefName;
  });

  test("prepare rejects bot actors without allowed_bots", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithPrompts.actor = "claude[bot]";
    contextWithPrompts.inputs.allowedBots = "";

    const mockOctokit = {
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "claude[bot]", id: 12345, type: "Bot" },
            }),
          ),
        },
      },
    } as any;

    await expect(
      prepareAgentMode({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).rejects.toThrow(
      "Workflow initiated by non-human actor: claude (type: Bot)",
    );
  });

  test("prepare allows bot actors when in allowed_bots list", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithPrompts.actor = "dependabot[bot]";
    contextWithPrompts.inputs.allowedBots = "dependabot";

    const mockOctokit = {
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "dependabot[bot]", id: 12345, type: "Bot" },
            }),
          ),
        },
      },
    } as any;

    // Should not throw - bot is in allowed list
    await expect(
      prepareAgentMode({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).resolves.toBeDefined();
  });

  test("prepare creates prompt file with correct content", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    // In v1-dev, we only have the unified prompt field
    contextWithPrompts.inputs.prompt = "Custom prompt content";

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;
    const result = await prepareAgentMode({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Note: We can't easily test file creation in this unit test,
    // but we can verify the method completes without errors
    // With our conditional MCP logic, agent mode with no allowed tools
    // should not include any MCP config
    // Should be empty or just whitespace when no MCP servers are included
    expect(result.claudeArgs).not.toContain("--mcp-config");
  });
});

/**
 * Commit-signing precedence.
 *
 * SSH signing (`ssh_signing_key`) wins over API commit signing
 * (`use_commit_signing`), because SSH signing pushes via the git CLI and so
 * still needs git auth configured. These assertions exercise the real branching
 * in prepareAgentMode rather than restating it.
 */
describe("Agent Mode commit signing precedence", () => {
  const SSH_KEY =
    "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE KEY-----";

  let exportVariableSpy: any;
  let setOutputSpy: any;
  let configureGitAuthSpy: any;
  let setupSshSigningSpy: any;
  let consoleErrorSpy: any;

  const mockOctokit = {
    rest: {
      users: {
        getAuthenticated: mock(() =>
          Promise.resolve({
            data: { login: "test-user", id: 12345, type: "User" },
          }),
        ),
        getByUsername: mock(() =>
          Promise.resolve({
            data: { login: "test-user", id: 12345, type: "User" },
          }),
        ),
      },
    },
  } as any;

  const run = (inputs: {
    sshSigningKey?: string;
    useCommitSigning?: boolean;
  }) =>
    prepareAgentMode({
      context: createMockAutomationContext({ inputs }),
      octokit: mockOctokit,
      githubToken: "test-token",
    });

  beforeEach(() => {
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    configureGitAuthSpy = spyOn(
      gitConfig,
      "configureGitAuth",
    ).mockImplementation(async () => {});
    setupSshSigningSpy = spyOn(gitConfig, "setupSshSigning").mockImplementation(
      async () => {},
    );
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
    configureGitAuthSpy?.mockRestore();
    setupSshSigningSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  test("sets up SSH signing and still configures git auth for pushes", async () => {
    await run({ sshSigningKey: SSH_KEY, useCommitSigning: false });

    expect(setupSshSigningSpy).toHaveBeenCalledTimes(1);
    expect(setupSshSigningSpy).toHaveBeenCalledWith(SSH_KEY);
    expect(configureGitAuthSpy).toHaveBeenCalledTimes(1);
  });

  test("SSH signing takes precedence when both signing modes are enabled", async () => {
    await run({ sshSigningKey: SSH_KEY, useCommitSigning: true });

    expect(setupSshSigningSpy).toHaveBeenCalledWith(SSH_KEY);
    // use_commit_signing must not suppress git auth here: SSH signing pushes
    // over the git CLI, which needs credentials on the remote.
    expect(configureGitAuthSpy).toHaveBeenCalledTimes(1);
  });

  test("configures git auth without SSH signing when no key is provided", async () => {
    await run({ sshSigningKey: "", useCommitSigning: false });

    expect(setupSshSigningSpy).not.toHaveBeenCalled();
    expect(configureGitAuthSpy).toHaveBeenCalledTimes(1);
  });

  test("skips git auth entirely when API commit signing is used", async () => {
    await run({ sshSigningKey: "", useCommitSigning: true });

    expect(setupSshSigningSpy).not.toHaveBeenCalled();
    expect(configureGitAuthSpy).not.toHaveBeenCalled();
  });

  test("does not fail the run when git auth configuration throws", async () => {
    configureGitAuthSpy.mockImplementation(async () => {
      throw new Error("git config failed");
    });

    await expect(
      run({ sshSigningKey: SSH_KEY, useCommitSigning: false }),
    ).resolves.toBeDefined();
    expect(setupSshSigningSpy).toHaveBeenCalledTimes(1);
  });
});
