import { describe, it, expect } from "bun:test";
import {
  updateCommentBody,
  type CommentUpdateInput,
} from "../src/github/operations/comment-logic";

describe("updateCommentBody", () => {
  const baseInput = {
    currentBody: "Initial comment body",
    actionFailed: false,
    executionDetails: null,
    jobUrl: "https://github.com/owner/repo/actions/runs/123",
    branchName: undefined,
    triggerUsername: undefined,
  };

  describe("working message replacement", () => {
    it("includes success message header with duration", () => {
      const input = {
        ...baseInput,
        currentBody: "Claude Code is working…",
        executionDetails: { duration_ms: 74000 }, // 1m 14s
        triggerUsername: "trigger-user",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "**Claude finished @trigger-user's task in 1m 14s**",
      );
      expect(result).not.toContain("Claude Code is working");
    });

    it("includes error message header with duration", () => {
      const input = {
        ...baseInput,
        currentBody: "Claude Code is working...",
        actionFailed: true,
        executionDetails: { duration_ms: 45000 }, // 45s
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude encountered an error after 45s**");
    });

    it("includes error details when provided", () => {
      const input = {
        ...baseInput,
        currentBody: "Claude Code is working...",
        actionFailed: true,
        executionDetails: { duration_ms: 45000 },
        errorDetails: "Failed to fetch issue data",
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude encountered an error after 45s**");
      expect(result).toContain("[View job]");
      expect(result).toContain("```\nFailed to fetch issue data\n```");
      // Ensure error details come after the header/links
      const errorIndex = result.indexOf("```");
      const headerIndex = result.indexOf("**Claude encountered an error");
      expect(errorIndex).toBeGreaterThan(headerIndex);
    });

    it("handles username extraction from content when not provided", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Claude Code is working… <img src='spinner.gif' />\n\nI'll work on this task @testuser",
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude finished @testuser's task**");
    });
  });

  describe("job link", () => {
    it("includes job link in header", () => {
      const input = {
        ...baseInput,
        currentBody: "Some comment",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(`—— [View job](${baseInput.jobUrl})`);
    });

    it("always includes job link in header, even if present in body", () => {
      const input = {
        ...baseInput,
        currentBody: `Some comment with [View job run](${baseInput.jobUrl})`,
        triggerUsername: "testuser",
      };

      const result = updateCommentBody(input);
      // Check it's in the header with the new format
      expect(result).toContain(`—— [View job](${baseInput.jobUrl})`);
      // The old link in body is removed
      expect(result).not.toContain("View job run");
    });
  });

  describe("branch link", () => {
    it("adds branch name with link to header when provided", () => {
      const input = {
        ...baseInput,
        branchName: "claude/issue-123-20240101-1200",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "• [`claude/issue-123-20240101-1200`](https://github.com/owner/repo/tree/claude/issue-123-20240101-1200)",
      );
    });

    it("extracts branch name from branchLink if branchName not provided", () => {
      const input = {
        ...baseInput,
        branchLink:
          "\n[View branch](https://github.com/owner/repo/tree/branch-name)",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "• [`branch-name`](https://github.com/owner/repo/tree/branch-name)",
      );
    });

    it("removes old branch links from body", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Some comment with [View branch](https://github.com/owner/repo/tree/branch-name)",
        branchName: "new-branch-name",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "• [`new-branch-name`](https://github.com/owner/repo/tree/new-branch-name)",
      );
      expect(result).not.toContain("View branch");
    });
  });

  describe("PR link", () => {
    it("adds PR link to header when provided", () => {
      const input = {
        ...baseInput,
        prLink: "\n[Create a PR](https://github.com/owner/repo/pr-url)",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/pr-url)",
      );
    });

    it("moves PR link from body to header", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Some comment with [Create a PR](https://github.com/owner/repo/pr-url)",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/pr-url)",
      );
      // Original Create a PR link is removed from body
      expect(result).not.toContain("[Create a PR]");
    });

    it("handles both body and provided PR links", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Some comment with [Create a PR](https://github.com/owner/repo/pr-url-from-body)",
        prLink:
          "\n[Create a PR](https://github.com/owner/repo/pr-url-provided)",
      };

      const result = updateCommentBody(input);
      // Prefers the link found in content over the provided one
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/pr-url-from-body)",
      );
    });

    it("handles complex PR URLs with encoded characters", () => {
      const complexUrl =
        "https://github.com/owner/repo/compare/main...feature-branch?quick_pull=1&title=fix%3A%20important%20bug%20fix&body=Fixes%20%23123%0A%0A%23%23%20Description%0AThis%20PR%20fixes%20an%20important%20bug%20that%20was%20causing%20issues%20with%20the%20application.%0A%0AGenerated%20with%20%5BClaude%20Code%5D(https%3A%2F%2Fclaude.ai%2Fcode)";
      const input = {
        ...baseInput,
        currentBody: `Some comment with [Create a PR](${complexUrl})`,
      };

      const result = updateCommentBody(input);
      expect(result).toContain(`• [Create PR ➔](${complexUrl})`);
      // Original link should be removed from body
      expect(result).not.toContain("[Create a PR]");
    });

    it("handles PR links with encoded URLs containing parentheses", () => {
      const complexUrl =
        "https://github.com/owner/repo/compare/main...feature-branch?quick_pull=1&title=fix%3A%20bug%20fix&body=Generated%20with%20%5BClaude%20Code%5D(https%3A%2F%2Fclaude.ai%2Fcode)";
      const input = {
        ...baseInput,
        currentBody: `This PR was created.\n\n[Create a PR](${complexUrl})`,
      };

      const result = updateCommentBody(input);
      expect(result).toContain(`• [Create PR ➔](${complexUrl})`);
      // Original link should be removed from body completely
      expect(result).not.toContain("[Create a PR]");
      // Body content shouldn't have stray closing parens
      expect(result).toContain("This PR was created.");
      // Body part should be clean with no stray parens
      const bodyAfterSeparator = result.split("---")[1]?.trim();
      expect(bodyAfterSeparator).toBe("This PR was created.");
    });

    it("handles PR links with unencoded spaces and special characters", () => {
      const unEncodedUrl =
        "https://github.com/owner/repo/compare/main...feature-branch?quick_pull=1&title=fix: update welcome message&body=Generated with [Claude Code](https://claude.ai/code)";
      const expectedEncodedUrl =
        "https://github.com/owner/repo/compare/main...feature-branch?quick_pull=1&title=fix%3A+update+welcome+message&body=Generated+with+%5BClaude+Code%5D%28https%3A%2F%2Fclaude.ai%2Fcode%29";
      const input = {
        ...baseInput,
        currentBody: `This PR was created.\n\n[Create a PR](${unEncodedUrl})`,
      };

      const result = updateCommentBody(input);
      expect(result).toContain(`• [Create PR ➔](${expectedEncodedUrl})`);
      // Original link should be removed from body completely
      expect(result).not.toContain("[Create a PR]");
      // Body content should be preserved
      expect(result).toContain("This PR was created.");
    });

    it("falls back to prLink parameter when PR link in content cannot be encoded", () => {
      const invalidUrl = "not-a-valid-url-at-all";
      const fallbackPrUrl = "https://github.com/owner/repo/pull/123";
      const input = {
        ...baseInput,
        currentBody: `This PR was created.\n\n[Create a PR](${invalidUrl})`,
        prLink: `\n[Create a PR](${fallbackPrUrl})`,
      };

      const result = updateCommentBody(input);
      expect(result).toContain(`• [Create PR ➔](${fallbackPrUrl})`);
      // Original link with invalid URL should still be in body since encoding failed
      expect(result).toContain("[Create a PR](not-a-valid-url-at-all)");
      expect(result).toContain("This PR was created.");
    });
  });

  describe("execution details", () => {
    it("includes duration in header for success", () => {
      const input = {
        ...baseInput,
        executionDetails: {
          total_cost_usd: 0.13382595,
          duration_ms: 31033,
          duration_api_ms: 31034,
        },
        triggerUsername: "testuser",
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude finished @testuser's task in 31s**");
    });

    it("formats duration in minutes and seconds in header", () => {
      const input = {
        ...baseInput,
        executionDetails: {
          duration_ms: 75000, // 1 minute 15 seconds
        },
        triggerUsername: "testuser",
      };

      const result = updateCommentBody(input);
      expect(result).toContain(
        "**Claude finished @testuser's task in 1m 15s**",
      );
    });

    it("includes duration in error header", () => {
      const input = {
        ...baseInput,
        actionFailed: true,
        executionDetails: {
          duration_ms: 45000, // 45 seconds
        },
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude encountered an error after 45s**");
    });

    it("handles missing duration gracefully", () => {
      const input = {
        ...baseInput,
        executionDetails: {
          total_cost_usd: 0.25,
        },
        triggerUsername: "testuser",
      };

      const result = updateCommentBody(input);
      expect(result).toContain("**Claude finished @testuser's task**");
      expect(result).not.toContain(" in ");
    });
  });

  describe("combined updates", () => {
    it("combines all updates in correct order", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Claude Code is working…\n\n### Todo List:\n- [x] Read README.md\n- [x] Add disclaimer",
        actionFailed: false,
        branchName: "claude-branch-123",
        prLink: "\n[Create a PR](https://github.com/owner/repo/pr-url)",
        executionDetails: {
          total_cost_usd: 0.01,
          duration_ms: 65000, // 1 minute 5 seconds
        },
        triggerUsername: "trigger-user",
      };

      const result = updateCommentBody(input);

      // Check the header structure
      expect(result).toContain(
        "**Claude finished @trigger-user's task in 1m 5s**",
      );
      expect(result).toContain("—— [View job]");
      expect(result).toContain(
        "• [`claude-branch-123`](https://github.com/owner/repo/tree/claude-branch-123)",
      );
      expect(result).toContain("• [Create PR ➔]");

      // Check order - header comes before separator with blank line
      const headerIndex = result.indexOf("**Claude finished");
      const blankLineAndSeparatorPattern = /\n\n---\n/;
      expect(result).toMatch(blankLineAndSeparatorPattern);

      const separatorIndex = result.indexOf("---");
      const todoIndex = result.indexOf("### Todo List:");

      expect(headerIndex).toBeLessThan(separatorIndex);
      expect(separatorIndex).toBeLessThan(todoIndex);

      // Check content is preserved
      expect(result).toContain("### Todo List:");
      expect(result).toContain("- [x] Read README.md");
      expect(result).toContain("- [x] Add disclaimer");
    });

    it("handles PR link extraction from content", () => {
      const input = {
        ...baseInput,
        currentBody:
          "Claude Code is working…\n\nI've made changes.\n[Create a PR](https://github.com/owner/repo/pr-url-in-content)\n\n@john-doe",
        branchName: "feature-branch",
        triggerUsername: "john-doe",
      };

      const result = updateCommentBody(input);

      // PR link should be moved to header
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/pr-url-in-content)",
      );
      // Original link should be removed from body
      expect(result).not.toContain("[Create a PR]");
      // Username should come from argument, not extraction
      expect(result).toContain("**Claude finished @john-doe's task**");
      // Content should be preserved
      expect(result).toContain("I've made changes.");
    });

    it("includes PR link for new branches (issues and closed PRs)", () => {
      const input = {
        ...baseInput,
        currentBody: "Claude Code is working… <img src='spinner.gif' />",
        branchName: "claude/pr-456-20240101-1200",
        prLink:
          "\n[Create a PR](https://github.com/owner/repo/compare/main...claude/pr-456-20240101-1200)",
        triggerUsername: "jane-doe",
      };

      const result = updateCommentBody(input);

      // Should include the PR link in the formatted style
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/compare/main...claude/pr-456-20240101-1200)",
      );
      expect(result).toContain("**Claude finished @jane-doe's task**");
    });

    it("includes both branch link and PR link for new branches", () => {
      const input = {
        ...baseInput,
        currentBody: "Claude Code is working…",
        branchName: "claude/issue-123-20240101-1200",
        branchLink:
          "\n[View branch](https://github.com/owner/repo/tree/claude/issue-123-20240101-1200)",
        prLink:
          "\n[Create a PR](https://github.com/owner/repo/compare/main...claude/issue-123-20240101-1200)",
      };

      const result = updateCommentBody(input);

      // Should include both links in formatted style
      expect(result).toContain(
        "• [`claude/issue-123-20240101-1200`](https://github.com/owner/repo/tree/claude/issue-123-20240101-1200)",
      );
      expect(result).toContain(
        "• [Create PR ➔](https://github.com/owner/repo/compare/main...claude/issue-123-20240101-1200)",
      );
    });

    it("should not show branch name when branch doesn't exist remotely", () => {
      const input: CommentUpdateInput = {
        currentBody: "@claude can you help with this?",
        actionFailed: false,
        executionDetails: { duration_ms: 90000 },
        jobUrl: "https://github.com/owner/repo/actions/runs/123",
        branchLink: "", // Empty branch link means branch doesn't exist remotely
        branchName: undefined, // Should be undefined when branchLink is empty
        triggerUsername: "claude",
        prLink: "",
      };

      const result = updateCommentBody(input);

      expect(result).toContain("Claude finished @claude's task in 1m 30s");
      expect(result).toContain(
        "[View job](https://github.com/owner/repo/actions/runs/123)",
      );
      expect(result).not.toContain("claude/issue-123");
      expect(result).not.toContain("tree/claude/issue-123");
    });
  });
});
