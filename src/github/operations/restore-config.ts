import { execFileSync } from "child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, posix, relative, sep } from "path";
import { fetchDepthArgs } from "./fetch-depth";

// Paths that are both PR-controllable and read from cwd at CLI startup.
//
// Deliberately excluded from the CLI's broader auto-edit blocklist:
//   .git/        — not tracked by git; PR commits cannot place files there.
//                  Restoring it would also undo the PR checkout entirely.
//   .gitconfig   — git reads ~/.gitconfig and .git/config, never cwd/.gitconfig.
//   .bashrc etc. — shells source these from $HOME; checkout cannot reach $HOME.
//   .vscode/.idea— IDE config; nothing in the CLI's startup path reads them.
export const SENSITIVE_PATHS = [
  ".claude",
  ".mcp.json",
  ".claude.json",
  ".gitmodules",
  ".ripgreprc",
  "CLAUDE.md",
  "CLAUDE.local.md",
  ".husky",
];

const CLAUDE_PR_EXCLUDE_PATTERN = "/.claude-pr/";
const AGENT_INSTRUCTION_FILE_NAMES = new Set(["AGENTS.md", "AGENTS.local.md"]);
const AGENT_SNAPSHOT_SUFFIX = ".pr-snapshot";
const GITLINK_MODE = "160000";
const SYMLINK_MODE = "120000";

type GitTreeEntry = {
  mode: string;
  type: string;
  objectId: string;
  path: string;
};

function isSameOrInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

// Repository paths (relative to cwd, `/`-separated) that a link may resolve
// to: `files` are tracked files whose working-tree content is unchanged from
// HEAD, `dirs` are directories that contain at least one tracked file.
type TrackedPaths = { files: Set<string>; dirs: Set<string> };

// Built from the superproject only: `git ls-files` reports a submodule as a
// single entry, so paths inside a checked-out submodule are in neither set and
// links into one are recorded as placeholders.
function listTrackedPaths(): TrackedPaths {
  const gitPathList = (args: string[]) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: Infinity })
      .split("\0")
      .filter(Boolean);
  const modified = new Set(
    gitPathList([
      "diff",
      "--name-only",
      "-z",
      "--relative",
      "--ignore-submodules",
      "HEAD",
      "--",
    ]),
  );
  const tracked: TrackedPaths = { files: new Set(), dirs: new Set() };
  for (const file of gitPathList(["ls-files", "-z"])) {
    if (!modified.has(file)) {
      tracked.files.add(file);
    }
    for (
      let dir = posix.dirname(file);
      dir !== "." && !tracked.dirs.has(dir);
      dir = posix.dirname(dir)
    ) {
      tracked.dirs.add(dir);
    }
  }
  return tracked;
}

// AGENTS.md files can be loaded directly from the working tree or imported by
// restored project instructions, so limiting the restore to repository-root
// paths leaves nested instructions controlled by the PR. Read names from Git
// trees rather than the filesystem: this includes files deleted by either side
// and excludes directory entries that merely have an instruction-file name.
function listTreeEntries(treeish: string): GitTreeEntry[] {
  const records = execFileSync(
    "git",
    ["ls-tree", "-r", "-t", "-z", "--full-tree", treeish],
    {
      encoding: "utf8",
      maxBuffer: Infinity,
    },
  )
    .split("\0")
    .filter(Boolean);

  return records.map((record) => {
    const tab = record.indexOf("\t");
    if (tab === -1) {
      throw new Error("Git returned an invalid ls-tree record");
    }
    const [mode, type, objectId] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (!mode || !type || !objectId || !path) {
      throw new Error("Git returned an incomplete ls-tree record");
    }
    return { mode, type, objectId, path };
  });
}

function listNestedAgentInstructionFiles(entries: GitTreeEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "blob") {
      continue;
    }
    const repoPath = entry.path;
    if (
      repoPath.includes("/") &&
      AGENT_INSTRUCTION_FILE_NAMES.has(posix.basename(repoPath))
    ) {
      paths.push(repoPath);
    }
  }
  return paths;
}

