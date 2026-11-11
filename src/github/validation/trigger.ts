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
import { isSameLogin } from "./actor";

export function checkContainsTrigger(context: ParsedGitHubContext): boolean {
  const {
    inputs: { assigneeTrigger, labelTrigger, triggerPhrase, prompt },
  } = context;

  // Deleting or editing someone else's comment or review fires these events with
  // the moderator as the actor. The text must come from the person who was checked.
  if (
    (isIssueCommentEvent(context) ||
      isPullRequestReviewCommentEvent(context)) &&
    (context.eventAction === "deleted" ||
      !isSameLogin(context.payload.comment.user?.login, context.actor))
  ) {
    console.log("Comment was not written by the actor, or was deleted");
    return false;
  }
  if (
    isPullRequestReviewEvent(context) &&
    !isSameLogin(context.payload.review.user?.login, context.actor)
  ) {
    console.log("Review was written by someone other than the actor");
    return false;
  }

  // A prompt replaces the trigger phrase, but a configured label or assignee
  // still decides which label or assignment event starts a run. Otherwise any
  // triage action on an issue would start one.
  if (prompt) {
    if (
      isIssuesEvent(context) &&
      context.eventAction === "labeled" &&
      labelTrigger &&
      !matchesLabelTrigger(context, labelTrigger)
    ) {
      console.log(`Issue label is not the trigger label '${labelTrigger}'`);
      return false;
    }
    if (
      isIssuesAssignedEvent(context) &&
      assigneeTrigger &&
      !matchesAssigneeTrigger(context, assigneeTrigger)
    ) {
      console.log(`Issue was not assigned to '${assigneeTrigger}'`);
      return false;
    }
    console.log(`Prompt provided, triggering action`);
    return true;
  }

  // Check for assignee trigger
  if (isIssuesAssignedEvent(context)) {
    if (matchesAssigneeTrigger(context, assigneeTrigger)) {
      console.log(`Issue assigned to trigger user '${assigneeTrigger}'`);
      return true;
    }
  }

  // Check for label trigger
  if (isIssuesEvent(context) && context.eventAction === "labeled") {
    if (matchesLabelTrigger(context, labelTrigger)) {
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
      "i",
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
      "i",
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
      "i",
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
    const commentBody = context.payload.comment.body;
    // Check for exact match with word boundaries or punctuation
    const regex = new RegExp(
      `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
      "i",
    );
    if (regex.test(commentBody)) {
      console.log(`Comment contains exact trigger phrase '${triggerPhrase}'`);
      return true;
    }
  }

  console.log(`No trigger was met for ${triggerPhrase}`);

  return false;
}

function matchesLabelTrigger(
  context: ParsedGitHubContext,
  labelTrigger: string,
): boolean {
  const labelName = (context.payload as any).label?.name || "";
  return (
    !!labelTrigger && labelName.toLowerCase() === labelTrigger.toLowerCase()
  );
}

function matchesAssigneeTrigger(
  context: ParsedGitHubContext,
  assigneeTrigger: string,
): boolean {
  // Remove @ symbol from assignee_trigger if present
  const triggerUser = assigneeTrigger.replace(/^@/, "");
  const assigneeUsername = (context.payload as any).assignee?.login || "";
  return !!triggerUser && assigneeUsername === triggerUser;
}

export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkTriggerAction(context: ParsedGitHubContext) {
  const containsTrigger = checkContainsTrigger(context);
  core.setOutput("contains_trigger", containsTrigger.toString());
  return containsTrigger;
}
