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

// GitHub Inline Comment MCP Server - Provides inline PR comment functionality
// Provides an inline comment tool without exposing full PR review capabilities, so that
// Claude can't accidentally approve a PR
const server = new McpServer({
  name: "GitHub Inline Comment Server",
  version: "0.0.1",
});

server.tool(
  "create_inline_comment",
  "Create an inline comment on a specific line or lines in a PR file",
  {
    path: z
      .string()
      .describe("The file path to comment on (e.g., 'src/index.js')"),
    body: z
      .string()
      .describe(
        "The comment text (supports markdown and GitHub code suggestion blocks). " +
          "For code suggestions, use: ```suggestion\\nreplacement code\\n```. " +
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
                message: `Inline comment created successfully on ${path}${isSingleLine ? ` at line ${line}` : ` from line ${startLine} to ${line}`}`,
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
      }

      return {
        content: [
          {
            type: "text",
            text: `Error creating inline comment: ${errorMessage}${helpMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  },
);

// Batch tool for creating multiple inline comments in a single API call
server.tool(
  "create_inline_comments_batch",
  "Create multiple inline comments in a single API call. Optionally include a review summary comment.",
  {
    comments: z
      .array(
        z.object({
          path: z
            .string()
            .describe("The file path to comment on (e.g., 'src/index.js')"),
          body: z
            .string()
            .describe(
              "The comment text (supports markdown and GitHub code suggestion blocks). " +
                "For code suggestions, use: ```suggestion\\nreplacement code\\n```. " +
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
        }),
      )
      .min(1)
      .describe(
        "Array of comment objects. Each object requires 'path', 'body', and either 'line' (single-line) or both 'startLine' and 'line' (multi-line).",
      ),
    review_body: z
      .string()
      .optional()
      .describe(
        "Optional summary comment for the review. This appears as a top-level review comment alongside the inline comments.",
      ),
    commit_id: z
      .string()
      .optional()
      .describe(
        "Commit SHA to comment on (defaults to latest commit). All comments use the same commit.",
      ),
  },
  async ({ comments, review_body, commit_id }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const pull_number = parseInt(PR_NUMBER, 10);

      const octokit = createOctokit(githubToken).rest;

      // Get PR to get the head SHA if commit_id is not provided
      const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

      const finalCommitId = commit_id || pr.data.head.sha;

      // Prepare comments array for the review API
      const reviewComments: Array<{
        path: string;
        body: string;
        line?: number;
        start_line?: number;
        start_side?: "LEFT" | "RIGHT";
        side?: "LEFT" | "RIGHT";
      }> = [];

      for (const comment of comments) {
        // Validate that either line or both startLine and line are provided
        if (!comment.line && !comment.startLine) {
          throw new Error(
            `Comment on ${comment.path} is missing required 'line' or 'startLine' parameter`,
          );
        }

        // Sanitize the comment body
        const sanitizedBody = sanitizeContent(comment.body);

        const isSingleLine = !comment.startLine;
        const side = comment.side || "RIGHT";

        if (isSingleLine) {
          // Single-line comment
          reviewComments.push({
            path: comment.path,
            body: sanitizedBody,
            line: comment.line,
            side: side,
          });
        } else {
          // Multi-line comment
          reviewComments.push({
            path: comment.path,
            body: sanitizedBody,
            start_line: comment.startLine,
            start_side: side,
            line: comment.line,
            side: side,
          });
        }
      }

      // Prepare review body if provided
      const sanitizedReviewBody = review_body
        ? sanitizeContent(review_body)
        : undefined;

      // Create review with all comments in a single API call
      const result = await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        commit_id: finalCommitId,
        event: "COMMENT", // Just comment, don't approve or request changes
        body: sanitizedReviewBody, // Optional review summary
        comments: reviewComments,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                review_id: result.data.id,
                review_html_url: result.data.html_url,
                comments_submitted: reviewComments.length,
                review_body_included: !!sanitizedReviewBody,
                message: `Successfully created review with ${reviewComments.length} inline comment(s)${sanitizedReviewBody ? " and a summary comment" : ""}.`,
                comment_details: reviewComments.map((c, idx) => ({
                  index: idx + 1,
                  path: c.path,
                  line: c.line || c.start_line,
                  body_preview:
                    c.body.substring(0, 100) +
                    (c.body.length > 100 ? "..." : ""),
                })),
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
          "\n\nThis usually means one or more line numbers don't exist in the diff or file paths are incorrect. Make sure you're commenting on lines that are part of the PR's changes.";
      } else if (errorMessage.includes("Not Found")) {
        helpMessage =
          "\n\nThis usually means the PR number, repository, or one of the file paths is incorrect.";
      }

      return {
        content: [
          {
            type: "text",
            text: `Error creating batch inline comments: ${errorMessage}${helpMessage}`,
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
