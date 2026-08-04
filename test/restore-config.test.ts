import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
  let tempDir = "";
  let repoDir: string;
  let remoteDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join("/tmp", "restore-config-"));
    repoDir = join(tempDir, "repo");
    remoteDir = join(tempDir, "origin.git");

    execFileSync("git", ["init", "--bare", remoteDir], { stdio: "pipe" });
    execFileSync("git", ["init", repoDir], { stdio: "pipe" });
    git(["checkout", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);

    writeRepoFile("CLAUDE.md", "base claude instructions\n");
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "base" })}\n`,
    );
    writeRepoFile("src/index.ts", "export const base = true;\n");

    git(["add", "CLAUDE.md", ".claude/settings.json", "src/index.ts"]);
    git(["commit", "-m", "base config"]);
    git(["remote", "add", "origin", remoteDir]);
    git(["push", "-u", "origin", "main"]);

    git(["checkout", "-b", "pr"]);
    writeRepoFile("CLAUDE.md", "pr claude instructions\n");
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    git(["add", "CLAUDE.md", ".claude/settings.json"]);
    git(["commit", "-m", "pr config"]);

    process.chdir(repoDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preserves PR sensitive files while excluding .claude-pr from broad staging", () => {
    const gitignoreExistedBefore = existsRepoFile(".gitignore");
    const gitignoreContentsBefore = gitignoreExistedBefore
      ? readRepoFile(".gitignore")
      : "";

    restoreConfigFromBase("main");

    expect(readRepoFile(".claude-pr/CLAUDE.md")).toBe(
      "pr claude instructions\n",
    );
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
    expect(git(["check-ignore", ".claude-pr/CLAUDE.md"]).trim()).toBe(
      ".claude-pr/CLAUDE.md",
    );
    expect(countClaudePrExcludeEntries()).toBe(1);

    restoreConfigFromBase("main");

    expect(countClaudePrExcludeEntries()).toBe(1);
    expect(existsRepoFile(".gitignore")).toBe(gitignoreExistedBefore);
    if (gitignoreExistedBefore) {
      expect(readRepoFile(".gitignore")).toBe(gitignoreContentsBefore);
    }

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
    expect(existsRepoFile(".gitignore")).toBe(gitignoreExistedBefore);
    if (gitignoreExistedBefore) {
      expect(readRepoFile(".gitignore")).toBe(gitignoreContentsBefore);
    }
  });

  test("restores symlinked CLAUDE.md paths from the PR base branch", () => {
    setupSymlinkedMainBranch();

    git(["checkout", "pr"]);
    writeRepoFile(
      ".claude/settings.json",
      `${JSON.stringify({ source: "pr-with-symlinks" })}\n`,
    );
    git(["add", ".claude/settings.json"]);
    git(["commit", "-m", "pr updates settings"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile("CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(lstatRepoFile(".claude/CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readRepoFile("CLAUDE.md").trim()).toBe("shared agent instructions");
    expect(readRepoFile(".claude/CLAUDE.md").trim()).toBe(
      "shared agent instructions",
    );
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("snapshots symlinked sensitive paths even when the PR head target is missing", () => {
    setupSymlinkedMainBranch();

    git(["checkout", "pr"]);
    rmSync(join(repoDir, "AGENTS.md"), { force: true });
    git(["add", "-A"]);
    git(["commit", "-m", "pr deletes agents file"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile(".claude-pr/.claude/CLAUDE.md").isSymbolicLink()).toBe(
      true,
    );
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("snapshots in-tree symlink targets as dereferenced content", () => {
    setupSymlinkedMainBranch();

    git(["checkout", "pr"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile(".claude-pr/CLAUDE.md").isFile()).toBe(true);
    expect(lstatRepoFile(".claude-pr/.claude/CLAUDE.md").isFile()).toBe(true);
    expect(readRepoFile(".claude-pr/CLAUDE.md")).toBe(
      "shared agent instructions\n",
    );
    expect(readRepoFile(".claude-pr/.claude/CLAUDE.md")).toBe(
      "shared agent instructions\n",
    );
  });

  test("records CLAUDE.md links to targets outside the working tree as links only", () => {
    const outsideFile = writeOutsideFile("notes.md", "outside notes\n");

    rmSync(join(repoDir, "CLAUDE.md"), { force: true });
    symlinkRepoFile("CLAUDE.md", outsideFile);
    git(["add", "-A"]);
    git(["commit", "-m", "pr links CLAUDE.md outside the repo"]);

    restoreConfigFromBase("main");

    expect(lstatRepoFile(".claude-pr/CLAUDE.md").isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(repoDir, ".claude-pr/CLAUDE.md"))).toBe(
      outsideFile,
    );
    expect(snapshotRegularFileContents()).not.toContain("outside notes\n");
    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
  });

  test("records nested links to targets outside the working tree as links only", () => {
    const outsideFile = writeOutsideFile(
      "secret.txt",
      "outside file content\n",
    );
    writeOutsideFile("dir/inner.txt", "outside dir content\n");
    const outsideDir = join(tempDir, "outside", "dir");

    symlinkRepoFile(".claude/linked-file.md", outsideFile);
    symlinkRepoFile(".claude/linked-dir", outsideDir);
    git(["add", "-A"]);
    git(["commit", "-m", "pr adds nested links outside the repo"]);

    restoreConfigFromBase("main");

    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expect(
      lstatRepoFile(".claude-pr/.claude/linked-file.md").isSymbolicLink(),
    ).toBe(true);
    expect(
      lstatRepoFile(".claude-pr/.claude/linked-dir").isSymbolicLink(),
    ).toBe(true);
    const contents = snapshotRegularFileContents();
    expect(contents).not.toContain("outside file content\n");
    expect(contents).not.toContain("outside dir content\n");
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("records links into git metadata as links only", () => {
    symlinkRepoFile(".claude/git-config", "../.git/config");
    git(["add", "-A"]);
    git(["commit", "-m", "pr links into git metadata"]);

    restoreConfigFromBase("main");

    expect(
      lstatRepoFile(".claude-pr/.claude/git-config").isSymbolicLink(),
    ).toBe(true);
    expect(snapshotRegularFileContents()).not.toContain(
      readRepoFile(".git/config"),
    );
  });

  test("records links back into a parent directory as links only", () => {
    symlinkRepoFile(".claude/parent-dir", "..");
    git(["add", "-A"]);
    git(["commit", "-m", "pr adds a link back to the repo root"]);

    restoreConfigFromBase("main");

    expect(
      lstatRepoFile(".claude-pr/.claude/parent-dir").isSymbolicLink(),
    ).toBe(true);
    expect(existsRepoFile(".claude-pr/.claude/parent-dir/src")).toBe(false);
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
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

  function git(args: string[]): string {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  function writeRepoFile(path: string, contents: string): void {
    const fullPath = join(repoDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }

  function readRepoFile(path: string): string {
    return readFileSync(join(repoDir, path), "utf8");
  }

  function writeOutsideFile(path: string, contents: string): string {
    const fullPath = join(tempDir, "outside", path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
    return fullPath;
  }

  // Contents of every regular file recorded in the snapshot, without following
  // links, so tests can assert what actually got copied into the repository.
  function snapshotRegularFileContents(): string[] {
    const contents: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry);
        const stats = lstatSync(entryPath);
        if (stats.isDirectory()) {
          visit(entryPath);
        } else if (stats.isFile()) {
          contents.push(readFileSync(entryPath, "utf8"));
        }
      }
    };
    visit(join(repoDir, ".claude-pr"));
    return contents;
  }

  function existsRepoFile(path: string): boolean {
    return existsSync(join(repoDir, path));
  }

  function symlinkRepoFile(path: string, target: string): void {
    const fullPath = join(repoDir, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    symlinkSync(target, fullPath);
  }

  function lstatRepoFile(path: string) {
    return lstatSync(join(repoDir, path));
  }

  function setupSymlinkedMainBranch(): void {
    git(["checkout", "main"]);
    rmSync(join(repoDir, "CLAUDE.md"), { force: true });
    writeRepoFile("AGENTS.md", "shared agent instructions\n");
    symlinkRepoFile("CLAUDE.md", "AGENTS.md");
    symlinkRepoFile(".claude/CLAUDE.md", "../AGENTS.md");
    git(["add", "AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md"]);
    git(["commit", "-m", "add symlinked claude files"]);
    git(["push", "origin", "main"]);
    git(["branch", "-D", "pr"]);
    git(["checkout", "-b", "pr"]);
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
