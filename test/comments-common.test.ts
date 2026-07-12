import { describe, test, expect } from "bun:test";
import {
  SPINNER_HTML,
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "../src/github/operations/comments/common";
import { GITHUB_SERVER_URL } from "../src/github/api/config";

// The tag-mode tracking comment users see on every run. Pure string builders,
// so pin the exact markdown/link shapes (built off GITHUB_SERVER_URL so they
// stay correct on GHES too).
describe("comment builders", () => {
  test("createJobRunLink points at the Actions run", () => {
    expect(createJobRunLink("acme", "widgets", "42")).toBe(
      `[View job run](${GITHUB_SERVER_URL}/acme/widgets/actions/runs/42)`,
    );
  });

  test("createBranchLink points at the branch tree, prefixed with a newline", () => {
    const link = createBranchLink("acme", "widgets", "claude/issue-1");
    expect(link).toBe(
      `\n[View branch](${GITHUB_SERVER_URL}/acme/widgets/tree/claude/issue-1)`,
    );
    expect(link.startsWith("\n")).toBe(true);
  });

  test("createCommentBody includes the working message, spinner, and job link", () => {
    const jobLink = createJobRunLink("acme", "widgets", "42");
    const body = createCommentBody(jobLink);
    expect(body).toContain("Claude Code is working");
    expect(body).toContain(SPINNER_HTML);
    expect(body).toContain(jobLink);
  });

  test("createCommentBody omits the branch link by default", () => {
    const body = createCommentBody(createJobRunLink("acme", "widgets", "42"));
    expect(body).not.toContain("View branch");
  });

  test("createCommentBody appends the branch link when provided", () => {
    const jobLink = createJobRunLink("acme", "widgets", "42");
    const branchLink = createBranchLink("acme", "widgets", "claude/issue-1");
    const body = createCommentBody(jobLink, branchLink);
    expect(body).toContain(jobLink);
    expect(body).toContain(branchLink);
    expect(body.indexOf(branchLink)).toBeGreaterThan(body.indexOf(jobLink));
  });
});
