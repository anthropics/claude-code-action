import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { checkAndCommitOrDeleteBranch } from "../src/github/operations/branch-cleanup";
import type { Octokits } from "../src/github/api/client";
import { GITHUB_SERVER_URL } from "../src/github/api/config";

const BRANCH_SHA = "1234567890abcdef1234567890abcdef12345678";

describe("checkAndCommitOrDeleteBranch", () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const createMockOctokit = (
    compareResponse?: any,
    branchExists: boolean = true,
    sha: string | undefined = BRANCH_SHA,
  ): Octokits => {
    return {
      rest: {
        repos: {
          compareCommitsWithBasehead: async () => ({
            data: compareResponse || { total_commits: 0 },
          }),
          getBranch: async () => {
            if (!branchExists) {
              const error: any = new Error("Not Found");
              error.status = 404;
              throw error;
            }
            return { data: { commit: { sha } } };
          },
        },
      },
    } as any as Octokits;
  };

  test("should return no branch link and not delete when branch is undefined", async () => {
    const mockOctokit = createMockOctokit();
    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      undefined,
      "main",
      false,
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test("should not delete branch and return link when branch has commits", async () => {
    const mockOctokit = createMockOctokit({ total_commits: 3 });
    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101-1234",
      "main",
      false,
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITHUB_SERVER_URL}/owner/repo/tree/claude/issue-123-20240101-1234)`,
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("has no commits"),
    );
  });

  test("should handle branch comparison errors gracefully", async () => {
    const mockOctokit = {
      rest: {
        repos: {
          compareCommitsWithBasehead: async () => {
            throw new Error("API error");
          },
          getBranch: async () => ({ data: { commit: { sha: BRANCH_SHA } } }),
        },
        git: {
          deleteRef: async () => ({ data: {} }),
        },
      },
    } as any as Octokits;

    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101-1234",
      "main",
      false,
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITHUB_SERVER_URL}/owner/repo/tree/claude/issue-123-20240101-1234)`,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error comparing commits on Claude branch:",
      expect.any(Error),
    );
  });

  test("should preserve a branch when its observed SHA is invalid", async () => {
    const mockOctokit = createMockOctokit({ total_commits: 0 }, true, "");

    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101-1234",
      "main",
      true,
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe(
      `\n[View branch](${GITHUB_SERVER_URL}/owner/repo/tree/claude/issue-123-20240101-1234)`,
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Cannot safely clean up branch claude/issue-123-20240101-1234: missing commit SHA",
    );
  });

  test("should return no branch link when branch doesn't exist remotely", async () => {
    const mockOctokit = createMockOctokit(
      { total_commits: 0 },
      false, // branch doesn't exist
    );

    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      "claude/issue-123-20240101-1234",
      "main",
      false,
    );

    expect(result.shouldDeleteBranch).toBe(false);
    expect(result.branchLink).toBe("");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Branch claude/issue-123-20240101-1234 does not exist remotely",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Branch claude/issue-123-20240101-1234 does not exist remotely, no branch link will be added",
    );
  });
});
