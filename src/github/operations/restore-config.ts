import { execFileSync } from "child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
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
  // Documented @-imports resolve against the working tree, so these root
  // files would load from the PR head after CLAUDE.md is restored from base.
  // Nested imports (e.g. @docs/AGENTS.md) are restored by walking the
  // already-restored @-import closure — not by globbing **/AGENTS.md, which
  // would treat a matching directory as a recursive restore target.
  "AGENTS.md",
  "AGENTS.local.md",
  ".husky",
];

const CLAUDE_PR_EXCLUDE_PATTERN = "/.claude-pr/";

// Claude Code expands @-imports from project instruction files at launch,
// recursively, up to four hops. Relative specs resolve against the importing
// file. Code spans and fenced blocks are literal (https://code.claude.com/docs/en/memory).
const MAX_IMPORT_HOPS = 4;
const IMPORT_ROOTS = ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"];
const AT_IMPORT_RE =
  /(?<![A-Za-z0-9._-])@((?:\.\.\/|\.\/)?[.A-Za-z0-9_][A-Za-z0-9_./-]*)/g;

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

function stripMarkdownCode(content: string): string {
  return content.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
}

function extractAtImportSpecs(content: string): string[] {
  const specs: string[] = [];
  const text = stripMarkdownCode(content);
  AT_IMPORT_RE.lastIndex = 0;
  for (const match of text.matchAll(AT_IMPORT_RE)) {
    if (match[1]) {
      specs.push(match[1]);
    }
  }
  return specs;
}

// Repo-relative posix path, or null if the spec is absolute, home-relative,
// or escapes the working tree after resolving against the importing file.
function resolveImportPath(fromFile: string, spec: string): string | null {
  if (spec.startsWith("~") || spec.startsWith("/") || posix.isAbsolute(spec)) {
    return null;
  }
  const fromDir = posix.dirname(fromFile);
  const resolved = posix.normalize(
    fromDir === "." ? spec : posix.join(fromDir, spec),
  );
  if (
    resolved === "." ||
    resolved === "" ||
    resolved === ".." ||
    resolved.startsWith("../") ||
    resolved.split("/").includes("..")
  ) {
    return null;
  }
  return resolved;
}

