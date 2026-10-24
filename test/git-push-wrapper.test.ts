import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const WRAPPER = join(import.meta.dir, "..", "scripts", "git-push.sh");

// The wrapper is handed to Claude as `Bash(<action>/scripts/git-push.sh:*)`, so
// every argument is attacker-reachable via prompt injection. Its contract is
// `origin <ref>` with no flags and no force: a leading `+` is git's refspec
// force marker, not a flag, and `git check-ref-format --branch` happily accepts
// it. Each case starts from a DIVERGED local branch so that a successful push
// is necessarily a forced one.
describe("scripts/git-push.sh", () => {
  let tempDir = "";
  let repoDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join("/tmp", "git-push-wrapper-"));
    repoDir = join(tempDir, "repo");
    const remoteDir = join(tempDir, "origin.git");

    execFileSync(
      "git",
      ["init", "--bare", "--initial-branch=main", remoteDir],
      {
        stdio: "pipe",
      },
    );
    execFileSync("git", ["init", "--initial-branch=feature", repoDir], {
      stdio: "pipe",
    });
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);

    commit("base");
    commit("published");
    git(["remote", "add", "origin", remoteDir]);
    git(["push", "origin", "feature"]);

    // Rewrite history so `feature` is no longer a fast-forward of the remote.
    git(["reset", "--hard", "HEAD~1"]);
    commit("rewritten");
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  for (const ref of ["+feature", "+HEAD", "+refs/heads/feature"]) {
    test(`rejects the force refspec ${ref} and leaves the remote untouched`, () => {
      const before = remoteSha();

      const result = runWrapper("origin", ref);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("force");
      expect(remoteSha()).toBe(before);
    });
  }

  test("rejects flags", () => {
    const before = remoteSha();

    const result = runWrapper("origin", "--force");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("flags are not allowed");
    expect(remoteSha()).toBe(before);
  });

  test("rejects remotes other than origin", () => {
    const result = runWrapper("ext::sh -c id", "feature");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("remote must be 'origin'");
  });

  test("still pushes a fast-forward update", () => {
    git(["checkout", "-b", "ff"]);
    git(["push", "origin", "ff"]);
    commit("fast-forward");

    const result = runWrapper("origin", "ff");

    expect(result.status).toBe(0);
    expect(remoteSha("ff")).toBe(git(["rev-parse", "HEAD"]).trim());
  });

  // `+` is legal inside a branch name (Claude Code's EnterWorktree produces
  // names like "worktree-feat+foo") and validateBranchName only forbids it as
  // the first character, so only a LEADING `+` must be rejected.
  test("still pushes a branch whose name contains a non-leading +", () => {
    git(["checkout", "-b", "worktree-feat+foo"]);

    const result = runWrapper("origin", "worktree-feat+foo");

    expect(result.status).toBe(0);
    expect(remoteSha("worktree-feat+foo")).toBe(
      git(["rev-parse", "HEAD"]).trim(),
    );
  });

  function runWrapper(...args: string[]) {
    return spawnSync(WRAPPER, args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  function remoteSha(branch = "feature"): string {
    return git(["ls-remote", "origin", `refs/heads/${branch}`]).split("\t")[0]!;
  }

  function commit(message: string): void {
    writeFileSync(join(repoDir, `${message}.txt`), `${message}\n`);
    git(["add", "."]);
    git(["commit", "-m", message]);
  }

  function git(args: string[]): string {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
});
