import { checkContainsTrigger } from "../src/github/validation/trigger";
import { describe, it, expect } from "bun:test";
import { createMockContext } from "./mockContext";
import type { IssueCommentEvent, IssuesEvent } from "@octokit/webhooks-types";

describe("Bot user trigger validation", () => {
  describe("issue comment from bot user", () => {
    it("should return true when bot user comments with trigger phrase", () => {
      const context = createMockContext({
        eventName: "issue_comment",
        eventAction: "created",
        actor: "dependabot[bot]",
        payload: {
          action: "created",
          comment: {
            id: 99999999,
            body: "@claude please review these dependency updates",
            user: {
              login: "dependabot[bot]",
              id: 49699333,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/in/29110",
              html_url: "https://github.com/apps/dependabot",
            },
            created_at: "2024-01-15T10:00:00Z",
            updated_at: "2024-01-15T10:00:00Z",
            html_url:
              "https://github.com/test-owner/test-repo/issues/100#issuecomment-99999999",
          },
          issue: {
            number: 100,
            title: "chore: bump dependencies",
            body: "Automated dependency update",
            user: {
              login: "dependabot[bot]",
              id: 49699333,
              type: "Bot",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssueCommentEvent,
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return true when GitHub Actions bot comments with trigger phrase", () => {
      const context = createMockContext({
        eventName: "issue_comment",
        eventAction: "created",
        actor: "github-actions[bot]",
        payload: {
          action: "created",
          comment: {
            id: 88888888,
            body: "/claude fix the failing tests",
            user: {
              login: "github-actions[bot]",
              id: 41898282,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/in/15368",
              html_url: "https://github.com/apps/github-actions",
            },
            created_at: "2024-01-15T11:00:00Z",
            updated_at: "2024-01-15T11:00:00Z",
            html_url:
              "https://github.com/test-owner/test-repo/pull/200#issuecomment-88888888",
          },
          issue: {
            number: 200,
            title: "fix: address test failures",
            body: "This PR fixes the failing tests",
            user: {
              login: "developer",
              id: 12345,
              type: "User",
            },
            pull_request: {
              url: "https://api.github.com/repos/test-owner/test-repo/pulls/200",
              html_url: "https://github.com/test-owner/test-repo/pull/200",
              diff_url: "https://github.com/test-owner/test-repo/pull/200.diff",
              patch_url:
                "https://github.com/test-owner/test-repo/pull/200.patch",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssueCommentEvent,
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });

    it("should return false when bot user comments without trigger phrase", () => {
      const context = createMockContext({
        eventName: "issue_comment",
        eventAction: "created",
        actor: "renovate[bot]",
        payload: {
          action: "created",
          comment: {
            id: 77777777,
            body: "This PR contains dependency updates",
            user: {
              login: "renovate[bot]",
              id: 29139614,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/in/2740",
              html_url: "https://github.com/apps/renovate",
            },
            created_at: "2024-01-15T12:00:00Z",
            updated_at: "2024-01-15T12:00:00Z",
            html_url:
              "https://github.com/test-owner/test-repo/pull/300#issuecomment-77777777",
          },
          issue: {
            number: 300,
            title: "chore(deps): update dependencies",
            body: "This PR updates dependencies",
            user: {
              login: "renovate[bot]",
              id: 29139614,
              type: "Bot",
            },
            pull_request: {
              url: "https://api.github.com/repos/test-owner/test-repo/pulls/300",
              html_url: "https://github.com/test-owner/test-repo/pull/300",
              diff_url: "https://github.com/test-owner/test-repo/pull/300.diff",
              patch_url:
                "https://github.com/test-owner/test-repo/pull/300.patch",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssueCommentEvent,
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(false);
    });
  });

  describe("issue opened by bot user", () => {
    it("should return true when bot creates issue with trigger phrase", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        actor: "release-bot",
        payload: {
          action: "opened",
          issue: {
            number: 400,
            title: "Release v2.0.0",
            body: "## Release Notes\n\n@claude please help generate comprehensive release notes for this version",
            assignee: null,
            created_at: "2024-01-15T13:00:00Z",
            updated_at: "2024-01-15T13:00:00Z",
            html_url: "https://github.com/test-owner/test-repo/issues/400",
            user: {
              login: "release-bot",
              id: 66666666,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/u/66666666",
              html_url: "https://github.com/release-bot",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssuesEvent,
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          directPrompt: "",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });
  });

  describe("assignee trigger with bot user", () => {
    it("should return true when issue is assigned to bot trigger user", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "assigned",
        actor: "automation-bot",
        payload: {
          action: "assigned",
          assignee: {
            login: "claude-assistant-bot",
            id: 55555555,
            type: "Bot",
            avatar_url: "https://avatars.githubusercontent.com/u/55555555",
            html_url: "https://github.com/claude-assistant-bot",
          },
          issue: {
            number: 500,
            title: "Automated task: Update documentation",
            body: "This is an automated task to update documentation",
            user: {
              login: "automation-bot",
              id: 44444444,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/u/44444444",
              html_url: "https://github.com/automation-bot",
            },
            assignee: {
              login: "claude-assistant-bot",
              id: 55555555,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/u/55555555",
              html_url: "https://github.com/claude-assistant-bot",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssuesEvent,
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "claude-assistant-bot",
          directPrompt: "",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });
  });

  describe("direct prompt with bot user", () => {
    it("should return true when bot provides direct prompt", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        actor: "ci-bot",
        payload: {
          action: "opened",
          issue: {
            number: 600,
            title: "CI failure report",
            body: "The CI pipeline has failed",
            assignee: null,
            created_at: "2024-01-15T14:00:00Z",
            updated_at: "2024-01-15T14:00:00Z",
            html_url: "https://github.com/test-owner/test-repo/issues/600",
            user: {
              login: "ci-bot",
              id: 33333333,
              type: "Bot",
              avatar_url: "https://avatars.githubusercontent.com/u/33333333",
              html_url: "https://github.com/ci-bot",
            },
          },
          repository: {
            name: "test-repo",
            full_name: "test-owner/test-repo",
            private: false,
            owner: {
              login: "test-owner",
            },
          },
        } as IssuesEvent,
        inputs: {
          triggerPhrase: "/claude",
          assigneeTrigger: "",
          directPrompt: "Analyze the CI failure and suggest fixes",
          allowedTools: [],
          disallowedTools: [],
          customInstructions: "",
        },
      });
      expect(checkContainsTrigger(context)).toBe(true);
    });
  });
});
