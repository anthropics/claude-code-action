import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { Octokit } from "@octokit/rest";
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

function commentsWithStickyAt(position: number) {
  const comments = Array.from({ length: position + 2 }, (_, i) =>
    humanComment(i),
  );
  comments[position - 1] = {
    id: STICKY_COMMENT_ID,
    body: "Claude Code is working…",
    user: { id: CLAUDE_APP_BOT_ID, login: "claude[bot]", type: "Bot" },
  };
  return comments;
}

function createMockOctokit(comments: ReturnType<typeof humanComment>[]) {
  const requests: { method: string; url: URL }[] = [];
  const octokit = new Octokit({
    request: {
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        requests.push({ method, url });
        const headers = new Headers({ "content-type": "application/json" });

        if (
          method === "GET" &&
          url.pathname === "/repos/test-owner/test-repo/issues/456/comments"
        ) {
          const page = Number(url.searchParams.get("page") ?? 1);
          const perPage = Number(url.searchParams.get("per_page") ?? 30);
          if (page * perPage < comments.length) {
            const nextPage = new URL(url);
            nextPage.searchParams.set("page", String(page + 1));
            headers.set("link", `<${nextPage}>; rel="next"`);
          }
          return new Response(
            JSON.stringify(
              comments.slice((page - 1) * perPage, page * perPage),
            ),
            { headers },
          );
        }
        if (
          method === "PATCH" &&
          url.pathname ===
            `/repos/test-owner/test-repo/issues/comments/${STICKY_COMMENT_ID}`
        ) {
          return new Response(JSON.stringify({ id: STICKY_COMMENT_ID }), {
            headers,
          });
        }
        if (
          method === "POST" &&
          url.pathname === "/repos/test-owner/test-repo/issues/456/comments"
        ) {
          return new Response(JSON.stringify({ id: NEW_COMMENT_ID }), {
            status: 201,
            headers,
          });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    },
  });
  return { octokit, requests };
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

  test.each([33, 103])(
    "updates the existing sticky comment at position %i",
    async (position) => {
      const { octokit, requests } = createMockOctokit(
        commentsWithStickyAt(position),
      );

      const result = await createInitialComment(octokit, stickyContext);

      const listRequests = requests.filter(({ method }) => method === "GET");
      expect(
        listRequests.map(({ url }) => url.searchParams.get("page")),
      ).toEqual(position > 100 ? [null, "2"] : [null]);
      expect(requests.filter(({ method }) => method === "PATCH")).toHaveLength(
        1,
      );
      expect(requests.filter(({ method }) => method === "POST")).toHaveLength(
        0,
      );
      expect(result.id).toBe(STICKY_COMMENT_ID);
      expect(await readFile(githubOutputPath, "utf-8")).toBe(
        `claude_comment_id=${STICKY_COMMENT_ID}\n`,
      );
    },
  );

  test("creates a new comment when no sticky comment exists", async () => {
    const { octokit, requests } = createMockOctokit(
      Array.from({ length: 105 }, (_, i) => humanComment(i)),
    );

    const result = await createInitialComment(octokit, stickyContext);

    expect(requests.map(({ method }) => method)).toEqual([
      "GET",
      "GET",
      "POST",
    ]);
    expect(result.id).toBe(NEW_COMMENT_ID);
    expect(await readFile(githubOutputPath, "utf-8")).toBe(
      `claude_comment_id=${NEW_COMMENT_ID}\n`,
    );
  });

  test("creates a new comment without listing comments when sticky mode is disabled", async () => {
    const { octokit, requests } = createMockOctokit(commentsWithStickyAt(33));

    const result = await createInitialComment(octokit, {
      ...stickyContext,
      inputs: { ...stickyContext.inputs, useStickyComment: false },
    });

    expect(requests.map(({ method }) => method)).toEqual(["POST"]);
    expect(result.id).toBe(NEW_COMMENT_ID);
  });
});
