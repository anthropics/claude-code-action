import { describe, it, expect } from "bun:test";
import {
  buildReviewComments,
  isDeterministicRejection,
  REVIEW_BODY,
} from "../src/entrypoints/post-buffered-inline-comments";

/**
 * Buffered inline comments are posted as one review rather than one
 * createReviewComment call each, so the PR shows a single "reviewed" entry
 * containing every comment instead of N standalone reviews. See issue #433.
 *
 * These cover the payload mapping, which differs from the single-comment API:
 * no per-entry commit_id / pull_number, and multi-line hunks carry start_line
 * plus start_side.
 */
describe("buildReviewComments", () => {
  const base = { ts: "2026-09-04T00:00:00.000Z", body: "looks wrong" };

  it("maps every buffered comment into one batch", () => {
    const out = buildReviewComments([
      { ...base, path: "a.ts", line: 10 },
      { ...base, path: "b.ts", line: 20 },
      { ...base, path: "c.ts", line: 30 },
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(out.map((c) => c.line)).toEqual([10, 20, 30]);
  });

  it("defaults side to RIGHT and preserves an explicit side", () => {
    const [right, left] = buildReviewComments([
      { ...base, path: "a.ts", line: 5 },
      { ...base, path: "b.ts", line: 6, side: "LEFT" },
    ]);
    expect(right!.side).toBe("RIGHT");
    expect(left!.side).toBe("LEFT");
  });

  it("emits start_line and a matching start_side for multi-line comments", () => {
    const [entry] = buildReviewComments([
      { ...base, path: "a.ts", startLine: 4, line: 9, side: "LEFT" },
    ]);
    expect(entry!.start_line).toBe(4);
    expect(entry!.start_side).toBe("LEFT");
    expect(entry!.line).toBe(9);
  });

  it("omits start_line for single-line comments", () => {
    const [entry] = buildReviewComments([{ ...base, path: "a.ts", line: 9 }]);
    expect(entry).not.toHaveProperty("start_line");
    expect(entry).not.toHaveProperty("start_side");
    expect(entry!.line).toBe(9);
  });

  it("does not carry per-comment commit_id or pull_number", () => {
    // The batched review sets commit_id once at the review level; repeating it
    // per entry is rejected by the API.
    const [entry] = buildReviewComments([
      { ...base, path: "a.ts", line: 9, commit_id: "deadbeef" },
    ]);
    expect(entry).not.toHaveProperty("commit_id");
    expect(entry).not.toHaveProperty("pull_number");
  });

  it("redacts secrets in the comment body", () => {
    const [entry] = buildReviewComments([
      {
        ...base,
        path: "a.ts",
        line: 1,
        body: "token ghp_1234567890abcdefghijklmnopqrstuvwxyz here",
      },
    ]);
    expect(entry!.body).not.toContain(
      "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
    );
  });

  it("returns an empty batch for no comments", () => {
    expect(buildReviewComments([])).toEqual([]);
  });
});

describe("REVIEW_BODY", () => {
  it("is non-empty, because event=COMMENT rejects an empty body with 422", () => {
    // The Octokit typings mark `body` optional, so an empty value would only
    // surface as a runtime 422 against the real API.
    expect(REVIEW_BODY.trim().length).toBeGreaterThan(0);
  });
});

describe("isDeterministicRejection", () => {
  // Only a definitive rejection proves nothing was created. Anything else may
  // have succeeded server-side with the response lost, and replaying the
  // comments individually would post them all a second time.
  it("treats request-validation failures as deterministic", () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(isDeterministicRejection({ status })).toBe(true);
    }
  });

  it("treats server errors as ambiguous", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isDeterministicRejection({ status })).toBe(false);
    }
  });

  it("treats timeout and rate-limit as ambiguous", () => {
    // 408/429 are 4xx but retryable, and GitHub may have applied the write.
    expect(isDeterministicRejection({ status: 408 })).toBe(false);
    expect(isDeterministicRejection({ status: 429 })).toBe(false);
  });

  it("treats transport errors with no status as ambiguous", () => {
    expect(isDeterministicRejection(new Error("socket hang up"))).toBe(false);
    expect(isDeterministicRejection({ code: "ECONNRESET" })).toBe(false);
    expect(isDeterministicRejection(undefined)).toBe(false);
    expect(isDeterministicRejection(null)).toBe(false);
  });
});
