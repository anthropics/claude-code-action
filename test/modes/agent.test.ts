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
  let replaceCheckoutCredentialsSpy: any;

  const savedBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const savedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
  const savedSettings = process.env.INPUT_SETTINGS;
  const savedExecutable = process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;

  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ALLOWED_NON_WRITE_USERS;
    delete process.env.INPUT_SETTINGS;
    delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
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
    if (savedBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = savedBaseUrl;
    if (savedNonWriteUsers === undefined) {
      delete process.env.ALLOWED_NON_WRITE_USERS;
    } else {
      process.env.ALLOWED_NON_WRITE_USERS = savedNonWriteUsers;
    }
    if (savedSettings === undefined) delete process.env.INPUT_SETTINGS;
    else process.env.INPUT_SETTINGS = savedSettings;
    if (savedExecutable === undefined) {
      delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
    } else {
      process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE = savedExecutable;
    }
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
    expect(result.claudeArgs).toBe(
      "--permission-mode auto --model claude-sonnet-4 --max-turns 10",
    );
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
      claudeArgs:
        "--permission-mode auto --model claude-sonnet-4 --max-turns 10",
    });

    // Sessions behind a gateway keep the earlier default of no flag
    process.env.ANTHROPIC_BASE_URL = "https://gateway.example.com";
    const behindGateway = await prepareAgentMode({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });
    expect(behindGateway.claudeArgs).toBe(
      "--model claude-sonnet-4 --max-turns 10",
    );
    delete process.env.ANTHROPIC_BASE_URL;

    // A permission mode in the settings input isn't replaced by the default
    process.env.INPUT_SETTINGS = JSON.stringify({
      permissions: { defaultMode: "dontAsk" },
    });
    const withSettingsMode = await prepareAgentMode({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });
    expect(withSettingsMode.claudeArgs).toBe(
      "--model claude-sonnet-4 --max-turns 10",
    );

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

  describe("the branch for pull request events", () => {
    const originalHeadRef = process.env.GITHUB_HEAD_REF;
    const originalClaudeBranch = process.env.CLAUDE_BRANCH;

    beforeEach(() => {
      process.env.GITHUB_HEAD_REF = "release";
      delete process.env.CLAUDE_BRANCH;
    });

    afterEach(() => {
      if (originalHeadRef === undefined) delete process.env.GITHUB_HEAD_REF;
      else process.env.GITHUB_HEAD_REF = originalHeadRef;
      if (originalClaudeBranch !== undefined) {
        process.env.CLAUDE_BRANCH = originalClaudeBranch;
      }
    });

    const branchFor = async (
      headRepository: string | null,
      overrides: Record<string, unknown> = {},
    ) => {
      const context = {
        ...createMockAutomationContext({
          repository: {
            owner: "test-owner",
            repo: "test-repo",
            full_name: "test-owner/test-repo",
            default_branch: "main",
          },
        }),
        eventName: "pull_request",
        entityNumber: 5,
        isPR: true,
        inputs: {
          ...createMockAutomationContext().inputs,
          useCommitSigning: true,
        },
        payload: {
          pull_request: {
            number: 5,
            head: headRepository
              ? { ref: "release", repo: { full_name: headRepository } }
              : { ref: "release" },
          },
        },
        ...overrides,
      } as any;
      const octokit = {
        rest: {
          users: {
            getAuthenticated: mock(() =>
              Promise.resolve({
                data: { login: "test-user", id: 1, type: "User" },
              }),
            ),
            getByUsername: mock(() =>
              Promise.resolve({
                data: { login: "test-user", id: 1, type: "User" },
              }),
            ),
          },
        },
      } as any;
      const result = await prepareAgentMode({
        context,
        octokit,
        githubToken: "test-token",
      });
      // The branch commit_files writes to through the API
      return JSON.parse(result.mcpConfig).mcpServers.github_file_ops.env
        .BRANCH_NAME;
    };

    test("uses pr-N for a fork, not the fork's branch name", async () => {
      expect(await branchFor("attacker/test-repo")).toBe("pr-5");
    });

    test("uses pr-N when the head repository is unknown", async () => {
      expect(await branchFor(null)).toBe("pr-5");
    });

    test("keeps the branch name for the same repository", async () => {
      expect(await branchFor("Test-Owner/test-repo")).toBe("release");
    });

    test("uses pr-N for a fork's review event", async () => {
      expect(
        await branchFor("attacker/test-repo", {
          eventName: "pull_request_review",
        }),
      ).toBe("pr-5");
    });

    test("keeps the branch name for a review in the same repository", async () => {
      delete process.env.GITHUB_HEAD_REF;
      expect(
        await branchFor("test-owner/test-repo", {
          eventName: "pull_request_review",
        }),
      ).toBe("release");
    });

    test("uses pr-N for a comment on a PR, not the default branch", async () => {
      delete process.env.GITHUB_HEAD_REF;
      process.env.GITHUB_REF_NAME = "main";
      try {
        expect(
          await branchFor(null, {
            eventName: "issue_comment",
            payload: { issue: { number: 5, pull_request: {} } },
          }),
        ).toBe("pr-5");
      } finally {
        delete process.env.GITHUB_REF_NAME;
      }
    });

    test.each(["issue_comment", "issues"])(
      "uses issue-N for %s, not the default branch",
      async (eventName) => {
        delete process.env.GITHUB_HEAD_REF;
        process.env.GITHUB_REF_NAME = "main";
        try {
          expect(
            await branchFor(null, {
              eventName,
              isPR: false,
              payload: { issue: { number: 5 } },
            }),
          ).toBe("issue-5");
        } finally {
          delete process.env.GITHUB_REF_NAME;
        }
      },
    );

    test("a workflow's CLAUDE_BRANCH wins over issue-N", async () => {
      process.env.CLAUDE_BRANCH = "prepared";
      try {
        expect(
          await branchFor(null, {
            eventName: "issues",
            isPR: false,
            payload: { issue: { number: 5 } },
          }),
        ).toBe("prepared");
      } finally {
        delete process.env.CLAUDE_BRANCH;
      }
    });
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
