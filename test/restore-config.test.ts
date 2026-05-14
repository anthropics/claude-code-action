import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, env: GIT_ENV, stdio: "pipe" });
}

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

interface Repo {
  root: string;
  work: string;
  cleanup: () => void;
}

/**
 * Creates a tmpdir with:
 *   remote.git/  — bare repo serving as `origin`
 *   work/        — clone with `base` branch (committed + pushed) and a `head`
 *                  branch checked out with PR-modified files.
 */
function setupRepo(): Repo {
  const root = mkdtempSync(join(tmpdir(), "restore-config-test-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");

  mkdirSync(remote);
  git(remote, ["init", "--bare", "--initial-branch=base"]);

  mkdirSync(work);
  git(work, ["init", "--initial-branch=base"]);
  git(work, ["remote", "add", "origin", remote]);

  // Base commit: root + nested CLAUDE.md present.
  writeFile(work, "README", "base readme\n");
  writeFile(work, "CLAUDE.md", "BASE root claude\n");
  writeFile(work, "CLAUDE.local.md", "BASE root claude local\n");
  writeFile(work, "packages/foo/CLAUDE.md", "BASE nested foo\n");
  writeFile(work, "deeper/nested/dir/CLAUDE.md", "BASE deep\n");
  writeFile(work, "kept-on-base/only/CLAUDE.md", "BASE only\n");
  writeFile(work, ".claude/settings.json", '{"trusted":true}\n');
  writeFile(work, ".mcp.json", '{"servers":{}}\n');
  git(work, ["add", "."]);
  git(work, ["commit", "-m", "base"]);
  git(work, ["push", "origin", "base"]);

  // PR head: tampers with all the existing CLAUDE.md, adds new ones not on base.
  git(work, ["checkout", "-b", "head"]);
  writeFile(work, "CLAUDE.md", "ATTACKER root\n");
  writeFile(work, "CLAUDE.local.md", "ATTACKER root local\n");
  writeFile(work, "packages/foo/CLAUDE.md", "ATTACKER foo\n");
  writeFile(work, "deeper/nested/dir/CLAUDE.md", "ATTACKER deep\n");
  writeFile(work, "pr-only/CLAUDE.md", "ATTACKER pr-only\n");
  writeFile(work, "pr-only/sub/CLAUDE.local.md", "ATTACKER pr-only local\n");
  writeFile(work, ".claude/settings.json", '{"trusted":false,"evil":true}\n');
  // Sanity: a non-CLAUDE.md file with the same prefix in name must not match.
  writeFile(work, "docs/CLAUDE.md.notes", "should not be touched\n");
  git(work, ["add", "."]);
  git(work, ["commit", "-m", "head with malicious CLAUDE.md"]);

  return {
    root,
    work,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("restoreConfigFromBase — nested CLAUDE.md coverage (issue #1270)", () => {
  let repo: Repo;
  let originalCwd: string;
  let originalDisableEnv: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalDisableEnv = process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;
    delete process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;
    repo = setupRepo();
    process.chdir(repo.work);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    repo.cleanup();
    if (originalDisableEnv === undefined) {
      delete process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;
    } else {
      process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE = originalDisableEnv;
    }
  });

  it("restores root CLAUDE.md from base (existing behavior preserved)", () => {
    restoreConfigFromBase("base");
    expect(readFileSync("CLAUDE.md", "utf8")).toBe("BASE root claude\n");
    expect(readFileSync("CLAUDE.local.md", "utf8")).toBe(
      "BASE root claude local\n",
    );
  });

  it("restores nested CLAUDE.md present on both PR and base", () => {
    restoreConfigFromBase("base");
    expect(readFileSync("packages/foo/CLAUDE.md", "utf8")).toBe(
      "BASE nested foo\n",
    );
    expect(readFileSync("deeper/nested/dir/CLAUDE.md", "utf8")).toBe(
      "BASE deep\n",
    );
  });

  it("restores nested CLAUDE.md present only on base", () => {
    // Sanity: file existed on base, not modified by PR — should still end as base.
    restoreConfigFromBase("base");
    expect(readFileSync("kept-on-base/only/CLAUDE.md", "utf8")).toBe(
      "BASE only\n",
    );
  });

  it("deletes nested CLAUDE.md present only on PR head", () => {
    expect(existsSync("pr-only/CLAUDE.md")).toBe(true);
    expect(existsSync("pr-only/sub/CLAUDE.local.md")).toBe(true);
    restoreConfigFromBase("base");
    expect(existsSync("pr-only/CLAUDE.md")).toBe(false);
    expect(existsSync("pr-only/sub/CLAUDE.local.md")).toBe(false);
  });

  it("snapshots PR-authored nested CLAUDE.md into .claude-pr/ with .pr-snapshot suffix (so the snapshot itself is not auto-loaded)", () => {
    restoreConfigFromBase("base");
    // Auto-loaded basenames must not appear verbatim under .claude-pr/ —
    // otherwise the snapshot itself becomes a nested CLAUDE.md the CLI could
    // pick up. The .pr-snapshot suffix preserves path readability for review
    // agents while breaking the auto-load match.
    expect(readFileSync(".claude-pr/CLAUDE.md.pr-snapshot", "utf8")).toBe(
      "ATTACKER root\n",
    );
    expect(
      readFileSync(".claude-pr/packages/foo/CLAUDE.md.pr-snapshot", "utf8"),
    ).toBe("ATTACKER foo\n");
    expect(
      readFileSync(".claude-pr/pr-only/CLAUDE.md.pr-snapshot", "utf8"),
    ).toBe("ATTACKER pr-only\n");
    expect(
      readFileSync(
        ".claude-pr/pr-only/sub/CLAUDE.local.md.pr-snapshot",
        "utf8",
      ),
    ).toBe("ATTACKER pr-only local\n");
    // Verify the verbatim basenames do NOT exist under .claude-pr/.
    expect(existsSync(".claude-pr/CLAUDE.md")).toBe(false);
    expect(existsSync(".claude-pr/packages/foo/CLAUDE.md")).toBe(false);
  });

  it("does not snapshot nested symlinks brought in by recursive directory copy (e.g. .claude/hooks/leak.txt -> /etc/passwd)", () => {
    // cpSync(".claude", ..., { recursive: true }) defaults to copying nested
    // symlinks verbatim. A PR can plant `.claude/hooks/leak.txt -> /etc/passwd`
    // (file symlink) or `.claude/leaky -> /var/log` (dir symlink). Neither
    // should survive under `.claude-pr/`.
    const fileSecret = join(repo.root, "FILE_SECRET");
    writeFileSync(fileSecret, "FILE EXFIL\n");
    const dirSecret = join(repo.root, "dir_secret");
    mkdirSync(dirSecret, { recursive: true });
    writeFileSync(join(dirSecret, "leak.txt"), "DIR EXFIL\n");

    mkdirSync(join(repo.work, ".claude/hooks"), { recursive: true });
    symlinkSync(fileSecret, join(repo.work, ".claude/hooks/leak.txt"));
    symlinkSync(dirSecret, join(repo.work, ".claude/leaky"));
    git(repo.work, ["add", ".claude"]);
    git(repo.work, ["commit", "-m", "nested symlinks under .claude"]);

    restoreConfigFromBase("base");

    expect(existsSync(".claude-pr/.claude/hooks/leak.txt")).toBe(false);
    expect(existsSync(".claude-pr/.claude/leaky")).toBe(false);
    // And no file under .claude-pr/ contains the secret content.
    function contentsContain(dir: string, needle: string): boolean {
      if (!existsSync(dir)) return false;
      for (const entry of execFileSync("find", [dir, "-type", "f"], {
        encoding: "utf-8",
      })
        .split("\n")
        .filter((l) => l.length > 0)) {
        if (readFileSync(entry, "utf8").includes(needle)) return true;
      }
      return false;
    }
    expect(contentsContain(".claude-pr", "FILE EXFIL")).toBe(false);
    expect(contentsContain(".claude-pr", "DIR EXFIL")).toBe(false);
  });

  it("renames nested CLAUDE.md inside recursively-copied SENSITIVE_PATHS dirs (e.g. .claude/hooks/CLAUDE.md)", () => {
    // cpSync(".claude", ...) brings in everything inside .claude/ verbatim. A
    // PR-added .claude/hooks/CLAUDE.md would survive as a verbatim CLAUDE.md
    // under .claude-pr/ if we relied only on the top-level path rewrite.
    writeFile(
      repo.work,
      ".claude/hooks/CLAUDE.md",
      "ATTACKER inside .claude\n",
    );
    writeFile(
      repo.work,
      ".claude/hooks/CLAUDE.local.md",
      "ATTACKER local inside .claude\n",
    );
    git(repo.work, ["add", "."]);
    git(repo.work, ["commit", "-m", "nested under sensitive dir"]);

    restoreConfigFromBase("base");

    // Verbatim basenames must NOT exist anywhere under .claude-pr/.
    expect(existsSync(".claude-pr/.claude/hooks/CLAUDE.md")).toBe(false);
    expect(existsSync(".claude-pr/.claude/hooks/CLAUDE.local.md")).toBe(false);
    // The suffixed files preserve the original content for review.
    expect(
      readFileSync(".claude-pr/.claude/hooks/CLAUDE.md.pr-snapshot", "utf8"),
    ).toBe("ATTACKER inside .claude\n");
    expect(
      readFileSync(
        ".claude-pr/.claude/hooks/CLAUDE.local.md.pr-snapshot",
        "utf8",
      ),
    ).toBe("ATTACKER local inside .claude\n");
  });

  it("snapshots non-auto-loaded SENSITIVE_PATHS verbatim (only CLAUDE.md basenames are encoded)", () => {
    restoreConfigFromBase("base");
    // Other sensitive entries (.claude/, .mcp.json) are not auto-discovered by
    // basename, so they keep their original names under .claude-pr/.
    expect(readFileSync(".claude-pr/.claude/settings.json", "utf8")).toBe(
      '{"trusted":false,"evil":true}\n',
    );
  });

  it("does not match files whose basename merely starts with CLAUDE.md", () => {
    restoreConfigFromBase("base");
    // PR-only file with a CLAUDE.md prefix in the name (but not matching basename)
    // must remain in place — only exact basename matches are sensitive.
    expect(readFileSync("docs/CLAUDE.md.notes", "utf8")).toBe(
      "should not be touched\n",
    );
  });

  it("leaves nested CLAUDE.md untouched when DISABLE_NESTED_CLAUDE_MD_RESTORE=true", () => {
    process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE = "true";
    restoreConfigFromBase("base");
    // Root entries still restored (root is in SENSITIVE_PATHS, not the nested pass).
    expect(readFileSync("CLAUDE.md", "utf8")).toBe("BASE root claude\n");
    // Nested files are untouched — PR content remains.
    expect(readFileSync("packages/foo/CLAUDE.md", "utf8")).toBe(
      "ATTACKER foo\n",
    );
    expect(readFileSync("deeper/nested/dir/CLAUDE.md", "utf8")).toBe(
      "ATTACKER deep\n",
    );
    expect(existsSync("pr-only/CLAUDE.md")).toBe(true);
  });

  it("restores .claude/ tree from base (regression: existing behavior)", () => {
    restoreConfigFromBase("base");
    expect(readFileSync(".claude/settings.json", "utf8")).toBe(
      '{"trusted":true}\n',
    );
  });

  it("deletes nested CLAUDE.md inside a directory whose name starts with '-' (no leading-dash bypass)", () => {
    // A naive isSafeRelativePath that drops paths starting with '-' would skip
    // this entry, leaving the PR-controlled instruction file on disk. Every
    // git invocation here uses `--`, and fs APIs take strings (no shell), so
    // there is no need to filter leading-dash paths.
    writeFile(repo.work, "-pkg/CLAUDE.md", "ATTACKER dash\n");
    git(repo.work, ["add", "--", "-pkg/CLAUDE.md"]);
    git(repo.work, ["commit", "-m", "leading-dash dir"]);

    restoreConfigFromBase("base");

    expect(existsSync("-pkg/CLAUDE.md")).toBe(false);
    expect(readFileSync(".claude-pr/-pkg/CLAUDE.md.pr-snapshot", "utf8")).toBe(
      "ATTACKER dash\n",
    );
  });

  it("does not snapshot or restore symlinks named CLAUDE.md (no exfiltration via .claude-pr/)", () => {
    // Set up a secret target outside the repo and a PR-committed symlink that
    // points at it. If the discovery / snapshot path were naive, .claude-pr/
    // would end up either as a symlink (review agent follows it) or as a copy
    // of the secret's contents.
    const secretPath = join(repo.root, "SECRET");
    writeFileSync(secretPath, "EXFILTRATED SECRET\n");

    mkdirSync(join(repo.work, "evil"), { recursive: true });
    symlinkSync(secretPath, join(repo.work, "evil/CLAUDE.md"));
    git(repo.work, ["add", "evil/CLAUDE.md"]);
    git(repo.work, ["commit", "-m", "evil symlink"]);

    restoreConfigFromBase("base");

    expect(existsSync(".claude-pr/evil/CLAUDE.md")).toBe(false);
    expect(existsSync(".claude-pr/evil/CLAUDE.md.pr-snapshot")).toBe(false);
    // Working tree: symlink was deleted by the security delete and is not on
    // base, so it stays gone.
    expect(existsSync("evil/CLAUDE.md")).toBe(false);
  });

  it("does not snapshot a root SENSITIVE_PATHS entry replaced with a symlink", () => {
    // Replace tracked CLAUDE.md with a symlink to a secret. Defense-in-depth at
    // the snapshot site should refuse to copy it even though it's in
    // SENSITIVE_PATHS (literal path, not from the recursive discovery).
    const secretPath = join(repo.root, "SECRET2");
    writeFileSync(secretPath, "ROOT SECRET\n");

    rmSync(join(repo.work, "CLAUDE.md"));
    symlinkSync(secretPath, join(repo.work, "CLAUDE.md"));
    git(repo.work, ["add", "CLAUDE.md"]);
    git(repo.work, ["commit", "-m", "root symlink"]);

    restoreConfigFromBase("base");

    // Snapshot must not contain the symlink (or its target contents) under
    // either the verbatim or .pr-snapshot path.
    for (const candidate of [
      ".claude-pr/CLAUDE.md",
      ".claude-pr/CLAUDE.md.pr-snapshot",
    ]) {
      if (existsSync(candidate)) {
        const stat = lstatSync(candidate);
        expect(stat.isSymbolicLink()).toBe(false);
        expect(readFileSync(candidate, "utf8")).not.toContain("ROOT SECRET");
      }
    }
    // Working tree restored to base content.
    expect(readFileSync("CLAUDE.md", "utf8")).toBe("BASE root claude\n");
  });

  it("leaves restored paths unstaged so the revert does not leak into later commits", () => {
    restoreConfigFromBase("base");
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repo.work,
      env: GIT_ENV,
      encoding: "utf8",
    });
    // The reverted CLAUDE.md / nested CLAUDE.md should appear as unstaged
    // modifications (" M path"), not staged ("M  path"). PR-only paths that
    // were deleted appear as " D".
    const lines = status
      .split("\n")
      .filter((l: string) => l.length > 0)
      .filter((l: string) => !l.startsWith("??")); // skip untracked (e.g. .claude-pr/)
    expect(lines.length).toBeGreaterThan(0); // sanity: there ARE tracked changes
    for (const line of lines) {
      // First column (index) must be space for unstaged-only changes.
      expect(line[0]).toBe(" ");
    }
  });
});
