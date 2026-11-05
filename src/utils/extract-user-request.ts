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
export function extractUserRequest(
  commentBody: string | undefined,
  triggerPhrase: string,
): string | null {
  if (!commentBody) {
    return null;
  }

  const lowerBody = commentBody.toLowerCase();
  const lowerTrigger = triggerPhrase.toLowerCase();

  let searchStartIndex = 0;
  while (true) {
    const triggerIndex = lowerBody.indexOf(lowerTrigger, searchStartIndex);
    if (triggerIndex === -1) {
      return null;
    }

    // Check boundary semantics matching checkContainsTrigger:
    // (^|\s)triggerPhrase([\s.,!?;:]|$)
    const prevChar = triggerIndex > 0 ? lowerBody[triggerIndex - 1] : "";
    const nextChar =
      triggerIndex + lowerTrigger.length < lowerBody.length
        ? lowerBody[triggerIndex + lowerTrigger.length]
        : "";

    const isPrevValid = prevChar === "" || /^\s$/.test(prevChar);
    const isNextValid = nextChar === "" || /^[\s.,!?;:]$/.test(nextChar);

    if (isPrevValid && isNextValid) {
      const afterTrigger = commentBody
        .substring(triggerIndex + triggerPhrase.length)
        .trim();
      return afterTrigger || null;
    }

    // If not a valid match, advance search past the current match
    searchStartIndex = triggerIndex + 1;
  }
}
