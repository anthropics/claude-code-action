import { Octokit } from "@octokit/rest";

export type DeleteClaudeCommentParams = {
  owner: string;
  repo: string;
  commentId: number;
  isPullRequestReviewComment: boolean;
};

/**
 * Delete a Claude comment on GitHub (either an issue/PR comment or a PR review comment)
 *
 * @param octokit - Authenticated Octokit instance
 * @param params - Parameters for deleting the comment
 * @returns void
 * @throws Error if the deletion fails
 */
export async function deleteClaudeComment(
  octokit: Octokit,
  params: DeleteClaudeCommentParams,
): Promise<void> {
  const { owner, repo, commentId, isPullRequestReviewComment } = params;

  try {
    if (isPullRequestReviewComment) {
      // Try PR review comment API first
      await octokit.rest.pulls.deleteReviewComment({
        owner,
        repo,
        comment_id: commentId,

      });
    } else {
      // Use issue comment API (works for both issues and PR general comments)
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: commentId,
      });
    }
  } catch (error: any) {
    // If PR review comment deletion fails with 404, fall back to issue comment API
    if (isPullRequestReviewComment && error.status === 404) {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: commentId,
      });
    } else {
      throw error;
    }
  }

  return;
}
