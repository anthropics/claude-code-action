import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execGit } from "../src/github/operations/branch";

const originalCwd = process.cwd();
let dir: string;
let logSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "exec-git-"));
  process.chdir(dir);
  const git = (...args: string[]) => execFileSync("git", args);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("commit", "-q", "--allow-empty", "-m", "base");
  git("checkout", "-q", "--detach");
  git("commit", "-q", "--allow-empty", "-m", "a subject");
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

test("execGit logs git's output, which can hold a commit's subject, through console", () => {
  execGit(["checkout", "main", "--"]);
  expect(String(logSpy.mock.calls)).toContain("a subject");
});

test("execGit throws when git fails, and logs why", () => {
  expect(() => execGit(["checkout", "no-such-branch", "--"])).toThrow(
    "Command failed: git checkout no-such-branch --",
  );
  expect(String(logSpy.mock.calls)).toContain("no-such-branch");
});

test("execGit doesn't wait for a process that a hook leaves running", () => {
  mkdirSync(join(dir, ".git/hooks"), { recursive: true });
  const hook = join(dir, ".git/hooks/post-checkout");
  writeFileSync(hook, "#!/bin/sh\nsleep 20 &\necho $! > pid\n", {
    mode: 0o755,
  });
  const start = Date.now();
  execGit(["checkout", "main", "--"]);
  process.kill(Number(readFileSync(join(dir, "pid"), "utf8")));
  expect(Date.now() - start).toBeLessThan(10_000);
});
