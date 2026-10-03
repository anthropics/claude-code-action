/**
 * Tests for update-comment-link.ts
 *
 * Key regression: when Claude runs but makes no commits (e.g. exits early with
 * is_error:true), the claude branch is generated locally but never pushed.
 * checkAndCommitOrDeleteBranch returns { shouldDeleteBranch: false, branchLink: "" }
 * because the branch doesn't exist remotely. The PR-link block must NOT call
 * compareCommitsWithBasehead in this case, as the branch doesn't exist on the
 * remote and the API would return 404, causing the entire action to fail.
 *
 * See: https://github.com/anthropics/claude-code-action/issues/1645
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import type { Octokits } from "../src/github/api/client";
import type { ParsedGitHubContext } from "../src/github/context";

type MockOctokitOptions = {
  /** Whether the claude branch exists on the remote */
  branchExistsRemotely: boolean;
  /** Total commits ahead of base (returned when branch exists and compare is called) */
  totalCommits?: number;
};

/**
 * Build a minimal mock Octokits that satisfies what updateCommentLink uses.
 *
 * The real @octokit/rest Octokit instance exposes endpoints under `.rest.*`,
 * so `updateClaudeComment(octokit.rest, ...)` receives an Octokit instance
 * and then accesses `octokit.rest.issues.updateComment(...)`.  Our mock must
 * therefore mirror that nesting: `mockOctokit.rest` is an object that itself
 * has a `.rest` property with the endpoint stubs on it.
 */
function createMockOctokit(opts: MockOctokitOptions): {
  octokit: Octokits;
  compareCallCount: { value: number };
} {
  const compareCallCount = { value: 0 };

  // Endpoint stubs — these are the leaf-level API methods.
  const endpoints = {
    repos: {
      getBranch: async () => {
        if (!opts.branchExistsRemotely) {
          const err: any = new Error("Not Found");
          err.status = 404;
          throw err;
        }
        return { data: {} };
      },
      compareCommitsWithBasehead: async () => {
        compareCallCount.value++;
        return {
          data: {
            total_commits: opts.totalCommits ?? 0,
            files: opts.totalCommits ? [{ filename: "foo.ts" }] : [],
          },
        };
      },
    },
    git: {
      deleteRef: async () => ({ data: {} }),
    },
    issues: {
      getComment: async () => ({
        data: {
          id: 5285342908,
          body: "<!-- claude-spinner -->Claude Code is working…",
          html_url:
            "https://github.com/kratsg/giordonstark.com/issues/44#issuecomment-5285342908",
          updated_at: "2026-08-13T19:20:00Z",
        },
      }),
      updateComment: async () => ({
        data: {
          id: 5285342908,
          html_url:
            "https://github.com/kratsg/giordonstark.com/issues/44#issuecomment-5285342908",
          updated_at: "2026-08-13T19:21:00Z",
          body: "updated",
        },
      }),
    },
    pulls: {
      get: async () => ({
        data: { state: "open", comments: 0, review_comments: 0 },
      }),
      getReviewComment: async () => {
        const err: any = new Error("Not Found");
        err.status = 404;
        throw err;
      },
      updateReviewComment: async () => {
        const err: any = new Error("Not Found");
        err.status = 404;
        throw err;
      },
    },
  };

  // The real Octokit instance has `instance.rest.*` for endpoints.
  // updateCommentLink uses `octokit.rest.*` (from Octokits) AND then passes
  // `octokit.rest` to updateClaudeComment, which in turn calls
  // `octokit.rest.issues.*` — so our mock's `.rest` field itself needs a
  // `.rest` sub-property with the same endpoint stubs.
  const octokitRestInstance = {
    ...endpoints,
    rest: endpoints, // mirrors the real Octokit shape
  };

  const octokit: Octokits = {
    rest: octokitRestInstance as any,
    graphql: async () => ({}) as any,
  };

  return { octokit, compareCallCount };
}

function createMockContext(
  overrides: Partial<ParsedGitHubContext> = {},
): ParsedGitHubContext {
  return {
    eventName: "issues",
    isPR: false,
    entityNumber: 44,
    actor: "kratsg",
    repository: {
      owner: "kratsg",
      repo: "giordonstark.com",
      full_name: "kratsg/giordonstark.com",
      default_branch: "main",
    },
    payload: {},
    inputs: {
      useCommitSigning: false,
      prompt: "@claude fix this",
      allowedNonWriteUsers: [],
      baseBranch: "",
      branchPrefix: "claude",
      branchNameTemplate: "",
    },
    ...overrides,
  } as any as ParsedGitHubContext;
}

