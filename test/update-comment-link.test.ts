import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// checkAndCommitOrDeleteBranch does real git/API work; replace it with a
// controllable stub so updateCommentLink can be exercised in isolation.
let branchCleanupResult: { shouldDeleteBranch: boolean; branchLink: string } = {
  shouldDeleteBranch: false,
  branchLink: "",
};
const checkAndCommitOrDeleteBranchMock = mock(async () => branchCleanupResult);
mock.module("../src/github/operations/branch-cleanup", () => ({
  checkAndCommitOrDeleteBranch: checkAndCommitOrDeleteBranchMock,
}));

const { updateCommentLink } = await import(
  "../src/entrypoints/update-comment-link"
);
import type { UpdateCommentLinkParams } from "../src/entrypoints/update-comment-link";
import type { Octokits } from "../src/github/api/client";
import {
  createMockContext,
  mockPullRequestReviewCommentContext,
} from "./mockContext";

const OUTPUT_PATH = join(tmpdir(), `ucl-output-${process.pid}`);
const originalRunId = process.env.GITHUB_RUN_ID;
const JOB_URL = "https://github.com/test-owner/test-repo/actions/runs/999";

function makeOctokit(options?: {
  commentBody?: string;
  nullBody?: boolean;
  reviewCommentBody?: string;
  failIssueFetch?: boolean;
  failReviewFetch?: boolean;
  failPrDebug?: boolean;
  comparison?: { total_commits: number; files: { filename: string }[] };
  failCompare?: boolean;
  failUpdate?: boolean;
}) {
  const getComment = mock(async () => {
    if (options?.failIssueFetch) throw new Error("issue fetch failed");
    return {
      data: {
        body: options?.nullBody ? undefined : (options?.commentBody ?? ""),
      },
    };
  });
  const getReviewComment = mock(async () => {
    if (options?.failReviewFetch) throw new Error("review fetch failed");
    return { data: { body: options?.reviewCommentBody ?? "" } };
  });
  const get = mock(async () => {
    if (options?.failPrDebug) throw new Error("pr debug failed");
    return { data: { state: "open", comments: 3, review_comments: 1 } };
  });
  const compareCommitsWithBasehead = mock(async () => {
    if (options?.failCompare) throw new Error("compare failed");
    return {
      data: options?.comparison ?? { total_commits: 1, files: [] },
    };
  });
  const updateComment = mock(async () => {
    if (options?.failUpdate) throw new Error("update failed");
    return {
      data: { id: 1, html_url: "u", updated_at: "2024-01-01T00:00:00Z" },
    };
  });
  const updateReviewComment = mock(async () => {
    if (options?.failUpdate) throw new Error("update failed");
    return {
      data: { id: 2, html_url: "u", updated_at: "2024-01-01T00:00:00Z" },
    };
  });

  const namespaces = {
    issues: { getComment, updateComment },
    pulls: { getReviewComment, get, updateReviewComment },
    repos: { compareCommitsWithBasehead },
  };
  const restInstance = { ...namespaces, rest: namespaces };
  const octokit = { rest: restInstance } as unknown as Octokits;

  return {
    octokit,
    getComment,
    getReviewComment,
    get,
    compareCommitsWithBasehead,
    updateComment,
    updateReviewComment,
  };
}

function baseParams(
  octokit: Octokits,
  overrides: Partial<UpdateCommentLinkParams> = {},
): UpdateCommentLinkParams {
  return {
    commentId: 100,
    githubToken: "tok",
    baseBranch: "main",
    context: createMockContext({ isPR: false }),
    octokit,
    claudeSuccess: true,
    prepareSuccess: true,
    useCommitSigning: false,
    ...overrides,
  };
}

function firstArg<T>(m: ReturnType<typeof mock>): T {
  return (m.mock.calls as unknown as Array<[T]>)[0]![0];
}

function lastBody(m: ReturnType<typeof mock>): string {
  const calls = m.mock.calls as unknown as Array<[{ body: string }]>;
  return calls[calls.length - 1]![0].body;
}

const BRANCH_LINK = "\n[View branch](https://github.com/o/r/tree/claude/x)";

let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let consoleErrorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeEach(() => {
  branchCleanupResult = { shouldDeleteBranch: false, branchLink: "" };
  checkAndCommitOrDeleteBranchMock.mockClear();
  process.env.GITHUB_RUN_ID = "999";
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  if (originalRunId === undefined) {
    delete process.env.GITHUB_RUN_ID;
  } else {
    process.env.GITHUB_RUN_ID = originalRunId;
  }
});

afterAll(() => {
  rmSync(OUTPUT_PATH, { force: true });
});

