#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import {
  generatePrompt,
  generateDefaultPrompt,
  getEventTypeAndContext,
  buildAllowedToolsString,
  buildDisallowedToolsString,
} from "../src/create-prompt";
import type { PreparedContext } from "../src/create-prompt";
import type { Mode } from "../src/modes/types";

describe("generatePrompt", () => {
  // Create a mock tag mode that uses the default prompt
  const mockTagMode: Mode = {
    name: "tag",
    description: "Tag mode",
    shouldTrigger: () => true,
    prepareContext: (context) => ({ mode: "tag", githubContext: context }),
    getAllowedTools: () => [],
    getDisallowedTools: () => [],
    shouldCreateTrackingComment: () => true,
    generatePrompt: (context, githubData, useCommitSigning) =>
      generateDefaultPrompt(context, githubData, useCommitSigning),
    prepare: async () => ({
      commentId: 123,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: "{}",
    }),
  };

  // Create a mock agent mode that passes through prompts
  const mockAgentMode: Mode = {
    name: "agent",
    description: "Agent mode",
    shouldTrigger: () => true,
    prepareContext: (context) => ({ mode: "agent", githubContext: context }),
    getAllowedTools: () => [],
    getDisallowedTools: () => [],
    shouldCreateTrackingComment: () => false,
    generatePrompt: (context) => context.prompt || "",
    prepare: async () => ({
      commentId: undefined,
      branchInfo: {
        baseBranch: "main",
        currentBranch: "main",
        claudeBranch: undefined,
      },
      mcpConfig: "{}",
    }),
  };

  const mockGitHubData = {
    contextData: {
      title: "Test PR",
      body: "This is a test PR",
      author: { login: "testuser" },
      state: "OPEN",
      labels: { nodes: [] },
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

  test("should generate prompt for issue_comment event", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: false,
        baseBranch: "main",
        claudeBranch: "claude/issue-67890-20240101-1200",
        issueNumber: "67890",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

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

  test("should generate prompt for pull_request_review event", async () => {
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

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<event_type>PR_REVIEW</event_type>");
    expect(prompt).toContain("<is_pr>true</is_pr>");
    expect(prompt).toContain("<pr_number>456</pr_number>");
    expect(prompt).toContain("- src/file1.ts (MODIFIED) +10/-5 SHA: abc123"); // from formatted changed files
    expect(prompt).toContain(
      "[Review by reviewer1 at 2023-01-01T02:00:00Z]: APPROVED",
    ); // from review comments
  });

  test("should generate prompt for issue opened event", async () => {
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
        claudeBranch: "claude/issue-789-20240101-1200",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<event_type>ISSUE_CREATED</event_type>");
    expect(prompt).toContain(
      "<trigger_context>new issue with '@claude' in body</trigger_context>",
    );
    expect(prompt).toContain(
      "[Create a PR](https://github.com/owner/repo/compare/main",
    );
    expect(prompt).toContain("The target-branch should be 'main'");
  });

  test("should generate prompt for issue assigned event", async () => {
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
        claudeBranch: "claude/issue-999-20240101-1200",
        assigneeTrigger: "claude-bot",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<event_type>ISSUE_ASSIGNED</event_type>");
    expect(prompt).toContain(
      "<trigger_context>issue assigned to 'claude-bot'</trigger_context>",
    );
    expect(prompt).toContain(
      "[Create a PR](https://github.com/owner/repo/compare/develop",
    );
  });

  test("should generate prompt for issue labeled event", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "labeled",
        isPR: false,
        issueNumber: "888",
        baseBranch: "main",
        claudeBranch: "claude/issue-888-20240101-1200",
        labelTrigger: "claude-task",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<event_type>ISSUE_LABELED</event_type>");
    expect(prompt).toContain(
      "<trigger_context>issue labeled with 'claude-task'</trigger_context>",
    );
    expect(prompt).toContain(
      "[Create a PR](https://github.com/owner/repo/compare/main",
    );
  });

  // Removed test - direct_prompt field no longer supported in v1.0

  test("should generate prompt for pull_request event", async () => {
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

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<event_type>PULL_REQUEST</event_type>");
    expect(prompt).toContain("<is_pr>true</is_pr>");
    expect(prompt).toContain("<pr_number>999</pr_number>");
    expect(prompt).toContain("pull request opened");
  });

  test("should generate prompt for issue comment without custom fields", async () => {
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
        claudeBranch: "claude/issue-67890-20240101-1200",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Verify prompt generates successfully without custom instructions
    expect(prompt).toContain("@claude please fix this");
    expect(prompt).not.toContain("CUSTOM INSTRUCTIONS");
  });

  test("should use override_prompt when provided", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      prompt: "Simple prompt for reviewing PR",
      eventData: {
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        prNumber: "123",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockAgentMode,
    );

    // Agent mode: Prompt is passed through as-is
    expect(prompt).toBe("Simple prompt for reviewing PR");
    expect(prompt).not.toContain("You are Claude, an AI assistant");
  });

  test("should pass through prompt without variable substitution", async () => {
    const envVars: PreparedContext = {
      repository: "test/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      triggerUsername: "john-doe",
      prompt: `Repository: $REPOSITORY
      PR: $PR_NUMBER
      Title: $PR_TITLE
      Body: $PR_BODY
      Comments: $PR_COMMENTS
      Review Comments: $REVIEW_COMMENTS
      Changed Files: $CHANGED_FILES
      Trigger Comment: $TRIGGER_COMMENT
      Username: $TRIGGER_USERNAME
      Branch: $BRANCH_NAME
      Base: $BASE_BRANCH
      Event: $EVENT_TYPE
      Is PR: $IS_PR`,
      eventData: {
        eventName: "pull_request_review_comment",
        isPR: true,
        prNumber: "456",
        commentBody: "Please review this code",
        claudeBranch: "feature-branch",
        baseBranch: "main",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockAgentMode,
    );

    // v1.0: Variables are NOT substituted - prompt is passed as-is to Claude Code
    expect(prompt).toContain("Repository: $REPOSITORY");
    expect(prompt).toContain("PR: $PR_NUMBER");
    expect(prompt).toContain("Title: $PR_TITLE");
    expect(prompt).toContain("Body: $PR_BODY");
    expect(prompt).toContain("Branch: $BRANCH_NAME");
    expect(prompt).toContain("Base: $BASE_BRANCH");
    expect(prompt).toContain("Username: $TRIGGER_USERNAME");
    expect(prompt).toContain("Comment: $TRIGGER_COMMENT");
  });

  test("should handle override_prompt for issues", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      prompt: "Review issue and provide feedback",
      eventData: {
        eventName: "issues",
        eventAction: "opened",
        isPR: false,
        issueNumber: "789",
        baseBranch: "main",
        claudeBranch: "claude/issue-789-20240101-1200",
      },
    };

    const issueGitHubData = {
      ...mockGitHubData,
      contextData: {
        title: "Bug: Login form broken",
        body: "The login form is not working",
        author: { login: "testuser" },
        state: "OPEN",
        labels: { nodes: [] },
        createdAt: "2023-01-01T00:00:00Z",
        comments: {
          nodes: [],
        },
      },
    };

    const prompt = await generatePrompt(
      envVars,
      issueGitHubData,
      false,
      mockAgentMode,
    );

    // Agent mode: Prompt is passed through as-is
    expect(prompt).toBe("Review issue and provide feedback");
  });

  test("should handle prompt without substitution", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      prompt: "PR: $PR_NUMBER, Issue: $ISSUE_NUMBER, Comment: $TRIGGER_COMMENT",
      eventData: {
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        prNumber: "123",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockAgentMode,
    );

    // Agent mode: No substitution - passed as-is
    expect(prompt).toBe(
      "PR: $PR_NUMBER, Issue: $ISSUE_NUMBER, Comment: $TRIGGER_COMMENT",
    );
  });

  test("should not substitute variables when override_prompt is not provided", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "opened",
        isPR: false,
        issueNumber: "123",
        baseBranch: "main",
        claudeBranch: "claude/issue-123-20240101-1200",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("You are Claude, an AI assistant");
    expect(prompt).toContain("<event_type>ISSUE_CREATED</event_type>");
  });

  test("should include trigger username when provided", async () => {
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
        claudeBranch: "claude/issue-67890-20240101-1200",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    expect(prompt).toContain("<trigger_username>johndoe</trigger_username>");
    // With commit signing disabled, co-author info appears in git commit instructions
    expect(prompt).toContain(
      "Co-authored-by: johndoe <johndoe@users.noreply.github.com>",
    );
  });

  test("should include PR-specific instructions only for PR events", async () => {
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

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain PR-specific instructions (git commands when not using signing)
    expect(prompt).toContain("git push");
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

  test("should include Issue-specific instructions only for Issue events", async () => {
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
        claudeBranch: "claude/issue-789-20240101-1200",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain Issue-specific instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/issue-789-20240101-1200)",
    );
    expect(prompt).toContain(
      "IMPORTANT: You are already on the correct branch (claude/issue-789-20240101-1200)",
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

  test("should use actual branch name for issue comments", async () => {
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
        claudeBranch: "claude/issue-123-20240101-1200",
        commentBody: "@claude please fix this",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain the actual branch name with timestamp
    expect(prompt).toContain(
      "You are already on the correct branch (claude/issue-123-20240101-1200)",
    );
    expect(prompt).toContain(
      "IMPORTANT: You are already on the correct branch (claude/issue-123-20240101-1200)",
    );
    expect(prompt).toContain(
      "The branch-name is the current branch: claude/issue-123-20240101-1200",
    );
  });

  test("should handle closed PR with new branch", async () => {
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
        claudeBranch: "claude/pr-456-20240101-1200",
        baseBranch: "main",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain branch-specific instructions like issues
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-456-20240101-1200)",
    );
    expect(prompt).toContain(
      "Create a PR](https://github.com/owner/repo/compare/main",
    );
    expect(prompt).toContain(
      "The branch-name is the current branch: claude/pr-456-20240101-1200",
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

  test("should handle open PR without new branch", async () => {
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

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain open PR instructions (git commands when not using signing)
    expect(prompt).toContain("git push");
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

  test("should handle PR review on closed PR with new branch", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request_review",
        isPR: true,
        prNumber: "789",
        commentBody: "@claude please update this",
        claudeBranch: "claude/pr-789-20240101-1230",
        baseBranch: "develop",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-789-20240101-1230)",
    );
    expect(prompt).toContain(
      "Create a PR](https://github.com/owner/repo/compare/develop",
    );
    expect(prompt).toContain("Reference to the original PR");
  });

  test("should handle PR review comment on closed PR with new branch", async () => {
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
        claudeBranch: "claude/pr-999-20240101-1400",
        baseBranch: "main",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-999-20240101-1400)",
    );
    expect(prompt).toContain("Create a PR](https://github.com/");
    expect(prompt).toContain("Reference to the original PR");
    expect(prompt).toContain(
      "If you created anything in your branch, your comment must include the PR URL",
    );
  });

  test("should handle pull_request event on closed PR with new branch", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "pull_request",
        eventAction: "closed",
        isPR: true,
        prNumber: "555",
        claudeBranch: "claude/pr-555-20240101-1500",
        baseBranch: "main",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should contain new branch instructions
    expect(prompt).toContain(
      "You are already on the correct branch (claude/pr-555-20240101-1500)",
    );
    expect(prompt).toContain("Create a PR](https://github.com/");
    expect(prompt).toContain("Reference to the original PR");
  });

  test("should include git commands when useCommitSigning is false", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: true,
        prNumber: "123",
        commentBody: "@claude fix the bug",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      false,
      mockTagMode,
    );

    // Should have git command instructions
    expect(prompt).toContain("Use git commands via the Bash tool");
    expect(prompt).toContain("git add");
    expect(prompt).toContain("git commit");
    expect(prompt).toContain("git push");

    // Should use the minimal comment tool
    expect(prompt).toContain("mcp__github_comment__update_claude_comment");

    // Should not have commit signing tool references
    expect(prompt).not.toContain("mcp__github_file_ops__commit_files");
  });

  test("should include commit signing tools when useCommitSigning is true", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issue_comment",
        commentId: "67890",
        isPR: true,
        prNumber: "123",
        commentBody: "@claude fix the bug",
      },
    };

    const prompt = await generatePrompt(
      envVars,
      mockGitHubData,
      true,
      mockTagMode,
    );

    // Should have commit signing tool instructions
    expect(prompt).toContain("mcp__github_file_ops__commit_files");
    expect(prompt).toContain("mcp__github_file_ops__delete_files");
    // Comment tool should always be from comment server, not file ops
    expect(prompt).toContain("mcp__github_comment__update_claude_comment");

    // Should not have git command instructions
    expect(prompt).not.toContain("Use git commands via the Bash tool");
  });
});

