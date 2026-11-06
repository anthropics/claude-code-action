#!/usr/bin/env bun

/** Regression: a successful local commit must not hide a failed remote push. */
import { test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAndCommitOrDeleteBranch } from "../src/github/operations/branch-cleanup";
import type { Octokits } from "../src/github/api/client";

const BRANCH = "claude/issue-1-gb004-test";
let root: string;
let remote: string;
let work: string;
let previousCwd: string;
let logSpy: ReturnType<typeof spyOn>;
let errorSpy: ReturnType<typeof spyOn>;

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: work,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const octokit = {
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
  previousCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), "gb004-"));
  remote = join(root, "remote.git");
  work = join(root, "work");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  git("config", "user.name", "GB004 Test");
  git("config", "user.email", "gb004@example.invalid");
  git("remote", "add", "origin", remote);
  mkdirSync(join(work, "src"), { recursive: true });
  writeFileSync(join(work, "src", "app.ts"), "before\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  git("push", "-q", "origin", "main");
  git("checkout", "-qb", BRANCH);
  git("push", "-q", "origin", BRANCH);

  // Only future pushes should be rejected.
  writeFileSync(join(remote, "hooks", "pre-receive"), "#!/bin/sh\nexit 1\n", {
    mode: 0o755,
  });
  writeFileSync(join(work, "src", "app.ts"), "after\n");
  process.chdir(work);
  logSpy = spyOn(console, "log").mockImplementation(() => {});
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(previousCwd);
  logSpy.mockRestore();
  errorSpy.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

test("failed push must be reported rather than return a misleading branch link", async () => {
  const originalRemoteHead = execFileSync(
    "git",
    ["--git-dir", remote, "rev-parse", `refs/heads/${BRANCH}`],
    { encoding: "utf8" },
  ).trim();

  await expect(
    checkAndCommitOrDeleteBranch(
      octokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      false,
    ),
  ).rejects.toThrow("Failed to push Claude changes");

  const localHead = git("rev-parse", "HEAD");
  const remoteHead = execFileSync(
    "git",
    ["--git-dir", remote, "rev-parse", `refs/heads/${BRANCH}`],
    { encoding: "utf8" },
  ).trim();
  expect(localHead).not.toBe(originalRemoteHead);
  expect(remoteHead).toBe(originalRemoteHead);
});
