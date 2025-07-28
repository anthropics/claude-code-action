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

function isBotAllowed(
  username: string,
  userType: string | undefined,
  allowedBots: string[],
): boolean {
  // Check if user is a bot
  const isBot = userType === "Bot" || username.endsWith("[bot]");

  if (!isBot) {
    // Not a bot, always allowed
    return true;
  }

  // If allowedBots is empty, bots are not allowed (opt-in feature)
  if (allowedBots.length === 0) {
    return false;
  }

  // If allowedBots contains '*', all bots are allowed
  if (allowedBots.includes("*")) {
    return true;
  }

  // Check if this specific bot is in the allowed list
  return allowedBots.includes(username);
}

export function checkContainsTrigger(context: ParsedGitHubContext): boolean {
  const {
    inputs: { assigneeTrigger, triggerPhrase, directPrompt, allowedBots },
  } = context;

  // If direct prompt is provided, always trigger
  if (directPrompt) {
    console.log(`Direct prompt provided, triggering action`);
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

  // Check for issue body and title trigger on issue creation
  if (isIssuesEvent(context) && context.eventAction === "opened") {
    const issueUser = context.payload.issue.user;

    // Check if bot is allowed
    if (!isBotAllowed(issueUser.login, issueUser.type, allowedBots)) {
      console.log(`Bot user '${issueUser.login}' is not in allowed bots list`);
      return false;
    }

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
    const prUser = context.payload.pull_request.user;

    // Check if bot is allowed
    if (!isBotAllowed(prUser.login, prUser.type, allowedBots)) {
      console.log(`Bot user '${prUser.login}' is not in allowed bots list`);
      return false;
    }

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
    const reviewUser = context.payload.review.user;

    // Check if bot is allowed
    if (!isBotAllowed(reviewUser.login, reviewUser.type, allowedBots)) {
      console.log(`Bot user '${reviewUser.login}' is not in allowed bots list`);
      return false;
    }

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
    const commentUser = context.payload.comment.user;

    // Check if bot is allowed
    if (!isBotAllowed(commentUser.login, commentUser.type, allowedBots)) {
      console.log(
        `Bot user '${commentUser.login}' is not in allowed bots list`,
      );
      return false;
    }

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
