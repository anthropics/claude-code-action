import { describe, test, expect } from "bun:test";
import { extractUserRequest } from "../src/utils/extract-user-request";

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

  test("skips mid-token occurrences before the real trigger", () => {
    expect(
      extractUserRequest(
        "Email support@claude.dev and @claude fix the auth module",
        "@claude",
      ),
    ).toBe("fix the auth module");
  });

  test("skips occurrences followed by a word character", () => {
    expect(
      extractUserRequest("cc @claude-bob, @claude fix this", "@claude"),
    ).toBe("fix this");
  });

  test("returns null when the phrase only appears mid-token", () => {
    expect(
      extractUserRequest("Contact support@claude.dev for help", "@claude"),
    ).toBeNull();
  });

  test("accepts a trigger phrase at the start of a later line", () => {
    expect(
      extractUserRequest("Some context.\n@claude fix this", "@claude"),
    ).toBe("fix this");
  });
});
