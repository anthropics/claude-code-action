import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { createInitialComment } from "../src/github/operations/comments/create-initial";
import { updateCommentLink } from "../src/entrypoints/update-comment-link";
import { mockPullRequestReviewCommentContext } from "./mockContext";

describe("tracking comments triggered by inline PR mentions", () => {
  let outputDir: string;
  let originalOutput: string | undefined;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "tracking-comment-"));
    originalOutput = process.env.GITHUB_OUTPUT;
    process.env.GITHUB_OUTPUT = join(outputDir, "output");
  });

  afterEach(async () => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
    await rm(outputDir, { recursive: true, force: true });
  });

  test.each([false, true])(
    "reads and updates the comment that was created (inline reply rejected: %s)",
    async (rejectInline) => {
      const context = mockPullRequestReviewCommentContext;
      const repository = "/repos/" + context.repository.full_name;
      const commentPath = rejectInline
        ? "/issues/comments/42"
        : "/pulls/comments/42";
      const requests: string[] = [];
      let body = "";
      const rest = new Octokit({
        request: {
          async fetch(url: string | URL | Request, init?: RequestInit) {
            const address = url instanceof Request ? url.url : url;
            const path = new URL(address).pathname.slice(repository.length);
            const method = init?.method;
            requests.push(method + " " + path);
            if (
              method === "POST" &&
              rejectInline &&
              path.startsWith("/pulls/")
            ) {
              return Response.json(
                { message: "Reply could not be posted" },
                { status: 422 },
              );
            }
            if (method !== "POST" && path !== commentPath) {
              return Response.json(
                { message: "Comment not found" },
                { status: 404 },
              );
            }
            if (init?.body) body = JSON.parse(String(init.body)).body;
            return Response.json({ id: 42, body });
          },
        },
      });
      const trackingComment = await createInitialComment(rest, context);

      expect(await readFile(join(outputDir, "output"), "utf8")).toBe(
        "claude_comment_id=42\n",
      );
      await updateCommentLink({
        trackingComment,
        githubToken: "fixture-token",
        baseBranch: "main",
        context,
        octokit: { rest, graphql },
        claudeSuccess: true,
        prepareSuccess: true,
        useCommitSigning: false,
      });

      expect(
        requests.filter((request) => !request.startsWith("POST ")),
      ).toEqual(["GET " + commentPath, "PATCH " + commentPath]);
      expect(body).toContain("Claude finished");
    },
  );
});
