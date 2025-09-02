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

// Track the current pending review ID across tool calls
let currentPendingReviewId: number | null = null;

// Helper function to find existing pending review
async function findPendingReview(
  octokit: any,
  owner: string,
  repo: string,
  pull_number: number,
): Promise<number | null> {
  let currentUser: any = null;
  let reviews: any = null;

  try {
    console.log(
      `Searching for pending reviews on PR #${pull_number} in ${owner}/${repo}`,
    );

    reviews = await octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number,
    });

    console.log(`Found ${reviews.data.length} total reviews`);

    // Get current authenticated user
    const userResponse = await octokit.rest.users.getAuthenticated();
    currentUser = userResponse.data;
    console.log(
      `Current authenticated user: ${currentUser.login} (ID: ${currentUser.id})`,
    );

    // Log all reviews for debugging with enhanced user ID information
    reviews.data.forEach((review: any, index: number) => {
      console.log(
        `Review ${index + 1}: ID=${review.id}, State=${review.state}, User=${review.user.login} (ID=${review.user.id}, Type=${typeof review.user.id})`,
      );
    });

    console.log(
      `Looking for reviews from current user: ${currentUser.login} (ID=${currentUser.id}, Type=${typeof currentUser.id})`,
    );

    // Find a review that blocks creating a new review from the current user
    // This includes PENDING reviews and other states that haven't been submitted
    const blockingReview = reviews.data.find((review: any) => {
      // Check multiple user ID comparison methods due to potential type mismatches
      const userIdMatch =
        review.user.id === currentUser.id ||
        review.user.id == currentUser.id || // Loose equality for type coercion
        String(review.user.id) === String(currentUser.id); // String comparison

      const loginMatch = review.user.login === currentUser.login; // Backup comparison

      // States that would block creating a new review
      // GitHub only allows one pending review per user per PR
      const blockingStates = ["PENDING"];

      const isBlocking = blockingStates.includes(review.state);

      if (userIdMatch || loginMatch) {
        console.log(
          `Found review from current user: ID=${review.id}, State=${review.state}, UserIdMatch=${userIdMatch}, LoginMatch=${loginMatch}, IsBlocking=${isBlocking}`,
        );
      }

      return (userIdMatch || loginMatch) && isBlocking;
    });

    if (blockingReview) {
      console.log(
        `Found existing blocking review: ${blockingReview.id} (State: ${blockingReview.state}) from user ${currentUser.login}`,
      );
      return blockingReview.id;
    }

    console.log(
      `No blocking review found for user ${currentUser.login} (ID: ${currentUser.id})`,
    );
  } catch (error) {
    console.error("Failed to find pending review:", error);

    // Capture error with context in Sentry
    Sentry.withScope((scope) => {
      scope.setTag("operation", "find_pending_review");
      scope.setContext("repository", {
        owner,
        repo,
        pull_number,
      });
      scope.setContext("user_detection", {
        current_user_id: currentUser?.id,
        current_user_id_type: typeof currentUser?.id,
        current_user_login: currentUser?.login,
        total_reviews: reviews?.data?.length || 0,
        review_details:
          reviews?.data?.map((r: any) => ({
            id: r.id,
            state: r.state,
            user_id: r.user.id,
            user_id_type: typeof r.user.id,
            user_login: r.user.login,
          })) || [],
      });
      scope.setLevel("error");
      Sentry.captureException(error);
    });

    // Re-throw to make the error visible
    throw error;
  }
  return null;
}

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

      let result;

      // If we don't have a pending review ID cached, try to find one
      if (!currentPendingReviewId) {
        currentPendingReviewId = await findPendingReview(
          octokit,
          owner,
          repo,
          pull_number,
        );
      }

      // If we have a pending review with comments, submit it
      if (currentPendingReviewId) {
        try {
          result = await octokit.rest.pulls.submitReview({
            owner,
            repo,
            pull_number,
            review_id: currentPendingReviewId,
            body: sanitizedBody,
            event,
          });
          // Clear the pending review ID after submission
          currentPendingReviewId = null;
        } catch (submitError) {
          // If submitting the existing review fails, try creating a new one
          console.error(
            "Failed to submit pending review, creating new one:",
            submitError,
          );
          currentPendingReviewId = null;

          const params: Parameters<typeof octokit.rest.pulls.createReview>[0] =
            {
              owner,
              repo,
              pull_number,
              body: sanitizedBody,
              event,
              commit_id: commit_id || pr.data.head.sha,
            };
          result = await octokit.rest.pulls.createReview(params);
        }
      } else {
        // No pending review, create and submit a new one
        const params: Parameters<typeof octokit.rest.pulls.createReview>[0] = {
          owner,
          repo,
          pull_number,
          body: sanitizedBody,
          event,
          commit_id: commit_id || pr.data.head.sha,
        };
        result = await octokit.rest.pulls.createReview(params);
      }

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
          cached_review_id: currentPendingReviewId,
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

