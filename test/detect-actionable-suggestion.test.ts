import { describe, expect, it } from "bun:test";
import {
  detectActionableSuggestion,
  isCommentActionableForAutofix,
  extractSuggestionCode,
} from "../src/utils/detect-actionable-suggestion";

describe("detectActionableSuggestion", () => {
  describe("GitHub inline committable suggestions", () => {
    it("should detect suggestion blocks with high confidence", () => {
      const comment = `Here's a fix:
\`\`\`suggestion
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasCommittableSuggestion).toBe(true);
      expect(result.confidence).toBe("high");
      expect(result.reason).toContain("committable suggestion");
    });

    it("should detect suggestion blocks with multiple lines", () => {
      const comment = `\`\`\`suggestion
function foo() {
  return bar();
}
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasCommittableSuggestion).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("should detect suggestion blocks case-insensitively", () => {
      const comment = `\`\`\`SUGGESTION
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasCommittableSuggestion).toBe(true);
    });

    it("should not confuse regular code blocks with suggestion blocks", () => {
      const comment = `\`\`\`javascript
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.hasCommittableSuggestion).toBe(false);
      // But it should still detect the code alternative
      expect(result.hasCodeAlternative).toBe(true);
    });
  });

  describe("bug fix suggestions", () => {
    it('should detect "should be" patterns', () => {
      const comment = "This should be `const` instead of `let`";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
      expect(result.confidence).toBe("medium");
    });

    it('should detect "change to" patterns', () => {
      const comment = "Change this to use async/await";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "replace with" patterns', () => {
      const comment = "Replace this with Array.from()";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "use instead" patterns', () => {
      const comment = "Use this instead of the deprecated method";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "instead of X, use Y" patterns', () => {
      const comment = "Instead of forEach, use map";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "to fix this" patterns', () => {
      const comment = "To fix this, you need to add the await keyword";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "the correct code is" patterns', () => {
      const comment = "The correct code would be: return null;";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "missing semicolon" patterns', () => {
      const comment = "Missing a semicolon at the end";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "typo" patterns', () => {
      const comment = "Typo here: teh should be the";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it('should detect "wrong type" patterns', () => {
      const comment = "Wrong type here, should be string not number";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
    });

    it("should have high confidence when bug fix suggestion includes code block", () => {
      const comment = `You should use const here:
\`\`\`javascript
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasBugFixSuggestion).toBe(true);
      expect(result.hasCodeAlternative).toBe(true);
      expect(result.confidence).toBe("high");
    });
  });

  describe("code alternatives", () => {
    it('should detect "try using" patterns', () => {
      const comment = "Try using Array.map() instead";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
    });

    it('should detect "here\'s the fix" patterns', () => {
      const comment = "Here's the fix for this issue";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
    });

    it("should detect code blocks as potential alternatives", () => {
      const comment = `Try this approach:
\`\`\`
const result = [];
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasCodeAlternative).toBe(true);
    });
  });

  describe("non-actionable comments", () => {
    it("should not flag general questions", () => {
      const comment = "Why is this returning undefined?";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(false);
      expect(result.confidence).toBe("low");
    });

    it("should not flag simple observations", () => {
      const comment = "This looks interesting";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(false);
    });

    it("should not flag approval comments", () => {
      const comment = "LGTM! :+1:";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(false);
    });

    it("should handle empty comments", () => {
      const result = detectActionableSuggestion("");
      expect(result.isActionable).toBe(false);
      expect(result.reason).toContain("Empty");
    });

    it("should handle null comments", () => {
      const result = detectActionableSuggestion(null);
      expect(result.isActionable).toBe(false);
    });

    it("should handle undefined comments", () => {
      const result = detectActionableSuggestion(undefined);
      expect(result.isActionable).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle comments with both suggestion block and bug fix language", () => {
      const comment = `This should be fixed. Here's the suggestion:
\`\`\`suggestion
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      // Suggestion block takes precedence (high confidence)
      expect(result.isActionable).toBe(true);
      expect(result.hasCommittableSuggestion).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("should handle very long comments", () => {
      const longContent = "a".repeat(10000);
      const comment = `${longContent}
\`\`\`suggestion
const x = 1;
\`\`\``;
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
      expect(result.hasCommittableSuggestion).toBe(true);
    });

    it("should handle comments with special characters", () => {
      const comment =
        "You should be using `const` here! @#$%^&* Change this to `let`";
      const result = detectActionableSuggestion(comment);
      expect(result.isActionable).toBe(true);
    });
  });
});

describe("isCommentActionableForAutofix", () => {
  it("should return true for high confidence suggestions", () => {
    const comment = `\`\`\`suggestion
const x = 1;
\`\`\``;
    expect(isCommentActionableForAutofix(comment)).toBe(true);
  });

  it("should return true for medium confidence suggestions", () => {
    const comment = "You should use const here instead of let";
    expect(isCommentActionableForAutofix(comment)).toBe(true);
  });

  it("should return false for non-actionable comments", () => {
    const comment = "This looks fine to me";
    expect(isCommentActionableForAutofix(comment)).toBe(false);
  });

  it("should handle bot authors correctly", () => {
    const comment = `\`\`\`suggestion
const x = 1;
\`\`\``;
    // Should still return true even for bot authors
    expect(isCommentActionableForAutofix(comment, "claude[bot]")).toBe(true);
  });

  it("should handle empty comments", () => {
    expect(isCommentActionableForAutofix("")).toBe(false);
    expect(isCommentActionableForAutofix(null)).toBe(false);
    expect(isCommentActionableForAutofix(undefined)).toBe(false);
  });
});

describe("extractSuggestionCode", () => {
  it("should extract code from suggestion block", () => {
    const comment = `Here's a fix:
\`\`\`suggestion
const x = 1;
\`\`\``;
    expect(extractSuggestionCode(comment)).toBe("const x = 1;");
  });

  it("should extract multi-line code from suggestion block", () => {
    const comment = `\`\`\`suggestion
function foo() {
  return bar();
}
\`\`\``;
    expect(extractSuggestionCode(comment)).toBe(
      "function foo() {\n  return bar();\n}",
    );
  });

  it("should handle empty suggestion blocks", () => {
    const comment = `\`\`\`suggestion
\`\`\``;
    expect(extractSuggestionCode(comment)).toBe("");
  });

  it("should return null for comments without suggestion blocks", () => {
    const comment = "Just a regular comment";
    expect(extractSuggestionCode(comment)).toBe(null);
  });

  it("should return null for empty comments", () => {
    expect(extractSuggestionCode("")).toBe(null);
    expect(extractSuggestionCode(null)).toBe(null);
    expect(extractSuggestionCode(undefined)).toBe(null);
  });

  it("should not extract from regular code blocks", () => {
    const comment = `\`\`\`javascript
const x = 1;
\`\`\``;
    expect(extractSuggestionCode(comment)).toBe(null);
  });
});
