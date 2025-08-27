import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { agentMode } from "../../src/modes/agent";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";
import * as fetcher from "../../src/github/data/fetcher";

describe("Agent Mode", () => {
  let mockContext: GitHubContext;
  let exportVariableSpy: any;
  let setOutputSpy: any;

  beforeEach(() => {
    mockContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    exportVariableSpy = spyOn(core, "exportVariable").mockImplementation(
      () => {},
    );
    setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
  });

  afterEach(() => {
    exportVariableSpy?.mockClear();
    setOutputSpy?.mockClear();
    exportVariableSpy?.mockRestore();
    setOutputSpy?.mockRestore();
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
      "schedule",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    allEvents.forEach((eventName) => {
      const contextWithPrompt =
        eventName === "workflow_dispatch" || eventName === "schedule"
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

    const mockOctokit = {} as any;
    const result = await agentMode.prepare({
      context: contextWithCustomArgs,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify claude_args includes MCP config and user args
    const callArgs = setOutputSpy.mock.calls[0];
    expect(callArgs[0]).toBe("claude_args");
    expect(callArgs[1]).toContain("--mcp-config");
    expect(callArgs[1]).toContain("--model claude-sonnet-4 --max-turns 10");

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

  test("prepare method creates prompt file with correct content", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    // In v1-dev, we only have the unified prompt field
    contextWithPrompts.inputs.prompt = "Custom prompt content";

    const mockOctokit = {} as any;
    await agentMode.prepare({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Note: We can't easily test file creation in this unit test,
    // but we can verify the method completes without errors
    // Agent mode now includes MCP config even with empty user args
    const callArgs = setOutputSpy.mock.calls[0];
    expect(callArgs[0]).toBe("claude_args");
    expect(callArgs[1]).toContain("--mcp-config");
  });

  test("downloads GitHub assets when enabled for entity context", async () => {
    // Mock the fetchGitHubData function
    const mockImageMap = new Map([
      [
        "https://github.com/user-attachments/assets/image1",
        "/tmp/github-images/image-123.png",
      ],
      [
        "https://github.com/user-attachments/assets/image2",
        "/tmp/github-images/image-456.jpg",
      ],
    ]);
    const fetchSpy = spyOn(fetcher, "fetchGitHubData").mockResolvedValue({
      contextData: {} as any,
      comments: [],
      changedFiles: [],
      changedFilesWithSHA: [],
      reviewData: null,
      imageUrlMap: mockImageMap,
      triggerDisplayName: null,
    });

    // Create an entity context (issue comment)
    const entityContext = createMockContext({
      eventName: "issue_comment",
      inputs: { prompt: "Analyze images" },
    });

    // Set download assets environment variable
    const originalDownload = process.env.DOWNLOAD_GITHUB_ASSETS;
    process.env.DOWNLOAD_GITHUB_ASSETS = "true";

    const mockOctokit = {} as any;

    await agentMode.prepare({
      context: entityContext,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify fetchGitHubData was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith({
      octokits: mockOctokit,
      repository: `${entityContext.repository.owner}/${entityContext.repository.repo}`,
      prNumber: entityContext.entityNumber.toString(),
      isPR: entityContext.isPR,
      triggerUsername: entityContext.actor,
    });

    // Verify CLAUDE_ASSET_FILES environment variable was set
    expect(process.env.CLAUDE_ASSET_FILES).toBe(
      "/tmp/github-images/image-123.png,/tmp/github-images/image-456.jpg",
    );

    // Clean up
    delete process.env.CLAUDE_ASSET_FILES;
    if (originalDownload !== undefined) {
      process.env.DOWNLOAD_GITHUB_ASSETS = originalDownload;
    } else {
      delete process.env.DOWNLOAD_GITHUB_ASSETS;
    }
    fetchSpy.mockRestore();
  });

  test("skips asset download when disabled", async () => {
    const fetchSpy = spyOn(fetcher, "fetchGitHubData");

    const entityContext = createMockContext({
      eventName: "issue_comment",
      inputs: { prompt: "Analyze images" },
    });

    // Ensure download assets is disabled (default)
    const originalDownload = process.env.DOWNLOAD_GITHUB_ASSETS;
    process.env.DOWNLOAD_GITHUB_ASSETS = "false";

    const mockOctokit = {} as any;

    await agentMode.prepare({
      context: entityContext,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify fetchGitHubData was NOT called
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(process.env.CLAUDE_ASSET_FILES).toBeUndefined();

    // Clean up
    if (originalDownload !== undefined) {
      process.env.DOWNLOAD_GITHUB_ASSETS = originalDownload;
    } else {
      delete process.env.DOWNLOAD_GITHUB_ASSETS;
    }
    fetchSpy.mockRestore();
  });

  test("handles asset download errors gracefully", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = spyOn(fetcher, "fetchGitHubData").mockRejectedValue(
      new Error("Network error"),
    );

    const entityContext = createMockContext({
      eventName: "issue_comment",
      inputs: { prompt: "Analyze images" },
    });

    // Set download assets environment variable
    const originalDownload = process.env.DOWNLOAD_GITHUB_ASSETS;
    process.env.DOWNLOAD_GITHUB_ASSETS = "true";

    const mockOctokit = {} as any;

    // This should not throw despite the error
    await agentMode.prepare({
      context: entityContext,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify error was logged but execution continued
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to download GitHub assets:",
      expect.any(Error),
    );
    expect(process.env.CLAUDE_ASSET_FILES).toBeUndefined();

    // Clean up
    if (originalDownload !== undefined) {
      process.env.DOWNLOAD_GITHUB_ASSETS = originalDownload;
    } else {
      delete process.env.DOWNLOAD_GITHUB_ASSETS;
    }
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
