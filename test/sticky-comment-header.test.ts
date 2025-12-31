import { describe, expect, test } from "bun:test";
import { createCommentBody } from "../src/github/operations/comments/common";

describe("Sticky Comment Header Logic", () => {
  test("generates hidden header when botName is provided", () => {
    const body = createCommentBody("http://example.com", "", "claude-security");
    expect(body).toContain("<!-- bot: claude-security -->");
    expect(body).toContain("Claude Code is working");
  });

  test("does not generate header when botName is missing", () => {
    const body = createCommentBody("http://example.com");
    expect(body).not.toContain("<!-- bot:");
    expect(body).toContain("Claude Code is working");
  });

  test("generates distinct bodies for different bot names", () => {
    const body1 = createCommentBody("link", "", "bot1");
    const body2 = createCommentBody("link", "", "bot2");
    expect(body1).not.toEqual(body2);
  });
});
