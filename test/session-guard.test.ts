import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  disableGitPrograms,
  snapshotSessionFiles,
} from "../src/github/operations/session-guard";

const KEYS = [
  "GITHUB_ENV",
  "GITHUB_PATH",
  "HOME",
  "XDG_CONFIG_HOME",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
  "GIT_CONFIG_KEY_1",
  "GIT_CONFIG_VALUE_1",
  "GIT_CONFIG_KEY_2",
  "GIT_CONFIG_VALUE_2",
];

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
    execFileSync("git", ["init", "-q", join(dir, "repo")]);
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
    execFileSync("git", ["config", "core.fsmonitor", "/tmp/payload"]);
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

  test("replaces a directory a session put in a file's place", () => {
    const path = process.env.GITHUB_ENV!;
    const restore = snapshotSessionFiles();
    rmSync(path);
    mkdirSync(path);
    restore();
    expect(readFileSync(path, "utf8")).toBe("SET_BY_ACTION=1\n");
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
    execFileSync("git", ["config", "core.fsmonitor", "/tmp/payload"]);
    execFileSync("git", ["config", "core.hooksPath", "hooks"]);
    const read = (key: string) =>
      execFileSync("git", ["config", key], { encoding: "utf8" }).trim();
    expect(read("core.fsmonitor")).toBe("false");
    expect(read("core.hooksPath")).toBe("/dev/null");
  });

  test("leaves hooks alone when not asked", () => {
    disableGitPrograms({ hooks: false });
    expect(process.env.GIT_CONFIG_COUNT).toBe("1");
    expect(process.env.GIT_CONFIG_KEY_0).toBe("core.fsmonitor");
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
