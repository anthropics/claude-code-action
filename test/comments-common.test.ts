import { describe, test, expect } from "bun:test";
import {
  SPINNER_HTML,
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "../src/github/operations/comments/common";
import { GITHUB_SERVER_URL } from "../src/github/api/config";

describe("comments/common", () => {
  describe("createJobRunLink", () => {
    test.each([
      ["", "/actions/runs/42"],
      ["1", "/actions/runs/42/attempts/1"],
      ["2", "/actions/runs/42/attempts/2"],
    ])("builds a markdown link for run attempt %j", (attempt, path) => {
      const originalAttempt = process.env.GITHUB_RUN_ATTEMPT;
      try {
        if (attempt) process.env.GITHUB_RUN_ATTEMPT = attempt;
        else delete process.env.GITHUB_RUN_ATTEMPT;

        expect(createJobRunLink("anthropics", "claude-code-action", "42")).toBe(
          `[View job run](${GITHUB_SERVER_URL}/anthropics/claude-code-action${path})`,
        );
      } finally {
        if (originalAttempt === undefined)
          delete process.env.GITHUB_RUN_ATTEMPT;
        else process.env.GITHUB_RUN_ATTEMPT = originalAttempt;
      }
    });

    test("honors GITHUB_SERVER_URL (GHES) rather than hardcoding github.com", () => {
      // The link is built from the configured server URL, so it must point at
      // whatever GITHUB_SERVER_URL resolves to (github.com by default, a GHES
      // host in enterprise setups).
      expect(createJobRunLink("o", "r", "1")).toContain(GITHUB_SERVER_URL);
    });
  });

  describe("createBranchLink", () => {
    test("builds a leading-newline markdown link to the branch tree", () => {
      const result = createBranchLink(
        "anthropics",
        "claude-code-action",
        "feature/x",
      );
      expect(result).toBe(
        `\n[View branch](${GITHUB_SERVER_URL}/anthropics/claude-code-action/tree/feature/x)`,
      );
    });

    test("encodes URL-significant characters in a branch name", () => {
      expect(createBranchLink("o", "r", "claude/fix#123")).toBe(
        `\n[View branch](${GITHUB_SERVER_URL}/o/r/tree/claude/fix%23123)`,
      );
    });

    test("prefixes the link with a newline so it renders on its own line", () => {
      expect(createBranchLink("o", "r", "main").startsWith("\n")).toBe(true);
    });
  });

  describe("createCommentBody", () => {
    test("includes the spinner, the working message, and the job run link", () => {
      const jobRunLink = createJobRunLink("o", "r", "7");
      const body = createCommentBody(jobRunLink);

      expect(body).toContain(SPINNER_HTML);
      expect(body).toContain("Claude Code is working…");
      expect(body).toContain(jobRunLink);
    });

    test("omits the branch link when none is provided (defaults to empty)", () => {
      const body = createCommentBody(createJobRunLink("o", "r", "7"));
      expect(body).not.toContain("View branch");
      // No trailing branch content: body ends with the job run link.
      expect(body.endsWith(")")).toBe(true);
    });

    test("appends the branch link when provided", () => {
      const jobRunLink = createJobRunLink("o", "r", "7");
      const branchLink = createBranchLink("o", "r", "feature/x");
      const body = createCommentBody(jobRunLink, branchLink);

      expect(body).toContain(jobRunLink);
      expect(body).toContain(branchLink);
      // The branch link (with its leading newline) comes after the job run link.
      expect(body.indexOf(branchLink)).toBeGreaterThan(
        body.indexOf(jobRunLink),
      );
    });
  });
});
