import * as core from "@actions/core";
import { execFileSync } from "child_process";
import { lstatSync, readFileSync, rmSync, writeFileSync, type Stats } from "fs";
import { homedir } from "os";
import { isAbsolute, join } from "path";

type TrackedFile = { label: string; path: string };

type FileSnapshot = TrackedFile & {
  content: Buffer | null;
  mode?: number;
  wasSymlink: boolean;
};

function resolveGitPath(file: string): string | null {
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return isAbsolute(path) ? path : join(process.cwd(), path);
  } catch {
    return null;
  }
}

/**
 * Files that later steps trust and that a session can change. The runner applies
 * GITHUB_ENV and GITHUB_PATH to every later step, post steps included, and those
 * steps run git, which reads these config files and can run programs they name.
 */
function filesLaterStepsTrust(): TrackedFile[] {
  const home = process.env.HOME || homedir();
  const candidates: [string, string | null | undefined][] = [
    ["GITHUB_ENV", process.env.GITHUB_ENV],
    ["GITHUB_PATH", process.env.GITHUB_PATH],
    [".git/config", resolveGitPath("config")],
    [".git/config.worktree", resolveGitPath("config.worktree")],
    ["~/.gitconfig", join(home, ".gitconfig")],
    [
      "git config in XDG_CONFIG_HOME",
      join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "git/config"),
    ],
  ];
  return candidates.flatMap(([label, path]) => (path ? [{ label, path }] : []));
}

function readSnapshot(file: TrackedFile): FileSnapshot {
  let stats: Stats | undefined;
  try {
    stats = lstatSync(file.path);
  } catch {
    return { ...file, content: null, wasSymlink: false };
  }
  try {
    return {
      ...file,
      content: readFileSync(file.path),
      // A symlink's own mode says nothing about the file it points to.
      mode: stats.isSymbolicLink() ? undefined : stats.mode & 0o777,
      wasSymlink: stats.isSymbolicLink(),
    };
  } catch {
    return { ...file, content: null, wasSymlink: stats.isSymbolicLink() };
  }
}

function isUnchanged(before: FileSnapshot, now: FileSnapshot): boolean {
  if (before.wasSymlink !== now.wasSymlink) return false;
  if (before.content === null || now.content === null) {
    return before.content === now.content;
  }
  return before.content.equals(now.content);
}

/**
 * Records the files later steps trust, and returns a function that puts them
 * back. Call the returned function as soon as the session ends and before the
 * action runs git again. Replacing a file rather than writing to it means a
 * session cannot redirect the write by swapping in a symlink.
 *
 * This stops a session that can only write through its tools. It is not a
 * sandbox: code running as the runner's user can stop the action before it
 * restores anything.
 */
export function snapshotSessionFiles(): () => void {
  const snapshots = filesLaterStepsTrust().map(readSnapshot);

  return () => {
    const restored: string[] = [];
    for (const before of snapshots) {
      try {
        if (isUnchanged(before, readSnapshot(before))) continue;
        rmSync(before.path, { force: true, recursive: true });
        if (before.content !== null) {
          writeFileSync(before.path, before.content, { mode: before.mode });
        }
        restored.push(before.label);
      } catch (error) {
        // The label is fixed text, and the error code carries no file content.
        const { code } = error as { code?: string };
        core.warning(
          `Could not restore ${before.label} after the session (${code ?? "unknown error"})`,
        );
      }
    }
    if (restored.length > 0) {
      core.warning(
        `The session changed files that later steps trust, so they were restored: ${restored.join(", ")}`,
      );
    }
  };
}

/**
 * Makes git ignore settings that run programs, for this process and everything
 * it starts. GIT_CONFIG_* outranks every config file, and existing entries are
 * kept. It is not written to GITHUB_ENV, so later steps are unaffected.
 */
export function disableGitPrograms({ hooks }: { hooks: boolean }): void {
  const settings: [string, string][] = [["core.fsmonitor", "false"]];
  if (hooks) settings.push(["core.hooksPath", "/dev/null"]);

  let count = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "", 10) || 0;
  for (const [key, value] of settings) {
    process.env[`GIT_CONFIG_KEY_${count}`] = key;
    process.env[`GIT_CONFIG_VALUE_${count}`] = value;
    count++;
  }
  process.env.GIT_CONFIG_COUNT = String(count);
}
