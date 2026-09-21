#!/usr/bin/env bun

/**
 * Tests the interaction between restoreConfigFromBase and the auto-commit in
 * checkAndCommitOrDeleteBranch.
 *
 * On pull requests the restore replaces .claude/, CLAUDE.md and friends with
 * the base branch's versions and leaves them unstaged, so the revert does not
 * reach a commit. A bare `git add -A` re-staged them anyway and pushed a silent
 * revert of the PR author's own config onto their branch.
 *
 * These run against real git — the fix is a pathspec, so a mock would only
 * assert that the arguments were passed, not that git honours them.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAndCommitOrDeleteBranch } from "../src/github/operations/branch-cleanup";
import { SENSITIVE_PATHS } from "../src/github/operations/restore-config";
import type { Octokits } from "../src/github/api/client";

const BRANCH = "claude/issue-1-20260101-0000";

let workDir: string;
let remoteDir: string;
let originalCwd: string;
let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: workDir, encoding: "utf-8" }).trim();
}

function write(relative: string, contents: string) {
  const full = join(workDir, relative);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
}

/** Branch exists, and has no commits ahead of base, so cleanup inspects git. */
const mockOctokit = {
  rest: {
    repos: {
      getBranch: async () => ({ data: {} }),
      compareCommitsWithBasehead: async () => ({
        data: { total_commits: 0 },
      }),
    },
    git: { deleteRef: async () => ({ data: {} }) },
  },
} as unknown as Octokits;

beforeEach(() => {
  originalCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "branch-cleanup-"));
  remoteDir = join(root, "remote.git");
  workDir = join(root, "work");

  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  execFileSync("git", ["init", "-q", "-b", "main", workDir]);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("remote", "add", "origin", remoteDir);

  write(".claude/settings.json", '{"from":"base"}\n');
  write("CLAUDE.md", "base docs\n");
  write("src/app.ts", "base code\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  git("push", "-q", "origin", "main");
  git("checkout", "-qb", BRANCH);
  git("push", "-q", "origin", BRANCH);

  process.chdir(workDir);
  logSpy = spyOn(console, "log").mockImplementation(() => {});
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(join(workDir, ".."), { recursive: true, force: true });
});

/** Files touched by the most recent commit. */
function filesInHeadCommit(): string[] {
  return git("show", "--name-only", "--format=", "HEAD")
    .split("\n")
    .filter(Boolean)
    .sort();
}

/**
 * Reproduce the working-tree state restoreConfigFromBase leaves behind: the
 * PR-authored config overwritten with the base branch's content, unstaged, so
 * git reports it as a plain modification.
 */
function simulateRestoredConfig() {
  write(".claude/settings.json", '{"from":"base"}\n');
  write("CLAUDE.md", "base docs\n");
}

function authorPrConfigEdits() {
  write(".claude/settings.json", '{"from":"pr-author"}\n');
  write("CLAUDE.md", "pr author docs\n");
  git("commit", "-qam", "PR author edits config");
}

describe("auto-commit with restored config paths", () => {
  test("does not commit the base-branch revert onto the PR branch", async () => {
    authorPrConfigEdits();
    simulateRestoredConfig(); // config now reverted + unstaged
    write("src/app.ts", "claude's real change\n");

    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [...SENSITIVE_PATHS],
    );

    expect(filesInHeadCommit()).toEqual(["src/app.ts"]);
    expect(result.shouldDeleteBranch).toBe(false);
  });

  test("leaves the reverted config dirty in the working tree", async () => {
    authorPrConfigEdits();
    simulateRestoredConfig();
    write("src/app.ts", "claude's real change\n");

    await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [...SENSITIVE_PATHS],
    );

    // --name-only gives bare paths, avoiding porcelain's status-column prefix.
    const stillDirty = git("diff", "--name-only")
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(stillDirty).toEqual([".claude/settings.json", "CLAUDE.md"]);
  });

  test("treats a branch whose only change is the revert as empty", async () => {
    // No real work — just the reverted config. Committing here would push a
    // pure revert and keep an otherwise-empty branch alive.
    authorPrConfigEdits();
    simulateRestoredConfig();

    const before = git("rev-parse", "HEAD");
    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [...SENSITIVE_PATHS],
    );

    expect(git("rev-parse", "HEAD")).toBe(before);
    expect(result.shouldDeleteBranch).toBe(true);
    expect(result.branchLink).toBe("");
  });

  test("still commits Claude's own changes to non-config files", async () => {
    authorPrConfigEdits();
    simulateRestoredConfig();
    write("src/app.ts", "changed\n");
    write("src/new-file.ts", "added\n");

    await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [...SENSITIVE_PATHS],
    );

    expect(filesInHeadCommit()).toEqual(["src/app.ts", "src/new-file.ts"]);
  });

  test("pushes the commit to the branch", async () => {
    authorPrConfigEdits();
    simulateRestoredConfig();
    write("src/app.ts", "claude's real change\n");

    const result = await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [...SENSITIVE_PATHS],
    );

    const remoteHead = execFileSync(
      "git",
      ["--git-dir", remoteDir, "rev-parse", BRANCH],
      { encoding: "utf-8" },
    ).trim();
    expect(remoteHead).toBe(git("rev-parse", "HEAD"));
    expect(result.branchLink).toContain(BRANCH);
  });
});

describe("without restored config paths (the issue path)", () => {
  test("commits config changes normally, since no revert happened", async () => {
    // Reached for issues, where restoreConfigFromBase never runs and Claude may
    // have been asked to edit CLAUDE.md. Excluding it here would drop the work.
    write("CLAUDE.md", "claude wrote these docs\n");
    write(".claude/settings.json", '{"written":"by claude"}\n');
    write("src/app.ts", "and some code\n");

    await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
      [],
    );

    expect(filesInHeadCommit()).toEqual([
      ".claude/settings.json",
      "CLAUDE.md",
      "src/app.ts",
    ]);
  });

  test("defaults to committing everything when the argument is omitted", async () => {
    // Backwards compatibility: the parameter is optional.
    write("CLAUDE.md", "claude wrote these docs\n");

    await checkAndCommitOrDeleteBranch(
      mockOctokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
    );

    expect(filesInHeadCommit()).toEqual(["CLAUDE.md"]);
  });
});
