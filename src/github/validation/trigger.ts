#!/usr/bin/env bun

import * as core from "@actions/core";
import {
  isIssuesEvent,
  isIssuesAssignedEvent,
  isIssueCommentEvent,
  isPullRequestEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
} from "../context";
import type { ParsedGitHubContext } from "../context";
import {
  detectActionableSuggestion,
  isCommentActionableForAutofix,
  type ActionableSuggestionResult,
} from "../../utils/detect-actionable-suggestion";

export function checkContainsTrigger(context: ParsedGitHubContext): boolean {
  const {
    inputs: { assigneeTrigger, labelTrigger, triggerPhrase, prompt },
  } = context;

  // If prompt is provided, always trigger
  if (prompt) {
    console.log(`Prompt provided, triggering action`);
    return true;
  }

  // Check for assignee trigger
  if (isIssuesAssignedEvent(context)) {
    // Remove @ symbol from assignee_trigger if present
    let triggerUser = assigneeTrigger.replace(/^@/, "");
    const assigneeUsername = context.payload.assignee?.login || "";

    if (triggerUser && assigneeUsername === triggerUser) {
      console.log(`Issue assigned to trigger user '${triggerUser}'`);
      return true;
    }
  }

  // Check for label trigger
  if (isIssuesEvent(context) && context.eventAction === "labeled") {
    const labelName = (context.payload as any).label?.name || "";

    if (labelTrigger && labelName === labelTrigger) {
      console.log(`Issue labeled with trigger label '${labelTrigger}'`);
      return true;
    }
  }

  // Check for issue body and title trigger on issue creation
  if (isIssuesEvent(context) && context.eventAction === "opened") {
    const issueBody = context.payload.issue.body || "";
    const issueTitle = context.payload.issue.title || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(issueBody)) {
      console.log(
        `Issue body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    // Check in title
    if (regex.test(issueTitle)) {
      console.log(
        `Issue title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check for pull request body and title trigger
  if (isPullRequestEvent(context)) {
    const prBody = context.payload.pull_request.body || "";
    const prTitle = context.payload.pull_request.title || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );

    // Check in body
    if (regex.test(prBody)) {
      console.log(
        `Pull request body contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    // Check in title
    if (regex.test(prTitle)) {
      console.log(
        `Pull request title contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check for pull request review body trigger
  if (
    isPullRequestReviewEvent(context) &&
    (context.eventAction === "submitted" || context.eventAction === "edited")
  ) {
    const reviewBody = context.payload.review.body || "";
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(reviewBody)) {
      console.log(
        `Pull request review contains exact trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check for comment trigger
  if (
    isIssueCommentEvent(context) ||
    isPullRequestReviewCommentEvent(context)
  ) {
    const commentBody = isIssueCommentEvent(context)
      ? context.payload.comment.body
      : context.payload.comment.body;
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    );
    if (regex.test(commentBody)) {
      console.log(`Comment contains exact trigger phrase '${triggerPhrase}'`);
      return true;
    }
  }

  console.log(`No trigger was met for ${triggerPhrase}`);

  return false;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkTriggerAction(context: ParsedGitHubContext) {
  const containsTrigger = checkContainsTrigger(context);
  core.setOutput("contains_trigger", containsTrigger.toString());
  return containsTrigger;
}

/**
 * Checks if the context contains an actionable suggestion that can be automatically fixed.
 * This is useful for autofix workflows that want to respond to code review suggestions,
 * even when they come from bot accounts like claude[bot].
 *
 * @param context - The parsed GitHub context
 * @returns Detection result with confidence level and reason
 */
export function checkContainsActionableSuggestion(
  context: ParsedGitHubContext,
): ActionableSuggestionResult {
  // Extract comment body based on event type
  let commentBody: string | undefined;

  if (isPullRequestReviewCommentEvent(context)) {
    commentBody = context.payload.comment.body;
  } else if (isIssueCommentEvent(context)) {
    commentBody = context.payload.comment.body;
  } else if (isPullRequestReviewEvent(context)) {
    commentBody = context.payload.review.body ?? undefined;
  }

  return detectActionableSuggestion(commentBody);
}

/**
 * Enhanced trigger check that also considers actionable suggestions.
 * This function first checks for the standard trigger phrase, and if not found,
 * optionally checks for actionable suggestions when `checkSuggestions` is true.
 *
 * @param context - The parsed GitHub context
 * @param checkSuggestions - Whether to also check for actionable suggestions (default: false)
 * @returns Whether the action should be triggered
 */
export function checkContainsTriggerOrActionableSuggestion(
  context: ParsedGitHubContext,
  checkSuggestions: boolean = false,
): boolean {
  // First, check for standard trigger
  if (checkContainsTrigger(context)) {
    return true;
  }

  // If checkSuggestions is enabled, also check for actionable suggestions
  if (checkSuggestions) {
    const suggestionResult = checkContainsActionableSuggestion(context);
    if (suggestionResult.isActionable) {
      console.log(
        `Comment contains actionable suggestion: ${suggestionResult.reason} (confidence: ${suggestionResult.confidence})`,
      );
      return true;
    }
  }

  return false;
}

/**
 * Checks if a PR comment is actionable for autofix purposes.
 * This is a convenience function for workflows that want to automatically
 * apply suggestions from code review comments.
 *
 * @param context - The parsed GitHub context
 * @returns Whether the comment should be treated as actionable for autofix
 */
export function checkIsActionableForAutofix(
  context: ParsedGitHubContext,
): boolean {
  // Only applicable to PR review comment events
  if (!isPullRequestReviewCommentEvent(context)) {
    return false;
  }

  const commentBody = context.payload.comment.body;
  const authorUsername = context.payload.comment.user?.login;

  return isCommentActionableForAutofix(commentBody, authorUsername);
}

// Re-export the types and functions from the utility module for convenience
export {
  detectActionableSuggestion,
  isCommentActionableForAutofix,
  type ActionableSuggestionResult,
} from "../../utils/detect-actionable-suggestion";
