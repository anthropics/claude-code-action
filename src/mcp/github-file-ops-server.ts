#!/usr/bin/env node
// GitHub File Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import fetch from "node-fetch";
import { GITHUB_API_URL } from "../github/api/config";
import { Octokit } from "@octokit/rest";
import { updateGeminiComment } from "../github/operations/comments/update-gemini-comment";

type GitHubRef = {
  object: {
    sha: string;
  };
};

type GitHubCommit = {
  tree: {
    sha: string;
  };
};

type GitHubTree = {
  sha: string;
};

type GitHubNewCommit = {
  sha: string;
  message: string;
  author: {
    name: string;
    date: string;
  };
};

// Get repository information from environment variables
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;
const REPO_DIR = process.env.REPO_DIR || process.cwd();

if (!REPO_OWNER || !REPO_NAME || !BRANCH_NAME) {
  console.error(
    "Error: REPO_OWNER, REPO_NAME, and BRANCH_NAME environment variables are required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitHub File Operations Server",
  version: "0.0.1",
});

// Commit files tool
server.tool(
  "commit_files",
  "Commit one or more files to a repository in a single commit (this will commit them atomically in the remote repository)",
  {
    files: z
      .array(z.string())
      .describe(
        'Array of file paths relative to repository root (e.g. ["src/main.js", "README.md"]). All files must exist locally.',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ files, message }) => {
    const owner = REPO_OWNER;
    const repo = REPO_NAME;
    const branch = BRANCH_NAME;
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      const processedFiles = files.map((filePath) => {
        if (filePath.startsWith("/")) {
          return filePath.slice(1);
        }
        return filePath;
      });

      // 1. Get the branch reference
      const refUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
      const refResponse = await fetch(refUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!refResponse.ok) {
        throw new Error(
          `Failed to get branch reference: ${refResponse.status}`,
        );
      }

      const refData = (await refResponse.json()) as GitHubRef;
      const baseSha = refData.object.sha;

      // 2. Get the base commit
      const commitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${baseSha}`;
      const commitResponse = await fetch(commitUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!commitResponse.ok) {
        throw new Error(`Failed to get base commit: ${commitResponse.status}`);
      }

      const commitData = (await commitResponse.json()) as GitHubCommit;
      const baseTreeSha = commitData.tree.sha;

      // 3. Create tree entries for all files
      const treeEntries = await Promise.all(
        processedFiles.map(async (filePath) => {
          const fullPath = filePath.startsWith("/")
            ? filePath
            : join(REPO_DIR, filePath);

          const content = await readFile(fullPath, "utf-8");
          return {
            path: filePath,
            mode: "100644",
            type: "blob",
            content: content,
          };
        }),
      );

      // 4. Create a new tree
      const treeUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees`;
      const treeResponse = await fetch(treeUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      });

      if (!treeResponse.ok) {
        const errorText = await treeResponse.text();
        throw new Error(
          `Failed to create tree: ${treeResponse.status} - ${errorText}`,
        );
      }

      const treeData = (await treeResponse.json()) as GitHubTree;

      // 5. Create a new commit
      const newCommitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits`;
      const newCommitResponse = await fetch(newCommitUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message,
          tree: treeData.sha,
          parents: [baseSha],
        }),
      });

      if (!newCommitResponse.ok) {
        const errorText = await newCommitResponse.text();
        throw new Error(
          `Failed to create commit: ${newCommitResponse.status} - ${errorText}`,
        );
      }

      const newCommitData = (await newCommitResponse.json()) as GitHubNewCommit;

      // 6. Update the reference to point to the new commit
      const updateRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
      const updateRefResponse = await fetch(updateRefUrl, {
        method: "PATCH",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false,
        }),
      });

      if (!updateRefResponse.ok) {
        const errorText = await updateRefResponse.text();
        throw new Error(
          `Failed to update reference: ${updateRefResponse.status} - ${errorText}`,
        );
      }

      const simplifiedResult = {
        commit: {
          sha: newCommitData.sha,
          message: newCommitData.message,
          author: newCommitData.author.name,
          date: newCommitData.author.date,
        },
        files: processedFiles.map((path) => ({ path })),
        tree: {
          sha: treeData.sha,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(simplifiedResult, null, 2),
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

// Delete files tool
server.tool(
  "delete_files",
  "Delete one or more files from a repository in a single commit",
  {
    paths: z
      .array(z.string())
      .describe(
        'Array of file paths to delete relative to repository root (e.g. ["src/old-file.js", "docs/deprecated.md"])',
      ),
    message: z.string().describe("Commit message"),
  },
  async ({ paths, message }) => {
    const owner = REPO_OWNER;
    const repo = REPO_NAME;
    const branch = BRANCH_NAME;
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }

      // Convert absolute paths to relative if they match CWD
      const cwd = process.cwd();
      const processedPaths = paths.map((filePath) => {
        if (filePath.startsWith("/")) {
          if (filePath.startsWith(cwd)) {
            // Strip CWD from absolute path
            return filePath.slice(cwd.length + 1);
          } else {
            throw new Error(
              `Path '${filePath}' must be relative to repository root or within current working directory`,
            );
          }
        }
        return filePath;
      });

      // 1. Get the branch reference
      const refUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
      const refResponse = await fetch(refUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!refResponse.ok) {
        throw new Error(
          `Failed to get branch reference: ${refResponse.status}`,
        );
      }

      const refData = (await refResponse.json()) as GitHubRef;
      const baseSha = refData.object.sha;

      // 2. Get the base commit
      const commitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${baseSha}`;
      const commitResponse = await fetch(commitUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!commitResponse.ok) {
        throw new Error(`Failed to get base commit: ${commitResponse.status}`);
      }

      const commitData = (await commitResponse.json()) as GitHubCommit;
      const baseTreeSha = commitData.tree.sha;

      // 3. Create tree entries for file deletions (setting SHA to null)
      const treeEntries = processedPaths.map((path) => ({
        path: path,
        mode: "100644",
        type: "blob" as const,
        sha: null,
      }));

      // 4. Create a new tree with deletions
      const treeUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees`;
      const treeResponse = await fetch(treeUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      });

      if (!treeResponse.ok) {
        const errorText = await treeResponse.text();
        throw new Error(
          `Failed to create tree: ${treeResponse.status} - ${errorText}`,
        );
      }

      const treeData = (await treeResponse.json()) as GitHubTree;

      // 5. Create a new commit
      const newCommitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits`;
      const newCommitResponse = await fetch(newCommitUrl, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message,
          tree: treeData.sha,
          parents: [baseSha],
        }),
      });

      if (!newCommitResponse.ok) {
        const errorText = await newCommitResponse.text();
        throw new Error(
          `Failed to create commit: ${newCommitResponse.status} - ${errorText}`,
        );
      }

      const newCommitData = (await newCommitResponse.json()) as GitHubNewCommit;

      // 6. Update the reference to point to the new commit
      const updateRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
      const updateRefResponse = await fetch(updateRefUrl, {
        method: "PATCH",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false,
        }),
      });

      if (!updateRefResponse.ok) {
        const errorText = await updateRefResponse.text();
        throw new Error(
          `Failed to update reference: ${updateRefResponse.status} - ${errorText}`,
        );
      }

      const simplifiedResult = {
        commit: {
          sha: newCommitData.sha,
          message: newCommitData.message,
          author: newCommitData.author.name,
          date: newCommitData.author.date,
        },
        deletedFiles: processedPaths.map((path) => ({ path })),
        tree: {
          sha: treeData.sha,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(simplifiedResult, null, 2),
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

server.tool(
  "update_gemini_comment",
  "Update the Gemini comment with progress and results (automatically handles both issue and PR comments)",
  {
    body: z.string().describe("The updated comment content"),
  },
  async ({ body }) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN;
      const geminiCommentId = process.env.GEMINI_COMMENT_ID;
      const eventName = process.env.GITHUB_EVENT_NAME;

      if (!githubToken) {
        throw new Error("GITHUB_TOKEN environment variable is required");
      }
      if (!geminiCommentId) {
        throw new Error("GEMINI_COMMENT_ID environment variable is required");
      }

      const owner = REPO_OWNER;
      const repo = REPO_NAME;
      const commentId = parseInt(geminiCommentId, 10);

      const octokit = new Octokit({
        auth: githubToken,
        baseUrl: GITHUB_API_URL,
      });

      const isPullRequestReviewComment =
        eventName === "pull_request_review_comment";

      const result = await updateGeminiComment(octokit, {
        owner,
        repo,
        commentId,
        body,
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
