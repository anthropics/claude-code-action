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
  const push = (...args: string[]) =>
    run(join(SCRIPTS, "git-push.sh"), ...args);
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

    test("amends without a new message", () => {
      expect(commit("--allow-empty", "--amend", "--no-edit").status).toBe(0);
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
      expect(commit("--amend").status).toBe(1);
    });

    test("does not read a file into the commit", () => {
      const secret = readFileSync(join(repo, ".git", "config"), "utf8");
      commit("--allow-empty", "-F", ".git/config");
      expect(git("log", "-1", "--format=%B")).not.toContain(secret.trim());
    });
  });

  describe("git-push.sh", () => {
    const rewriteHistory = () => {
      git("commit", "-q", "--amend", "--allow-empty", "-m", "rewritten");
    };

    test("pushes a fast-forward", () => {
      git("commit", "-q", "--allow-empty", "-m", "second");
      expect(push("origin", "main").status).toBe(0);
      expect(remoteHead()).toBe(git("rev-parse", "HEAD"));
    });

    test.each(["+main", "+HEAD", "+refs/heads/main", "+"])(
      "rejects a forced ref: %p",
      (ref) => {
        const before = remoteHead();
        rewriteHistory();
        const result = push("origin", ref);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("forced pushes are not allowed");
        expect(remoteHead()).toBe(before);
      },
    );

    test("a non-fast-forward without + still fails on the remote", () => {
      const before = remoteHead();
      rewriteHistory();
      expect(push("origin", "main").status).not.toBe(0);
      expect(remoteHead()).toBe(before);
    });
  });
});
