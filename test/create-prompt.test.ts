#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import {
  generatePrompt,
  getEventTypeAndContext,
  buildAllowedToolsString,
  buildDisallowedToolsString,
} from "../src/create-prompt";
import type { PreparedContext } from "../src/create-prompt";

describe("generatePrompt", () => {
  const mockGitHubData = {
    contextData: {
      title: "Test PR",
      body: "This is a test PR",
      author: { login: "testuser" },
      state: "OPEN",
      createdAt: "2023-01-01T00:00:00Z",
      additions: 15,
      deletions: 5,
      baseRefName: "main",
      headRefName: "feature-branch",
      headRefOid: "abc123",
      commits: {
        totalCount: 2,
        nodes: [
          {
            commit: {
              oid: "commit1",
              message: "Add feature",
              author: {
                name: "John Doe",
                email: "john@example.com",
              },
            },
          },
        ],
      },
      files: {
        nodes: [
          {
            path: "src/file1.ts",
            additions: 10,
            deletions: 5,
            changeType: "MODIFIED",
          },
        ],
      },
      comments: {
        nodes: [
          {
            id: "comment1",
            databaseId: "123456",
            body: "First comment",
            author: { login: "user1" },
            createdAt: "2023-01-01T01:00:00Z",
          },
        ],
      },
      reviews: {
        nodes: [
          {
            id: "review1",
            author: { login: "reviewer1" },
            body: "LGTM",
            state: "APPROVED",
            submittedAt: "2023-01-01T02:00:00Z",
            comments: {
              nodes: [],
            },
          },
        ],
      },
    },
    comments: [
      {
        id: "comment1",
        databaseId: "123456",
        body: "First comment",
        author: { login: "user1" },
        createdAt: "2023-01-01T01:00:00Z",
      },
      {
        id: "comment2",
        databaseId: "123457",
        body: "@claude help me",
        author: { login: "user2" },
        createdAt: "2023-01-01T01:30:00Z",
      },
    ],
    changedFiles: [],
    changedFilesWithSHA: [
      {
        path: "src/file1.ts",
        additions: 10,
        deletions: 5,
        changeType: "MODIFIED",
        sha: "abc123",
      },
    ],
    reviewData: {
      nodes: [
        {
          id: "review1",
          databaseId: "400001",
          author: { login: "reviewer1" },
          body: "LGTM",
          state: "APPROVED",
          submittedAt: "2023-01-01T02:00:00Z",
          comments: {
            nodes: [],
          },
        },
      ],
    },
    imageUrlMap: new Map<string, string>(),
  };

  test("should generate prompt for issue_comment event", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: false,
        baseBranch: "main",
        claudeBranch: "claude/issue-67890-20240101_120000",
        issueNumber: "67890",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("You are Claude, an AI assistant");
    expect(prompt).toContain("<event_type>GENERAL_COMMENT</event_type>");
    expect(prompt).toContain("<is_pr>false</is_pr>");
    expect(prompt).toContain(
      "<trigger_context>issue comment with '@claude'</trigger_context>",
    );
    expect(prompt).toContain("<repository>owner/repo</repository>");
    expect(prompt).toContain("<claude_comment_id>12345</claude_comment_id>");
    expect(prompt).toContain("<trigger_username>Unknown</trigger_username>");
    expect(prompt).toContain("[user1 at 2023-01-01T01:00:00Z]: First comment"); // from formatted comments
    expect(prompt).not.toContain("filename\tstatus\tadditions\tdeletions\tsha"); // since it's not a PR
  });

  test("should generate prompt for pull_request_review event", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review",
        isPR: true,
        prNumber: "456",
        commentBody: "@claude please fix this bug",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<event_type>PR_REVIEW</event_type>");
    expect(prompt).toContain("<is_pr>true</is_pr>");
    expect(prompt).toContain("<pr_number>456</pr_number>");
    expect(prompt).toContain("- src/file1.ts (MODIFIED) +10/-5 SHA: abc123"); // from formatted changed files
    expect(prompt).toContain(
      "[Review by reviewer1 at 2023-01-01T02:00:00Z]: APPROVED",
    ); // from review comments
  });

  test("should generate prompt for issue opened event", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "opened",
        isPR: false,
        issueNumber: "789",
        baseBranch: "main",
        claudeBranch: "claude/issue-789-20240101_120000",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<event_type>ISSUE_CREATED</event_type>");
    expect(prompt).toContain(
      "<trigger_context>new issue with '@claude' in body</trigger_context>",
    );
    expect(prompt).toContain(
      "[Create a PR](https://github.com/owner/repo/compare/main",
    );
    expect(prompt).toContain("The target-branch should be 'main'");
  });

  test("should generate prompt for issue assigned event", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "assigned",
        isPR: false,
        issueNumber: "999",
        baseBranch: "develop",
        claudeBranch: "claude/issue-999-20240101_120000",
        assigneeTrigger: "claude-bot",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<event_type>ISSUE_ASSIGNED</event_type>");
    expect(prompt).toContain(
      "<trigger_context>issue assigned to 'claude-bot'</trigger_context>",
    );
    expect(prompt).toContain(
      "[Create a PR](https://github.com/owner/repo/compare/develop",
    );
  });

  test("should include direct prompt when provided", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      directPrompt: "Fix the bug in the login form",
      eventData: {
        eventName: "issues",
        eventAction: "opened",
        isPR: false,
        issueNumber: "789",
        baseBranch: "main",
        claudeBranch: "claude/issue-789-20240101_120000",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<direct_prompt>");
    expect(prompt).toContain("Fix the bug in the login form");
    expect(prompt).toContain("</direct_prompt>");
    expect(prompt).toContain(
      "DIRECT INSTRUCTION: A direct instruction was provided and is shown in the <direct_prompt> tag above",
    );
  });

  test("should generate prompt for pull_request event", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        prNumber: "999",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<event_type>PULL_REQUEST</event_type>");
    expect(prompt).toContain("<is_pr>true</is_pr>");
    expect(prompt).toContain("<pr_number>999</pr_number>");
    expect(prompt).toContain("pull request opened");
  });

  test("should include custom instructions when provided", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      customInstructions: "Always use TypeScript",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: false,
        issueNumber: "123",
        baseBranch: "main",
        claudeBranch: "claude/issue-67890-20240101_120000",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("CUSTOM INSTRUCTIONS:\nAlways use TypeScript");
  });

  test("should include trigger username when provided", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      triggerUsername: "johndoe",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: false,
        issueNumber: "123",
        baseBranch: "main",
        claudeBranch: "claude/issue-67890-20240101_120000",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    expect(prompt).toContain("<trigger_username>johndoe</trigger_username>");
    expect(prompt).toContain(
      "Co-authored-by: johndoe <johndoe@users.noreply.github.com>",
    );
  });

  test("should include PR-specific instructions only for PR events", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review",
        isPR: true,
        prNumber: "456",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain PR-specific instructions
    expect(prompt).toContain(
      "Push directly using mcp__github_file_ops__commit_files to the existing branch",
    );
    expect(prompt).toContain(
      "Always push to the existing branch when triggered on a PR",
    );

    // Should NOT contain Issue-specific instructions
    expect(prompt).not.toContain("You are already on the correct branch (");
    expect(prompt).not.toContain(
      "IMPORTANT: You are already on the correct branch (",
    );
    expect(prompt).not.toContain("Create a PR](https://github.com/");
  });

  test("should include Issue-specific instructions only for Issue events", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "opened",
        isPR: false,
        issueNumber: "789",
        baseBranch: "main",
        claudeBranch: "claude/issue-789-20240101_120000",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain Issue-specific instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/issue-789-20240101_120000)",
    );
    expect(prompt).toContain(
      "IMPORTANT: You are already on the correct branch (claude/issue-789-20240101_120000)",
    );
    expect(prompt).toContain("Create a PR](https://github.com/");
    expect(prompt).toContain(
      "If you created anything in your branch, your comment must include the PR URL",
    );

    // Should NOT contain PR-specific instructions
    expect(prompt).not.toContain(
      "Push directly using mcp__github_file_ops__commit_files to the existing branch",
    );
    expect(prompt).not.toContain(
      "Always push to the existing branch when triggered on a PR",
    );
  });

  test("should use actual branch name for issue comments", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: false,
        issueNumber: "123",
        baseBranch: "main",
        claudeBranch: "claude/issue-123-20240101_120000",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain the actual branch name with timestamp
    expect(prompt).toContain(
      "You are already on the correct branch (claude/issue-123-20240101_120000)",
    );
    expect(prompt).toContain(
      "IMPORTANT: You are already on the correct branch (claude/issue-123-20240101_120000)",
    );
    expect(prompt).toContain(
      "The branch-name is the current branch: claude/issue-123-20240101_120000",
    );
  });

  test("should handle closed PR with new branch", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: true,
        prNumber: "456",
        commentBody: "@claude please fix this",
        claudeBranch: "claude/pr-456-20240101_120000",
        baseBranch: "main",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain branch-specific instructions like issues
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-456-20240101_120000)",
    );
    expect(prompt).toContain(
      "Create a PR](https://github.com/owner/repo/compare/main",
    );
    expect(prompt).toContain(
      "The branch-name is the current branch: claude/pr-456-20240101_120000",
    );
    expect(prompt).toContain("Reference to the original PR");
    expect(prompt).toContain(
      "If you created anything in your branch, your comment must include the PR URL",
    );

    // Should NOT contain open PR instructions
    expect(prompt).not.toContain(
      "Push directly using mcp__github_file_ops__commit_files to the existing branch",
    );
  });

  test("should handle open PR without new branch", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: true,
        prNumber: "456",
        commentBody: "@claude please fix this",
        // No claudeBranch or baseBranch for open PRs
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain open PR instructions
    expect(prompt).toContain(
      "Push directly using mcp__github_file_ops__commit_files to the existing branch",
    );
    expect(prompt).toContain(
      "Always push to the existing branch when triggered on a PR",
    );

    // Should NOT contain new branch instructions
    expect(prompt).not.toContain("Create a PR](https://github.com/");
    expect(prompt).not.toContain("You are already on the correct branch");
    expect(prompt).not.toContain(
      "If you created anything in your branch, your comment must include the PR URL",
    );
  });

  test("should handle PR review on closed PR with new branch", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review",
        isPR: true,
        prNumber: "789",
        commentBody: "@claude please update this",
        claudeBranch: "claude/pr-789-20240101_123000",
        baseBranch: "develop",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-789-20240101_123000)",
    );
    expect(prompt).toContain(
      "Create a PR](https://github.com/owner/repo/compare/develop",
    );
    expect(prompt).toContain("Reference to the original PR");
  });

  test("should handle PR review comment on closed PR with new branch", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review_comment",
        isPR: true,
        prNumber: "999",
        commentId: "review-comment-123",
        commentBody: "@claude fix this issue",
        claudeBranch: "claude/pr-999-20240101_140000",
        baseBranch: "main",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-999-20240101_140000)",
    );
    expect(prompt).toContain("Create a PR](https://github.com/");
    expect(prompt).toContain("Reference to the original PR");
    expect(prompt).toContain(
      "If you created anything in your branch, your comment must include the PR URL",
    );
  });

  test("should handle pull_request event on closed PR with new branch", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request",
        eventAction: "closed",
        isPR: true,
        prNumber: "555",
        claudeBranch: "claude/pr-555-20240101_150000",
        baseBranch: "main",
      },
    };

    const prompt = generatePrompt(envVars, mockGitHubData);

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-555-20240101_150000)",
    );
    expect(prompt).toContain("Create a PR](https://github.com/");
    expect(prompt).toContain("Reference to the original PR");
  });
});