describe("updateCommentLink", () => {
  test("fetches an issue comment and updates it with the job link", async () => {
    const o = makeOctokit();

    await updateCommentLink(baseParams(o.octokit));

    expect(o.getComment).toHaveBeenCalledTimes(1);
    expect(
      firstArg<{ owner: string; repo: string; comment_id: number }>(
        o.getComment,
      ),
    ).toEqual({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 100,
    });
    expect(o.getReviewComment).not.toHaveBeenCalled();
    // No branch -> branch-link logic skipped entirely (no compare call).
    expect(o.compareCommitsWithBasehead).not.toHaveBeenCalled();
    expect(o.updateComment).toHaveBeenCalledTimes(1);
    expect(lastBody(o.updateComment)).toContain(`[View job](${JOB_URL})`);
    // Without an output file the success path must not log a read error.
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Error reading output file:",
      expect.anything(),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Fetching issue comment 100");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Successfully fetched as issue comment",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Updated issue comment 100 with job link",
    );
  });

  test("fetches a PR review comment via the pulls API for review-comment events", async () => {
    const o = makeOctokit();

    await updateCommentLink(
      baseParams(o.octokit, {
        context: mockPullRequestReviewCommentContext,
        commentId: 200,
      }),
    );

    expect(o.getReviewComment).toHaveBeenCalledTimes(1);
    expect(
      firstArg<{ owner: string; repo: string; comment_id: number }>(
        o.getReviewComment,
      ),
    ).toEqual({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 200,
    });
    expect(o.updateReviewComment).toHaveBeenCalledTimes(1);
    expect(o.updateComment).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Fetching PR review comment 200",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Successfully fetched as PR review comment",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✅ Updated PR review comment 200 with job link",
    );
  });

  test("logs full debug info and rethrows when the comment cannot be fetched", async () => {
    const o = makeOctokit({ failIssueFetch: true });

    await expect(updateCommentLink(baseParams(o.octokit))).rejects.toThrow(
      "issue fetch failed",
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to fetch comment. Debug info:",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith("Comment ID: 100");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Event name: issue_comment");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Entity number: 1");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Repository: test-owner/test-repo",
    );
    // It tries to fetch PR info for debugging.
    expect(o.get).toHaveBeenCalledTimes(1);
    expect(
      firstArg<{ owner: string; repo: string; pull_number: number }>(o.get),
    ).toEqual({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 1,
    });
    expect(consoleLogSpy).toHaveBeenCalledWith("PR state: open");
    expect(consoleLogSpy).toHaveBeenCalledWith("PR comments count: 3");
    expect(consoleLogSpy).toHaveBeenCalledWith("PR review comments count: 1");
  });

  test("logs when the PR debug fetch also fails", async () => {
    const o = makeOctokit({ failIssueFetch: true, failPrDebug: true });

    await expect(updateCommentLink(baseParams(o.octokit))).rejects.toThrow(
      "issue fetch failed",
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Could not fetch PR info for debugging",
    );
  });

  test("adds a Create-PR link for an issue branch with commit changes", async () => {
    const o = makeOctokit({ comparison: { total_commits: 2, files: [] } });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(o.compareCommitsWithBasehead).toHaveBeenCalledTimes(1);
    expect(
      firstArg<{ basehead: string }>(o.compareCommitsWithBasehead).basehead,
    ).toBe("main...claude/x");
    const body = lastBody(o.updateComment);
    expect(body).toContain("compare/main...claude/x");
    expect(body).toContain("quick_pull=1");
    // entityType "Issue" + lowercase body, URL-encoded.
    expect(body).toContain("title=Issue%20%231");
    expect(body).toContain("addresses%20issue%20%231");
  });

  test("uses PR as the entity type when the entity is a PR", async () => {
    const o = makeOctokit({ comparison: { total_commits: 1, files: [] } });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, {
        claudeBranch: "claude/x",
        context: createMockContext({ isPR: true }),
      }),
    );

    const body = lastBody(o.updateComment);
    expect(body).toContain("title=PR%20%231");
    expect(body).toContain("addresses%20pr%20%231");
  });

  test("adds a Create-PR link when only files changed (no commits)", async () => {
    const o = makeOctokit({
      comparison: { total_commits: 0, files: [{ filename: "a.ts" }] },
    });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(lastBody(o.updateComment)).toContain("quick_pull=1");
  });

  test("skips the Create-PR link when the comment already contains a PR URL", async () => {
    const o = makeOctokit({
      commentBody:
        "existing https://github.com/test-owner/test-repo/compare/main...claude/x body",
    });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(o.compareCommitsWithBasehead).not.toHaveBeenCalled();
  });

  test("skips the branch-link logic when the branch is to be deleted", async () => {
    const o = makeOctokit();
    branchCleanupResult = { shouldDeleteBranch: true, branchLink: "" };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(o.compareCommitsWithBasehead).not.toHaveBeenCalled();
    expect(lastBody(o.updateComment)).not.toContain("quick_pull=1");
  });

  test("does not add a Create-PR link when the branch has no changes", async () => {
    const o = makeOctokit({ comparison: { total_commits: 0, files: [] } });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(o.compareCommitsWithBasehead).toHaveBeenCalledTimes(1);
    const body = lastBody(o.updateComment);
    expect(body).not.toContain("quick_pull=1");
    expect(body).not.toContain("Stryker was here!"); // prLink stays ""
  });

  test("does not fail when the change comparison throws", async () => {
    const o = makeOctokit({ failCompare: true });
    branchCleanupResult = {
      shouldDeleteBranch: false,
      branchLink: BRANCH_LINK,
    };

    await updateCommentLink(
      baseParams(o.octokit, { claudeBranch: "claude/x" }),
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error checking for changes in branch:",
      expect.any(Error),
    );
    expect(o.updateComment).toHaveBeenCalledTimes(1);
  });

  test("does not inject a placeholder when the existing comment body is null", async () => {
    const o = makeOctokit({ nullBody: true });

    await updateCommentLink(baseParams(o.octokit));

    expect(lastBody(o.updateComment)).not.toContain("Stryker was here!");
  });

  test("marks the action as failed when prepare failed with an error", async () => {
    const o = makeOctokit();

    await updateCommentLink(
      baseParams(o.octokit, {
        prepareSuccess: false,
        prepareError: "prepare blew up",
      }),
    );

    const body = lastBody(o.updateComment);
    expect(body).toContain("Claude encountered an error");
    // When prepare fails the output file must not be read.
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Error reading output file:",
      expect.anything(),
    );
  });

  test("treats prepare-failure without an error message as a non-prepare failure", async () => {
    const o = makeOctokit();

    await updateCommentLink(
      baseParams(o.octokit, { prepareSuccess: false, claudeSuccess: true }),
    );

    // !prepareSuccess && prepareError is false (no error string), so it falls
    // through to the success path and reads claudeSuccess (true) -> finished.
    expect(lastBody(o.updateComment)).toContain("finished");
  });

  test("reads execution details from the output file", async () => {
    const o = makeOctokit();
    writeFileSync(
      OUTPUT_PATH,
      JSON.stringify([
        { type: "result", total_cost_usd: 0.12, duration_ms: 65000 },
      ]),
    );

    await updateCommentLink(baseParams(o.octokit, { outputFile: OUTPUT_PATH }));

    // duration_ms 65000 -> "1m 5s" rendered in the body header.
    expect(lastBody(o.updateComment)).toContain("1m 5s");
  });

  test("ignores the output file when the last element is not a result", async () => {
    const o = makeOctokit();
    writeFileSync(
      OUTPUT_PATH,
      JSON.stringify([
        { type: "other", total_cost_usd: 0.12, duration_ms: 65000 },
      ]),
    );

    await updateCommentLink(baseParams(o.octokit, { outputFile: OUTPUT_PATH }));

    // type !== "result" -> no execution details -> no duration in the header.
    expect(lastBody(o.updateComment)).not.toContain("1m 5s");
  });

  test("ignores an empty output array without raising a read error", async () => {
    const o = makeOctokit();
    writeFileSync(OUTPUT_PATH, JSON.stringify([]));

    await updateCommentLink(baseParams(o.octokit, { outputFile: OUTPUT_PATH }));

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Error reading output file:",
      expect.anything(),
    );
    expect(lastBody(o.updateComment)).not.toContain("1m 5s");
  });

  test("logs an error when the output file cannot be read", async () => {
    const o = makeOctokit();

    await updateCommentLink(
      baseParams(o.octokit, {
        outputFile: join(tmpdir(), "does-not-exist-xyz.json"),
      }),
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error reading output file:",
      expect.any(Error),
    );
    // After a read error it still falls back to claudeSuccess (true) -> finished
    // (kills the `actionFailed = !claudeSuccess` mutant in the catch block).
    expect(lastBody(o.updateComment)).toContain("finished");
  });

  test("logs and rethrows when the final issue comment update fails", async () => {
    const o = makeOctokit({ failUpdate: true });

    await expect(updateCommentLink(baseParams(o.octokit))).rejects.toThrow(
      "update failed",
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to update issue comment:",
      expect.any(Error),
    );
  });

  test("logs and rethrows when the final PR review comment update fails", async () => {
    const o = makeOctokit({ failUpdate: true });

    await expect(
      updateCommentLink(
        baseParams(o.octokit, {
          context: mockPullRequestReviewCommentContext,
          commentId: 200,
        }),
      ),
    ).rejects.toThrow("update failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to update PR review comment:",
      expect.any(Error),
    );
  });
});