server.tool(
  "add_review_comment",
  "Add an inline comment to a PR review on specific lines in a file (automatically creates a pending review if needed)",
  {
    path: z
      .string()
      .describe("The file path to comment on (e.g., 'src/index.js')"),
    body: z
      .string()
      .describe(
        "The comment text (supports markdown and GitHub code suggestion blocks). " +
          "For code suggestions, use: ```suggestion\\\\nreplacement code\\\\n```. " +
          "IMPORTANT: The suggestion block will REPLACE the ENTIRE line range (single line or startLine to line). " +
          "Ensure the replacement is syntactically complete and valid - it must work as a drop-in replacement for the selected lines.",
      ),
    line: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Line number for single-line comments (required if startLine is not provided)",
      ),
    startLine: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Start line for multi-line comments (use with line parameter for the end line)",
      ),
    side: z
      .enum(["LEFT", "RIGHT"])
      .optional()
      .default("RIGHT")
      .describe(
        "Side of the diff to comment on: LEFT (old code) or RIGHT (new code)",
      ),
    commit_id: z
      .string()
      .optional()
      .describe(
        "Specific commit SHA to comment on (defaults to latest commit)",
      ),
  },
  async ({ path, body, line, startLine, side, commit_id }) => {
    // Declare variables outside try block so they're available in catch
    const owner = REPO_OWNER;
    const repo = REPO_NAME;
    const pull_number = parseInt(PR_NUMBER, 10);

    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const octokit = createOctokit(githubToken);

      // Sanitize the comment body to remove any potential GitHub tokens
      const sanitizedBody = sanitizeContent(body);

      // Validate that either line or both startLine and line are provided
      if (!line && !startLine) {
        throw new Error(
          "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided",
        );
      }

      // If only line is provided, it's a single-line comment
      // If both startLine and line are provided, it's a multi-line comment
      const isSingleLine = !startLine;

      const pr = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      // Ensure we have a pending review for this comment
      // Always refresh the pending review state to avoid stale data
      currentPendingReviewId = await findPendingReview(
        octokit,
        owner,
        repo,
        pull_number,
      );

      if (!currentPendingReviewId) {
        // Try to create a new pending review
        try {
          const newReview = await octokit.rest.pulls.createReview({
            owner,
            repo,
            pull_number,
            commit_id: commit_id || pr.data.head.sha,
            // No event means it stays in PENDING state
          });
          currentPendingReviewId = newReview.data.id;
          console.log(
            `Created new pending review with ID: ${currentPendingReviewId}`,
          );
        } catch (error: any) {
          console.error("Error creating pending review:", error);
          console.error("Error message:", error.message);
          console.error("Full error:", JSON.stringify(error, null, 2));

          // Capture the "one pending review" error with rich context
          Sentry.withScope((scope) => {
            scope.setTag("operation", "create_pending_review");
            scope.setTag(
              "error_type",
              error.message?.includes(
                "user_id can only have one pending review",
              )
                ? "duplicate_pending_review"
                : "unknown",
            );
            scope.setContext("repository", {
              owner,
              repo,
              pull_number,
            });
            scope.setContext("review_creation", {
              commit_id: commit_id || pr.data.head.sha,
              cached_review_id: currentPendingReviewId,
              error_message: error.message,
            });
            // Add context about the detection failure
            scope.setContext("detection_failure", {
              note: "findPendingReview returned null but GitHub says pending review exists",
              should_find_review_on_retry: true,
            });
            scope.setLevel("warning");
            Sentry.captureException(error);
          });

          // If creation fails due to existing pending review, find it again
          if (
            error.message?.includes("user_id can only have one pending review")
          ) {
            console.log(
              "Detected existing pending review during creation, searching again...",
            );
            try {
              currentPendingReviewId = await findPendingReview(
                octokit,
                owner,
                repo,
                pull_number,
              );
              if (!currentPendingReviewId) {
                const findError = new Error(
                  "Failed to find existing pending review that should exist",
                );
                Sentry.withScope((scope) => {
                  scope.setTag(
                    "operation",
                    "find_pending_review_after_creation_failure",
                  );
                  scope.setContext("original_error", {
                    message: error.message,
                  });
                  scope.setLevel("error");
                  Sentry.captureException(findError);
                });
                throw findError;
              }
              console.log(
                `Found existing pending review after creation failed: ${currentPendingReviewId}`,
              );
            } catch (findError) {
              console.error(
                "Error finding pending review after creation failure:",
                findError,
              );
              const compositeError = new Error(
                `Could not find or create pending review. Original error: ${error.message}. Find error: ${findError}`,
              );

              Sentry.withScope((scope) => {
                scope.setTag(
                  "operation",
                  "find_pending_review_composite_failure",
                );
                scope.setContext("errors", {
                  original_error: error.message,
                  find_error:
                    findError instanceof Error
                      ? findError.message
                      : String(findError),
                });
                scope.setLevel("error");
                Sentry.captureException(compositeError);
              });

              throw compositeError;
            }
          } else {
            throw error;
          }
        }
      } else {
        console.log(
          `Using existing pending review with ID: ${currentPendingReviewId}`,
        );
      }

      const params: Parameters<
        typeof octokit.rest.pulls.createReviewComment
      >[0] = {
        owner,
        repo,
        pull_number,
        body: sanitizedBody,
        path,
        side: side || "RIGHT",
        commit_id: commit_id || pr.data.head.sha,
      };

      if (isSingleLine) {
        // Single-line comment
        params.line = line;
      } else {
        // Multi-line comment
        params.start_line = startLine;
        params.start_side = side || "RIGHT";
        params.line = line;
      }

      const result = await octokit.rest.pulls.createReviewComment(params);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                comment_id: result.data.id,
                html_url: result.data.html_url,
                path: result.data.path,
                line: result.data.line || result.data.original_line,
                message: `Review comment added to ${currentPendingReviewId ? "pending review" : "PR"} on ${path}${isSingleLine ? ` at line ${line}` : ` from line ${startLine} to ${line}`}`,
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

      // Capture add_review_comment errors with full context
      Sentry.withScope((scope) => {
        scope.setTag("operation", "add_review_comment");
        scope.setContext("repository", {
          owner,
          repo,
          pull_number,
        });
        scope.setContext("comment_details", {
          path,
          line,
          startLine,
          side,
          commit_id,
          cached_review_id: currentPendingReviewId,
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
          "\n\nThis usually means the line number doesn't exist in the diff or the file path is incorrect. Make sure you're commenting on lines that are part of the PR's changes.";
      } else if (errorMessage.includes("Not Found")) {
        helpMessage =
          "\n\nThis usually means the PR number, repository, or file path is incorrect.";
      } else if (errorMessage.includes("Forbidden")) {
        helpMessage =
          "\n\nThis usually means you don't have permission to add review comments on this repository.";
      }

      return {
        content: [
          {
            type: "text",
            text: `Error creating review comment: ${errorMessage}${helpMessage}`,
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
