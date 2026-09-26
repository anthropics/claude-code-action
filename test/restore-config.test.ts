import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

  test("records dangling links as placeholders, including top-level ones", () => {
    setupSymlinkedMainBranch();

    git(["checkout", "pr"]);
    rmSync(join(repoDir, "AGENTS.md"), { force: true });
    git(["add", "-A"]);
    git(["commit", "-m", "pr deletes agents file"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/CLAUDE.md");
    expectPlaceholder(".claude-pr/.claude/CLAUDE.md");
    expectNoLinksInSnapshot();
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("snapshots links to tracked in-tree files as dereferenced content", () => {
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
    expectNoLinksInSnapshot();
  });

  test("records CLAUDE.md links to targets outside the working tree as placeholders", () => {
    const outsideFile = writeOutsideFile("notes.md", "outside notes\n");

    rmSync(join(repoDir, "CLAUDE.md"), { force: true });
    symlinkRepoFile("CLAUDE.md", outsideFile);
    git(["add", "-A"]);
    git(["commit", "-m", "pr links CLAUDE.md outside the repo"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/CLAUDE.md");
    expect(readRepoFile(".claude-pr/CLAUDE.md")).not.toBe("outside notes\n");
    expect(snapshotRegularFileContents()).not.toContain("outside notes\n");
    expectNoLinksInSnapshot();
    expect(readRepoFile("CLAUDE.md")).toBe("base claude instructions\n");
  });

  test("records nested links to targets outside the working tree as placeholders", () => {
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
    expectPlaceholder(".claude-pr/.claude/linked-file.md");
    expectPlaceholder(".claude-pr/.claude/linked-dir");
    const contents = snapshotRegularFileContents();
    expect(contents).not.toContain("outside file content\n");
    expect(contents).not.toContain("outside dir content\n");
    expectNoLinksInSnapshot();
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("records links into git metadata as placeholders", () => {
    symlinkRepoFile(".claude/git-config", "../.git/config");
    git(["add", "-A"]);
    git(["commit", "-m", "pr links into git metadata"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/git-config");
    expect(snapshotRegularFileContents()).not.toContain(
      readRepoFile(".git/config"),
    );
    expectNoLinksInSnapshot();
  });

  test("records relative links that only resolve from inside the snapshot as placeholders", () => {
    // Both targets dangle at their source location but would resolve to the
    // repository's .git/config if re-created one directory deeper.
    symlinkRepoFile(".claude/x", "../../.git/config");
    rmSync(join(repoDir, "CLAUDE.md"), { force: true });
    symlinkRepoFile("CLAUDE.md", "../.git/config");
    git(["add", "-A"]);
    git(["commit", "-m", "pr adds relative links"]);

    restoreConfigFromBase("main");

    const gitConfig = readRepoFile(".git/config");
    for (const path of [".claude-pr/.claude/x", ".claude-pr/CLAUDE.md"]) {
      expectPlaceholder(path);
      expect(readRepoFile(path)).not.toBe(gitConfig);
    }
    expect(snapshotRegularFileContents()).not.toContain(gitConfig);
    expectNoLinksInSnapshot();
  });

  test("records links into nested git metadata inside the working tree as placeholders", () => {
    writeRepoFile("other/.git/config", "nested checkout config\n");
    symlinkRepoFile(".claude/x", "../other/.git/config");

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/x");
    expect(snapshotRegularFileContents()).not.toContain(
      "nested checkout config\n",
    );
    expectNoLinksInSnapshot();
  });

  test("records links to untracked in-tree files as placeholders", () => {
    writeRepoFile(".env", "untracked env contents\n");
    symlinkRepoFile(".claude/env", "../.env");
    git(["add", ".claude/env"]);
    git(["commit", "-m", "pr links to an untracked file"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/env");
    expect(snapshotRegularFileContents()).not.toContain(
      "untracked env contents\n",
    );
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expectNoLinksInSnapshot();
  });

  test("records links to tracked files modified after checkout as placeholders", () => {
    writeRepoFile(".env", "PLACEHOLDER=1\n");
    symlinkRepoFile(".claude/env", "../.env");
    git(["add", ".env", ".claude/env"]);
    git(["commit", "-m", "pr links to a tracked file"]);
    writeRepoFile(".env", "written after checkout\n");

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/env");
    expect(snapshotRegularFileContents()).not.toContain(
      "written after checkout\n",
    );
    expectNoLinksInSnapshot();
  });

  test("snapshots a sensitive path that links to a tracked in-tree directory", () => {
    rmSync(join(repoDir, ".claude"), { recursive: true, force: true });
    writeRepoFile(
      "config/claude/settings.json",
      `${JSON.stringify({ source: "linked-dir" })}\n`,
    );
    writeRepoFile("config/claude/agents/reviewer.md", "reviewer agent\n");
    writeRepoFile("docs/agents/writer.md", "writer agent\n");
    symlinkRepoFile("config/claude/more-agents", "../../docs/agents");
    symlinkRepoFile(".claude", "config/claude");
    git(["add", "-A"]);
    git(["commit", "-m", "pr links .claude to a tracked directory"]);
    writeRepoFile("config/claude/local.txt", "untracked file\n");
    writeRepoFile("config/claude/cache/entry.txt", "untracked dir entry\n");

    restoreConfigFromBase("main");

    expect(lstatRepoFile(".claude-pr/.claude").isDirectory()).toBe(true);
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "linked-dir" })}\n`,
    );
    expect(readRepoFile(".claude-pr/.claude/agents/reviewer.md")).toBe(
      "reviewer agent\n",
    );
    expect(readRepoFile(".claude-pr/.claude/more-agents/writer.md")).toBe(
      "writer agent\n",
    );
    expectPlaceholder(".claude-pr/.claude/local.txt");
    expectPlaceholder(".claude-pr/.claude/cache");
    const contents = snapshotRegularFileContents();
    expect(contents).not.toContain("untracked file\n");
    expect(contents).not.toContain("untracked dir entry\n");
    expectNoLinksInSnapshot();
    expect(lstatRepoFile(".claude").isDirectory()).toBe(true);
    expect(readRepoFile(".claude/settings.json")).toBe(
      `${JSON.stringify({ source: "base" })}\n`,
    );
  });

  test("records links to untracked in-tree directories as a single placeholder", () => {
    writeRepoFile("build/out/a.js", "generated a\n");
    writeRepoFile("build/out/b.js", "generated b\n");
    symlinkRepoFile(".claude/build", "../build");
    git(["add", ".claude/build"]);
    git(["commit", "-m", "pr links to an untracked directory"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/build");
    const contents = snapshotRegularFileContents();
    expect(contents).not.toContain("generated a\n");
    expect(contents).not.toContain("generated b\n");
    expectNoLinksInSnapshot();
  });

  test("records links back into a parent directory as placeholders", () => {
    symlinkRepoFile(".claude/parent-dir", "..");
    git(["add", "-A"]);
    git(["commit", "-m", "pr adds a link back to the repo root"]);

    restoreConfigFromBase("main");

    expectPlaceholder(".claude-pr/.claude/parent-dir");
    expect(existsRepoFile(".claude-pr/.claude/parent-dir/src")).toBe(false);
    expect(readRepoFile(".claude-pr/.claude/settings.json")).toBe(
      `${JSON.stringify({ source: "pr" })}\n`,
    );
    expectNoLinksInSnapshot();
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

  test("leaves a full checkout unshallow so base..HEAD stays scoped to the PR", () => {
    // The damage only shows up once base has moved on since the PR branched:
    // the merge base is then an older commit that a depth-limited fetch of base
    // truncates away, and every base..HEAD comparison silently changes meaning.
    git(["checkout", "main"]);
    writeRepoFile("src/other.ts", "export const advanced = true;\n");
    git(["add", "src/other.ts"]);
    git(["commit", "-m", "base advance"]);
    git(["push", "origin", "main"]);
    git(["checkout", "pr"]);

    expect(git(["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    const mergeBaseBefore = git(["merge-base", "origin/main", "HEAD"]).trim();

    restoreConfigFromBase("main");

    expect(git(["rev-parse", "--is-shallow-repository"]).trim()).toBe("false");
    expect(git(["merge-base", "origin/main", "HEAD"]).trim()).toBe(
      mergeBaseBefore,
    );
    // These are the two commands the prompt tells Claude to run to scope its
    // work to the PR: the log range must not pick up already-merged commits,
    // and the three-dot diff must still resolve a merge base at all.
    expect(git(["log", "--format=%s", "origin/main..HEAD"]).trim()).toBe(
      "pr config",
    );
    expect(
      git(["diff", "--name-only", "origin/main...HEAD"]).trim().split("\n"),
    ).toEqual([".claude/settings.json", "CLAUDE.md"]);
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

  // The snapshot must never contain links: every entry is a regular file or a
  // real directory.
  function expectNoLinksInSnapshot(): void {
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry);
        const stats = lstatSync(entryPath);
        expect(stats.isSymbolicLink()).toBe(false);
        if (stats.isDirectory()) {
          visit(entryPath);
        }
      }
    };
    visit(join(repoDir, ".claude-pr"));
  }

  function expectPlaceholder(path: string): void {
    const stats = lstatRepoFile(path);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(stats.isFile()).toBe(true);
    expect(readRepoFile(path)).toStartWith("Snapshot placeholder: ");
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
