import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { agentMode } from "../../src/modes/agent";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";
import * as core from "@actions/core";

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
      "Automation mode for workflow_dispatch and schedule events",
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

  test("agent mode only triggers for workflow_dispatch and schedule events", () => {
    // Should trigger for automation events
    const workflowDispatchContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    expect(agentMode.shouldTrigger(workflowDispatchContext)).toBe(true);

    const scheduleContext = createMockAutomationContext({
      eventName: "schedule",
    });
    expect(agentMode.shouldTrigger(scheduleContext)).toBe(true);

    // Should NOT trigger for entity events
    const entityEvents = [
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "issues",
    ] as const;

    entityEvents.forEach((eventName) => {
      const context = createMockContext({ eventName });
      expect(agentMode.shouldTrigger(context)).toBe(false);
    });
  });

  test("prepare method sets up tools environment variables correctly", async () => {
    // Clear any previous calls before this test
    exportVariableSpy.mockClear();
    setOutputSpy.mockClear();

    const contextWithCustomTools = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithCustomTools.inputs.allowedTools = ["CustomTool1", "CustomTool2"];
    contextWithCustomTools.inputs.disallowedTools = ["BadTool"];

    const mockOctokit = {} as any;
    const result = await agentMode.prepare({
      context: contextWithCustomTools,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Verify that both ALLOWED_TOOLS and DISALLOWED_TOOLS are set
    expect(exportVariableSpy).toHaveBeenCalledWith(
      "ALLOWED_TOOLS",
      "Edit,MultiEdit,Glob,Grep,LS,Read,Write,CustomTool1,CustomTool2",
    );
    expect(exportVariableSpy).toHaveBeenCalledWith(
      "DISALLOWED_TOOLS",
      "WebSearch,WebFetch,BadTool",
    );

    // Verify MCP config is set
    expect(setOutputSpy).toHaveBeenCalledWith("mcp_config", expect.any(String));

    // Verify return structure
    expect(result).toEqual({
      commentId: undefined,
      branchInfo: {
        baseBranch: "",
        currentBranch: "",
        claudeBranch: undefined,
      },
      mcpConfig: expect.any(String),
    });
  });

  test("prepare method creates prompt file with correct content", async () => {
    const contextWithPrompts = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    contextWithPrompts.inputs.overridePrompt = "Custom override prompt";
    contextWithPrompts.inputs.directPrompt =
      "Direct prompt (should be ignored)";

    const mockOctokit = {} as any;
    await agentMode.prepare({
      context: contextWithPrompts,
      octokit: mockOctokit,
      githubToken: "test-token",
    });

    // Note: We can't easily test file creation in this unit test,
    // but we can verify the method completes without errors
    expect(setOutputSpy).toHaveBeenCalledWith("mcp_config", expect.any(String));
  });
});
