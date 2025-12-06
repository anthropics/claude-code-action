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
  mockPullRequestReviewWithoutCommentContext,
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
          CLAUDE_BRANCH: "claude/issue-67890-20240101-1200",
        };
      });

      test("should parse issue_comment event correctly", () => {
        const result = prepareContext(
          mockIssueCommentContext,
          "12345",
          "main",
          "claude/issue-67890-20240101-1200",
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
            "claude/issue-67890-20240101-1200",
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
            "claude/issue-67890-20240101-1200",
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

  describe("pull_request_review event without comment", () => {
    test("should parse pull_request_review event correctly", () => {
      process.env = BASE_ENV;
      const result = prepareContext(
        mockPullRequestReviewWithoutCommentContext,
        "12345",
      );

      expect(result.eventData.eventName).toBe("pull_request_review");
      expect(result.eventData.isPR).toBe(true);
      expect(result.triggerUsername).toBe("senior-developer");
      if (result.eventData.eventName === "pull_request_review") {
        expect(result.eventData.prNumber).toBe("321");
        expect(result.eventData.commentBody).toBe("");
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
        CLAUDE_BRANCH: "claude/issue-42-20240101-1200",
      };
    });

    test("should parse issue opened event correctly", () => {
      const result = prepareContext(
        mockIssueOpenedContext,
        "12345",
        "main",
        "claude/issue-42-20240101-1200",
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
          "claude/issue-42-20240101-1200",
        );
      }
    });

    test("should parse issue assigned event correctly", () => {
      const result = prepareContext(
        mockIssueAssignedContext,
        "12345",
        "main",
        "claude/issue-123-20240101-1200",
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
          "claude/issue-123-20240101-1200",
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
          "claude/issue-42-20240101-1200",
        ),
      ).toThrow("BASE_BRANCH is required for issues event");
    });

    test("should allow issue assigned event with prompt and no assigneeTrigger", () => {
      const contextWithDirectPrompt = createMockContext({
        ...mockIssueAssignedContext,
        inputs: {
          ...mockIssueAssignedContext.inputs,
          assigneeTrigger: "", // No assignee trigger
          prompt: "Please assess this issue", // But prompt is provided
        },
      });

      const result = prepareContext(
        contextWithDirectPrompt,
        "12345",
        "main",
        "claude/issue-123-20240101-1200",
      );

      expect(result.eventData.eventName).toBe("issues");
      expect(result.eventData.isPR).toBe(false);
      expect(result.prompt).toBe("Please assess this issue");
      if (
        result.eventData.eventName === "issues" &&
        result.eventData.eventAction === "assigned"
      ) {
        expect(result.eventData.issueNumber).toBe("123");
        expect(result.eventData.assigneeTrigger).toBeUndefined();
      }
    });

    test("should throw error when neither assigneeTrigger nor prompt provided for issue assigned event", () => {
      const contextWithoutTriggers = createMockContext({
        ...mockIssueAssignedContext,
        inputs: {
          ...mockIssueAssignedContext.inputs,
          assigneeTrigger: "", // No assignee trigger
          prompt: "", // No prompt
        },
      });

      expect(() =>
        prepareContext(
          contextWithoutTriggers,
          "12345",
          "main",
          "claude/issue-123-20240101-1200",
        ),
      ).toThrow("ASSIGNEE_TRIGGER is required for issue assigned event");
    });
  });

  describe("context generation", () => {
    test("should generate context without legacy fields", () => {
      process.env = BASE_ENV;
      const context = createMockContext({
        ...mockPullRequestCommentContext,
        inputs: {
          ...mockPullRequestCommentContext.inputs,
        },
      });
      const result = prepareContext(context, "12345");

      // Verify context is created without legacy fields
      expect(result.repository).toBe("test-owner/test-repo");
      expect(result.claudeCommentId).toBe("12345");
      expect(result.triggerPhrase).toBe("/claude");
      expect((result as any).customInstructions).toBeUndefined();
      expect((result as any).allowedTools).toBeUndefined();
    });
  });
});