describe("getEventTypeAndContext", () => {
  test("should return correct type and context for pull_request_review_comment", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review_comment",
        isPR: true,
        prNumber: "123",
        commentBody: "@claude please fix this",
      },
    };

    const result = getEventTypeAndContext(envVars);

    expect(result.eventType).toBe("REVIEW_COMMENT");
    expect(result.triggerContext).toBe("PR review comment with '@claude'");
  });

  test("should return correct type and context for issue assigned", () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "assigned",
        isPR: false,
        issueNumber: "999",
        baseBranch: "main",
        claudeBranch: "claude/issue-999-20240101_120000",
        assigneeTrigger: "claude-bot",
      },
    };

    const result = getEventTypeAndContext(envVars);

    expect(result.eventType).toBe("ISSUE_ASSIGNED");
    expect(result.triggerContext).toBe("issue assigned to 'claude-bot'");
  });
});

describe("buildAllowedToolsString", () => {
  test("should return issue comment tool for regular events", () => {
    const result = buildAllowedToolsString();

    // The base tools should be in the result
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");
    expect(result).toContain("mcp__github_file_ops__update_claude_comment");
    expect(result).not.toContain("mcp__github__update_issue_comment");
    expect(result).not.toContain("mcp__github__update_pull_request_comment");
    expect(result).toContain("mcp__github_file_ops__commit_files");
    expect(result).toContain("mcp__github_file_ops__delete_files");
  });

  test("should return PR comment tool for inline review comments", () => {
    const result = buildAllowedToolsString();

    // The base tools should be in the result
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");
    expect(result).toContain("mcp__github_file_ops__update_claude_comment");
    expect(result).not.toContain("mcp__github__update_issue_comment");
    expect(result).not.toContain("mcp__github__update_pull_request_comment");
    expect(result).toContain("mcp__github_file_ops__commit_files");
    expect(result).toContain("mcp__github_file_ops__delete_files");
  });

  test("should append custom tools when provided", () => {
    const customTools = ["Tool1", "Tool2", "Tool3"];
    const result = buildAllowedToolsString(customTools);

    // Base tools should be present
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");

    // Custom tools should be appended
    expect(result).toContain("Tool1");
    expect(result).toContain("Tool2");
    expect(result).toContain("Tool3");

    // Verify format with comma separation
    const basePlusCustom = result.split(",");
    expect(basePlusCustom.length).toBeGreaterThan(10); // At least the base tools plus custom
    expect(basePlusCustom).toContain("Tool1");
    expect(basePlusCustom).toContain("Tool2");
    expect(basePlusCustom).toContain("Tool3");
  });
});

