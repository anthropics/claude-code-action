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

  test("header is placed at the beginning of the comment", () => {
    const body = createCommentBody("http://example.com", "", "claude-bot");
    expect(body.startsWith("<!-- bot: claude-bot -->")).toBe(true);
  });

  test("header format is consistent for matching", () => {
    const body = createCommentBody("http://example.com", "", "test-bot");
    // The header pattern used for matching in create-initial.ts
    const headerPattern = /<!--\s*bot:\s*test-bot\s*-->/i;
    expect(headerPattern.test(body)).toBe(true);
  });

  test("handles bot names with special characters", () => {
    const body = createCommentBody("http://example.com", "", "claude.bot+test");
    expect(body).toContain("<!-- bot: claude.bot+test -->");
  });
});
