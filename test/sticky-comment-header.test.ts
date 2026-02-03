import { describe, expect, test } from "bun:test";
import {
  createCommentBody,
  extractBotHeader,
} from "../src/github/operations/comments/common";

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

describe("extractBotHeader", () => {
  test("extracts header from comment body", () => {
    const body = "<!-- bot: claude-review -->\nSome content here";
    expect(extractBotHeader(body)).toBe("<!-- bot: claude-review -->\n");
  });

  test("returns empty string when no header present", () => {
    const body = "Some content without header";
    expect(extractBotHeader(body)).toBe("");
  });

  test("only extracts header at the beginning of the body", () => {
    const body = "Some text\n<!-- bot: claude-review -->\nMore content";
    expect(extractBotHeader(body)).toBe("");
  });

  test("handles header without trailing newline", () => {
    const body = "<!-- bot: test-bot -->Content starts here";
    expect(extractBotHeader(body)).toBe("<!-- bot: test-bot -->");
  });

  test("handles extra whitespace in header", () => {
    const body = "<!--  bot:  my-bot  -->\nContent";
    expect(extractBotHeader(body)).toBe("<!--  bot:  my-bot  -->\n");
  });

  test("handles complex bot names", () => {
    const body = "<!-- bot: claude-code-action-v2_test123 -->\nWorking...";
    expect(extractBotHeader(body)).toBe(
      "<!-- bot: claude-code-action-v2_test123 -->\n",
    );
  });

  test("handles bot names with dots and plus signs", () => {
    const body = "<!-- bot: claude.bot+test -->\nContent";
    expect(extractBotHeader(body)).toBe("<!-- bot: claude.bot+test -->\n");
  });

  test("returns empty string for empty body", () => {
    expect(extractBotHeader("")).toBe("");
  });

  test("roundtrip: createCommentBody header can be extracted", () => {
    const body = createCommentBody("http://example.com", "", "my-bot");
    const extracted = extractBotHeader(body);
    expect(extracted).toBe("<!-- bot: my-bot -->\n");
  });

  test("preserves header during MCP update simulation", () => {
    // Simulate the MCP server update flow:
    // 1. Initial comment has header
    const initialBody =
      "<!-- bot: claude-review -->\nClaude Code is working...";

    // 2. Claude provides new content (without header)
    const claudeContent = "### Review Complete\n- All looks good!";

    // 3. MCP server extracts header and prepends it
    const header = extractBotHeader(initialBody);
    const updatedBody = header + claudeContent;

    // 4. Verify header is preserved
    expect(updatedBody.startsWith("<!-- bot: claude-review -->")).toBe(true);
    expect(updatedBody).toContain("### Review Complete");
  });
});
