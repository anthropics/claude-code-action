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

  test("rejects a payload with neither line nor startLine", () => {
    expect(() => createInlineCommentPayloadSchema.parse(base)).toThrow(
      /Either 'line' for single-line comments/,
    );
  });

  test("rejects startLine without line", () => {
    // `line` is the end of the range, so a startLine on its own used to reach
    // the API as start_line with line: undefined.
    expect(() =>
      createInlineCommentPayloadSchema.parse({ ...base, startLine: 5 }),
    ).toThrow(/'line' is required when 'startLine' is provided/);
  });

  test("rejects a range that ends before it starts", () => {
    expect(() =>
      createInlineCommentPayloadSchema.parse({
        ...base,
        startLine: 12,
        line: 8,
      }),
    ).toThrow(/must not be greater than/);
  });

  test("accepts a range whose start and end are the same line", () => {
    const parsed = createInlineCommentPayloadSchema.parse({
      ...base,
      startLine: 8,
      line: 8,
    });
    expect(parsed.startLine).toBe(8);
    expect(parsed.line).toBe(8);
  });

  test("rejects line 0", () => {
    // Diff line numbers are 1-based, so 0 is never a line anyone can comment
    // on - GitHub rejects it with a 422 long after the model has moved on.
    expect(() =>
      createInlineCommentPayloadSchema.parse({ ...base, line: 0 }),
    ).toThrow();
  });

  test("rejects startLine 0", () => {
    // A 0 here is treated as a real start of a range rather than as an absent
    // argument, so it would be sent on as start_line: 0 and rejected there.
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
