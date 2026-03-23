import { execFileSync } from "child_process";
import { rmSync } from "fs";

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
];

// Timeout for individual git operations (60 seconds). Prevents indefinite hangs
// when git triggers submodule operations or credential prompts.
const GIT_TIMEOUT_MS = 60_000;

// Environment overrides that prevent git from hanging on credential prompts or
// recursing into submodules. Applied to every git subprocess in this module.
const SAFE_GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  // Prevent git from opening an interactive credential prompt (would block the
  // runner forever in a non-interactive CI environment).
  GIT_TERMINAL_PROMPT: "0",
  // Prevent automatic submodule operations that can be triggered when
  // .gitmodules is checked out. Without this, `git checkout -- .gitmodules`
  // can cause git to fetch/update submodules, which may hang indefinitely
  // if the submodule URLs require authentication not available to the runner.
  GIT_SUBMODULE_UPDATE_COMMAND: "true",
};

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
 * @param baseBranch - PR base branch name. Must be pre-validated (branch.ts
 *   calls validateBranchName on it before returning).
 */
export function restoreConfigFromBase(baseBranch: string): void {
  console.log(
    `Restoring ${SENSITIVE_PATHS.join(", ")} from origin/${baseBranch} (PR head is untrusted)`,
  );

  // Fetch base first — if this fails we haven't touched the workspace and the
  // caller sees a clean error. --no-recurse-submodules prevents git from
  // fetching submodule objects referenced by .gitmodules on the base branch.
  execFileSync(
    "git",
    ["fetch", "origin", baseBranch, "--depth=1", "--no-recurse-submodules"],
    {
      stdio: "inherit",
      timeout: GIT_TIMEOUT_MS,
      env: SAFE_GIT_ENV,
    },
  );

  // Delete PR-controlled versions. If the restore below fails for a given path,
  // that path stays deleted — the safe fallback (no attacker-controlled config).
  // A bare `git checkout` alone wouldn't remove files the PR added, so nuke first.
  for (const p of SENSITIVE_PATHS) {
    rmSync(p, { recursive: true, force: true });
  }

  for (const p of SENSITIVE_PATHS) {
    try {
      execFileSync(
        "git",
        ["checkout", `origin/${baseBranch}`, "--", p],
        {
          stdio: "pipe",
          timeout: GIT_TIMEOUT_MS,
          env: SAFE_GIT_ENV,
        },
      );
    } catch {
      // Path doesn't exist on base — it stays deleted.
    }
  }

  // `git checkout <ref> -- <path>` stages the restored files. Unstage so the
  // revert doesn't silently leak into commits the CLI makes later.
  try {
    execFileSync("git", ["reset", "--", ...SENSITIVE_PATHS], {
      stdio: "pipe",
      timeout: GIT_TIMEOUT_MS,
      env: SAFE_GIT_ENV,
    });
  } catch {
    // Nothing was staged, or paths don't exist on HEAD — either is fine.
  }
}
