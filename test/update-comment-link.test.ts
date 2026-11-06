import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { updateCommentLink } from "../src/entrypoints/update-comment-link";
import type { Octokits } from "../src/github/api/client";
import * as comments from "../src/github/operations/comments/update-claude-comment";
import * as branchCleanup from "../src/github/operations/branch-cleanup";
import { createMockContext } from "./mockContext";

const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

describe("completion input propagation", () => {
  for (const eventName of [
    "issue_comment",
    "pull_request_review_comment",
  ] as const) {
    for (const suppressCompletionMention of [false, true]) {
      test(`${eventName} cleanup forwards suppressCompletionMention=${suppressCompletionMention}`, async () => {
        const context = createMockContext({
          eventName,
          inputs: { suppressCompletionMention },
        });
        const currentBody = "Claude Code is working…\n\nPlease ask @reviewer";
        const getComment = mock(async () => ({ data: { body: currentBody } }));
        const getReviewComment = mock(async () => ({
          data: { body: currentBody },
        }));
        const updateComment = spyOn(
          comments,
          "updateClaudeComment",
        ).mockResolvedValue({
          id: 42,
          html_url:
            "https://github.com/test-owner/test-repo/issues/1#issuecomment-42",
          updated_at: "2026-11-06T00:00:00Z",
        });
        const octokit = {
          rest: {
            issues: { getComment },
            pulls: { getReviewComment },
          },
        } as unknown as Octokits;
        spies.push(
          updateComment,
          spyOn(
            branchCleanup,
            "checkAndCommitOrDeleteBranch",
          ).mockResolvedValue({
            shouldDeleteBranch: false,
            branchLink: "",
          }),
        );

        await updateCommentLink({
          commentId: 42,
          githubToken: "test-token",
          baseBranch: "main",
          triggerUsername: "trigger-user",
          context,
          octokit,
          claudeSuccess: true,
          prepareSuccess: true,
          useCommitSigning: false,
        });

        const isReview = eventName === "pull_request_review_comment";
        expect(updateComment).toHaveBeenCalledTimes(1);
        const params = updateComment.mock.calls[0]?.[1];
        expect(params?.isPullRequestReviewComment).toBe(isReview);
        expect(isReview ? getReviewComment : getComment).toHaveBeenCalledTimes(
          1,
        );
        expect(isReview ? getComment : getReviewComment).not.toHaveBeenCalled();
        expect(params?.body).toStartWith(
          `**Claude finished ${suppressCompletionMention ? "" : "@"}trigger-user's task**`,
        );
        expect(params?.body).toEndWith("Please ask @reviewer");
      });
    }
  }
});
