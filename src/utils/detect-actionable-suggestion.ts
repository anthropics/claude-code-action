#!/usr/bin/env bun

/**
 * Detects if a PR comment contains actionable suggestions that can be automatically fixed.
 *
 * This module identifies:
 * 1. GitHub inline committable suggestions (```suggestion blocks)
 * 2. Clear bug fix suggestions with specific patterns
 * 3. Code fix recommendations with explicit changes
 */

/**
 * Patterns that indicate a comment contains a GitHub inline committable suggestion.
 * These are code blocks that GitHub renders with a "Commit suggestion" button.
 */
const COMMITTABLE_SUGGESTION_PATTERN = /```suggestion\b[\s\S]*?```/i;

/**
 * Patterns that indicate a clear, actionable bug fix suggestion.
 * These phrases typically precede concrete fix recommendations.
 */
const BUG_FIX_PATTERNS = [
  // Direct fix suggestions
  /\bshould\s+(?:be|use|return|change\s+to)\b/i,
  /\bchange\s+(?:this\s+)?to\b/i,
  /\breplace\s+(?:this\s+)?with\b/i,
  /\buse\s+(?:this\s+)?instead\b/i,
  /\binstead\s+of\s+.*?,?\s*use\b/i,

  // Bug identification with fix
  /\b(?:bug|issue|error|problem):\s*.*(?:fix|change|update|replace)/i,
  /\bfix(?:ed)?\s+by\s+(?:chang|replac|updat)/i,
  /\bto\s+fix\s+(?:this|the)\b/i,

  // Explicit code changes
  /\bthe\s+(?:correct|proper|right)\s+(?:code|syntax|value|approach)\s+(?:is|would\s+be)\b/i,
  /\bshould\s+(?:read|look\s+like)\b/i,

  // Missing/wrong patterns
  /\bmissing\s+(?:a\s+)?(?:semicolon|bracket|parenthesis|quote|import|return|await)\b/i,
  /\bextra\s+(?:semicolon|bracket|parenthesis|quote)\b/i,
  /\bwrong\s+(?:type|value|variable|import|parameter)\b/i,
  /\btypo\s+(?:in|here)\b/i,
];

/**
 * Patterns that suggest code alternatives (less strong than direct fixes but still actionable).
 */
const CODE_ALTERNATIVE_PATTERNS = [
  /```[\w]*\n[\s\S]+?\n```/, // Any code block (might contain the fix)
  /\b(?:try|consider)\s+(?:using|changing|replacing)\b/i,
  /\bhere'?s?\s+(?:the|a)\s+(?:fix|solution|correction)\b/i,
  /\b(?:correct|fixed|updated)\s+(?:version|code|implementation)\b/i,
];

export interface ActionableSuggestionResult {
  /** Whether the comment contains an actionable suggestion */
  isActionable: boolean;
  /** Whether the comment contains a GitHub inline committable suggestion */
  hasCommittableSuggestion: boolean;
  /** Whether the comment contains clear bug fix language */
  hasBugFixSuggestion: boolean;
  /** Whether the comment contains code alternatives */
  hasCodeAlternative: boolean;
  /** Confidence level: 'high', 'medium', or 'low' */
  confidence: "high" | "medium" | "low";
  /** Reason for the determination */
  reason: string;
}

/**
 * Detects if a comment contains actionable suggestions that can be automatically fixed.
 *
 * @param commentBody - The body of the PR comment to analyze
 * @returns Object with detection results and confidence level
 *
 * @example
 * ```ts
 * const result = detectActionableSuggestion("```suggestion\nfixed code\n```");
 * // { isActionable: true, hasCommittableSuggestion: true, confidence: 'high', ... }
 *
 * const result2 = detectActionableSuggestion("You should use `const` instead of `let` here");
 * // { isActionable: true, hasBugFixSuggestion: true, confidence: 'medium', ... }
 * ```
 */
export function detectActionableSuggestion(
  commentBody: string | undefined | null,
): ActionableSuggestionResult {
  if (!commentBody) {
    return {
      isActionable: false,
      hasCommittableSuggestion: false,
      hasBugFixSuggestion: false,
      hasCodeAlternative: false,
      confidence: "low",
      reason: "Empty or missing comment body",
    };
  }

  // Check for GitHub inline committable suggestion (highest confidence)
  const hasCommittableSuggestion =
    COMMITTABLE_SUGGESTION_PATTERN.test(commentBody);
  if (hasCommittableSuggestion) {
    return {
      isActionable: true,
      hasCommittableSuggestion: true,
      hasBugFixSuggestion: false,
      hasCodeAlternative: false,
      confidence: "high",
      reason: "Contains GitHub inline committable suggestion (```suggestion)",
    };
  }

  // Check for clear bug fix patterns (medium-high confidence)
  const matchedBugFixPattern = BUG_FIX_PATTERNS.find((pattern) =>
    pattern.test(commentBody),
  );
  if (matchedBugFixPattern) {
    // Higher confidence if also contains a code block
    const hasCodeBlock = CODE_ALTERNATIVE_PATTERNS[0].test(commentBody);
    return {
      isActionable: true,
      hasCommittableSuggestion: false,
      hasBugFixSuggestion: true,
      hasCodeAlternative: hasCodeBlock,
      confidence: hasCodeBlock ? "high" : "medium",
      reason: hasCodeBlock
        ? "Contains clear bug fix suggestion with code example"
        : "Contains clear bug fix suggestion",
    };
  }

  // Check for code alternatives (medium confidence)
  const matchedAlternativePattern = CODE_ALTERNATIVE_PATTERNS.find((pattern) =>
    pattern.test(commentBody),
  );
  if (matchedAlternativePattern) {
    return {
      isActionable: true,
      hasCommittableSuggestion: false,
      hasBugFixSuggestion: false,
      hasCodeAlternative: true,
      confidence: "medium",
      reason: "Contains code alternative or fix suggestion",
    };
  }

  return {
    isActionable: false,
    hasCommittableSuggestion: false,
    hasBugFixSuggestion: false,
    hasCodeAlternative: false,
    confidence: "low",
    reason: "No actionable suggestion patterns detected",
  };
}

/**
 * Checks if a comment should be treated as actionable for autofix purposes,
 * even if it comes from a bot account like claude[bot].
 *
 * This is particularly useful for workflows that want to automatically apply
 * suggestions from code review comments.
 *
 * @param commentBody - The body of the PR comment
 * @param authorUsername - The username of the comment author
 * @returns Whether the comment should be treated as actionable
 */
export function isCommentActionableForAutofix(
  commentBody: string | undefined | null,
  authorUsername?: string,
): boolean {
  const result = detectActionableSuggestion(commentBody);

  // If it's already clearly actionable (high confidence), return true
  if (result.confidence === "high") {
    return true;
  }

  // For medium confidence, be more lenient
  if (result.confidence === "medium" && result.isActionable) {
    return true;
  }

  return false;
}

/**
 * Extracts the suggested code from a GitHub inline committable suggestion block.
 *
 * @param commentBody - The body of the PR comment
 * @returns The suggested code content, or null if no suggestion block found
 *
 * @example
 * ```ts
 * const code = extractSuggestionCode("```suggestion\nconst x = 1;\n```");
 * // "const x = 1;"
 * ```
 */
export function extractSuggestionCode(
  commentBody: string | undefined | null,
): string | null {
  if (!commentBody) {
    return null;
  }

  const match = commentBody.match(/```suggestion\b\n?([\s\S]*?)```/i);
  if (match && match[1] !== undefined) {
    return match[1].trim();
  }

  return null;
}
