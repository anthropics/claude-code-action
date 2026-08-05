import { describe, test, expect, jest, beforeEach } from "bun:test";
import { COMMENT_MARKER } from "../src/github/operations/comments/common";
import { createInitialComment } from "../src/github/operations/comments/create-initial";
import type { ParsedGitHubContext } from "../src/github/context";

function makeContext(
  overrides: Partial<ParsedGitHubContext> = {},
): ParsedGitHubContext {
  return {
    runId: "42",
    eventName: "issue_comment",
    eventAction: "created",
    repository: { owner: "org", repo: "repo", full_name: "org/repo" },
    actor: "testuser",
    entityNumber: 7,
    isPR: true,
    inputs: {
      prompt: "",
      triggerPhrase: "@claude",
      assigneeTrigger: "",
      labelTrigger: "",
      branchPrefix: "claude/",
      useStickyComment: true,
      classifyInlineComments: true,
      useCommitSigning: false,
      sshSigningKey: "",
      botId: "41898282",
      botName: "claude[bot]",
      allowedBots: "",
      allowedNonWriteUsers: "",
      trackProgress: false,
      includeFixLinks: false,
      includeCommentsByActor: "",
      excludeCommentsByActor: "",
    },
    payload: {
      action: "created",
      issue: {
        number: 7,
        pull_request: { url: "https://api.github.com/repos/org/repo/pulls/7" },
      },
      comment: { id: 999, body: "@claude fix this" },
    } as any,
    ...overrides,
  } as ParsedGitHubContext;
}

describe("sticky comment (createInitialComment with useStickyComment)", () => {
  let mockOctokit: any;
  const createdComment = {
    data: {
      id: 1001,
      html_url: "https://github.com/org/repo/issues/7#issuecomment-1001",
    },
  };
  const updatedComment = {
    data: {
      id: 500,
      html_url: "https://github.com/org/repo/issues/7#issuecomment-500",
    },
  };

  beforeEach(() => {
    // Reset GITHUB_OUTPUT so appendFileSync doesn't blow up
    process.env.GITHUB_OUTPUT = "/dev/null";
    mockOctokit = {
      rest: {
        issues: {
          listComments: jest.fn(),
          createComment: jest.fn().mockResolvedValue(createdComment),
          updateComment: jest.fn().mockResolvedValue(updatedComment),
        },
        pulls: {
          createReplyForReviewComment: jest.fn(),
        },
      },
    };
  });

  test("updates an existing comment that has the marker", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [
        { id: 100, body: "unrelated comment", user: { login: "alice" } },
        {
          id: 500,
          body: `${COMMENT_MARKER}\nClaude Code is working…`,
          user: { login: "claude[bot]" },
        },
      ],
    });

    const context = makeContext();
    const result = await createInitialComment(mockOctokit, context);

    // Should have searched for comments
    expect(mockOctokit.rest.issues.listComments).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      issue_number: 7,
    });

    // Should update the existing comment, not create a new one
    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 500 }),
    );
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(result.id).toBe(500);
  });

  test("creates a new comment when no existing marker is found", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [
        { id: 100, body: "some other comment", user: { login: "alice" } },
      ],
    });

    const context = makeContext();
    const result = await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "org",
        repo: "repo",
        issue_number: 7,
      }),
    );
    expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.id).toBe(1001);
  });

  test("creates a new comment when the comment list is empty", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] });

    const context = makeContext();
    const result = await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
    expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(result.id).toBe(1001);
  });

  test("works for issues (not just PRs)", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 600,
          body: `${COMMENT_MARKER}\nold working body`,
          user: { login: "github-actions[bot]" },
        },
      ],
    });

    const context = makeContext({
      eventName: "issues",
      isPR: false,
      payload: {
        action: "opened",
        issue: { number: 7 },
      } as any,
    });

    const result = await createInitialComment(mockOctokit, context);

    expect(mockOctokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 600 }),
    );
    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(result.id).toBe(500); // updatedComment.data.id
  });

  test("the new comment body contains the marker", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({ data: [] });

    const context = makeContext();
    await createInitialComment(mockOctokit, context);

    const createCall = mockOctokit.rest.issues.createComment.mock.calls[0][0];
    expect(createCall.body).toContain(COMMENT_MARKER);
  });

  test("skips sticky logic when useStickyComment is false", async () => {
    const context = makeContext();
    context.inputs.useStickyComment = false;

    await createInitialComment(mockOctokit, context);

    // Should not search for existing comments
    expect(mockOctokit.rest.issues.listComments).not.toHaveBeenCalled();
    // Should create a new comment directly
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
  });

  test("marker detection ignores comments without the marker even from bots", async () => {
    mockOctokit.rest.issues.listComments.mockResolvedValue({
      data: [
        {
          id: 300,
          body: "Claude Code is working…",
          user: { login: "claude[bot]", type: "Bot", id: 41898282 },
        },
      ],
    });

    const context = makeContext();
    await createInitialComment(mockOctokit, context);

    // Even though this comment looks like a Claude comment, it lacks the marker
    // so we create a new one
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
    expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });
});
