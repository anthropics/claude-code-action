import { expect, test, describe, beforeEach } from "bun:test";
import type { GitHubIssue } from "../src/github/types";
import { generatePRContent } from "../src/github/operations/pr-generator";

describe("Auto PR Creation Feature", () => {
  let mockIssueData: GitHubIssue;

  beforeEach(() => {
    // Mock issue data
    mockIssueData = {
      title: "Fix login bug",
      body: "Users cannot log in with special characters in password",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };
  });

  test("should generate proper PR title with Fix prefix for bug issues", () => {
    const result = generatePRContent(mockIssueData, "123");

    expect(result.title).toBe("Fix: Login bug");
    expect(result.body).toContain("## Summary");
    expect(result.body).toContain(
      'This PR addresses the issue: "Fix login bug"',
    );
    expect(result.body).toContain("## Changes");
    expect(result.body).toContain(
      "Users cannot log in with special characters",
    );
    expect(result.body).toContain("Fixes #123");
  });

  test("should generate proper PR title for feature request", () => {
    mockIssueData.title = "Add dark mode support";

    const result = generatePRContent(mockIssueData, "456");

    expect(result.title).toBe("Add: Dark mode support");
    expect(result.body).toContain("Fixes #456");
  });

  test("should generate proper PR title for enhancement", () => {
    mockIssueData.title = "Improve performance of data loading";

    const result = generatePRContent(mockIssueData, "789");

    expect(result.title).toBe("Update: Performance of data loading");
    expect(result.body).toContain("Fixes #789");
  });

  test("should handle empty issue body", () => {
    mockIssueData.body = "";

    const result = generatePRContent(mockIssueData, "123");

    expect(result.title).toBe("Fix: Login bug");
    expect(result.body).toContain("## Summary");
    expect(result.body).toContain("## Changes");
    expect(result.body).toContain("Fixes #123");
  });

  test("should handle long issue titles by truncating", () => {
    mockIssueData.title =
      "This is a very long issue title that should be truncated because it exceeds the reasonable length limit for PR titles and would make them hard to read";

    const result = generatePRContent(mockIssueData, "123");

    // Verify title is truncated and under 60 characters
    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.title).toContain("...");
    expect(result.title).toMatch(/^Fix: .+\.\.\.$/);
  });

  test("should clean HTML comments from issue body", () => {
    mockIssueData.body =
      "<!-- This is a comment -->Add form validation<!-- Another comment -->";

    const result = generatePRContent(mockIssueData, "123");

    // Verify HTML comments are removed
    expect(result.body).toContain("Add form validation");
    expect(result.body).not.toContain("<!-- This is a comment -->");
    expect(result.body).not.toContain("<!-- Another comment -->");
  });

  test("should include proper PR body structure", () => {
    const result = generatePRContent(mockIssueData, "123");

    // Verify PR body structure
    expect(result.body).toContain("## Summary");
    expect(result.body).toContain(
      'This PR addresses the issue: "Fix login bug"',
    );
    expect(result.body).toContain("## Changes");
    expect(result.body).toContain(
      "Users cannot log in with special characters",
    );
    expect(result.body).toContain("Fixes #123");
    expect(result.body).toContain(
      "automatically created by Claude Code Action",
    );
  });

  test("should remove common issue prefixes from title", () => {
    mockIssueData.title = "Bug: Memory leak in component";

    const result = generatePRContent(mockIssueData, "123");

    expect(result.title).toBe("Fix: Memory leak in component");
  });

  test("should handle different action words correctly", () => {
    const testCases = [
      { input: "Fix bug in login", expected: "Fix: Bug in login" },
      { input: "Add new feature", expected: "Add: New feature" },
      { input: "Update documentation", expected: "Update: Documentation" },
      {
        input: "Delete deprecated code",
        expected: "Remove: Delete deprecated code",
      },
      {
        input: "Restructure user module",
        expected: "Refactor: Restructure user module",
      },
      { input: "Some random task", expected: "Fix: Some random task" }, // default case
    ];

    testCases.forEach(({ input, expected }) => {
      mockIssueData.title = input;
      const result = generatePRContent(mockIssueData, "123");
      expect(result.title).toBe(expected);
    });
  });

  test("should include issue reference in PR body", () => {
    const result = generatePRContent(mockIssueData, "999");

    expect(result.body).toContain("Fixes #999");
    expect(result.body).toContain(
      "automatically created by Claude Code Action",
    );
  });
});
