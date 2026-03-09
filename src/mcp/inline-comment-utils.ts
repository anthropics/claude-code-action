/**
 * Utility functions for inline comment handling
 * Extracted for testability
 */

export interface ReviewComment {
  id: number;
  path: string;
  line?: number | null;
  original_line?: number | null;
  in_reply_to_id?: number | null;
}

/**
 * Find an existing root comment on the same line and path
 * Used for auto-deduplication to reply to existing threads instead of creating duplicates
 *
 * @param existingComments - List of existing review comments on the PR
 * @param targetPath - The file path to check
 * @param targetLine - The line number to check
 * @returns The existing root comment if found, otherwise undefined
 */
export function findExistingRootComment(
  existingComments: ReviewComment[],
  targetPath: string,
  targetLine: number | undefined,
): ReviewComment | undefined {
  if (targetLine === undefined) {
    return undefined;
  }

  return existingComments.find(
    (comment) =>
      comment.path === targetPath &&
      (comment.line === targetLine || comment.original_line === targetLine) &&
      !comment.in_reply_to_id,
  );
}

/**
 * Determine if we should reply to an existing comment
 * Returns the comment ID to reply to, or undefined to create a new thread
 *
 * @param explicitInReplyTo - Explicitly specified comment ID to reply to
 * @param existingComments - List of existing review comments on the PR
 * @param targetPath - The file path to check
 * @param targetLine - The line number to check
 * @returns Comment ID to reply to, or undefined
 */
export function resolveInReplyTo(
  explicitInReplyTo: number | undefined,
  existingComments: ReviewComment[],
  targetPath: string,
  targetLine: number | undefined,
): number | undefined {
  // If explicitly specified, use that
  if (explicitInReplyTo !== undefined) {
    return explicitInReplyTo;
  }

  // Otherwise, try to find an existing comment on the same line
  const existingComment = findExistingRootComment(
    existingComments,
    targetPath,
    targetLine,
  );

  return existingComment?.id;
}
