import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const SCRIPTS = resolve(import.meta.dir, "../scripts");

// git exports these into hooks, such as a pre-commit hook running this suite.
const env = () => {
  const copy = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
    delete copy[key as keyof typeof copy];
  }
  return copy;
};

describe("git wrappers", () => {
  let dir: string;
  let repo: string;
  let remote: string;

  const run = (cmd: string, ...args: string[]) =>
    spawnSync(cmd, args, { cwd: repo, env: env(), encoding: "utf8" });
  const git = (...args: string[]) => {
    const result = run("git", ...args);
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  const commit = (...args: string[]) =>
    run(join(SCRIPTS, "git-commit.sh"), ...args);
  const remoteHead = () =>
    spawnSync("git", ["-C", remote, "rev-parse", "main"], {
      env: env(),
      encoding: "utf8",
    }).stdout.trim();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "git-wrappers-"));
    repo = join(dir, "repo");
    remote = join(dir, "remote.git");
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", remote], {
      env: env(),
    });
    spawnSync("git", ["init", "-q", "-b", "main", repo], { env: env() });
    git("remote", "add", "origin", remote);
    git("commit", "-q", "--allow-empty", "-m", "first");
    git("push", "-q", "origin", "main");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("git-commit.sh", () => {
    const literalMessages = [
      ["-m", "a message"],
      ["-m", "a", "-m", "b"],
      ["--message", "a message"],
      ["--message=a message"],
    ];
    for (const args of literalMessages) {
      test(`commits a literal message: ${args.join(" ")}`, () => {
        expect(commit("--allow-empty", ...args).status).toBe(0);
      });
    }

    test("commits staged and named paths", () => {
      writeFileSync(join(repo, "a.txt"), "a\n");
      writeFileSync(join(repo, "b.txt"), "b\n");
      git("add", "a.txt", "b.txt");
      expect(commit("-m", "two", "--", "a.txt").status).toBe(0);
      expect(git("status", "--short")).toBe("A  b.txt");
    });

    test("treats flag-like text in a message as the message", () => {
      expect(commit("--allow-empty", "-m", "-F .git/config").status).toBe(0);
      expect(git("log", "-1", "--format=%s")).toBe("-F .git/config");
    });

    const rejected = [
      ["-F", ".git/config"],
      ["-F.git/config"],
      ["--file", ".git/config"],
      ["--file=.git/config"],
      ["-t", ".git/config"],
      ["--template=.git/config"],
      ["-C", "HEAD"],
      ["-c", "HEAD"],
      ["--reuse-message=HEAD"],
      ["--reedit-message=HEAD"],
      ["--fixup=HEAD"],
      ["--pathspec-from-file=.git/config"],
      ["--no-verify", "-m", "x"],
      ["--author=x <x@example.com>", "-m", "x"],
      ["-amx"],
    ];
    for (const args of rejected) {
      test(`rejects ${args.join(" ")}`, () => {
        const before = git("rev-parse", "HEAD");
        const result = commit("--allow-empty", ...args);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Error:");
        expect(git("rev-parse", "HEAD")).toBe(before);
      });
    }

    test("requires a message", () => {
      expect(commit("--allow-empty").status).toBe(1);
      expect(commit("-m").status).toBe(1);
    });

    // A pushed commit can't be amended and pushed again, because forced pushes are
    // refused, so the work would be stranded on the runner.
    for (const args of [
      ["--amend"],
      ["--amend", "--no-edit"],
      ["--amend", "-m", "new"],
    ]) {
      test(`rejects an amend: ${args.join(" ")}`, () => {
        expect(commit(...args).status).toBe(1);
      });
    }

    test("does not read a file into the commit", () => {
      const secret = readFileSync(join(repo, ".git", "config"), "utf8");
      commit("--allow-empty", "-F", ".git/config");
      expect(git("log", "-1", "--format=%B")).not.toContain(secret.trim());
    });
  });

  describe("git-push.sh", () => {
    const SESSION_BRANCH = "claude/issue-1";

    const push = (
      ref: string,
      branch: string | null = SESSION_BRANCH,
      remoteName = "origin",
    ) => {
      const pushEnv: Record<string, string | undefined> = { ...env() };
      if (branch === null) delete pushEnv.CLAUDE_PUSH_BRANCH;
      else pushEnv.CLAUDE_PUSH_BRANCH = branch;
      return spawnSync(join(SCRIPTS, "git-push.sh"), [remoteName, ref], {
        cwd: repo,
        env: pushEnv,
        encoding: "utf8",
      });
    };
    const remoteBranch = (branch: string) =>
      spawnSync(
        "git",
        ["-C", remote, "rev-parse", "--verify", "-q", `refs/heads/${branch}`],
        { env: env(), encoding: "utf8" },
      ).stdout.trim();

    beforeEach(() => {
      git("checkout", "-q", "-b", SESSION_BRANCH);
      git("commit", "-q", "--allow-empty", "-m", "session work");
    });

    test.each(["HEAD", SESSION_BRANCH])(
      "pushes %p to the session branch",
      (ref) => {
        expect(push(ref).status).toBe(0);
        expect(remoteBranch(SESSION_BRANCH)).toBe(git("rev-parse", "HEAD"));
      },
    );

    test("pushes to main when main is the session branch", () => {
      git("checkout", "-q", "main");
      git("commit", "-q", "--allow-empty", "-m", "second");
      expect(push("main", "main").status).toBe(0);
      expect(remoteHead()).toBe(git("rev-parse", "HEAD"));
    });

    test("doesn't push local main moved onto the session's commit", () => {
      const before = remoteHead();
      git("update-ref", "refs/heads/main", git("rev-parse", "HEAD"));
      const result = push("main");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`can only push to ${SESSION_BRANCH}`);
      expect(remoteHead()).toBe(before);
    });

    test("HEAD moved onto main still only updates the session branch", () => {
      const before = remoteHead();
      git("update-ref", "refs/heads/main", git("rev-parse", "HEAD"));
      git("symbolic-ref", "HEAD", "refs/heads/main");
      expect(push("HEAD").status).toBe(0);
      expect(remoteHead()).toBe(before);
      expect(remoteBranch(SESSION_BRANCH)).toBe(git("rev-parse", "HEAD"));
    });

    test.each([
      "main",
      "other",
      "refs/heads/main",
      `HEAD:refs/heads/main`,
      `${SESSION_BRANCH}:main`,
      "HEAD:main",
      ":main",
      `+${SESSION_BRANCH}`,
      "+HEAD",
      "+main",
      "+",
    ])("rejects %p", (ref) => {
      const before = remoteHead();
      const result = push(ref);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`can only push to ${SESSION_BRANCH}`);
      expect(remoteHead()).toBe(before);
      expect(remoteBranch(SESSION_BRANCH)).toBe("");
    });

    test("rejects flags and other remotes", () => {
      expect(push("--force").stderr).toContain("flags are not allowed");
      expect(push("HEAD", SESSION_BRANCH, "other").stderr).toContain(
        "remote must be 'origin'",
      );
    });

    test.each([null, ""])(
      "refuses to push when no session branch is set: %p",
      (branch) => {
        const result = push("HEAD", branch);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("CLAUDE_PUSH_BRANCH is not set");
        expect(remoteBranch(SESSION_BRANCH)).toBe("");
      },
    );

    test("a non-fast-forward fails on the remote", () => {
      expect(push("HEAD").status).toBe(0);
      const before = remoteBranch(SESSION_BRANCH);
      git("commit", "-q", "--amend", "--allow-empty", "-m", "rewritten");
      expect(push("HEAD").status).not.toBe(0);
      expect(remoteBranch(SESSION_BRANCH)).toBe(before);
    });
  });
});
