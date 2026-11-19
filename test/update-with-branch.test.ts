import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { updateTrackingComment } from "../src/github/operations/comments/update-with-branch";
import type { Octokits } from "../src/github/api/client";
import {
  createJobRunLink,
  createCommentBody,
} from "../src/github/operations/comments/common";
import {
  createMockContext,
  mockPullRequestCommentContext,
  mockPullRequestReviewCommentContext,
} from "./mockContext";

// updateClaudeComment is called with `octokit.rest` and then dereferences
// `.rest.issues` / `.rest.pulls` internally (the @octokit/rest instance aliases
// its namespaces under `.rest`). So the object we expose as `octokit.rest` must
// itself carry a `.rest` pointing at the same namespaces.
function makeOctokit(options?: { failUpdate?: boolean }) {
  const updateComment = mock(async () => ({
    data: {
      id: 1,
      html_url: "https://github.com/o/r/issues/1#c",
      updated_at: "2024-01-01T00:00:00Z",
    },
  }));
  const updateReviewComment = mock(async () => ({
    data: {
      id: 2,
      html_url: "https://github.com/o/r/pull/1#disc",
      updated_at: "2024-01-01T00:00:00Z",
    },
  }));
  if (options?.failUpdate) {
    updateComment.mockImplementation(async () => {
      throw new Error("boom");
    });
    updateReviewComment.mockImplementation(async () => {
      throw new Error("boom");
    });
  }

  const namespaces = {
    issues: { updateComment },
    pulls: { updateReviewComment },
  };
  const restInstance = { ...namespaces, rest: namespaces };
  const octokit = { rest: restInstance } as unknown as Octokits;

  return { octokit, updateComment, updateReviewComment };
}

function lastBody(m: ReturnType<typeof mock>): string {
  const calls = m.mock.calls as unknown as Array<[{ body: string }]>;
  return calls[calls.length - 1]![0].body;
}

function firstArg<T>(m: ReturnType<typeof mock>): T {
  return (m.mock.calls as unknown as Array<[T]>)[0]![0];
}

let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let consoleErrorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeEach(() => {
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("updateTrackingComment", () => {
  test("adds the branch link for an issue and updates the issue comment", async () => {
    const { octokit, updateComment, updateReviewComment } = makeOctokit();
    const context = createMockContext({ isPR: false });

    await updateTrackingComment(octokit, context, 100, "claude/issue-1");

    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(updateReviewComment).not.toHaveBeenCalled();

    const body = lastBody(updateComment);
    expect(body).toContain("[View branch]");
    expect(body).toContain(
      "https://github.com/test-owner/test-repo/tree/claude/issue-1",
    );
    const callArg = firstArg<{
      owner: string;
      repo: string;
      comment_id: number;
    }>(updateComment);
    expect(callArg.owner).toBe("test-owner");
    expect(callArg.repo).toBe("test-repo");
    expect(callArg.comment_id).toBe(100);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Updated issue comment 100 with branch link",
    );
  });

  test("does NOT add a branch link when the entity is a PR", async () => {
    const { octokit, updateComment } = makeOctokit();

    await updateTrackingComment(
      octokit,
      mockPullRequestCommentContext,
      200,
      "claude/pr-branch",
    );

    const body = lastBody(updateComment);
    expect(body).not.toContain("[View branch]");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Updated issue comment 200 with branch link",
    );
  });

  test("does NOT add a branch link when no branch is provided", async () => {
    const { octokit, updateComment } = makeOctokit();
    const context = createMockContext({ isPR: false });

    await updateTrackingComment(octokit, context, 300);

    const body = lastBody(updateComment);
    expect(body).not.toContain("[View branch]");
    // Exact body: with no branch the branchLink must be empty (kills the
    // `let branchLink = ""` default-string mutant).
    const expectedBody = createCommentBody(
      createJobRunLink("test-owner", "test-repo", "1234567890"),
    );
    expect(body).toBe(expectedBody);
  });

  test("uses the PR review comment API for review-comment events", async () => {
    const { octokit, updateComment, updateReviewComment } = makeOctokit();

    await updateTrackingComment(
      octokit,
      mockPullRequestReviewCommentContext,
      400,
      "claude/branch",
    );

    expect(updateReviewComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
    // Review comments are always on a PR, so no branch link is added.
    const body = lastBody(updateReviewComment);
    expect(body).not.toContain("[View branch]");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Updated PR review comment 400 with branch link",
    );
  });

  test("logs and rethrows when the update fails", async () => {
    const { octokit } = makeOctokit({ failUpdate: true });
    const context = createMockContext({ isPR: false });

    await expect(
      updateTrackingComment(octokit, context, 500, "claude/x"),
    ).rejects.toThrow("boom");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error updating comment with branch link:",
      expect.any(Error),
    );
  });
});
