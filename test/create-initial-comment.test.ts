import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Octokit } from "@octokit/rest";
import { createInitialComment } from "../src/github/operations/comments/create-initial";
import {
  createJobRunLink,
  createCommentBody,
} from "../src/github/operations/comments/common";
import { createMockContext } from "./mockContext";

const CLAUDE_APP_BOT_ID = 209825114;
const OUTPUT_PATH = join(tmpdir(), `gh-output-${process.pid}`);
const originalGithubOutput = process.env.GITHUB_OUTPUT;

// Body the function under test computes for the default mock context
// (repository test-owner/test-repo, run id 1234567890).
const initialBody = createCommentBody(
  createJobRunLink("test-owner", "test-repo", "1234567890"),
);

type CommentUser = { id: number; type: string; login: string };

function makeOctokit(options?: {
  existingComments?: Array<{ id: number; user?: CommentUser; body?: string }>;
  failReviewReply?: boolean;
  failCreateAttempts?: number;
}) {
  const listComments = mock(async () => ({
    data: options?.existingComments ?? [],
  }));
  const updateComment = mock(async () => ({ data: { id: 222 } }));
  let createCalls = 0;
  const createComment = mock(async () => {
    createCalls++;
    if (createCalls <= (options?.failCreateAttempts ?? 0)) {
      throw new Error(`create failed (attempt ${createCalls})`);
    }
    return { data: { id: 111 } };
  });
  const createReplyForReviewComment = mock(async () => {
    if (options?.failReviewReply) {
      throw new Error("review reply failed");
    }
    return { data: { id: 333 } };
  });

  const octokit = {
    rest: {
      issues: { listComments, createComment, updateComment },
      pulls: { createReplyForReviewComment },
    },
  } as unknown as Octokit;

  return {
    octokit,
    listComments,
    createComment,
    updateComment,
    createReplyForReviewComment,
  };
}

