#!/usr/bin/env bun

/**
 * The ordering invariant of restoreConfigFromBase():
 *
 *   snapshot -> delete -> fetch -> checkout-from-base -> unstage
 *
 * restore-config.ts already reports 100% line coverage, which is exactly why
 * this file exists: every statement runs regardless of the order they run in,
 * so swapping the delete loop below the `git fetch` keeps the whole suite
 * green while reopening the DoS window the ordering was written to close (an
 * attacker-controlled .gitmodules present during a fetch makes git try to
 * fetch submodule objects and block on a credential prompt).
 *
 * child_process is mocked before restore-config is imported so the wrapper is
 * in place when the module binds `execFileSync`. The mock delegates to the
 * real implementation — the git subprocesses genuinely run against a throwaway
 * repository — and only records, so nothing about the behaviour under test
 * changes. Recording is gated on a flag so this file's own setup commands are
 * not mistaken for calls made by the code under test.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realChildProcess from "child_process";
import { lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// Captured as a plain reference before mocking, so the wrapper can never
// recurse into itself if the namespace object is replaced in place.
const realExecFileSync = realChildProcess.execFileSync;

type GitCall = {
  subcommand: string;
  args: string[];
  /** Which SENSITIVE_PATHS existed in the working tree when git was invoked. */
  sensitivePathsPresent: string[];
};

let calls: GitCall[] = [];
let recording = false;

const execFileSync = ((
  file: string,
  args?: readonly string[],
  options?: object,
) => {
  if (recording && file === "git" && Array.isArray(args)) {
    calls.push({
      subcommand: String(args[0] ?? ""),
      args: args.map(String),
      sensitivePathsPresent: SENSITIVE_PATHS.filter(exists),
    });
  }
  return (realExecFileSync as Function)(file, args, options);
}) as typeof realChildProcess.execFileSync;

const mockedChildProcess = { ...realChildProcess, execFileSync };
mock.module("child_process", () => ({
  ...mockedChildProcess,
  default: mockedChildProcess,
}));

const { restoreConfigFromBase, SENSITIVE_PATHS } = await import(
  "../src/github/operations/restore-config"
);

/** lstat-based so a broken symlink still counts as present. */
function exists(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false }) !== undefined;
}

describe("restoreConfigFromBase ordering", () => {
  let originalCwd: string;
  let tempDir = "";
  let repoDir: string;
  let remoteDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join("/tmp", "restore-config-order-"));
    repoDir = join(tempDir, "repo");
    remoteDir = join(tempDir, "origin.git");

    git(["init", "--bare", remoteDir], tempDir);
    git(["init", repoDir], tempDir);
    git(["checkout", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);

    writeRepoFile("CLAUDE.md", "base claude instructions\n");
    git(["add", "-A"]);
    git(["commit", "-m", "base config"]);
    git(["remote", "add", "origin", remoteDir]);
    git(["push", "-u", "origin", "main"]);

    // The PR head adds the paths whose ordering matters.
    git(["checkout", "-b", "pr"]);
    writeRepoFile(
      ".gitmodules",
      '[submodule "evil"]\n\tpath = evil\n\turl = https://example.invalid/evil.git\n',
    );
    writeRepoFile(".mcp.json", `${JSON.stringify({ mcpServers: {} })}\n`);
    writeRepoFile("CLAUDE.md", "pr claude instructions\n");
    git(["add", "-A"]);
    git(["commit", "-m", "pr config"]);

    process.chdir(repoDir);
    calls = [];
  });

  afterEach(() => {
    recording = false;
    process.chdir(originalCwd);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("deletes PR-controlled config before `git fetch` runs", () => {
    record(() => restoreConfigFromBase("main"));

    // The snapshot phase reads the PR's files, so they are still on disk when
    // it shells out to git...
    const revParse = calls.find((call) => call.subcommand === "rev-parse");
    expect(revParse).toBeDefined();
    expect(revParse!.sensitivePathsPresent).toContain(".gitmodules");
    expect(revParse!.sensitivePathsPresent).toContain(".mcp.json");

    // ...and are gone by the time the network operation starts. This is the
    // assertion that fails if the delete loop moves below the fetch.
    const fetch = calls.find((call) => call.subcommand === "fetch");
    expect(fetch).toBeDefined();
    expect(fetch!.sensitivePathsPresent).toEqual([]);
  });

  test("runs fetch, then checkout-from-base, then unstage", () => {
    record(() => restoreConfigFromBase("main"));
    const subcommands = calls.map((call) => call.subcommand);

    expect(subcommands.indexOf("rev-parse")).toBeGreaterThanOrEqual(0);
    expect(subcommands.indexOf("rev-parse")).toBeLessThan(
      subcommands.indexOf("fetch"),
    );
    expect(subcommands.indexOf("fetch")).toBeLessThan(
      subcommands.indexOf("checkout"),
    );
    expect(subcommands.lastIndexOf("checkout")).toBeLessThan(
      subcommands.indexOf("reset"),
    );
    // Unstaging is last: `git checkout <ref> -- <path>` stages what it restores,
    // and leaving it staged leaks the revert into commits the CLI makes later.
    expect(subcommands.at(-1)).toBe("reset");
  });

  test("suppresses submodule recursion on the fetch itself", () => {
    record(() => restoreConfigFromBase("main"));

    const fetch = calls.find((call) => call.subcommand === "fetch");
    expect(fetch!.args).toContain("--no-recurse-submodules");
  });

  test("checks out every sensitive path from the base ref, after `--`", () => {
    record(() => restoreConfigFromBase("main"));

    const checkouts = calls.filter((call) => call.subcommand === "checkout");
    expect(checkouts.length).toBe(SENSITIVE_PATHS.length);

    for (const checkout of checkouts) {
      expect(checkout.args[1]).toBe("origin/main");
      // Path goes after `--` so a path can never be read as a revision or flag.
      expect(checkout.args[2]).toBe("--");
      expect(SENSITIVE_PATHS).toContain(checkout.args[3]!);
    }
    expect(checkouts.map((c) => c.args[3])).toEqual([...SENSITIVE_PATHS]);
  });

  function record(fn: () => void): void {
    recording = true;
    try {
      fn();
    } finally {
      recording = false;
    }
  }

  function git(args: string[], cwd: string = repoDir): void {
    realExecFileSync("git", args, { cwd, stdio: "pipe" });
  }

  function writeRepoFile(path: string, contents: string): void {
    const fullPath = join(repoDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
});
