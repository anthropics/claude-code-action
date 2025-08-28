import type { GitHubContext } from "../github/context";
import {
  isEntityContext,
  isIssueCommentEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
} from "../github/context";
import { checkContainsTrigger } from "../github/validation/trigger";

export type AutoDetectedMode = "tag" | "agent";

export function detectMode(context: GitHubContext): AutoDetectedMode {
  // If prompt is provided, use agent mode for direct execution
  if (context.inputs?.prompt) {
    return "agent";
  }

  // Check for @claude mentions (tag mode)
  if (isEntityContext(context)) {
    if (
      isIssueCommentEvent(context) ||
      isPullRequestReviewEvent(context) ||
      isPullRequestReviewCommentEvent(context)
    ) {
      if (checkContainsTrigger(context)) {
        return "tag";
      }
    }

    if (context.eventName === "issues") {
      if (checkContainsTrigger(context)) {
        return "tag";
      }
    }
  }

  // Default to agent mode (which won't trigger without a prompt)
  return "agent";
}

export function getModeDescription(mode: AutoDetectedMode): string {
  switch (mode) {
    case "tag":
      return "Interactive mode triggered by @claude mentions";
    case "agent":
      return "Direct automation mode for explicit prompts";
    default:
      return "Unknown mode";
  }
}

export function shouldUseTrackingComment(mode: AutoDetectedMode): boolean {
  return mode === "tag";
}

export function getDefaultPromptForMode(
  mode: AutoDetectedMode,
  context: GitHubContext,
): string | undefined {
  switch (mode) {
    case "tag":
      return undefined;
    case "agent":
      return context.inputs?.prompt;
    default:
      return undefined;
  }
}
