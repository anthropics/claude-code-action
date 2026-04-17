import type { GitHubContext } from "../github/context";
import {
  isEntityContext,
  isIssueCommentEvent,
  isPullRequestReviewCommentEvent,
  isPullRequestEvent,
  isIssuesEvent,
  isPullRequestReviewEvent,
} from "../github/context";
import { checkContainsTrigger } from "../github/validation/trigger";

export type AutoDetectedMode = "tag" | "agent" | "review";

// PR actions that can auto-enter review mode.
const REVIEW_PR_ACTIONS = [
  "opened",
  "synchronize",
  "ready_for_review",
  "reopened",
];

export function detectMode(context: GitHubContext): AutoDetectedMode {
  // Review mode gate.
  // - "true": force review whenever we can safely enter it (PR open-like or
  //   comment with an explicit trigger phrase).
  // - "auto": same entry conditions; the review orchestrator's triage step
  //   decides single-agent vs multi-agent internally.
  // `prompt` and `trackProgress` no longer opt out of review:
  //   - `prompt` is threaded to each review agent as team guidance.
  //   - `trackProgress` is functionally covered by the review tracker.
  if (
    context.inputs.multiAgentReview !== "false" &&
    isEntityContext(context) &&
    context.isPR
  ) {
    const isPrOpenLike =
      isPullRequestEvent(context) &&
      context.eventAction !== undefined &&
      REVIEW_PR_ACTIONS.includes(context.eventAction);

    // Comment events are only eligible when an explicit trigger phrase is
    // present — prevents the review's own comments from re-triggering itself
    // and avoids reviewing on unrelated chatter.
    const isCommentTrigger =
      (isIssueCommentEvent(context) ||
        isPullRequestReviewCommentEvent(context)) &&
      checkContainsTrigger(context);

    if (
      (context.inputs.multiAgentReview === "true" ||
        context.inputs.multiAgentReview === "auto") &&
      (isPrOpenLike || isCommentTrigger)
    ) {
      return "review";
    }
  }

  // Validate track_progress usage
  if (context.inputs.trackProgress) {
    validateTrackProgressEvent(context);
  }

  // If track_progress is set for PR/issue events, force tag mode
  if (context.inputs.trackProgress && isEntityContext(context)) {
    if (
      isPullRequestEvent(context) ||
      isIssuesEvent(context) ||
      isIssueCommentEvent(context) ||
      isPullRequestReviewCommentEvent(context) ||
      isPullRequestReviewEvent(context)
    ) {
      return "tag";
    }
  }

  // Comment events (current behavior - unchanged)
  if (isEntityContext(context)) {
    if (
      isIssueCommentEvent(context) ||
      isPullRequestReviewCommentEvent(context) ||
      isPullRequestReviewEvent(context)
    ) {
      // If prompt is provided on comment events, use agent mode
      if (context.inputs.prompt) {
        return "agent";
      }
      // Default to tag mode if @claude mention found
      if (checkContainsTrigger(context)) {
        return "tag";
      }
    }
  }

  // Issue events
  if (isEntityContext(context) && isIssuesEvent(context)) {
    // If prompt is provided, use agent mode (same as PR events)
    if (context.inputs.prompt) {
      return "agent";
    }
    // Check for @claude mentions or labels/assignees
    if (checkContainsTrigger(context)) {
      return "tag";
    }
  }

  // PR events (opened, synchronize, etc.)
  if (isEntityContext(context) && isPullRequestEvent(context)) {
    const supportedActions = [
      "opened",
      "synchronize",
      "ready_for_review",
      "reopened",
    ];
    if (context.eventAction && supportedActions.includes(context.eventAction)) {
      // If prompt is provided, use agent mode (default for automation)
      if (context.inputs.prompt) {
        return "agent";
      }
    }
  }

  // Default to agent mode (which won't trigger without a prompt)
  return "agent";
}

function validateTrackProgressEvent(context: GitHubContext): void {
  // track_progress is only valid for pull_request and issue events
  const validEvents = [
    "pull_request",
    "issues",
    "issue_comment",
    "pull_request_review_comment",
    "pull_request_review",
  ];
  if (!validEvents.includes(context.eventName)) {
    throw new Error(
      `track_progress is only supported for events: ${validEvents.join(", ")}. ` +
        `Current event: ${context.eventName}`,
    );
  }

  // Additionally validate PR actions
  if (context.eventName === "pull_request" && context.eventAction) {
    const validActions = [
      "opened",
      "synchronize",
      "ready_for_review",
      "reopened",
    ];
    if (!validActions.includes(context.eventAction)) {
      throw new Error(
        `track_progress for pull_request events is only supported for actions: ` +
          `${validActions.join(", ")}. Current action: ${context.eventAction}`,
      );
    }
  }
}
