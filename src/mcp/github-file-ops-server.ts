#!/usr/bin/env node
// GitHub File Operations MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";
import { constants } from "fs";
import fetch from "node-fetch";
import { GITHUB_API_URL } from "../github/api/config";
import { isBinaryContent } from "./binary-detection";
import { validatePathWithinRepo } from "./path-validation";
import { updateGitReference } from "./update-git-reference";

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

// Helper function to get or create branch reference
async function getOrCreateBranchRef(
  owner: string,
  repo: string,
  branch: string,
  githubToken: string,
): Promise<string> {
  // Try to get the branch reference
  const refUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
  const refResponse = await fetch(refUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (refResponse.ok) {
    const refData = (await refResponse.json()) as GitHubRef;
    return refData.object.sha;
  }

  if (refResponse.status !== 404) {
    throw new Error(`Failed to get branch reference: ${refResponse.status}`);
  }

  const baseBranch = process.env.BASE_BRANCH!;

  // Get the SHA of the base branch
  const baseRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`;
  const baseRefResponse = await fetch(baseRefUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  let baseSha: string;

  if (!baseRefResponse.ok) {
    // If base branch doesn't exist, try default branch
    const repoUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}`;
    const repoResponse = await fetch(repoUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!repoResponse.ok) {
      throw new Error(`Failed to get repository info: ${repoResponse.status}`);
    }

    const repoData = (await repoResponse.json()) as {
      default_branch: string;
    };
    const defaultBranch = repoData.default_branch;

    // Try default branch
    const defaultRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`;
    const defaultRefResponse = await fetch(defaultRefUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!defaultRefResponse.ok) {
      throw new Error(
        `Failed to get default branch reference: ${defaultRefResponse.status}`,
      );
    }

    const defaultRefData = (await defaultRefResponse.json()) as GitHubRef;
    baseSha = defaultRefData.object.sha;
  } else {
    const baseRefData = (await baseRefResponse.json()) as GitHubRef;
    baseSha = baseRefData.object.sha;
  }

  // Create the new branch using the same pattern as octokit
  const createRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs`;
  const createRefResponse = await fetch(createRefUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    }),
  });

  if (!createRefResponse.ok) {
    const errorText = await createRefResponse.text();
    throw new Error(
      `Failed to create branch: ${createRefResponse.status} - ${errorText}`,
    );
  }

  console.log(`Successfully created branch ${branch}`);
  return baseSha;
}

// Get the appropriate Git file mode for a file
async function getFileMode(filePath: string): Promise<string> {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      // Check if execute bit is set for user
      if (fileStat.mode & constants.S_IXUSR) {
        return "100755"; // Executable file
      } else {
        return "100644"; // Regular file
      }
    } else if (fileStat.isDirectory()) {
      return "040000"; // Directory (tree)
    } else if (fileStat.isSymbolicLink()) {
      return "120000"; // Symbolic link
    } else {
      // Fallback for unknown file types
      return "100644";
    }
  } catch (error) {
    // If we can't stat the file, default to regular file
    console.warn(
      `Could not determine file mode for ${filePath}, using default: ${error}`,
    );
    return "100644";
  }
}

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

      // Validate all paths are within repository root and get full/relative paths
      const resolvedRepoDir = resolve(REPO_DIR);
      const validatedFiles = await Promise.all(
        files.map(async (filePath) => {
          const fullPath = await validatePathWithinRepo(filePath, REPO_DIR);
          // Calculate the relative path for the git tree entry
          // Use the original filePath (normalized) for the git path, not the symlink-resolved path
          const normalizedPath = resolve(resolvedRepoDir, filePath);
          const relativePath = normalizedPath.slice(resolvedRepoDir.length + 1);
          return { fullPath, relativePath };
        }),
      );

      // 1. Get the branch reference (create if doesn't exist)
      const baseSha = await getOrCreateBranchRef(
        owner,
        repo,
        branch,
        githubToken,
      );

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
        validatedFiles.map(async ({ fullPath, relativePath }) => {
          // Get the proper file mode based on file permissions
          const fileMode = await getFileMode(fullPath);

          // Check if the file is binary by inspecting its contents. An
          // extension allowlist used to decide this, which corrupted every
          // binary type that wasn't on the list.
          const fileContent = await readFile(fullPath);

          if (isBinaryContent(fileContent)) {
            // For binary files, create a blob first using the Blobs API
            // (supports the encoding parameter)
            const blobUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs`;
            const blobResponse = await fetch(blobUrl, {
              method: "POST",
              headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${githubToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                content: fileContent.toString("base64"),
                encoding: "base64",
              }),
            });

            if (!blobResponse.ok) {
              const errorText = await blobResponse.text();
              throw new Error(
                `Failed to create blob for ${relativePath}: ${blobResponse.status} - ${errorText}`,
              );
            }

            const blobData = (await blobResponse.json()) as { sha: string };

            // Return tree entry with blob SHA
            return {
              path: relativePath,
              mode: fileMode,
              type: "blob",
              sha: blobData.sha,
            };
          } else {
            // For text files, include content directly in tree
            return {
              path: relativePath,
              mode: fileMode,
              type: "blob",
              content: fileContent.toString("utf-8"),
            };
          }
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
      await updateGitReference({
        owner,
        repo,
        branch,
        sha: newCommitData.sha,
        githubToken,
      });

      const simplifiedResult = {
        commit: {
          sha: newCommitData.sha,
          message: newCommitData.message,
          author: newCommitData.author.name,
          date: newCommitData.author.date,
        },
        files: validatedFiles.map(({ relativePath }) => ({
          path: relativePath,
        })),
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

      // Validate all paths are within the repository root and normalize them to
      // repo-relative paths for the git tree entries. This mirrors the validation
      // already performed by the commit_files tool and rejects path traversal
      // ("../") and symlinked escapes as defense-in-depth.
      const resolvedRepoDir = resolve(REPO_DIR);
      const processedPaths = await Promise.all(
        paths.map(async (filePath) => {
          await validatePathWithinRepo(filePath, REPO_DIR);
          const normalizedPath = resolve(resolvedRepoDir, filePath);
          return normalizedPath.slice(resolvedRepoDir.length + 1);
        }),
      );

      // 1. Get the branch reference (create if doesn't exist)
      const baseSha = await getOrCreateBranchRef(
        owner,
        repo,
        branch,
        githubToken,
      );

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
      await updateGitReference({
        owner,
        repo,
        branch,
        sha: newCommitData.sha,
        githubToken,
      });

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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
