import { describe, it, expect } from "bun:test";
import { validateCommentLines } from "../src/mcp/inline-comment-lines";

describe("validateCommentLines", () => {
  it("accepts a single line", () => {
    expect(validateCommentLines(10, undefined)).toBeUndefined();
  });

  it("accepts a multi-line range, including a one-line range", () => {
    expect(validateCommentLines(12, 10)).toBeUndefined();
    expect(validateCommentLines(10, 10)).toBeUndefined();
  });

  it("rejects line 0 instead of passing it to the API", () => {
    expect(validateCommentLines(0, undefined)).toContain("'line'");
  });

  it("rejects startLine 0 instead of collapsing to a single-line comment", () => {
    expect(validateCommentLines(12, 0)).toContain("'startLine'");
  });

  it("rejects negative and fractional lines", () => {
    expect(validateCommentLines(-1, undefined)).toBeDefined();
    expect(validateCommentLines(1.5, undefined)).toBeDefined();
    expect(validateCommentLines(12, 2.5)).toBeDefined();
  });

  it("requires line, even when startLine is given", () => {
    expect(validateCommentLines(undefined, undefined)).toBeDefined();
    expect(validateCommentLines(undefined, 10)).toBeDefined();
  });

  it("rejects a startLine after line", () => {
    expect(validateCommentLines(10, 12)).toContain("must not be after");
  });
});
