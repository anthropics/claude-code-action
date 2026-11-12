import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearSessionState,
  disableGitPrograms,
  pinPushBranch,
  prepareGitForSession,
  snapshotSessionFiles,
} from "../src/github/operations/session-guard";

const KEYS = [
  "GITHUB_ACTION_PATH",
  "GITHUB_ENV",
  "GITHUB_PATH",
  "HOME",
  "XDG_CONFIG_HOME",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
  "GIT_CONFIG_KEY_1",
  "GIT_CONFIG_VALUE_1",
  "GIT_CONFIG_KEY_2",
  "GIT_CONFIG_VALUE_2",
  // git exports these into hooks, such as a pre-commit hook running this suite.
  // If inherited, git would act on the enclosing repository, not the temp one.
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
];

// A child process doesn't see deletions from process.env unless env is passed.
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", env: { ...process.env } });

describe("session guard", () => {
  let dir: string;
  let cwd: string;
  let warningSpy: any;
  let saved: Record<string, string | undefined>;

  const warnings = (): string[] =>
    warningSpy.mock.calls.map((call: any[]) => call[0]);

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    KEYS.forEach((key) => delete process.env[key]);
    dir = mkdtempSync(join(tmpdir(), "session-guard-"));
    cwd = process.cwd();
    mkdirSync(join(dir, "home"));
    mkdirSync(join(dir, "repo"));
    git("init", "-q", join(dir, "repo"));
    process.chdir(join(dir, "repo"));
    process.env.HOME = join(dir, "home");
    process.env.GITHUB_ENV = join(dir, "set_env");
    process.env.GITHUB_PATH = join(dir, "add_path");
    writeFileSync(process.env.GITHUB_ENV, "SET_BY_ACTION=1\n");
    writeFileSync(process.env.GITHUB_PATH, "/opt/tool\n");
    warningSpy = spyOn(core, "warning").mockImplementation(() => {});
  });

  afterEach(() => {
    warningSpy.mockRestore();
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("leaves unchanged files alone and logs nothing", () => {
    snapshotSessionFiles()();
    expect(readFileSync(process.env.GITHUB_ENV!, "utf8")).toBe(
      "SET_BY_ACTION=1\n",
    );
    expect(warnings()).toEqual([]);
  });

  test("undoes lines a session added to GITHUB_ENV and GITHUB_PATH", () => {
    const restore = snapshotSessionFiles();
    writeFileSync(process.env.GITHUB_ENV!, "SET_BY_ACTION=1\nHOME=/tmp/x\n");
    writeFileSync(process.env.GITHUB_PATH!, "/opt/tool\n/tmp/shims\n");
    restore();
    expect(readFileSync(process.env.GITHUB_ENV!, "utf8")).toBe(
      "SET_BY_ACTION=1\n",
    );
    expect(readFileSync(process.env.GITHUB_PATH!, "utf8")).toBe("/opt/tool\n");
    expect(warnings()[0]).toContain("GITHUB_ENV, GITHUB_PATH");
  });

  test("undoes changes to the repository's git config", () => {
    const configPath = join(dir, "repo", ".git", "config");
    const before = readFileSync(configPath, "utf8");
    const restore = snapshotSessionFiles();
    git("config", "core.fsmonitor", "/tmp/payload");
    restore();
    expect(readFileSync(configPath, "utf8")).toBe(before);
    expect(warnings()[0]).toContain(".git/config");
  });

  test("removes global git config files a session created", () => {
    const xdg = join(dir, "home", ".config", "git");
    const restore = snapshotSessionFiles();
    writeFileSync(join(dir, "home", ".gitconfig"), "[core]\n");
    mkdirSync(xdg, { recursive: true });
    writeFileSync(join(xdg, "config"), "[core]\n");
    restore();
    expect(existsSync(join(dir, "home", ".gitconfig"))).toBe(false);
    expect(existsSync(join(xdg, "config"))).toBe(false);
  });

  test("replaces a symlink a session swapped in, without writing through it", () => {
    const outside = join(dir, "outside");
    writeFileSync(outside, "untouched\n");
    const restore = snapshotSessionFiles();
    rmSync(process.env.GITHUB_ENV!);
    symlinkSync(outside, process.env.GITHUB_ENV!);
    restore();
    expect(lstatSync(process.env.GITHUB_ENV!).isSymbolicLink()).toBe(false);
    expect(readFileSync(process.env.GITHUB_ENV!, "utf8")).toBe(
      "SET_BY_ACTION=1\n",
    );
    expect(readFileSync(outside, "utf8")).toBe("untouched\n");
  });

  test("restores a file a session deleted, with its mode", () => {
    const path = process.env.GITHUB_PATH!;
    execFileSync("chmod", ["640", path]);
    const restore = snapshotSessionFiles();
    rmSync(path);
    restore();
    expect(readFileSync(path, "utf8")).toBe("/opt/tool\n");
    expect(statSync(path).mode & 0o777).toBe(0o640);
  });

  describe("a config that was already a symlink", () => {
    let target: string;
    let link: string;
    let outside: string;

    beforeEach(() => {
      target = join(dir, "real-gitconfig");
      writeFileSync(target, "[user]\n");
      execFileSync("chmod", ["600", target]);
      link = join(dir, "home", ".gitconfig");
      symlinkSync(target, link);
      outside = join(dir, "outside");
      writeFileSync(outside, "untouched\n");
    });

    test("keeps the link and restores the file it points to", () => {
      const restore = snapshotSessionFiles();
      writeFileSync(target, "[core]\n");
      restore();
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("[user]\n");
      expect(statSync(link).mode & 0o777).toBe(0o600);
    });

    test("replaces the link if a session re-pointed it", () => {
      const restore = snapshotSessionFiles();
      rmSync(link);
      symlinkSync(outside, link);
      restore();
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(readFileSync(link, "utf8")).toBe("[user]\n");
      expect(readFileSync(outside, "utf8")).toBe("untouched\n");
    });

    test("doesn't write through a symlink swapped in for the file it points to", () => {
      const restore = snapshotSessionFiles();
      rmSync(target);
      symlinkSync(outside, target);
      restore();
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(readFileSync(link, "utf8")).toBe("[user]\n");
      expect(readFileSync(outside, "utf8")).toBe("untouched\n");
    });

    test("replaces the link if a session deleted the file it points to", () => {
      const restore = snapshotSessionFiles();
      rmSync(target);
      restore();
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(readFileSync(link, "utf8")).toBe("[user]\n");
    });
  });

  describe("git settings during the session", () => {
    const local = (key: string) => {
      try {
        return git("config", "--local", key).trim();
      } catch {
        return "";
      }
    };

    beforeEach(() => {
      git("init", "-q", join(dir, "repo"));
      process.chdir(join(dir, "repo"));
    });

    test("moves the action's settings from the environment to the repository", () => {
      disableGitPrograms({ hooks: true });
      expect(process.env.GIT_CONFIG_COUNT).toBe("2");
      const restore = snapshotSessionFiles(() =>
        prepareGitForSession({ hooks: true }),
      );
      expect(process.env.GIT_CONFIG_COUNT).toBeUndefined();
      expect(process.env.GIT_CONFIG_KEY_0).toBeUndefined();
      expect(process.env.GIT_CONFIG_VALUE_1).toBeUndefined();
      expect(local("core.fsmonitor")).toBe("false");
      expect(local("core.hooksPath")).toBe("/dev/null");

      restore();
      expect(local("core.fsmonitor")).toBe("");
      expect(local("core.hooksPath")).toBe("");
      expect(warnings()).toEqual([]);
    });

    const globalConfig = (key: string) => {
      try {
        return git("config", "--global", "--get", key).trim();
      } catch {
        return "";
      }
    };

    test("refuses repositories in plain folders, and puts that back", () => {
      const restore = snapshotSessionFiles(() =>
        prepareGitForSession({ hooks: true }),
      );
      expect(globalConfig("safe.bareRepository")).toBe("explicit");
      expect(globalConfig("core.hooksPath")).toBe("");

      restore();
      expect(globalConfig("safe.bareRepository")).toBe("");
      expect(warnings()).toEqual([]);
    });

    test("restores a global config file named by GIT_CONFIG_GLOBAL", () => {
      process.env.GIT_CONFIG_GLOBAL = join(dir, "global-config");
      const restore = snapshotSessionFiles(() =>
        prepareGitForSession({ hooks: false }),
      );
      expect(readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8")).toContain(
        "explicit",
      );
      restore();
      expect(existsSync(process.env.GIT_CONFIG_GLOBAL)).toBe(false);
    });

    test("outside a repository, still refuses them and records the hook setting", () => {
      process.env.GITHUB_ACTION_PATH = dir;
      const outside = join(dir, "outside");
      mkdirSync(outside);
      process.chdir(outside);
      prepareGitForSession({ hooks: true });
      expect(globalConfig("safe.bareRepository")).toBe("explicit");
      expect(existsSync(join(dir, "scripts/.no-hooks"))).toBe(true);
      expect(existsSync(join(dir, "scripts/.git-repo"))).toBe(false);
    });

    test("sets repository config in a bare working directory", () => {
      const bare = join(dir, "bare.git");
      git("init", "-q", "--bare", bare);
      process.chdir(bare);
      prepareGitForSession({ hooks: false });
      expect(warnings()).toEqual([]);
      expect(readFileSync(join(bare, "config"), "utf8")).toContain("fsmonitor");
    });

    test("keeps a workflow's own entries in the environment", () => {
      process.env.GIT_CONFIG_COUNT = "1";
      process.env.GIT_CONFIG_KEY_0 = "user.name";
      process.env.GIT_CONFIG_VALUE_0 = "someone";
      disableGitPrograms({ hooks: false });
      prepareGitForSession({ hooks: false });
      expect(process.env.GIT_CONFIG_COUNT).toBe("1");
      expect(process.env.GIT_CONFIG_VALUE_0).toBe("someone");
      expect(process.env.GIT_CONFIG_KEY_1).toBeUndefined();
    });

    test("leaves hooks on unless asked", () => {
      disableGitPrograms({ hooks: false });
      prepareGitForSession({ hooks: false });
      expect(local("core.hooksPath")).toBe("");
      expect(local("core.fsmonitor")).toBe("false");
    });

    test("a session's own change is still reported", () => {
      const restore = snapshotSessionFiles(() =>
        prepareGitForSession({ hooks: false }),
      );
      git("config", "--local", "core.fsmonitor", "evil");
      restore();
      expect(local("core.fsmonitor")).toBe("");
      expect(warnings().join(" ")).toContain("restored");
    });

    test("records and clears what the wrappers read", () => {
      process.env.GITHUB_ACTION_PATH = dir;
      pinPushBranch("claude/x");
      prepareGitForSession({ hooks: true });
      expect(readFileSync(join(dir, "scripts/.push-branch"), "utf8")).toBe(
        "claude/x",
      );
      expect(existsSync(join(dir, "scripts/.no-hooks"))).toBe(true);
      pinPushBranch("claude/y");
      expect(readFileSync(join(dir, "scripts/.push-branch"), "utf8")).toBe(
        "claude/y",
      );
      const repoFile = join(dir, "scripts/.git-repo");
      const repoRoot = realpathSync(join(dir, "repo"));
      expect(readFileSync(repoFile, "utf8")).toBe(
        `${repoRoot}/.git\n${repoRoot}\n${process.env.HOME}\n`,
      );
      clearSessionState();
      expect(existsSync(join(dir, "scripts/.push-branch"))).toBe(false);
      expect(existsSync(join(dir, "scripts/.no-hooks"))).toBe(false);
      expect(existsSync(repoFile)).toBe(false);
    });

    test("clearing also removes a directory left in a file's place", () => {
      process.env.GITHUB_ACTION_PATH = dir;
      mkdirSync(join(dir, "scripts/.no-hooks"), { recursive: true });
      expect(() => clearSessionState()).not.toThrow();
      expect(existsSync(join(dir, "scripts/.no-hooks"))).toBe(false);
    });

    test("leaves a workflow's entries alone if nothing was added", () => {
      process.env.GIT_CONFIG_COUNT = "1";
      process.env.GIT_CONFIG_KEY_0 = "user.name";
      process.env.GIT_CONFIG_VALUE_0 = "someone";
      prepareGitForSession({ hooks: false });
      expect(process.env.GIT_CONFIG_COUNT).toBe("1");
      expect(process.env.GIT_CONFIG_VALUE_0).toBe("someone");
    });

    test("warns if it can't set the repository's config", () => {
      writeFileSync(join(dir, "repo/.git/config.lock"), "");
      prepareGitForSession({ hooks: false });
      expect(warnings().join(" ")).toContain("Could not set core.fsmonitor");
    });
  });

  test("replaces a directory a session put in a file's place", () => {
    const path = process.env.GITHUB_ENV!;
    const restore = snapshotSessionFiles();
    rmSync(path);
    mkdirSync(path);
    restore();
    expect(readFileSync(path, "utf8")).toBe("SET_BY_ACTION=1\n");
  });

  test("does not hang on a FIFO at a tracked path, and removes it", () => {
    const fifo = join(dir, "repo", ".git", "config.worktree");
    const restore = snapshotSessionFiles();
    execFileSync("mkfifo", [fifo]);
    writeFileSync(process.env.GITHUB_ENV!, "HOME=/tmp/x\n");
    restore();
    expect(existsSync(fifo)).toBe(false);
    expect(readFileSync(process.env.GITHUB_ENV!, "utf8")).toBe(
      "SET_BY_ACTION=1\n",
    );
  });

  test("removes a directory planted at a path that was absent", () => {
    const planted = join(dir, "home", ".gitconfig");
    const restore = snapshotSessionFiles();
    mkdirSync(join(planted, "nested"), { recursive: true });
    restore();
    expect(existsSync(planted)).toBe(false);
  });

  test("restores a config file pulled in through include.path", () => {
    const included = join(dir, "included.cfg");
    writeFileSync(included, "[user]\n\tname = x\n");
    git("config", "--add", "include.path", included);
    const restore = snapshotSessionFiles();
    writeFileSync(included, "[core]\n\tfsmonitor = /tmp/payload\n");
    restore();
    expect(readFileSync(included, "utf8")).toBe("[user]\n\tname = x\n");
    expect(warnings()[0]).toContain("a git config file");
    expect(warnings()[0]).not.toContain(included);
  });

  test("leaves a file alone when it was not regular before", () => {
    const path = process.env.GITHUB_PATH!;
    rmSync(path);
    mkdirSync(path);
    const restore = snapshotSessionFiles();
    rmSync(path, { recursive: true });
    writeFileSync(path, "/tmp/shims\n");
    restore();
    expect(warnings()[0]).toContain("Could not restore GITHUB_PATH");
  });

  test("never logs the content of a file", () => {
    const restore = snapshotSessionFiles();
    writeFileSync(process.env.GITHUB_ENV!, "TOKEN=not-a-real-secret\n");
    restore();
    expect(warnings().join("\n")).not.toContain("not-a-real-secret");
  });

  test("works outside a git repository", () => {
    process.chdir(dir);
    expect(() => snapshotSessionFiles()()).not.toThrow();
  });

  test("makes git ignore fsmonitor and, when asked, hooks", () => {
    disableGitPrograms({ hooks: true });
    git("config", "core.fsmonitor", "/tmp/payload");
    git("config", "core.hooksPath", "hooks");
    const read = (key: string) => git("config", key).trim();
    expect(read("core.fsmonitor")).toBe("false");
    expect(read("core.hooksPath")).toBe("/dev/null");
  });

  test("leaves hooks alone when not asked", () => {
    disableGitPrograms({ hooks: false });
    expect(process.env.GIT_CONFIG_COUNT).toBe("1");
    expect(process.env.GIT_CONFIG_KEY_0).toBe("core.fsmonitor");
  });

  test("does not add a setting twice", () => {
    disableGitPrograms({ hooks: true });
    disableGitPrograms({ hooks: true });
    expect(process.env.GIT_CONFIG_COUNT).toBe("2");
  });

  test("keeps existing GIT_CONFIG entries", () => {
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = "user.name";
    process.env.GIT_CONFIG_VALUE_0 = "someone";
    disableGitPrograms({ hooks: true });
    expect(process.env.GIT_CONFIG_COUNT).toBe("3");
    expect(process.env.GIT_CONFIG_KEY_0).toBe("user.name");
    expect(process.env.GIT_CONFIG_KEY_1).toBe("core.fsmonitor");
    expect(process.env.GIT_CONFIG_KEY_2).toBe("core.hooksPath");
  });
});
