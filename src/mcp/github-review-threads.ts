import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createOctokit } from "../github/api/client";
import { redactSecrets, sanitizeContent } from "../github/utils/sanitizer";

type PullRequestScope = { owner: string; repo: string; number: number };

type ReviewComment = {
  author: { login: string } | null;
  body: string;
  url: string;
  createdAt: string;
};

type ReviewThreadPage = {
  nodes: Array<{
    id: string;
    path: string;
    line: number | null;
    startLine: number | null;
    isResolved: boolean;
    isOutdated: boolean;
    viewerCanResolve: boolean;
    comments: { totalCount: number; nodes: Array<ReviewComment | null> | null };
  } | null> | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const LIST_REVIEW_THREADS = `
  query ListReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 10, after: $cursor) {
          nodes {
            id path line startLine isResolved isOutdated viewerCanResolve
            comments(first: 5) {
              totalCount
              nodes { author { login } body url createdAt }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const GET_REVIEW_THREAD = `
  query GetReviewThread($threadId: ID!) {
    node(id: $threadId) {
      ... on PullRequestReviewThread {
        isResolved
        viewerCanResolve
        pullRequest { number repository { nameWithOwner } }
      }
    }
  }
`;

const RESOLVE_REVIEW_THREAD = `
  mutation ResolveReviewThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

function githubGraphql() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  return createOctokit(token).graphql;
}

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: redactSecrets(message) }],
    isError: true,
  };
}

export function registerReviewThreadTools(
  server: McpServer,
  scope: PullRequestScope,
  allowResolve: boolean,
) {
  server.tool(
    "list_review_threads",
    "List inline review threads on the current pull request, including resolution state and the first five comments per thread. Pass nextCursor to read the next page.",
    { cursor: z.string().min(1).optional() },
    async ({ cursor }) => {
      try {
        const response = await githubGraphql()<{
          repository: {
            pullRequest: { reviewThreads: ReviewThreadPage } | null;
          } | null;
        }>(LIST_REVIEW_THREADS, { ...scope, cursor });
        const page = response.repository?.pullRequest?.reviewThreads;
        if (!page) throw new Error("Current pull request was not found.");

        return result({
          threads: (page.nodes ?? [])
            .filter((thread) => thread !== null)
            .map(({ comments, ...thread }) => ({
              ...thread,
              comments: (comments.nodes ?? [])
                .filter((comment) => comment !== null)
                .map((comment) => ({
                  ...comment,
                  body: redactSecrets(sanitizeContent(comment.body)),
                })),
              commentCount: comments.totalCount,
            })),
          nextCursor: page.pageInfo.hasNextPage
            ? page.pageInfo.endCursor
            : null,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  if (!allowResolve) return;

  server.tool(
    "resolve_review_thread",
    "Resolve a review thread on the current pull request after addressing it. Use the thread ID from list_review_threads.",
    { threadId: z.string().min(1) },
    async ({ threadId }) => {
      try {
        const graphql = githubGraphql();
        const { node } = await graphql<{
          node: {
            isResolved?: boolean;
            viewerCanResolve?: boolean;
            pullRequest?: {
              number: number;
              repository: { nameWithOwner: string };
            };
          } | null;
        }>(GET_REVIEW_THREAD, { threadId });
        const pr = node?.pullRequest;
        const repository = `${scope.owner}/${scope.repo}`;
        if (
          !pr ||
          pr.number !== scope.number ||
          pr.repository.nameWithOwner.toLowerCase() !== repository.toLowerCase()
        ) {
          throw new Error(
            "Review thread does not belong to the current pull request.",
          );
        }
        if (node.isResolved) return result({ id: threadId, isResolved: true });
        if (!node.viewerCanResolve) {
          throw new Error(
            "The GitHub token cannot resolve this review thread.",
          );
        }

        const response = await graphql<{
          resolveReviewThread: {
            thread: { id: string; isResolved: boolean } | null;
          } | null;
        }>(RESOLVE_REVIEW_THREAD, { threadId });
        const thread = response.resolveReviewThread?.thread;
        if (!thread?.isResolved)
          throw new Error("GitHub did not resolve the review thread.");
        return result(thread);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
