#!/usr/bin/env bun

import * as core from "@actions/core";
import { writeFile, mkdir } from "fs/promises";
import type { FetchDataResult } from "../github/data/fetcher";
import {
  formatContext,
  formatBody,
  formatComments,
  formatReviewComments,
  formatChangedFilesWithSHA,
  stripHtmlComments,
} from "../github/data/formatter";
import {
  isIssuesEvent,
  isIssueCommentEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
} from "../github/context";
import type { ParsedGitHubContext } from "../github/context";
import type { CommonFields, PreparedContext, EventData } from "./types";
import { processDefaultSystemPrompt } from "./default-system-prompt";
export type { CommonFields, PreparedContext } from "./types";

const BASE_ALLOWED_TOOLS = [
  "Edit",
  "Glob",
  "Grep",
  "LS",
  "Read",
  "Write",
  "mcp__github_file_ops__commit_files",
  "mcp__github_file_ops__delete_files",
];
const DISALLOWED_TOOLS = ["WebSearch", "WebFetch"];

export function buildAllowedToolsString(
  eventData: EventData,
  customAllowedTools?: string,
): string {
  let baseTools = [...BASE_ALLOWED_TOOLS];

  // Add the appropriate comment tool based on event type
  if (eventData.eventName === "pull_request_review_comment") {
    // For inline PR review comments, only use PR comment tool
    baseTools.push("mcp__github__update_pull_request_comment");
  } else {
    // For all other events (issue comments, PR reviews, issues), use issue comment tool
    baseTools.push("mcp__github__update_issue_comment");
  }

  let allAllowedTools = baseTools.join(",");
  if (customAllowedTools) {
    allAllowedTools = `${allAllowedTools},${customAllowedTools}`;
  }
  return allAllowedTools;
}

export function buildDisallowedToolsString(
  customDisallowedTools?: string,
): string {
  let allDisallowedTools = DISALLOWED_TOOLS.join(",");
  if (customDisallowedTools) {
    allDisallowedTools = `${allDisallowedTools},${customDisallowedTools}`;
  }
  return allDisallowedTools;
}

