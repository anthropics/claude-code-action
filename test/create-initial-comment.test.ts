import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { Octokit } from "@octokit/rest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createInitialComment } from "../src/github/operations/comments/create-initial";
import { createMockContext } from "./mockContext";

describe("createInitialComment", () => {
  let mockOctokit: Octokit;
  let originalGitHubOutput: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    originalGitHubOutput = process.env.GITHUB_OUTPUT;
    tempDir = mkdtempSync(join(tmpdir(), "create-initial-comment-"));
    process.env.GITHUB_OUTPUT = join(tempDir, "github_output.txt");

    mockOctokit = {
      rest: {
        issues: {
          listComments: jest.fn(),
          updateComment: jest.fn(),
          createComment: jest.fn(),
        },
        pulls: {
          createReplyForReviewComment: jest.fn(),
        },
      },
    } as any as Octokit;
  });

  afterEach(() => {
    if (originalGitHubOutput === undefined) {
      delete process.env.GITHUB_OUTPUT;
    } else {
      process.env.GITHUB_OUTPUT = originalGitHubOutput;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("uses sticky comment for pull_request events when enabled", async () => {
    const context = createMockContext({
      eventName: "pull_request",
      isPR: true,
      entityNumber: 42,
      inputs: { useStickyComment: true },
    });

    // @ts-expect-error Mock
    mockOctokit.rest.issues.listComments = jest.fn().mockResolvedValue({
      data: [],
    });
    // @ts-expect-error Mock
    mockOctokit.rest.issues.createComment = jest.fn().mockResolvedValue({
      data: { id: 100 },
    });

    await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 42,
    });
  });

  test("uses sticky comment for issue_comment events on PRs when enabled", async () => {
    const context = createMockContext({
      eventName: "issue_comment",
      isPR: true,
      entityNumber: 42,
      inputs: { useStickyComment: true, botId: "987654" },
    });

    // @ts-expect-error Mock
    mockOctokit.rest.issues.listComments = jest.fn().mockResolvedValue({
      data: [
        {
          id: 11,
          body: "old-body",
          user: { id: 987654, type: "Bot", login: "custom-bot[bot]" },
        },
      ],
    });
    // @ts-expect-error Mock
    mockOctokit.rest.issues.updateComment = jest.fn().mockResolvedValue({
      data: { id: 11 },
    });

    await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalled();
    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 11,
      body: expect.any(String),
    });
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  test("matches existing comments by configured bot ID", async () => {
    const context = createMockContext({
      eventName: "pull_request",
      isPR: true,
      entityNumber: 77,
      inputs: { useStickyComment: true, botId: "5555" },
    });

    // @ts-expect-error Mock
    mockOctokit.rest.issues.listComments = jest.fn().mockResolvedValue({
      data: [
        {
          id: 44,
          body: "different-body",
          user: { id: 5555, type: "Bot", login: "not-claude[bot]" },
        },
      ],
    });
    // @ts-expect-error Mock
    mockOctokit.rest.issues.updateComment = jest.fn().mockResolvedValue({
      data: { id: 44 },
    });

    await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      comment_id: 44,
      body: expect.any(String),
    });
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  test("does not use sticky comment for PR review comment events", async () => {
    const context = createMockContext({
      eventName: "pull_request_review_comment",
      isPR: true,
      entityNumber: 88,
      inputs: { useStickyComment: true },
      payload: { comment: { id: 12345 } } as any,
    });

    // @ts-expect-error Mock
    mockOctokit.rest.pulls.createReplyForReviewComment = jest
      .fn()
      .mockResolvedValue({ data: { id: 12345 } });

    await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.listComments).not.toHaveBeenCalled();
    expect(
      mockOctokit.rest.pulls.createReplyForReviewComment,
    ).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      pull_number: 88,
      comment_id: 12345,
      body: expect.any(String),
    });
  });

  test("does not use sticky comment for issue_comment events on issues (not PRs)", async () => {
    const context = createMockContext({
      eventName: "issue_comment",
      isPR: false,
      entityNumber: 55,
      inputs: { useStickyComment: true },
    });

    // @ts-expect-error Mock
    mockOctokit.rest.issues.createComment = jest.fn().mockResolvedValue({
      data: { id: 200 },
    });

    await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.listComments).not.toHaveBeenCalled();
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      issue_number: 55,
      body: expect.any(String),
    });
  });
});
