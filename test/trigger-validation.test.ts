import {
  checkContainsTrigger,
  escapeRegExp,
} from "../src/github/validation/trigger";
import { describe, it, expect } from "bun:test";
import {
  createMockContext,
  mockIssueAssignedContext,
  mockIssueLabeledContext,
  mockIssueCommentContext,
  mockIssueOpenedContext,
  mockPullRequestReviewContext,
  mockPullRequestReviewCommentContext,
} from "./mockContext";
import type {
  IssueCommentEvent,
  IssuesAssignedEvent,
  IssuesEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
} from "@octokit/webhooks-types";
import type { ParsedGitHubContext } from "../src/github/context";

describe("checkContainsTrigger", () => {
  describe("prompt trigger", () => {
    it("should return true when prompt is provided", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        inputs: {
          prompt: "Fix the bug in the login form",
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          labelTrigger: "",
          branchPrefix: "claude/",
          useStickyComment: false,
          classifyInlineComments: true,
          useCommitSigning: false,
          allowedBots: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false when prompt is empty", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        payload: {
          action: "opened",
          issue: {
            number: 1,
            title: "Test Issue",
            body: "Test body without trigger",
            created_at: "2023-01-01T00:00:00Z",
            user: { login: "testuser" },
          },
        } as IssuesEvent,
        inputs: {
          prompt: "",
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          labelTrigger: "",
          branchPrefix: "claude/",
          useStickyComment: false,
          classifyInlineComments: true,
          useCommitSigning: false,
          allowedBots: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(false);
    });
  });

  describe("assignee trigger", () => {
    it("should return true when issue is assigned to the trigger user", () => {
      const context = mockIssueAssignedContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should add @ symbol from assignee trigger", () => {
      const context = {
        ...mockIssueAssignedContext,
        inputs: {
          ...mockIssueAssignedContext.inputs,
          assigneeTrigger: "claude-bot",
        },
      };
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false when issue is assigned to a different user", () => {
      const context = {
        ...mockIssueAssignedContext,
        payload: {
          ...mockIssueAssignedContext.payload,
          assignee: {
            ...(mockIssueAssignedContext.payload as IssuesAssignedEvent)
              .assignee,
            login: "otherUser",
          },
          issue: {
            ...(mockIssueAssignedContext.payload as IssuesAssignedEvent).issue,
            assignee: {
              ...(mockIssueAssignedContext.payload as IssuesAssignedEvent).issue
                .assignee,
              login: "otherUser",
            },
          },
        },
      } as ParsedGitHubContext;

      expect(checkContainsTrigger(context)).toBe(false);
    });
  });

  describe("label trigger", () => {
    it("should return true when issue is labeled with the trigger label", () => {
      const context = mockIssueLabeledContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false when issue is labeled with a different label", () => {
      const context = {
        ...mockIssueLabeledContext,
        payload: {
          ...mockIssueLabeledContext.payload,
          label: {
            ...(mockIssueLabeledContext.payload as any).label,
            name: "bug",
          },
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(false);
    });

    it("should return true when the labeled name differs only in case from the trigger", () => {
      const context = {
        ...mockIssueLabeledContext,
        payload: {
          ...mockIssueLabeledContext.payload,
          label: {
            ...(mockIssueLabeledContext.payload as any).label,
            name: "Claude-Task",
          },
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false for non-labeled events", () => {
      const context = {
        ...mockIssueLabeledContext,
        eventAction: "opened",
        payload: {
          ...mockIssueLabeledContext.payload,
          action: "opened",
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(false);
    });
  });

  describe("issue body and title trigger", () => {
    it("should return true when issue body contains trigger phrase", () => {
      const context = mockIssueOpenedContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true when issue title contains trigger phrase", () => {
      const context = {
        ...mockIssueOpenedContext,
        payload: {
          ...mockIssueOpenedContext.payload,
          issue: {
            ...(mockIssueOpenedContext.payload as IssuesEvent).issue,
            title: "/claude Fix the login bug",
            body: "The login page is broken",
          },
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should handle trigger phrase with punctuation", () => {
      const baseContext = {
        ...mockIssueOpenedContext,
        inputs: {
          ...mockIssueOpenedContext.inputs,
          triggerPhrase: "@claude",
        },
      };

      // Test various punctuation marks
      const testCases = [
        { issueBody: "@claude, can you help?", expected: true },
        { issueBody: "@claude. Please look at this", expected: true },
        { issueBody: "@claude! This is urgent", expected: true },
        { issueBody: "@claude? What do you think?", expected: true },
        { issueBody: "@claude: here's the issue", expected: true },
        { issueBody: "@claude; and another thing", expected: true },
        { issueBody: "Hey @claude, can you help?", expected: true },
        { issueBody: "@Claude can you help?", expected: true },
        { issueBody: "@CLAUDE fix this", expected: true },
        { issueBody: "claudette contains claude", expected: false },
        { issueBody: "email@claude.com", expected: false },
      ];

      testCases.forEach(({ issueBody, expected }) => {
        const context = {
          ...baseContext,
          payload: {
            ...baseContext.payload,
            issue: {
              ...(baseContext.payload as IssuesEvent).issue,
              body: issueBody,
            },
          },
        } as ParsedGitHubContext;
        expect(checkContainsTrigger(context)).toBe(expected);
      });
    });

    it("should return false when trigger phrase is part of another word", () => {
      const context = {
        ...mockIssueOpenedContext,
        payload: {
          ...mockIssueOpenedContext.payload,
          issue: {
            ...(mockIssueOpenedContext.payload as IssuesEvent).issue,
            body: "claudette helped me with this",
          },
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(false);
    });

    it("should handle trigger phrase in title with punctuation", () => {
      const baseContext = {
        ...mockIssueOpenedContext,
        inputs: {
          ...mockIssueOpenedContext.inputs,
          triggerPhrase: "@claude",
        },
      };

      const testCases = [
        { issueTitle: "@claude, can you help?", expected: true },
        { issueTitle: "@claude: Fix this bug", expected: true },
        { issueTitle: "Bug: @claude please review", expected: true },
        { issueTitle: "email@claude.com issue", expected: false },
        { issueTitle: "claudette needs help", expected: false },
      ];

      testCases.forEach(({ issueTitle, expected }) => {
        const context = {
          ...baseContext,
          payload: {
            ...baseContext.payload,
            issue: {
              ...(baseContext.payload as IssuesEvent).issue,
              title: issueTitle,
              body: "No trigger in body",
            },
          },
        } as ParsedGitHubContext;
        expect(checkContainsTrigger(context)).toBe(expected);
      });
    });
  });

  describe("pull request body and title trigger", () => {
    it("should return true when PR body contains trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        payload: {
          action: "opened",
          pull_request: {
            number: 123,
            title: "Test PR",
            body: "@claude can you review this?",
            created_at: "2023-01-01T00:00:00Z",
            user: { login: "testuser" },
          },
        } as PullRequestEvent,
        inputs: {
          prompt: "",
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          labelTrigger: "",
          branchPrefix: "claude/",
          useStickyComment: false,
          classifyInlineComments: true,
          useCommitSigning: false,
          allowedBots: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true when PR title contains trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        payload: {
          action: "opened",
          pull_request: {
            number: 123,
            title: "@claude Review this PR",
            body: "This PR fixes a bug",
            created_at: "2023-01-01T00:00:00Z",
            user: { login: "testuser" },
          },
        } as PullRequestEvent,
        inputs: {
          prompt: "",
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          labelTrigger: "",
          branchPrefix: "claude/",
          useStickyComment: false,
          classifyInlineComments: true,
          useCommitSigning: false,
          allowedBots: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false when PR body doesn't contain trigger phrase", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        payload: {
          action: "opened",
          pull_request: {
            number: 123,
            title: "Test PR",
            body: "This PR fixes a bug",
            created_at: "2023-01-01T00:00:00Z",
            user: { login: "testuser" },
          },
        } as PullRequestEvent,
        inputs: {
          prompt: "",
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          labelTrigger: "",
          branchPrefix: "claude/",
          useStickyComment: false,
          classifyInlineComments: true,
          useCommitSigning: false,
          allowedBots: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(false);
    });
  });

  describe("comment trigger", () => {
    it("should return true for issue_comment with trigger phrase", () => {
      const context = mockIssueCommentContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true for pull_request_review_comment with trigger phrase", () => {
      const context = mockPullRequestReviewCommentContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true for pull_request_review with submitted action and trigger phrase", () => {
      const context = mockPullRequestReviewContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true for pull_request_review with edited action and trigger phrase", () => {
      const context = {
        ...mockPullRequestReviewContext,
        eventAction: "edited",
        payload: {
          ...mockPullRequestReviewContext.payload,
          action: "edited",
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false for pull_request_review with different action", () => {
      const context = {
        ...mockPullRequestReviewContext,
        eventAction: "dismissed",
        payload: {
          ...mockPullRequestReviewContext.payload,
          action: "dismissed",
          review: {
            ...(mockPullRequestReviewContext.payload as PullRequestReviewEvent)
              .review,
            body: "/claude please review this PR",
          },
        },
      } as ParsedGitHubContext;
      expect(checkContainsTrigger(context)).toBe(false);
    });

    it("should handle pull_request_review with punctuation", () => {
      const baseContext = {
        ...mockPullRequestReviewContext,
        inputs: {
          ...mockPullRequestReviewContext.inputs,
          triggerPhrase: "@claude",
        },
      };

      const testCases = [
        { commentBody: "@claude, please review", expected: true },
        { commentBody: "@claude. fix this", expected: true },
        { commentBody: "@claude!", expected: true },
        { commentBody: "claude@example.com", expected: false },
        { commentBody: "claudette", expected: false },
      ];

      testCases.forEach(({ commentBody, expected }) => {
        const context = {
          ...baseContext,
          payload: {
            ...baseContext.payload,
            review: {
              ...(baseContext.payload as PullRequestReviewEvent).review,
              body: commentBody,
            },
          },
        } as ParsedGitHubContext;
        expect(checkContainsTrigger(context)).toBe(expected);
      });
    });

    it("should handle comment trigger with punctuation", () => {
      const baseContext = {
        ...mockIssueCommentContext,
        inputs: {
          ...mockIssueCommentContext.inputs,
          triggerPhrase: "@claude",
        },
      };

      const testCases = [
        { commentBody: "@claude, please review", expected: true },
        { commentBody: "@claude. fix this", expected: true },
        { commentBody: "@claude!", expected: true },
        { commentBody: "claude@example.com", expected: false },
        { commentBody: "claudette", expected: false },
      ];

      testCases.forEach(({ commentBody, expected }) => {
        const context = {
          ...baseContext,
          payload: {
            ...baseContext.payload,
            comment: {
              ...(baseContext.payload as IssueCommentEvent).comment,
              body: commentBody,
            },
          },
        } as ParsedGitHubContext;
        expect(checkContainsTrigger(context)).toBe(expected);
      });
    });
  });
});

describe("escapeRegExp", () => {
  it("should escape special regex characters", () => {
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    );
  });

  it("should not escape regular characters", () => {
    expect(escapeRegExp("abc123")).toBe("abc123");
  });

  it("should handle mixed characters", () => {
    expect(escapeRegExp("hello.world")).toBe("hello\\.world");
    expect(escapeRegExp("test[123]")).toBe("test\\[123\\]");
  });
});

describe("checkContainsTrigger with a prompt on issue events", () => {
  const issueEvent = (
    payloadExtra: object,
    eventAction: string,
    inputs: object,
  ): ParsedGitHubContext =>
    createMockContext({
      eventName: "issues",
      eventAction,
      inputs: {
        prompt: "Triage this issue",
        labelTrigger: "claude-task",
        assigneeTrigger: "",
        ...inputs,
      } as any,
      payload: { action: eventAction, issue: { number: 1 }, ...payloadExtra },
    } as any);

  it("does not start on a label other than the trigger label", () => {
    expect(
      checkContainsTrigger(
        issueEvent({ label: { name: "bug" } }, "labeled", {}),
      ),
    ).toBe(false);
  });

  it("starts on the trigger label, ignoring case", () => {
    expect(
      checkContainsTrigger(
        issueEvent({ label: { name: "Claude-Task" } }, "labeled", {}),
      ),
    ).toBe(true);
  });

  it("does not start on an assignment to someone else", () => {
    expect(
      checkContainsTrigger(
        issueEvent({ assignee: { login: "teammate" } }, "assigned", {
          assigneeTrigger: "claude-bot",
        }),
      ),
    ).toBe(false);
  });

  it("starts on any assignment when no assignee trigger is set", () => {
    expect(
      checkContainsTrigger(
        issueEvent({ assignee: { login: "teammate" } }, "assigned", {}),
      ),
    ).toBe(true);
  });

  it("still starts on other issue events", () => {
    expect(checkContainsTrigger(issueEvent({}, "opened", {}))).toBe(true);
  });
});

describe("checkContainsTrigger when the text is someone else's", () => {
  const commentEvent = (eventAction: string, author: string, actor: string) =>
    ({
      ...mockIssueCommentContext,
      eventAction,
      actor,
      payload: {
        ...mockIssueCommentContext.payload,
        action: eventAction,
        comment: {
          ...(mockIssueCommentContext.payload as any).comment,
          body: "@claude do this",
          user: { login: author },
        },
      },
    }) as ParsedGitHubContext;

  it("starts on a person's own new comment", () => {
    const context = commentEvent("created", "maintainer", "maintainer");
    expect(
      checkContainsTrigger({
        ...context,
        inputs: { ...context.inputs, triggerPhrase: "@claude" },
      }),
    ).toBe(true);
  });

  it("does not start when a maintainer edits an outsider's comment", () => {
    const context = commentEvent("edited", "outsider", "maintainer");
    expect(
      checkContainsTrigger({
        ...context,
        inputs: { ...context.inputs, triggerPhrase: "@claude" },
      }),
    ).toBe(false);
  });

  it("does not start on someone else's edited comment even with a prompt", () => {
    const context = commentEvent("edited", "outsider", "maintainer");
    expect(
      checkContainsTrigger({
        ...context,
        inputs: { ...context.inputs, prompt: "Triage this" },
      }),
    ).toBe(false);
  });

  it("does not start on a deleted comment, even the actor's own", () => {
    const context = commentEvent("deleted", "maintainer", "maintainer");
    expect(
      checkContainsTrigger({
        ...context,
        inputs: { ...context.inputs, triggerPhrase: "@claude" },
      }),
    ).toBe(false);
  });

  it("does not start when a review was written by someone else", () => {
    const base = mockPullRequestReviewContext;
    const payload = base.payload as any;
    expect(
      checkContainsTrigger({
        ...base,
        actor: "maintainer",
        eventAction: "edited",
        inputs: { ...base.inputs, triggerPhrase: "@claude" },
        payload: {
          ...payload,
          action: "edited",
          review: {
            ...payload.review,
            body: "@claude do this",
            user: { login: "outsider" },
          },
        },
      } as ParsedGitHubContext),
    ).toBe(false);
  });
});