export function prepareContext(
  context: ParsedGitHubContext,
  claudeCommentId: string,
  defaultBranch?: string,
  claudeBranch?: string,
): PreparedContext {
  const repository = context.repository.full_name;
  const eventName = context.eventName;
  const eventAction = context.eventAction;
  const triggerPhrase = context.inputs.triggerPhrase || "@claude";
  const assigneeTrigger = context.inputs.assigneeTrigger;
  const customInstructions = context.inputs.customInstructions;
  const systemPrompt = context.inputs.systemPrompt;
  const allowedTools = context.inputs.allowedTools;
  const disallowedTools = context.inputs.disallowedTools;
  const directPrompt = context.inputs.directPrompt;
  const isPR = context.isPR;

  // Get PR/Issue number from entityNumber
  const prNumber = isPR ? context.entityNumber.toString() : undefined;
  const issueNumber = !isPR ? context.entityNumber.toString() : undefined;

  // Extract trigger username and comment data based on event type
  let triggerUsername: string | undefined;
  let commentId: string | undefined;
  let commentBody: string | undefined;

  if (isIssueCommentEvent(context)) {
    commentId = context.payload.comment.id.toString();
    commentBody = context.payload.comment.body;
    triggerUsername = context.payload.comment.user.login;
  } else if (isPullRequestReviewEvent(context)) {
    commentBody = context.payload.review.body ?? "";
    triggerUsername = context.payload.review.user.login;
  } else if (isPullRequestReviewCommentEvent(context)) {
    commentId = context.payload.comment.id.toString();
    commentBody = context.payload.comment.body;
    triggerUsername = context.payload.comment.user.login;
  } else if (isIssuesEvent(context)) {
    triggerUsername = context.payload.issue.user.login;
  }

  // Create infrastructure fields object
  const commonFields: CommonFields = {
    repository,
    claudeCommentId,
    triggerPhrase,
    ...(triggerUsername && { triggerUsername }),
    ...(customInstructions && { customInstructions }),
    ...(systemPrompt && { systemPrompt }),
    ...(allowedTools && { allowedTools }),
    ...(disallowedTools && { disallowedTools }),
    ...(directPrompt && { directPrompt }),
    ...(claudeBranch && { claudeBranch }),
  };

  // Parse event-specific data based on event type
  let eventData: EventData;

  switch (eventName) {
    case "pull_request_review_comment":
      if (!prNumber) {
        throw new Error(
          "PR_NUMBER is required for pull_request_review_comment event",
        );
      }
      if (!isPR) {
        throw new Error(
          "IS_PR must be true for pull_request_review_comment event",
        );
      }
      if (!commentBody) {
        throw new Error(
          "COMMENT_BODY is required for pull_request_review_comment event",
        );
      }
      eventData = {
        eventName: "pull_request_review_comment",
        isPR: true,
        prNumber,
        ...(commentId && { commentId }),
        commentBody,
        ...(claudeBranch && { claudeBranch }),
        ...(defaultBranch && { defaultBranch }),
      };
      break;

    case "pull_request_review":
      if (!prNumber) {
        throw new Error("PR_NUMBER is required for pull_request_review event");
      }
      if (!isPR) {
        throw new Error("IS_PR must be true for pull_request_review event");
      }
      if (!commentBody) {
        throw new Error(
          "COMMENT_BODY is required for pull_request_review event",
        );
      }
      eventData = {
        eventName: "pull_request_review",
        isPR: true,
        prNumber,
        commentBody,
        ...(claudeBranch && { claudeBranch }),
        ...(defaultBranch && { defaultBranch }),
      };
      break;

    case "issue_comment":
      if (!commentId) {
        throw new Error("COMMENT_ID is required for issue_comment event");
      }
      if (!commentBody) {
        throw new Error("COMMENT_BODY is required for issue_comment event");
      }
      if (isPR) {
        if (!prNumber) {
          throw new Error(
            "PR_NUMBER is required for issue_comment event for PRs",
          );
        }

        eventData = {
          eventName: "issue_comment",
          commentId,
          isPR: true,
          prNumber,
          commentBody,
          ...(claudeBranch && { claudeBranch }),
          ...(defaultBranch && { defaultBranch }),
        };
        break;
      } else if (!claudeBranch) {
        throw new Error("CLAUDE_BRANCH is required for issue_comment event");
      } else if (!defaultBranch) {
        throw new Error("DEFAULT_BRANCH is required for issue_comment event");
      } else if (!issueNumber) {
        throw new Error(
          "ISSUE_NUMBER is required for issue_comment event for issues",
        );
      }

      eventData = {
        eventName: "issue_comment",
        commentId,
        isPR: false,
        claudeBranch: claudeBranch,
        defaultBranch,
        issueNumber,
        commentBody,
      };
      break;

    case "issues":
      if (!eventAction) {
        throw new Error("GITHUB_EVENT_ACTION is required for issues event");
      }
      if (!issueNumber) {
        throw new Error("ISSUE_NUMBER is required for issues event");
      }
      if (isPR) {
        throw new Error("IS_PR must be false for issues event");
      }
      if (!defaultBranch) {
        throw new Error("DEFAULT_BRANCH is required for issues event");
      }
      if (!claudeBranch) {
        throw new Error("CLAUDE_BRANCH is required for issues event");
      }

      if (eventAction === "assigned") {
        if (!assigneeTrigger) {
          throw new Error(
            "ASSIGNEE_TRIGGER is required for issue assigned event",
          );
        }
        eventData = {
          eventName: "issues",
          eventAction: "assigned",
          isPR: false,
          issueNumber,
          defaultBranch,
          claudeBranch,
          assigneeTrigger,
        };
      } else if (eventAction === "opened") {
        eventData = {
          eventName: "issues",
          eventAction: "opened",
          isPR: false,
          issueNumber,
          defaultBranch,
          claudeBranch,
        };
      } else {
        throw new Error(`Unsupported issue action: ${eventAction}`);
      }
      break;

    case "pull_request":
      if (!prNumber) {
        throw new Error("PR_NUMBER is required for pull_request event");
      }
      if (!isPR) {
        throw new Error("IS_PR must be true for pull_request event");
      }
      eventData = {
        eventName: "pull_request",
        eventAction: eventAction,
        isPR: true,
        prNumber,
        ...(claudeBranch && { claudeBranch }),
        ...(defaultBranch && { defaultBranch }),
      };
      break;

    default:
      throw new Error(`Unsupported event type: ${eventName}`);
  }

  return {
    ...commonFields,
    eventData,
  };
}

