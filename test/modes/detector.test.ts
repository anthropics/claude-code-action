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
      useCommitSigning: false,
      sshSigningKey: "",
      botId: "123456",
      botName: "claude-bot",
      allowedBots: "",
      allowedNonWriteUsers: "",
      trackProgress: false,
      includeFixLinks: true,
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
});
