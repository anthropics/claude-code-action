import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Octokits } from "../src/github/api/client";
import type { FetchDataResult } from "../src/github/data/fetcher";
import { setupBranch } from "../src/github/operations/branch";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";
import { createMockContext } from "./mockContext";

describe("reuse_issue_branch", () => {
  const branch = "work/issue-42";
  let originalDirectory: string;
  let fixture: string;
  let sourceHead: string;

  function git(...args: string[]): string {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  }

  function commit(file: string, contents: string, message: string): void {
    writeFileSync(file, contents);
    git("add", "--", file);
    git("commit", "-m", message);
  }

  beforeEach(() => {
    originalDirectory = process.cwd();
    fixture = mkdtempSync(join(tmpdir(), "reuse-issue-branch-"));
    process.chdir(fixture);
    git("init", "--bare", join(fixture, "remote.git"));
    git("init", "--initial-branch=main", "checkout");
    process.chdir(join(fixture, "checkout"));
    git("config", "user.name", "Fixture Author");
    git("config", "user.email", "fixture@example.com");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", "/dev/null");
    git("remote", "add", "origin", join(fixture, "remote.git"));
    commit("CLAUDE.md", "Base configuration\n", "Initial commit");
    git("push", "-u", "origin", "main");
    sourceHead = git("rev-parse", "HEAD");
  });

  afterEach(() => {
    process.chdir(originalDirectory);
    rmSync(fixture, { recursive: true, force: true });
  });

  test.each([false, true])(
    "continues from the pushed head with API commit mode set to %j",
    async (useCommitSigning) => {
      const octokit = {
        rest: {
          git: {
            getRef: async () => ({ data: { object: { sha: sourceHead } } }),
          },
        },
      } as unknown as Octokits;
      const githubData: FetchDataResult = {
        contextData: {
          title: "Test issue",
          body: "",
          author: null,
          createdAt: "2026-01-01T00:00:00Z",
          state: "OPEN",
          labels: { nodes: [] },
          comments: { nodes: [] },
        },
        comments: [],
        changedFiles: [],
        changedFilesWithSHA: [],
        reviewData: null,
        imageUrlMap: new Map(),
      };
      const context = createMockContext({
        entityNumber: 42,
        isPR: false,
        inputs: {
          baseBranch: "main",
          branchPrefix: "work/",
          branchNameTemplate: "{{prefix}}{{entityNumber}}-{{timestamp}}",
          reuseIssueBranch: true,
          useCommitSigning,
        },
      });

      const first = await setupBranch(octokit, githubData, context);
      expect(first.claudeBranch).toBe(branch);
      expect(first.currentBranch).toBe(useCommitSigning ? "main" : branch);
      expect(first.reusedIssueBranch).toBeUndefined();
      if (useCommitSigning) git("checkout", "-b", branch);
      commit("work.txt", "Earlier issue work\n", "Save progress");
      commit(
        "CLAUDE.md",
        "Changed branch configuration\n",
        "Change configuration",
      );
      git("push", "origin", branch);
      const savedHead = git("rev-parse", "HEAD");
      git("checkout", "main");

      const second = await setupBranch(octokit, githubData, context);
      expect(second).toEqual({
        baseBranch: "main",
        claudeBranch: branch,
        currentBranch: branch,
        reusedIssueBranch: true,
      });
      expect(git("branch", "--show-current")).toBe(branch);
      expect(git("rev-parse", "HEAD")).toBe(savedHead);
      expect(readFileSync("work.txt", "utf8")).toBe("Earlier issue work\n");

      expect(restoreConfigFromBase(second.baseBranch)).toContain("CLAUDE.md");
      expect(readFileSync("CLAUDE.md", "utf8")).toBe("Base configuration\n");
      expect(readFileSync(".claude-pr/CLAUDE.md", "utf8")).toBe(
        "Changed branch configuration\n",
      );
    },
  );
});
