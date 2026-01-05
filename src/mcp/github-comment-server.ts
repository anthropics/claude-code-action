#!/usr/bin/env node
// GitHub Comment MCP Server - Minimal server that only provides comment update functionality
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { Octokit } from "@octokit/rest";
import { updateClaudeComment } from "../github/operations/comments/update-claude-comment";
import { sanitizeContent } from "../github/utils/sanitizer";

// Pattern to extract sticky job header from comment body
const STICKY_HEADER_PATTERN = /^(<!-- sticky-job: [^>]+ -->)\n?/;

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

if (!REPO_OWNER || !REPO_NAME) {
  console.error(
    "Error: REPO_OWNER and REPO_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitHub Comment Server",
  version: "0.0.1",
});

server.tool(
  "update_claude_comment",
  "Update the Claude comment with progress and results (automatically handles both issue and PR comments)",
  {
    body: z.string().describe("The updated comment content"),
  },
  async ({ body }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      const claudeCommentId = process.env.CLAUDE_COMMENT_ID;
      const eventName = process.env.GITHUB_EVENT_NAME;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }
      if (!claudeCommentId) {
        throw new Error("CLAUDE_COMMENT_ID environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const commentId = parseInt(claudeCommentId, 10);

      const octokit = new Octokit({
        auth: githubToken,
        baseUrl: GITHUB_API_URL,
      });

      const isPullRequestReviewComment =
        eventName === "pull_request_review_comment";

      // Fetch current comment to preserve sticky job header
      let stickyHeader = "";
      try {
        const currentComment = isPullRequestReviewComment
          ? await octokit.rest.pulls.getReviewComment({
              owner,
              repo,
              comment_id: commentId,
            })
          : await octokit.rest.issues.getComment({
              owner,
              repo,
              comment_id: commentId,
            });

        const currentBody = currentComment.data.body || "";
        const headerMatch = currentBody.match(STICKY_HEADER_PATTERN);
        if (headerMatch) {
          stickyHeader = headerMatch[1] + "\n";
        }
      } catch (error) {
        // If we can't fetch the comment, proceed without the header
        console.error("Failed to fetch current comment for header preservation:", error);
      }

      const sanitizedBody = sanitizeContent(body);
      // Prepend sticky header if it existed in the original comment
      const finalBody = stickyHeader + sanitizedBody;

      const result = await updateClaudeComment(octokit, {
        owner,
        repo,
        commentId,
        body: finalBody,
        isPullRequestReviewComment,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
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
