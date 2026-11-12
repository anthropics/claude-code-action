import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";

type TrackedFile = { label: string; path: string };

// "opaque" is anything that can't be saved and compared: a directory, a FIFO, a
// device, a file too large to hold, or one that can't be read.
type FileSnapshot = TrackedFile & {
  state: "absent" | "file" | "opaque";
  wasSymlink: boolean;
  content?: Buffer;
  mode?: number;
  // For a symlink: what it points to, and the regular file that ends up at.
  link?: { target: string; resolved: string };
};

const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

function resolveGitPath(file: string): string | null {
  try {
    const path = execFileSync("git", ["rev-parse", "--git-path", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env },
    }).trim();
    return isAbsolute(path) ? path : join(process.cwd(), path);
  } catch {
    return null;
  }
}

/**
 * Every config file git reads here, which includes those pulled in through
 * include.path. actions/checkout keeps its config in one of those.
 */
function gitConfigFilesInUse(): TrackedFile[] {
  try {
    const listing = execFileSync(
      "git",
      ["config", "--list", "--includes", "--show-origin", "--name-only", "-z"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env },
      },
    );
    return listing
      .split("\0")
      .filter((token, index) => index % 2 === 0 && token.startsWith("file:"))
      .map((origin) => ({
        label: "a git config file",
        path: origin.slice("file:".length),
      }));
  } catch {
    return [];
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
  const named = candidates.flatMap(([label, path]) =>
    path ? [{ label, path }] : [],
  );

  const seen = new Set<string>();
  return [...named, ...gitConfigFilesInUse()].filter(({ path }) => {
    const absolute = resolve(path);
    if (seen.has(absolute)) return false;
    seen.add(absolute);
    return true;
  });
}

function readSnapshot(file: TrackedFile): FileSnapshot {
  let wasSymlink: boolean;
  try {
    wasSymlink = lstatSync(file.path).isSymbolicLink();
  } catch {
    return { ...file, state: "absent", wasSymlink: false };
  }

  let fd: number | undefined;
  try {
    // Non-blocking, because opening a FIFO would otherwise wait for a writer.
    fd = openSync(file.path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.size > MAX_SNAPSHOT_BYTES) {
      return { ...file, state: "opaque", wasSymlink };
    }
    return {
      ...file,
      state: "file",
      wasSymlink,
      content: readFileSync(fd),
      mode: stats.mode & 0o777,
      ...(wasSymlink && {
        link: {
          target: readlinkSync(file.path),
          resolved: realpathSync(file.path),
        },
      }),
    };
  } catch {
    return { ...file, state: "opaque", wasSymlink };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function isUnchanged(before: FileSnapshot, now: FileSnapshot): boolean {
  if (before.state !== now.state || before.wasSymlink !== now.wasSymlink) {
    return false;
  }
  return before.state !== "file" || before.content!.equals(now.content!);
}

/**
 * Where to restore a file. A symlink that was there before the session and still
 * leads to the same file is left alone, and that file is restored, so a runner's
 * own link keeps working. One a session added or re-pointed gets replaced.
 */
function restorePath(before: FileSnapshot): string {
  if (!before.link) return before.path;
  try {
    return readlinkSync(before.path) === before.link.target &&
      realpathSync(before.path) === before.link.resolved
      ? before.link.resolved
      : before.path;
  } catch {
    return before.path;
  }
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
        if (before.state === "opaque") {
          core.warning(
            `Could not restore ${before.label} after the session: it was not a regular file before`,
          );
          continue;
        }
        const path = restorePath(before);
        rmSync(path, { force: true, recursive: true });
        if (before.state === "file") {
          writeFileSync(path, before.content!, { mode: before.mode });
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
  const current = new Map<string, string | undefined>();
  for (let i = 0; i < count; i++) {
    current.set(
      process.env[`GIT_CONFIG_KEY_${i}`] ?? "",
      process.env[`GIT_CONFIG_VALUE_${i}`],
    );
  }
  for (const [key, value] of settings) {
    if (current.get(key) === value) continue;
    process.env[`GIT_CONFIG_KEY_${count}`] = key;
    process.env[`GIT_CONFIG_VALUE_${count}`] = value;
    count++;
  }
  process.env.GIT_CONFIG_COUNT = String(count);
}