let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let consoleErrorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeEach(() => {
  writeFileSync(OUTPUT_PATH, "");
  process.env.GITHUB_OUTPUT = OUTPUT_PATH;
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

afterAll(() => {
  rmSync(OUTPUT_PATH, { force: true });
  if (originalGithubOutput === undefined) {
    delete process.env.GITHUB_OUTPUT;
  } else {
    process.env.GITHUB_OUTPUT = originalGithubOutput;
  }
});

describe("createInitialComment", () => {
  test("creates an issue comment for plain issues", async () => {
    const { octokit, createComment, listComments } = makeOctokit();
    const context = createMockContext({
      eventName: "issues",
      entityNumber: 42,
    });

    const result = await createInitialComment(octokit, context);

    expect(result.id).toBe(111);
    expect(listComments).not.toHaveBeenCalled();
    expect(createComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 42,
      body: initialBody,
    });
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe("claude_comment_id=111\n");
  });

  test("replies to the review comment on pull_request_review_comment events", async () => {
    const { octokit, createReplyForReviewComment, createComment } =
      makeOctokit();
    const context = createMockContext({
      eventName: "pull_request_review_comment",
      entityNumber: 999,
      isPR: true,
      payload: { comment: { id: 777 } } as never,
    });

    const result = await createInitialComment(octokit, context);

    expect(result.id).toBe(333);
    expect(createComment).not.toHaveBeenCalled();
    expect(createReplyForReviewComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 999,
      comment_id: 777,
      body: initialBody,
    });
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe("claude_comment_id=333\n");
  });

  describe("sticky comment on pull_request events", () => {
    const stickyContext = () =>
      createMockContext({
        eventName: "pull_request",
        entityNumber: 456,
        isPR: true,
        inputs: { useStickyComment: true },
      });

    test("updates the existing comment matched by the Claude app bot id", async () => {
      const { octokit, updateComment, createComment, listComments } =
        makeOctokit({
          existingComments: [
            {
              id: 9,
              user: { id: CLAUDE_APP_BOT_ID, type: "User", login: "someone" },
              body: "older body",
            },
          ],
        });

      const result = await createInitialComment(octokit, stickyContext());

      expect(result.id).toBe(222);
      expect(createComment).not.toHaveBeenCalled();
      expect(listComments).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
      });
      expect(updateComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        comment_id: 9,
        body: initialBody,
      });
    });

    test("updates the existing comment matched by a claude bot login", async () => {
      const { octokit, updateComment } = makeOctokit({
        existingComments: [
          {
            id: 10,
            user: { id: 1, type: "Bot", login: "claude-for-github[bot]" },
            body: "older body",
          },
        ],
      });

      const result = await createInitialComment(octokit, stickyContext());

      expect(result.id).toBe(222);
      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 10 }),
      );
    });

    test("does not match a non-bot user with claude in the login", async () => {
      const { octokit, updateComment, createComment } = makeOctokit({
        existingComments: [
          {
            id: 11,
            user: { id: 1, type: "User", login: "claude-fan" },
            body: "unrelated",
          },
        ],
      });

      await createInitialComment(octokit, stickyContext());

      expect(updateComment).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalled();
    });

    test("updates the existing comment matched by identical body", async () => {
      const { octokit, updateComment } = makeOctokit({
        existingComments: [
          {
            id: 12,
            user: { id: 1, type: "User", login: "someone" },
            body: initialBody,
          },
        ],
      });

      const result = await createInitialComment(octokit, stickyContext());

      expect(result.id).toBe(222);
      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 12 }),
      );
    });

    test("creates a new comment when nothing matches", async () => {
      const { octokit, updateComment, createComment } = makeOctokit({
        existingComments: [
          {
            id: 13,
            user: { id: 1, type: "User", login: "someone" },
            body: "unrelated",
          },
        ],
      });

      const result = await createInitialComment(octokit, stickyContext());

      expect(result.id).toBe(111);
      expect(updateComment).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({ issue_number: 456 }),
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("matches a claude bot login case-insensitively", async () => {
      const { octokit, updateComment } = makeOctokit({
        existingComments: [
          {
            id: 14,
            user: { id: 1, type: "Bot", login: "Claude-App[bot]" },
            body: "older body",
          },
        ],
      });

      const result = await createInitialComment(octokit, stickyContext());

      expect(result.id).toBe(222);
      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 14 }),
      );
    });

    test("does not match a bot without claude in the login", async () => {
      const { octokit, updateComment, createComment } = makeOctokit({
        existingComments: [
          {
            id: 15,
            user: { id: 1, type: "Bot", login: "github-actions[bot]" },
            body: "ci output",
          },
        ],
      });

      await createInitialComment(octokit, stickyContext());

      expect(updateComment).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("handles comments without a user", async () => {
      const { octokit, updateComment, createComment } = makeOctokit({
        existingComments: [{ id: 16, body: "ghost comment" }],
      });

      await createInitialComment(octokit, stickyContext());

      expect(updateComment).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("ignores existing comments when sticky mode is disabled", async () => {
      const { octokit, listComments, updateComment, createComment } =
        makeOctokit({
          existingComments: [
            {
              id: 17,
              user: { id: CLAUDE_APP_BOT_ID, type: "User", login: "someone" },
              body: "older body",
            },
          ],
        });
      const context = createMockContext({
        eventName: "pull_request",
        entityNumber: 456,
        isPR: true,
        inputs: { useStickyComment: false },
      });

      const result = await createInitialComment(octokit, context);

      expect(result.id).toBe(111);
      expect(listComments).not.toHaveBeenCalled();
      expect(updateComment).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalled();
    });

    test("ignores sticky mode outside pull_request events", async () => {
      const { octokit, listComments, createComment } = makeOctokit();
      const context = createMockContext({
        eventName: "issue_comment",
        entityNumber: 789,
        isPR: true,
        inputs: { useStickyComment: true },
      });

      await createInitialComment(octokit, context);

      expect(listComments).not.toHaveBeenCalled();
      expect(createComment).toHaveBeenCalled();
    });
  });

  describe("fallback behavior", () => {
    test("falls back to a plain issue comment when the primary call fails", async () => {
      const { octokit, createComment } = makeOctokit({
        failReviewReply: true,
      });
      const context = createMockContext({
        eventName: "pull_request_review_comment",
        entityNumber: 999,
        isPR: true,
        payload: { comment: { id: 777 } } as never,
      });

      const result = await createInitialComment(octokit, context);

      expect(result.id).toBe(111);
      expect(createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 999,
        body: initialBody,
      });
      expect(readFileSync(OUTPUT_PATH, "utf8")).toBe("claude_comment_id=111\n");
    });

    test("rethrows when the fallback also fails", async () => {
      const { octokit } = makeOctokit({ failCreateAttempts: 2 });
      const context = createMockContext({
        eventName: "issues",
        entityNumber: 42,
      });

      await expect(createInitialComment(octokit, context)).rejects.toThrow(
        "create failed (attempt 2)",
      );
      expect(readFileSync(OUTPUT_PATH, "utf8")).toBe("");
    });
  });
});
