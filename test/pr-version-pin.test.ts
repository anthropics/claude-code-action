import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupBranch } from "../src/github/operations/branch";
import { createMockContext } from "./mockContext";

const PR_NUMBER = 42;
const TRIGGER_TIME = "2026-10-26T12:00:00Z";

describe("setupBranch PR version pinning", () => {
  let originalCwd: string;
  let tempDir: string;
  let originDir: string;
  let sourceDir: string;
  let checkoutDir: string;
  let headSha: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "pr-version-pin-"));
    originDir = join(tempDir, "origin.git");
    sourceDir = join(tempDir, "source");
    checkoutDir = join(tempDir, "checkout");

    execFileSync("git", [
      "init",
      "-q",
      "--bare",
      "--initial-branch=main",
      originDir,
    ]);
    execFileSync("git", ["init", "-q", "--initial-branch=main", sourceDir]);
    git(sourceDir, "config", "user.email", "test@example.com");
    git(sourceDir, "config", "user.name", "Test");
    git(sourceDir, "commit", "--allow-empty", "-qm", "base");
    git(sourceDir, "remote", "add", "origin", originDir);
    git(sourceDir, "push", "-q", "-u", "origin", "main");

    // The checkout resembles the base repository. The PR commit exists only
    // on its pull ref, as it does for a private fork that the action cannot read.
    git(sourceDir, "checkout", "-qb", "private-fork-feature");
    git(sourceDir, "commit", "--allow-empty", "-qm", "private fork head");
    headSha = git(sourceDir, "rev-parse", "HEAD");
    git(sourceDir, "push", "-q", "origin", `HEAD:refs/pull/${PR_NUMBER}/head`);
    execFileSync("git", ["clone", "-q", "--no-local", originDir, checkoutDir]);
    process.chdir(checkoutDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("pins a private fork through the base repository pull ref", async () => {
    expect(() =>
      git(checkoutDir, "cat-file", "-e", `${headSha}^{commit}`),
    ).toThrow();

    let activityRequests = 0;
    const result = await setupBranch(
      {
        rest: {
          request: async () => {
            activityRequests += 1;
            throw new Error("private fork activity should not be requested");
          },
        },
      } as any,
      privateForkData(),
      prCommentContext(),
      TRIGGER_TIME,
    );

    expect(result).toEqual({ baseBranch: "main", currentBranch: "pr-42" });
    expect(git(checkoutDir, "rev-parse", "HEAD")).toBe(headSha);
    expect(activityRequests).toBe(0);
  });

  test("rejects a private fork pull ref that changed after its SHA was read", async () => {
    git(sourceDir, "commit", "--allow-empty", "-qm", "new private fork head");
    const updatedSha = git(sourceDir, "rev-parse", "HEAD");
    git(
      sourceDir,
      "push",
      "-q",
      "--force",
      "origin",
      `HEAD:refs/pull/${PR_NUMBER}/head`,
    );

    await expect(
      setupBranch(
        { rest: { request: async () => ({ data: [] }) } } as any,
        privateForkData(),
        prCommentContext(),
        TRIGGER_TIME,
      ),
    ).rejects.toThrow(
      `PR #${PR_NUMBER} was updated while its head was being fetched (${headSha} -> ${updatedSha})`,
    );
  });

  test("keeps activity validation for readable head repositories", async () => {
    const requestCalls: Array<[string, Record<string, unknown>]> = [];

    await expect(
      setupBranch(
        {
          rest: {
            request: async (route: string, params: Record<string, unknown>) => {
              requestCalls.push([route, params]);
              return {
                data: [{ after: headSha, timestamp: TRIGGER_TIME }],
              };
            },
          },
        } as any,
        privateForkData({
          headRepository: {
            owner: { login: "fork-owner" },
            name: "fork-repository",
          },
        }),
        prCommentContext(),
        TRIGGER_TIME,
      ),
    ).rejects.toThrow(
      `PR #${PR_NUMBER} was updated after the trigger (${TRIGGER_TIME} >= ${TRIGGER_TIME})`,
    );

    expect(requestCalls).toEqual([
      [
        "GET /repos/{owner}/{repo}/activity",
        {
          owner: "fork-owner",
          repo: "fork-repository",
          ref: "refs/heads/private-fork-feature",
          per_page: 1,
        },
      ],
    ]);
  });

  function privateForkData(overrides: Record<string, unknown> = {}) {
    return {
      contextData: {
        state: "OPEN",
        headRefName: "private-fork-feature",
        headRefOid: headSha,
        isCrossRepository: true,
        headRepository: null,
        commits: { totalCount: 1 },
        baseRefName: "main",
        ...overrides,
      },
    } as any;
  }

  function prCommentContext() {
    return createMockContext({
      eventName: "issue_comment",
      entityNumber: PR_NUMBER,
      isPR: true,
    });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
