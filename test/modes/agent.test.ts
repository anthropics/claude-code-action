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
import { createMockAutomationContext, createMockContext } from "../mockContext";
import * as core from "@actions/core";
import * as gitConfig from "../../src/github/operations/git-config";

describe("Agent Mode", () => {
  let exportVariableSpy: any;
  let setOutputSpy: any;
  let configureGitAuthSpy: any;
  let replaceCheckoutCredentialsSpy: any;

  beforeEach(() => {
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    // Mock git configuration to prevent actual git commands from running
    configureGitAuthSpy = spyOn(
      gitConfig,
      "configureGitAuth",
    ).mockImplementation(async () => {
      // Do nothing - prevent actual git config modifications
    });
    replaceCheckoutCredentialsSpy = spyOn(
      gitConfig,
      "replaceCheckoutCredentials",
    ).mockImplementation(async () => {});
  });

  afterEach(() => {
    exportVariableSpy?.mockClear();
    setOutputSpy?.mockClear();
    configureGitAuthSpy?.mockClear();
    replaceCheckoutCredentialsSpy?.mockClear();
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
    configureGitAuthSpy?.mockRestore();
    replaceCheckoutCredentialsSpy?.mockRestore();
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

  describe("git credential configuration", () => {
    const mockOctokit = {
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({
              data: { login: "test-user", id: 12345, type: "User" },
            }),
          ),
        },
      },
    } as any;

    test("uses full git auth on the non-signing path", async () => {
      const context = createMockAutomationContext({
        eventName: "workflow_dispatch",
      });

      await prepareAgentMode({
        context,
        octokit: mockOctokit,
        githubToken: "test-token",
      });

      expect(configureGitAuthSpy).toHaveBeenCalledTimes(1);
      expect(configureGitAuthSpy).toHaveBeenCalledWith("test-token", context, {
        login: context.inputs.botName,
        id: parseInt(context.inputs.botId),
      });
      // configureGitAuth performs the credential replacement itself; the mock
      // stands in for it here, so the standalone helper is not invoked.
      expect(replaceCheckoutCredentialsSpy).not.toHaveBeenCalled();
    });

    test("still replaces the checkout credential when API commit signing is enabled", async () => {
      const context = createMockAutomationContext({
        eventName: "workflow_dispatch",
        inputs: { useCommitSigning: true },
      });

      await prepareAgentMode({
        context,
        octokit: mockOctokit,
        githubToken: "test-token",
      });

      expect(configureGitAuthSpy).not.toHaveBeenCalled();
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledTimes(1);
      expect(replaceCheckoutCredentialsSpy).toHaveBeenCalledWith(
        "test-token",
        context,
      );
    });
  });
});

describe("Agent Mode file ops branch on PR events", () => {
  const envKeys = ["GITHUB_HEAD_REF", "GITHUB_REF_NAME", "CLAUDE_ARGS"];
  const saved: Record<string, string | undefined> = {};
  let spies: any[] = [];

  beforeEach(() => {
    for (const k of envKeys) saved[k] = process.env[k];
    delete process.env.GITHUB_HEAD_REF;
    delete process.env.CLAUDE_ARGS;
    spies = [
      spyOn(core, "exportVariable").mockImplementation(() => {}),
      spyOn(core, "setOutput").mockImplementation(() => {}),
      spyOn(gitConfig, "configureGitAuth").mockImplementation(async () => {}),
      spyOn(gitConfig, "replaceCheckoutCredentials").mockImplementation(
        async () => {},
      ),
    ];
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    for (const s of spies) s.mockRestore();
  });

  const head = (full_name: string) => ({
    ref: "feature-x",
    repo: { full_name },
  });

  const octokitWith = (pullsGet?: () => Promise<unknown>) =>
    ({
      rest: {
        users: {
          getByUsername: mock(() =>
            Promise.resolve({ data: { login: "dev", id: 1, type: "User" } }),
          ),
        },
        pulls: { get: mock(pullsGet ?? (() => Promise.reject(new Error()))) },
      },
    }) as any;

  async function fileOpsBranch(context: any, octokit: any) {
    const result = await prepareAgentMode({
      context,
      octokit,
      githubToken: "test-token",
    });
    return JSON.parse(result.mcpConfig).mcpServers.github_file_ops.env
      .BRANCH_NAME;
  }

  for (const eventName of [
    "pull_request_review",
    "pull_request_review_comment",
  ] as const) {
    test(`${eventName}: commits go to the PR head branch, not <number>/merge`, async () => {
      process.env.GITHUB_REF_NAME = "123/merge";
      const context = createMockContext({
        eventName,
        isPR: true,
        entityNumber: 123,
        payload: {
          pull_request: { number: 123, head: head("test-owner/test-repo") },
        } as any,
        inputs: { prompt: "fix it", useCommitSigning: true },
      });

      expect(await fileOpsBranch(context, octokitWith())).toBe("feature-x");
    });
  }

  test("issue_comment on a PR: commits go to the PR head branch, not the default branch", async () => {
    process.env.GITHUB_REF_NAME = "main";
    const context = createMockContext({
      eventName: "issue_comment",
      isPR: true,
      entityNumber: 123,
      payload: { issue: { number: 123, pull_request: {} } } as any,
      inputs: { prompt: "fix it", useCommitSigning: true },
    });
    const octokit = octokitWith(() =>
      Promise.resolve({ data: { head: head("test-owner/test-repo") } }),
    );

    expect(await fileOpsBranch(context, octokit)).toBe("feature-x");
  });

  test("issue_comment on a PR without use_commit_signing: no PR lookup", async () => {
    process.env.GITHUB_REF_NAME = "main";
    const context = createMockContext({
      eventName: "issue_comment",
      isPR: true,
      entityNumber: 123,
      payload: { issue: { number: 123, pull_request: {} } } as any,
      inputs: { prompt: "fix it", useCommitSigning: false },
    });
    const octokit = octokitWith();

    await prepareAgentMode({ context, octokit, githubToken: "test-token" });
    expect(octokit.rest.pulls.get).not.toHaveBeenCalled();
  });

  test("PR from a fork keeps the previous fallback", async () => {
    process.env.GITHUB_REF_NAME = "123/merge";
    const context = createMockContext({
      eventName: "pull_request_review_comment",
      isPR: true,
      entityNumber: 123,
      payload: {
        pull_request: { number: 123, head: head("someone/test-repo") },
      } as any,
      inputs: { prompt: "fix it", useCommitSigning: true },
    });

    expect(await fileOpsBranch(context, octokitWith())).toBe("123/merge");
  });
});
