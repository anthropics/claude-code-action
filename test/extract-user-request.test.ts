import { describe, test, expect } from "bun:test";
import {
  extractUserRequest,
  extractUserRequestFromEvent,
} from "../src/utils/extract-user-request";

describe("extractUserRequest", () => {
  test("extracts text after @claude trigger", () => {
    expect(extractUserRequest("@claude /review-pr", "@claude")).toBe(
      "/review-pr",
    );
  });

  test("extracts slash command with arguments", () => {
    expect(
      extractUserRequest(
        "@claude /review-pr please check the auth module",
        "@claude",
      ),
    ).toBe("/review-pr please check the auth module");
  });

  test("handles trigger phrase with extra whitespace", () => {
    expect(extractUserRequest("@claude    /review-pr", "@claude")).toBe(
      "/review-pr",
    );
  });

  test("handles trigger phrase at start of multiline comment", () => {
    const comment = `@claude /review-pr
Please review this PR carefully.
Focus on security issues.`;
    expect(extractUserRequest(comment, "@claude")).toBe(
      `/review-pr
Please review this PR carefully.
Focus on security issues.`,
    );
  });

  test("handles trigger phrase in middle of text", () => {
    expect(
      extractUserRequest("Hey team, @claude can you review this?", "@claude"),
    ).toBe("can you review this?");
  });

  test("returns null for empty comment body", () => {
    expect(extractUserRequest("", "@claude")).toBeNull();
  });

  test("returns null for undefined comment body", () => {
    expect(extractUserRequest(undefined, "@claude")).toBeNull();
  });

  test("returns null when trigger phrase not found", () => {
    expect(extractUserRequest("Please review this PR", "@claude")).toBeNull();
  });

  test("returns null when only trigger phrase with no request", () => {
    expect(extractUserRequest("@claude", "@claude")).toBeNull();
  });

  test("handles custom trigger phrase", () => {
    expect(extractUserRequest("/claude help me", "/claude")).toBe("help me");
  });

  test("handles trigger phrase with special regex characters", () => {
    expect(
      extractUserRequest("@claude[bot] do something", "@claude[bot]"),
    ).toBe("do something");
  });

  test("is case insensitive", () => {
    expect(extractUserRequest("@CLAUDE /review-pr", "@claude")).toBe(
      "/review-pr",
    );
    expect(extractUserRequest("@Claude /review-pr", "@claude")).toBe(
      "/review-pr",
    );
  });
});

describe("extractUserRequestFromEvent", () => {
  test("extracts from issue_comment event", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "issue_comment",
        commentBody: "@claude /review-pr",
      },
      "@claude",
    );
    expect(result).toBe("/review-pr");
  });

  test("extracts from pull_request_review_comment event", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "pull_request_review_comment",
        commentBody: "@claude fix this bug",
      },
      "@claude",
    );
    expect(result).toBe("fix this bug");
  });

  test("extracts from pull_request_review event", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "pull_request_review",
        commentBody: "@claude looks good but add tests",
      },
      "@claude",
    );
    expect(result).toBe("looks good but add tests");
  });

  test("extracts from issues event with body", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "issues",
        issueBody: "@claude please implement this feature",
      },
      "@claude",
    );
    expect(result).toBe("please implement this feature");
  });

  test("extracts from pull_request event with body", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "pull_request",
        prBody: "@claude review this PR",
      },
      "@claude",
    );
    expect(result).toBe("review this PR");
  });

  test("returns default message when no trigger found", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "issues",
        issueBody: "Please fix the login bug",
      },
      "@claude",
    );
    expect(result).toBe(
      "Please analyze the context and help with this request.",
    );
  });

  test("returns default message for assigned events without trigger", () => {
    const result = extractUserRequestFromEvent(
      {
        eventName: "issues",
      },
      "@claude",
    );
    expect(result).toBe(
      "Please analyze the context and help with this request.",
    );
  });
});