export function getEventTypeAndContext(envVars: PreparedContext): {
  eventType: string;
  triggerContext: string;
} {
  const eventData = envVars.eventData;

  switch (eventData.eventName) {
    case "pull_request_review_comment":
      return {
        eventType: "REVIEW_COMMENT",
        triggerContext: `PR review comment with '${envVars.triggerPhrase}'`,
      };

    case "pull_request_review":
      return {
        eventType: "PR_REVIEW",
        triggerContext: `PR review with '${envVars.triggerPhrase}'`,
      };

    case "issue_comment":
      return {
        eventType: "GENERAL_COMMENT",
        triggerContext: `issue comment with '${envVars.triggerPhrase}'`,
      };

    case "issues":
      if (eventData.eventAction === "opened") {
        return {
          eventType: "ISSUE_CREATED",
          triggerContext: `new issue with '${envVars.triggerPhrase}' in body`,
        };
      }
      return {
        eventType: "ISSUE_ASSIGNED",
        triggerContext: `issue assigned to '${eventData.assigneeTrigger}'`,
      };

    case "pull_request":
      return {
        eventType: "PULL_REQUEST",
        triggerContext: eventData.eventAction
          ? `pull request ${eventData.eventAction}`
          : `pull request event`,
      };

    default:
      throw new Error(`Unexpected event type`);
  }
}

