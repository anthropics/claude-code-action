#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import { createOctokit } from "../github/api/client";
import { sanitizeContent } from "../github/utils/sanitizer";

// Initialize Sentry for error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.GITHUB_ACTIONS ? "github-actions" : "development",
    initialScope: {
      tags: {
        service: "github-review-server",
        repository: `${process.env.REPO_OWNER}/${process.env.REPO_NAME}`,
        pr_number: process.env.PR_NUMBER,
        github_actor: process.env.GITHUB_ACTOR,
        github_run_id: process.env.GITHUB_RUN_ID,
      },
    },
  });
} else {
  console.warn("SENTRY_DSN not provided - error tracking disabled");
}

// Get repository and PR information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const PR_NUMBER = process.env.PR_NUMBER;

if (!REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
  const error = new Error(
    "REPO_OWNER, REPO_NAME, and PR_NUMBER environment variables are required",
  );
  console.error("Error:", error.message);
  Sentry.captureException(error);
  process.exit(1);
}

// GitHub Review MCP Server - Provides PR review submission functionality
const server = new McpServer({
  name: "GitHub Review Server",
  version: "0.0.1",
});

server.tool(
  "submit_pr_review",
  "Submit a pull request review with APPROVE, REQUEST_CHANGES, or COMMENT event",
  {
    event: z
      .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
      .describe(
        "The review action: APPROVE (approve the PR), REQUEST_CHANGES (request changes), or COMMENT (general feedback without approval/rejection)",
      ),
    body: z
      .string()
      .describe(
        "The review comment body (supports markdown). Required for REQUEST_CHANGES and COMMENT events.",
      ),
    commit_id: z
      .string()
      .optional()
      .describe("Specific commit SHA to review (defaults to latest commit)"),
  },
  async ({ event, body, commit_id }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const pull_number = parseInt(PR_NUMBER, 10);

      const octokit = createOctokit(githubToken).rest;

      // Validate that body is provided for events that require it
      if (
        (event === "REQUEST_CHANGES" || event === "COMMENT") &&
        !body.trim()
      ) {
        throw new Error(`A review body is required for ${event} events`);
      }

      // Sanitize the review body to remove any potential GitHub tokens
      const sanitizedBody = sanitizeContent(body);

      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

      // Simple, stateless review submission
      const result = await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        body: sanitizedBody,
        event,
        commit_id: commit_id || pr.data.head.sha,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                review_id: result.data.id,
                html_url: result.data.html_url,
                state: result.data.state,
                event,
                message: `PR review submitted successfully with ${event} state`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Capture submit_pr_review errors with context
      Sentry.withScope((scope) => {
        scope.setTag("operation", "submit_pr_review");
        scope.setContext("repository", {
          owner: REPO_OWNER,
          repo: REPO_NAME,
          pull_number: parseInt(PR_NUMBER, 10),
        });
        scope.setContext("review_details", {
          event,
          body:
            body?.substring(0, 100) + (body && body.length > 100 ? "..." : ""), // Truncate for privacy
          commit_id,
        });
        scope.setLevel("error");
        Sentry.captureException(
          error instanceof Error ? error : new Error(errorMessage),
        );
      });

      // Provide more helpful error messages for common issues
      let helpMessage = "";
      if (errorMessage.includes("Validation Failed")) {
        helpMessage =
          "\n\nThis usually means the PR has already been merged, closed, or there's an issue with the commit SHA.";
      } else if (errorMessage.includes("Not Found")) {
        helpMessage =
          "\n\nThis usually means the PR number or repository is incorrect.";
      } else if (errorMessage.includes("Forbidden")) {
        helpMessage =
          "\n\nThis usually means you don't have permission to submit reviews on this repository.";
      }

      return {
        content: [
          {
            type: "text",
            text: `Error submitting PR review: ${errorMessage}${helpMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

server.tool(
  "resolve_review_thread",
  "Resolve a pull request review thread (conversation) with an optional comment. Requires Contents: Read/Write permissions.",
  {
    threadId: z
      .string()
      .describe(
        "The GraphQL thread ID to resolve (different from REST comment IDs). Get this from review thread queries.",
      ),
    body: z
      .string()
      .optional()
      .describe(
        "Optional comment to add when resolving the thread (e.g., 'Fixed in latest commit', 'No longer applicable')",
      ),
  },
  async ({ threadId, body }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const octokit = createOctokit(githubToken);

      // If a comment is provided, add it to the thread first
      if (body && body.trim()) {
        const sanitizedBody = sanitizeContent(body);

        // Add a reply to the review thread
        try {
          await octokit.graphql(
            `
            mutation($threadId: ID!, $body: String!) {
              addPullRequestReviewThreadReply(input: {
                pullRequestReviewThreadId: $threadId
                body: $body
              }) {
                comment {
                  id
                }
              }
            }
          `,
            {
              threadId,
              body: sanitizedBody,
            },
          );
        } catch (replyError) {
          console.warn(
            "Failed to add reply before resolving thread:",
            replyError,
          );
          // Continue with resolution even if reply fails
        }
      }

      // Resolve the thread
      const result = await octokit.graphql<{
        resolveReviewThread: {
          thread: {
            id: string;
            isResolved: boolean;
          };
        };
      }>(
        `
        mutation($threadId: ID!) {
          resolveReviewThread(input: {
            threadId: $threadId
          }) {
            thread {
              id
              isResolved
            }
          }
        }
      `,
        {
          threadId,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                thread_id: threadId,
                is_resolved: result.resolveReviewThread.thread.isResolved,
                message: `Review thread resolved successfully${body ? " with comment" : ""}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Capture resolve_review_thread errors with context
      Sentry.withScope((scope) => {
        scope.setTag("operation", "resolve_review_thread");
        scope.setContext("repository", {
          owner: REPO_OWNER,
          repo: REPO_NAME,
          pull_number: parseInt(PR_NUMBER, 10),
        });
        scope.setContext("thread_details", {
          thread_id: threadId,
          has_body: !!body,
          body_preview:
            body?.substring(0, 50) + (body && body.length > 50 ? "..." : ""), // Truncate for privacy
        });
        scope.setLevel("error");
        Sentry.captureException(
          error instanceof Error ? error : new Error(errorMessage),
        );
      });

      // Provide more helpful error messages for common issues
      let helpMessage = "";
      if (errorMessage.includes("Resource not accessible by integration")) {
        helpMessage =
          "\n\nThis usually means insufficient permissions. The resolveReviewThread mutation requires Contents: Read/Write permissions, not just Pull Requests permissions.";
      } else if (errorMessage.includes("Could not resolve to a node")) {
        helpMessage =
          "\n\nThis usually means the thread ID is invalid or the thread doesn't exist. Make sure you're using the GraphQL thread ID, not a REST API comment ID.";
      } else if (errorMessage.includes("Not Found")) {
        helpMessage =
          "\n\nThis usually means the thread doesn't exist or you don't have access to it.";
      }

      return {
        content: [
          {
            type: "text",
            text: `Error resolving review thread: ${errorMessage}${helpMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
