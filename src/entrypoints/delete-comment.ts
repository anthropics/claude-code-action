#!/usr/bin/env bun

import { createOctokit } from "../github/api/client";
import {
  parseGitHubContext,
} from "../github/context";
import { deleteClaudeComment } from "../github/operations/comments/delete-claude-comment";

async function run() {
  try {
    const commentId = parseInt(process.env.CLAUDE_COMMENT_ID!);
    const githubToken = process.env.GITHUB_TOKEN!;

    const context = parseGitHubContext();
    const { owner, repo } = context.repository;
    const octokit = createOctokit(githubToken);

    let isPRReviewComment = false;

 
    try {
      await deleteClaudeComment(octokit.rest, {
        owner,
        repo,
        commentId,
        isPullRequestReviewComment: isPRReviewComment,
      });
      console.log(
        `✅ Deleted ${isPRReviewComment ? "PR review" : "issue"} comment ${commentId}`,
      );
    } catch (updateError) {
      console.error(
        `Failed to delete ${isPRReviewComment ? "PR review" : "issue"} comment:`,
        updateError,
      );
      throw updateError;
    }

    process.exit(0);
  } catch (error) {
    console.error("Error updating comment with job link:", error);
    process.exit(1);
  }
}

run();
