#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";

// Import the helper functions from create-prompt/index.ts
import {
  findLastReviewFromUser,
  getCommitsSinceReview,
} from "../src/create-prompt/index";

describe("findLastReviewFromUser", () => {
  test("should return null when reviewData is null", () => {
    const result = findLastReviewFromUser(null, "test-user");
    expect(result).toBeNull();
  });

  test("should return null when reviewData nodes is empty", () => {
    const reviewData = { nodes: [] };
    const result = findLastReviewFromUser(reviewData, "test-user");
    expect(result).toBeNull();
  });

  test("should return null when no reviews from specified user", () => {
    const reviewData = {
      nodes: [
        {
          author: { login: "other-user" },
          submittedAt: "2024-01-15T10:00:00Z",
          id: "review-1",
        },
        {
          author: { login: "another-user" },
          submittedAt: "2024-01-15T11:00:00Z",
          id: "review-2",
        },
      ],
    };
    const result = findLastReviewFromUser(reviewData, "test-user");
    expect(result).toBeNull();
  });

  test("should return the most recent review from specified user", () => {
    const reviewData = {
      nodes: [
        {
          author: { login: "test-user" },
          submittedAt: "2024-01-15T10:00:00Z",
          id: "review-1",
        },
        {
          author: { login: "other-user" },
          submittedAt: "2024-01-15T11:00:00Z",
          id: "review-2",
        },
        {
          author: { login: "test-user" },
          submittedAt: "2024-01-15T12:00:00Z",
          id: "review-3",
        },
      ],
    };
    const result = findLastReviewFromUser(reviewData, "test-user");
    expect(result).toEqual({
      submittedAt: "2024-01-15T12:00:00Z",
      id: "review-3",
    });
  });

  test("should handle single review from specified user", () => {
    const reviewData = {
      nodes: [
        {
          author: { login: "other-user" },
          submittedAt: "2024-01-15T10:00:00Z",
          id: "review-1",
        },
        {
          author: { login: "test-user" },
          submittedAt: "2024-01-15T11:00:00Z",
          id: "review-2",
        },
      ],
    };
    const result = findLastReviewFromUser(reviewData, "test-user");
    expect(result).toEqual({
      submittedAt: "2024-01-15T11:00:00Z",
      id: "review-2",
    });
  });

  test("should be case sensitive for username matching", () => {
    const reviewData = {
      nodes: [
        {
          author: { login: "Test-User" },
          submittedAt: "2024-01-15T10:00:00Z",
          id: "review-1",
        },
      ],
    };
    const result = findLastReviewFromUser(reviewData, "test-user");
    expect(result).toBeNull();
  });
});

describe("getCommitsSinceReview", () => {
  test("should return empty array when commits array is empty", () => {
    const result = getCommitsSinceReview([], "2024-01-15T10:00:00Z");
    expect(result).toEqual([]);
  });

  test("should return all commits from input (current simplified implementation)", () => {
    const commits = [
      {
        commit: {
          oid: "commit1",
          message: "Add authentication",
          author: { name: "Developer 1", email: "dev1@example.com" },
        },
      },
      {
        commit: {
          oid: "commit2",
          message: "Fix login bug",
          author: { name: "Developer 2", email: "dev2@example.com" },
        },
      },
    ];

    const result = getCommitsSinceReview(commits, "2024-01-15T10:00:00Z");

    // Current implementation returns all commits regardless of date
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      oid: "commit1",
      message: "Add authentication",
      author: { name: "Developer 1", email: "dev1@example.com" },
    });
    expect(result[1]).toEqual({
      oid: "commit2",
      message: "Fix login bug",
      author: { name: "Developer 2", email: "dev2@example.com" },
    });
  });

  test("should extract commit objects from commit wrappers", () => {
    const commits = [
      {
        commit: {
          oid: "abc123def456",
          message: "Update user authentication system",
          author: { name: "John Doe", email: "john.doe@example.com" },
        },
      },
    ];

    const result = getCommitsSinceReview(commits, "2024-01-15T10:00:00Z");

    // Should extract the commit object from the wrapper
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      oid: "abc123def456",
      message: "Update user authentication system",
      author: { name: "John Doe", email: "john.doe@example.com" },
    });
  });

  test("should handle multiple commits and preserve order", () => {
    const commits = [
      {
        commit: {
          oid: "commit1",
          message: "First commit",
          author: { name: "Dev One", email: "dev1@example.com" },
        },
      },
      {
        commit: {
          oid: "commit2",
          message: "Second commit",
          author: { name: "Dev Two", email: "dev2@example.com" },
        },
      },
    ];

    const result = getCommitsSinceReview(commits, "2024-01-15T10:00:00Z");

    // Should preserve order and return all commits
    expect(result).toHaveLength(2);
    expect(result[0]?.oid).toBe("commit1");
    expect(result[0]?.message).toBe("First commit");
    expect(result[1]?.oid).toBe("commit2");
    expect(result[1]?.message).toBe("Second commit");
  });

  test("should handle empty commit array", () => {
    const result = getCommitsSinceReview([], "2024-01-15T10:00:00Z");
    expect(result).toEqual([]);
  });

  test("should ignore reviewDate parameter in current implementation", () => {
    const commits = [
      {
        commit: {
          oid: "test-commit",
          message: "Test message",
          author: { name: "Test Author", email: "test@example.com" },
        },
      },
    ];

    // Same result regardless of review date since current implementation ignores it
    const result1 = getCommitsSinceReview(commits, "2024-01-15T10:00:00Z");
    const result2 = getCommitsSinceReview(commits, "2020-01-01T00:00:00Z");
    const result3 = getCommitsSinceReview(commits, "2030-12-31T23:59:59Z");

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
    expect(result1).toHaveLength(1);
  });
});