describe("getEventTypeAndContext", () => {
  test("should return correct type and context for pull_request_review_comment", async () => {
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

  test("should return correct type and context for issue assigned", async () => {
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
        claudeBranch: "claude/issue-999-20240101-1200",
        assigneeTrigger: "claude-bot",
      },
    };

    const result = getEventTypeAndContext(envVars);

    expect(result.eventType).toBe("ISSUE_ASSIGNED");
    expect(result.triggerContext).toBe("issue assigned to 'claude-bot'");
  });

  test("should return correct type and context for issue labeled", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      eventData: {
        eventName: "issues",
        eventAction: "labeled",
        isPR: false,
        issueNumber: "888",
        baseBranch: "main",
        claudeBranch: "claude/issue-888-20240101-1200",
        labelTrigger: "claude-task",
      },
    };

    const result = getEventTypeAndContext(envVars);

    expect(result.eventType).toBe("ISSUE_LABELED");
    expect(result.triggerContext).toBe("issue labeled with 'claude-task'");
  });

  test("should return correct type and context for issue assigned without assigneeTrigger", async () => {
    const envVars: PreparedContext = {
      repository: "owner/repo",
      claudeCommentId: "12345",
      triggerPhrase: "@claude",
      prompt: "Please assess this issue",
      eventData: {
        eventName: "issues",
        eventAction: "assigned",
        isPR: false,
        issueNumber: "999",
        baseBranch: "main",
        claudeBranch: "claude/issue-999-20240101-1200",
        // No assigneeTrigger when using prompt
      },
    };

    const result = getEventTypeAndContext(envVars);

    expect(result.eventType).toBe("ISSUE_ASSIGNED");
    expect(result.triggerContext).toBe("issue assigned event");
  });
});

