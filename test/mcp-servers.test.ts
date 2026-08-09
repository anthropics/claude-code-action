#!/usr/bin/env bun

/**
 * Tests for the remaining three in-process MCP servers: the tracking-comment
 * updater, the inline PR comment tool, and the read-only CI server. None had
 * any coverage before their handlers were extracted from the anonymous
 * `server.tool()` callbacks.
 *
 * Each handler takes an optional Octokit as its last argument, so these use a
 * stub client rather than mocking @octokit/rest globally — mock.module is
 * process-wide in Bun, and mocking a first-party module used across the suite
 * would leak into unrelated test files.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { Octokit } from "@octokit/rest";

import {
  readCommentContext,
  updateComment,
  MISSING_REPO_ENV_MESSAGE as COMMENT_MISSING_ENV,
} from "../src/mcp/github-comment-server";
import {
  createInlineComment,
  inlineCommentError,
  readInlineCommentContext,
  MISSING_REPO_ENV_MESSAGE as INLINE_MISSING_ENV,
} from "../src/mcp/github-inline-comment-server";
import {
  downloadJobLog,
  getCiStatus,
  getWorkflowRunDetails,
  readCiContext,
  MISSING_ENV_MESSAGE as CI_MISSING_ENV,
} from "../src/mcp/github-actions-server";
import { toolError, toolSuccess } from "../src/mcp/tool-result";

describe("shared tool result envelope", () => {
  // This shape is what the model sees when a tool call fails. All four servers
  // depend on it, so it is asserted once here rather than in each.
  test("marks failures with isError and an Error-prefixed message", () => {
    const result = toolError(new Error("no permission"));

    expect(result.isError).toBe(true);
    expect(result.error).toBe("no permission");
    expect(result.content).toEqual([
      { type: "text", text: "Error: no permission" },
    ]);
  });

  test("stringifies a non-Error throw", () => {
    expect(toolError("plain string").error).toBe("plain string");
  });

  test("success carries pretty-printed JSON and no error flag", () => {
    const result = toolSuccess({ ok: true });

    expect(result.isError).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ ok: true });
    expect(result.content[0]!.text).toContain("\n");
  });
});

const parse = (result: { content: { text: string }[] }) =>
  JSON.parse(result.content[0]!.text);

describe("github_comment server", () => {
  const context = {
    owner: "test-owner",
    repo: "test-repo",
    commentId: 42,
    githubToken: "test-token",
    isPullRequestReviewComment: false,
  };

  function stubOctokit(calls: any[], overrides: any = {}) {
    const reply = {
      data: { id: 42, html_url: "https://example.test/c/42", updated_at: "t" },
    };
    return {
      rest: {
        issues: {
          updateComment: async (params: any) => {
            calls.push(["issues.updateComment", params]);
            return reply;
          },
        },
        pulls: {
          updateReviewComment: async (params: any) => {
            calls.push(["pulls.updateReviewComment", params]);
            return reply;
          },
        },
        ...overrides,
      },
    } as unknown as Octokit;
  }

  test("updates an issue comment and returns the comment details", async () => {
    const calls: any[] = [];

    const result = await updateComment(
      { body: "progress update" },
      context,
      stubOctokit(calls),
    );

    expect(calls[0][0]).toBe("issues.updateComment");
    expect(calls[0][1]).toMatchObject({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 42,
      body: "progress update",
    });
    expect(parse(result)).toEqual({
      id: 42,
      html_url: "https://example.test/c/42",
      updated_at: "t",
    });
  });

  test("uses the review-comment API on a pull_request_review_comment event", async () => {
    const calls: any[] = [];

    await updateComment(
      { body: "review update" },
      { ...context, isPullRequestReviewComment: true },
      stubOctokit(calls),
    );

    expect(calls[0][0]).toBe("pulls.updateReviewComment");
  });

  test("sanitizes the body before it reaches GitHub", async () => {
    const calls: any[] = [];
    // A zero-width character is the kind of thing the sanitizer strips; if the
    // handler stopped calling it, hidden instructions would round-trip into the
    // comment.
    await updateComment({ body: "hel​lo" }, context, stubOctokit(calls));

    expect(calls[0][1].body).toBe("hello");
  });

  describe("readCommentContext", () => {
    test("reads owner, repo, comment id and event kind", () => {
      expect(
        readCommentContext({
          REPO_OWNER: "o",
          REPO_NAME: "r",
          GITHUB_TOKEN: "t",
          CLAUDE_COMMENT_ID: "7",
          GITHUB_EVENT_NAME: "pull_request_review_comment",
        } as NodeJS.ProcessEnv),
      ).toEqual({
        owner: "o",
        repo: "r",
        commentId: 7,
        githubToken: "t",
        isPullRequestReviewComment: true,
      });
    });

    test("rejects a missing repository environment", () => {
      expect(() => readCommentContext({} as NodeJS.ProcessEnv)).toThrow(
        COMMENT_MISSING_ENV,
      );
    });

    test("rejects a missing comment id", () => {
      expect(() =>
        readCommentContext({
          REPO_OWNER: "o",
          REPO_NAME: "r",
          GITHUB_TOKEN: "t",
        } as NodeJS.ProcessEnv),
      ).toThrow("CLAUDE_COMMENT_ID environment variable is required");
    });
  });
});

describe("github_inline_comment server", () => {
  let tempDir = "";
  let bufferPath = "";
  let context: Parameters<typeof createInlineComment>[1];

  beforeEach(() => {
    tempDir = mkdtempSync(join("/tmp", "inline-comment-"));
    bufferPath = join(tempDir, "buffer.jsonl");
    writeFileSync(bufferPath, "");
    context = {
      owner: "test-owner",
      repo: "test-repo",
      pullNumber: 7,
      githubToken: "test-token",
      classifyEnabled: true,
      bufferPath,
    };
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function stubOctokit(calls: any[]) {
    return {
      pulls: {
        get: async () => ({ data: { head: { sha: "head-sha" } } }),
      },
      rest: {
        pulls: {
          createReviewComment: async (params: any) => {
            calls.push(params);
            return {
              data: {
                id: 99,
                html_url: "https://example.test/r/99",
                path: params.path,
                line: params.line,
              },
            };
          },
        },
      },
    } as any;
  }

  const bufferLines = () =>
    readFileSync(bufferPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  test("buffers instead of posting when confirmed is omitted", async () => {
    const calls: any[] = [];

    const result = await createInlineComment(
      { path: "src/a.ts", body: "nit", line: 3 },
      context,
      stubOctokit(calls),
    );

    expect(calls).toEqual([]);
    expect(parse(result).buffered).toBe(true);
    expect(bufferLines()).toHaveLength(1);
    expect(bufferLines()[0]).toMatchObject({
      path: "src/a.ts",
      line: 3,
      body: "nit",
    });
  });

  test("buffers when confirmed is explicitly false", async () => {
    const calls: any[] = [];

    await createInlineComment(
      { path: "src/a.ts", body: "nit", line: 3, confirmed: false },
      context,
      stubOctokit(calls),
    );

    expect(calls).toEqual([]);
    expect(bufferLines()).toHaveLength(1);
  });

  test("posts immediately when confirmed is true", async () => {
    const calls: any[] = [];

    const result = await createInlineComment(
      { path: "src/a.ts", body: "real review", line: 3, confirmed: true },
      context,
      stubOctokit(calls),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 7,
      path: "src/a.ts",
      line: 3,
      side: "RIGHT",
      commit_id: "head-sha",
    });
    expect(parse(result).comment_id).toBe(99);
  });

  test("drops the buffered copy when the same comment is later confirmed", async () => {
    const calls: any[] = [];
    const comment = { path: "src/a.ts", body: "nit", line: 3 };

    await createInlineComment(comment, context, stubOctokit(calls));
    expect(bufferLines()).toHaveLength(1);

    // The model commonly re-issues the buffered call with confirmed=true after
    // reading the "buffered" reply. Without the removal the post-session step
    // would post the same comment a second time.
    await createInlineComment(
      { ...comment, confirmed: true },
      context,
      stubOctokit(calls),
    );

    expect(calls).toHaveLength(1);
    expect(bufferLines()).toHaveLength(0);
  });

  test("posts directly when classification is disabled", async () => {
    const calls: any[] = [];

    await createInlineComment(
      { path: "src/a.ts", body: "nit", line: 3 },
      { ...context, classifyEnabled: false },
      stubOctokit(calls),
    );

    expect(calls).toHaveLength(1);
    expect(existsSync(bufferPath)).toBe(true);
    expect(bufferLines()).toHaveLength(0);
  });

  test("sends multi-line comments with a start line and side", async () => {
    const calls: any[] = [];

    await createInlineComment(
      {
        path: "src/a.ts",
        body: "range",
        startLine: 3,
        line: 8,
        side: "LEFT",
        confirmed: true,
      },
      context,
      stubOctokit(calls),
    );

    expect(calls[0]).toMatchObject({
      start_line: 3,
      start_side: "LEFT",
      line: 8,
      side: "LEFT",
    });
  });

  test("requires a line or a start line", async () => {
    await expect(
      createInlineComment({ path: "src/a.ts", body: "where?" }, context),
    ).rejects.toThrow(/Either 'line' .* must be provided/);
  });

  test("sanitizes the body before buffering", async () => {
    await createInlineComment(
      { path: "src/a.ts", body: "hel​lo", line: 1 },
      context,
    );

    expect(bufferLines()[0].body).toBe("hello");
  });

  describe("error envelope", () => {
    test("explains a validation failure in diff terms", () => {
      const result = inlineCommentError(new Error("Validation Failed"));

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain(
        "line number doesn't exist in the diff",
      );
    });

    test("explains a 404 in terms of the PR or path", () => {
      const result = inlineCommentError(new Error("Not Found"));

      expect(result.content[0]!.text).toContain(
        "PR number, repository, or file path is incorrect",
      );
    });

    test("passes an unrecognised error through without guidance", () => {
      const result = inlineCommentError(new Error("boom"));

      expect(result.content[0]!.text).toBe(
        "Error creating inline comment: boom",
      );
    });
  });

  describe("readInlineCommentContext", () => {
    test("defaults classification on and reads the PR number", () => {
      const parsed = readInlineCommentContext({
        REPO_OWNER: "o",
        REPO_NAME: "r",
        PR_NUMBER: "12",
        GITHUB_TOKEN: "t",
      } as NodeJS.ProcessEnv);

      expect(parsed.pullNumber).toBe(12);
      expect(parsed.classifyEnabled).toBe(true);
    });

    test("only the exact string 'false' disables classification", () => {
      const off = readInlineCommentContext({
        REPO_OWNER: "o",
        REPO_NAME: "r",
        PR_NUMBER: "1",
        GITHUB_TOKEN: "t",
        CLASSIFY_INLINE_COMMENTS: "false",
      } as NodeJS.ProcessEnv);
      const on = readInlineCommentContext({
        REPO_OWNER: "o",
        REPO_NAME: "r",
        PR_NUMBER: "1",
        GITHUB_TOKEN: "t",
        CLASSIFY_INLINE_COMMENTS: "0",
      } as NodeJS.ProcessEnv);

      expect(off.classifyEnabled).toBe(false);
      expect(on.classifyEnabled).toBe(true);
    });

    test("rejects a missing repository environment", () => {
      expect(() => readInlineCommentContext({} as NodeJS.ProcessEnv)).toThrow(
        INLINE_MISSING_ENV,
      );
    });
  });
});

describe("github_ci server", () => {
  let tempDir = "";
  let context: Parameters<typeof getCiStatus>[1];

  beforeEach(() => {
    tempDir = mkdtempSync(join("/tmp", "ci-server-"));
    context = {
      owner: "test-owner",
      repo: "test-repo",
      pullNumber: 7,
      githubToken: "test-token",
      runnerTemp: tempDir,
    };
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  test("summarises workflow runs for the PR head commit", async () => {
    let requestedSha = "";
    const client = {
      pulls: { get: async () => ({ data: { head: { sha: "head-sha" } } }) },
      actions: {
        listWorkflowRunsForRepo: async (params: any) => {
          requestedSha = params.head_sha;
          return {
            data: {
              workflow_runs: [
                { id: 1, status: "completed", conclusion: "success" },
                { id: 2, status: "completed", conclusion: "failure" },
                { id: 3, status: "in_progress", conclusion: null },
                { id: 4, status: "completed", conclusion: "cancelled" },
              ],
            },
          };
        },
      },
    } as unknown as Octokit;

    const result = await getCiStatus({}, context, client);

    expect(requestedSha).toBe("head-sha");
    // A cancelled run counts in total_runs but in none of the three buckets.
    expect(parse(result).summary).toEqual({
      total_runs: 4,
      failed: 1,
      passed: 1,
      pending: 1,
    });
    expect(parse(result).runs.map((run: any) => run.id)).toEqual([1, 2, 3, 4]);
  });

  test("handles a PR with no workflow runs", async () => {
    const client = {
      pulls: { get: async () => ({ data: { head: { sha: "head-sha" } } }) },
      actions: {
        listWorkflowRunsForRepo: async () => ({ data: {} }),
      },
    } as unknown as Octokit;

    expect(parse(await getCiStatus({}, context, client)).summary).toEqual({
      total_runs: 0,
      failed: 0,
      passed: 0,
      pending: 0,
    });
  });

  test("extracts only the failed steps of each job", async () => {
    const client = {
      actions: {
        listJobsForWorkflowRun: async () => ({
          data: {
            jobs: [
              {
                id: 10,
                name: "build",
                conclusion: "failure",
                steps: [
                  { name: "checkout", number: 1, conclusion: "success" },
                  { name: "compile", number: 2, conclusion: "failure" },
                ],
              },
              { id: 11, name: "lint", conclusion: "success" },
            ],
          },
        }),
      },
    } as unknown as Octokit;

    const jobs = parse(
      await getWorkflowRunDetails({ run_id: 5 }, context, client),
    ).jobs;

    expect(jobs[0].failed_steps).toEqual([{ name: "compile", number: 2 }]);
    // A job with no steps array must not throw.
    expect(jobs[1].failed_steps).toEqual([]);
  });

  test("writes job logs under RUNNER_TEMP and reports the size", async () => {
    const client = {
      actions: {
        downloadJobLogsForWorkflowRun: async () => ({ data: "line one\n" }),
      },
    } as unknown as Octokit;

    const result = parse(await downloadJobLog({ job_id: 77 }, context, client));

    expect(result.path).toBe(`${tempDir}/github-ci-logs/job-77.log`);
    expect(result.size_bytes).toBe(9);
    expect(readFileSync(result.path, "utf8")).toBe("line one\n");
  });

  describe("readCiContext", () => {
    test("defaults RUNNER_TEMP to /tmp", () => {
      const parsed = readCiContext({
        REPO_OWNER: "o",
        REPO_NAME: "r",
        PR_NUMBER: "3",
        GITHUB_TOKEN: "t",
      } as NodeJS.ProcessEnv);

      expect(parsed.runnerTemp).toBe("/tmp");
      expect(parsed.pullNumber).toBe(3);
    });

    test("requires the token as well as the repository", () => {
      expect(() =>
        readCiContext({
          REPO_OWNER: "o",
          REPO_NAME: "r",
          PR_NUMBER: "3",
        } as NodeJS.ProcessEnv),
      ).toThrow(CI_MISSING_ENV);
    });
  });
});
