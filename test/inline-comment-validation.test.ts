import { expect, test, describe } from "bun:test";
import { validateCommentLines } from "../src/mcp/inline-comment-validation";

describe("github-inline-comment-server parameter validation", () => {
  test("validates single-line comment (only line provided)", () => {
    const result = validateCommentLines(10, undefined);
    expect(result.isSingleLine).toBe(true);
  });

  test("validates single-line comment (line is 0)", () => {
    const result = validateCommentLines(0, undefined);
    expect(result.isSingleLine).toBe(true);
  });

  test("validates multi-line comment (both startLine and line provided)", () => {
    const result = validateCommentLines(20, 10);
    expect(result.isSingleLine).toBe(false);
  });

  test("validates multi-line comment when startLine is 0", () => {
    const result = validateCommentLines(10, 0);
    expect(result.isSingleLine).toBe(false);
  });

  test("throws when both line and startLine are omitted", () => {
    expect(() => validateCommentLines(undefined, undefined)).toThrow(
      "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided",
    );
  });

  test("throws when startLine is provided but line is omitted", () => {
    expect(() => validateCommentLines(undefined, 10)).toThrow(
      "When 'startLine' is provided, 'line' must also be provided to specify the end of the range",
    );
  });

  test("throws when startLine is 0 and line is omitted", () => {
    expect(() => validateCommentLines(undefined, 0)).toThrow(
      "When 'startLine' is provided, 'line' must also be provided to specify the end of the range",
    );
  });
});
