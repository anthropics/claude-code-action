import { describe, test, expect, jest, beforeEach } from "bun:test";
import { Octokit } from "@octokit/rest";
import {
  updateClaudeComment,
  type UpdateClaudeCommentParams,
} from "../src/github/operations/comments/update-claude-comment";

describe("updateClaudeComment", () => {
  let mockOctokit: Octokit;

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          updateComment: jest.fn(),
        },
        pulls: {
          updateReviewComment: jest.fn(),
        },
      },
    } as any as Octokit;
  });

  test("should update issue comment successfully", async () => {
    const mockResponse = {
      data: {
        id: 123456,
        html_url: "https://github.com/owner/repo/issues/1#issuecomment-123456",
        updated_at: "2024-01-01T00:00:00Z",
        body: "Updated comment",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 123456,
      body: "Updated comment",
      isPullRequestReviewComment: false,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 123456,
      body: "Updated comment",
    });

    expect(result).toEqual({
      id: 123456,
      html_url: "https://github.com/owner/repo/issues/1#issuecomment-123456",
      updated_at: "2024-01-01T00:00:00Z",
    });
  });

  test("should update PR comment successfully", async () => {
    const mockResponse = {
      data: {
        id: 789012,
        html_url: "https://github.com/owner/repo/pull/2#issuecomment-789012",
        updated_at: "2024-01-02T00:00:00Z",
        body: "Updated PR comment",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 789012,
      body: "Updated PR comment",
      isPullRequestReviewComment: false,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 789012,
      body: "Updated PR comment",
    });

    expect(result).toEqual({
      id: 789012,
      html_url: "https://github.com/owner/repo/pull/2#issuecomment-789012",
      updated_at: "2024-01-02T00:00:00Z",
    });
  });

  test("should update PR review comment successfully", async () => {
    const mockResponse = {
      data: {
        id: 345678,
        html_url: "https://github.com/owner/repo/pull/3#discussion_r345678",
        updated_at: "2024-01-03T00:00:00Z",
        body: "Updated review comment",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.updateReviewComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 345678,
      body: "Updated review comment",
      isPullRequestReviewComment: true,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.pulls.updateReviewComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 345678,
      body: "Updated review comment",
    });

    expect(result).toEqual({
      id: 345678,
      html_url: "https://github.com/owner/repo/pull/3#discussion_r345678",
      updated_at: "2024-01-03T00:00:00Z",
    });
  });

  test("should fallback to issue comment API when PR review comment update fails with 404", async () => {
    const mockError = new Error("Not Found") as any;
    mockError.status = 404;

    const mockResponse = {
      data: {
        id: 456789,
        html_url: "https://github.com/owner/repo/pull/4#issuecomment-456789",
        updated_at: "2024-01-04T00:00:00Z",
        body: "Updated via fallback",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.updateReviewComment = jest
      .fn()
      .mockRejectedValue(mockError);
    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 456789,
      body: "Updated via fallback",
      isPullRequestReviewComment: true,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.pulls.updateReviewComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 456789,
      body: "Updated via fallback",
    });

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 456789,
      body: "Updated via fallback",
    });

    expect(result).toEqual({
      id: 456789,
      html_url: "https://github.com/owner/repo/pull/4#issuecomment-456789",
      updated_at: "2024-01-04T00:00:00Z",
    });
  });

  test("should propagate error when PR review comment update fails with non-404 error", async () => {
    const mockError = new Error("Internal Server Error") as any;
    mockError.status = 500;

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.updateReviewComment = jest
      .fn()
      .mockRejectedValue(mockError);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 567890,
      body: "This will fail",
      isPullRequestReviewComment: true,
    };

    await expect(updateClaudeComment(mockOctokit, params)).rejects.toEqual(
      mockError,
    );

    expect(mockOctokit.rest.pulls.updateReviewComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 567890,
      body: "This will fail",
    });

    // Ensure fallback wasn't attempted
    expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  test("should propagate error when issue comment update fails", async () => {
    const mockError = new Error("Forbidden");

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockRejectedValue(mockError);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 678901,
      body: "This will also fail",
      isPullRequestReviewComment: false,
    };

    await expect(updateClaudeComment(mockOctokit, params)).rejects.toEqual(
      mockError,
    );

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 678901,
      body: "This will also fail",
    });
  });

  test("should handle empty body", async () => {
    const mockResponse = {
      data: {
        id: 111222,
        html_url: "https://github.com/owner/repo/issues/5#issuecomment-111222",
        updated_at: "2024-01-05T00:00:00Z",
        body: "",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 111222,
      body: "",
      isPullRequestReviewComment: false,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(result).toEqual({
      id: 111222,
      html_url: "https://github.com/owner/repo/issues/5#issuecomment-111222",
      updated_at: "2024-01-05T00:00:00Z",
    });
  });

  test("should handle very long body", async () => {
    const longBody = "x".repeat(10000);
    const mockResponse = {
      data: {
        id: 333444,
        html_url: "https://github.com/owner/repo/issues/6#issuecomment-333444",
        updated_at: "2024-01-06T00:00:00Z",
        body: longBody,
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 333444,
      body: longBody,
      isPullRequestReviewComment: false,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 333444,
      body: longBody,
    });

    expect(result).toEqual({
      id: 333444,
      html_url: "https://github.com/owner/repo/issues/6#issuecomment-333444",
      updated_at: "2024-01-06T00:00:00Z",
    });
  });

  test("should handle markdown formatting in body", async () => {
    const markdownBody = `
# Header
- List item 1
- List item 2

\`\`\`typescript
const code = "example";
\`\`\`

[Link](https://example.com)
    `.trim();

    const mockResponse = {
      data: {
        id: 555666,
        html_url: "https://github.com/owner/repo/issues/7#issuecomment-555666",
        updated_at: "2024-01-07T00:00:00Z",
        body: markdownBody,
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.issues.updateComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 555666,
      body: markdownBody,
      isPullRequestReviewComment: false,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "testowner",
      repo: "testrepo",
      comment_id: 555666,
      body: markdownBody,
    });

    expect(result).toEqual({
      id: 555666,
      html_url: "https://github.com/owner/repo/issues/7#issuecomment-555666",
      updated_at: "2024-01-07T00:00:00Z",
    });
  });

  test("should handle different response data fields", async () => {
    const mockResponse = {
      data: {
        id: 777888,
        html_url: "https://github.com/owner/repo/pull/8#discussion_r777888",
        updated_at: "2024-01-08T12:30:45Z",
        body: "Updated",
        // Additional fields that might be in the response
        created_at: "2024-01-01T00:00:00Z",
        user: { login: "bot" },
        node_id: "MDI0OlB1bGxSZXF1ZXN0UmV2aWV3Q29tbWVudDc3Nzg4OA==",
      },
    };

    // @ts-expect-error Mock implementation doesn't match full type signature
    mockOctokit.rest.pulls.updateReviewComment = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const params: UpdateClaudeCommentParams = {
      owner: "testowner",
      repo: "testrepo",
      commentId: 777888,
      body: "Updated",
      isPullRequestReviewComment: true,
    };

    const result = await updateClaudeComment(mockOctokit, params);

    // Should only return the specific fields we care about
    expect(result).toEqual({
      id: 777888,
      html_url: "https://github.com/owner/repo/pull/8#discussion_r777888",
      updated_at: "2024-01-08T12:30:45Z",
    });
  });
});