describe("buildDisallowedToolsString", () => {
  test("should return base disallowed tools when no custom tools provided", () => {
    const result = buildDisallowedToolsString();

    // The base disallowed tools should be in the result
    expect(result).toContain("WebSearch");
    expect(result).toContain("WebFetch");
  });

  test("should append custom disallowed tools when provided", () => {
    const customDisallowedTools = ["BadTool1", "BadTool2"];
    const result = buildDisallowedToolsString(customDisallowedTools);

    // Base disallowed tools should be present
    expect(result).toContain("WebSearch");

    // Custom disallowed tools should be appended
    expect(result).toContain("BadTool1");
    expect(result).toContain("BadTool2");

    // Verify format with comma separation
    const parts = result.split(",");
    expect(parts).toContain("WebSearch");
    expect(parts).toContain("BadTool1");
    expect(parts).toContain("BadTool2");
  });

  test("should remove hardcoded disallowed tools if they are in allowed tools", () => {
    const customDisallowedTools = ["BadTool1", "BadTool2"];
    const allowedTools = ["WebSearch", "SomeOtherTool"];
    const result = buildDisallowedToolsString(
      customDisallowedTools,
      allowedTools,
    );

    // WebSearch should be removed from disallowed since it's in allowed
    expect(result).not.toContain("WebSearch");

    // WebFetch should still be disallowed since it's not in allowed
    expect(result).toContain("WebFetch");

    // Custom disallowed tools should still be present
    expect(result).toContain("BadTool1");
    expect(result).toContain("BadTool2");
  });

  test("should remove all hardcoded disallowed tools if they are all in allowed tools", () => {
    const allowedTools = ["WebSearch", "WebFetch", "SomeOtherTool"];
    const result = buildDisallowedToolsString(undefined, allowedTools);

    // Both hardcoded disallowed tools should be removed
    expect(result).not.toContain("WebSearch");
    expect(result).not.toContain("WebFetch");

    // Result should be empty since no custom disallowed tools provided
    expect(result).toBe("");
  });

  test("should handle custom disallowed tools when all hardcoded tools are overridden", () => {
    const customDisallowedTools = ["BadTool1", "BadTool2"];
    const allowedTools = ["WebSearch", "WebFetch"];
    const result = buildDisallowedToolsString(
      customDisallowedTools,
      allowedTools,
    );

    // Hardcoded tools should be removed
    expect(result).not.toContain("WebSearch");
    expect(result).not.toContain("WebFetch");

    // Only custom disallowed tools should remain
    expect(result).toBe("BadTool1,BadTool2");
  });
});
