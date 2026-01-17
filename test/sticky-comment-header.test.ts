import { describe, expect, test } from "bun:test";
import {
  createCommentBody,
  createStickyCommentHeader,
} from "../src/github/operations/comments/common";

describe("Sticky Comment Header Logic", () => {
  describe("createStickyCommentHeader", () => {
    test("generates correct header format for job ID", () => {
      const header = createStickyCommentHeader("claude-docs-review");
      expect(header).toBe("<!-- sticky-job: claude-docs-review -->");
    });

    test("generates correct header format for different job IDs", () => {
      const header1 = createStickyCommentHeader("security-review");
      const header2 = createStickyCommentHeader("code-review");
      expect(header1).toBe("<!-- sticky-job: security-review -->");
      expect(header2).toBe("<!-- sticky-job: code-review -->");
      expect(header1).not.toBe(header2);
    });
  });

  describe("createCommentBody", () => {
    test("includes sticky header when jobId is provided", () => {
      const body = createCommentBody(
        "http://example.com",
        "",
        "claude-security",
      );
      expect(body).toContain("<!-- sticky-job: claude-security -->");
      expect(body).toContain("Claude Code is working");
    });

    test("does not include header when jobId is empty", () => {
      const body = createCommentBody("http://example.com");
      expect(body).not.toContain("<!-- sticky-job:");
      expect(body).toContain("Claude Code is working");
    });

    test("does not include header when jobId is explicitly empty string", () => {
      const body = createCommentBody("http://example.com", "", "");
      expect(body).not.toContain("<!-- sticky-job:");
      expect(body).toContain("Claude Code is working");
    });

    test("generates distinct bodies for different job IDs", () => {
      const body1 = createCommentBody("link", "", "job1");
      const body2 = createCommentBody("link", "", "job2");
      expect(body1).not.toBe(body2);
      expect(body1).toContain("<!-- sticky-job: job1 -->");
      expect(body2).toContain("<!-- sticky-job: job2 -->");
    });

    test("header appears at the start of the comment body", () => {
      const body = createCommentBody("http://example.com", "", "my-job");
      expect(body.startsWith("<!-- sticky-job: my-job -->\n")).toBe(true);
    });

    test("includes branch link when provided", () => {
      const body = createCommentBody(
        "http://job.link",
        "\n[View branch](http://branch.link)",
        "my-job",
      );
      expect(body).toContain("<!-- sticky-job: my-job -->");
      expect(body).toContain("[View branch](http://branch.link)");
      expect(body).toContain("http://job.link");
    });
  });

  describe("comment matching scenarios", () => {
    test("different workflows with same bot produce different headers", () => {
      // Simulating two different GitHub Actions jobs
      const docsReviewHeader = createStickyCommentHeader("claude-docs-review");
      const securityReviewHeader =
        createStickyCommentHeader("claude-security-review");

      expect(docsReviewHeader).not.toBe(securityReviewHeader);

      // A comment from docs-review should not match security-review's header
      const docsComment = `${docsReviewHeader}\nClaude Code is working...`;
      expect(docsComment.includes(securityReviewHeader)).toBe(false);
      expect(docsComment.includes(docsReviewHeader)).toBe(true);
    });

    test("same job ID produces matching headers", () => {
      const header1 = createStickyCommentHeader("my-workflow-job");
      const header2 = createStickyCommentHeader("my-workflow-job");
      expect(header1).toBe(header2);

      const comment = `${header1}\nSome content`;
      expect(comment.includes(header2)).toBe(true);
    });
  });
});
