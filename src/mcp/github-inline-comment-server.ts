#!/usr/bin/env node
// GitHub Inline Comment MCP Server - Provides inline PR comment functionality
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { Octokit } from "@octokit/rest";

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
        "The comment text (supports markdown and GitHub suggestion blocks)",
      ),
    line: z
      .number()
      .optional()
      .describe(
        "Line number for single-line comments (required if startLine is not provided)",
      ),
    startLine: z
      .number()
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

      const octokit = new Octokit({
        auth: githubToken,
        baseUrl: GITHUB_API_URL,
      });

      // Validate that either line or both startLine and line are provided
      if (!line && !startLine) {
        throw new Error(
          "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided",
        );
      }

      // If only line is provided, it's a single-line comment
      // If both startLine and line are provided, it's a multi-line comment
      const isSingleLine = !startLine;

      // Build the parameters for createReviewComment
      const params: any = {
        owner,
        repo,
        pull_number,
        body,
        path,
        side: side || "RIGHT",
      };

      // If commit_id is provided, use it; otherwise, get the latest commit
      if (commit_id) {
        params.commit_id = commit_id;
      } else {
        // Get the latest commit from the PR
        const pr = await octokit.pulls.get({
          owner,
          repo,
          pull_number,
        });
        params.commit_id = pr.data.head.sha;
      }

      if (isSingleLine) {
        // Single-line comment
        params.line = line;
      } else {
        // Multi-line comment
        params.start_line = startLine;
        params.start_side = side || "RIGHT";
        params.line = line;
      }

      // Create the inline comment
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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
