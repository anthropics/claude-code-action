#!/usr/bin/env bun

/**
 * Update the initial tracking comment with branch link
 * This happens after the branch is created for issues
 */

import {
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "./common";
import { type Octokits } from "../../api/client";
import {
  isPullRequestReviewCommentEvent,
  type ParsedGitHubContext,
} from "../../context";
import { updateClaudeComment } from "./update-claude-comment";

export async function updateTrackingComment(
  octokit: Octokits,
  context: ParsedGitHubContext,
  commentId: number,
  branch?: string,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);

  // Add branch link for issues (not PRs)
  let branchLink = "";
  if (branch && !context.isPR) {
    branchLink = createBranchLink(owner, repo, branch);
  }

  const updatedBody = createCommentBody(jobRunLink, branchLink);

  // Update the existing comment with the branch link
  try {
    const isPRReviewComment = isPullRequestReviewCommentEvent(context);

    await updateClaudeComment(octokit.rest, {
      owner,
      repo,
      commentId,
      body: updatedBody,
      isPullRequestReviewComment: isPRReviewComment,
    });

    console.log(
      `✅ Updated ${isPRReviewComment ? "PR review" : "issue"} comment ${commentId} with branch link`,
    );
  } catch (error) {
    console.error("Error updating comment with branch link:", error);
    throw error;
  }
}
