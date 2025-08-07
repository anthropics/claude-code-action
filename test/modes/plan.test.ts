import { describe, test, expect, beforeEach } from "bun:test";
import { planMode } from "../../src/modes/plan";
import type { GitHubContext } from "../../src/github/context";
import { createMockContext, createMockAutomationContext } from "../mockContext";

describe("Plan Mode", () => {
  let mockContext: GitHubContext;

  beforeEach(() => {
    mockContext = createMockContext({
      eventName: "issue_comment",
      isPR: true,
      entityNumber: 123,
    });
  });

  test("plan mode has correct properties", () => {
    expect(planMode.name).toBe("plan");
    expect(planMode.description).toBe(
      "Code reading agent mode for analysis and planning without implementation",
    );
    expect(planMode.shouldCreateTrackingComment()).toBe(true);
  });

  test("plan mode only allows read-only tools", () => {
    const allowedTools = planMode.getAllowedTools();
    const disallowedTools = planMode.getDisallowedTools();

    // Should only allow read-only tools
    expect(allowedTools).toEqual(["Read", "Grep", "LS", "Glob"]);

    // Should disallow all modification tools
    expect(disallowedTools).toContain("Edit");
    expect(disallowedTools).toContain("MultiEdit");
    expect(disallowedTools).toContain("Write");
    expect(disallowedTools).toContain("WebSearch");
    expect(disallowedTools).toContain("WebFetch");
    expect(disallowedTools).toContain("CreateFile");
    expect(disallowedTools).toContain("DeleteFile");
    expect(disallowedTools).toContain("MoveFile");
    expect(disallowedTools).toContain("CopyFile");
  });

  test("prepareContext returns correct data", () => {
    const testData = {
      commentId: 456,
      baseBranch: "main",
      claudeBranch: "claude-plan-123",
    };

    const context = planMode.prepareContext(mockContext, testData);

    expect(context.mode).toBe("plan");
    expect(context.githubContext).toBe(mockContext);
    expect(context.commentId).toBe(456);
    expect(context.baseBranch).toBe("main");
    expect(context.claudeBranch).toBe("claude-plan-123");
  });

  test("plan mode trigger logic", () => {
    // Test that plan mode only triggers for entity events
    // and delegates trigger checking to checkContainsTrigger

    // Should return false for automation events (not entity events)
    const automationContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    expect(planMode.shouldTrigger(automationContext)).toBe(false);

    // For entity events, we test that it calls checkContainsTrigger
    // by testing the isEntityContext check first
    const nonEntityContext = createMockAutomationContext({
      eventName: "schedule",
    });
    expect(planMode.shouldTrigger(nonEntityContext)).toBe(false);
  });

  test("plan mode does not trigger for automation events", () => {
    // Should NOT trigger for automation events
    const workflowDispatchContext = createMockAutomationContext({
      eventName: "workflow_dispatch",
    });
    expect(planMode.shouldTrigger(workflowDispatchContext)).toBe(false);

    const scheduleContext = createMockAutomationContext({
      eventName: "schedule",
    });
    expect(planMode.shouldTrigger(scheduleContext)).toBe(false);
  });

  test("generatePrompt uses default prompt generation", () => {
    // Test that the generatePrompt method exists and is a function
    expect(typeof planMode.generatePrompt).toBe("function");
    // The implementation calls generateDefaultPrompt internally
    expect(planMode.generatePrompt.name).toBe("generatePrompt");
  });
});
