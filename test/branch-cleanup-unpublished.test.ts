import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { updateCommentLink } from "../src/entrypoints/update-comment-link";
import type { Octokits } from "../src/github/api/client";
import {
  checkAndCommitOrDeleteBranch,
  UnpublishedBranchRecoveryError,
} from "../src/github/operations/branch-cleanup";
import { createMockContext } from "./mockContext";

const BRANCH = "claude/recover-issue-7";
const REF = `refs/heads/${BRANCH}`;
const hasGitLfs = spawnSync("git", ["lfs", "version"]).status === 0;
setDefaultTimeout(30_000);

describe("recovery of a recorded branch push", () => {
  let previousCwd: string;
  let directory: string;
  let worktree: string;
  let origin: string;
  let baseSha: string;

  function git(...args: string[]): string {
    return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
      cwd: worktree,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  function commit(message: string): string {
    git("add", "-A");
    git("commit", "-m", message);
    return git("rev-parse", "HEAD");
  }

  function remoteHead(): string {
    return git("ls-remote", "origin", REF).split("\t")[0] ?? "";
  }

  function cleanup(
    options: {
      commitSha?: string;
      remoteSha?: string;
      lookupStatus?: number;
      useCommitSigning?: boolean;
      restoredConfigPaths?: string[];
      expectedPushUrl?: string;
    } = {},
  ) {
    const octokit = {
      rest: {
        repos: {
          getBranch: async () => {
            if (options.remoteSha) {
              return { data: { commit: { sha: options.remoteSha } } };
            }
            throw Object.assign(new Error("Branch lookup failed"), {
              status: options.lookupStatus ?? 404,
            });
          },
        },
      },
    } as unknown as Octokits;
    return checkAndCommitOrDeleteBranch(
      octokit,
      "owner",
      "repo",
      BRANCH,
      "main",
      options.useCommitSigning ?? false,
      options.restoredConfigPaths,
      {
        recovery: {
          baseSha,
          commitSha: options.commitSha ?? git("rev-parse", "HEAD"),
          expectedPushUrl: options.expectedPushUrl,
        },
      },
    );
  }

  beforeEach(() => {
    previousCwd = process.cwd();
    directory = mkdtempSync(join(tmpdir(), "claude-branch-recovery-"));
    worktree = join(directory, "work");
    origin = join(directory, "origin.git");
    mkdirSync(worktree);
    git("init", "--bare", "--initial-branch=main", origin);
    git("init", "--initial-branch=main");
    git("config", "user.name", "Test User");
    git("config", "user.email", "test@example.com");
    git("config", "commit.gpgsign", "false");
    git("remote", "add", "origin", origin);
    writeFileSync(join(worktree, "config.txt"), "Base configuration\n");
    writeFileSync(join(worktree, "code.txt"), "Base code\n");
    baseSha = commit("Starting branch");
    git("push", "origin", "main");
    git("checkout", "-b", BRANCH);
    process.chdir(worktree);
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(directory, { recursive: true, force: true });
  });

  test("publishes the exact previously attempted commit, leaving dirty files in place", async () => {
    writeFileSync(join(worktree, "code.txt"), "Published code\n");
    const commitSha = commit("Work to publish");
    writeFileSync(join(worktree, "uncommitted.txt"), "Local-only draft\n");
    writeFileSync(join(worktree, "config.txt"), "Restored configuration\n");
    git("add", "config.txt");
    const dirtyBefore = git("status", "--porcelain");

    const result = await cleanup({
      commitSha,
      restoredConfigPaths: ["config.txt"],
      expectedPushUrl: git("remote", "get-url", "--push", "--all", "origin"),
    });

    expect(result.branchLink).toContain(BRANCH);
    expect(result.shouldDeleteBranch).toBe(false);
    expect(remoteHead()).toBe(commitSha);
    expect(git("status", "--porcelain")).toBe(dirtyBefore);
    expect(git("show", "HEAD:config.txt")).toBe("Base configuration");
  });

  test("does not create a branch with no committed changes", async () => {
    writeFileSync(join(worktree, "uncommitted.txt"), "Local-only draft\n");

    expect((await cleanup()).branchLink).toBe("");
    expect(remoteHead()).toBe("");
  });

  test("does not create a branch with Git when API signing is configured", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const localCommit = commit("Local-only commit");

    expect((await cleanup({ useCommitSigning: true })).branchLink).toBe("");
    expect(remoteHead()).toBe("");
    expect(git("rev-parse", "HEAD")).toBe(localCommit);
  });

  test("does not publish a different commit from the recorded one", async () => {
    writeFileSync(join(worktree, "code.txt"), "First change\n");
    const commitSha = commit("Attempted change");
    writeFileSync(join(worktree, "code.txt"), "Later change\n");
    const currentCommit = commit("Unpublished subsequent change");

    await expect(cleanup({ commitSha })).rejects.toThrow("recorded commit");
    expect(remoteHead()).toBe("");
    expect(git("rev-parse", "HEAD")).toBe(currentCommit);
  });

  test("does not publish from a different checked-out branch", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");
    git("checkout", "-b", "another-branch");

    await expect(cleanup({ commitSha })).rejects.toThrow("checked-out branch");
    expect(remoteHead()).toBe("");
  });

  test("does not publish restored paths already included in a local commit", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    writeFileSync(join(worktree, "config.txt"), "Transient restored config\n");
    const commitSha = commit("Unsafe recovery content");

    await expect(
      cleanup({ commitSha, restoredConfigPaths: ["config.txt"] }),
    ).rejects.toThrow("restored configuration");
    expect(remoteHead()).toBe("");
  });

  test("does not interpret an authorization error as an absent branch", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");

    await expect(cleanup({ commitSha, lookupStatus: 403 })).rejects.toThrow(
      "confirm the remote branch state",
    );
    expect(remoteHead()).toBe("");
  });

  test("does not publish when origin's push URL changed after recording", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");
    const expectedPushUrl = git(
      "remote",
      "get-url",
      "--push",
      "--all",
      "origin",
    );
    git("remote", "set-url", "--push", "origin", join(directory, "other.git"));

    await expect(cleanup({ commitSha, expectedPushUrl })).rejects.toThrow(
      "push destination no longer matches",
    );
    expect(remoteHead()).toBe("");
  });

  test("does not update a branch created after the API reported it missing", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");
    git("push", "origin", `${baseSha}:${REF}`);

    await expect(cleanup({ commitSha })).rejects.toThrow("could not publish");
    expect(remoteHead()).toBe(baseSha);
    expect(git("rev-parse", "HEAD")).toBe(commitSha);
  });

  test("publishes an attempted fast-forward when the remote is still at its confirmed SHA", async () => {
    git("push", "origin", `${baseSha}:${REF}`);
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");

    expect(
      (await cleanup({ commitSha, remoteSha: baseSha })).branchLink,
    ).toContain(BRANCH);
    expect(remoteHead()).toBe(commitSha);
  });

  test("does not replace a remote that moved after the API lookup", async () => {
    writeFileSync(join(worktree, "code.txt"), "First published change\n");
    const remoteMovedSha = commit("Concurrent change");
    git("push", "origin", `${remoteMovedSha}:${REF}`);
    writeFileSync(join(worktree, "code.txt"), "Latest change\n");
    const commitSha = commit("Attempted change");

    await expect(cleanup({ commitSha, remoteSha: baseSha })).rejects.toThrow(
      "could not publish",
    );
    expect(remoteHead()).toBe(remoteMovedSha);
  });

  test("does not replace a confirmed remote commit outside the attempted history", async () => {
    git("checkout", "-b", "other-work");
    writeFileSync(join(worktree, "code.txt"), "Independent remote change\n");
    const remoteSha = commit("Remote work");
    git("push", "origin", `${remoteSha}:${REF}`);
    git("checkout", BRANCH);
    writeFileSync(join(worktree, "code.txt"), "Attempted local change\n");
    const commitSha = commit("Attempted change");

    await expect(cleanup({ commitSha, remoteSha })).rejects.toThrow(
      "cannot fast-forward",
    );
    expect(remoteHead()).toBe(remoteSha);
  });

  test("recovers the recorded push even if its tracking comment was deleted", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");
    const notFound = Object.assign(new Error("Not found"), { status: 404 });
    const octokit = {
      rest: {
        repos: {
          getBranch: async () => {
            throw notFound;
          },
        },
        issues: {
          getComment: async () => {
            throw notFound;
          },
        },
      },
    } as unknown as Octokits;

    await expect(
      updateCommentLink({
        commentId: 42,
        githubToken: "fake-token",
        claudeBranch: BRANCH,
        baseBranch: "main",
        context: createMockContext(),
        octokit,
        claudeSuccess: true,
        prepareSuccess: true,
        useCommitSigning: false,
        pushRecovery: { baseSha, commitSha },
      }),
    ).rejects.toBe(notFound);
    expect(remoteHead()).toBe(commitSha);
  });

  test("updates the failure comment and propagates recovery failure without legacy cleanup", async () => {
    writeFileSync(join(worktree, "code.txt"), "Local code\n");
    const commitSha = commit("Attempted change");
    let writtenComment: string | undefined;
    let branchReads = 0;
    const issues = {
      getComment: async () => ({
        data: { body: "Claude Code is working…" },
      }),
      updateComment: async ({ body }: { body: string }) => {
        writtenComment = body;
        return { data: { id: 42 } };
      },
    };
    const octokit = {
      rest: {
        repos: {
          getBranch: async () => {
            branchReads++;
            throw Object.assign(new Error("Forbidden"), { status: 403 });
          },
        },
        issues,
        rest: { issues },
      },
    } as unknown as Octokits;

    await expect(
      updateCommentLink({
        commentId: 42,
        githubToken: "fake-token",
        claudeBranch: BRANCH,
        baseBranch: "main",
        context: createMockContext(),
        octokit,
        claudeSuccess: true,
        prepareSuccess: true,
        useCommitSigning: false,
        pushRecovery: { baseSha, commitSha },
      }),
    ).rejects.toBeInstanceOf(UnpublishedBranchRecoveryError);
    expect(branchReads).toBe(1);
    expect(writtenComment).toContain("Claude encountered an error");
    expect(writtenComment).toContain(
      "Could not confirm the remote branch state",
    );
    expect(remoteHead()).toBe("");
  });

  test.skipIf(!hasGitLfs)(
    "uploads LFS objects from earlier commits with hooks disabled",
    async () => {
      git("lfs", "install", "--local");
      git("config", "core.hooksPath", join(directory, "disabled-hooks"));
      git("lfs", "track", "*.bin");
      const lfsPath = join(worktree, "artifact.bin");
      writeFileSync(lfsPath, "Previously committed LFS content\n");
      const earlierCommit = commit("Add LFS artifact");
      const pointer = git("show", `${earlierCommit}:artifact.bin`);
      const oid = pointer.match(/oid sha256:([a-f0-9]{64})/)?.[1];
      if (!oid) throw new Error("Fixture did not create an LFS pointer");
      rmSync(lfsPath);
      const commitSha = commit("Remove LFS artifact from the branch tip");

      const config = join(worktree, ".lfsconfig");
      const otherEndpoint = pathToFileURL(join(directory, "other-lfs"));
      writeFileSync(config, `[lfs]\nurl = ${otherEndpoint.href}\n`);
      await expect(cleanup({ commitSha })).rejects.toThrow(
        "working-tree LFS configuration differs",
      );
      expect(remoteHead()).toBe("");
      rmSync(config);

      expect((await cleanup({ commitSha })).branchLink).toContain(BRANCH);
      expect(remoteHead()).toBe(commitSha);
      expect(
        readFileSync(
          join(origin, "lfs", "objects", oid.slice(0, 2), oid.slice(2, 4), oid),
          "utf8",
        ),
      ).toBe("Previously committed LFS content\n");
    },
    60_000,
  );
});
