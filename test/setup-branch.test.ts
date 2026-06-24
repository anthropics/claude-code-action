import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { setupBranch } from "../src/github/operations/branch";
import type { ParsedGitHubContext } from "../src/github/context";
import type { Octokits } from "../src/github/api/client";
import type { FetchDataResult } from "../src/github/data/fetcher";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("setupBranch", () => {
  let tempDir: string | undefined;
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  test("checks out fork PRs without fetching into a colliding local branch", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    tempDir = mkdtempSync(join(tmpdir(), "setup-branch-"));

    try {
      const remoteDir = join(tempDir, "origin.git");
      const sourceDir = join(tempDir, "source");
      const runnerDir = join(tempDir, "runner");

      git(tempDir, ["init", "--bare", "--initial-branch=main", remoteDir]);
      git(tempDir, ["init", "--initial-branch=main", sourceDir]);
      git(sourceDir, ["config", "user.email", "test@example.com"]);
      git(sourceDir, ["config", "user.name", "Test User"]);
      git(sourceDir, ["remote", "add", "origin", remoteDir]);

      writeFileSync(join(sourceDir, "README.md"), "base\n");
      git(sourceDir, ["add", "README.md"]);
      git(sourceDir, ["commit", "-m", "base"]);
      git(sourceDir, ["push", "origin", "HEAD:refs/heads/main"]);

      writeFileSync(join(sourceDir, "README.md"), "fork pr\n");
      git(sourceDir, ["commit", "-am", "fork pr"]);
      const pullHeadSha = git(sourceDir, ["rev-parse", "HEAD"]);
      git(sourceDir, ["push", "origin", "HEAD:refs/pull/38/head"]);

      git(tempDir, ["clone", remoteDir, runnerDir]);
      expect(git(runnerDir, ["branch", "--show-current"])).toBe("main");
      process.chdir(runnerDir);

      const result = await setupBranch(
        {} as Octokits,
        {
          contextData: {
            state: "OPEN",
            headRefName: "main",
            baseRefName: "main",
            isCrossRepository: true,
            commits: { totalCount: 1 },
            title: "Fork PR from main",
          },
          comments: [],
          changedFiles: [],
          changedFilesWithSHA: [],
          reviewData: null,
          imageUrlMap: new Map(),
        } as unknown as FetchDataResult,
        {
          repository: {
            owner: "anthropics",
            repo: "claude-code-action",
            full_name: "anthropics/claude-code-action",
          },
          entityNumber: 38,
          isPR: true,
          inputs: {
            prompt: "",
            triggerPhrase: "@claude",
            assigneeTrigger: "",
            labelTrigger: "",
            branchPrefix: "claude/",
            useStickyComment: false,
            classifyInlineComments: false,
            useCommitSigning: false,
            sshSigningKey: "",
            botId: "41898282",
            botName: "claude[bot]",
            allowedBots: "",
            allowedNonWriteUsers: "",
            trackProgress: false,
            includeFixLinks: false,
            includeCommentsByActor: "",
            excludeCommentsByActor: "",
          },
        } as unknown as ParsedGitHubContext,
      );

      expect(result).toEqual({ baseBranch: "main", currentBranch: "main" });
      expect(git(runnerDir, ["rev-parse", "HEAD"])).toBe(pullHeadSha);
      expect(git(runnerDir, ["branch", "--show-current"])).toBe("");
      expect(git(runnerDir, ["rev-parse", "refs/heads/main"])).not.toBe(
        pullHeadSha,
      );
      expect(git(runnerDir, ["rev-parse", "refs/remotes/pull/38/head"])).toBe(
        pullHeadSha,
      );
    } finally {
      consoleLogSpy.mockRestore();
    }
  });
});
