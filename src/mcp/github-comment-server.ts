#!/usr/bin/env node
// GitHub Comment MCP Server - Minimal server that only provides comment update functionality
//
// The tool handler is exported so it can be tested directly. The stdio bootstrap
// only runs when this file is the process entrypoint — importing it must never
// start a server or exit the process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { Octokit } from "@octokit/rest";
import { updateClaudeComment } from "../github/operations/comments/update-claude-comment";
import { sanitizeContent } from "../github/utils/sanitizer";
import { toolError, toolSuccess, type ToolResult } from "./tool-result";

export type CommentContext = {
  owner: string;
  repo: string;
  commentId: number;
  githubToken: string;
  isPullRequestReviewComment: boolean;
};

export const MISSING_REPO_ENV_MESSAGE =
  "Error: REPO_OWNER and REPO_NAME environment variables are required";

export function readCommentContext(
  env: NodeJS.ProcessEnv = process.env,
): CommentContext {
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;

  if (!owner || !repo) {
    throw new Error(MISSING_REPO_ENV_MESSAGE);
  }

  const githubToken = env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const claudeCommentId = env.CLAUDE_COMMENT_ID;
  if (!claudeCommentId) {
    throw new Error("CLAUDE_COMMENT_ID environment variable is required");
  }

  return {
    owner,
    repo,
    commentId: parseInt(claudeCommentId, 10),
    githubToken,
    isPullRequestReviewComment:
      env.GITHUB_EVENT_NAME === "pull_request_review_comment",
  };
}

/**
 * Updates the tracking comment. Throws on failure; the tool binding converts
 * that into the MCP error envelope.
 */
export async function updateComment(
  { body }: { body: string },
  context: CommentContext,
  octokit: Octokit = new Octokit({
    auth: context.githubToken,
    baseUrl: GITHUB_API_URL,
  }),
): Promise<ToolResult> {
  const { owner, repo, commentId, isPullRequestReviewComment } = context;

  const sanitizedBody = sanitizeContent(body);

  const result = await updateClaudeComment(octokit, {
    owner,
    repo,
    commentId,
    body: sanitizedBody,
    isPullRequestReviewComment,
  });

  return toolSuccess(result);
}

export function createCommentServer(): McpServer {
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
        return await updateComment({ body }, readCommentContext());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

async function runServer() {
  // Fail fast on a misconfigured environment, exactly as this server did when
  // the check ran at module scope.
  if (!process.env.REPO_OWNER || !process.env.REPO_NAME) {
    console.error(MISSING_REPO_ENV_MESSAGE);
    process.exit(1);
  }

  const server = createCommentServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

if (import.meta.main) {
  runServer().catch(console.error);
}
