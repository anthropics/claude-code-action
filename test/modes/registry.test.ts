import { describe, test, expect } from "bun:test";
import { getMode, isValidMode } from "../../src/modes/registry";
import type { ModeName } from "../../src/modes/types";
import { tagMode } from "../../src/modes/tag";
import { agentMode } from "../../src/modes/agent";
import { reviewMode } from "../../src/modes/review";
import { planMode } from "../../src/modes/plan";
import { createMockContext, createMockAutomationContext } from "../mockContext";

describe("Mode Registry", () => {
  const mockContext = createMockContext({
    eventName: "issue_comment",
  });

  const mockWorkflowDispatchContext = createMockAutomationContext({
    eventName: "workflow_dispatch",
  });

  const mockScheduleContext = createMockAutomationContext({
    eventName: "schedule",
  });

  test("getMode returns tag mode for standard events", () => {
    const mode = getMode("tag", mockContext);
    expect(mode).toBe(tagMode);
    expect(mode.name).toBe("tag");
  });

  test("getMode returns agent mode", () => {
    const mode = getMode("agent", mockContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode returns experimental-review mode", () => {
    const mode = getMode("experimental-review", mockContext);
    expect(mode).toBe(reviewMode);
    expect(mode.name).toBe("experimental-review");
  });

  test("getMode returns plan mode", () => {
    const mode = getMode("plan", mockContext);
    expect(mode).toBe(planMode);
    expect(mode.name).toBe("plan");
  });

  test("getMode throws error for tag mode with workflow_dispatch event", () => {
    expect(() => getMode("tag", mockWorkflowDispatchContext)).toThrow(
      "Tag mode cannot handle workflow_dispatch events. Use 'agent' mode for automation events.",
    );
  });

  test("getMode throws error for tag mode with schedule event", () => {
    expect(() => getMode("tag", mockScheduleContext)).toThrow(
      "Tag mode cannot handle schedule events. Use 'agent' mode for automation events.",
    );
  });

  test("getMode allows agent mode for workflow_dispatch event", () => {
    const mode = getMode("agent", mockWorkflowDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode allows agent mode for schedule event", () => {
    const mode = getMode("agent", mockScheduleContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode throws error for invalid mode", () => {
    const invalidMode = "invalid" as unknown as ModeName;
    expect(() => getMode(invalidMode, mockContext)).toThrow(
      "Invalid mode 'invalid'. Valid modes are: 'tag', 'agent', 'experimental-review', 'plan'. Please check your workflow configuration.",
    );
  });

  test("isValidMode returns true for all valid modes", () => {
    expect(isValidMode("tag")).toBe(true);
    expect(isValidMode("agent")).toBe(true);
    expect(isValidMode("experimental-review")).toBe(true);
    expect(isValidMode("plan")).toBe(true);
  });

  test("isValidMode returns false for invalid mode", () => {
    expect(isValidMode("invalid")).toBe(false);
  });
});
