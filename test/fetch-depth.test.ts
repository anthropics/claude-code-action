import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { Octokit } from "@octokit/rest";
import { setupBranch } from "../src/github/operations/branch";
import {
  ensurePullRequestMergeBase,
  fetchDepthArgs,
} from "../src/github/operations/fetch-depth";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";
import { createMockContext } from "./mockContext";

const octokits = {
  rest: {
    repos: { get: async () => ({ data: { default_branch: "main" } }) },
    git: { getRef: async () => ({ data: { object: { sha: "abc1234" } } }) },
  },
} as any;

const githubData = {
  contextData: { title: "Add feature", labels: { nodes: [] } },
} as any;

describe("setupBranch fetch depth", () => {
  let originalCwd: string;
  let tempDir = "";
  let repoDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join("/tmp", "fetch-depth-"));
    repoDir = join(tempDir, "repo");
    const remoteDir = join(tempDir, "origin.git");

    // Pin the remote's HEAD to main: with the default init.defaultBranch of
    // master it would dangle, and `git clone --depth=1` (which implies
    // --single-branch) then produces an empty, non-shallow clone.
    execFileSync(
      "git",
      ["init", "--bare", "--initial-branch=main", remoteDir],
      {
        stdio: "pipe",
      },
    );
    execFileSync("git", ["init", repoDir], { stdio: "pipe" });
    git(["checkout", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);

    for (const message of ["first", "second", "third"]) {
      writeFileSync(join(repoDir, `${message}.txt`), `${message}\n`);
      git(["add", "."]);
      git(["commit", "-m", message]);
    }

    git(["remote", "add", "origin", remoteDir]);
    git(["push", "-u", "origin", "main"]);

    process.chdir(repoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  for (const useCommitSigning of [false, true]) {
    test(`keeps the full history of a complete checkout with use_commit_signing: ${useCommitSigning}`, async () => {
      const context = createMockContext({
        isPR: false,
        entityNumber: 7,
        inputs: { useCommitSigning, branchPrefix: "claude/" },
      });

      await setupBranch(octokits, githubData, context);

      expect(git(["rev-parse", "--is-shallow-repository"]).trim()).toBe(
        "false",
      );
      expect(git(["rev-list", "--count", "HEAD"]).trim()).toBe("3");
    });
  }

  test("still limits the depth on an already shallow checkout", () => {
    const shallowDir = join(tempDir, "shallow");
    execFileSync(
      "git",
      [
        "clone",
        "--depth=1",
        `file://${join(tempDir, "origin.git")}`,
        shallowDir,
      ],
      { stdio: "pipe" },
    );

    process.chdir(shallowDir);
    expect(
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: shallowDir,
        encoding: "utf8",
      }).trim(),
    ).toBe("true");
    expect(fetchDepthArgs(20)).toEqual(["--depth=20"]);
  });

  test("drops the depth limit on a complete checkout", () => {
    expect(fetchDepthArgs(20)).toEqual([]);
  });

  test.each(["feature", "pr-merge"])(
    "fetches a missing merge base from a shallow %s checkout",
    async (branch) => {
      git(["checkout", "-b", "feature"]);
      writeFileSync(join(repoDir, "feature.txt"), "Feature content\n");
      git(["add", "feature.txt"]);
      git(["commit", "-m", "Feature"]);
      git(["checkout", "main"]);
      writeFileSync(join(repoDir, "base.txt"), "Base-only content\n");
      git(["add", "base.txt"]);
      git(["commit", "-m", "Base update"]);
      git(["checkout", "-b", "pr-merge"]);
      git(["merge", "--no-ff", "feature", "-m", "PR test merge"]);
      git(["push", "origin", "main", "feature", "pr-merge"]);

      const shallow = join(tempDir, "shallow-pr");
      git([
        "clone",
        "--depth=1",
        "--branch",
        branch,
        `file://${join(tempDir, "origin.git")}`,
        shallow,
      ]);
      const head = git(["rev-parse", branch]).trim();
      const base = git(["rev-parse", "main"]).trim();
      const mergeBase = git(["merge-base", base, head]).trim();
      const [behind, ahead] = git([
        "rev-list",
        "--left-right",
        "--count",
        `${base}...${head}`,
      ])
        .trim()
        .split(/\s+/)
        .map(Number);
      const compare = mock(async () => ({
        data: { ahead_by: ahead, behind_by: behind },
      }));
      const rest = { rest: { repos: { compareCommitsWithBasehead: compare } } };
      const repository = { owner: "fixture", repo: "repo" };

      process.chdir(shallow);
      restoreConfigFromBase("main");
      expect(git(["rev-parse", "origin/main"], shallow).trim()).toBe(base);
      expect(() =>
        git(["merge-base", "origin/main", "HEAD"], shallow),
      ).toThrow();

      await ensurePullRequestMergeBase(
        rest as unknown as Octokit,
        repository,
        "main",
      );
      expect(compare).toHaveBeenCalledWith({
        ...repository,
        basehead: `${base}...${head}`,
        per_page: 1,
      });
      expect(git(["merge-base", "origin/main", "HEAD"], shallow).trim()).toBe(
        mergeBase,
      );
      expect(git(["rev-parse", "HEAD"], shallow).trim()).toBe(head);
      expect(
        git(["diff", "--name-only", "origin/main...HEAD"], shallow).trim(),
      ).toBe("feature.txt");

      await ensurePullRequestMergeBase(
        rest as unknown as Octokit,
        repository,
        "main",
      );
      expect(compare).toHaveBeenCalledTimes(1);
    },
  );

  function git(args: string[], cwd = repoDir): string {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
});
