import { execFileSync } from "child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { basename, dirname, isAbsolute, join } from "path";

// Paths that are both PR-controllable and read from cwd at CLI startup.
//
// Deliberately excluded from the CLI's broader auto-edit blocklist:
//   .git/        — not tracked by git; PR commits cannot place files there.
//                  Restoring it would also undo the PR checkout entirely.
//   .gitconfig   — git reads ~/.gitconfig and .git/config, never cwd/.gitconfig.
//   .bashrc etc. — shells source these from $HOME; checkout cannot reach $HOME.
//   .vscode/.idea— IDE config; nothing in the CLI's startup path reads them.
const SENSITIVE_PATHS = [
  ".claude",
  ".mcp.json",
  ".claude.json",
  ".gitmodules",
  ".ripgreprc",
  "CLAUDE.md",
  "CLAUDE.local.md",
  ".husky",
];

// Basenames Claude Code auto-loads from cwd at any depth. The root entries are
// already covered by SENSITIVE_PATHS; the recursive pass below catches nested
// occurrences (e.g. `packages/foo/CLAUDE.md`) so a PR cannot inject instructions
// through a non-root file.
const NESTED_CLAUDE_MD_BASENAMES = new Set(["CLAUDE.md", "CLAUDE.local.md"]);

// Reject paths that could escape the working tree or smuggle a NUL byte. Git
// refuses to track absolute paths, paths with `..` segments, or NUL bytes, but
// these checks are belt-and-braces in case the discovery output is ever fed
// from a different source. NOTE: a leading `-` is intentionally NOT rejected —
// every git invocation here uses `--` separator and the fs APIs take string
// paths (no shell), so dropping `-pkg/CLAUDE.md` would create a bypass where an
// attacker-named directory escapes the discovery + delete loop.
function isSafeRelativePath(p: string): boolean {
  if (!p) return false;
  if (isAbsolute(p)) return false;
  if (p.includes("\0")) return false;
  if (p.split("/").some((seg) => seg === ".." || seg === "")) return false;
  return true;
}

// `git ls-files`/`ls-tree` output on a large monorepo can exceed Node's default
// 1 MB exec buffer. 100 MB comfortably covers anything we're likely to see; if
// it still overflows, listNestedClaudeMdPaths fails closed (re-throws) rather
// than silently leaving PR-controlled nested instruction files on disk.
const GIT_LIST_MAX_BUFFER = 100 * 1024 * 1024;

// Suffix appended to snapshotted files whose basename Claude Code would
// otherwise auto-load (CLAUDE.md / CLAUDE.local.md). Without this, a snapshot
// at `.claude-pr/foo/CLAUDE.md` would itself be a nested CLAUDE.md that the CLI
// could pick up — defeating the whole restore. The suffix breaks that match
// without obscuring the original path for review agents.
const SNAPSHOT_SUFFIX = ".pr-snapshot";

function snapshotDest(p: string): string {
  const renamed = NESTED_CLAUDE_MD_BASENAMES.has(basename(p))
    ? `${p}${SNAPSHOT_SUFFIX}`
    : p;
  return join(".claude-pr", renamed);
}

// Walk a directory and rename any file whose basename Claude Code would
// auto-load, appending SNAPSHOT_SUFFIX. Necessary because cpSync(dir, dest,
// {recursive:true}) on a SENSITIVE_PATHS directory like `.claude/` brings in
// nested CLAUDE.md files verbatim — snapshotDest only rewrites the top-level
// path, not entries discovered during the recursive copy.
function suffixAutoLoadedBasenames(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      suffixAutoLoadedBasenames(full);
    } else if (NESTED_CLAUDE_MD_BASENAMES.has(entry.name)) {
      renameSync(full, `${full}${SNAPSHOT_SUFFIX}`);
    }
  }
}

