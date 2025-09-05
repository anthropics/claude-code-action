import { describe, test, expect } from "bun:test";
import { getMode, isValidMode } from "../../src/modes/registry";
import { agentMode } from "../../src/modes/agent";
import { tagMode } from "../../src/modes/tag";
import {
  createMockContext,
  createMockAutomationContext,
  mockRepositoryDispatchContext,
} from "../mockContext";

describe("Mode Registry", () => {
  const mockContext = createMockContext({
    eventName: "issue_comment",
    payload: {
      action: "created",
      comment: {
        body: "Test comment without trigger",
      },
    } as any,
  });

  const mockWorkflowDispatchContext = createMockAutomationContext({
    eventName: "workflow_dispatch",
  });

  const mockScheduleContext = createMockAutomationContext({
    eventName: "schedule",
  });

  test("getMode auto-detects agent mode for issue_comment without trigger", () => {
    const mode = getMode(mockContext);
    // Agent mode is the default when no trigger is found
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent mode for workflow_dispatch", () => {
    const mode = getMode(mockWorkflowDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  // Removed test - explicit mode override no longer supported in v1.0

  test("getMode auto-detects agent for workflow_dispatch", () => {
    const mode = getMode(mockWorkflowDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent for schedule event", () => {
    const mode = getMode(mockScheduleContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent for repository_dispatch event", () => {
    const mode = getMode(mockRepositoryDispatchContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode auto-detects agent for repository_dispatch with client_payload", () => {
    const contextWithPayload = createMockAutomationContext({
      eventName: "repository_dispatch",
      payload: {
        action: "trigger-analysis",
        client_payload: {
          source: "external-system",
          metadata: { priority: "high" },
        },
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
        },
        sender: { login: "automation-user" },
      },
    });

    const mode = getMode(contextWithPayload);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  // Removed test - legacy mode names no longer supported in v1.0

  test("getMode auto-detects agent mode for PR opened", () => {
    const prContext = createMockContext({
      eventName: "pull_request",
      payload: { action: "opened" } as any,
      isPR: true,
    });
    const mode = getMode(prContext);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode uses agent mode when prompt is provided, even with @claude mention", () => {
    const contextWithPrompt = createMockContext({
      eventName: "issue_comment",
      payload: {
        action: "created",
        comment: {
          body: "@claude please help",
        },
      } as any,
      inputs: {
        prompt: "/review",
      } as any,
    });
    const mode = getMode(contextWithPrompt);
    expect(mode).toBe(agentMode);
    expect(mode.name).toBe("agent");
  });

  test("getMode uses tag mode for @claude mention without prompt", () => {
    // Ensure PROMPT env var is not set (clean up from previous tests)
    const originalPrompt = process.env.PROMPT;
    delete process.env.PROMPT;

    const contextWithMention = createMockContext({
      eventName: "issue_comment",
      payload: {
        action: "created",
        comment: {
          body: "@claude please help",
        },
      } as any,
      inputs: {
        triggerPhrase: "@claude",
        prompt: "",
      } as any,
    });
    const mode = getMode(contextWithMention);
    expect(mode).toBe(tagMode);
    expect(mode.name).toBe("tag");

    // Restore original value if it existed
    if (originalPrompt !== undefined) {
      process.env.PROMPT = originalPrompt;
    }
  });

  // Removed test - explicit mode override no longer supported in v1.0

  test("isValidMode returns true for all valid modes", () => {
    expect(isValidMode("tag")).toBe(true);
    expect(isValidMode("agent")).toBe(true);
  });

  test("isValidMode returns false for invalid mode", () => {
    expect(isValidMode("invalid")).toBe(false);
    expect(isValidMode("review")).toBe(false);
  });
});
