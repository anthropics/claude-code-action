import { describe, expect, test } from "bun:test";
import {
  SPINNER_HTML,
  createJobRunLink,
  createBranchLink,
  createCommentBody,
} from "../src/github/operations/comments/common";

describe("SPINNER_HTML", () => {
  test("is an inline img tag with fixed size", () => {
    expect(SPINNER_HTML).toStartWith("<img src=");
    expect(SPINNER_HTML).toContain('width="14px"');
    expect(SPINNER_HTML).toContain('height="14px"');
  });
});

describe("createJobRunLink", () => {
  test("builds a markdown link to the actions run", () => {
    const link = createJobRunLink("test-owner", "test-repo", "1234567890");

    expect(link).toBe(
      "[View job run](https://github.com/test-owner/test-repo/actions/runs/1234567890)",
    );
  });
});

describe("createBranchLink", () => {
  test("builds a markdown link to the branch on a new line", () => {
    const link = createBranchLink("test-owner", "test-repo", "claude/issue-42");

    expect(link).toBe(
      "\n[View branch](https://github.com/test-owner/test-repo/tree/claude/issue-42)",
    );
  });

  test("keeps the branch name verbatim in the URL", () => {
    const link = createBranchLink("o", "r", "feature/nested/branch-name");

    expect(link).toContain("/tree/feature/nested/branch-name)");
  });
});

describe("createCommentBody", () => {
  const jobRunLink = "[View job run](https://github.com/o/r/actions/runs/1)";

  test("includes the working message, spinner and job run link", () => {
    const body = createCommentBody(jobRunLink);

    expect(body).toStartWith(`Claude Code is working… ${SPINNER_HTML}`);
    expect(body).toContain("I'll analyze this and get back to you.");
    expect(body).toEndWith(jobRunLink);
  });

  test("branch link defaults to an empty string when omitted", () => {
    const withoutBranch = createCommentBody(jobRunLink);
    const withEmptyBranch = createCommentBody(jobRunLink, "");

    expect(withoutBranch).toBe(withEmptyBranch);
  });

  test("appends the branch link right after the job run link", () => {
    const branchLink = "\n[View branch](https://github.com/o/r/tree/b)";

    const body = createCommentBody(jobRunLink, branchLink);

    expect(body).toEndWith(`${jobRunLink}${branchLink}`);
  });
});