// Runs a git command that emits NUL-delimited paths and filters down to nested
// CLAUDE.md / CLAUDE.local.md entries. Root entries are excluded — SENSITIVE_PATHS
// already covers those. Symlinks are intentionally NOT filtered here: a PR-added
// symlink named CLAUDE.md still needs to be deleted from the working tree before
// the CLI starts. The snapshot step in restoreConfigFromBase skips symlinks both
// at the top level (lstatSync short-circuit) and inside recursively-copied
// directories (cpSync filter), so an attacker can't exfiltrate target contents
// through `.claude-pr/`. Fails closed (re-throws) on any git error: in a healthy
// PR checkout these commands always succeed, and silently falling through to a
// root-only restore would leave PR-controlled nested CLAUDE.md on disk.
function listNestedClaudeMdPaths(gitArgs: string[]): string[] {
  let out: string;
  try {
    out = execFileSync("git", gitArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: GIT_LIST_MAX_BUFFER,
      encoding: "utf-8",
    });
  } catch (err) {
    throw new Error(
      `nested CLAUDE.md discovery failed (git ${gitArgs.join(" ")}); refusing to proceed with PR-controlled nested instruction files on disk: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return out
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => NESTED_CLAUDE_MD_BASENAMES.has(basename(p)))
    .filter((p) => p.includes("/")) // root entries handled by SENSITIVE_PATHS
    .filter(isSafeRelativePath);
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
 * In addition to the literal root entries in SENSITIVE_PATHS, this also
 * restores nested `CLAUDE.md` / `CLAUDE.local.md` files at any depth, since
 * Claude Code auto-loads them from cwd. Set
 * `DISABLE_NESTED_CLAUDE_MD_RESTORE=true` to skip the recursive pass.
 *
 * Known limitation: if a PR legitimately modifies `.claude/` and the CLI later
 * commits with `git add -A`, the revert will be included in that commit. This
 * is a narrow UX tradeoff for closing the RCE surface.
 *
 * @param baseBranch - PR base branch name. Must be pre-validated (branch.ts
 *   calls validateBranchName on it before returning).
 */
export function restoreConfigFromBase(baseBranch: string): void {
  const skipNested = process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE === "true";
  const nestedHeadPaths = skipNested
    ? []
    : listNestedClaudeMdPaths(["ls-files", "-z"]);

  const headPaths = [...SENSITIVE_PATHS, ...nestedHeadPaths];

  console.log(
    `Restoring ${SENSITIVE_PATHS.join(", ")}${
      nestedHeadPaths.length > 0
        ? ` + ${nestedHeadPaths.length} nested CLAUDE.md path(s)`
        : ""
    } from origin/${baseBranch} (PR head is untrusted)`,
  );

  // Snapshot every PR-authored sensitive path into .claude-pr/ before deletion
  // so review agents can inspect what the PR changes without those files ever
  // being executed. Captured before the security delete so it reflects the
  // PR-authored version.
  rmSync(".claude-pr", { recursive: true, force: true });
  for (const p of headPaths) {
    if (!existsSync(p)) continue;
    // Skip symlinks at top level AND inside recursively-copied directories: a
    // PR could point CLAUDE.md (or any SENSITIVE_PATHS entry, or a file inside
    // .claude/) at /etc/passwd; cpSync's default copies symlinks verbatim, so
    // a review agent reading .claude-pr/<p> would silently follow them. The
    // top-level lstat short-circuits cleanly for the common case; the filter
    // catches nested symlinks brought in by `recursive: true`.
    try {
      if (lstatSync(p).isSymbolicLink()) continue;
    } catch {
      continue;
    }
    const dest = snapshotDest(p);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(p, dest, {
      recursive: true,
      filter: (src) => {
        try {
          return !lstatSync(src).isSymbolicLink();
        } catch {
          return false;
        }
      },
    });
  }
  // Final sweep: any nested CLAUDE.md / CLAUDE.local.md that came in via a
  // recursive directory copy (e.g. .claude/hooks/CLAUDE.md inside the .claude/
  // snapshot) would still match Claude Code's auto-load. Rename them so the
  // basename can never be auto-discovered.
  suffixAutoLoadedBasenames(".claude-pr");

  if (existsSync(".claude-pr")) {
    console.log(
      "Preserved PR's sensitive paths → .claude-pr/ for review agents (not executed)",
    );
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
  for (const p of headPaths) {
    rmSync(p, { recursive: true, force: true });
  }

  // --no-recurse-submodules: explicitly suppress submodule fetching regardless of
  // fetch.recurseSubmodules config. Defense-in-depth alongside the delete above.
  execFileSync(
    "git",
    ["fetch", "origin", baseBranch, "--depth=1", "--no-recurse-submodules"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  // Base-side nested discovery has to happen after fetch — origin/<baseBranch>
  // may not have existed locally before. The union with nestedHeadPaths makes
  // sure that paths only on PR are still cleaned up (they were deleted above
  // and simply stay deleted), and paths only on base are still restored.
  const nestedBasePaths = skipNested
    ? []
    : listNestedClaudeMdPaths([
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        `origin/${baseBranch}`,
      ]);
  const restorePaths = Array.from(
    new Set([...SENSITIVE_PATHS, ...nestedHeadPaths, ...nestedBasePaths]),
  );

  for (const p of restorePaths) {
    try {
      execFileSync("git", ["checkout", `origin/${baseBranch}`, "--", p], {
        stdio: "pipe",
      });
    } catch {
      // Path doesn't exist on base — it stays deleted.
    }
  }

  // `git checkout <ref> -- <path>` stages the restored files. Unstage so the
  // revert doesn't silently leak into commits the CLI makes later.
  try {
    execFileSync("git", ["reset", "--", ...restorePaths], {
      stdio: "pipe",
    });
  } catch {
    // Nothing was staged, or paths don't exist on HEAD — either is fine.
  }
}
