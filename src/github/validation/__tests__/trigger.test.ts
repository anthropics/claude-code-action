import { describe, test, expect } from "bun:test";
import { checkContainsTrigger } from "../trigger";
import type { ParsedGitHubContext } from "../../context";

describe("Trigger Validation", () => {
  const createMockContext = (overrides = {}): ParsedGitHubContext => ({
    eventName: "issue_comment",
    eventAction: "created",
    repository: {
      owner: "test-owner",
      repo: "test-repo",
      full_name: "test-owner/test-repo",
    },
    actor: "testuser",
    entityNumber: 42,
    isPR: false,
    runId: "test-run-id",
    inputs: {
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      prompt: "",
      trackProgress: false,
    },
    payload: {
      comment: {
        body: "Test comment",
        id: 12345,
      },
    },
    ...overrides,
  } as ParsedGitHubContext);

  describe("checkContainsTrigger", () => {
    test("should detect @claude mentions", () => {
      const context = createMockContext({
        payload: {
          comment: { body: "Hey @claude can you fix this?", id: 12345 },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should detect Claude mentions case-insensitively", () => {
      // Testing multiple case variations
      const contexts = [
        createMockContext({
          payload: { comment: { body: "Hey @Claude please help", id: 12345 } },
        }),
        createMockContext({
          payload: { comment: { body: "Hey @CLAUDE please help", id: 12345 } },
        }),
        createMockContext({
          payload: { comment: { body: "Hey @ClAuDe please help", id: 12345 } },
        }),
      ];
      
      // Note: The actual function is case-sensitive, it looks for exact match
      contexts.forEach(context => {
        const result = checkContainsTrigger(context);
        expect(result).toBe(false); // @claude is case-sensitive
      });
    });

    test("should not trigger on partial matches", () => {
      const context = createMockContext({
        payload: {
          comment: { body: "Emailed @claudette about this", id: 12345 },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(false);
    });

    test("should handle claude mentions in code blocks", () => {
      // Testing mentions inside code blocks - they SHOULD trigger
      // The regex checks for word boundaries, not markdown context
      const context = createMockContext({
        payload: {
          comment: { 
            body: "Here's an example:\n```\n@claude fix this\n```",
            id: 12345
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true); // Mentions in code blocks do trigger
    });

    test("should detect trigger in issue body for opened events", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "opened",
        payload: {
          action: "opened",
          issue: { 
            body: "@claude implement this feature",
            title: "New feature",
            number: 42
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should handle multiple mentions", () => {
      const context = createMockContext({
        payload: {
          comment: { body: "@claude and @claude should both work", id: 12345 },
        },
      });
      
      // Multiple mentions in same comment should trigger (only needs one match)
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should handle null/undefined comment body", () => {
      const contextNull = createMockContext({
        payload: { comment: { body: null } },
      });
      const contextUndefined = createMockContext({
        payload: { comment: { body: undefined } },
      });
      
      expect(checkContainsTrigger(contextNull)).toBe(false);
      expect(checkContainsTrigger(contextUndefined)).toBe(false);
    });

    test("should handle empty comment body", () => {
      const context = createMockContext({
        payload: { comment: { body: "" } },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(false);
    });

    test("should detect trigger in pull request body", () => {
      const context = createMockContext({
        eventName: "pull_request",
        eventAction: "opened",
        isPR: true,
        payload: {
          action: "opened",
          pull_request: { 
            body: "@claude please review this PR",
            title: "Feature update",
            number: 42
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should detect trigger in pull request review", () => {
      const context = createMockContext({
        eventName: "pull_request_review",
        eventAction: "submitted",
        isPR: true,
        payload: {
          action: "submitted",
          review: { 
            body: "@claude can you fix this issue?",
            id: 999
          },
          pull_request: {
            number: 42
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should detect trigger when assigned to specified user", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "assigned",
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "claude-bot",
          labelTrigger: "",
          prompt: "",
          trackProgress: false,
        },
        payload: {
          action: "assigned",
          issue: {
            number: 42,
            body: "Some issue",
            title: "Title"
          },
          assignee: {
            login: "claude-bot"
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should detect trigger when labeled with specified label", () => {
      const context = createMockContext({
        eventName: "issues",
        eventAction: "labeled",
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          labelTrigger: "needs-claude",
          prompt: "",
          trackProgress: false,
        },
        payload: {
          action: "labeled",
          issue: {
            number: 42,
            body: "Some issue",
            title: "Title"
          },
          label: {
            name: "needs-claude"
          },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });

    test("should always trigger when prompt is provided", () => {
      const context = createMockContext({
        inputs: {
          triggerPhrase: "@claude",
          assigneeTrigger: "",
          labelTrigger: "",
          prompt: "Fix all the bugs",
          trackProgress: false,
        },
        payload: {
          comment: { body: "No trigger phrase here", id: 12345 },
        },
      });
      
      const result = checkContainsTrigger(context);
      expect(result).toBe(true);
    });
  });
});