import { describe, test, expect, beforeEach } from "bun:test";
import { agentMode } from "../../src/modes/agent";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";

describe("Agent Mode", () => {
  let mockContext: GitHubContext;

  beforeEach(() => {
    mockContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
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
});
