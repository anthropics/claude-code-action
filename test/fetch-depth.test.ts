import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { setupBranch } from "../src/github/operations/branch";
import { fetchDepthArgs } from "../src/github/operations/fetch-depth";
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

  function git(args: string[]): string {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
});
