import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { ParsedGitHubContext } from "../src/github/context";
import { setupBranch } from "../src/github/operations/branch";
import { chooseConfigBranch } from "../src/github/operations/config-branch";
import {
  fetchBranch,
  keepHeadHistory,
  restoreConfigFromBase,
} from "../src/github/operations/restore-config";
import {
  mockPullRequestCommentContext,
  mockPullRequestOpenedContext,
} from "./mockContext";

function withPullRequest(
  context: ParsedGitHubContext,
  options: {
    headRepo?: string | null;
    headRef?: string;
    authorType?: string;
    defaultBranch?: string;
    baseBranchInput?: string;
  },
): ParsedGitHubContext {
  const { headRepo, headRef, authorType = "User", baseBranchInput } = options;
  const payload = context.payload as any;
  const key = "pull_request" in payload ? "pull_request" : "issue";
  return {
    ...context,
    repository: {
      ...context.repository,
      default_branch:
        "defaultBranch" in options ? options.defaultBranch : "trunk",
    },
    inputs: { ...context.inputs, baseBranch: baseBranchInput },
    payload: {
      ...payload,
      [key]: {
        ...payload[key],
        user: { login: "someone", type: authorType },
        head: {
          ref: headRef ?? "feature",
          repo: headRepo ? { full_name: headRepo } : null,
        },
      },
    },
  };
}

describe("chooseConfigBranch", () => {
  const here = mockPullRequestOpenedContext.repository.full_name;
  const cases: Array<[string | null, string, boolean, string]> = [
    ["someone/fork", "User", true, "trunk"],
    ["someone/fork", "Bot", true, "trunk"],
    [null, "Bot", true, "trunk"],
    [here, "User", true, "trunk"],
    [here, "Bot", true, "release"],
    [here.toUpperCase(), "Bot", true, "release"],
    ["someone/fork", "User", false, "release"],
  ];
  test.each(cases)(
    "pull_request: head in %p, author %p, untrusted %p uses %p",
    (headRepo, authorType, untrusted, expected) => {
      const pr = withPullRequest(mockPullRequestOpenedContext, {
        headRepo,
        authorType,
      });
      expect(chooseConfigBranch(pr, "release", untrusted)).toBe(expected);
    },
  );

  test.each([
    [true, "User", true, "trunk"],
    [false, "User", true, "trunk"],
    [true, "Bot", true, "trunk"],
    [undefined, "Bot", true, "trunk"],
    [false, "Bot", true, "release"],
    [true, "User", false, "release"],
  ] as const)(
    "issue_comment: fork %p, author %p, untrusted %p uses %p",
    (isFork, authorType, untrusted, expected) => {
      const pr = withPullRequest(mockPullRequestCommentContext, { authorType });
      expect(chooseConfigBranch(pr, "release", untrusted, isFork)).toBe(
        expected,
      );
    },
  );

  test("the base_branch input comes before the default branch", () => {
    const pr = withPullRequest(mockPullRequestCommentContext, {
      baseBranchInput: "develop",
    });
    expect(chooseConfigBranch(pr, "release", true, true)).toBe("develop");
    expect(chooseConfigBranch(pr, "release", false, true)).toBe("release");
  });

  test("a pull request that targets the default branch keeps its base", () => {
    for (const baseBranchInput of [undefined, "develop"]) {
      const pr = withPullRequest(mockPullRequestCommentContext, {
        baseBranchInput,
      });
      expect(chooseConfigBranch(pr, "trunk", true, true)).toBe("trunk");
    }
  });

  test("a bot's pull request into a branch with a fork's commits uses the default", () => {
    const pr = withPullRequest(mockPullRequestOpenedContext, {
      headRepo: here,
      authorType: "Bot",
    });
    expect(chooseConfigBranch(pr, "pr-12", true)).toBe("trunk");
    expect(chooseConfigBranch(pr, "pr-12-notes", true)).toBe("pr-12-notes");
  });

  test("the pull request's head branch name is not used as the input", () => {
    const pr = withPullRequest(mockPullRequestOpenedContext, {
      headRepo: "someone/fork",
      headRef: "pr-1",
      baseBranchInput: "pr-1",
    });
    expect(chooseConfigBranch(pr, "release", true)).toBe("trunk");
  });

  test.each([undefined, "", "--upload-pack=x"])(
    "throws when the default branch is %p",
    (defaultBranch) => {
      const pr = withPullRequest(mockPullRequestCommentContext, {
        defaultBranch,
      });
      expect(() => chooseConfigBranch(pr, "release", true, true)).toThrow();
      expect(chooseConfigBranch(pr, "release", false, true)).toBe("release");
    },
  );
});

