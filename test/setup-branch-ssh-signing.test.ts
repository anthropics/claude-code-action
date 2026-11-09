import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupBranch } from "../src/github/operations/branch";
import { createMockContext } from "./mockContext";
import type { Octokits } from "../src/github/api/client";

test("SSH signing creates a local issue branch even when API signing is configured", async () => {
  const root = mkdtempSync(join(tmpdir(), "setup-branch-ssh-"));
  const remote = join(root, "remote.git");
  const work = join(root, "work");
  const originalCwd = process.cwd();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: work, encoding: "utf8" }).trim();

  try {
    execFileSync("git", ["init", "-q", "--bare", remote]);
    execFileSync("git", ["init", "-q", "-b", "main", work]);
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("remote", "add", "origin", remote);
    writeFileSync(join(work, "README.md"), "base\n");
    git("add", "README.md");
    git("commit", "-qm", "base");
    git("push", "-q", "origin", "main");

    const context = createMockContext({
      isPR: false,
      entityNumber: 42,
      inputs: {
        useCommitSigning: true,
        sshSigningKey: "test SSH key",
        branchPrefix: "claude/",
      },
    });
    const octokits = {
      rest: {
        repos: { get: async () => ({ data: { default_branch: "main" } }) },
        git: {
          getRef: async () => ({
            data: { object: { sha: git("rev-parse", "main") } },
          }),
        },
      },
    } as unknown as Octokits;
    const githubData = {
      contextData: { title: "Add feature", labels: { nodes: [] } },
    } as any;

    process.chdir(work);
    const branchInfo = await setupBranch(octokits, githubData, context);
    expect(branchInfo.claudeBranch).toStartWith("claude/");
    expect(git("branch", "--show-current")).toBe(branchInfo.claudeBranch!);
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
