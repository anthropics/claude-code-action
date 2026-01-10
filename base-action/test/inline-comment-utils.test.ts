#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import {
  findExistingRootComment,
  resolveInReplyTo,
  type ReviewComment,
} from "../../src/mcp/inline-comment-utils";

describe("inline-comment-utils", () => {
  describe("findExistingRootComment", () => {
    const mockComments: ReviewComment[] = [
      {
        id: 100,
        path: "src/index.ts",
        line: 42,
        original_line: 42,
        in_reply_to_id: null,
      },
      {
        id: 101,
        path: "src/index.ts",
        line: 42,
        original_line: 42,
        in_reply_to_id: 100, // This is a reply, not a root comment
      },
      {
        id: 102,
        path: "src/utils.ts",
        line: 10,
        original_line: 10,
        in_reply_to_id: null,
      },
      {
        id: 103,
        path: "src/index.ts",
        line: 50,
        original_line: 55, // original_line differs from current line
        in_reply_to_id: null,
      },
    ];

    test("should find existing root comment on same path and line", () => {
      const result = findExistingRootComment(mockComments, "src/index.ts", 42);
      expect(result).toBeDefined();
      expect(result?.id).toBe(100);
    });

    test("should not find reply comments (only root comments)", () => {
      // Comment 101 is on the same line but it's a reply
      const replyComment = mockComments[1]!;
      const comments: ReviewComment[] = [replyComment];
      const result = findExistingRootComment(comments, "src/index.ts", 42);
      expect(result).toBeUndefined();
    });

    test("should find comment by original_line when line doesn't match", () => {
      const result = findExistingRootComment(mockComments, "src/index.ts", 55);
      expect(result).toBeDefined();
      expect(result?.id).toBe(103);
    });

    test("should return undefined when no matching comment exists", () => {
      const result = findExistingRootComment(mockComments, "src/index.ts", 999);
      expect(result).toBeUndefined();
    });

    test("should return undefined when path doesn't match", () => {
      const result = findExistingRootComment(
        mockComments,
        "src/nonexistent.ts",
        42,
      );
      expect(result).toBeUndefined();
    });

    test("should return undefined when targetLine is undefined", () => {
      const result = findExistingRootComment(
        mockComments,
        "src/index.ts",
        undefined,
      );
      expect(result).toBeUndefined();
    });

    test("should return undefined when comments array is empty", () => {
      const result = findExistingRootComment([], "src/index.ts", 42);
      expect(result).toBeUndefined();
    });
  });

  describe("resolveInReplyTo", () => {
    const mockComments: ReviewComment[] = [
      {
        id: 100,
        path: "src/index.ts",
        line: 42,
        original_line: 42,
        in_reply_to_id: null,
      },
      {
        id: 102,
        path: "src/utils.ts",
        line: 10,
        original_line: 10,
        in_reply_to_id: null,
      },
    ];

    test("should return explicit in_reply_to when provided", () => {
      const result = resolveInReplyTo(999, mockComments, "src/index.ts", 42);
      expect(result).toBe(999);
    });

    test("should auto-detect existing comment when in_reply_to is undefined", () => {
      const result = resolveInReplyTo(
        undefined,
        mockComments,
        "src/index.ts",
        42,
      );
      expect(result).toBe(100);
    });

    test("should return undefined when no explicit in_reply_to and no existing comment", () => {
      const result = resolveInReplyTo(
        undefined,
        mockComments,
        "src/index.ts",
        999,
      );
      expect(result).toBeUndefined();
    });

    test("should prioritize explicit in_reply_to over auto-detection", () => {
      // Even though there's an existing comment on line 42, explicit value takes precedence
      const result = resolveInReplyTo(555, mockComments, "src/index.ts", 42);
      expect(result).toBe(555);
    });

    test("should handle empty comments array with undefined in_reply_to", () => {
      const result = resolveInReplyTo(undefined, [], "src/index.ts", 42);
      expect(result).toBeUndefined();
    });
  });

  describe("auto-deduplication scenarios", () => {
    test("Scenario: First review creates new comment (no existing comments)", () => {
      const existingComments: ReviewComment[] = [];
      const result = resolveInReplyTo(
        undefined,
        existingComments,
        "src/index.ts",
        42,
      );
      // No existing comment, should create new thread
      expect(result).toBeUndefined();
    });

    test("Scenario: Second review should reply to first comment (deduplication)", () => {
      const existingComments: ReviewComment[] = [
        {
          id: 100,
          path: "src/index.ts",
          line: 42,
          original_line: 42,
          in_reply_to_id: null,
        },
      ];
      const result = resolveInReplyTo(
        undefined,
        existingComments,
        "src/index.ts",
        42,
      );
      // Should reply to existing comment instead of creating duplicate
      expect(result).toBe(100);
    });

    test("Scenario: Third review should still reply to root comment (not to second reply)", () => {
      const existingComments: ReviewComment[] = [
        {
          id: 100,
          path: "src/index.ts",
          line: 42,
          original_line: 42,
          in_reply_to_id: null, // Root comment
        },
        {
          id: 101,
          path: "src/index.ts",
          line: 42,
          original_line: 42,
          in_reply_to_id: 100, // Reply to root
        },
      ];
      const result = resolveInReplyTo(
        undefined,
        existingComments,
        "src/index.ts",
        42,
      );
      // Should reply to root comment (100), not to the reply (101)
      expect(result).toBe(100);
    });

    test("Scenario: Different file should not trigger deduplication", () => {
      const existingComments: ReviewComment[] = [
        {
          id: 100,
          path: "src/index.ts",
          line: 42,
          original_line: 42,
          in_reply_to_id: null,
        },
      ];
      const result = resolveInReplyTo(
        undefined,
        existingComments,
        "src/other.ts", // Different file
        42,
      );
      // Different file, should create new thread
      expect(result).toBeUndefined();
    });

    test("Scenario: Different line should not trigger deduplication", () => {
      const existingComments: ReviewComment[] = [
        {
          id: 100,
          path: "src/index.ts",
          line: 42,
          original_line: 42,
          in_reply_to_id: null,
        },
      ];
      const result = resolveInReplyTo(
        undefined,
        existingComments,
        "src/index.ts",
        50, // Different line
      );
      // Different line, should create new thread
      expect(result).toBeUndefined();
    });
  });
});
