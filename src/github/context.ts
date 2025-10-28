import * as github from "@actions/github";
import type {
  IssuesEvent,
  IssuesAssignedEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
  WorkflowRunEvent,
} from "@octokit/webhooks-types";
import { CLAUDE_APP_BOT_ID, CLAUDE_BOT_LOGIN } from "./constants";
// Custom types for GitHub Actions events that aren't webhooks
export type WorkflowDispatchEvent = {
  action?: never;
  inputs?: Record<string, any>;
  ref?: string;
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
  workflow: string;
};

export type RepositoryDispatchEvent = {
  action: string;
  client_payload?: Record<string, any>;
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
};

export type ScheduleEvent = {
  action?: never;
  schedule?: string;
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
};

// Event name constants for better maintainability
const ENTITY_EVENT_NAMES = [
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
] as const;

const AUTOMATION_EVENT_NAMES = [
  "workflow_dispatch",
  "repository_dispatch",
  "schedule",
  "workflow_run",
] as const;

// Derive types from constants for better maintainability
type EntityEventName = (typeof ENTITY_EVENT_NAMES)[number];
type AutomationEventName = (typeof AUTOMATION_EVENT_NAMES)[number];

// Common fields shared by all context types
type BaseContext = {
  runId: string;
  eventAction?: string;
  repository: {
    owner: string;
    repo: string;
    full_name: string;
  };
  actor: string;
  inputs: {
    prompt: string;
    triggerPhrase: string;
    assigneeTrigger: string;
    labelTrigger: string;
    baseBranch?: string;
    branchPrefix: string;
    useStickyComment: boolean;
    useCommitSigning: boolean;
    botId: string;
    botName: string;
    allowedBots: string;
    allowedNonWriteUsers: string;
    trackProgress: boolean;
  };
};

// Context for entity-based events (issues, PRs, comments)
export type ParsedGitHubContext = BaseContext & {
  eventName: EntityEventName;
  payload:
    | IssuesEvent
    | IssueCommentEvent
    | PullRequestEvent
    | PullRequestReviewEvent
    | PullRequestReviewCommentEvent;
  entityNumber: number;
  isPR: boolean;
};

// Context for automation events (workflow_dispatch, repository_dispatch, schedule, workflow_run)
export type AutomationContext = BaseContext & {
  eventName: AutomationEventName;
  payload:
    | WorkflowDispatchEvent
    | RepositoryDispatchEvent
    | ScheduleEvent
    | WorkflowRunEvent;
};

// Union type for all contexts
export type GitHubContext = ParsedGitHubContext | AutomationContext;

export function parseGitHubContext(): GitHubContext {
  const context = github.context;

  const commonFields = {
    runId: process.env.GITHUB_RUN_ID!,
    eventAction: context.payload.action,
    repository: {
      owner: context.repo.owner,
      repo: context.repo.repo,
      full_name: `${context.repo.owner}/${context.repo.repo}`,
    },
    actor: context.actor,
    inputs: {
      prompt: process.env.PROMPT || "",
      triggerPhrase: process.env.TRIGGER_PHRASE ?? "@claude",
      assigneeTrigger: process.env.ASSIGNEE_TRIGGER ?? "",
      labelTrigger: process.env.LABEL_TRIGGER ?? "",
      baseBranch: process.env.BASE_BRANCH,
      branchPrefix: process.env.BRANCH_PREFIX ?? "claude/",
      useStickyComment: process.env.USE_STICKY_COMMENT === "true",
      useCommitSigning: process.env.USE_COMMIT_SIGNING === "true",
      botId: process.env.BOT_ID ?? String(CLAUDE_APP_BOT_ID),
      botName: process.env.BOT_NAME ?? CLAUDE_BOT_LOGIN,
      allowedBots: process.env.ALLOWED_BOTS ?? "",
      allowedNonWriteUsers: process.env.ALLOWED_NON_WRITE_USERS ?? "",
      trackProgress: process.env.TRACK_PROGRESS === "true",
    },
  };

  switch (context.eventName) {
    case "issues": {
      const payload = context.payload as IssuesEvent;
      return {
        ...commonFields,
        eventName: "issues",
        payload,
        entityNumber: payload.issue.number,
        isPR: false,
      };
    }
    case "issue_comment": {
      const payload = context.payload as IssueCommentEvent;
      return {
        ...commonFields,
        eventName: "issue_comment",
        payload,
        entityNumber: payload.issue.number,
        isPR: Boolean(payload.issue.pull_request),
      };
    }
    case "pull_request":
    case "pull_request_target": {
      const payload = context.payload as PullRequestEvent;
      return {
        ...commonFields,
        eventName: "pull_request",
        payload,
        entityNumber: payload.pull_request.number,
        isPR: true,
      };
    }
    case "pull_request_review": {
      const payload = context.payload as PullRequestReviewEvent;
      return {
        ...commonFields,
        eventName: "pull_request_review",
        payload,
        entityNumber: payload.pull_request.number,
        isPR: true,
      };
    }
    case "pull_request_review_comment": {
      const payload = context.payload as PullRequestReviewCommentEvent;
      return {
        ...commonFields,
        eventName: "pull_request_review_comment",
        payload,
        entityNumber: payload.pull_request.number,
        isPR: true,
      };
    }
    case "workflow_dispatch": {
      return {
        ...commonFields,
        eventName: "workflow_dispatch",
        payload: context.payload as unknown as WorkflowDispatchEvent,
      };
    }
    case "repository_dispatch": {
      return {
        ...commonFields,
        eventName: "repository_dispatch",
        payload: context.payload as unknown as RepositoryDispatchEvent,
      };
    }
    case "schedule": {
      return {
        ...commonFields,
        eventName: "schedule",
        payload: context.payload as unknown as ScheduleEvent,
      };
    }
    case "workflow_run": {
      return {
        ...commonFields,
        eventName: "workflow_run",
        payload: context.payload as unknown as WorkflowRunEvent,
      };
    }
    default:
      throw new Error(`Unsupported event type: ${context.eventName}`);
  }
}

export function isIssuesEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: IssuesEvent } {
  return context.eventName === "issues";
}

export function isIssueCommentEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: IssueCommentEvent } {
  return context.eventName === "issue_comment";
}

export function isPullRequestEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestEvent } {
  return context.eventName === "pull_request";
}

export function isPullRequestReviewEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewEvent } {
  return context.eventName === "pull_request_review";
}

export function isPullRequestReviewCommentEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: PullRequestReviewCommentEvent } {
  return context.eventName === "pull_request_review_comment";
}

export function isIssuesAssignedEvent(
  context: GitHubContext,
): context is ParsedGitHubContext & { payload: IssuesAssignedEvent } {
  return isIssuesEvent(context) && context.eventAction === "assigned";
}

// Type guard to check if context is an entity context (has entityNumber and isPR)
export function isEntityContext(
  context: GitHubContext,
): context is ParsedGitHubContext {
  return ENTITY_EVENT_NAMES.includes(context.eventName as EntityEventName);
}

// Type guard to check if context is an automation context
export function isAutomationContext(
  context: GitHubContext,
): context is AutomationContext {
  return AUTOMATION_EVENT_NAMES.includes(
    context.eventName as AutomationEventName,
  );
}
