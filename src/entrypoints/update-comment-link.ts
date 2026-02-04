#!/usr/bin/env bun

import { createOctokit } from "../github/api/client";
import type { Octokits } from "../github/api/client";
import * as fs from "fs/promises";
import {
  updateCommentBody,
  type CommentUpdateInput,
} from "../github/operations/comment-logic";
import {
  parseGitHubContext,
  isPullRequestReviewCommentEvent,
  isEntityContext,
} from "../github/context";
import type { ParsedGitHubContext } from "../github/context";
import { GITHUB_SERVER_URL } from "../github/api/config";
import { checkAndCommitOrDeleteBranch } from "../github/operations/branch-cleanup";
import { updateClaudeComment } from "../github/operations/comments/update-claude-comment";

export type UpdateCommentLinkParams = {
  commentId: number;
  githubToken: string;
  claudeBranch?: string;
  baseBranch: string;
  triggerUsername?: string;
  context: ParsedGitHubContext;
  octokit: Octokits;
  claudeSuccess: boolean;
  outputFile?: string;
  prepareSuccess: boolean;
  prepareError?: string;
  useCommitSigning: boolean;
};

export async function updateCommentLink(
  params: UpdateCommentLinkParams,
): Promise<void> {
  const {
    commentId,
    claudeBranch,
    baseBranch,
    triggerUsername,
    context,
    octokit,
    useCommitSigning,
  } = params;

  const { owner, repo } = context.repository;

  const serverUrl = GITHUB_SERVER_URL;
  const jobUrl = `${serverUrl}/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  let comment;
  let isPRReviewComment = false;

  try {
    // GitHub has separate ID namespaces for review comments and issue comments
    // We need to use the correct API based on the event type
    if (isPullRequestReviewCommentEvent(context)) {
      // For PR review comments, use the pulls API
      console.log(`Fetching PR review comment ${commentId}`);
      const { data: prComment } = await octokit.rest.pulls.getReviewComment({
        owner,
        repo,
        comment_id: commentId,
      });
      comment = prComment;
      isPRReviewComment = true;
      console.log("Successfully fetched as PR review comment");
    }

    // For all other event types, use the issues API
    if (!comment) {
      console.log(`Fetching issue comment ${commentId}`);
      const { data: issueComment } = await octokit.rest.issues.getComment({
        owner,
        repo,
        comment_id: commentId,
      });
      comment = issueComment;
      isPRReviewComment = false;
      console.log("Successfully fetched as issue comment");
    }
  } catch (finalError) {
    // If all attempts fail, try to determine more information about the comment
    console.error("Failed to fetch comment. Debug info:");
    console.error(`Comment ID: ${commentId}`);
    console.error(`Event name: ${context.eventName}`);
    console.error(`Entity number: ${context.entityNumber}`);
    console.error(`Repository: ${context.repository.full_name}`);

    // Try to get the PR info to understand the comment structure
    try {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: context.entityNumber,
      });
      console.log(`PR state: ${pr.state}`);
      console.log(`PR comments count: ${pr.comments}`);
      console.log(`PR review comments count: ${pr.review_comments}`);
    } catch {
      console.error("Could not fetch PR info for debugging");
    }

    throw finalError;
  }

  const currentBody = comment.body ?? "";

  // Check if we need to add branch link for new branches
  const { shouldDeleteBranch, branchLink } = await checkAndCommitOrDeleteBranch(
    octokit,
    owner,
    repo,
    claudeBranch,
    baseBranch,
    useCommitSigning,
  );

  // Check if we need to add PR URL when we have a new branch
  let prLink = "";
  // If claudeBranch is set, it means we created a new branch (for issues or closed/merged PRs)
  if (claudeBranch && !shouldDeleteBranch) {
    // Check if comment already contains a PR URL
    const serverUrlPattern = serverUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prUrlPattern = new RegExp(
      `${serverUrlPattern}\\/.+\\/compare\\/${baseBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\.\\.`,
    );
    const containsPRUrl = currentBody.match(prUrlPattern);

    if (!containsPRUrl) {
      // Check if there are changes to the branch compared to the default branch
      try {
        const { data: comparison } =
          await octokit.rest.repos.compareCommitsWithBasehead({
            owner,
            repo,
            basehead: `${baseBranch}...${claudeBranch}`,
          });

        // If there are changes (commits or file changes), add the PR URL
        if (
          comparison.total_commits > 0 ||
          (comparison.files && comparison.files.length > 0)
        ) {
          const entityType = context.isPR ? "PR" : "Issue";
          const prTitle = encodeURIComponent(
            `${entityType} #${context.entityNumber}: Changes from Claude`,
          );
          const prBody = encodeURIComponent(
            `This PR addresses ${entityType.toLowerCase()} #${context.entityNumber}\n\nGenerated with [Claude Code](https://claude.ai/code)`,
          );
          const prUrl = `${serverUrl}/${owner}/${repo}/compare/${baseBranch}...${claudeBranch}?quick_pull=1&title=${prTitle}&body=${prBody}`;
          prLink = `\n[Create a PR](${prUrl})`;
        }
      } catch (error) {
        console.error("Error checking for changes in branch:", error);
        // Don't fail the entire update if we can't check for changes
      }
    }
  }

  // Check if action failed and read output file for execution details
  let executionDetails: {
    total_cost_usd?: number;
    duration_ms?: number;
    duration_api_ms?: number;
  } | null = null;
  let actionFailed = false;
  let errorDetails: string | undefined;

  if (!params.prepareSuccess && params.prepareError) {
    actionFailed = true;
    errorDetails = params.prepareError;
  } else {
    // Check for existence of output file and parse it if available
    try {
      if (params.outputFile) {
        const fileContent = await fs.readFile(params.outputFile, "utf8");
        const outputData = JSON.parse(fileContent);

        // Output file is an array, get the last element which contains execution details
        if (Array.isArray(outputData) && outputData.length > 0) {
          const lastElement = outputData[outputData.length - 1];
          if (
            lastElement.type === "result" &&
            "total_cost_usd" in lastElement &&
            "duration_ms" in lastElement
          ) {
            executionDetails = {
              total_cost_usd: lastElement.total_cost_usd,
              duration_ms: lastElement.duration_ms,
              duration_api_ms: lastElement.duration_api_ms,
            };
          }
        }
      }

      actionFailed = !params.claudeSuccess;
    } catch (error) {
      console.error("Error reading output file:", error);
      actionFailed = !params.claudeSuccess;
    }
  }

  // Prepare input for updateCommentBody function
  const commentInput: CommentUpdateInput = {
    currentBody,
    actionFailed,
    executionDetails,
    jobUrl,
    branchLink,
    prLink,
    branchName: shouldDeleteBranch || !branchLink ? undefined : claudeBranch,
    triggerUsername,
    errorDetails,
  };

  const updatedBody = updateCommentBody(commentInput);

  try {
    await updateClaudeComment(octokit.rest, {
      owner,
      repo,
      commentId,
      body: updatedBody,
      isPullRequestReviewComment: isPRReviewComment,
    });
    console.log(
      `✅ Updated ${isPRReviewComment ? "PR review" : "issue"} comment ${commentId} with job link`,
    );
  } catch (updateError) {
    console.error(
      `Failed to update ${isPRReviewComment ? "PR review" : "issue"} comment:`,
      updateError,
    );
    throw updateError;
  }
}

async function run() {
  try {
    const context = parseGitHubContext();
    if (!isEntityContext(context)) {
      throw new Error("update-comment-link requires an entity context");
    }

    const githubToken = process.env.GITHUB_TOKEN!;
    const octokit = createOctokit(githubToken);

    await updateCommentLink({
      commentId: parseInt(process.env.CLAUDE_COMMENT_ID!),
      githubToken,
      claudeBranch: process.env.CLAUDE_BRANCH,
      baseBranch: process.env.BASE_BRANCH || "main",
      triggerUsername: process.env.TRIGGER_USERNAME,
      context,
      octokit,
      claudeSuccess: process.env.CLAUDE_SUCCESS !== "false",
      outputFile: process.env.OUTPUT_FILE,
      prepareSuccess: process.env.PREPARE_SUCCESS !== "false",
      prepareError: process.env.PREPARE_ERROR,
      useCommitSigning: process.env.USE_COMMIT_SIGNING === "true",
    });

    process.exit(0);
  } catch (error) {
    console.error("Error updating comment with job link:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