describe("buildAllowedToolsString", () => {
  test("should return correct tools for regular events (default no signing)", async () => {
    const result = buildAllowedToolsString();

    // The base tools should be in the result
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");

    // Default is no commit signing, so should have specific Bash git commands
    expect(result).toContain("Bash(git add:*)");
    expect(result).toContain("Bash(git commit:*)");
    expect(result).toContain("Bash(git push:*)");
    expect(result).toContain("mcp__github_comment__update_claude_comment");

    // Should not have commit signing tools
    expect(result).not.toContain("mcp__github_file_ops__commit_files");
    expect(result).not.toContain("mcp__github_file_ops__delete_files");
  });

  test("should return correct tools with default parameters", async () => {
    const result = buildAllowedToolsString([], false, false);

    // The base tools should be in the result
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");

    // Should have specific Bash git commands for non-signing mode
    expect(result).toContain("Bash(git add:*)");
    expect(result).toContain("Bash(git commit:*)");
    expect(result).toContain("mcp__github_comment__update_claude_comment");

    // Should not have commit signing tools
    expect(result).not.toContain("mcp__github_file_ops__commit_files");
    expect(result).not.toContain("mcp__github_file_ops__delete_files");
  });

  test("should append custom tools when provided", async () => {
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

  test("should include GitHub Actions tools when includeActionsTools is true", async () => {
    const result = buildAllowedToolsString([], true);

    // Base tools should be present
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");

    // GitHub Actions tools should be included
    expect(result).toContain("mcp__github_ci__get_ci_status");
    expect(result).toContain("mcp__github_ci__get_workflow_run_details");
    expect(result).toContain("mcp__github_ci__download_job_log");
  });

  test("should include both custom and Actions tools when both provided", async () => {
    const customTools = ["Tool1", "Tool2"];
    const result = buildAllowedToolsString(customTools, true);

    // Base tools should be present
    expect(result).toContain("Edit");

    // Custom tools should be included
    expect(result).toContain("Tool1");
    expect(result).toContain("Tool2");

    // GitHub Actions tools should be included
    expect(result).toContain("mcp__github_ci__get_ci_status");
    expect(result).toContain("mcp__github_ci__get_workflow_run_details");
    expect(result).toContain("mcp__github_ci__download_job_log");
  });

  test("should include commit signing tools when useCommitSigning is true", async () => {
    const result = buildAllowedToolsString([], false, true);

    // Base tools should be present
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");

    // Commit signing tools should be included
    expect(result).toContain("mcp__github_file_ops__commit_files");
    expect(result).toContain("mcp__github_file_ops__delete_files");
    // Comment tool should always be from github_comment server
    expect(result).toContain("mcp__github_comment__update_claude_comment");

    // Bash should NOT be included when using commit signing (except in comment tool name)
    expect(result).not.toContain("Bash(");
  });

  test("should include specific Bash git commands when useCommitSigning is false", async () => {
    const result = buildAllowedToolsString([], false, false);

    // Base tools should be present
    expect(result).toContain("Edit");
    expect(result).toContain("Glob");
    expect(result).toContain("Grep");
    expect(result).toContain("LS");
    expect(result).toContain("Read");
    expect(result).toContain("Write");

    // Specific Bash git commands should be included
    expect(result).toContain("Bash(git add:*)");
    expect(result).toContain("Bash(git commit:*)");
    expect(result).toContain("Bash(git push:*)");
    expect(result).toContain("Bash(git status:*)");
    expect(result).toContain("Bash(git diff:*)");
    expect(result).toContain("Bash(git log:*)");
    expect(result).toContain("Bash(git rm:*)");

    // Comment tool from minimal server should be included
    expect(result).toContain("mcp__github_comment__update_claude_comment");

    // Commit signing tools should NOT be included
    expect(result).not.toContain("mcp__github_file_ops__commit_files");
    expect(result).not.toContain("mcp__github_file_ops__delete_files");
  });

  test("should handle all combinations of options", async () => {
    const customTools = ["CustomTool1", "CustomTool2"];
    const result = buildAllowedToolsString(customTools, true, false);

    // Base tools should be present
    expect(result).toContain("Edit");
    expect(result).toContain("Bash(git add:*)");

    // Custom tools should be included
    expect(result).toContain("CustomTool1");
    expect(result).toContain("CustomTool2");

    // GitHub Actions tools should be included
    expect(result).toContain("mcp__github_ci__get_ci_status");

    // Comment tool from minimal server should be included
    expect(result).toContain("mcp__github_comment__update_claude_comment");

    // Commit signing tools should NOT be included
    expect(result).not.toContain("mcp__github_file_ops__commit_files");
  });
});

describe("buildDisallowedToolsString", () => {
  test("should return base disallowed tools when no custom tools provided", async () => {
    const result = buildDisallowedToolsString();

    // The base disallowed tools should be in the result
    expect(result).toContain("WebSearch");
    expect(result).toContain("WebFetch");
  });

  test("should append custom disallowed tools when provided", async () => {
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

  test("should remove hardcoded disallowed tools if they are in allowed tools", async () => {
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

  test("should remove all hardcoded disallowed tools if they are all in allowed tools", async () => {
    const allowedTools = ["WebSearch", "WebFetch", "SomeOtherTool"];
    const result = buildDisallowedToolsString(undefined, allowedTools);

    // Both hardcoded disallowed tools should be removed
    expect(result).not.toContain("WebSearch");
    expect(result).not.toContain("WebFetch");

    // Result should be empty since no custom disallowed tools provided
    expect(result).toBe("");
  });

  test("should handle custom disallowed tools when all hardcoded tools are overridden", async () => {
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
