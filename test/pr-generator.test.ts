import { expect, test, describe } from "bun:test";
import { generatePRContent } from "../src/github/operations/pr-generator";
import type { GitHubIssue } from "../src/github/types";

describe("generatePRContent", () => {
  test("should generate proper PR title with Fix prefix for bug issues", () => {
    const issueData: GitHubIssue = {
      title: "Button not working properly",
      body: "The submit button doesn't respond to clicks",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "123");

    expect(result.title).toBe("Fix: Button not working properly");
    expect(result.body).toContain("This PR addresses the issue:");
    expect(result.body).toContain("Fixes #123");
    expect(result.body).toContain(
      "automatically created by Claude Code Action",
    );
  });

  test("should generate proper PR title with Add prefix for feature requests", () => {
    const issueData: GitHubIssue = {
      title: "Add dark mode support",
      body: "Users want dark mode functionality",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "456");

    expect(result.title).toBe("Add: Dark mode support");
    expect(result.body).toContain("Fixes #456");
  });

  test("should remove common issue prefixes from title", () => {
    const issueData: GitHubIssue = {
      title: "Bug: Memory leak in component",
      body: "Component causes memory leak",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "789");

    expect(result.title).toBe("Fix: Memory leak in component");
  });

  test("should use Update prefix for enhancement issues", () => {
    const issueData: GitHubIssue = {
      title: "Improve performance of data loading",
      body: "Current data loading is slow",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "101");

    expect(result.title).toBe("Update: Performance of data loading");
  });

  test("should handle long titles by truncating", () => {
    const issueData: GitHubIssue = {
      title:
        "This is a very long issue title that should be truncated because it exceeds the reasonable length limit for PR titles",
      body: "Long description",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "999");

    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.title).toContain("...");
  });

  test("should include issue body in PR body when different from title", () => {
    const issueData: GitHubIssue = {
      title: "Fix login error",
      body: "Users cannot log in with special characters in password",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "202");

    expect(result.body).toContain(
      "Users cannot log in with special characters",
    );
    expect(result.body).toContain("## Changes");
    expect(result.body).toContain("## Related Issue");
  });

  test("should handle empty issue body", () => {
    const issueData: GitHubIssue = {
      title: "Fix broken link",
      body: "",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "303");

    expect(result.title).toBe("Fix: Broken link");
    expect(result.body).toContain("Fixes #303");
    expect(result.body).not.toContain("## Related Issue");
  });

  test("should clean HTML comments from issue body", () => {
    const issueData: GitHubIssue = {
      title: "Add validation",
      body: "<!-- This is a comment -->Add form validation<!-- Another comment -->",
      author: { login: "testuser" },
      state: "open",
      createdAt: "2023-01-01T00:00:00Z",
      comments: { nodes: [] },
    };

    const result = generatePRContent(issueData, "404");

    expect(result.body).toContain("Add form validation");
    expect(result.body).not.toContain("<!-- This is a comment -->");
    expect(result.body).not.toContain("<!-- Another comment -->");
  });
});
