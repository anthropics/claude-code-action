import { describe, expect, it } from "bun:test";
import { validateBranchName } from "../src/github/operations/branch";

describe("validateBranchName", () => {
  describe("valid branch names", () => {
    it("should accept simple alphanumeric names", () => {
      expect(() => validateBranchName("main")).not.toThrow();
      expect(() => validateBranchName("feature123")).not.toThrow();
      expect(() => validateBranchName("Branch1")).not.toThrow();
    });

    it("should accept names with hyphens", () => {
      expect(() => validateBranchName("feature-branch")).not.toThrow();
      expect(() => validateBranchName("fix-bug-123")).not.toThrow();
    });

    it("should accept names with underscores", () => {
      expect(() => validateBranchName("feature_branch")).not.toThrow();
      expect(() => validateBranchName("fix_bug_123")).not.toThrow();
    });

    it("should accept names with forward slashes", () => {
      expect(() => validateBranchName("feature/new-thing")).not.toThrow();
      expect(() => validateBranchName("user/feature/branch")).not.toThrow();
    });

    it("should accept names with periods", () => {
      expect(() => validateBranchName("v1.0.0")).not.toThrow();
      expect(() => validateBranchName("release.1.2.3")).not.toThrow();
    });

    it("should accept typical branch name formats", () => {
      expect(() =>
        validateBranchName("claude/issue-123-20250101-1234"),
      ).not.toThrow();
      expect(() => validateBranchName("refs/heads/main")).not.toThrow();
      expect(() => validateBranchName("bugfix/JIRA-1234")).not.toThrow();
    });
  });

  describe("command injection attempts", () => {
    it("should reject shell command substitution with $()", () => {
      expect(() => validateBranchName("$(whoami)")).toThrow();
      expect(() => validateBranchName("branch-$(rm -rf /)")).toThrow();
      expect(() => validateBranchName("test$(cat /etc/passwd)")).toThrow();
    });

    it("should reject shell command substitution with backticks", () => {
      expect(() => validateBranchName("`whoami`")).toThrow();
      expect(() => validateBranchName("branch-`rm -rf /`")).toThrow();
    });

    it("should reject command chaining with semicolons", () => {
      expect(() => validateBranchName("branch; rm -rf /")).toThrow();
      expect(() => validateBranchName("test;whoami")).toThrow();
    });

    it("should reject command chaining with &&", () => {
      expect(() => validateBranchName("branch && rm -rf /")).toThrow();
      expect(() => validateBranchName("test&&whoami")).toThrow();
    });

    it("should reject command chaining with ||", () => {
      expect(() => validateBranchName("branch || rm -rf /")).toThrow();
      expect(() => validateBranchName("test||whoami")).toThrow();
    });

    it("should reject pipe characters", () => {
      expect(() => validateBranchName("branch | cat")).toThrow();
      expect(() => validateBranchName("test|grep password")).toThrow();
    });

    it("should reject redirection operators", () => {
      expect(() => validateBranchName("branch > /etc/passwd")).toThrow();
      expect(() => validateBranchName("branch < input")).toThrow();
      expect(() => validateBranchName("branch >> file")).toThrow();
    });
  });

  describe("option injection attempts", () => {
    it("should reject branch names starting with dash", () => {
      expect(() => validateBranchName("-x")).toThrow(
        /cannot start with a dash/,
      );
      expect(() => validateBranchName("--help")).toThrow(
        /cannot start with a dash/,
      );
      expect(() => validateBranchName("-")).toThrow(/cannot start with a dash/);
      expect(() => validateBranchName("--version")).toThrow(
        /cannot start with a dash/,
      );
      expect(() => validateBranchName("-rf")).toThrow(
        /cannot start with a dash/,
      );
    });
  });

  describe("path traversal attempts", () => {
    it("should reject double dot sequences", () => {
      expect(() => validateBranchName("../../../etc")).toThrow();
      expect(() => validateBranchName("branch/../secret")).toThrow(/'\.\.'$/);
      expect(() => validateBranchName("a..b")).toThrow(/'\.\.'$/);
    });
  });

  describe("git-specific invalid patterns", () => {
    it("should reject @{ sequence", () => {
      expect(() => validateBranchName("branch@{1}")).toThrow(/@{/);
      expect(() => validateBranchName("HEAD@{yesterday}")).toThrow(/@{/);
    });

    it("should reject .lock suffix", () => {
      expect(() => validateBranchName("branch.lock")).toThrow(/\.lock/);
      expect(() => validateBranchName("feature.lock")).toThrow(/\.lock/);
    });

    it("should reject consecutive slashes", () => {
      expect(() => validateBranchName("feature//branch")).toThrow(
        /consecutive slashes/,
      );
      expect(() => validateBranchName("a//b//c")).toThrow(
        /consecutive slashes/,
      );
    });

    it("should reject trailing slashes", () => {
      expect(() => validateBranchName("feature/")).toThrow(
        /cannot end with a slash/,
      );
      expect(() => validateBranchName("branch/")).toThrow(
        /cannot end with a slash/,
      );
    });

    it("should reject leading periods", () => {
      expect(() => validateBranchName(".hidden")).toThrow();
    });

    it("should reject trailing periods", () => {
      expect(() => validateBranchName("branch.")).toThrow(
        /cannot start or end with a period/,
      );
    });

    it("should reject special git refspec characters", () => {
      expect(() => validateBranchName("branch~1")).toThrow();
      expect(() => validateBranchName("branch^2")).toThrow();
      expect(() => validateBranchName("branch:ref")).toThrow();
      expect(() => validateBranchName("branch?")).toThrow();
      expect(() => validateBranchName("branch*")).toThrow();
      expect(() => validateBranchName("branch[0]")).toThrow();
      expect(() => validateBranchName("branch\\path")).toThrow();
    });
  });

  describe("control characters and special characters", () => {
    it("should reject null bytes", () => {
      expect(() => validateBranchName("branch\x00name")).toThrow();
    });

    it("should reject other control characters", () => {
      expect(() => validateBranchName("branch\x01name")).toThrow();
      expect(() => validateBranchName("branch\x1Fname")).toThrow();
      expect(() => validateBranchName("branch\x7Fname")).toThrow();
    });

    it("should reject spaces", () => {
      expect(() => validateBranchName("branch name")).toThrow();
      expect(() => validateBranchName("feature branch")).toThrow();
    });

    it("should reject newlines and tabs", () => {
      expect(() => validateBranchName("branch\nname")).toThrow();
      expect(() => validateBranchName("branch\tname")).toThrow();
    });
  });

  describe("empty and whitespace", () => {
    it("should reject empty strings", () => {
      expect(() => validateBranchName("")).toThrow(/cannot be empty/);
    });

    it("should reject whitespace-only strings", () => {
      expect(() => validateBranchName("   ")).toThrow();
      expect(() => validateBranchName("\t\n")).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should accept single alphanumeric character", () => {
      expect(() => validateBranchName("a")).not.toThrow();
      expect(() => validateBranchName("1")).not.toThrow();
    });

    it("should reject single special characters", () => {
      expect(() => validateBranchName(".")).toThrow();
      expect(() => validateBranchName("/")).toThrow();
      expect(() => validateBranchName("-")).toThrow();
    });
  });
});