function isBaseBlob(baseBranch: string, repoPath: string): boolean {
  try {
    const listing = execFileSync(
      "git",
      ["ls-tree", `origin/${baseBranch}`, "--", repoPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return /(^|\s)blob\s/.test(listing);
  } catch {
    return false;
  }
}

function isExistingDirectory(repoPath: string): boolean {
  const stat = lstatSync(repoPath, { throwIfNoEntry: false });
  return stat?.isDirectory() === true;
}

function isExistingFile(repoPath: string): boolean {
  try {
    return existsSync(repoPath) && statSync(repoPath).isFile();
  } catch {
    return false;
  }
}

/**
 * After SENSITIVE_PATHS are restored, walk @-imports in those restored
 * instruction files and restore each repo-relative target from base. Parses
 * only already-restored content so a PR cannot enlarge the closure. Directory
 * targets are ignored (no glob / no recursive tree restore).
 */
function restoreImportClosure(
  baseBranch: string,
  workTreeRealPath: string,
  tracked: TrackedPaths,
): string[] {
  const extraRestored: string[] = [];
  const handled = new Set<string>(SENSITIVE_PATHS);
  const parsed = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [];

  for (const root of IMPORT_ROOTS) {
    if (isExistingFile(root)) {
      queue.push({ path: root, depth: 0 });
    }
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || parsed.has(item.path) || item.depth >= MAX_IMPORT_HOPS) {
      continue;
    }
    parsed.add(item.path);
    if (!isExistingFile(item.path)) {
      continue;
    }

    let content: string;
    try {
      content = readFileSync(item.path, "utf8");
    } catch {
      continue;
    }

    for (const spec of extractAtImportSpecs(content)) {
      const resolved = resolveImportPath(item.path, spec);
      if (!resolved || isExistingDirectory(resolved)) {
        continue;
      }

      if (!handled.has(resolved)) {
        handled.add(resolved);
        if (lstatSync(resolved, { throwIfNoEntry: false })) {
          snapshotSensitivePath(
            resolved,
            `.claude-pr/${resolved}`,
            workTreeRealPath,
            tracked,
          );
        }
        rmSync(resolved, { force: true });
        if (isBaseBlob(baseBranch, resolved)) {
          try {
            execFileSync(
              "git",
              ["checkout", `origin/${baseBranch}`, "--", resolved],
              { stdio: "pipe" },
            );
            extraRestored.push(resolved);
          } catch {
            // Checkout failed — path stays deleted.
          }
        }
      }

      if (item.depth + 1 < MAX_IMPORT_HOPS) {
        queue.push({ path: resolved, depth: item.depth + 1 });
      }
    }
  }

  return extraRestored;
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
 * Only the paths listed in SENSITIVE_PATHS, plus repo-relative files reachable
 * from restored CLAUDE.md / CLAUDE.local.md via @-imports, come from the base
 * branch; the rest of the working tree stays at the PR head. A base-branch hook
 * or setting that calls out through files a PR can change — package-manager
 * scripts (`bun run`, `npm run`, `yarn`, `pnpm run`), Makefile or task-runner
 * targets, repo-relative script paths, or tools that load executable project
 * config — therefore runs whatever the PR head provides. Keep restored hooks
 * self-contained: invoke the tool binary directly, pin its version, and pass
 * config on the command line rather than reading it from the checkout. This
 * extends to the runtime itself: `bunx <tool>` runs the tool under `node` when
 * `node` is on PATH, but on a Bun-only runner Bun executes the script and reads
 * `bunfig.toml` (e.g. `preload`) from the checkout, so `bunfig.toml` and
 * `.npmrc` there are PR-controlled runtime config too.
 *
 * @param baseBranch - PR base branch name. Must be pre-validated (branch.ts
 *   calls validateBranchName on it before returning).
 */
export function restoreConfigFromBase(baseBranch: string): void {
  console.log(
    `Restoring ${SENSITIVE_PATHS.join(", ")} from origin/${baseBranch} (PR head is untrusted)`,
  );

  // Snapshot every PR-authored sensitive path into .claude-pr/ before deletion
  // so review agents can inspect what the PR changes without those files ever
  // being executed. Captured before the security delete so it reflects the
  // PR-authored version. Links are followed only to tracked, unmodified content
  // inside the working tree; anything else is recorded as a placeholder file,
  // so the snapshot itself never contains links.
  rmSync(".claude-pr", { recursive: true, force: true });
  const workTreeRealPath = realpathSync(process.cwd());
  const tracked = listTrackedPaths();
  for (const p of SENSITIVE_PATHS) {
    if (lstatSync(p, { throwIfNoEntry: false })) {
      snapshotSensitivePath(p, `.claude-pr/${p}`, workTreeRealPath, tracked);
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

  for (const p of SENSITIVE_PATHS) {
    try {
      execFileSync("git", ["checkout", `origin/${baseBranch}`, "--", p], {
        stdio: "pipe",
      });
    } catch {
      // Path doesn't exist on base — it stays deleted.
    }
  }

  const extraRestored = restoreImportClosure(
    baseBranch,
    workTreeRealPath,
    tracked,
  );
  if (existsSync(".claude-pr")) {
    ensureClaudePrExcludedFromGit();
  }

  // `git checkout <ref> -- <path>` stages the restored files. Unstage so the
  // revert doesn't silently leak into commits the CLI makes later.
  const resetPaths = [...SENSITIVE_PATHS, ...extraRestored];
  try {
    execFileSync("git", ["reset", "--", ...resetPaths], {
      stdio: "pipe",
    });
  } catch {
    // Nothing was staged, or paths don't exist on HEAD — either is fine.
  }
}