describe("updateCommentLink", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
    process.env.GITHUB_RUN_ID = "99999999";
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete process.env.GITHUB_RUN_ID;
  });

  test("does not call compareCommitsWithBasehead when branch does not exist remotely", async () => {
    // Regression test for issue #1645.
    // When Claude exits with is_error:true without pushing any commits, the
    // branch was never created remotely. We must NOT call compareCommitsWithBasehead
    // on a non-existent branch — the GitHub API returns 404, which previously
    // caused the action to fail with "Error: Action failed with error: Claude
    // execution failed: result is_error:true".
    const { updateCommentLink } = await import(
      "../src/entrypoints/update-comment-link"
    );

    const { octokit, compareCallCount } = createMockOctokit({
      branchExistsRemotely: false,
    });

    await updateCommentLink({
      commentId: 5285342908,
      githubToken: "fake-token",
      claudeBranch: "claude/issue-44-20260813-1920",
      baseBranch: "main",
      triggerUsername: "kratsg",
      context: createMockContext(),
      octokit,
      claudeSuccess: false, // Claude exited with is_error:true
      outputFile: undefined,
      prepareSuccess: true,
      prepareError: undefined,
      useCommitSigning: false,
    });

    expect(compareCallCount.value).toBe(0);
  });

  test("completes without throwing when branch does not exist remotely", async () => {
    // Full end-to-end check: updateCommentLink must not propagate any 404
    // when the branch was never pushed.
    const { updateCommentLink } = await import(
      "../src/entrypoints/update-comment-link"
    );

    const { octokit } = createMockOctokit({ branchExistsRemotely: false });

    await expect(
      updateCommentLink({
        commentId: 5285342908,
        githubToken: "fake-token",
        claudeBranch: "claude/issue-44-20260813-1920",
        baseBranch: "main",
        triggerUsername: "kratsg",
        context: createMockContext(),
        octokit,
        claudeSuccess: false,
        outputFile: undefined,
        prepareSuccess: true,
        prepareError: undefined,
        useCommitSigning: false,
      }),
    ).resolves.toBeUndefined();
  });

  test("calls compareCommitsWithBasehead when branch exists remotely with commits", async () => {
    // Happy-path: branch exists and has commits → we call the compare API to
    // decide whether to add a "Create a PR" link.
    const { updateCommentLink } = await import(
      "../src/entrypoints/update-comment-link"
    );

    const { octokit, compareCallCount } = createMockOctokit({
      branchExistsRemotely: true,
      totalCommits: 2,
    });

    await updateCommentLink({
      commentId: 5285342908,
      githubToken: "fake-token",
      claudeBranch: "claude/issue-44-20260813-1920",
      baseBranch: "main",
      triggerUsername: "kratsg",
      context: createMockContext(),
      octokit,
      claudeSuccess: true,
      outputFile: undefined,
      prepareSuccess: true,
      prepareError: undefined,
      useCommitSigning: false,
    });

    // One call from branch-cleanup (to decide delete/keep) + one from
    // update-comment-link (to decide PR link). Both use the same mock counter.
    expect(compareCallCount.value).toBeGreaterThanOrEqual(1);
  });

  test("does not call compareCommitsWithBasehead when claudeBranch is undefined", async () => {
    // Sanity check for open-PR mode: no branch created → no compare call.
    const { updateCommentLink } = await import(
      "../src/entrypoints/update-comment-link"
    );

    const { octokit, compareCallCount } = createMockOctokit({
      branchExistsRemotely: false,
    });

    await updateCommentLink({
      commentId: 5285342908,
      githubToken: "fake-token",
      claudeBranch: undefined, // open-PR scenario: no new branch
      baseBranch: "main",
      triggerUsername: "kratsg",
      context: createMockContext(),
      octokit,
      claudeSuccess: true,
      outputFile: undefined,
      prepareSuccess: true,
      prepareError: undefined,
      useCommitSigning: false,
    });

    expect(compareCallCount.value).toBe(0);
  });
});
