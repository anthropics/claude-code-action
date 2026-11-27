/**
 * Extracts the user's request from a trigger comment.
 *
 * Given a comment like "@claude /review-pr please check the auth module",
 * this extracts "/review-pr please check the auth module".
 *
 * An occurrence of the trigger phrase only counts when it sits at a word
 * boundary — preceded by whitespace (or the start of the comment) and
 * followed by whitespace, punctuation, or the end of the comment — matching
 * the boundary semantics of the trigger matcher in
 * src/github/validation/trigger.ts. Without this, an earlier mid-token
 * appearance of the phrase (e.g. "support@claude.dev" before the real
 * "@claude fix this") wins the substring search and the wrong text becomes
 * the user's request.
 *
 * Uses string operations instead of building a RegExp from the trigger
 * phrase to avoid potential ReDoS with large comment bodies.
 *
 * @param commentBody - The full comment body containing the trigger phrase
 * @param triggerPhrase - The trigger phrase (e.g., "@claude")
 * @returns The user's request (text after the trigger phrase), or null if not found
 */
export function extractUserRequest(
  commentBody: string | undefined,
  triggerPhrase: string,
): string | null {
  if (!commentBody) {
    return null;
  }

  const lowerBody = commentBody.toLowerCase();
  const lowerPhrase = triggerPhrase.toLowerCase();

  let idx = lowerBody.indexOf(lowerPhrase);
  while (idx !== -1) {
    const prev = idx > 0 ? lowerBody[idx - 1] : undefined;
    const precededByBoundary = prev === undefined || /\s/.test(prev);
    const end = idx + lowerPhrase.length;
    const next = end < lowerBody.length ? lowerBody[end] : undefined;
    const followedByBoundary = next === undefined || /[\s.,!?;:]/.test(next);
    if (precededByBoundary && followedByBoundary) {
      const afterTrigger = commentBody.substring(end).trim();
      return afterTrigger || null;
    }
    idx = lowerBody.indexOf(lowerPhrase, idx + 1);
  }

  return null;
}
