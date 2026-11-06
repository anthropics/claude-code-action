import { describe, expect, test } from "bun:test";
import { createInlineCommentPayloadSchema } from "../src/mcp/github-inline-comment-schemas";

const validComment = {
  path: "src/index.ts",
  body: "Please rename this variable.",
};

describe("create_inline_comment input schema (#1767)", () => {
  test("rejects line zero", () => {
    const result = createInlineCommentPayloadSchema.safeParse({
      ...validComment,
      line: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        "line",
      ]);
    }
  });

  test("rejects startLine zero", () => {
    const result = createInlineCommentPayloadSchema.safeParse({
      ...validComment,
      line: 12,
      startLine: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        "startLine",
      ]);
    }
  });

  test("accepts positive single-line and multi-line comment positions", () => {
    expect(
      createInlineCommentPayloadSchema.safeParse({
        ...validComment,
        line: 1,
      }).success,
    ).toBe(true);
    expect(
      createInlineCommentPayloadSchema.safeParse({
        ...validComment,
        line: 12,
        startLine: 4,
      }).success,
    ).toBe(true);
  });
});
