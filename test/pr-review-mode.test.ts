import { describe, test, expect } from "bun:test";
import { detectMode } from "../src/modes/detector";
import { mockPullRequestReviewRequestedContext } from "./mockContext";

describe("PR Review Mode Detection", () => {
  test("should detect pr_review mode for review_requested event with matching reviewer", () => {
    const context = mockPullRequestReviewRequestedContext;
    const detectedMode = detectMode(context);

    expect(detectedMode).toBe("pr_review");
  });

  test("should detect pr_review mode even with custom prompt", () => {
    const contextWithPrompt = {
      ...mockPullRequestReviewRequestedContext,
      inputs: {
        ...mockPullRequestReviewRequestedContext.inputs,
        prompt: "Focus on security and performance issues",
      },
    };

    const detectedMode = detectMode(contextWithPrompt);

    expect(detectedMode).toBe("pr_review");
  });

  test("should not detect pr_review mode when reviewer doesn't match", () => {
    const contextWithDifferentReviewer = {
      ...mockPullRequestReviewRequestedContext,
      inputs: {
        ...mockPullRequestReviewRequestedContext.inputs,
        reviewerTrigger: "@different-bot",
      },
    };

    const detectedMode = detectMode(contextWithDifferentReviewer);

    expect(detectedMode).toBe("agent"); // Should fall back to agent mode
  });

  test("should not detect pr_review mode when no reviewerTrigger is set", () => {
    const contextWithoutTrigger = {
      ...mockPullRequestReviewRequestedContext,
      inputs: {
        ...mockPullRequestReviewRequestedContext.inputs,
        reviewerTrigger: "",
      },
    };

    const detectedMode = detectMode(contextWithoutTrigger);

    expect(detectedMode).toBe("agent"); // Should fall back to agent mode
  });
});
