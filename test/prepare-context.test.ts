#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { prepareContext } from "../src/create-prompt";
import {
  createMockContext,
  mockIssueOpenedContext,
  mockIssueAssignedContext,
  mockIssueCommentContext,
  mockPullRequestCommentContext,
  mockPullRequestReviewContext,
  mockPullRequestReviewCommentContext,
} from "./mockContext";

const BASE_ENV = {
  CLAUDE_COMMENT_ID: "12345",
  GITHUB_TOKEN: "test-token",
};

describe("parseEnvVarsWithContext", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("issue_comment event", () => {
    describe("on issue", () => {
      beforeEach(() => {
        process.env = {
          ...BASE_ENV,
          BASE_BRANCH: "main",
          CLAUDE_BRANCH: "claude/issue-67890-20240101_120000",
        };
      });

      test("should parse issue_comment event correctly", () => {
        const result = prepareContext(
          mockIssueCommentContext,
          "12345",
          "main",
          "claude/issue-67890-20240101_120000",
        );

        expect(result.repository).toBe("test-owner/test-repo");
        expect(result.claudeCommentId).toBe("12345");
        expect(result.triggerPhrase).toBe("@claude");
        expect(result.triggerUsername).toBe("contributor-user");
        expect(result.eventData.eventName).toBe("issue_comment");
        expect(result.eventData.isPR).toBe(false);
        if (
          result.eventData.eventName === "issue_comment" &&
          !result.eventData.isPR
        ) {
          expect(result.eventData.issueNumber).toBe("55");
          expect(result.eventData.commentId).toBe("12345678");
          expect(result.eventData.claudeBranch).toBe(
            "claude/issue-67890-20240101_120000",
          );
          expect(result.eventData.baseBranch).toBe("main");
          expect(result.eventData.commentBody).toBe(
            "@claude can you help explain how to configure the logging system?",
          );
        }
      });

      test("should throw error when CLAUDE_BRANCH is missing", () => {
        expect(() =>
          prepareContext(mockIssueCommentContext, "12345", "main"),
        ).toThrow("CLAUDE_BRANCH is required for issue_comment event");
      });

      test("should throw error when BASE_BRANCH is missing", () => {
        expect(() =>
          prepareContext(
            mockIssueCommentContext,
            "12345",
            undefined,
            "claude/issue-67890-20240101_120000",
          ),
        ).toThrow("BASE_BRANCH is required for issue_comment event");
      });
    });

    describe("on PR", () => {
      test("should parse PR issue_comment event correctly", () => {
        process.env = BASE_ENV;
        const result = prepareContext(mockPullRequestCommentContext, "12345");

        expect(result.eventData.eventName).toBe("issue_comment");
        expect(result.eventData.isPR).toBe(true);
        expect(result.triggerUsername).toBe("reviewer-user");
        if (
          result.eventData.eventName === "issue_comment" &&
          result.eventData.isPR
        ) {
          expect(result.eventData.prNumber).toBe("789");
          expect(result.eventData.commentId).toBe("87654321");
          expect(result.eventData.commentBody).toBe(
            "/claude please review the changes and ensure we're not introducing any new memory issues",
          );
        }
      });
    });
  });

  describe("pull_request_review event", () => {
    test("should parse pull_request_review event correctly", () => {
      process.env = BASE_ENV;
      const result = prepareContext(mockPullRequestReviewContext, "12345");

      expect(result.eventData.eventName).toBe("pull_request_review");
      expect(result.eventData.isPR).toBe(true);
      expect(result.triggerUsername).toBe("senior-developer");
      if (result.eventData.eventName === "pull_request_review") {
        expect(result.eventData.prNumber).toBe("321");
        expect(result.eventData.commentBody).toBe(
          "@claude can you check if the error handling is comprehensive enough in this PR?",
        );
      }
    });
  });

  describe("pull_request_review_comment event", () => {
    test("should parse pull_request_review_comment event correctly", () => {
      process.env = BASE_ENV;
      const result = prepareContext(
        mockPullRequestReviewCommentContext,
        "12345",
      );

      expect(result.eventData.eventName).toBe("pull_request_review_comment");
      expect(result.eventData.isPR).toBe(true);
      expect(result.triggerUsername).toBe("code-reviewer");
      if (result.eventData.eventName === "pull_request_review_comment") {
        expect(result.eventData.prNumber).toBe("999");
        expect(result.eventData.commentId).toBe("99988877");
        expect(result.eventData.commentBody).toBe(
          "/claude is this the most efficient way to implement this algorithm?",
        );
      }
    });
  });

  describe("issues event", () => {
    beforeEach(() => {
      process.env = {
        ...BASE_ENV,
        BASE_BRANCH: "main",
        CLAUDE_BRANCH: "claude/issue-42-20240101_120000",
      };
    });

    test("should parse issue opened event correctly", () => {
      const result = prepareContext(
        mockIssueOpenedContext,
        "12345",
        "main",
        "claude/issue-42-20240101_120000",
      );

      expect(result.eventData.eventName).toBe("issues");
      expect(result.eventData.isPR).toBe(false);
      expect(result.triggerUsername).toBe("john-doe");
      if (
        result.eventData.eventName === "issues" &&
        result.eventData.eventAction === "opened"
      ) {
        expect(result.eventData.issueNumber).toBe("42");
        expect(result.eventData.baseBranch).toBe("main");
        expect(result.eventData.claudeBranch).toBe(
          "claude/issue-42-20240101_120000",
        );
      }
    });

    test("should parse issue assigned event correctly", () => {
      const result = prepareContext(
        mockIssueAssignedContext,
        "12345",
        "main",
        "claude/issue-123-20240101_120000",
      );

      expect(result.eventData.eventName).toBe("issues");
      expect(result.eventData.isPR).toBe(false);
      expect(result.triggerUsername).toBe("jane-smith");
      if (
        result.eventData.eventName === "issues" &&
        result.eventData.eventAction === "assigned"
      ) {
        expect(result.eventData.issueNumber).toBe("123");
        expect(result.eventData.baseBranch).toBe("main");
        expect(result.eventData.claudeBranch).toBe(
          "claude/issue-123-20240101_120000",
        );
        expect(result.eventData.assigneeTrigger).toBe("@claude-bot");
      }
    });

    test("should throw error when CLAUDE_BRANCH is missing for issues", () => {
      expect(() =>
        prepareContext(mockIssueOpenedContext, "12345", "main"),
      ).toThrow("CLAUDE_BRANCH is required for issues event");
    });

    test("should throw error when BASE_BRANCH is missing for issues", () => {
      expect(() =>
        prepareContext(
          mockIssueOpenedContext,
          "12345",
          undefined,
          "claude/issue-42-20240101_120000",
        ),
      ).toThrow("BASE_BRANCH is required for issues event");
    });
  });

  describe("optional fields", () => {
    test("should include custom instructions when provided", () => {
      process.env = BASE_ENV;
      const contextWithCustomInstructions = createMockContext({
        ...mockPullRequestCommentContext,
        inputs: {
          ...mockPullRequestCommentContext.inputs,
          customInstructions: "Be concise",
        },
      });
      const result = prepareContext(contextWithCustomInstructions, "12345");

      expect(result.customInstructions).toBe("Be concise");
    });

    test("should include allowed tools when provided", () => {
      process.env = BASE_ENV;
      const contextWithAllowedTools = createMockContext({
        ...mockPullRequestCommentContext,
        inputs: {
          ...mockPullRequestCommentContext.inputs,
          allowedTools: ["Tool1", "Tool2"],
        },
      });
      const result = prepareContext(contextWithAllowedTools, "12345");

      expect(result.allowedTools).toBe("Tool1,Tool2");
    });
  });

  test("should throw error for unsupported event type", () => {
    process.env = BASE_ENV;
    const unsupportedContext = createMockContext({
      eventName: "unsupported_event",
      eventAction: "whatever",
    });
    expect(() => prepareContext(unsupportedContext, "12345")).toThrow(
      "Unsupported event type: unsupported_event",
    );
  });
});
