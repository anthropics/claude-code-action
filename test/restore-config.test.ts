import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { dirname, isAbsolute, join } from "path";
import { restoreConfigFromBase } from "../src/github/operations/restore-config";

const CLAUDE_PR_EXCLUDE_PATTERN = "/.claude-pr/";

describe("restoreConfigFromBase", () => {
  let originalCwd: string;
  let originalDisableNestedRestore: string | undefined;
  let tempDir = "";
  let repoDir: string;
  let remoteDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalDisableNestedRestore = process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;
    delete process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;

    tempDir = mkdtempSync(join("/tmp", "restore-config-"));
    repoDir = join(tempDir, "repo");
    remoteDir = join(tempDir, "origin.git");

    execFileSync("git", ["init", "--bare", remoteDir], { stdio: "pipe" });
    execFileSync("git", ["init", repoDir], { stdio: "pipe" });
    git(["checkout", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);

    writeRepoFile("CLAUDE.md", "base claude instructions\n");
    writeRepoFile("CLAUDE.local.md", "base local claude instructions\n");
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "base" })}\n`,
    );
    writeRepoFile(".mcp.json", `${JSON.stringify({ servers: {} })}\n`);
    writeRepoFile("src/index.ts", "export const base = true;\n");
    writeRepoFile("packages/foo/CLAUDE.md", "base nested foo instructions\n");
    writeRepoFile("deeper/nested/dir/CLAUDE.md", "base deep instructions\n");
    writeRepoFile(
      "kept-on-base/only/CLAUDE.md",
      "base-only nested instructions\n",
    );
    writeRepoFile(
      "kept-on-base/only/CLAUDE.local.md",
      "base-only nested local instructions\n",
    );

    git(["add", "."]);
    git(["commit", "-m", "base config"]);
    git(["remote", "add", "origin", remoteDir]);
    git(["push", "-u", "origin", "main"]);

    git(["checkout", "-b", "pr"]);
    writeRepoFile("CLAUDE.md", "pr claude instructions\n");
    writeRepoFile("CLAUDE.local.md", "pr local claude instructions\n");
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    writeRepoFile(
      ".mcp.json",
      `${JSON.stringify({ servers: { attacker: true } })}\n`,
    );
    writeRepoFile("packages/foo/CLAUDE.md", "pr nested foo instructions\n");
    writeRepoFile("deeper/nested/dir/CLAUDE.md", "pr deep instructions\n");
    writeRepoFile("pr-only/CLAUDE.md", "pr-only instructions\n");
    writeRepoFile(
      "pr-only/sub/CLAUDE.local.md",
      "pr-only local instructions\n",
    );
    writeRepoFile("docs/CLAUDE.md.notes", "should not be touched\n");
    rmSync(join(repoDir, "kept-on-base/only/CLAUDE.md"));
    rmSync(join(repoDir, "kept-on-base/only/CLAUDE.local.md"));
    git(["add", "-A"]);
    git(["commit", "-m", "pr config"]);

    process.chdir(repoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDisableNestedRestore === undefined) {
      delete process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE;
    } else {
      process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE =
        originalDisableNestedRestore;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preserves PR sensitive files while excluding .claude-pr from broad staging", () => {
    expect(repoPathExistsLexically(".gitignore")).toBe(false);

    restoreConfigFromBase("main");

    expect(readRepoFile(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      "pr claude instructions\n",
    );
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
    expect(
      git(["check-ignore", ".claude-pr/CLAUDE.md.pr-snapshot"]).trim(),
    ).toBe(".claude-pr/CLAUDE.md.pr-snapshot");
    expect(countClaudePrExcludeEntries()).toBe(1);

    restoreConfigFromBase("main");

    expect(countClaudePrExcludeEntries()).toBe(1);
    expect(repoPathExistsLexically(".gitignore")).toBe(false);

    writeRepoFile("src/fix.ts", "export const fix = true;\n");
    git(["add", "-A"]);

    const stagedFiles = git(["diff", "--cached", "--name-only"])
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    expect(stagedFiles).toContain("src/fix.ts");
    expect(stagedFiles.some((file) => file.startsWith(".claude-pr/"))).toBe(
      false,
    );

    git(["commit", "-m", "apply fix"]);

    const committedFiles = git(["show", "--name-only", "--format=", "HEAD"])
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    expect(committedFiles).toContain("src/fix.ts");
    expect(committedFiles.some((file) => file.startsWith(".claude-pr/"))).toBe(
      false,
    );
    expect(repoPathExistsLexically(".gitignore")).toBe(false);
  });

  test("restores symlinked CLAUDE.md paths from the PR base branch", () => {
    setupSymlinkedMainBranch();

    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "pr-with-symlinks" })}\n`,
    );
    git(["add", ".claude/settings.json"]);
    git(["commit", "-m", "pr updates settings"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("AGENTS.md");
    expect(lstatRepoFile(".claude/CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile(".claude/CLAUDE.md")).toBe("../AGENTS.md");
    expect(lstatRepoFile("packages/trusted/CLAUDE.md").isSymbolicLink()).toBe(
      true,
    );
    expect(readlinkRepoFile("packages/trusted/CLAUDE.md")).toBe("AGENTS.md");
    expect(readRepoFile("CLAUDE.md")).toBe("shared agent instructions\n");
    expect(readRepoFile(".claude/CLAUDE.md")).toBe(
      "shared agent instructions\n",
    );
    expect(readRepoFile("packages/trusted/CLAUDE.md")).toBe(
      "nested shared agent instructions\n",
    );
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("omits dangling PR snapshot links while continuing the trusted restore", () => {
    setupSymlinkedMainBranch();

    rmSync(join(repoDir, "AGENTS.md"));
    git(["add", "-A"]);
    git(["commit", "-m", "pr deletes agents file"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      false,
    );
    expect(repoPathExistsLexically(".claude-pr/.claude/CLAUDE.md")).toBe(false);
    expect(
      repoPathExistsLexically(".claude-pr/.claude/CLAUDE.md.pr-snapshot"),
    ).toBe(false);
    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("AGENTS.md");
    expect(lstatRepoFile(".claude/CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile(".claude/CLAUDE.md")).toBe("../AGENTS.md");
    expect(readRepoFile("CLAUDE.md")).toBe("shared agent instructions\n");
    expect(readRepoFile(".claude/CLAUDE.md")).toBe(
      "shared agent instructions\n",
    );
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("does not modify an existing .gitignore", () => {
    writeRepoFile(".gitignore", "node_modules\n");
    git(["add", ".gitignore"]);
    git(["commit", "-m", "add gitignore"]);

    const gitignoreBefore = readRepoFile(".gitignore");

    restoreConfigFromBase("main");

    expect(readRepoFile(".gitignore")).toBe(gitignoreBefore);
    expect(countClaudePrExcludeEntries()).toBe(1);
  });

  test("restores root CLAUDE.md and CLAUDE.local.md from base", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
    expect(readRepoFile("CLAUDE.local.md")).toBe(
      "base local claude instructions\n",
    );
  });

  test("restores nested CLAUDE.md present on both PR and base", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile("packages/foo/CLAUDE.md")).toBe(
      "base nested foo instructions\n",
    );
    expect(readRepoFile("deeper/nested/dir/CLAUDE.md")).toBe(
      "base deep instructions\n",
    );
  });

  test("restores nested CLAUDE.md and CLAUDE.local.md present only on base", () => {
    expect(repoPathExistsLexically("kept-on-base/only/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically("kept-on-base/only/CLAUDE.local.md")).toBe(
      false,
    );

    restoreConfigFromBase("main");

    expect(readRepoFile("kept-on-base/only/CLAUDE.md")).toBe(
      "base-only nested instructions\n",
    );
    expect(readRepoFile("kept-on-base/only/CLAUDE.local.md")).toBe(
      "base-only nested local instructions\n",
    );
  });

  test("deletes nested CLAUDE.md and CLAUDE.local.md present only on PR head", () => {
    expect(repoPathExistsLexically("pr-only/CLAUDE.md")).toBe(true);
    expect(repoPathExistsLexically("pr-only/sub/CLAUDE.local.md")).toBe(true);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically("pr-only/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically("pr-only/sub/CLAUDE.local.md")).toBe(false);
  });

  test("snapshots PR instruction files only under .pr-snapshot basenames", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      "pr claude instructions\n",
    );
    expect(readRepoFile(".claude-pr/CLAUDE.local.md.pr-snapshot")).toBe(
      "pr local claude instructions\n",
    );
    expect(readRepoFile(".claude-pr/packages/foo/CLAUDE.md.pr-snapshot")).toBe(
      "pr nested foo instructions\n",
    );
    expect(readRepoFile(".claude-pr/pr-only/CLAUDE.md.pr-snapshot")).toBe(
      "pr-only instructions\n",
    );
    expect(
      readRepoFile(".claude-pr/pr-only/sub/CLAUDE.local.md.pr-snapshot"),
    ).toBe("pr-only local instructions\n");
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.local.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/packages/foo/CLAUDE.md")).toBe(
      false,
    );
    expect(repoPathExistsLexically(".claude-pr/pr-only/CLAUDE.md")).toBe(false);
    expect(
      repoPathExistsLexically(".claude-pr/pr-only/sub/CLAUDE.local.md"),
    ).toBe(false);
  });

  test("does not restore a base instruction basename from .claude-pr", () => {
    const reservedInstructionPath = ".claude-pr/nested/CLAUDE.md";

    git(["checkout", "main"]);
    writeRepoFile(
      reservedInstructionPath,
      "base instruction inside reserved subtree\n",
    );
    git(["add", "-f", "--", reservedInstructionPath]);
    git(["commit", "-m", "track reserved instruction basename"]);
    pushMainAndRecreatePr();

    writeRepoFile(
      reservedInstructionPath,
      "pr instruction inside reserved subtree\n",
    );
    writeRepoFile("CLAUDE.md", "pr root instruction sentinel\n");
    git(["add", "-A"]);
    git(["commit", "-m", "tamper with reserved instruction basename"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(reservedInstructionPath)).toBe(false);
    expect(readRepoFile(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      "pr root instruction sentinel\n",
    );
  });

  test("does not snapshot nested symlinks copied from .claude", () => {
    const fileSecretPath = join(tempDir, "FILE_SECRET");
    writeFileSync(fileSecretPath, "FILE EXFIL\n");
    const directorySecretPath = join(tempDir, "directory-secret");
    mkdirSync(directorySecretPath, { recursive: true });
    writeFileSync(join(directorySecretPath, "leak.txt"), "DIRECTORY EXFIL\n");

    mkdirSync(join(repoDir, ".claude/hooks"), { recursive: true });
    symlinkSync(fileSecretPath, join(repoDir, ".claude/hooks/leak.txt"));
    symlinkSync(directorySecretPath, join(repoDir, ".claude/leaky"));
    git(["add", ".claude"]);
    git(["commit", "-m", "nested symlinks under .claude"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(".claude-pr/.claude/hooks/leak.txt")).toBe(
      false,
    );
    expect(repoPathExistsLexically(".claude-pr/.claude/leaky")).toBe(false);
    expect(repoTreeContainsText(".claude-pr", "FILE EXFIL")).toBe(false);
    expect(repoTreeContainsText(".claude-pr", "DIRECTORY EXFIL")).toBe(false);
    expect(readFileSync(fileSecretPath, "utf8")).toBe("FILE EXFIL\n");
    expect(readFileSync(join(directorySecretPath, "leak.txt"), "utf8")).toBe(
      "DIRECTORY EXFIL\n",
    );
  });

  test("renames instruction files inside recursively copied sensitive directories", () => {
    writeRepoFile(
      ".claude/hooks/CLAUDE.md",
      "pr instructions inside .claude\n",
    );
    writeRepoFile(
      ".claude/hooks/CLAUDE.local.md",
      "pr local instructions inside .claude\n",
    );
    git(["add", "."]);
    git(["commit", "-m", "nested instructions under sensitive directory"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(".claude-pr/.claude/hooks/CLAUDE.md")).toBe(
      false,
    );
    expect(
      repoPathExistsLexically(".claude-pr/.claude/hooks/CLAUDE.local.md"),
    ).toBe(false);
    expect(readRepoFile(".claude-pr/.claude/hooks/CLAUDE.md.pr-snapshot")).toBe(
      "pr instructions inside .claude\n",
    );
    expect(
      readRepoFile(".claude-pr/.claude/hooks/CLAUDE.local.md.pr-snapshot"),
    ).toBe("pr local instructions inside .claude\n");
  });

  test("snapshots non-auto-loaded sensitive paths under their original names", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expect(readRepoFile(".claude-pr/.mcp.json")).toBe(
      `${JSON.stringify({ servers: { attacker: true } })}\n`,
    );
  });

  test("does not match files whose basename only starts with CLAUDE.md", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile("docs/CLAUDE.md.notes")).toBe(
      "should not be touched\n",
    );
  });

  test("keeps nested instructions untouched when nested restore is disabled", () => {
    process.env.DISABLE_NESTED_CLAUDE_MD_RESTORE = "true";

    restoreConfigFromBase("main");

    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
    expect(readRepoFile("CLAUDE.local.md")).toBe(
      "base local claude instructions\n",
    );
    expect(readRepoFile("packages/foo/CLAUDE.md")).toBe(
      "pr nested foo instructions\n",
    );
    expect(readRepoFile("deeper/nested/dir/CLAUDE.md")).toBe(
      "pr deep instructions\n",
    );
    expect(repoPathExistsLexically("pr-only/CLAUDE.md")).toBe(true);
    expect(repoPathExistsLexically("kept-on-base/only/CLAUDE.md")).toBe(false);
  });

  test("restores the .claude tree from base", () => {
    restoreConfigFromBase("main");

    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("handles instruction files inside a leading-dash directory", () => {
    writeRepoFile("-pkg/CLAUDE.md", "pr leading-dash instructions\n");
    git(["add", "--", "-pkg/CLAUDE.md"]);
    git(["commit", "-m", "leading-dash instruction path"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically("-pkg/CLAUDE.md")).toBe(false);
    expect(readRepoFile(".claude-pr/-pkg/CLAUDE.md.pr-snapshot")).toBe(
      "pr leading-dash instructions\n",
    );
  });

  test("does not snapshot or restore a PR-only nested instruction symlink", () => {
    const secretPath = join(tempDir, "NESTED_SECRET");
    writeFileSync(secretPath, "NESTED SECRET\n");
    mkdirSync(join(repoDir, "evil"), { recursive: true });
    symlinkSync(secretPath, join(repoDir, "evil/CLAUDE.md"));
    git(["add", "evil/CLAUDE.md"]);
    git(["commit", "-m", "pr-only nested instruction symlink"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(".claude-pr/evil/CLAUDE.md")).toBe(false);
    expect(
      repoPathExistsLexically(".claude-pr/evil/CLAUDE.md.pr-snapshot"),
    ).toBe(false);
    expect(repoPathExistsLexically("evil/CLAUDE.md")).toBe(false);
    expect(readFileSync(secretPath, "utf8")).toBe("NESTED SECRET\n");
  });

  test("does not snapshot a root sensitive path replaced with a PR symlink", () => {
    const secretPath = join(tempDir, "ROOT_SECRET");
    writeFileSync(secretPath, "ROOT SECRET\n");
    rmSync(join(repoDir, "CLAUDE.md"));
    symlinkSync(secretPath, join(repoDir, "CLAUDE.md"));
    git(["add", "CLAUDE.md"]);
    git(["commit", "-m", "root instruction symlink"]);

    restoreConfigFromBase("main");

    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      false,
    );
    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(false);
    expect(lstatRepoFile("CLAUDE.md").isFile()).toBe(true);
    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
    expect(readFileSync(secretPath, "utf8")).toBe("ROOT SECRET\n");
  });

  test("leaves restored paths unstaged", () => {
    restoreConfigFromBase("main");

    const statusLines = git(["status", "--porcelain"])
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("??"));
    expect(statusLines.length).toBeGreaterThan(0);
    for (const line of statusLines) {
      expect(line[0]).toBe(" ");
    }
  });

  test("restores base links and targets after the PR modifies, deletes, and retargets them", () => {
    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("AGENTS.md", "trusted root target\n");
    symlinkRepoFile("CLAUDE.md", "AGENTS.md");
    writeRepoFile(".claude/AGENTS.md", "trusted .claude target\n");
    symlinkRepoFile(".claude/CLAUDE.md", "AGENTS.md");
    writeRepoFile(
      "packages/trusted-links/AGENTS.md",
      "trusted nested target\n",
    );
    symlinkRepoFile("packages/trusted-links/CLAUDE.local.md", "AGENTS.md");
    git(["add", "-A"]);
    git(["commit", "-m", "trusted instruction link targets"]);
    pushMainAndRecreatePr();

    writeRepoFile("AGENTS.md", "attacker root target\n");
    rmSync(join(repoDir, ".claude/AGENTS.md"));
    writeRepoFile(
      "packages/trusted-links/AGENTS.md",
      "attacker nested target\n",
    );
    rmSync(join(repoDir, "packages/trusted-links/CLAUDE.local.md"));
    writeRepoFile(
      "packages/trusted-links/ATTACKER.md",
      "retargeted attacker instructions\n",
    );
    symlinkRepoFile("packages/trusted-links/CLAUDE.local.md", "ATTACKER.md");
    git(["add", "-A"]);
    git(["commit", "-m", "tamper with trusted instruction targets"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("AGENTS.md");
    expect(readRepoFile("CLAUDE.md")).toBe("trusted root target\n");
    expect(lstatRepoFile(".claude/CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile(".claude/CLAUDE.md")).toBe("AGENTS.md");
    expect(readRepoFile(".claude/CLAUDE.md")).toBe("trusted .claude target\n");
    expect(
      lstatRepoFile("packages/trusted-links/CLAUDE.local.md").isSymbolicLink(),
    ).toBe(true);
    expect(readlinkRepoFile("packages/trusted-links/CLAUDE.local.md")).toBe(
      "AGENTS.md",
    );
    expect(readRepoFile("packages/trusted-links/CLAUDE.local.md")).toBe(
      "trusted nested target\n",
    );
    expect(
      repoPathExistsLexically(
        ".claude-pr/packages/trusted-links/CLAUDE.local.md",
      ),
    ).toBe(false);
    expect(
      repoPathExistsLexically(
        ".claude-pr/packages/trusted-links/CLAUDE.local.md.pr-snapshot",
      ),
    ).toBe(false);
  });

  test("restores exact base content through a multi-hop trusted symlink chain", () => {
    const trustedContents =
      "trusted multi-hop instruction line one\nline two\n";

    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("trusted-content/base-instructions.txt", trustedContents);
    symlinkRepoFile("CLAUDE.md", "trusted-links/first");
    symlinkRepoFile("trusted-links/first", "second");
    symlinkRepoFile(
      "trusted-links/second",
      "../trusted-content/base-instructions.txt",
    );
    git(["add", "-A"]);
    git(["commit", "-m", "trusted multi-hop instruction chain"]);
    pushMainAndRecreatePr();

    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("CLAUDE.md", "attacker root instructions\n");
    rmSync(join(repoDir, "trusted-links/first"));
    symlinkRepoFile("trusted-links/first", "../attacker-instructions.txt");
    rmSync(join(repoDir, "trusted-links/second"));
    writeRepoFile("trusted-links/second", "attacker replaced second hop\n");
    writeRepoFile(
      "trusted-content/base-instructions.txt",
      "attacker replaced trusted content\n",
    );
    writeRepoFile("attacker-instructions.txt", "attacker link target\n");
    git(["add", "-A"]);
    git(["commit", "-m", "tamper with multi-hop instruction chain"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("trusted-links/first");
    expect(lstatRepoFile("trusted-links/first").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("trusted-links/first")).toBe("second");
    expect(lstatRepoFile("trusted-links/second").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("trusted-links/second")).toBe(
      "../trusted-content/base-instructions.txt",
    );
    expect(
      lstatRepoFile("trusted-content/base-instructions.txt").isFile(),
    ).toBe(true);
    expect(readRepoFile("trusted-content/base-instructions.txt")).toBe(
      trustedContents,
    );
    expect(readRepoFile("CLAUDE.md")).toBe(trustedContents);
    expect(readRepoFile(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      "attacker root instructions\n",
    );
  });

  test("fails closed before mutation when a trusted link chain enters .claude-pr", () => {
    const reservedTarget = ".claude-pr/trusted/AGENTS.md";

    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile(reservedTarget, "trusted reserved target\n");
    symlinkRepoFile("CLAUDE.md", "trusted-links/reserved-hop");
    symlinkRepoFile(
      "trusted-links/reserved-hop",
      "../.claude-pr/trusted/AGENTS.md",
    );
    git(["add", "-A"]);
    git(["add", "-f", "--", reservedTarget]);
    git(["commit", "-m", "trusted chain into reserved subtree"]);
    pushMainAndRecreatePr();

    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("CLAUDE.md", "attacker root instructions\n");
    writeRepoFile(reservedTarget, "attacker reserved target\n");
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "pr-reserved-chain" })}\n`,
    );
    git(["add", "-A"]);
    git(["commit", "-m", "tamper with reserved target chain"]);
    const prWorktreeBefore = snapshotRepoWorktree();

    expect(() => restoreConfigFromBase("main")).toThrow(/\.claude-pr/);

    expect(snapshotRepoWorktree()).toEqual(prWorktreeBefore);
  });

  for (const invalidTarget of [
    {
      name: "repository escape",
      expectedError: /escapes the repository/i,
      setupBase: () => {
        writeFileSync(
          join(tempDir, "outside-instructions.md"),
          "outside repository sentinel\n",
        );
        symlinkRepoFile("CLAUDE.md", "../outside-instructions.md");
      },
    },
    {
      name: "missing target",
      expectedError: /untracked|not tracked/i,
      setupBase: () => {
        symlinkRepoFile("CLAUDE.md", "missing/AGENTS.md");
      },
    },
    {
      name: "directory target",
      expectedError: /non-blob|not a blob/i,
      setupBase: () => {
        writeRepoFile(
          "instruction-directory/sentinel.txt",
          "tracked directory sentinel\n",
        );
        symlinkRepoFile("CLAUDE.md", "instruction-directory");
      },
    },
    {
      name: "symlink cycle",
      expectedError: /cycle/i,
      setupBase: () => {
        symlinkRepoFile("CLAUDE.md", "trusted-links/cycle");
        symlinkRepoFile("trusted-links/cycle", "../CLAUDE.md");
      },
    },
  ]) {
    test(`fails closed before PR worktree mutation for a trusted ${invalidTarget.name}`, () => {
      git(["checkout", "main"]);
      rmSync(join(repoDir, "CLAUDE.md"));
      invalidTarget.setupBase();
      git(["add", "-A"]);
      git(["commit", "-m", `trusted ${invalidTarget.name}`]);
      pushMainAndRecreatePr();

      writeRepoFile(
        ".claude/settings.json",
        `${JSON.stringify({ source: `pr-${invalidTarget.name}` })}\n`,
      );
      writeRepoFile(
        "CLAUDE.local.md",
        `pr sentinel for ${invalidTarget.name}\n`,
      );
      git(["add", "-A"]);
      git(["commit", "-m", `pr sentinel for ${invalidTarget.name}`]);
      const prWorktreeBefore = snapshotRepoWorktree();
      expect(repoPathExistsLexically(".claude-pr")).toBe(false);

      expect(() => restoreConfigFromBase("main")).toThrow(
        invalidTarget.expectedError,
      );

      expect(snapshotRepoWorktree()).toEqual(prWorktreeBefore);
      expect(repoPathExistsLexically(".claude-pr")).toBe(false);
    });
  }

  test("does not follow a PR symlink ancestor while restoring a trusted target", () => {
    setupInstructionAncestorMainBranch();

    const externalDirectory = join(tempDir, "external-instructions");
    mkdirSync(externalDirectory, { recursive: true });
    const externalTarget = join(externalDirectory, "AGENTS.md");
    writeFileSync(externalTarget, "external sentinel instructions\n");
    const externalSentinelBefore = readFileSync(externalTarget);

    rmSync(join(repoDir, "instructions"), { recursive: true });
    symlinkRepoFile("instructions", externalDirectory);
    git(["add", "-A"]);
    git(["commit", "-m", "replace target directory with external symlink"]);

    restoreConfigFromBase("main");

    expect(readFileSync(externalTarget).equals(externalSentinelBefore)).toBe(
      true,
    );
    expect(lstatRepoFile("instructions").isSymbolicLink()).toBe(false);
    expect(lstatRepoFile("instructions").isDirectory()).toBe(true);
    expect(readRepoFile("instructions/AGENTS.md")).toBe(
      "trusted directory target\n",
    );
    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("instructions/AGENTS.md");
    expect(readRepoFile("CLAUDE.md")).toBe("trusted directory target\n");
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      false,
    );
  });

  test("does not retain a populated gitlink ancestor while restoring a trusted target", () => {
    setupInstructionAncestorMainBranch();

    const submoduleSource = createGitRepository("ancestor-submodule", {
      "AGENTS.md": "attacker gitlink target\n",
      "sentinel.txt": "external gitlink sentinel\n",
    });
    const externalSentinelBefore = readFileSync(
      join(submoduleSource, "sentinel.txt"),
    );

    git(["rm", "-r", "instructions"]);
    git([
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      submoduleSource,
      "instructions",
    ]);
    git(["commit", "-m", "replace target directory with populated gitlink"]);

    expect(readRepoFile("instructions/sentinel.txt")).toBe(
      "external gitlink sentinel\n",
    );
    expect(repoPathExistsLexically("instructions/.git")).toBe(true);

    restoreConfigFromBase("main");

    expect(
      readFileSync(join(submoduleSource, "sentinel.txt")).equals(
        externalSentinelBefore,
      ),
    ).toBe(true);
    expect(lstatRepoFile("instructions").isSymbolicLink()).toBe(false);
    expect(lstatRepoFile("instructions").isDirectory()).toBe(true);
    expect(readRepoFile("instructions/AGENTS.md")).toBe(
      "trusted directory target\n",
    );
    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkRepoFile("CLAUDE.md")).toBe("instructions/AGENTS.md");
    expect(readRepoFile("CLAUDE.md")).toBe("trusted directory target\n");
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md")).toBe(false);
    expect(repoPathExistsLexically(".claude-pr/CLAUDE.md.pr-snapshot")).toBe(
      false,
    );
    expect(repoPathExistsLexically("instructions/sentinel.txt")).toBe(false);
    expect(repoPathExistsLexically("instructions/.git")).toBe(false);
  });

  test("treats pathspec magic literally without changing unrelated worktree or index state", () => {
    const magicPath = ":(exclude)victim/CLAUDE.md";
    const unrelatedPath = "src/index.ts";

    git(["checkout", "main"]);
    writeRepoFile(magicPath, "trusted literal-path instructions\n");
    git(["--literal-pathspecs", "add", "--", magicPath]);
    git(["commit", "-m", "trusted literal pathspec instruction"]);
    pushMainAndRecreatePr();

    writeRepoFile(magicPath, "attacker literal-path instructions\n");
    git(["--literal-pathspecs", "add", "--", magicPath]);
    git(["commit", "-m", "tamper with literal pathspec instruction"]);

    writeRepoFile(unrelatedPath, "export const staged = true;\n");
    git(["add", "--", unrelatedPath]);
    const unrelatedIndexBefore = git(["show", `:${unrelatedPath}`]);
    writeRepoFile(unrelatedPath, "export const worktree = true;\n");
    const unrelatedWorktreeBefore = readRepoFile(unrelatedPath);
    const unrelatedStatusBefore = git([
      "status",
      "--short",
      "--",
      unrelatedPath,
    ]);

    restoreConfigFromBase("main");

    expect(readRepoFile(magicPath)).toBe("trusted literal-path instructions\n");
    expect(
      readRepoFile(".claude-pr/:(exclude)victim/CLAUDE.md.pr-snapshot"),
    ).toBe("attacker literal-path instructions\n");
    expect(
      repoPathExistsLexically(".claude-pr/:(exclude)victim/CLAUDE.md"),
    ).toBe(false);
    expect(readRepoFile(unrelatedPath)).toBe(unrelatedWorktreeBefore);
    expect(git(["show", `:${unrelatedPath}`])).toBe(unrelatedIndexBefore);
    expect(git(["status", "--short", "--", unrelatedPath])).toBe(
      unrelatedStatusBefore,
    );
  });

  test("fails closed when a populated submodule contains nested CLAUDE.md", () => {
    assertPopulatedSubmoduleFailsClosed("CLAUDE.md");
  });

  test("fails closed when a populated submodule contains nested CLAUDE.local.md", () => {
    assertPopulatedSubmoduleFailsClosed("CLAUDE.local.md");
  });

  function git(args: string[]): string {
    return gitAt(repoDir, args);
  }

  function gitAt(cwd: string, args: string[]): string {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  function writeFileAt(root: string, path: string, contents: string): void {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }

  function writeRepoFile(path: string, contents: string): void {
    writeFileAt(repoDir, path, contents);
  }

  function readRepoFile(path: string): string {
    return readFileSync(join(repoDir, path), "utf8");
  }

  function symlinkRepoFile(path: string, target: string): void {
    const fullPath = join(repoDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    symlinkSync(target, fullPath);
  }

  function lstatRepoFile(path: string) {
    return lstatSync(join(repoDir, path));
  }

  function lstatRepoFileIfPresent(path: string) {
    try {
      return lstatRepoFile(path);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  function repoPathExistsLexically(path: string): boolean {
    return lstatRepoFileIfPresent(path) !== undefined;
  }

  function readlinkRepoFile(path: string): string {
    return readlinkSync(join(repoDir, path));
  }

  function repoTreeContainsText(path: string, text: string): boolean {
    const stat = lstatRepoFileIfPresent(path);
    if (stat === undefined || stat.isSymbolicLink()) {
      return false;
    }
    if (stat.isDirectory()) {
      return readdirSync(join(repoDir, path)).some((entry) =>
        repoTreeContainsText(join(path, entry), text),
      );
    }
    return stat.isFile() && readRepoFile(path).includes(text);
  }

  function snapshotLexicalTree(
    rootPath: string,
    excludedRootEntry?: string,
  ): Array<[string, string, string]> {
    const snapshot: Array<[string, string, string]> = [];

    const visit = (absoluteDirectory: string, relativeDirectory: string) => {
      for (const name of readdirSync(absoluteDirectory).sort()) {
        if (relativeDirectory === "" && name === excludedRootEntry) {
          continue;
        }

        const relativePath =
          relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
        const absolutePath = join(absoluteDirectory, name);
        const stat = lstatSync(absolutePath);
        if (stat.isSymbolicLink()) {
          snapshot.push([relativePath, "symlink", readlinkSync(absolutePath)]);
        } else if (stat.isDirectory()) {
          snapshot.push([relativePath, "directory", ""]);
          visit(absolutePath, relativePath);
        } else if (stat.isFile()) {
          snapshot.push([
            relativePath,
            "file",
            readFileSync(absolutePath).toString("base64"),
          ]);
        } else {
          snapshot.push([relativePath, "other", stat.mode.toString(8)]);
        }
      }
    };

    visit(rootPath, "");
    return snapshot;
  }

  function snapshotRepoWorktree(): Array<[string, string, string]> {
    return snapshotLexicalTree(repoDir, ".git");
  }

  function setupSymlinkedMainBranch(): void {
    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("AGENTS.md", "shared agent instructions\n");
    symlinkRepoFile("CLAUDE.md", "AGENTS.md");
    symlinkRepoFile(".claude/CLAUDE.md", "../AGENTS.md");
    writeRepoFile(
      "packages/trusted/AGENTS.md",
      "nested shared agent instructions\n",
    );
    symlinkRepoFile("packages/trusted/CLAUDE.md", "AGENTS.md");
    git([
      "add",
      "AGENTS.md",
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "packages/trusted/AGENTS.md",
      "packages/trusted/CLAUDE.md",
    ]);
    git(["commit", "-m", "add symlinked claude files"]);
    pushMainAndRecreatePr();
  }

  function setupInstructionAncestorMainBranch(): void {
    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"));
    writeRepoFile("instructions/AGENTS.md", "trusted directory target\n");
    symlinkRepoFile("CLAUDE.md", "instructions/AGENTS.md");
    git(["add", "-A"]);
    git(["commit", "-m", "trusted instruction target directory"]);
    pushMainAndRecreatePr();
  }

  function pushMainAndRecreatePr(): void {
    git(["push", "origin", "main"]);
    git(["branch", "-D", "pr"]);
    git(["checkout", "-b", "pr"]);
  }

  function createGitRepository(
    directoryName: string,
    files: Record<string, string>,
  ): string {
    const directory = join(tempDir, directoryName);
    mkdirSync(directory, { recursive: true });
    gitAt(directory, ["init"]);
    gitAt(directory, ["config", "user.email", "test@example.com"]);
    gitAt(directory, ["config", "user.name", "Test User"]);
    for (const [path, contents] of Object.entries(files)) {
      writeFileAt(directory, path, contents);
    }
    gitAt(directory, ["add", "."]);
    gitAt(directory, ["commit", "-m", "submodule fixture"]);
    return directory;
  }

  function assertPopulatedSubmoduleFailsClosed(
    instructionBasename: "CLAUDE.md" | "CLAUDE.local.md",
  ): void {
    const sourceDirectoryName =
      instructionBasename === "CLAUDE.md"
        ? "instruction-submodule"
        : "local-instruction-submodule";
    const instructionContents = `attacker submodule ${instructionBasename}\n`;
    const submoduleSource = createGitRepository(sourceDirectoryName, {
      [`nested/${instructionBasename}`]: instructionContents,
      "sentinel.txt": "external submodule sentinel\n",
    });
    symlinkSync("sentinel.txt", join(submoduleSource, "sentinel-link"));
    gitAt(submoduleSource, ["add", "sentinel-link"]);
    gitAt(submoduleSource, ["commit", "-m", "add lexical sentinel"]);
    const externalSentinelBefore = readFileSync(
      join(submoduleSource, "sentinel.txt"),
    );

    git([
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      submoduleSource,
      "vendor/untrusted",
    ]);
    git(["commit", "-m", `populated ${instructionBasename} submodule`]);

    const checkedOutSubmodule = join(repoDir, "vendor/untrusted");
    const checkedOutInstruction = join(
      checkedOutSubmodule,
      "nested",
      instructionBasename,
    );
    const checkedOutInstructionBefore = readFileSync(checkedOutInstruction);
    const checkedOutTreeBefore = snapshotLexicalTree(checkedOutSubmodule);
    expect(readRepoFile(`vendor/untrusted/nested/${instructionBasename}`)).toBe(
      instructionContents,
    );
    expect(readlinkSync(join(checkedOutSubmodule, "sentinel-link"))).toBe(
      "sentinel.txt",
    );

    const escapedBasename = instructionBasename.replace(/\./g, "\\.");
    expect(() => restoreConfigFromBase("main")).toThrow(
      new RegExp(
        `populated (?:gitlink|submodule).*${escapedBasename}|${escapedBasename}.*populated (?:gitlink|submodule)`,
        "i",
      ),
    );

    expect(
      readFileSync(join(submoduleSource, "sentinel.txt")).equals(
        externalSentinelBefore,
      ),
    ).toBe(true);
    expect(
      readFileSync(checkedOutInstruction).equals(checkedOutInstructionBefore),
    ).toBe(true);
    expect(snapshotLexicalTree(checkedOutSubmodule)).toEqual(
      checkedOutTreeBefore,
    );
    expect(readlinkSync(join(checkedOutSubmodule, "sentinel-link"))).toBe(
      "sentinel.txt",
    );
  }

  function countClaudePrExcludeEntries(): number {
    return readFileSync(getExcludePath(), "utf8")
      .split(/\r?\n/)
      .filter((line) => line === CLAUDE_PR_EXCLUDE_PATTERN).length;
  }

  function getExcludePath(): string {
    const gitPath = git(["rev-parse", "--git-path", "info/exclude"]).trim();
    return isAbsolute(gitPath) ? gitPath : join(repoDir, gitPath);
  }
});
