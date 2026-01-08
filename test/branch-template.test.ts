#!/usr/bin/env bun

import { describe, it, expect } from "bun:test";
import {
  applyBranchTemplate,
  generateBranchName,
} from "../src/utils/branch-template";

describe("branch template utilities", () => {
  describe("applyBranchTemplate", () => {
    it("should replace all template variables", () => {
      const template =
        "{{prefix}}{{entityType}}-{{entityNumber}}-{{timestamp}}";
      const variables = {
        prefix: "feat/",
        entityType: "issue",
        entityNumber: 123,
        timestamp: "20240301-1430",
        sha: "abcd1234",
      };

      const result = applyBranchTemplate(template, variables);
      expect(result).toBe("feat/issue-123-20240301-1430");
    });

    it("should handle custom templates with multiple variables", () => {
      const template =
        "{{prefix}}fix/{{entityType}}_{{entityNumber}}_{{timestamp}}_{{sha}}";
      const variables = {
        prefix: "claude-",
        entityType: "pr",
        entityNumber: 456,
        timestamp: "20240301-1430",
        sha: "abcd1234",
      };

      const result = applyBranchTemplate(template, variables);
      expect(result).toBe("claude-fix/pr_456_20240301-1430_abcd1234");
    });

    it("should handle templates with missing variables gracefully", () => {
      const template = "{{prefix}}{{entityType}}-{{missing}}-{{entityNumber}}";
      const variables = {
        prefix: "feat/",
        entityType: "issue",
        entityNumber: 123,
        timestamp: "20240301-1430",
      };

      const result = applyBranchTemplate(template, variables);
      expect(result).toBe("feat/issue-{{missing}}-123");
    });
  });

  describe("generateBranchName", () => {
    it("should use custom template when provided", () => {
      const template = "{{prefix}}custom-{{entityType}}_{{entityNumber}}";
      const result = generateBranchName(template, "feature/", "issue", 123);

      expect(result).toBe("feature/custom-issue_123");
    });

    it("should use default format when template is empty", () => {
      const result = generateBranchName("", "claude/", "issue", 123);

      expect(result).toMatch(/^claude\/issue-123-\d{8}-\d{4}$/);
    });

    it("should use default format when template is undefined", () => {
      const result = generateBranchName(undefined, "claude/", "pr", 456);

      expect(result).toMatch(/^claude\/pr-456-\d{8}-\d{4}$/);
    });

    it("should preserve custom template formatting (no automatic lowercase/truncation)", () => {
      const template = "{{prefix}}UPPERCASE_Branch-Name_{{entityNumber}}";
      const result = generateBranchName(template, "Feature/", "issue", 123);

      expect(result).toBe("Feature/UPPERCASE_Branch-Name_123");
    });

    it("should not truncate custom template results", () => {
      const template =
        "{{prefix}}very-long-branch-name-that-exceeds-the-maximum-allowed-length-{{entityNumber}}";
      const result = generateBranchName(template, "feature/", "issue", 123);

      expect(result).toBe(
        "feature/very-long-branch-name-that-exceeds-the-maximum-allowed-length-123",
      );
    });

    it("should apply Kubernetes-compatible transformations to default template only", () => {
      const result = generateBranchName(undefined, "Feature/", "issue", 123);

      expect(result).toMatch(/^feature\/issue-123-\d{8}-\d{4}$/);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should handle SHA in template", () => {
      const template = "{{prefix}}{{entityType}}-{{entityNumber}}-{{sha}}";
      const result = generateBranchName(
        template,
        "fix/",
        "pr",
        789,
        "abcdef123456",
      );

      expect(result).toBe("fix/pr-789-abcdef12");
    });

    it("should use label in template when provided", () => {
      const template = "{{prefix}}{{label}}/{{entityNumber}}";
      const result = generateBranchName(
        template,
        "feature/",
        "issue",
        123,
        undefined,
        "bug",
      );

      expect(result).toBe("feature/bug/123");
    });

    it("should fallback to entityType when label template is used but no label provided", () => {
      const template = "{{prefix}}{{label}}-{{entityNumber}}";
      const result = generateBranchName(template, "fix/", "pr", 456);

      expect(result).toBe("fix/pr-456");
    });

    it("should handle template with both label and entityType", () => {
      const template = "{{prefix}}{{label}}-{{entityType}}_{{entityNumber}}";
      const result = generateBranchName(
        template,
        "dev/",
        "issue",
        789,
        undefined,
        "enhancement",
      );

      expect(result).toBe("dev/enhancement-issue_789");
    });

    it("should use description in template when provided", () => {
      const template = "{{prefix}}{{description}}/{{entityNumber}}";
      const result = generateBranchName(
        template,
        "feature/",
        "issue",
        123,
        undefined,
        undefined,
        "Fix login bug with OAuth",
      );

      expect(result).toBe("feature/fix-login-bug-with-oauth/123");
    });

    it("should handle template with multiple variables including description", () => {
      const template =
        "{{prefix}}{{label}}/{{description}}-{{entityType}}_{{entityNumber}}";
      const result = generateBranchName(
        template,
        "dev/",
        "issue",
        456,
        undefined,
        "bug",
        "User authentication fails completely",
      );

      expect(result).toBe(
        "dev/bug/user-authentication-fails-completely-issue_456",
      );
    });

    it("should handle description with special characters in template", () => {
      const template = "{{prefix}}{{description}}-{{entityNumber}}";
      const result = generateBranchName(
        template,
        "fix/",
        "pr",
        789,
        undefined,
        undefined,
        "Add: User Registration & Email Validation",
      );

      expect(result).toBe("fix/add-user-registration-email-789");
    });

    it("should truncate descriptions to exactly 5 words", () => {
      const result = generateBranchName(
        "{{prefix}}{{description}}/{{entityNumber}}",
        "feature/",
        "issue",
        999,
        undefined,
        undefined,
        "This is a very long title with many more than five words in it",
      );
      expect(result).toBe("feature/this-is-a-very-long/999");
    });

    it("should handle empty description in template", () => {
      const template = "{{prefix}}{{description}}-{{entityNumber}}";
      const result = generateBranchName(
        template,
        "test/",
        "issue",
        101,
        undefined,
        undefined,
        "",
      );

      expect(result).toBe("test/-101");
    });

    it("should fallback to default format when template produces empty result", () => {
      const template = "{{description}}"; // Will be empty if no title provided
      const result = generateBranchName(template, "claude/", "issue", 123);

      expect(result).toMatch(/^claude\/issue-123-\d{8}-\d{4}$/);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it("should fallback to default format when template produces only whitespace", () => {
      const template = "  {{description}}  "; // Will be "  " if description is empty
      const result = generateBranchName(
        template,
        "fix/",
        "pr",
        456,
        undefined,
        undefined,
        "",
      );

      expect(result).toMatch(/^fix\/pr-456-\d{8}-\d{4}$/);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });
});
