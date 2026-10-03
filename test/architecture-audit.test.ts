import { test, expect, spyOn } from "bun:test";

import * as core from "@actions/core";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { setupWorkloadIdentity } from "../base-action/src/workload-identity";
import {
  writeExecutionFile,
  setExecutionFileOutputIfPresent,
} from "../base-action/src/execution-file";
import { setupBranch } from "../src/github/operations/branch";
import { prepareTagMode } from "../src/modes/tag";
import * as actor from "../src/github/validation/actor";
import * as initial from "../src/github/operations/comments/create-initial";
import * as fetcher from "../src/github/data/fetcher";
import { mockIssueCommentContext } from "./mockContext";
import { PR_QUERY, ISSUE_QUERY } from "../src/github/api/queries/github";
import { updateCommentLink } from "../src/entrypoints/update-comment-link";
import { mockPullRequestReviewCommentContext } from "./mockContext";

// OIDC lifecycle tests are regressions; other tests characterize unfixed defects.
test("review-reply fallback loses the comment API namespace", async () => {
  const env = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), "audit-comment-"));
  let issueReads = 0;
  const api = {
    pulls: {
      createReplyForReviewComment: async () => {
        throw new Error("reply failed");
      },
      getReviewComment: async () => {
        throw new Error("review namespace: 404");
      },
      get: async () => ({ data: {} }),
    },
    issues: {
      createComment: async () => ({ data: { id: 99 } }),
      getComment: async () => {
        issueReads++;
        return { data: { id: 99, body: "working" } };
      },
    },
  };
  try {
    process.env.GITHUB_OUTPUT = join(dir, "output");
    const comment = await initial.createInitialComment(
      { rest: api } as any,
      mockPullRequestReviewCommentContext,
    );
    expect(comment.id).toBe(99);
    await expect(
      updateCommentLink({
        commentId: comment.id,
        githubToken: "test",
        baseBranch: "main",
        context: mockPullRequestReviewCommentContext,
        octokit: { rest: api } as any,
        claudeSuccess: false,
        prepareSuccess: true,
        useCommitSigning: false,
      }),
    ).rejects.toThrow("review namespace: 404");
    expect(issueReads).toBe(0);
  } finally {
    process.env = env;
    rmSync(dir, { recursive: true, force: true });
  }
});
test("OIDC refresh cannot recreate credentials after stop", async () => {
  const env = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), "audit-wif-"));
  let tick!: () => Promise<void> | undefined;
  let complete!: (token: string) => void;
  const token = spyOn(core, "getIDToken").mockResolvedValue("initial");
  const timer = spyOn(globalThis, "setInterval").mockImplementation(((
    fn: () => Promise<void> | undefined,
  ) => {
    tick = fn;
    return 123;
  }) as any);
  const clear = spyOn(globalThis, "clearInterval").mockImplementation(() => {});
  try {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ANTHROPIC_CONFIG_DIR",
      "ANTHROPIC_PROFILE",
    ])
      delete process.env[key];
    Object.assign(process.env, {
      RUNNER_TEMP: dir,
      ANTHROPIC_FEDERATION_RULE_ID: "rule",
      ANTHROPIC_ORGANIZATION_ID: "org",
    });
    const handle = (await setupWorkloadIdentity())!;
    token.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    expect(handle.isStopped).toBe(false);
    const refresh = tick();
    tick();
    expect(token).toHaveBeenCalledTimes(2); // Initial setup + one refresh.
    const configDir = process.env.ANTHROPIC_CONFIG_DIR!;
    handle.stop();
    expect(handle.isStopped).toBe(true);
    expect(clear).toHaveBeenCalledWith(123);
    expect(existsSync(handle.tokenFile)).toBe(false);
    complete("refreshed");
    await refresh;
    expect(existsSync(handle.tokenFile)).toBe(false);
    expect(existsSync(configDir)).toBe(false);
    expect(existsSync(join(dir, "claude-workload-identity"))).toBe(false);
    tick();
    expect(token).toHaveBeenCalledTimes(2);
    handle.stop(); // Repeated cleanup is safe.
  } finally {
    token.mockRestore();
    timer.mockRestore();
    clear.mockRestore();
    process.env = env;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a later failed invocation publishes an earlier execution file", async () => {
  const env = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), "audit-output-"));
  const output = spyOn(core, "setOutput").mockImplementation(() => {});
  try {
    process.env.RUNNER_TEMP = dir;
    const previous = await writeExecutionFile([
      { type: "result", session_id: "previous-run" },
    ]);
    // Next invocation fails during preparation, before any SDK messages.
    expect(setExecutionFileOutputIfPresent()).toBe(previous!);
    expect(output).toHaveBeenCalledWith("execution_file", previous!);
  } finally {
    output.mockRestore();
    process.env = env;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preparation rejects without transferring ownership of an existing comment", async () => {
  const human = spyOn(actor, "checkHumanActor").mockResolvedValue(undefined);
  const created = spyOn(initial, "createInitialComment").mockResolvedValue({
    id: 42,
  } as any);
  const timestamp = spyOn(fetcher, "resolveTriggerTimestamp").mockResolvedValue(
    undefined,
  );
  const data = spyOn(fetcher, "fetchGitHubData").mockRejectedValue(
    new Error("API unavailable"),
  );
  let commentId: number | undefined;
  try {
    await expect(
      (async () => {
        const result = await prepareTagMode({
          context: mockIssueCommentContext,
          octokit: {} as any,
          githubToken: "test",
        });
        commentId = result.commentId;
      })(),
    ).rejects.toThrow("API unavailable");
    expect(created).toHaveBeenCalledTimes(1);
    expect(commentId).toBeUndefined();
  } finally {
    human.mockRestore();
    created.mockRestore();
    timestamp.mockRestore();
    data.mockRestore();
  }
});

test("GraphQL connections are capped without continuation metadata", () => {
  expect(PR_QUERY).toContain("files(first: 100)");
  expect(PR_QUERY).toContain("reviews(first: 100)");
  expect(ISSUE_QUERY).toContain("comments(first: 100)");
  expect(PR_QUERY + ISSUE_QUERY).not.toMatch(/pageInfo|endCursor|hasNextPage/);
});

test("setupBranch keeps stale local head after remote force push", async () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "audit-git-"));
  const remote = join(dir, "remote.git"),
    work = join(dir, "work");
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "--bare", remote);
    mkdirSync(work);
    process.chdir(work);
    git("init");
    git("config", "user.name", "Audit");
    git("config", "user.email", "audit@example.com");
    git("config", "commit.gpgsign", "false");
    writeFileSync("file.txt", "old");
    git("add", ".");
    git("commit", "-m", "old");
    git("branch", "-M", "feature");
    git("remote", "add", "origin", remote);
    git("push", "-u", "origin", "feature");
    const old = git("rev-parse", "HEAD");
    writeFileSync("file.txt", "new");
    git("add", ".");
    git("commit", "--amend", "-m", "rewritten");
    const latest = git("rev-parse", "HEAD");
    git("push", "--force", "origin", "feature");
    git("reset", "--hard", old);
    git("checkout", "--detach");
    await setupBranch(
      {} as any,
      {
        contextData: {
          state: "OPEN",
          headRefName: "feature",
          headRefOid: latest,
          baseRefName: "main",
          isCrossRepository: false,
          commits: { totalCount: 1 },
        },
      } as any,
      {
        repository: { owner: "o", repo: "r" },
        entityNumber: 1,
        inputs: {},
        isPR: true,
      } as any,
    );
    expect(git("rev-parse", "origin/feature")).toBe(latest);
    expect(git("rev-parse", "HEAD")).toBe(old);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
