import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { agentMode } from "../../src/modes/agent";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";
import * as gitConfig from "../../src/github/operations/git-config";

describe("Agent Mode", () => {
  let mockContext: GitHubContext;
  let exportVariableSpy: any;
  let setOutputSpy: any;
  let configureGitAuthSpy: any;

  beforeEach(() => {
    mockContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
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

  test("agent mode has correct properties", () => {
    expect(agentMode.name).toBe("agent");
    expect(agentMode.description).toBe(
      "Direct automation mode for explicit prompts",
    );
    expect(agentMode.shouldCreateTrackingComment()).toBe(false);
    expect(agentMode.getAllowedTools()).toEqual([]);
    expect(agentMode.getDisallowedTools()).toEqual([]);
  });

  test("prepareContext returns minimal data", () => {
    const context = agentMode.prepareContext(mockContext);

    expect(context.mode).toBe("agent");
    expect(context.githubContext).toBe(mockContext);
    // Agent mode doesn't use comment tracking or branch management
    expect(Object.keys(context)).toEqual(["mode", "githubContext"]);
  });

  test("agent mode only triggers when prompt is provided", () => {
    // Should NOT trigger for automation events without prompt
    const workflowDispatchContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    expect(agentMode.shouldTrigger(workflowDispatchContext)).toBe(false);

    const scheduleContext = createMockAutomationContext({
      eventName: "schedule",
    });
    expect(agentMode.shouldTrigger(scheduleContext)).toBe(false);

    const repositoryDispatchContext = createMockAutomationContext({
      eventName: "repository_dispatch",
    });
    expect(agentMode.shouldTrigger(repositoryDispatchContext)).toBe(false);

    // Should NOT trigger for entity events without prompt
    const entityEvents = [
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    entityEvents.forEach((eventName) => {
      const contextNoPrompt = createMockContext({ eventName });
      expect(agentMode.shouldTrigger(contextNoPrompt)).toBe(false);
    });

    // Should trigger for ANY event when prompt is provided
    const allEvents = [
      "workflow_dispatch",
      "repository_dispatch",
      "schedule",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    allEvents.forEach((eventName) => {
      const contextWithPrompt =
        eventName === "workflow_dispatch" ||
        eventName === "repository_dispatch" ||
        eventName === "schedule"
          ? createMockAutomationContext({
              eventName,
              inputs: { prompt: "Do something" },
            })
          : createMockContext({
              eventName,
              inputs: { prompt: "Do something" },
            });
      expect(agentMode.shouldTrigger(contextWithPrompt)).toBe(true);
    });
  });

  test("prepare method passes through claude_args", async () => {
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
    const result = await agentMode.prepare({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify claude_args includes user args (no MCP config in agent mode without allowed tools)
    const callArgs = setOutputSpy.mock.calls[0];
    expect(callArgs[0]).toBe("claude_args");
    expect(callArgs[1]).toBe("--model claude-sonnet-4 --max-turns 10");
    expect(callArgs[1]).not.toContain("--mcp-config");

    // Verify return structure - should use "main" as fallback when no env vars set
    expect(result).toEqual({
      commentId: undefined,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: expect.any(String),
    });

    // Clean up
    delete process.env.CLAUDE_ARGS;
    if (originalHeadRef !== undefined)
      process.env.GITHUB_HEAD_REF = originalHeadRef;
    if (originalRefName !== undefined)
      process.env.GITHUB_REF_NAME = originalRefName;
  });

  test("prepare method rejects bot actors without allowed_bots", async () => {
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
      agentMode.prepare({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).rejects.toThrow(
      "Workflow initiated by non-human actor: claude (type: Bot)",
    );
  });

  test("prepare method allows bot actors when in allowed_bots list", async () => {
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
      agentMode.prepare({
        context: contextWithPrompts,
        octokit: mockOctokit,
        githubToken: "test-token",
      }),
    ).resolves.toBeDefined();
  });

  test("prepare method creates prompt file with correct content", async () => {
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
    await agentMode.prepare({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Note: We can't easily test file creation in this unit test,
    // but we can verify the method completes without errors
    // With our conditional MCP logic, agent mode with no allowed tools
    // should not include any MCP config
    const callArgs = setOutputSpy.mock.calls[0];
    expect(callArgs[0]).toBe("claude_args");
    // Should be empty or just whitespace when no MCP servers are included
    expect(callArgs[1]).not.toContain("--mcp-config");
  });
});
