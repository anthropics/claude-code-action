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

  // Use string operations instead of regex for better performance and security
  // (avoids potential ReDoS with large comment bodies)
  const triggerIndex = commentBody
    .toLowerCase()
    .indexOf(triggerPhrase.toLowerCase());
  if (triggerIndex === -1) {
    return null;
  }

  const afterTrigger = commentBody
    .substring(triggerIndex + triggerPhrase.length)
    .trim();
  return afterTrigger || null;
}
