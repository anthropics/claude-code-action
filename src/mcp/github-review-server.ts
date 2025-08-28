#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createOctokit } from "../github/api/client";
import { sanitizeContent } from "../github/utils/sanitizer";

// Get repository and PR information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const PR_NUMBER = process.env.PR_NUMBER;

if (!REPO_OWNER || !REPO_NAME || !PR_NUMBER) {
  console.error(
    "Error: REPO_OWNER, REPO_NAME, and PR_NUMBER environment variables are required",
  );
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

      const params: Parameters<typeof octokit.rest.pulls.createReview>[0] = {
        owner,
        repo,
        pull_number,
        body: sanitizedBody,
        event,
        commit_id: commit_id || pr.data.head.sha,
      };

      const result = await octokit.rest.pulls.createReview(params);

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
  "add_review_comment",
  "Add an inline comment to a pending PR review on specific lines in a file",
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
    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const pull_number = parseInt(PR_NUMBER, 10);

      const octokit = createOctokit(githubToken).rest;

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

      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

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
                message: `Review comment created successfully on ${path}${isSingleLine ? ` at line ${line}` : ` from line ${startLine} to ${line}`}`,
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

server.tool(
  "create_pending_review",
  "Create a draft/pending PR review without submitting it (allows for adding comments before final submission)",
  {
    body: z
      .string()
      .optional()
      .describe(
        "Optional review comment body (supports markdown). Can be added later before submission.",
      ),
    commit_id: z
      .string()
      .optional()
      .describe("Specific commit SHA to review (defaults to latest commit)"),
  },
  async ({ body, commit_id }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const pull_number = parseInt(PR_NUMBER, 10);

      const octokit = createOctokit(githubToken).rest;

      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

      // Sanitize the review body if provided
      const sanitizedBody = body ? sanitizeContent(body) : "";

      const params: Parameters<typeof octokit.rest.pulls.createReview>[0] = {
        owner,
        repo,
        pull_number,
        commit_id: commit_id || pr.data.head.sha,
        ...(sanitizedBody && { body: sanitizedBody }),
        // Not setting 'event' leaves the review in PENDING state
      };

      const result = await octokit.rest.pulls.createReview(params);

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
                message: `Draft PR review created successfully. Use submit_pr_review to finalize with APPROVE, REQUEST_CHANGES, or COMMENT.`,
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
          "\n\nThis usually means you don't have permission to create reviews on this repository.";
      }

      return {
        content: [
          {
            type: "text",
            text: `Error creating pending PR review: ${errorMessage}${helpMessage}`,
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