function resolveBaseInstructionPaths(
  baseRef: string,
  entries: GitTreeEntry[],
  instructionPaths: string[],
): string[] {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const gitlinks = entries
    .filter((entry) => entry.mode === GITLINK_MODE)
    .map((entry) => entry.path);
  const protectedPaths = new Set(instructionPaths);
  const resolved = new Set<string>();
  const visiting = new Set<string>();

  const visit = (repoPath: string): void => {
    if (resolved.has(repoPath)) {
      return;
    }
    if (visiting.has(repoPath)) {
      throw new Error(
        `Trusted base instruction symlink cycle includes ${JSON.stringify(repoPath)}`,
      );
    }

    const entry = byPath.get(repoPath);
    if (!entry || entry.type !== "blob") {
      throw new Error(
        `Trusted base instruction target ${JSON.stringify(repoPath)} is not a blob`,
      );
    }
    if (entry.mode !== SYMLINK_MODE) {
      resolved.add(repoPath);
      return;
    }

    visiting.add(repoPath);
    const target = execFileSync("git", ["cat-file", "blob", entry.objectId], {
      encoding: "utf8",
      maxBuffer: Infinity,
    });
    if (
      target.length === 0 ||
      target.includes("\0") ||
      posix.isAbsolute(target)
    ) {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(repoPath)} has an unsafe target`,
      );
    }
    const targetPath = posix.normalize(
      posix.join(posix.dirname(repoPath), target),
    );
    if (
      targetPath === "." ||
      targetPath === ".." ||
      targetPath.startsWith("../") ||
      targetPath.split("/").includes(".git") ||
      targetPath === ".claude-pr" ||
      targetPath.startsWith(".claude-pr/")
    ) {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(repoPath)} escapes the repository or enters a reserved path`,
      );
    }
    const gitlink = gitlinks.find(
      (path) => targetPath === path || targetPath.startsWith(`${path}/`),
    );
    if (gitlink) {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(repoPath)} enters gitlink ${JSON.stringify(gitlink)}`,
      );
    }

    const targetEntry = byPath.get(targetPath);
    if (!targetEntry || targetEntry.type !== "blob") {
      throw new Error(
        `Trusted base instruction link ${JSON.stringify(repoPath)} targets missing or non-blob path ${JSON.stringify(targetPath)}`,
      );
    }
    protectedPaths.add(targetPath);
    visit(targetPath);
    visiting.delete(repoPath);
    resolved.add(repoPath);
  };

  for (const instructionPath of instructionPaths) {
    visit(instructionPath);
  }
  if (protectedPaths.size > 0) {
    console.log(
      `Validated trusted instruction symlinks from ${baseRef}: ${protectedPaths.size} protected paths`,
    );
  }
  return [...protectedPaths];
}

function assertPopulatedGitlinksContainNoAgentInstructions(
  entries: GitTreeEntry[],
): void {
  const scan = (absoluteDir: string, gitlinkPath: string, relativeDir = "") => {
    for (const name of readdirSync(absoluteDir)) {
      if (name === ".git") {
        continue;
      }
      const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
      const absolutePath = join(absoluteDir, name);
      const stats = lstatSync(absolutePath);
      if (AGENT_INSTRUCTION_FILE_NAMES.has(name) && !stats.isDirectory()) {
        throw new Error(
          `Refusing to continue: populated gitlink ${JSON.stringify(gitlinkPath)} contains instruction file ${JSON.stringify(relativePath)}`,
        );
      }
      if (stats.isDirectory() && !stats.isSymbolicLink()) {
        scan(absolutePath, gitlinkPath, relativePath);
      }
    }
  };

  for (const entry of entries) {
    if (entry.mode !== GITLINK_MODE) {
      continue;
    }
    if (AGENT_INSTRUCTION_FILE_NAMES.has(posix.basename(entry.path))) {
      throw new Error(
        `Refusing to continue: gitlink ${JSON.stringify(entry.path)} has an instruction-file name`,
      );
    }
    let absolutePath = process.cwd();
    let populated = true;
    for (const component of entry.path.split("/")) {
      absolutePath = join(absolutePath, component);
      const stats = lstatSync(absolutePath, { throwIfNoEntry: false });
      if (!stats) {
        populated = false;
        break;
      }
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(
          `Refusing to inspect populated gitlink ${JSON.stringify(entry.path)} through a non-directory or symlink`,
        );
      }
    }
    if (populated) {
      scan(absolutePath, entry.path);
    }
  }
}

function isCoveredBySensitivePath(repoPath: string): boolean {
  return SENSITIVE_PATHS.some(
    (sensitivePath) =>
      repoPath === sensitivePath || repoPath.startsWith(`${sensitivePath}/`),
  );
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function snapshotPath(repoPath: string): string {
  const suffix = AGENT_INSTRUCTION_FILE_NAMES.has(posix.basename(repoPath))
    ? AGENT_SNAPSHOT_SUFFIX
    : "";
  return `.claude-pr/${repoPath}${suffix}`;
}

// The snapshot is scoped to tracked repository content and never contains
// links. An entry is copied with its content only when all of these hold:
//   1. its real target (through any links) lies inside the working tree;
//   2. no component of the target's path inside the tree is `.git`, and the
//      target is not inside the snapshot directory itself;
//   3. the target does not contain a directory already on the entry's own
//      path (which would recurse);
//   4. if the entry is reached through a link (it is one, or a directory above
//      it inside the sensitive path is), a file target must be tracked in the
//      checkout with its content unchanged from HEAD, and a directory target
//      must contain at least one tracked file (see listTrackedPaths). Directory
//      targets that pass are descended into and their children are checked
//      individually.
// Files and directories at their literal, non-linked location are unaffected
// by rule 4 and are copied as-is. Every other entry — targets outside the
// tree, dangling or looping links, git metadata, submodule contents, untracked
// or locally modified files reached through a link — is recorded as a
// placeholder file (see recordPlaceholder), so nothing in the snapshot
// resolves anywhere else.
function shouldSnapshotContent(
  entryPath: string,
  workTreeRealPath: string,
  tracked: TrackedPaths,
): boolean {
  try {
    const targetRealPath = realpathSync(entryPath);
    if (!isSameOrInside(targetRealPath, workTreeRealPath)) {
      return false;
    }
    const targetParts = relative(workTreeRealPath, targetRealPath).split(sep);
    if (targetParts.includes(".git") || targetParts[0] === ".claude-pr") {
      return false;
    }
    for (let dir = dirname(entryPath); ; dir = dirname(dir)) {
      if (isSameOrInside(realpathSync(dir), targetRealPath)) {
        return false;
      }
      if (dir === dirname(dir)) {
        break;
      }
    }
    const literalPath = join(
      workTreeRealPath,
      relative(process.cwd(), entryPath),
    );
    if (targetRealPath === literalPath) {
      return true;
    }
    const targetRepoPath = targetParts.join("/");
    return statSync(targetRealPath).isDirectory()
      ? tracked.dirs.has(targetRepoPath)
      : tracked.files.has(targetRepoPath);
  } catch {
    return false;
  }
}

// Writes a short regular file at `dest` describing the entry that was left
// out, so the snapshot records that something was there without linking to it.
function recordPlaceholder(src: string, dest: string): void {
  console.warn(
    `Snapshot: ${src} not included in snapshot; recording a placeholder`,
  );
  let description = "is not included in this snapshot";
  try {
    description = `was a symbolic link to ${JSON.stringify(readlinkSync(src))}; the link target is not included in this snapshot`;
  } catch {
    // Not a link (or no longer present).
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `Snapshot placeholder: ${src} ${description}.\n`);
}

/**
 * Copies a sensitive path into the review snapshot. Entries that pass the
 * check above are copied dereferenced (reviewers see the effective content);
 * every other entry is recorded as a placeholder file, never as a link.
 * Applies per entry, including links nested inside a real directory.
 */
function snapshotSensitivePath(
  src: string,
  dest: string,
  workTreeRealPath: string,
  tracked: TrackedPaths,
): void {
  const excluded: Array<{ src: string; dest: string }> = [];
  const keepOrExclude =
    (keep: (entry: string) => boolean) =>
    (entrySrc: string, entryDest: string) => {
      if (keep(entrySrc)) {
        return true;
      }
      excluded.push({ src: entrySrc, dest: entryDest });
      return false;
    };
  try {
    cpSync(src, dest, {
      recursive: true,
      dereference: true,
      filter: keepOrExclude((entry) =>
        shouldSnapshotContent(entry, workTreeRealPath, tracked),
      ),
    });
  } catch (error) {
    // Dangling links are normally caught by the filter above. If a target
    // disappears between that check and the copy, the dereferencing copy
    // throws ENOENT; start over without following links, recording every link
    // as a placeholder, instead of failing the restore.
    if (
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
    rmSync(dest, { recursive: true, force: true });
    excluded.length = 0;
    cpSync(src, dest, {
      recursive: true,
      filter: keepOrExclude((entry) => !lstatSync(entry).isSymbolicLink()),
    });
  }

  for (const entry of excluded) {
    recordPlaceholder(entry.src, entry.dest);
  }
}

// Remove a repository path without ever resolving through a linked (or
// non-directory) parent. This matters when the base contains nested
// instructions below a directory that the PR replaced with a symlink: writing
// the base file through that parent could modify a path outside the checkout.
// Obstructing parents are preserved in the review snapshot and returned so
// callers can keep their restore-induced replacement out of auto-commits.
function removeInstructionPathSafely(
  repoPath: string,
  workTreeRealPath: string,
  tracked: TrackedPaths,
): string | null {
  const parts = repoPath.split("/");
  for (let end = 1; end < parts.length; end += 1) {
    const parent = parts.slice(0, end).join("/");
    const stats = lstatSync(parent, { throwIfNoEntry: false });
    if (!stats) {
      return null;
    }
    if (!stats.isDirectory()) {
      const destination = snapshotPath(parent);
      if (!lstatSync(destination, { throwIfNoEntry: false })) {
        snapshotSensitivePath(parent, destination, workTreeRealPath, tracked);
      }
      rmSync(parent, { recursive: true, force: true });
      return parent;
    }
  }

  rmSync(repoPath, { recursive: true, force: true });
  return null;
}

function ensureClaudePrExcludedFromGit(): void {
  const excludePath = execFileSync(
    "git",
    ["rev-parse", "--git-path", "info/exclude"],
    { encoding: "utf8" },
  ).trim();

  const excludeContents = existsSync(excludePath)
    ? readFileSync(excludePath, "utf8")
    : "";

  if (excludeContents.split(/\r?\n/).includes(CLAUDE_PR_EXCLUDE_PATTERN)) {
    return;
  }

  mkdirSync(dirname(excludePath), { recursive: true });

  const prefix =
    excludeContents.length === 0 || excludeContents.endsWith("\n") ? "" : "\n";
  appendFileSync(excludePath, `${prefix}${CLAUDE_PR_EXCLUDE_PATTERN}\n`);
}

/**
 * Restores security-sensitive config paths from the PR base branch.
 *
 * The CLI's non-interactive mode trusts cwd: it reads `.mcp.json`,
 * `.claude/settings.json`, and `.claude/settings.local.json` from the working
 * directory and acts on them before any tool-permission gating — executing
 * hooks (including SessionStart), setting env vars (NODE_OPTIONS, LD_PRELOAD,
 * PATH), running apiKeyHelper/awsAuthRefresh shell commands, and auto-approving
 * MCP servers. When this action checks out a PR head, all of these are
 * attacker-controlled.
 *
 * Rather than enumerate every dangerous key, this replaces the entire `.claude/`
 * tree and `.mcp.json` with the versions from the PR base branch, which a
 * maintainer has reviewed and merged. Paths absent on base are deleted.
 *
 * Known limitation: if a PR legitimately modifies `.claude/` and the CLI later
 * commits with `git add -A`, the revert will be included in that commit. This
 * is a narrow UX tradeoff for closing the RCE surface.
 *
 * Only the paths listed in SENSITIVE_PATHS and nested instruction files named
 * AGENTS.md or AGENTS.local.md come from the base branch; the rest of the
 * working tree stays at the PR head. A base-branch hook or setting that calls
 * out through files a PR can change — package-manager scripts (`bun run`,
 * `npm run`, `yarn`, `pnpm run`), Makefile or task-runner targets, repo-relative
 * script paths, or tools that load executable project config — therefore runs
 * whatever the PR head provides. Keep restored hooks
 * self-contained: invoke the tool binary directly, pin its version, and pass
 * config on the command line rather than reading it from the checkout. This
 * extends to the runtime itself: `bunx <tool>` runs the tool under `node` when
 * `node` is on PATH, but on a Bun-only runner Bun executes the script and reads
 * `bunfig.toml` (e.g. `preload`) from the checkout, so `bunfig.toml` and
 * `.npmrc` there are PR-controlled runtime config too.
 *
 * @param baseBranch - PR base branch name. Must be pre-validated (branch.ts
 *   calls validateBranchName on it before returning).
 * @returns The paths whose working-tree state now comes from the base branch
 *   rather than the PR. Callers that stage files must exclude these, or they
 *   will commit the revert back onto the PR author's branch.
 */
export function restoreConfigFromBase(baseBranch: string): string[] {
  const headTreeEntries = listTreeEntries("HEAD");
  assertPopulatedGitlinksContainNoAgentInstructions(headTreeEntries);
  const prInstructionPaths = listNestedAgentInstructionFiles(
    headTreeEntries,
  ).filter((repoPath) => !isCoveredBySensitivePath(repoPath));
  const preFetchPaths = uniquePaths([
    ...SENSITIVE_PATHS,
    ...prInstructionPaths,
  ]);
  console.log(
    `Restoring ${preFetchPaths.join(", ")} from origin/${baseBranch} (PR head is untrusted)`,
  );

  // Snapshot every PR-authored sensitive path into .claude-pr/ before deletion
  // so review agents can inspect what the PR changes without those files ever
  // being executed. Captured before the security delete so it reflects the
  // PR-authored version. Links are followed only to tracked, unmodified content
  // inside the working tree; anything else is recorded as a placeholder file,
  // so the snapshot itself never contains links. AGENTS files get a suffix in
  // the snapshot so inspecting .claude-pr cannot load them as instructions.
  rmSync(".claude-pr", { recursive: true, force: true });
  const workTreeRealPath = realpathSync(process.cwd());
  const tracked = listTrackedPaths();
  for (const p of preFetchPaths) {
    if (lstatSync(p, { throwIfNoEntry: false })) {
      snapshotSensitivePath(p, snapshotPath(p), workTreeRealPath, tracked);
    }
  }
  if (existsSync(".claude-pr")) {
    console.log(
      "Preserved PR's sensitive paths -> .claude-pr/ for review agents (not executed)",
    );
    ensureClaudePrExcludedFromGit();
  }

  // Delete PR-controlled versions BEFORE fetching so the attacker-controlled
  // .gitmodules is absent during the network operation. If git reads .gitmodules
  // during fetch (fetch.recurseSubmodules=on-demand, the git default), it will
  // attempt to fetch submodule objects and block on credential prompts in CI —
  // causing an indefinite hang. Deleting first closes that window.
  //
  // If the restore below fails for a given path, that path stays deleted —
  // the safe fallback (no attacker-controlled config). A bare `git checkout`
  // alone wouldn't remove files the PR added, so nuke first.
  for (const p of SENSITIVE_PATHS) {
    rmSync(p, { recursive: true, force: true });
  }
  const removedInstructionParents: string[] = [];
  for (const p of prInstructionPaths) {
    const removedParent = removeInstructionPathSafely(
      p,
      workTreeRealPath,
      tracked,
    );
    if (removedParent) {
      removedInstructionParents.push(removedParent);
    }
  }

  // --no-recurse-submodules: explicitly suppress submodule fetching regardless of
  // fetch.recurseSubmodules config. Defense-in-depth alongside the delete above.
  execFileSync(
    "git",
    [
      "fetch",
      "origin",
      baseBranch,
      ...fetchDepthArgs(1),
      "--no-recurse-submodules",
    ],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  const baseRef = `origin/${baseBranch}`;
  const baseTreeEntries = listTreeEntries(baseRef);
  const baseInstructionPaths = listNestedAgentInstructionFiles(
    baseTreeEntries,
  ).filter((repoPath) => !isCoveredBySensitivePath(repoPath));
  const baseProtectedPaths = resolveBaseInstructionPaths(
    baseRef,
    baseTreeEntries,
    baseInstructionPaths,
  ).filter((repoPath) => !isCoveredBySensitivePath(repoPath));
  const restoredPaths = uniquePaths([
    ...SENSITIVE_PATHS,
    ...prInstructionPaths,
    ...baseProtectedPaths,
    ...removedInstructionParents,
  ]);

  // A PR can replace a base directory with a symlink or regular file. Remove
  // that obstruction itself before checkout, never a child reached through it.
  // Report the parent as restored too so auto-commit excludes the resulting
  // type change rather than pushing it back to the contributor's branch.
  for (const p of baseProtectedPaths) {
    const destination = snapshotPath(p);
    if (
      lstatSync(p, { throwIfNoEntry: false }) &&
      !lstatSync(destination, { throwIfNoEntry: false })
    ) {
      snapshotSensitivePath(p, destination, workTreeRealPath, tracked);
    }
    const removedParent = removeInstructionPathSafely(
      p,
      workTreeRealPath,
      tracked,
    );
    if (removedParent) {
      restoredPaths.push(removedParent);
    }
  }
  if (existsSync(".claude-pr")) {
    ensureClaudePrExcludedFromGit();
  }

  for (const p of uniquePaths([...SENSITIVE_PATHS, ...baseProtectedPaths])) {
    try {
      execFileSync(
        "git",
        ["checkout", `origin/${baseBranch}`, "--", `:(literal)${p}`],
        { stdio: "pipe" },
      );
    } catch {
      // Path doesn't exist on base — it stays deleted.
    }
  }

  // `git checkout <ref> -- <path>` stages the restored files. Unstage so the
  // revert doesn't silently leak into commits the CLI makes later.
  try {
    execFileSync(
      "git",
      [
        "reset",
        "--",
        ...uniquePaths(restoredPaths).map((p) => `:(literal)${p}`),
      ],
      { stdio: "pipe" },
    );
  } catch {
    // Nothing was staged, or paths don't exist on HEAD — either is fine.
  }

  // Every sensitive path is reported, not just the ones that changed: the
  // restore also deletes paths the PR added that are absent on base, and those
  // deletions are stageable too.
  return uniquePaths(restoredPaths);
}
