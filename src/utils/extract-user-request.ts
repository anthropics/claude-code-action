/**
 * Extracts the user's request from a trigger comment.
 *
 * Given a comment like "@claude /review-pr please check the auth module",
 * this extracts "/review-pr please check the auth module".
 *
 * @param commentBody - The full comment body containing the trigger phrase
 * @param triggerPhrase - The trigger phrase (e.g., "@claude")
 * @returns The user's request (text after the trigger phrase), or null if not found
 */
// Boundaries matching checkContainsTrigger in src/github/validation/trigger.ts:
// (^|\\s)triggerPhrase([\\s.,!?;:]|$)
const TRAILING_DELIMITERS = new Set([
  " ",
  "\t",
  "\n",
  "\r",
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
]);

function isLeadingBoundary(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function isTrailingBoundary(char: string | undefined): boolean {
  return char === undefined || TRAILING_DELIMITERS.has(char) || /\s/.test(char);
}

export function extractUserRequest(
  commentBody: string | undefined,
  triggerPhrase: string,
): string | null {
  if (!commentBody) {
    return null;
  }

  // Use string operations with boundary validation for security and performance
  // (avoids ReDoS and prevents matching trigger phrase embedded inside other tokens)
  const lowerBody = commentBody.toLowerCase();
  const lowerTrigger = triggerPhrase.toLowerCase();
  const triggerLen = lowerTrigger.length;

  let searchIndex = 0;
  while (searchIndex <= lowerBody.length - triggerLen) {
    const triggerIndex = lowerBody.indexOf(lowerTrigger, searchIndex);
    if (triggerIndex === -1) {
      return null;
    }

    const prevChar =
      triggerIndex > 0 ? commentBody[triggerIndex - 1] : undefined;
    const nextChar =
      triggerIndex + triggerLen < commentBody.length
        ? commentBody[triggerIndex + triggerLen]
        : undefined;

    if (isLeadingBoundary(prevChar) && isTrailingBoundary(nextChar)) {
      const afterTrigger = commentBody
        .substring(triggerIndex + triggerLen)
        .trim();
      return afterTrigger || null;
    }

    searchIndex = triggerIndex + 1;
  }

  return null;
}
