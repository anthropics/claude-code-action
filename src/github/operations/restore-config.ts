import { execFileSync } from "child_process";
import { cpSync, existsSync, rmSync } from "fs";

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
  "bunfig.toml",
];

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

  // Snapshot every PR-authored sensitive path into .claude-pr/ before deletion
  // so review agents can inspect what the PR changes without those files ever
  // being executed. Captured before the security delete so it reflects the
  // PR-authored version.
  rmSync(".claude-pr", { recursive: true, force: true });
  for (const p of SENSITIVE_PATHS) {
    if (existsSync(p)) {
      cpSync(p, `.claude-pr/${p}`, { recursive: true });
    }
  }
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
  for (const p of SENSITIVE_PATHS) {
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

  for (const p of SENSITIVE_PATHS) {
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
    execFileSync("git", ["reset", "--", ...SENSITIVE_PATHS], {
      stdio: "pipe",
    });
  } catch {
    // Nothing was staged, or paths don't exist on HEAD — either is fine.
  }
}

/**
 * Resolves the effective enableAllProjectMcpServers value for the wrapper
 * action. An explicit "true"/"false" from the workflow always wins; otherwise
 * project MCP servers are enabled. The wrapper restores project config files
 * from the base ref in PR contexts, so project-level MCP servers are loaded
 * from the base configuration.
 */
export function resolveEnableAllProjectMcpServers(
  inputValue: string | undefined,
): boolean {
  if (inputValue === "true") return true;
  if (inputValue === "false") return false;
  return true;
}
