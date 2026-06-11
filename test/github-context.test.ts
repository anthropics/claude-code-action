import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  IssuesEvent,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewEvent,
  PullRequestReviewCommentEvent,
  WorkflowRunEvent,
} from "@octokit/webhooks-types";

// parseGitHubContext() reads the singleton `github.context` from
// @actions/github, so the module is mocked with a mutable context object
// that each test configures. Nothing else in the codebase imports
// @actions/github, so the mock does not leak into other suites.
const fakeGithubContext = {
  eventName: "",
  payload: {} as Record<string, unknown>,
  repo: { owner: "test-owner", repo: "test-repo" },
  actor: "test-actor",
};

mock.module("@actions/github", () => ({
  context: fakeGithubContext,
}));

import {
  parseGitHubContext,
  isIssuesEvent,
  isIssueCommentEvent,
  isPullRequestEvent,
  isPullRequestReviewEvent,
  isPullRequestReviewCommentEvent,
  isIssuesAssignedEvent,
  isEntityContext,
  isAutomationContext,
} from "../src/github/context";
import { CLAUDE_APP_BOT_ID, CLAUDE_BOT_LOGIN } from "../src/github/constants";
import { createMockContext, createMockAutomationContext } from "./mockContext";

const ENV_KEYS = [
  "GITHUB_RUN_ID",
  "PROMPT",
  "TRIGGER_PHRASE",
  "ASSIGNEE_TRIGGER",
  "LABEL_TRIGGER",
  "BASE_BRANCH",
  "BRANCH_PREFIX",
  "BRANCH_NAME_TEMPLATE",
  "USE_STICKY_COMMENT",
  "CLASSIFY_INLINE_COMMENTS",
  "USE_COMMIT_SIGNING",
  "SSH_SIGNING_KEY",
  "BOT_ID",
  "BOT_NAME",
  "ALLOWED_BOTS",
  "ALLOWED_NON_WRITE_USERS",
  "TRACK_PROGRESS",
  "INCLUDE_FIX_LINKS",
  "INCLUDE_COMMENTS_BY_ACTOR",
  "EXCLUDE_COMMENTS_BY_ACTOR",
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.GITHUB_RUN_ID = "9876543210";

  fakeGithubContext.eventName = "";
  fakeGithubContext.payload = {};
  fakeGithubContext.repo = { owner: "test-owner", repo: "test-repo" };
  fakeGithubContext.actor = "test-actor";
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

const repositoryPayload = {
  name: "test-repo",
  full_name: "test-owner/test-repo",
  private: false,
  default_branch: "main",
  owner: { login: "test-owner" },
};

function setEvent(eventName: string, payload: unknown) {
  fakeGithubContext.eventName = eventName;
  fakeGithubContext.payload = payload as Record<string, unknown>;
}

describe("parseGitHubContext", () => {
  describe("entity events (one test per equivalence partition)", () => {
    test("issues event extracts issue number and isPR false", () => {
      setEvent("issues", {
        action: "opened",
        issue: { number: 42 },
        repository: repositoryPayload,
      } as unknown as IssuesEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("issues");
      expect(context.eventAction).toBe("opened");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(42);
      expect(context.isPR).toBe(false);
    });

    test("issue_comment on a plain issue has isPR false", () => {
      setEvent("issue_comment", {
        action: "created",
        issue: { number: 55 },
        comment: { id: 1, body: "hello" },
        repository: repositoryPayload,
      } as unknown as IssueCommentEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("issue_comment");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(55);
      expect(context.isPR).toBe(false);
    });

    test("issue_comment on a pull request has isPR true", () => {
      setEvent("issue_comment", {
        action: "created",
        issue: {
          number: 789,
          pull_request: {
            url: "https://api.github.com/repos/test-owner/test-repo/pulls/789",
          },
        },
        comment: { id: 2, body: "hello" },
        repository: repositoryPayload,
      } as unknown as IssueCommentEvent);

      const context = parseGitHubContext();

      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(789);
      expect(context.isPR).toBe(true);
    });

    test("pull_request event extracts PR number and isPR true", () => {
      setEvent("pull_request", {
        action: "opened",
        number: 456,
        pull_request: { number: 456 },
        repository: repositoryPayload,
      } as unknown as PullRequestEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("pull_request");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(456);
      expect(context.isPR).toBe(true);
    });

    test("pull_request_target is normalized to pull_request", () => {
      setEvent("pull_request_target", {
        action: "opened",
        number: 457,
        pull_request: { number: 457 },
        repository: repositoryPayload,
      } as unknown as PullRequestEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("pull_request");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(457);
      expect(context.isPR).toBe(true);
    });

    test("pull_request_review event extracts PR number and isPR true", () => {
      setEvent("pull_request_review", {
        action: "submitted",
        review: { id: 9, state: "approved" },
        pull_request: { number: 321 },
        repository: repositoryPayload,
      } as unknown as PullRequestReviewEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("pull_request_review");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(321);
      expect(context.isPR).toBe(true);
    });

    test("pull_request_review_comment event extracts PR number and isPR true", () => {
      setEvent("pull_request_review_comment", {
        action: "created",
        comment: { id: 7, body: "inline" },
        pull_request: { number: 999 },
        repository: repositoryPayload,
      } as unknown as PullRequestReviewCommentEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("pull_request_review_comment");
      if (!isEntityContext(context)) {
        throw new Error("expected entity context");
      }
      expect(context.entityNumber).toBe(999);
      expect(context.isPR).toBe(true);
    });
  });

  describe("automation events (no entityNumber, no isPR)", () => {
    test("workflow_dispatch produces an automation context", () => {
      setEvent("workflow_dispatch", {
        inputs: { task: "run" },
        repository: repositoryPayload,
        sender: { login: "test-actor" },
        workflow: "ci.yml",
      });

      const context = parseGitHubContext();

      expect(context.eventName).toBe("workflow_dispatch");
      expect(isAutomationContext(context)).toBe(true);
      expect("entityNumber" in context).toBe(false);
      expect("isPR" in context).toBe(false);
    });

    test("repository_dispatch produces an automation context", () => {
      setEvent("repository_dispatch", {
        action: "trigger-analysis",
        client_payload: { issue_number: 42 },
        repository: repositoryPayload,
        sender: { login: "automation-user" },
      });

      const context = parseGitHubContext();

      expect(context.eventName).toBe("repository_dispatch");
      expect(context.eventAction).toBe("trigger-analysis");
      expect(isAutomationContext(context)).toBe(true);
    });

    test("schedule produces an automation context", () => {
      setEvent("schedule", {
        schedule: "0 0 * * *",
        repository: repositoryPayload,
      });

      const context = parseGitHubContext();

      expect(context.eventName).toBe("schedule");
      expect(isAutomationContext(context)).toBe(true);
    });

    test("payload without repository keeps default_branch undefined", () => {
      setEvent("schedule", { schedule: "0 0 * * *" });

      const context = parseGitHubContext();

      expect(context.repository.default_branch).toBeUndefined();
    });

    test("workflow_run produces an automation context", () => {
      setEvent("workflow_run", {
        action: "completed",
        workflow_run: { id: 123 },
        repository: repositoryPayload,
      } as unknown as WorkflowRunEvent);

      const context = parseGitHubContext();

      expect(context.eventName).toBe("workflow_run");
      expect(isAutomationContext(context)).toBe(true);
    });
  });

  describe("invalid partition", () => {
    test("unsupported event type throws", () => {
      setEvent("deployment_status", { repository: repositoryPayload });

      expect(() => parseGitHubContext()).toThrow(
        "Unsupported event type: deployment_status",
      );
    });
  });

  describe("common fields", () => {
    test("repository and runId come from the action context", () => {
      setEvent("issues", {
        action: "opened",
        issue: { number: 1 },
        repository: repositoryPayload,
      } as unknown as IssuesEvent);

      const context = parseGitHubContext();

      expect(context.runId).toBe("9876543210");
      expect(context.actor).toBe("test-actor");
      expect(context.repository).toEqual({
        owner: "test-owner",
        repo: "test-repo",
        full_name: "test-owner/test-repo",
        default_branch: "main",
      });
    });

    test("inputs fall back to documented defaults when env vars are unset", () => {
      setEvent("issues", {
        action: "opened",
        issue: { number: 1 },
        repository: repositoryPayload,
      } as unknown as IssuesEvent);

      const { inputs } = parseGitHubContext();

      expect(inputs.prompt).toBe("");
      expect(inputs.triggerPhrase).toBe("@claude");
      expect(inputs.assigneeTrigger).toBe("");
      expect(inputs.labelTrigger).toBe("");
      expect(inputs.branchPrefix).toBe("claude/");
      expect(inputs.branchNameTemplate).toBeUndefined();
      expect(inputs.useStickyComment).toBe(false);
      expect(inputs.classifyInlineComments).toBe(true);
      expect(inputs.useCommitSigning).toBe(false);
      expect(inputs.sshSigningKey).toBe("");
      expect(inputs.botId).toBe(String(CLAUDE_APP_BOT_ID));
      expect(inputs.botName).toBe(CLAUDE_BOT_LOGIN);
      expect(inputs.allowedBots).toBe("");
      expect(inputs.allowedNonWriteUsers).toBe("");
      expect(inputs.trackProgress).toBe(false);
      expect(inputs.includeFixLinks).toBe(false);
      expect(inputs.includeCommentsByActor).toBe("");
      expect(inputs.excludeCommentsByActor).toBe("");
      expect(inputs.baseBranch).toBeUndefined();
    });

    test("inputs reflect the env vars set by action.yml", () => {
      process.env.PROMPT = "do something";
      process.env.TRIGGER_PHRASE = "/claude";
      process.env.ASSIGNEE_TRIGGER = "@claude-bot";
      process.env.LABEL_TRIGGER = "claude-task";
      process.env.BASE_BRANCH = "develop";
      process.env.BRANCH_PREFIX = "bot/";
      process.env.BRANCH_NAME_TEMPLATE = "{{description}}";
      process.env.USE_STICKY_COMMENT = "true";
      process.env.CLASSIFY_INLINE_COMMENTS = "false";
      process.env.USE_COMMIT_SIGNING = "true";
      process.env.SSH_SIGNING_KEY = "ssh-key-material";
      process.env.BOT_ID = "111";
      process.env.BOT_NAME = "custom-bot";
      process.env.ALLOWED_BOTS = "dependabot[bot]";
      process.env.ALLOWED_NON_WRITE_USERS = "trusted-user";
      process.env.TRACK_PROGRESS = "true";
      process.env.INCLUDE_FIX_LINKS = "true";
      process.env.INCLUDE_COMMENTS_BY_ACTOR = "alice";
      process.env.EXCLUDE_COMMENTS_BY_ACTOR = "bob";

      setEvent("issues", {
        action: "opened",
        issue: { number: 1 },
        repository: repositoryPayload,
      } as unknown as IssuesEvent);

      const { inputs } = parseGitHubContext();

      expect(inputs.prompt).toBe("do something");
      expect(inputs.triggerPhrase).toBe("/claude");
      expect(inputs.assigneeTrigger).toBe("@claude-bot");
      expect(inputs.labelTrigger).toBe("claude-task");
      expect(inputs.baseBranch).toBe("develop");
      expect(inputs.branchPrefix).toBe("bot/");
      expect(inputs.branchNameTemplate).toBe("{{description}}");
      expect(inputs.useStickyComment).toBe(true);
      expect(inputs.classifyInlineComments).toBe(false);
      expect(inputs.useCommitSigning).toBe(true);
      expect(inputs.sshSigningKey).toBe("ssh-key-material");
      expect(inputs.botId).toBe("111");
      expect(inputs.botName).toBe("custom-bot");
      expect(inputs.allowedBots).toBe("dependabot[bot]");
      expect(inputs.allowedNonWriteUsers).toBe("trusted-user");
      expect(inputs.trackProgress).toBe(true);
      expect(inputs.includeFixLinks).toBe(true);
      expect(inputs.includeCommentsByActor).toBe("alice");
      expect(inputs.excludeCommentsByActor).toBe("bob");
    });

    test("boolean inputs only accept the lowercase string true", () => {
      process.env.USE_STICKY_COMMENT = "TRUE";
      process.env.USE_COMMIT_SIGNING = "1";

      setEvent("issues", {
        action: "opened",
        issue: { number: 1 },
        repository: repositoryPayload,
      } as unknown as IssuesEvent);

      const { inputs } = parseGitHubContext();

      expect(inputs.useStickyComment).toBe(false);
      expect(inputs.useCommitSigning).toBe(false);
    });
  });
});

describe("type guards", () => {
  const issuesContext = createMockContext({ eventName: "issues" });
  const issueCommentContext = createMockContext({
    eventName: "issue_comment",
  });
  const pullRequestContext = createMockContext({ eventName: "pull_request" });
  const reviewContext = createMockContext({
    eventName: "pull_request_review",
  });
  const reviewCommentContext = createMockContext({
    eventName: "pull_request_review_comment",
  });
  const workflowDispatchContext = createMockAutomationContext({
    eventName: "workflow_dispatch",
  });

  test("isIssuesEvent accepts only issues events", () => {
    expect(isIssuesEvent(issuesContext)).toBe(true);
    expect(isIssuesEvent(issueCommentContext)).toBe(false);
    expect(isIssuesEvent(workflowDispatchContext)).toBe(false);
  });

  test("isIssueCommentEvent accepts only issue_comment events", () => {
    expect(isIssueCommentEvent(issueCommentContext)).toBe(true);
    expect(isIssueCommentEvent(issuesContext)).toBe(false);
  });

  test("isPullRequestEvent accepts only pull_request events", () => {
    expect(isPullRequestEvent(pullRequestContext)).toBe(true);
    expect(isPullRequestEvent(reviewContext)).toBe(false);
    expect(isPullRequestEvent(issuesContext)).toBe(false);
  });

  test("isPullRequestReviewEvent accepts only pull_request_review events", () => {
    expect(isPullRequestReviewEvent(reviewContext)).toBe(true);
    expect(isPullRequestReviewEvent(reviewCommentContext)).toBe(false);
  });

  test("isPullRequestReviewCommentEvent accepts only review comment events", () => {
    expect(isPullRequestReviewCommentEvent(reviewCommentContext)).toBe(true);
    expect(isPullRequestReviewCommentEvent(reviewContext)).toBe(false);
  });

  test("isIssuesAssignedEvent requires issues event with assigned action", () => {
    const assignedContext = createMockContext({
      eventName: "issues",
      eventAction: "assigned",
    });
    const openedContext = createMockContext({
      eventName: "issues",
      eventAction: "opened",
    });
    const assignedCommentContext = createMockContext({
      eventName: "issue_comment",
      eventAction: "assigned",
    });

    expect(isIssuesAssignedEvent(assignedContext)).toBe(true);
    expect(isIssuesAssignedEvent(openedContext)).toBe(false);
    expect(isIssuesAssignedEvent(assignedCommentContext)).toBe(false);
  });

  test("isEntityContext accepts the five entity events", () => {
    expect(isEntityContext(issuesContext)).toBe(true);
    expect(isEntityContext(issueCommentContext)).toBe(true);
    expect(isEntityContext(pullRequestContext)).toBe(true);
    expect(isEntityContext(reviewContext)).toBe(true);
    expect(isEntityContext(reviewCommentContext)).toBe(true);
    expect(isEntityContext(workflowDispatchContext)).toBe(false);
  });

  test("isAutomationContext accepts the four automation events", () => {
    expect(isAutomationContext(workflowDispatchContext)).toBe(true);
    expect(
      isAutomationContext(
        createMockAutomationContext({ eventName: "repository_dispatch" }),
      ),
    ).toBe(true);
    expect(
      isAutomationContext(
        createMockAutomationContext({ eventName: "schedule" }),
      ),
    ).toBe(true);
    expect(
      isAutomationContext(
        createMockAutomationContext({ eventName: "workflow_run" }),
      ),
    ).toBe(true);
    expect(isAutomationContext(issuesContext)).toBe(false);
  });
});
