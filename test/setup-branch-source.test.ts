import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setupBranch } from "../src/github/operations/branch";
import { createMockContext } from "./mockContext";

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "commit.gpgSign=false", "-C", cwd, ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

describe("setupBranch source checkout", () => {
  let root: string;
  let previousCwd: string;

  beforeEach(() => {
    previousCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), "claude-source-"));
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  });

  for (const scenario of [
    { sourceBranch: "main", explicit: false, advancesAfterLookup: false },
    {
      sourceBranch: "release/stable",
      explicit: true,
      advancesAfterLookup: false,
    },
    { sourceBranch: "main", explicit: false, advancesAfterLookup: true },
    {
      sourceBranch: "main",
      explicit: false,
      advancesAfterLookup: false,
      conflictingLocalEdit: true,
    },
  ]) {
    for (const useCommitSigning of [false, true]) {
      test(`pins ${scenario.sourceBranch} with commit signing ${useCommitSigning}, remote advances after lookup: ${scenario.advancesAfterLookup}, local conflict: ${"conflictingLocalEdit" in scenario}`, async () => {
        const { sourceBranch } = scenario;
        const remote = join(root, "origin.git");
        const seed = join(root, "seed");
        const checkout = join(root, "checkout");
        git(root, "init", "--bare", remote);
        git(root, "init", "-b", sourceBranch, seed);
        git(seed, "config", "user.name", "Branch test");
        git(seed, "config", "user.email", "branch-test@example.invalid");
        writeFileSync(join(seed, "tracked.txt"), "old source\n");
        git(seed, "add", "tracked.txt");
        git(seed, "commit", "-m", "initial source");
        git(seed, "remote", "add", "origin", remote);
        git(seed, "push", "origin", sourceBranch);
        git(root, "clone", "--branch", sourceBranch, remote, checkout);
        const oldHead = git(checkout, "rev-parse", "HEAD");

        // The checkout is now stale, as on a reused runner or when the base
        // advances between actions/checkout and the action's own source fetch.
        writeFileSync(join(seed, "tracked.txt"), "new source\n");
        git(seed, "commit", "-am", "advance source");
        git(seed, "push", "origin", sourceBranch);
        const newHead = git(seed, "rev-parse", "HEAD");
        expect(newHead).not.toBe(oldHead);

        writeFileSync(join(checkout, "untracked.txt"), "keep local work\n");
        process.chdir(checkout);
        const octokits = {
          rest: {
            repos: { get: async () => ({ data: { default_branch: "main" } }) },
            git: {
              getRef: async () => {
                if (scenario.advancesAfterLookup) {
                  writeFileSync(join(seed, "tracked.txt"), "later source\n");
                  git(seed, "commit", "-am", "advance after source lookup");
                  git(seed, "push", "origin", sourceBranch);
                }
                return { data: { object: { sha: newHead } } };
              },
            },
          },
        } as any;
        const githubData = {
          contextData: { title: "Use current source", labels: { nodes: [] } },
        } as any;
        const context = createMockContext({
          isPR: false,
          entityNumber: 42,
          inputs: {
            useCommitSigning,
            branchPrefix: "claude/",
            branchNameTemplate: "{{prefix}}issue-{{entityNumber}}",
            baseBranch: scenario.explicit ? sourceBranch : "",
          },
        });

        if ("conflictingLocalEdit" in scenario) {
          writeFileSync(
            join(checkout, "tracked.txt"),
            "keep conflicting work\n",
          );
          const originalExit = process.exit;
          let exitCode: number | undefined;
          process.exit = ((code?: number) => {
            exitCode = code;
            throw new Error("process.exit called");
          }) as typeof process.exit;
          try {
            await expect(
              setupBranch(octokits, githubData, context),
            ).rejects.toThrow("process.exit called");
          } finally {
            process.exit = originalExit;
          }
          expect(exitCode).toBe(1);
          expect(git(checkout, "rev-parse", "HEAD")).toBe(oldHead);
          expect(readFileSync(join(checkout, "tracked.txt"), "utf8")).toBe(
            "keep conflicting work\n",
          );
          expect(git(checkout, "branch", "--list", "claude/issue-42")).toBe("");
          return;
        }

        const branch = await setupBranch(octokits, githubData, context);

        expect(git(checkout, "rev-parse", "HEAD")).toBe(newHead);
        expect(
          git(checkout, "rev-parse", `refs/remotes/origin/${sourceBranch}`),
        ).toBe(newHead);
        expect(git(checkout, "show", "HEAD:tracked.txt")).toBe("new source");
        expect(git(checkout, "diff", "HEAD", "--")).toBe("");
        expect(readFileSync(join(checkout, "untracked.txt"), "utf8")).toBe(
          "keep local work\n",
        );
        expect(git(checkout, "branch", "--show-current")).toBe(
          branch.currentBranch,
        );
        expect(branch.baseBranch).toBe(sourceBranch);
      }, 30_000);
    }
  }
});
