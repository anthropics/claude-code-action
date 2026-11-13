import * as core from "@actions/core";
import { execFileSync } from "child_process";
import {
  lstatSync,
  mkdirSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";
import {
  ensureClaudePrExcludedFromGit,
  SENSITIVE_PATHS,
} from "./restore-config";

// What npm and Bun read from the repository root to decide which program to run and
// where to download it from. Config from the base branch can start them, for example
// in a hook or an MCP server. node_modules counts because its .bin comes first on PATH,
// and package.json because npx looks for commands there first.
const TOOL_CONFIG = [".npmrc", "bunfig.toml", "node_modules"];
const PACKAGE_JSON = "package.json";

// The fields that provide commands. A bin that is a string is named after the package,
// and npx looks in workspaces too.
const COMMAND_FIELDS = ["name", "bin", "directories", "workspaces"];
const NO_COMMANDS = "none";

const MAX_OUTPUT_BYTES = 1024 ** 3;
const MAX_PACKAGE_JSON_BYTES = 4 * 1024 * 1024;

type Entry = { mode: string; oid: string };
type Replacement = { path: string; entry: Entry; content?: Buffer };

// File names can be any bytes. Latin-1 keeps each one intact.
const fsPath = (path: string): Buffer => Buffer.from(path, "latin1");
const isFile = (entry: Entry): boolean => entry.mode.startsWith("100");
const isLink = (entry: Entry): boolean => entry.mode === "120000";
const isSubmodule = (entry: Entry): boolean => entry.mode === "160000";

// No file name or content, which the pull request controls, reaches the log.
function warn(what: string, error: unknown): void {
  const { code, status } = error as { code?: string; status?: number };
  core.warning(`${what} (${code ?? `exit code ${status ?? "unknown"}`})`);
}

function git(args: string[], input = ""): Buffer {
  return execFileSync("git", args, {
    stdio: ["pipe", "pipe", "ignore"],
    input,
    env: { ...process.env },
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

// A parent that is a file or a looping link means there is nothing there.
function onDisk(path: string) {
  try {
    return lstatSync(fsPath(path));
  } catch {
    return undefined;
  }
}

// File systems can ignore case, and some the way a character is encoded.
const fold = (path: string): string =>
  fsPath(path).toString().normalize("NFKC").toLowerCase();

/** Which tool config a path belongs to. */
function rootName(path: string): string | undefined {
  const folded = fold(path);
  // A directory with one of these names is in the file's place, whatever it holds.
  const name = TOOL_CONFIG.find(
    (name) => folded === name || folded.startsWith(`${name}/`),
  );
  if (name) return name;
  // These come from the base branch already, and the index still has the pull
  // request's version, so nothing here may be rebuilt from it.
  const isRestored = SENSITIVE_PATHS.some((restored) =>
    folded.startsWith(`${fold(restored)}/`),
  );
  return !isRestored &&
    (folded === PACKAGE_JSON || folded.endsWith(`/${PACKAGE_JSON}`))
    ? PACKAGE_JSON
    : undefined;
}

/** Whether no parent of a path is a link, which could lead out of the checkout. */
function hasRealParents(path: string): boolean {
  for (let dir = dirname(path); dir !== "."; dir = dirname(dir)) {
    if (onDisk(dir)?.isSymbolicLink()) return false;
  }
  return true;
}

function remove(path: string): void {
  rmSync(fsPath(path), { recursive: true, force: true });
  // An empty directory would stand in the way of a file of that name.
  try {
    for (let dir = dirname(path); dir !== "."; dir = dirname(dir)) {
      rmdirSync(fsPath(dir));
    }
  } catch {
    // It isn't empty.
  }
}

// Each entry is "<mode> <other fields>\t<path>", relative to the working directory.
function parseEntries(listing: Buffer, oidField: number): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  for (const line of listing.toString("latin1").split("\0")) {
    const [info, path] = line.split(/\t(.*)/s);
    if (!info || !path || !rootName(path)) continue;
    const fields = info.split(" ");
    entries.set(path, { mode: fields[0]!, oid: fields[oidField]! });
  }
  return entries;
}

const pullRequestEntries = (): Map<string, Entry> =>
  parseEntries(git(["ls-files", "--stage", "-z"]), 1);

// A checkout with a narrow refspec has no remote-tracking branch, only FETCH_HEAD.
function baseEntries(baseBranch: string): Map<string, Entry> {
  let ref = `refs/remotes/origin/${baseBranch}`;
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    ref = "FETCH_HEAD";
  }
  return parseEntries(git(["ls-tree", "-r", "-z", ref]), 2);
}

/** The stored content of each entry, which no .gitattributes has been applied to. */
function readBlobs(entries: Entry[]): Map<string, Buffer> {
  const blobs = new Map<string, Buffer>();
  const oids = [...new Set(entries.map(({ oid }) => oid))];
  if (oids.length === 0) return blobs;
  const output = git(["cat-file", "--batch"], `${oids.join("\n")}\n`);
  // "<oid> <type> <size>\n<content>\n", or "<oid> missing\n"
  for (let at = 0; at < output.length; ) {
    const end = output.indexOf("\n", at);
    const [oid, , size] = output.toString("latin1", at, end).split(" ");
    at = end + 1;
    if (size === undefined) continue;
    blobs.set(oid!, output.subarray(at, at + Number(size)));
    at += Number(size) + 1;
  }
  return blobs;
}

type Json = Record<string, unknown>;

/** Reads a package.json, or returns undefined if it can't be understood. */
function readPackageJson(entry: Entry): Json | undefined {
  if (!isFile(entry)) return undefined;
  try {
    const size = Number(git(["cat-file", "-s", entry.oid]).toString());
    if (size > MAX_PACKAGE_JSON_BYTES) return undefined;
    // trimStart also drops a byte order mark.
    const content = git(["cat-file", "blob", entry.oid]).toString().trimStart();
    const json = JSON.parse(content);
    return json && typeof json === "object" ? json : undefined;
  } catch {
    return undefined;
  }
}

/** The commands a package.json provides, or undefined if that can't be told. */
function commands(entry: Entry | undefined): string | undefined {
  if (!entry) return NO_COMMANDS;
  const json = readPackageJson(entry);
  if (!json) return undefined;
  if (!json.bin && !json.directories && !json.workspaces) return NO_COMMANDS;
  return JSON.stringify(COMMAND_FIELDS.map((field) => json[field] ?? null));
}

/**
 * The root files that .gitattributes makes git write in another encoding, so that what
 * is on disk is not what git has. The pull request controls .gitattributes.
 */
function reencodedFiles(): Set<string> {
  const names = TOOL_CONFIG.filter((name) => name !== "node_modules");
  const fields = git([
    "check-attr",
    "-z",
    "working-tree-encoding",
    "--",
    ...names,
  ])
    .toString()
    .split("\0");
  // "<path> <attribute> <value>", each ended by a NUL
  return new Set(
    names.filter((_, i) => {
      const value = fields[i * 3 + 2];
      return value !== "unspecified" && value !== "unset";
    }),
  );
}

function differs(path: string, pr?: Entry, base?: Entry): boolean {
  if (pr?.oid === base?.oid && pr?.mode === base?.mode) return false;
  if (rootName(path) !== PACKAGE_JSON) return true;
  // Only one that provides commands matters, so most pull requests keep their own.
  const provided = pr ? commands(pr) : NO_COMMANDS;
  return provided !== NO_COMMANDS && (!provided || provided !== commands(base));
}

/** The pull request's package.json with the base branch's commands. */
function withBaseCommands(
  pr: Entry,
  base: Entry | undefined,
): Buffer | undefined {
  const json = readPackageJson(pr);
  const baseJson = base ? readPackageJson(base) : {};
  if (!json || !baseJson) return undefined;
  for (const field of COMMAND_FIELDS) {
    // Without a bin, a new package's name provides no command.
    if (field === "name" && !base) continue;
    if (baseJson[field] === undefined) delete json[field];
    else json[field] = baseJson[field];
  }
  return Buffer.from(`${JSON.stringify(json, null, 2)}\n`);
}

/** Keeps the pull request's version readable, as for the other restored config. */
function snapshotForReview(path: string, entry: Entry): void {
  if (!isFile(entry) || rootName(path) === "node_modules") return;
  try {
    const content = git(["cat-file", "blob", entry.oid]);
    const copy = fsPath(`.claude-pr/${path}`);
    mkdirSync(fsPath(`.claude-pr/${dirname(path)}`), { recursive: true });
    writeFileSync(copy, content);
    ensureClaudePrExcludedFromGit();
  } catch (error) {
    warn("Could not keep a copy of tool config for review", error);
  }
}

/**
 * Replaces the pull request's tool config with the base branch's wherever they differ.
 * Like restoreConfigFromBase, which must run first because it fetches the base branch,
 * it changes the working tree and not the index. Only tracked files are replaced, so
 * what an earlier step created stays. In a package.json only the commands are replaced.
 *
 * @returns The names that were replaced, from a fixed list. Callers that stage files
 *   must exclude them.
 * @throws If the base branch's version can't be put in place. The message holds no
 *   file name, because the pull request controls those.
 */
export function restoreToolConfigFromBase(baseBranch: string): string[] {
  try {
    return restoreToolConfig(baseBranch);
  } catch (error) {
    warn("Could not replace tool config", error);
    throw new Error(
      "Could not use the base branch's version of the files that npm and Bun read",
    );
  }
}

function restoreToolConfig(baseBranch: string): string[] {
  const pr = pullRequestEntries();
  const base = baseEntries(baseBranch);
  const all = [...new Set([...pr.keys(), ...base.keys()])];
  // npx reads the packages in subdirectories only through the root's workspaces, and
  // a pull request's own are replaced below.
  const rootJson = base.get(PACKAGE_JSON);
  const hasWorkspaces =
    rootJson !== undefined &&
    readPackageJson(rootJson)?.workspaces !== undefined;
  const matters = (path: string): boolean =>
    hasWorkspaces || rootName(path) !== PACKAGE_JSON || !path.includes("/");

  const reencoded = reencodedFiles();
  // Names that differ only in case can be the same file.
  const differing = new Set(
    all
      .filter(
        (path) =>
          matters(path) &&
          (reencoded.has(path) || differs(path, pr.get(path), base.get(path))),
      )
      .map(fold),
  );
  const candidates = all.filter((path) => differing.has(fold(path)));

  // A directory where the pull request has a file or link came from an earlier step.
  const replaced = candidates.filter((path) => {
    const entry = pr.get(path);
    const stats = entry && onDisk(path);
    return (
      stats &&
      (!stats.isDirectory() || isSubmodule(entry)) &&
      hasRealParents(path)
    );
  });
  // All of these go before anything is written.
  for (const path of replaced) {
    snapshotForReview(path, pr.get(path)!);
    remove(path);
  }

  const removed = new Set(replaced);
  const toWrite = candidates.flatMap((path): Replacement[] => {
    const entry = base.get(path);
    const prEntry = pr.get(path);
    // One that the pull request has but is not on disk was left out or deleted by the
    // workflow. One that only the base has matters unless it's a package.json.
    const wanted = prEntry
      ? removed.has(path)
      : rootName(path) !== PACKAGE_JSON;
    if (!wanted || onDisk(path)) return [];
    const content =
      prEntry && rootName(path) === PACKAGE_JSON
        ? withBaseCommands(prEntry, entry)
        : undefined;
    if (content) return [{ path, entry: prEntry!, content }];
    return entry && !isSubmodule(entry) ? [{ path, entry, content }] : [];
  });
  const blobs = readBlobs(
    toWrite.flatMap(({ entry, content }) => (content ? [] : [entry])),
  );
  const written: string[] = [];
  for (const { path, entry, content = blobs.get(entry.oid) } of toWrite) {
    if (!hasRealParents(path)) continue;
    if (!content) throw new Error("missing object");
    mkdirSync(fsPath(dirname(path)), { recursive: true });
    if (isLink(entry)) symlinkSync(content, fsPath(path));
    else {
      const mode = entry.mode === "100755" ? 0o755 : 0o644;
      writeFileSync(fsPath(path), content, { mode, flag: "wx" });
    }
    written.push(path);
  }

  const names = [
    ...new Set([...replaced, ...written].map((path) => rootName(path)!)),
  ];
  if (names.length > 0) {
    core.warning(
      `The pull request and its base branch differ in what npm and Bun read (${names.join(", ")}), so the base branch's version is used and Claude can't edit it. See docs/security.md.`,
    );
  }
  return names;
}

/**
 * Rules that stop a session from editing tool config, for a pull request whose author
 * doesn't have write access. Other package.json edits are ordinary work.
 */
export const toolConfigDenyRules = (replaced: string[]): string[] => [
  ...TOOL_CONFIG.map((name) =>
    name === "node_modules" ? "Edit(./node_modules/**)" : `Edit(./${name})`,
  ),
  ...(replaced.includes(PACKAGE_JSON) ? ["Edit(package.json)"] : []),
];
