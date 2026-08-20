import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import * as core from "@actions/core";
import {
  postComments,
  postComment,
  formatErrorDetails,
  type BufferedComment,
} from "../src/entrypoints/post-buffered-inline-comments";
import type { createOctokit } from "../src/github/api/client";

describe("post-buffered-inline-comments", () => {
  let coreErrorSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    coreErrorSpy = spyOn(core, "error").mockImplementation(() => {});
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    coreErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  function createMockOctokit(
    createReviewCommentFn: (params: unknown) => Promise<unknown>,
  ): ReturnType<typeof createOctokit>["rest"] {
    return {
      rest: {
        pulls: {
          createReviewComment: createReviewCommentFn,
        },
      },
    } as unknown as ReturnType<typeof createOctokit>["rest"];
  }

  const commentA: BufferedComment = {
    ts: "2026-08-16T00:00:00.000Z",
    path: "src/index.ts",
    line: 10,
    body: "Fix variable naming",
  };

  const commentB: BufferedComment = {
    ts: "2026-08-16T00:00:01.000Z",
    path: "src/utils.ts",
    line: 25,
    body: "Add null check here",
  };

  it("handles all-success: posts every comment, returns count, emits no error annotations", async () => {
    const attempted: unknown[] = [];
    const octokit = createMockOctokit(async (params) => {
      attempted.push(params);
      return { data: { id: 101 } };
    });

    const result = await postComments(
      octokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      [commentA, commentB],
    );

    expect(result).toEqual({ posted: 2, failed: 0, total: 2 });
    expect(attempted).toHaveLength(2);
    expect(coreErrorSpy).not.toHaveBeenCalled();
  });

  it("handles partial failure: attempts all comments, reports failed/total summary, and does not fail process", async () => {
    const attempted: unknown[] = [];
    const octokit = createMockOctokit(async (params) => {
      attempted.push(params);
      const p = params as { path: string };
      if (p.path === "src/index.ts") {
        throw new Error("HTTP 500: Server Error");
      }
      return { data: { id: 102 } };
    });

    const result = await postComments(
      octokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      [commentA, commentB],
    );

    expect(result).toEqual({ posted: 1, failed: 1, total: 2 });
    expect(attempted).toHaveLength(2);

    const errorCalls = (coreErrorSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(errorCalls).toHaveLength(2);

    // First call is diagnostic for failed commentA
    expect(errorCalls[0]).toBe(
      "Failed to post src/index.ts:10: HTTP 500: Server Error",
    );

    // Second call is summary
    expect(errorCalls[1]).toBe("Failed to post 1/2 inline comment(s)");

    // Logs contain dropped comment body
    const logCalls = (consoleLogSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(
      logCalls.some(
        (line) =>
          line.includes("dropped comment body:") &&
          line.includes(JSON.stringify(commentA.body)),
      ),
    ).toBe(true);
  });

  it("handles total failure: attempts all comments, emits diagnostics and summary, and throws non-zero error", async () => {
    const attempted: unknown[] = [];
    const octokit = createMockOctokit(async (params) => {
      attempted.push(params);
      throw new Error("Delivery rejected");
    });

    await expect(
      postComments(octokit, "test-owner", "test-repo", 42, "head-sha-123", [
        commentA,
        commentB,
      ]),
    ).rejects.toThrow("Failed to post 2/2 inline comment(s)");

    expect(attempted).toHaveLength(2);

    const errorCalls = (coreErrorSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(errorCalls).toHaveLength(3);

    expect(errorCalls[0]).toBe(
      "Failed to post src/index.ts:10: Delivery rejected",
    );
    expect(errorCalls[1]).toBe(
      "Failed to post src/utils.ts:25: Delivery rejected",
    );
    expect(errorCalls[2]).toBe("Failed to post 2/2 inline comment(s)");
  });

  it("extracts and preserves GitHub/Octokit 422 diagnostic details", async () => {
    const error422 = {
      message: "Validation Failed",
      status: 422,
      response: {
        status: 422,
        data: {
          message: "Validation Failed",
          errors: [
            {
              resource: "PullRequestReviewThread",
              field: "path",
              code: "invalid",
            },
          ],
        },
      },
    };

    const details = formatErrorDetails(error422);
    expect(details).toContain("Validation Failed");
    expect(details).toContain("422");
    expect(details).toContain("PullRequestReviewThread");
    expect(details).toContain("invalid");

    const octokit = createMockOctokit(async () => {
      throw error422;
    });

    const success = await postComment(
      octokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      commentA,
    );

    expect(success).toBe(false);

    const errorCalls = (coreErrorSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toContain("src/index.ts:10");
    expect(errorCalls[0]).toContain("Validation Failed");
    expect(errorCalls[0]).toContain("422");
    expect(errorCalls[0]).toContain("PullRequestReviewThread");
    expect(errorCalls[0]).toContain("invalid");
  });

  it("preserves multiline comment body in logs safely on a single log line", async () => {
    const multilineComment: BufferedComment = {
      ts: "2026-08-16T00:00:00.000Z",
      path: "src/danger.ts",
      line: 99,
      body: "Line 1: Problem found\n::warning::Injected command\nLine 3: Suggested fix",
    };

    const octokit = createMockOctokit(async () => {
      throw new Error("Unprocessable Entity");
    });

    const success = await postComment(
      octokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      multilineComment,
    );

    expect(success).toBe(false);

    const errorCalls = (coreErrorSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toBe(
      "Failed to post src/danger.ts:99: Unprocessable Entity",
    );

    const logCalls = (consoleLogSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    const droppedBodyLog = logCalls.find((line) =>
      line.includes("dropped comment body:"),
    );
    expect(droppedBodyLog).toBeDefined();
    expect(droppedBodyLog).toContain(JSON.stringify(multilineComment.body));
    expect(droppedBodyLog).not.toContain("\n");
  });

  it("handles unserializable response.data (e.g. circular object) without throwing", async () => {
    const circularData: Record<string, unknown> = {
      message: "Unserializable payload",
    };
    circularData.self = circularData;

    const circularError = {
      message: "Circular Error",
      response: {
        status: 500,
        data: circularData,
      },
    };

    const octokit = createMockOctokit(async () => {
      throw circularError;
    });

    // postComment returns false rather than throwing
    const success = await postComment(
      octokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      commentA,
    );

    expect(success).toBe(false);

    // a useful core.error annotation is emitted
    const errorCalls = (coreErrorSpy.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toContain("src/index.ts:10");
    expect(errorCalls[0]).toContain("Circular Error");
    expect(errorCalls[0]).toContain("500");

    // the failure remains recoverable by the normal batch logic (postComments continues to next comment)
    const attempted: unknown[] = [];
    const batchOctokit = createMockOctokit(async (params) => {
      attempted.push(params);
      const p = params as { path: string };
      if (p.path === "src/index.ts") {
        throw circularError;
      }
      return { data: { id: 200 } };
    });

    const result = await postComments(
      batchOctokit,
      "test-owner",
      "test-repo",
      42,
      "head-sha-123",
      [commentA, commentB],
    );

    expect(result).toEqual({ posted: 1, failed: 1, total: 2 });
    expect(attempted).toHaveLength(2);
  });
});
