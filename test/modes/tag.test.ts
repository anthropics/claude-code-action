import { describe, test, expect, beforeEach } from "bun:test";
import { tagMode } from "../../src/modes/tag";
import type { ParsedGitHubContext } from "../../src/github/context";
import type { IssueCommentEvent } from "@octokit/webhooks-types";
import { createMockContext } from "../mockContext";

describe("Tag Mode", () => {
  let mockContext: ParsedGitHubContext;

  beforeEach(() => {
    mockContext = createMockContext({
      eventName: "issue_comment",
      isPR: false,
    });
  });

  test("tag mode has correct properties", () => {
    expect(tagMode.name).toBe("tag");
    expect(tagMode.description).toBe(
      "Traditional implementation mode triggered by @claude mentions",
    );
    expect(tagMode.shouldCreateTrackingComment()).toBe(true);
  });

  test("shouldTrigger delegates to checkContainsTrigger", () => {
    const contextWithTrigger = createMockContext({
      eventName: "issue_comment",
      isPR: false,
      inputs: {
        ...createMockContext().inputs,
        triggerPhrase: "@claude",
      },
      payload: {
        comment: {
          body: "Hey @claude, can you help?",
        },
      } as IssueCommentEvent,
    });

    expect(tagMode.shouldTrigger(contextWithTrigger)).toBe(true);

    const contextWithoutTrigger = createMockContext({
      eventName: "issue_comment",
      isPR: false,
      inputs: {
        ...createMockContext().inputs,
        triggerPhrase: "@claude",
      },
      payload: {
        comment: {
          body: "This is just a regular comment",
        },
      } as IssueCommentEvent,
    });

    expect(tagMode.shouldTrigger(contextWithoutTrigger)).toBe(false);
  });

  test("prepareContext includes all required data", () => {
    const data = {
      commentId: 123,
      baseBranch: "main",
      claudeBranch: "claude/fix-bug",
    };

    const context = tagMode.prepareContext(mockContext, data);

    expect(context.mode).toBe("tag");
    expect(context.githubContext).toBe(mockContext);
    expect(context.commentId).toBe(123);
    expect(context.baseBranch).toBe("main");
    expect(context.claudeBranch).toBe("claude/fix-bug");
  });

  test("prepareContext works without data", () => {
    const context = tagMode.prepareContext(mockContext);

    expect(context.mode).toBe("tag");
    expect(context.githubContext).toBe(mockContext);
    expect(context.commentId).toBeUndefined();
    expect(context.baseBranch).toBeUndefined();
    expect(context.claudeBranch).toBeUndefined();
  });

  test("getAllowedTools returns empty array", () => {
    expect(tagMode.getAllowedTools()).toEqual([]);
  });

  test("getDisallowedTools returns empty array", () => {
    expect(tagMode.getDisallowedTools()).toEqual([]);
  });
});