export function buildContextSection(
  context: PreparedContext,
  githubData: FetchDataResult,
): string {
  const {
    contextData,
    comments,
    changedFilesWithSHA,
    reviewData,
    imageUrlMap,
  } = githubData;
  const { eventData } = context;

  const { eventType, triggerContext } = getEventTypeAndContext(context);

  const formattedContext = formatContext(contextData, eventData.isPR);
  const formattedComments = formatComments(comments, imageUrlMap);
  const formattedReviewComments = eventData.isPR
    ? formatReviewComments(reviewData, imageUrlMap)
    : "";
  const formattedChangedFiles = eventData.isPR
    ? formatChangedFilesWithSHA(changedFilesWithSHA)
    : "";

  // Check if any images were downloaded
  const hasImages = imageUrlMap && imageUrlMap.size > 0;
  const imagesInfo = hasImages
    ? `

<images_info>
Images have been downloaded from GitHub comments and saved to disk. Their file paths are included in the formatted comments and body above. You can use the Read tool to view these images.
</images_info>`
    : "";

  const formattedBody = contextData?.body
    ? formatBody(contextData.body, imageUrlMap)
    : "No description provided";

  return `
<formatted_context>
${formattedContext}
</formatted_context>

<pr_or_issue_body>
${formattedBody}
</pr_or_issue_body>

<comments>
${formattedComments || "No comments"}
</comments>

<review_comments>
${eventData.isPR ? formattedReviewComments || "No review comments" : ""}
</review_comments>

<changed_files>
${eventData.isPR ? formattedChangedFiles || "No files changed" : ""}
</changed_files>${imagesInfo}

<event_type>${eventType}</event_type>
<is_pr>${eventData.isPR ? "true" : "false"}</is_pr>
<trigger_context>${triggerContext}</trigger_context>
<repository>${context.repository}</repository>
${
  eventData.isPR
    ? `<pr_number>${eventData.prNumber}</pr_number>`
    : `<issue_number>${eventData.issueNumber ?? ""}</issue_number>`
}
<claude_comment_id>${context.claudeCommentId}</claude_comment_id>
<trigger_username>${context.triggerUsername ?? "Unknown"}</trigger_username>
<trigger_phrase>${context.triggerPhrase}</trigger_phrase>
${
  (eventData.eventName === "issue_comment" ||
    eventData.eventName === "pull_request_review_comment" ||
    eventData.eventName === "pull_request_review") &&
  eventData.commentBody
    ? `<trigger_comment>
${stripHtmlComments(eventData.commentBody)}
</trigger_comment>`
    : ""
}
${
  context.directPrompt
    ? `<direct_prompt>
${stripHtmlComments(context.directPrompt)}
</direct_prompt>`
    : ""
}
${
  eventData.eventName === "pull_request_review_comment"
    ? `<comment_tool_info>
IMPORTANT: For this inline PR review comment, you have been provided with ONLY the mcp__github__update_pull_request_comment tool to update this specific review comment.

Tool usage example for mcp__github__update_pull_request_comment:
{
  "owner": "${context.repository.split("/")[0]}",
  "repo": "${context.repository.split("/")[1]}",
  "commentId": ${eventData.commentId || context.claudeCommentId},
  "body": "Your comment text here"
}
All four parameters (owner, repo, commentId, body) are required.
</comment_tool_info>`
    : `<comment_tool_info>
IMPORTANT: For this event type, you have been provided with ONLY the mcp__github__update_issue_comment tool to update comments.

Tool usage example for mcp__github__update_issue_comment:
{
  "owner": "${context.repository.split("/")[0]}",
  "repo": "${context.repository.split("/")[1]}",
  "commentId": ${context.claudeCommentId},
  "body": "Your comment text here"
}
All four parameters (owner, repo, commentId, body) are required.
</comment_tool_info>`
}`;
}

