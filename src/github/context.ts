import * as github from "@actions/github";
import type {
  IssuesEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
} from "@octokit/webhooks-types";

export type ParsedGitHubContext = {
  runId: string;
  eventName: string;
  eventAction?: string;
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  actor: string;
  payload:
    | IssuesEvent
    | IssueCommentEvent
    | PullRequestEvent
    | PullRequestReviewEvent
    | PullRequestReviewCommentEvent;
  entityNumber: number;
  isPR: boolean;
  inputs: {
    triggerPhrase: string;
    assigneeTrigger: string;
    allowedTools: string[];
    disallowedTools: string[];
    customInstructions: string;
    directPrompt: string;
    baseBranch?: string;
  };
};

export function parseGitHubContext(): ParsedGitHubContext {
  const context = github.context;

  const commonFields = {
    runId: process.env.GITHUB_RUN_ID!,
    eventName: context.eventName,
    eventAction: context.payload.action,
    repository: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      full_name: `${context.repo.owner}/${context.repo.repo}`,
    },
    actor: context.actor,
    inputs: {
      triggerPhrase: process.env.TRIGGER_PHRASE ?? "@claude",
      assigneeTrigger: process.env.ASSIGNEE_TRIGGER ?? "",
      allowedTools: (process.env.ALLOWED_TOOLS ?? "")
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0),
      disallowedTools: (process.env.DISALLOWED_TOOLS ?? "")
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0),
      customInstructions: process.env.CUSTOM_INSTRUCTIONS ?? "",
      directPrompt: process.env.DIRECT_PROMPT ?? "",
      baseBranch: process.env.BASE_BRANCH,
    },
  };

  switch (context.eventName) {
    case "issues": {
      return {
        ...commonFields,
        payload: context.payload as IssuesEvent,
        entityNumber: (context.payload as IssuesEvent).issue.number,
        isPR: false,
      };
    }
    case "issue_comment": {
      return {
        ...commonFields,
        payload: context.payload as IssueCommentEvent,
        entityNumber: (context.payload as IssueCommentEvent).issue.number,
        isPR: Boolean(
          (context.payload as IssueCommentEvent).issue.pull_request,
        ),
      };
    }
    case "pull_request": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestEvent,
        entityNumber: (context.payload as PullRequestEvent).pull_request.number,
        isPR: true,
      };
    }
    case "pull_request_review": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewEvent,
        entityNumber: (context.payload as PullRequestReviewEvent).pull_request
          .number,
        isPR: true,
      };
    }
    case "pull_request_review_comment": {
      return {
        ...commonFields,
        payload: context.payload as PullRequestReviewCommentEvent,
        entityNumber: (context.payload as PullRequestReviewCommentEvent)
          .pull_request.number,
        isPR: true,
      };
    }
    default:
      throw new Error(`Unsupported event type: ${context.eventName}`);
  }
}

export function isIssuesEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssuesEvent } {
  return context.eventName === "issues";
}

export function isIssueCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: IssueCommentEvent } {
  return context.eventName === "issue_comment";
}

export function isPullRequestEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestEvent } {
  return context.eventName === "pull_request";
}

export function isPullRequestReviewEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewEvent } {
  return context.eventName === "pull_request_review";
}

export function isPullRequestReviewCommentEvent(
  context: ParsedGitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewCommentEvent } {
  return context.eventName === "pull_request_review_comment";
}
