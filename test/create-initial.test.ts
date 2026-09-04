import {
  describe,
  test,
  expect,
  jest,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Octokit } from "@octokit/rest";
import { createInitialComment } from "../src/github/operations/comments/create-initial";
import type { ParsedGitHubContext } from "../src/github/context";
import { mockPullRequestOpenedContext } from "./mockContext";

const STICKY_COMMENT_ID = 4242;
const NEW_COMMENT_ID = 9999;
// Mirrors the app bot id that create-initial.ts matches existing comments on.
const CLAUDE_APP_BOT_ID = 209825114;

function humanComment(index: number) {
  return {
    id: 1000 + index,
    body: `human comment ${index}`,
    user: { id: 500 + index, login: `user${index}`, type: "User" },
  };
}

// 35 comments: more than one default page (30), with the existing Claude
// sticky comment sitting on the second page.
function commentsWithStickyOnSecondPage() {
  const comments = Array.from({ length: 35 }, (_, i) => humanComment(i));
  comments[32] = {
    id: STICKY_COMMENT_ID,
    body: "Claude Code is working…",
    user: { id: CLAUDE_APP_BOT_ID, login: "claude[bot]", type: "Bot" },
  };
  return comments;
}

function createMockOctokit(comments: ReturnType<typeof humanComment>[]) {
  return {
    paginate: jest.fn().mockResolvedValue(comments),
    rest: {
      issues: {
        listComments: jest.fn(),
        updateComment: jest
          .fn()
          .mockResolvedValue({ data: { id: STICKY_COMMENT_ID } }),
        createComment: jest
          .fn()
          .mockResolvedValue({ data: { id: NEW_COMMENT_ID } }),
      },
      pulls: {
        createReplyForReviewComment: jest.fn(),
      },
    },
  };
}

describe("createInitialComment with use_sticky_comment", () => {
  const originalGithubOutput = process.env.GITHUB_OUTPUT;
  let tempDir: string;
  let githubOutputPath: string;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  const stickyContext: ParsedGitHubContext = {
    ...mockPullRequestOpenedContext,
    inputs: { ...mockPullRequestOpenedContext.inputs, useStickyComment: true },
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "create-initial-test-"));
    githubOutputPath = path.join(tempDir, "github_output");
    await writeFile(githubOutputPath, "");
    process.env.GITHUB_OUTPUT = githubOutputPath;
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    if (originalGithubOutput === undefined) {
      delete process.env.GITHUB_OUTPUT;
    } else {
      process.env.GITHUB_OUTPUT = originalGithubOutput;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  test("updates an existing sticky comment beyond the first page of comments", async () => {
    const octokit = createMockOctokit(commentsWithStickyOnSecondPage());

    const result = await createInitialComment(
      octokit as unknown as Octokit,
      stickyContext,
    );

    expect(octokit.paginate).toHaveBeenCalledWith(
      octokit.rest.issues.listComments,
      {
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
        per_page: 100,
      },
    );
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "test-owner",
        repo: "test-repo",
        comment_id: STICKY_COMMENT_ID,
      }),
    );
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(result.id).toBe(STICKY_COMMENT_ID);
    expect(await readFile(githubOutputPath, "utf-8")).toBe(
      `claude_comment_id=${STICKY_COMMENT_ID}\n`,
    );
  });

  test("creates a new comment when no sticky comment exists", async () => {
    const octokit = createMockOctokit(
      Array.from({ length: 35 }, (_, i) => humanComment(i)),
    );

    const result = await createInitialComment(
      octokit as unknown as Octokit,
      stickyContext,
    );

    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
      }),
    );
    expect(result.id).toBe(NEW_COMMENT_ID);
  });
});