export function generatePrompt(
  context: PreparedContext,
  githubData: FetchDataResult,
): string {
  const { eventData } = context;

  // Build the context section that always gets included
  const contextSection = buildContextSection(context, githubData);

  // Determine the system prompt content
  let promptContent: string;
  
  if (context.systemPrompt) {
    // Use custom system prompt with variable substitution
    const {
      contextData,
      comments,
      changedFilesWithSHA,
      reviewData,
      imageUrlMap,
    } = githubData;

    const { eventType, triggerContext } = getEventTypeAndContext(context);

    const formattedContext = formatContext(contextData, eventData.isPR);
    const formattedComments = formatComments(comments, imageUrlMap);
    const formattedReviewComments = eventData.isPR
      ? formatReviewComments(reviewData, imageUrlMap)
      : "";
    const formattedChangedFiles = eventData.isPR
      ? formatChangedFilesWithSHA(changedFilesWithSHA)
      : "";

    // Check if any images were downloaded
    const hasImages = imageUrlMap && imageUrlMap.size > 0;
    const imagesInfo = hasImages
      ? `

<images_info>
Images have been downloaded from GitHub comments and saved to disk. Their file paths are included in the formatted comments and body above. You can use the Read tool to view these images.
</images_info>`
      : "";

    const formattedBody = contextData?.body
      ? formatBody(contextData.body, imageUrlMap)
      : "No description provided";

    const variables: Record<string, string> = {
      FORMATTED_CONTEXT: formattedContext,
      PR_OR_ISSUE_BODY: formattedBody,
      COMMENTS: formattedComments || "No comments",
      REVIEW_COMMENTS: eventData.isPR ? formattedReviewComments || "No review comments" : "",
      CHANGED_FILES: eventData.isPR ? formattedChangedFiles || "No files changed" : "",
      IMAGES_INFO: imagesInfo,
      EVENT_TYPE: eventType,
      IS_PR: eventData.isPR ? "true" : "false",
      TRIGGER_CONTEXT: triggerContext,
      REPOSITORY: context.repository,
      PR_NUMBER: eventData.isPR ? eventData.prNumber || "" : "",
      ISSUE_NUMBER: eventData.isPR ? "" : eventData.issueNumber ?? "",
      CLAUDE_COMMENT_ID: context.claudeCommentId,
      TRIGGER_USERNAME: context.triggerUsername ?? "Unknown",
      TRIGGER_PHRASE: context.triggerPhrase,
      TRIGGER_COMMENT: (eventData.eventName === "issue_comment" ||
        eventData.eventName === "pull_request_review_comment" ||
        eventData.eventName === "pull_request_review") &&
        eventData.commentBody
        ? stripHtmlComments(eventData.commentBody)
        : "",
      DIRECT_PROMPT: context.directPrompt
        ? stripHtmlComments(context.directPrompt)
        : "",
      COMMENT_TOOL_INFO: eventData.eventName === "pull_request_review_comment"
        ? `IMPORTANT: For this inline PR review comment, you have been provided with ONLY the mcp__github__update_pull_request_comment tool to update this specific review comment.

Tool usage example for mcp__github__update_pull_request_comment:
{
  "owner": "${context.repository.split("/")[0]}",
  "repo": "${context.repository.split("/")[1]}",
  "commentId": ${eventData.commentId || context.claudeCommentId},
  "body": "Your comment text here"
}
All four parameters (owner, repo, commentId, body) are required.`
        : `IMPORTANT: For this event type, you have been provided with ONLY the mcp__github__update_issue_comment tool to update comments.

Tool usage example for mcp__github__update_issue_comment:
{
  "owner": "${context.repository.split("/")[0]}",
  "repo": "${context.repository.split("/")[1]}",
  "commentId": ${context.claudeCommentId},
  "body": "Your comment text here"
}
All four parameters (owner, repo, commentId, body) are required.`,
      CUSTOM_INSTRUCTIONS: context.customInstructions || "",
    };

    // Replace variables in the custom system prompt
    promptContent = context.systemPrompt;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      promptContent = promptContent.replace(regex, value);
    }
  } else {
    // Use the default system prompt
    promptContent = processDefaultSystemPrompt(context);
  }

  // Add custom instructions if provided
  if (context.customInstructions) {
    promptContent += `\n\nCUSTOM INSTRUCTIONS:\n${context.customInstructions}`;
  }

  // Always prepend the context section
  promptContent = `${contextSection}\n\n${promptContent}`;

  return promptContent;
}

export async function createPrompt(
  claudeCommentId: number,
  defaultBranch: string | undefined,
  claudeBranch: string | undefined,
  githubData: FetchDataResult,
  context: ParsedGitHubContext,
) {
  try {
    const preparedContext = prepareContext(
      context,
      claudeCommentId.toString(),
      defaultBranch,
      claudeBranch,
    );

    await mkdir("/tmp/claude-prompts", { recursive: true });

    // Generate the prompt
    const promptContent = generatePrompt(preparedContext, githubData);

    // Log the final prompt to console
    console.log("===== FINAL PROMPT =====");
    console.log(promptContent);
    console.log("=======================");

    // Write the prompt file
    await writeFile("/tmp/claude-prompts/claude-prompt.txt", promptContent);

    // Set allowed tools
    const allAllowedTools = buildAllowedToolsString(
      preparedContext.eventData,
      preparedContext.allowedTools,
    );
    const allDisallowedTools = buildDisallowedToolsString(
      preparedContext.disallowedTools,
    );

    core.exportVariable("ALLOWED_TOOLS", allAllowedTools);
    core.exportVariable("DISALLOWED_TOOLS", allDisallowedTools);
  } catch (error) {
    core.setFailed(`Create prompt failed with error: ${error}`);
    process.exit(1);
  }
}
