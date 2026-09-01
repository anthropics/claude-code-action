#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { createInlineCommentPayloadSchema } from "../src/mcp/github-inline-comment-schemas";

const base = { path: "src/index.ts", body: "Looks good" };

describe("createInlineCommentPayloadSchema", () => {
  test("accepts positive integer line numbers", () => {
    const parsed = createInlineCommentPayloadSchema.parse({
      ...base,
      line: 12,
    });
    expect(parsed.line).toBe(12);
    expect(parsed.side).toBe("RIGHT");
  });

  test("accepts a multi-line range", () => {
    const parsed = createInlineCommentPayloadSchema.parse({
      ...base,
      startLine: 8,
      line: 12,
    });
    expect(parsed.startLine).toBe(8);
    expect(parsed.line).toBe(12);
  });

  test("allows both line fields to be omitted", () => {
    // The handler, not the schema, enforces that at least one is present, so
    // that it can return its own explanatory message.
    const parsed = createInlineCommentPayloadSchema.parse(base);
    expect(parsed.line).toBeUndefined();
    expect(parsed.startLine).toBeUndefined();
  });

  test("rejects line 0", () => {
    // Diff line numbers are 1-based. The handler checks `!line`, so a 0 that
    // reached it would be read as "line not provided" and rejected with a
    // message about a missing argument instead of an out-of-range one.
    expect(() =>
      createInlineCommentPayloadSchema.parse({ ...base, line: 0 }),
    ).toThrow();
  });

  test("rejects startLine 0", () => {
    // The handler derives `isSingleLine = !startLine`, so a startLine of 0
    // would silently collapse a multi-line comment into a single-line one on
    // the end line, reporting success for a request it did not carry out.
    expect(() =>
      createInlineCommentPayloadSchema.parse({
        ...base,
        startLine: 0,
        line: 12,
      }),
    ).toThrow();
  });

  test("rejects negative line numbers", () => {
    expect(() =>
      createInlineCommentPayloadSchema.parse({ ...base, line: -1 }),
    ).toThrow();
    expect(() =>
      createInlineCommentPayloadSchema.parse({
        ...base,
        startLine: -3,
        line: 12,
      }),
    ).toThrow();
  });

  test("rejects non-integer line numbers", () => {
    // A fractional line was previously accepted here and rejected by the
    // GitHub API as a 422, well after the model had been told nothing was wrong.
    expect(() =>
      createInlineCommentPayloadSchema.parse({ ...base, line: 3.5 }),
    ).toThrow();
    expect(() =>
      createInlineCommentPayloadSchema.parse({
        ...base,
        startLine: 1.5,
        line: 12,
      }),
    ).toThrow();
  });
});
