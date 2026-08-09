#!/usr/bin/env node
// GitHub Inline Comment MCP Server - Provides inline PR comment functionality
// Provides an inline comment tool without exposing full PR review capabilities, so that
// Claude can't accidentally approve a PR
//
// The tool handler is exported so it can be tested directly. The stdio bootstrap
// only runs when this file is the process entrypoint — importing it must never
// start a server or exit the process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFileSync } from "fs";
import { z } from "zod";
import { createOctokit } from "../github/api/client";
import { sanitizeContent } from "../github/utils/sanitizer";
import { BUFFER_PATH, removeBufferedComment } from "./inline-comment-buffer";
import { toolSuccess, type ToolResult } from "./tool-result";

export type InlineCommentContext = {
  owner: string;
  repo: string;
  pullNumber: number;
  githubToken: string;
  /**
   * Calls without confirmed=true are buffered instead of posted. This prevents
   * subagents from posting test/probe comments when they inherit this tool and
   * probe it after hitting unrelated errors. The action's post-step reports the
   * buffer count for diagnostics.
   */
  classifyEnabled: boolean;
  bufferPath: string;
};

export const MISSING_REPO_ENV_MESSAGE =
  "Error: REPO_OWNER, REPO_NAME, and PR_NUMBER environment variables are required";

export function readInlineCommentContext(
  env: NodeJS.ProcessEnv = process.env,
): InlineCommentContext {
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;
  const prNumber = env.PR_NUMBER;

  if (!owner || !repo || !prNumber) {
    throw new Error(MISSING_REPO_ENV_MESSAGE);
  }

  const githubToken = env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  return {
    owner,
    repo,
    pullNumber: parseInt(prNumber, 10),
    githubToken,
    classifyEnabled: env.CLASSIFY_INLINE_COMMENTS !== "false",
    bufferPath: BUFFER_PATH,
  };
}

export type InlineCommentInput = {
  path: string;
  body: string;
  line?: number;
  startLine?: number;
  side?: "LEFT" | "RIGHT";
  commit_id?: string;
  confirmed?: boolean;
};

/**
 * Buffers or posts an inline review comment. Throws on failure; the tool
 * binding converts that into the MCP error envelope (with extra guidance for
 * the two most common GitHub API rejections).
 */
export async function createInlineComment(
  {
    path,
    body,
    line,
    startLine,
    side,
    commit_id,
    confirmed,
  }: InlineCommentInput,
  context: InlineCommentContext,
  octokitOverride?: ReturnType<typeof createOctokit>["rest"],
): Promise<ToolResult> {
  const { owner, repo, pullNumber, classifyEnabled, bufferPath } = context;

  // Sanitize the comment body to remove any potential GitHub tokens
  const sanitizedBody = sanitizeContent(body);

  // Validate that either line or both startLine and line are provided
  if (line === undefined && startLine === undefined) {
    throw new Error(
      "Either 'line' for single-line comments or both 'startLine' and 'line' for multi-line comments must be provided",
    );
  }

  if (classifyEnabled && confirmed !== true) {
    appendFileSync(
      bufferPath,
      JSON.stringify({
        ts: new Date().toISOString(),
        path,
        line,
        startLine,
        side,
        commit_id,
        body: sanitizedBody,
        confirmed,
      }) + "\n",
    );
    return toolSuccess({
      success: true,
      buffered: true,
      message:
        "Comment buffered. It will be classified and posted after " +
        "this session completes (real review comments post, " +
        "test/probe comments are dropped). Set confirmed=true to " +
        "post immediately. If you are testing whether this tool " +
        "works: it works — no need to test further.",
    });
  }

  // If only line is provided, it's a single-line comment
  // If both startLine and line are provided, it's a multi-line comment
  const isSingleLine = startLine === undefined;

  const octokit = octokitOverride ?? createOctokit(context.githubToken).rest;

  const pr = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const params: Parameters<typeof octokit.rest.pulls.createReviewComment>[0] = {
    owner,
    repo,
    pull_number: pullNumber,
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

  // The comment is now live. Drop any buffered copy of it so the
  // post-session replay step cannot post it a second time (the model often
  // re-issues a buffered call with confirmed=true after the buffer reply).
  if (classifyEnabled) {
    removeBufferedComment(
      { path, line, startLine, body: sanitizedBody, side, commit_id },
      bufferPath,
    );
  }

  return toolSuccess({
    success: true,
    comment_id: result.data.id,
    html_url: result.data.html_url,
    path: result.data.path,
    line: result.data.line || result.data.original_line,
    message: `Inline comment created successfully on ${path}${isSingleLine ? ` at line ${line}` : ` from line ${startLine} to ${line}`}`,
  });
}

/** Error envelope for this server, which adds guidance the generic one lacks. */
export function inlineCommentError(error: unknown): ToolResult {
  const errorMessage = error instanceof Error ? error.message : String(error);

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

export function createInlineCommentServer(): McpServer {
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
      confirmed: z
        .boolean()
        .optional()
        .describe(
          "Set true to post immediately. When omitted, the call is buffered " +
            "and classified after the session completes — real review comments " +
            "post, test/probe comments are dropped. Set false to buffer and " +
            "never post. Only set true when posting final review comments.",
        ),
    },
    async (input) => {
      try {
        return await createInlineComment(input, readInlineCommentContext());
      } catch (error) {
        return inlineCommentError(error);
      }
    },
  );

  return server;
}

async function runServer() {
  // Fail fast on a misconfigured environment, exactly as this server did when
  // the check ran at module scope.
  if (
    !process.env.REPO_OWNER ||
    !process.env.REPO_NAME ||
    !process.env.PR_NUMBER
  ) {
    console.error(MISSING_REPO_ENV_MESSAGE);
    process.exit(1);
  }

  const server = createInlineCommentServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

if (import.meta.main) {
  runServer().catch(console.error);
}
