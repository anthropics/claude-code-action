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

export async function createInitialComment(
  octokit: Octokit,
  context: ParsedGitHubContext,
) {
  const { owner, repo } = context.repository;

  const jobRunLink = createJobRunLink(owner, repo, context.runId);
  const initialBody = createCommentBody(
    jobRunLink,
    "",
    context.inputs.stickyCommentMatchingStrategy === "id_and_name"
      ? context.inputs.stickyCommentAppBotName
      : "",
  );

  try {
    let response;

    if (
      context.inputs.useStickyComment &&
      context.isPR &&
      isPullRequestEvent(context)
    ) {
      const comments = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: context.entityNumber,
      });
      const existingComment = comments.data.find((comment) => {
        const idMatch =
          comment.user?.id === context.inputs.stickyCommentAppBotId;
        
        // Check for hidden header match if using id_and_name strategy
        const hiddenHeader = `<!-- bot: ${context.inputs.stickyCommentAppBotName} -->`;
        const headerMatch = comment.body?.includes(hiddenHeader);

        const botNameMatch =
          comment.user?.type === "Bot" &&
          comment.user?.login
            .toLowerCase()
            .includes(context.inputs.stickyCommentAppBotName);
        const bodyMatch = comment.body === initialBody;

        // 'id_and_name': Require both ID AND name to match.
        // We prioritize the hidden header match for robust name matching.
        // Fallback to login name match if header not found (for backward compatibility).
        // 'id_or_name': Match by ID OR name OR body.
        if (context.inputs.stickyCommentMatchingStrategy === "id_and_name") {
          return (idMatch && (headerMatch || botNameMatch)) || bodyMatch;
        }
        return idMatch || botNameMatch || bodyMatch;
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
