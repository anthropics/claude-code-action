import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Octokits } from "../src/github/api/client";
import type { FetchDataResult } from "../src/github/data/fetcher";
import { setupBranch } from "../src/github/operations/branch";
import { createMockContext } from "./mockContext";

const defaultBranch = "claude/issue-42-20240115-1430";
const templateBranch = "claude/custom-42";
const githubData: FetchDataResult = {
  contextData: {
    title: "Fix a workflow",
    body: "",
    author: null,
    createdAt: "2024-01-15T14:00:00Z",
    state: "OPEN",
    labels: { nodes: [] },
    comments: { nodes: [] },
  },
  comments: [],
  changedFiles: [],
  changedFilesWithSHA: [],
  reviewData: null,
  imageUrlMap: new Map(),
};

describe("setupBranch when a generated branch name is occupied", () => {
  let originalCwd: string;
  let tempDir: string;
  let baseSha: string;

  function git(...args: string[]): string {
    return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  function setup(
    useCommitSigning: boolean,
    branchNameTemplate?: string,
    branchPrefix = "claude/",
  ) {
    const octokits = {
      rest: {
        git: { getRef: async () => ({ data: { object: { sha: baseSha } } }) },
      },
    } as Octokits;
    const context = createMockContext({
      entityNumber: 42,
      inputs: {
        baseBranch: "main",
        useCommitSigning,
        branchNameTemplate,
        branchPrefix,
      },
    });
    return setupBranch(octokits, githubData, context, undefined, false);
  }

  beforeEach(() => {
    setSystemTime(new Date(2024, 0, 15, 14, 30));
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "setup-branch-collision-"));
    const repo = join(tempDir, "repo");
    const origin = join(tempDir, "origin.git");
    mkdirSync(repo);
    process.chdir(repo);
    git("init", "--bare", "--initial-branch=main", origin);
    git("init", "--initial-branch=main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test User");
    git("config", "commit.gpgsign", "false");
    git("commit", "--allow-empty", "-m", "Base commit");
    baseSha = git("rev-parse", "HEAD");
    git("remote", "add", "origin", origin);
    git("push", "origin", "main");
  });

  afterEach(() => {
    setSystemTime();
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  for (const useCommitSigning of [false, true]) {
    test(`chooses an unused name when the default branch exists remotely (signing: ${useCommitSigning})`, async () => {
      const existingSha = git(
        "commit-tree",
        git("rev-parse", "HEAD^{tree}"),
        "-p",
        baseSha,
        "-m",
        "Earlier run's commit",
      );
      git("push", "origin", `${existingSha}:refs/heads/${defaultBranch}`);

      const result = await setup(useCommitSigning);

      expect(result.claudeBranch).not.toBe(defaultBranch);
      expect(
        git("ls-remote", "origin", `refs/heads/${result.claudeBranch}`),
      ).toBe("");
      expect(git("branch", "--show-current")).toBe(
        useCommitSigning ? "main" : result.claudeBranch!,
      );
      expect(git("rev-parse", "HEAD")).toBe(baseSha);
      expect(git("ls-remote", "origin", `refs/heads/${defaultBranch}`)).toBe(
        `${existingSha}\trefs/heads/${defaultBranch}`,
      );
    });

    test(`checks the fallback when both template and default names exist (signing: ${useCommitSigning})`, async () => {
      git(
        "push",
        "origin",
        `HEAD:refs/heads/${templateBranch}`,
        `HEAD:refs/heads/${defaultBranch}`,
      );

      const result = await setup(useCommitSigning, templateBranch);

      expect(result.claudeBranch).not.toBe(templateBranch);
      expect(result.claudeBranch).not.toBe(defaultBranch);
      expect(
        git("ls-remote", "origin", `refs/heads/${result.claudeBranch}`),
      ).toBe("");
    });

    test(`keeps an unused default fallback (signing: ${useCommitSigning})`, async () => {
      git("push", "origin", `HEAD:refs/heads/${templateBranch}`);

      expect((await setup(useCommitSigning, templateBranch)).claudeBranch).toBe(
        defaultBranch,
      );
    });
  }

  test("keeps an unused template name", async () => {
    expect((await setup(false, templateBranch)).claudeBranch).toBe(
      templateBranch,
    );
  });

  test("keeps the configured namespace when adding a suffix to a long name", async () => {
    const prefix = "automation/customer-application-long-triage/";
    const occupied = `${prefix}issue-42-20240115-1430`.slice(0, 50);
    git("push", "origin", `HEAD:refs/heads/${occupied}`);

    const result = await setup(false, undefined, prefix);

    expect(result.claudeBranch).toStartWith(`${occupied}-`);
    expect(git("branch", "--show-current")).toBe(result.claudeBranch!);
  });

  test("chooses an unused name when the default name exists only locally", async () => {
    git("branch", defaultBranch);
    const exit = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`setupBranch exited with code ${code}`);
    });

    try {
      const result = await setup(false);

      expect(result.claudeBranch).not.toBe(defaultBranch);
      expect(git("branch", "--show-current")).toBe(result.claudeBranch!);
      expect(git("rev-parse", `refs/heads/${defaultBranch}`)).toBe(baseSha);
    } finally {
      exit.mockRestore();
    }
  });
});
