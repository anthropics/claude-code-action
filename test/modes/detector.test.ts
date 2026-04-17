import { describe, expect, it } from "bun:test";
import { detectMode } from "../../src/modes/detector";
import type { GitHubContext } from "../../src/github/context";

describe("detectMode with enhanced routing", () => {
  const baseContext = {
    runId: "test-run",
    eventAction: "opened",
    repository: {
      owner: "test-owner",
      repo: "test-repo",
      full_name: "test-owner/test-repo",
    },
    actor: "test-user",
    inputs: {
      prompt: "",
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      branchPrefix: "claude/",
      useStickyComment: false,
      classifyInlineComments: true,
      useCommitSigning: false,
      sshSigningKey: "",
      botId: "123456",
      botName: "claude-bot",
      allowedBots: "",
      allowedNonWriteUsers: "",
      trackProgress: false,
      includeFixLinks: true,
      includeCommentsByActor: "",
      excludeCommentsByActor: "",
      multiAgentReview: "false",
      reviewDebateRounds: 1,
      reviewMaxAgents: 5,
    },
  };

  describe("PR Events with track_progress", () => {
    it("should use tag mode when track_progress is true for pull_request.opened", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, trackProgress: true },
      };

      expect(detectMode(context)).toBe("tag");
    });

    it("should use tag mode when track_progress is true for pull_request.synchronize", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "synchronize",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, trackProgress: true },
      };

      expect(detectMode(context)).toBe("tag");
    });

    it("should use agent mode when track_progress is false for pull_request.opened", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, trackProgress: false },
      };

      expect(detectMode(context)).toBe("agent");
    });

    it("should throw error when track_progress is used with unsupported PR action", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "closed",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, trackProgress: true },
      };

      expect(() => detectMode(context)).toThrow(
        /track_progress for pull_request events is only supported for actions/,
      );
    });
  });

  describe("Issue Events with track_progress", () => {
    it("should use tag mode when track_progress is true for issues.opened", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "Test" } } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, trackProgress: true },
      };

      expect(detectMode(context)).toBe("tag");
    });

    it("should use agent mode when track_progress is false for issues", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "Test" } } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, trackProgress: false },
      };

      expect(detectMode(context)).toBe("agent");
    });

    it("should use agent mode for issues with explicit prompt", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "Test issue" } } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, prompt: "Analyze this issue" },
      };

      expect(detectMode(context)).toBe("agent");
    });

    it("should use tag mode for issues with @claude mention and no prompt", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "@claude help" } } as any,
        entityNumber: 1,
        isPR: false,
      };

      expect(detectMode(context)).toBe("tag");
    });
  });

  describe("Comment Events (unchanged behavior)", () => {
    it("should use tag mode for issue_comment with @claude mention", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "@claude help" },
        } as any,
        entityNumber: 1,
        isPR: false,
      };

      expect(detectMode(context)).toBe("tag");
    });

    it("should use agent mode for issue_comment with prompt provided", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "@claude help" },
        } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, prompt: "Review this PR" },
      };

      expect(detectMode(context)).toBe("agent");
    });

    it("should use tag mode for PR review comments with @claude mention", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request_review_comment",
        payload: {
          pull_request: { number: 1, body: "Test" },
          comment: { body: "@claude check this" },
        } as any,
        entityNumber: 1,
        isPR: true,
      };

      expect(detectMode(context)).toBe("tag");
    });
  });

  describe("Automation Events (should error with track_progress)", () => {
    it("should throw error when track_progress is used with workflow_dispatch", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "workflow_dispatch",
        payload: {} as any,
        inputs: { ...baseContext.inputs, trackProgress: true },
      };

      expect(() => detectMode(context)).toThrow(
        /track_progress is only supported /,
      );
    });

    it("should use agent mode for workflow_dispatch without track_progress", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "workflow_dispatch",
        payload: {} as any,
        inputs: { ...baseContext.inputs, prompt: "Run workflow" },
      };

      expect(detectMode(context)).toBe("agent");
    });
  });

  describe("Custom prompt injection in tag mode", () => {
    it("should use tag mode for PR events when both track_progress and prompt are provided", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          trackProgress: true,
          prompt: "Review for security issues",
        },
      };

      expect(detectMode(context)).toBe("tag");
    });

    it("should use tag mode for issue events when both track_progress and prompt are provided", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "Test" } } as any,
        entityNumber: 1,
        isPR: false,
        inputs: {
          ...baseContext.inputs,
          trackProgress: true,
          prompt: "Analyze this issue",
        },
      };

      expect(detectMode(context)).toBe("tag");
    });
  });

  describe("Review Mode", () => {
    it("should detect review mode when multiAgentReview is 'true' on a PR", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "true" },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should detect review mode when multiAgentReview is 'auto' on a PR", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "auto" },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should not detect review mode on issues even with multiAgentReview 'true'", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issues",
        eventAction: "opened",
        payload: { issue: { number: 1, body: "Test" } } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, multiAgentReview: "true" },
      };

      // Not a PR, so should not be review mode
      expect(detectMode(context)).not.toBe("review");
    });

    it("should not detect review mode when multiAgentReview is 'false'", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "false" },
      };

      expect(detectMode(context)).not.toBe("review");
    });

    it("should prioritize review mode over tag mode when both apply", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          multiAgentReview: "true",
          trackProgress: true,
        },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should detect review mode for issue_comment on PR with 'true' and trigger phrase", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        eventAction: "created",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "@claude help" },
        } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "true" },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should detect review mode for pull_request_review_comment with 'true' and trigger", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request_review_comment",
        eventAction: "created",
        payload: {
          pull_request: { number: 1, body: "Test" },
          comment: { body: "@claude check this" },
        } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "true" },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should NOT detect review mode for issue_comment on PR without trigger phrase", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        eventAction: "created",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "unrelated chatter" },
        } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "true" },
      };

      // Guards against review self-triggering via its own posted comments.
      expect(detectMode(context)).not.toBe("review");
    });

    it("should detect review mode when 'auto' with explicit prompt (prompt is team guidance, not opt-out)", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          multiAgentReview: "auto",
          prompt: "Review for security issues",
        },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should detect review mode when 'auto' with trackProgress (tracker covers it)", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          multiAgentReview: "auto",
          trackProgress: true,
        },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should detect review mode for issue_comment on PR with 'auto' and trigger phrase", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        eventAction: "created",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "@claude help" },
        } as any,
        entityNumber: 1,
        isPR: true,
        inputs: { ...baseContext.inputs, multiAgentReview: "auto" },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should NOT detect review mode for issue_comment on a non-PR issue even with 'auto'", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "issue_comment",
        eventAction: "created",
        payload: {
          issue: { number: 1, body: "Test" },
          comment: { body: "@claude help" },
        } as any,
        entityNumber: 1,
        isPR: false,
        inputs: { ...baseContext.inputs, multiAgentReview: "auto" },
      };

      expect(detectMode(context)).not.toBe("review");
    });

    it("should use review mode when 'true' even with prompt", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          multiAgentReview: "true",
          prompt: "Review for security issues",
        },
      };

      expect(detectMode(context)).toBe("review");
    });

    it("should use review mode when all of auto + prompt + trackProgress combine (ai-feature-store scenario)", () => {
      const context: GitHubContext = {
        ...baseContext,
        eventName: "pull_request",
        eventAction: "opened",
        payload: { pull_request: { number: 1 } } as any,
        entityNumber: 1,
        isPR: true,
        inputs: {
          ...baseContext.inputs,
          multiAgentReview: "auto",
          prompt: "Please review per team conventions",
          trackProgress: true,
        },
      };

      expect(detectMode(context)).toBe("review");
    });
  });
});
