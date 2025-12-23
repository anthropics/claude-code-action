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

  // Escape special regex characters in the trigger phrase
  const escapedTrigger = triggerPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Match the trigger phrase followed by optional whitespace and capture the rest
  // The trigger phrase can appear anywhere in the comment
  const regex = new RegExp(`${escapedTrigger}\\s*(.*)`, "is");
  const match = commentBody.match(regex);

  if (match && match[1]) {
    // Trim and return the captured text after the trigger phrase
    const request = match[1].trim();
    return request || null;
  }

  return null;
}

/**
 * Extracts the user's request from various GitHub event types.
 *
 * For comment events: extracts from the comment body
 * For issue/PR events: extracts from the body or title
 *
 * @param eventData - The parsed event data containing comment/body info
 * @param triggerPhrase - The trigger phrase (e.g., "@claude")
 * @returns The user's request, or a default message if not found
 */
export function extractUserRequestFromEvent(
  eventData: {
    eventName: string;
    commentBody?: string;
    issueBody?: string;
    prBody?: string;
  },
  triggerPhrase: string,
): string {
  // For comment events, extract from comment body
  if (
    eventData.eventName === "issue_comment" ||
    eventData.eventName === "pull_request_review_comment" ||
    eventData.eventName === "pull_request_review"
  ) {
    const request = extractUserRequest(eventData.commentBody, triggerPhrase);
    if (request) {
      return request;
    }
  }

  // For issue events, try extracting from issue body
  if (eventData.eventName === "issues" && eventData.issueBody) {
    const request = extractUserRequest(eventData.issueBody, triggerPhrase);
    if (request) {
      return request;
    }
  }

  // For PR events, try extracting from PR body
  if (
    (eventData.eventName === "pull_request" ||
      eventData.eventName === "pull_request_target") &&
    eventData.prBody
  ) {
    const request = extractUserRequest(eventData.prBody, triggerPhrase);
    if (request) {
      return request;
    }
  }

  // Default: return a generic request to analyze the context
  return "Please analyze the context and help with this request.";
}
