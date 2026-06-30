#!/usr/bin/env bun

/**
 * Create the initial tracking comment when Claude Code starts working
 * This comment shows the working status and includes a link to the job run
 */

import { appendFileSync } from "fs";
import { createJobRunLink, createCommentBody } from "./common";
import {
  isPullRequestReviewCommentEvent,
  isPullRequestEvent,
  type ParsedGitHubContext,
} from "../../context";
import type { Octokit } from "@octokit/rest";

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createInitialComment(
  octokit: Octokit,
  context: ParsedGitHubContext,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  // Add hidden header with bot name for sticky comment identification
  const initialBody = createCommentBody(
    jobRunLink,
    "",
    context.inputs.useStickyComment ? context.inputs.botName : "",
  );

  try {
    let response;

    if (
      context.inputs.useStickyComment &&
      context.isPR &&
      isPullRequestEvent(context)
    ) {
      // Use pagination to fetch all comments (handles PRs with 30+ comments)
      const comments = await octokit.paginate(
        octokit.rest.issues.listComments,
        {
          owner,
          repo,
          issue_number: context.entityNumber,
          per_page: 100,
        },
      );
      const existingComment = comments.find((comment) => {
        // Must be from the correct bot user
        const idMatch = comment.user?.id === Number(context.inputs.botId);
        if (!idMatch) return false;

        // Check for our hidden header (case-insensitive, whitespace-tolerant)
        const headerPattern = new RegExp(
          `<!--\\s*bot:\\s*${escapeRegex(context.inputs.botName)}\\s*-->`,
          "i",
        );
        const hasOurHeader = headerPattern.test(comment.body || "");

        // Check if comment has ANY bot header
        const hasAnyHeader = /<!--\s*bot:\s*\S+\s*-->/.test(comment.body || "");

        // If comment has a header, ONLY match if it's ours
        if (hasAnyHeader) {
          return hasOurHeader;
        }

        // Legacy comments (no header): match if it looks like a Claude comment
        const isClaudeComment =
          comment.body?.includes("Claude Code is working") ||
          comment.body?.includes("View job run");

        return isClaudeComment;
      });
      if (existingComment) {
        response = await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: existingComment.id,
          body: initialBody,
        });
      } else {
        // Create new comment if no existing one found
        response = await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: context.entityNumber,
          body: initialBody,
        });
      }
    } else if (isPullRequestReviewCommentEvent(context)) {
      // Only use createReplyForReviewComment if it's a PR review comment AND we have a comment_id
      response = await octokit.rest.pulls.createReplyForReviewComment({
        owner,
        repo,
        pull_number: context.entityNumber,
        comment_id: context.payload.comment.id,
        body: initialBody,
      });
    } else {
      // For all other cases (issues, issue comments, or missing comment_id)
      response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: context.entityNumber,
        body: initialBody,
      });
    }

    // Output the comment ID for downstream steps using GITHUB_OUTPUT
    const githubOutput = process.env.GITHUB_OUTPUT!;
    appendFileSync(githubOutput, `claude_comment_id=${response.data.id}\n`);
    console.log(`✅ Created initial comment with ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error("Error in initial comment:", error);

    // Always fall back to regular issue comment if anything fails
    try {
      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: context.entityNumber,
        body: initialBody,
      });

      const githubOutput = process.env.GITHUB_OUTPUT!;
      appendFileSync(githubOutput, `claude_comment_id=${response.data.id}\n`);
      console.log(`✅ Created fallback comment with ID: ${response.data.id}`);
      return response.data;
    } catch (fallbackError) {
      console.error("Error creating fallback comment:", fallbackError);
      throw fallbackError;
    }
  }
}
