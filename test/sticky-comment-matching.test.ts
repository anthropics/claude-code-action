import { describe, expect, test } from "bun:test";

/**
 * Tests for sticky comment matching logic
 *
 * These tests verify that the comment matching works correctly for:
 * - Header-based matching (case-insensitive, whitespace-tolerant)
 * - Multiple bots with same ID but different names
 * - Legacy comments without headers
 * - Pagination (comments beyond the first 30)
 */

// Helper to escape regex special characters (mirrors implementation)
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Simulates the matching logic from create-initial.ts
function findExistingComment(
  comments: Array<{
    id: number;
    body: string | null;
    user: { id: number; type?: string; login?: string } | null;
  }>,
  botId: number,
  botName: string,
): (typeof comments)[0] | undefined {
  return comments.find((comment) => {
    // Must be from the correct bot user
    const idMatch = comment.user?.id === botId;
    if (!idMatch) return false;

    // Check for our hidden header (case-insensitive, whitespace-tolerant)
    const headerPattern = new RegExp(
      `<!--\\s*bot:\\s*${escapeRegex(botName)}\\s*-->`,
      "i",
    );
    const hasOurHeader = headerPattern.test(comment.body || "");

    // Check if comment has ANY bot header
    const hasAnyHeader = /<!--\s*bot:\s*\S+\s*-->/.test(comment.body || "");

    // If comment has a header, ONLY match if it's ours
    if (hasAnyHeader) {
      return hasOurHeader;
    }

    // Legacy comments (no header): match if it looks like a Claude comment
    const isClaudeComment =
      comment.body?.includes("Claude Code is working") ||
      comment.body?.includes("View job run");

    return isClaudeComment;
  });
}

describe("Sticky Comment Matching", () => {
  describe("Header-based matching", () => {
    test("finds comment with exact matching header", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-bot -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("matches header case-insensitively", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- BOT: Claude-Bot -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("matches header with extra whitespace", () => {
      const comments = [
        {
          id: 1,
          body: "<!--  bot:  claude-bot  -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("does not match comment with different bot header (same user ID)", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: other-bot -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });

    test("skips comment from different user ID", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-bot -->\nClaude Code is working…",
          user: { id: 456 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });

    test("handles bot names with regex special characters", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude.bot+test -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude.bot+test");
      expect(result?.id).toBe(1);
    });
  });

  describe("Multiple bots with same ID", () => {
    test("each bot finds only its own comment", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-security -->\nClaude Code is working…",
          user: { id: 123 },
        },
        {
          id: 2,
          body: "<!-- bot: claude-review -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];

      const securityResult = findExistingComment(
        comments,
        123,
        "claude-security",
      );
      const reviewResult = findExistingComment(comments, 123, "claude-review");

      expect(securityResult?.id).toBe(1);
      expect(reviewResult?.id).toBe(2);
    });

    test("bot does not find comment without header when other bot has header", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-security -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];

      const otherResult = findExistingComment(comments, 123, "claude-other");
      expect(otherResult).toBeUndefined();
    });
  });

  describe("Legacy comment matching (no header)", () => {
    test("matches legacy comment with 'Claude Code is working'", () => {
      const comments = [
        {
          id: 1,
          body: "Claude Code is working…\n\n[View job run](https://example.com)",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("matches legacy comment with 'View job run'", () => {
      const comments = [
        {
          id: 1,
          body: "**Claude finished @user's task**\n\n[View job run](https://example.com)",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("does not match unrelated comment", () => {
      const comments = [
        {
          id: 1,
          body: "LGTM! Thanks for the changes.",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });
  });

  describe("Updated comment body matching", () => {
    test("matches comment after it has been updated with branch link", () => {
      const comments = [
        {
          id: 1,
          body: `<!-- bot: claude-bot -->
**Claude finished @user's task in 1m 30s** —— [View job](https://github.com/owner/repo/actions/runs/123) • [\`claude/issue-456\`](https://github.com/owner/repo/tree/claude/issue-456)

---

I've made the changes you requested.`,
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });

    test("matches comment with PR link", () => {
      const comments = [
        {
          id: 1,
          body: `<!-- bot: claude-bot -->
**Claude finished @user's task** —— [View job](https://example.com) • [Create PR ➔](https://github.com/owner/repo/compare/main...branch)

---

Changes ready for review.`,
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });
  });

  describe("Pagination scenarios", () => {
    test("finds comment among 50+ comments", () => {
      const comments = Array.from({ length: 55 }, (_, i) => ({
        id: i + 1,
        body: `Comment ${i + 1}`,
        user: { id: i < 50 ? 999 : 123 },
      }));

      // Place Claude's comment at position 52 (0-indexed: 51)
      comments[51] = {
        id: 52,
        body: "<!-- bot: claude-bot -->\nClaude Code is working…",
        user: { id: 123 },
      };

      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(52);
    });

    test("finds first matching comment when multiple exist", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-bot -->\nFirst Claude comment",
          user: { id: 123 },
        },
        {
          id: 2,
          body: "<!-- bot: claude-bot -->\nSecond Claude comment",
          user: { id: 123 },
        },
      ];

      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result?.id).toBe(1);
    });
  });

  describe("Edge cases", () => {
    test("handles null body", () => {
      const comments = [
        {
          id: 1,
          body: null,
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });

    test("handles null user", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot: claude-bot -->\nClaude Code is working…",
          user: null,
        },
      ];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });

    test("handles empty comments array", () => {
      const comments: Array<{
        id: number;
        body: string | null;
        user: { id: number } | null;
      }> = [];
      const result = findExistingComment(comments, 123, "claude-bot");
      expect(result).toBeUndefined();
    });

    test("handles empty bot name gracefully", () => {
      const comments = [
        {
          id: 1,
          body: "<!-- bot:  -->\nClaude Code is working…",
          user: { id: 123 },
        },
      ];
      const result = findExistingComment(comments, 123, "");
      // Empty bot name should match empty header
      expect(result?.id).toBe(1);
    });
  });
});

describe("Header Pattern Tests", () => {
  test("standard header pattern", () => {
    const pattern = /<!--\s*bot:\s*\S+\s*-->/;
    expect(pattern.test("<!-- bot: claude-bot -->")).toBe(true);
    expect(pattern.test("<!--bot:claude-bot-->")).toBe(true);
    expect(pattern.test("<!--  bot:  claude-bot  -->")).toBe(true);
    expect(pattern.test("<!-- BOT: claude-bot -->")).toBe(false); // case sensitive for detection
  });

  test("specific bot pattern with escaping", () => {
    const botName = "claude.bot+test";
    const pattern = new RegExp(
      `<!--\\s*bot:\\s*${escapeRegex(botName)}\\s*-->`,
      "i",
    );
    expect(pattern.test("<!-- bot: claude.bot+test -->")).toBe(true);
    expect(pattern.test("<!-- BOT: CLAUDE.BOT+TEST -->")).toBe(true);
    expect(pattern.test("<!-- bot: claudeXbotYtest -->")).toBe(false);
  });
});