describe("in a shallow checkout of the default branch", () => {
  let originalCwd: string;
  let dir: string;
  let head: string;
  const allowForkPrs = process.env.ALLOW_FORK_PRS;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
      { cwd, encoding: "utf8", stdio: "pipe" },
    ).trim();
  const commit = (source: string, file: string, content: string) => {
    writeFileSync(join(source, file), content);
    git(source, "add", file);
    git(source, "commit", "-m", content);
  };

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = mkdtempSync(join("/tmp", "config-branch-"));
    const source = join(dir, "source");
    git(dir, "init", "-b", "trunk", source);
    git(source, "config", "uploadpack.allowAnySHA1InWant", "true");
    commit(source, "CLAUDE.md", "release");
    git(source, "branch", "release");
    commit(source, "CLAUDE.md", "trunk");
    git(source, "checkout", "--detach", "release");
    commit(source, "change.txt", "change");
    head = git(source, "rev-parse", "HEAD");
    git(source, "update-ref", "refs/pull/1/head", head);
    git(source, "checkout", "trunk");

    const checkout = join(dir, "checkout");
    git(dir, "init", checkout);
    git(checkout, "remote", "add", "origin", `file://${source}`);
    git(checkout, "fetch", "--depth=1", "origin", "trunk");
    git(checkout, "checkout", "-B", "trunk", "origin/trunk");
    process.chdir(checkout);
    process.env.ALLOW_FORK_PRS = "true";
  });

  afterEach(() => {
    if (allowForkPrs === undefined) delete process.env.ALLOW_FORK_PRS;
    else process.env.ALLOW_FORK_PRS = allowForkPrs;
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  const checkOutPullRequest = (
    isCrossRepository: boolean,
    skipLfsDownloads = false,
  ) =>
    setupBranch(
      {} as any,
      {
        contextData: {
          state: "OPEN",
          headRefName: "x",
          headRefOid: head,
          baseRefName: "release",
          isCrossRepository,
          commits: { totalCount: 1 },
        },
      } as any,
      mockPullRequestCommentContext,
      undefined,
      skipLfsDownloads,
    );

  test("setupBranch says whether it checked out a fork", async () => {
    expect((await checkOutPullRequest(true)).isFork).toBe(true);
    expect((await checkOutPullRequest(false)).isFork).toBe(false);
  });

  test.each([true, false])(
    "setupBranch skips Git LFS downloads for its checkout only: %p",
    async (skip) => {
      const before = process.env.GIT_LFS_SKIP_SMUDGE;
      delete process.env.GIT_LFS_SKIP_SMUDGE;
      try {
        git(".", "config", "filter.show.smudge", 'echo "$GIT_LFS_SKIP_SMUDGE"');
        writeFileSync(".git/info/attributes", "change.txt filter=show\n");
        await checkOutPullRequest(true, skip);
        expect(readFileSync("change.txt", "utf8").trim()).toBe(skip ? "1" : "");
        expect(process.env.GIT_LFS_SKIP_SMUDGE).toBeUndefined();
      } finally {
        if (before !== undefined) process.env.GIT_LFS_SKIP_SMUDGE = before;
      }
    },
  );

  test("the base can still be compared after restoring from another branch", async () => {
    await checkOutPullRequest(true);
    restoreConfigFromBase("trunk");
    fetchBranch("release");

    expect(readFileSync("CLAUDE.md", "utf8")).toBe("trunk");
    expect(git(".", "diff", "--name-only", "origin/release...HEAD")).toBe(
      "change.txt",
    );
  });
});

