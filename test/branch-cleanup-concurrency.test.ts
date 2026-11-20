import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAndCommitOrDeleteBranch } from "../src/github/operations/branch-cleanup";
import type { Octokits } from "../src/github/api/client";

const BRANCH = "claude/shared-issue";

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "commit.gpgSign=false", "-C", cwd, ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

describe("branch cleanup concurrency", () => {
  let root: string;
  let work: string;
  let remote: string;
  let collaborator: string;
  let previousCwd: string;
  let initialHead: string;

  function remoteHead(): string | null {
    const result = spawnSync(
      "git",
      ["--git-dir", remote, "rev-parse", "--verify", `refs/heads/${BRANCH}`],
      {
        encoding: "utf8",
      },
    );
    return result.status === 0 ? result.stdout.trim() : null;
  }

  beforeEach(() => {
    previousCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), "cleanup-concurrency-"));
    remote = join(root, "origin.git");
    work = join(root, "work");
    collaborator = join(root, "collaborator");
    git(root, "init", "--bare", remote);
    git(root, "init", "-b", "main", work);
    git(work, "config", "user.name", "Cleanup test");
    git(work, "config", "user.email", "cleanup@example.invalid");
    writeFileSync(join(work, "tracked.txt"), "base\n");
    git(work, "add", ".");
    git(work, "commit", "-m", "base");
    git(work, "remote", "add", "origin", remote);
    git(work, "push", "origin", "main");
    git(work, "checkout", "-b", BRANCH);
    git(work, "push", "origin", BRANCH);
    initialHead = git(work, "rev-parse", "HEAD");
    git(root, "clone", "--branch", BRANCH, remote, collaborator);
    git(collaborator, "config", "user.name", "Collaborator");
    git(collaborator, "config", "user.email", "collaborator@example.invalid");
    process.chdir(work);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });

  for (const useCommitSigning of [false, true]) {
    for (const scenario of [
      "unchanged",
      "concurrent",
      "missing",
      "rejected",
    ] as const) {
      test(`${scenario} remote branch, commit signing ${useCommitSigning}`, async () => {
        let concurrentHead: string | undefined;
        let comparedBasehead: string | undefined;
        let apiDeletes = 0;
        if (scenario === "missing") {
          git(
            root,
            "--git-dir",
            remote,
            "update-ref",
            "-d",
            `refs/heads/${BRANCH}`,
          );
        }
        if (scenario === "rejected") {
          git(
            root,
            "--git-dir",
            remote,
            "config",
            "receive.denyDeletes",
            "true",
          );
        }
        const octokit = {
          rest: {
            repos: {
              getBranch: async () => {
                const sha = remoteHead();
                if (!sha)
                  throw Object.assign(new Error("Not Found"), { status: 404 });
                return { data: { commit: { sha } } };
              },
              compareCommitsWithBasehead: async ({
                basehead,
              }: {
                basehead: string;
              }) => {
                comparedBasehead = basehead;
                // The server has already determined that the observed branch
                // is empty when another actor pushes a real commit.
                expect(remoteHead()).toBe(initialHead);
                if (scenario === "concurrent") {
                  writeFileSync(
                    join(collaborator, "tracked.txt"),
                    "collaborator's work\n",
                  );
                  git(collaborator, "commit", "-am", "concurrent work");
                  git(collaborator, "push", "origin", BRANCH);
                  concurrentHead = git(collaborator, "rev-parse", "HEAD");
                }
                return { data: { total_commits: 0 } };
              },
            },
            git: {
              // Model the original REST delete-ref operation against the real
              // bare repository: it has no expected-old-SHA parameter.
              deleteRef: async () => {
                apiDeletes++;
                git(
                  root,
                  "--git-dir",
                  remote,
                  "update-ref",
                  "-d",
                  `refs/heads/${BRANCH}`,
                );
                return { data: {} };
              },
            },
          },
        } as unknown as Octokits;

        const result = await checkAndCommitOrDeleteBranch(
          octokit,
          "owner",
          "repo",
          BRANCH,
          "main",
          useCommitSigning,
        );

        if (scenario === "concurrent") {
          expect(remoteHead()).toBe(concurrentHead!);
          expect(result.shouldDeleteBranch).toBe(false);
          expect(result.branchLink).toContain(BRANCH);
          expect(comparedBasehead).toBe(`main...${initialHead}`);
          expect(apiDeletes).toBe(0);
        } else if (scenario === "unchanged") {
          expect(remoteHead()).toBeNull();
          expect(result.shouldDeleteBranch).toBe(true);
          expect(result.branchLink).toBe("");
          expect(comparedBasehead).toBe(`main...${initialHead}`);
          expect(apiDeletes).toBe(0);
        } else if (scenario === "rejected") {
          expect(remoteHead()).toBe(initialHead);
          expect(result.shouldDeleteBranch).toBe(false);
          expect(result.branchLink).toContain(BRANCH);
          expect(apiDeletes).toBe(0);
        } else {
          expect(result.shouldDeleteBranch).toBe(false);
          expect(result.branchLink).toBe("");
          expect(apiDeletes).toBe(0);
          expect(comparedBasehead).toBeUndefined();
        }
      }, 30_000);
    }
  }
});
