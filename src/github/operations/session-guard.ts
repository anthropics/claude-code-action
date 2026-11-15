import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";

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

const SESSION_STATE_FILES = [".push-branch", ".no-hooks", ".git-repo"];

// How many GIT_CONFIG_* entries were there before disableGitPrograms added any.
let entriesBeforeAction: number | undefined;

const codeOf = (error: unknown): string =>
  (error as { code?: string }).code ?? "unknown error";

function gitProgramSettings({ hooks }: { hooks: boolean }): [string, string][] {
  return hooks
    ? [
        ["core.fsmonitor", "false"],
        ["core.hooksPath", "/dev/null"],
      ]
    : [["core.fsmonitor", "false"]];
}

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
    ["GIT_CONFIG_GLOBAL", process.env.GIT_CONFIG_GLOBAL],
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
export function snapshotSessionFiles(beforeSession?: () => void): () => void {
  const files = filesLaterStepsTrust();
  const snapshots = files.map(readSnapshot);
  // What the action changes for the session goes back too, without a warning.
  beforeSession?.();
  const atStart = files.map(readSnapshot);

  return () => {
    const restored: string[] = [];
    for (const [index, before] of snapshots.entries()) {
      try {
        const now = readSnapshot(before);
        if (isUnchanged(before, now)) continue;
        const changedBySession = !isUnchanged(atStart[index]!, now);
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
        if (changedBySession) restored.push(before.label);
      } catch (error) {
        // The label is fixed text, and the error code carries no file content.
        core.warning(
          `Could not restore ${before.label} after the session (${codeOf(error)})`,
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
  let count = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "", 10) || 0;
  entriesBeforeAction ??= count;
  const current = new Map<string, string | undefined>();
  for (let i = 0; i < count; i++) {
    current.set(
      process.env[`GIT_CONFIG_KEY_${i}`] ?? "",
      process.env[`GIT_CONFIG_VALUE_${i}`],
    );
  }
  for (const [key, value] of gitProgramSettings({ hooks })) {
    if (current.get(key) === value) continue;
    process.env[`GIT_CONFIG_KEY_${count}`] = key;
    process.env[`GIT_CONFIG_VALUE_${count}`] = value;
    count++;
  }
  process.env.GIT_CONFIG_COUNT = String(count);
}

const sessionFile = (name: string): string | undefined =>
  process.env.GITHUB_ACTION_PATH
    ? join(process.env.GITHUB_ACTION_PATH, "scripts", name)
    : undefined;

function writeSessionFile(name: string, content: string): void {
  const path = sessionFile(name);
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  rmSync(path, { force: true, recursive: true });
  writeFileSync(path, content, { mode: 0o444 });
}

/** Records the only branch the push wrapper may update. */
export function pinPushBranch(branch: string): void {
  try {
    writeSessionFile(".push-branch", branch);
  } catch (error) {
    // With no file and no variable, the wrapper refuses to push.
    core.warning(`Could not record the session's branch (${codeOf(error)})`);
  }
}

/** Removes what the wrappers read, so another step in this job can't inherit it. */
export function clearSessionState(): void {
  for (const name of SESSION_STATE_FILES) {
    const path = sessionFile(name);
    if (!path) continue;
    try {
      rmSync(path, { force: true, recursive: true });
    } catch (error) {
      core.warning(`Could not remove ${name} (${codeOf(error)})`);
    }
  }
}

const gitOutput = (...args: string[]): string | null => {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env },
    }).trim();
  } catch {
    return null;
  }
};

/**
 * Moves the settings from disableGitPrograms out of the environment for the session.
 * Repository config and the wrappers keep them in force instead, and
 * snapshotSessionFiles puts the config back afterwards. Elsewhere the concern is a
 * repository git finds in a plain folder, with its own config. Git only reads
 * safe.bareRepository from global config or the command line.
 */
export function prepareGitForSession({ hooks }: { hooks: boolean }): void {
  const count = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "", 10) || 0;
  const before = entriesBeforeAction ?? count;
  for (let i = before; i < count; i++) {
    delete process.env[`GIT_CONFIG_KEY_${i}`];
    delete process.env[`GIT_CONFIG_VALUE_${i}`];
  }
  if (before > 0) process.env.GIT_CONFIG_COUNT = String(before);
  else delete process.env.GIT_CONFIG_COUNT;
  entriesBeforeAction = undefined;

  const setConfig = (scope: string, entries: [string, string][]): void => {
    for (const [key, value] of entries) {
      if (gitOutput("config", scope, "--replace-all", key, value) === null) {
        core.warning(`Could not set ${key} for the session`);
      }
    }
  };

  // Before the global setting, which stops git from finding a bare repository here.
  const gitDir = gitOutput("rev-parse", "--absolute-git-dir");
  const workTree = gitDir && gitOutput("rev-parse", "--show-toplevel");
  if (gitDir) setConfig("--local", gitProgramSettings({ hooks }));
  setConfig("--global", [["safe.bareRepository", "explicit"]]);

  try {
    if (hooks) writeSessionFile(".no-hooks", "");
    if (gitDir && workTree) {
      const home = process.env.HOME || homedir();
      writeSessionFile(".git-repo", `${gitDir}\n${workTree}\n${home}\n`);
    }
  } catch (error) {
    core.warning(
      `Could not record git settings for the wrappers (${codeOf(error)})`,
    );
  }
}
