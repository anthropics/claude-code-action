import { describe, test, expect, jest, beforeEach } from "bun:test";
import { updateCommentLink } from "../src/entrypoints/update-comment-link";
import { createMockContext } from "./mockContext";

describe("updateCommentLink error propagation", () => {
  let mockOctokit: any;

  beforeEach(() => {
    const restMethods = {
      issues: {
        getComment: jest.fn().mockResolvedValue({
          data: {
            id: 999,
            body: "Claude Code is working…",
          },
        }),
        updateComment: jest.fn().mockResolvedValue({
          data: { id: 999 },
        }),
      },
      pulls: {
        getReviewComment: jest.fn(),
        updateReviewComment: jest.fn(),
      },
      repos: {
        compareCommitsWithBasehead: jest.fn().mockResolvedValue({
          data: { total_commits: 0, files: [] },
        }),
      },
    };

    mockOctokit = {
      rest: {
        ...restMethods,
        rest: restMethods,
      },
    };
  });

  test("propagates runError to updated comment when claudeSuccess is false", async () => {
    const context = createMockContext({
      isPR: false,
      entityNumber: 42,
    });

    await updateCommentLink({
      commentId: 999,
      githubToken: "fake-token",
      baseBranch: "main",
      triggerUsername: "contributor",
      context: context as any,
      octokit: mockOctokit,
      claudeSuccess: false,
      prepareSuccess: true,
      runError: "Install failed: connection timed out while downloading binary",
      useCommitSigning: false,
    });

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalled();
    const updateCall = mockOctokit.rest.issues.updateComment.mock.calls[0][0];
    expect(updateCall.body).toContain("**Claude encountered an error");
    expect(updateCall.body).toContain(
      "Install failed: connection timed out while downloading binary",
    );
  });

  test("prefers prepareError when prepareSuccess is false", async () => {
    const context = createMockContext({
      isPR: false,
      entityNumber: 42,
    });

    await updateCommentLink({
      commentId: 999,
      githubToken: "fake-token",
      baseBranch: "main",
      triggerUsername: "contributor",
      context: context as any,
      octokit: mockOctokit,
      claudeSuccess: false,
      prepareSuccess: false,
      prepareError: "Trigger verification failed",
      runError: "Secondary error",
      useCommitSigning: false,
    });

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalled();
    const updateCall = mockOctokit.rest.issues.updateComment.mock.calls[0][0];
    expect(updateCall.body).toContain("**Claude encountered an error");
    expect(updateCall.body).toContain("Trigger verification failed");
    expect(updateCall.body).not.toContain("Secondary error");
  });
});