describe("in a shallow checkout whose history contains the config branch", () => {
  test.each([
    [false, 0],
    [true, 0],
    [false, 6],
  ])(
    "the base can still be compared (tag in the history: %p, commits since: %p)",
    (withTag, commitsSince) => {
      const originalCwd = process.cwd();
      const dir = mkdtempSync(join("/tmp", "config-branch-"));
      const git = (cwd: string, ...args: string[]) =>
        execFileSync(
          "git",
          [
            ...["-c", "user.name=t", "-c", "user.email=t@example.com"],
            ...["-c", "commit.gpgsign=false", ...args],
          ],
          { cwd, encoding: "utf8", stdio: "pipe" },
        ).trim();
      const source = join(dir, "source");
      const checkout = join(dir, "checkout");
      const commit = (name: string) => {
        writeFileSync(join(source, name), name);
        git(source, "add", name);
        git(source, "commit", "-m", name);
      };
      try {
        git(dir, "init", "-b", "trunk", source);
        git(source, "config", "uploadpack.allowAnySHA1InWant", "true");
        for (let i = 0; i < 10; i++) commit(`old-${i}`);
        git(source, "branch", "release");
        commit("CLAUDE.md");
        commit("trunk-1");
        git(source, "checkout", "--detach", "trunk");
        commit("HEAD");
        commit("change-1");
        if (withTag) git(source, "update-ref", "refs/tags/v1", "HEAD");
        commit("change-2");
        const head = git(source, "rev-parse", "HEAD");
        git(source, "update-ref", "refs/pull/1/head", head);
        git(source, "checkout", "trunk");
        for (let i = 0; i < commitsSince; i++) commit(`later-${i}`);

        git(dir, "init", checkout);
        git(checkout, "remote", "add", "origin", `file://${source}`);
        git(checkout, "fetch", "--depth=1", "origin", "trunk");
        git(checkout, "fetch", "--depth=8", "origin", head);
        git(checkout, "checkout", "--detach", head);
        process.chdir(checkout);

        const restoreHeadHistory = keepHeadHistory();
        restoreConfigFromBase("trunk");
        restoreHeadHistory();
        fetchBranch("release");

        expect(readFileSync("CLAUDE.md", "utf8")).toBe("CLAUDE.md");
        expect(
          git(".", "diff", "--name-only", "origin/release...HEAD").split("\n"),
        ).toEqual(["CLAUDE.md", "HEAD", "change-1", "change-2", "trunk-1"]);
        expect(git(".", "rev-list", "--count", "origin/release..HEAD")).toBe(
          "5",
        );
        expect(git(".", "tag")).toBe("");

        // A pull request that targets the config branch itself.
        if (commitsSince > 0) return;
        restoreConfigFromBase("trunk");
        expect(
          git(".", "diff", "--name-only", "origin/trunk...HEAD").split("\n"),
        ).toEqual(["HEAD", "change-1", "change-2"]);
      } finally {
        process.chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

test("run.ts restores every kind of config from the chosen branch", () => {
  const source = readFileSync(
    join(import.meta.dir, "../src/entrypoints/run.ts"),
    "utf8",
  );
  expect(source.replace(/\s+/g, " ")).toContain(
    "chooseConfigBranch( context, restoreBase, untrustedPrDisallowedTools.length > 0, isFork, )",
  );
  expect(source.replace(/\s+/g, " ")).toContain(
    "isOtherBranch ? keepHeadHistory() : undefined; restoredConfigPaths = restoreConfigFromBase(configBranch);",
  );
  expect(source).toContain("restoreHeadHistory?.();");
  expect(source).toContain("pinRestoredPaths(restoredConfigPaths)");
  expect(source).toContain("restoreToolConfigFromBase(configBranch)");
  expect(source.replace(/\s+/g, " ")).toContain(
    "restoreConfigPathsFromBase( configBranch, namedConfigPaths(prepareResult.claudeArgs), )",
  );
  expect(source).toContain("fetchBranch(restoreBase)");
});
