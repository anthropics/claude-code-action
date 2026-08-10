#!/usr/bin/env node
// GitHub File Operations MCP Server
//
// The tool handlers are exported so they can be tested directly. `server.tool()`
// registrations below are thin bindings, and the stdio bootstrap only runs when
// this file is the process entrypoint — importing it must never start a server
// or exit the process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, stat } from "fs/promises";
import { resolve, sep } from "path";
import { constants } from "fs";
import fetch from "node-fetch";
import { GITHUB_API_URL } from "../github/api/config";
import { retryWithBackoff, type RetryOptions } from "../utils/retry";
import { validatePathWithinRepo } from "./path-validation";
import { toolError, toolSuccess, type ToolResult } from "./tool-result";

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

/**
 * Everything the handlers need from the environment, resolved once per call.
 * Passing this explicitly is what makes the handlers testable without
 * process-wide env mutation.
 */
export type FileOpsContext = {
  owner: string;
  repo: string;
  branch: string;
  repoDir: string;
  githubToken: string;
  baseBranch: string | undefined;
};

export const MISSING_REPO_ENV_MESSAGE =
  "Error: REPO_OWNER, REPO_NAME, and BRANCH_NAME environment variables are required";

export function readFileOpsContext(
  env: NodeJS.ProcessEnv = process.env,
): FileOpsContext {
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;
  const branch = env.BRANCH_NAME;

  if (!owner || !repo || !branch) {
    throw new Error(MISSING_REPO_ENV_MESSAGE);
  }

  const githubToken = env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  return {
    owner,
    repo,
    branch,
    repoDir: env.REPO_DIR || process.cwd(),
    githubToken,
    baseBranch: env.BASE_BRANCH,
  };
}

function githubHeaders(githubToken: string, json = false) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

// Helper function to get or create branch reference
export async function getOrCreateBranchRef(
  owner: string,
  repo: string,
  branch: string,
  githubToken: string,
  baseBranchName?: string,
): Promise<string> {
  // Try to get the branch reference
  const refUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
  const refResponse = await fetch(refUrl, {
    headers: githubHeaders(githubToken),
  });

  if (refResponse.ok) {
    const refData = (await refResponse.json()) as GitHubRef;
    return refData.object.sha;
  }

  if (refResponse.status !== 404) {
    throw new Error(`Failed to get branch reference: ${refResponse.status}`);
  }

  const baseBranch = baseBranchName ?? process.env.BASE_BRANCH!;

  // Get the SHA of the base branch
  const baseRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`;
  const baseRefResponse = await fetch(baseRefUrl, {
    headers: githubHeaders(githubToken),
  });

  let baseSha: string;

  if (!baseRefResponse.ok) {
    // If base branch doesn't exist, try default branch
    const repoUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}`;
    const repoResponse = await fetch(repoUrl, {
      headers: githubHeaders(githubToken),
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
      headers: githubHeaders(githubToken),
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
    headers: githubHeaders(githubToken, true),
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
export async function getFileMode(filePath: string): Promise<string> {
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

/** Fetches the base commit's tree SHA for `baseSha`. */
async function getBaseTreeSha(
  context: FileOpsContext,
  baseSha: string,
): Promise<string> {
  const { owner, repo, githubToken } = context;
  const commitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${baseSha}`;
  const commitResponse = await fetch(commitUrl, {
    headers: githubHeaders(githubToken),
  });

  if (!commitResponse.ok) {
    throw new Error(`Failed to get base commit: ${commitResponse.status}`);
  }

  const commitData = (await commitResponse.json()) as GitHubCommit;
  return commitData.tree.sha;
}

async function createTree(
  context: FileOpsContext,
  baseTreeSha: string,
  treeEntries: unknown[],
): Promise<GitHubTree> {
  const { owner, repo, githubToken } = context;
  const treeUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees`;
  const treeResponse = await fetch(treeUrl, {
    method: "POST",
    headers: githubHeaders(githubToken, true),
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

  return (await treeResponse.json()) as GitHubTree;
}

async function createCommit(
  context: FileOpsContext,
  message: string,
  treeSha: string,
  baseSha: string,
): Promise<GitHubNewCommit> {
  const { owner, repo, githubToken } = context;
  const newCommitUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits`;
  const newCommitResponse = await fetch(newCommitUrl, {
    method: "POST",
    headers: githubHeaders(githubToken, true),
    body: JSON.stringify({
      message: message,
      tree: treeSha,
      parents: [baseSha],
    }),
  });

  if (!newCommitResponse.ok) {
    const errorText = await newCommitResponse.text();
    throw new Error(
      `Failed to create commit: ${newCommitResponse.status} - ${errorText}`,
    );
  }

  return (await newCommitResponse.json()) as GitHubNewCommit;
}

/**
 * Default retry policy for the ref update. Overridable only so tests do not
 * have to wait out the real backoff; production callers use these values.
 */
export const DEFAULT_REF_UPDATE_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000, // Start with 1 second delay
  maxDelayMs: 5000, // Max 5 seconds delay
  backoffFactor: 2, // Double the delay each time
};

export type FileOpsOptions = {
  /** Overrides DEFAULT_REF_UPDATE_RETRY. Tests use this to shrink the backoff. */
  retry?: RetryOptions;
};

/**
 * Points the branch at `commitSha`.
 *
 * We're seeing intermittent 403 "Resource not accessible by integration" errors
 * on certain repos when updating git references. These appear to be transient
 * GitHub API issues that succeed on retry.
 *
 * NOTE: every failure is retried, not just the 403. No `shouldRetry` predicate
 * is passed to retryWithBackoff, so a permanent error (a bad ref, a revoked
 * token) still costs the full maxAttempts before surfacing. The "fail
 * immediately" wording that used to sit on the non-403 branch below described
 * an intent the code has never implemented; it is pinned as-is by
 * test/mcp-file-ops-server.test.ts rather than changed here, because narrowing
 * the retry is a behaviour change and this refactor is meant to be behaviour-
 * preserving.
 *
 * `logRetryOn403` exists only to preserve a pre-existing difference between the
 * two callers: delete_files logged on 403 and commit_files did not.
 */
async function updateBranchRef(
  context: FileOpsContext,
  commitSha: string,
  {
    logRetryOn403,
    retry,
  }: { logRetryOn403: boolean; retry?: RetryOptions | undefined },
): Promise<void> {
  const { owner, repo, branch, githubToken } = context;
  const updateRefUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`;

  await retryWithBackoff(async () => {
    const updateRefResponse = await fetch(updateRefUrl, {
      method: "PATCH",
      headers: githubHeaders(githubToken, true),
      body: JSON.stringify({
        sha: commitSha,
        force: false,
      }),
    });

    if (!updateRefResponse.ok) {
      const errorText = await updateRefResponse.text();

      // Provide a more helpful error message for 403 permission errors
      if (updateRefResponse.status === 403) {
        if (logRetryOn403) {
          console.log("Received 403 error, will retry...");
        }
        const permissionError = new Error(
          `Permission denied: Unable to push commits to branch '${branch}'. ` +
            `Please rebase your branch from the main/master branch to allow Claude to commit.\n\n` +
            `Original error: ${errorText}`,
        );
        throw permissionError;
      }

      // For other errors, use the original message
      const error = new Error(
        `Failed to update reference: ${updateRefResponse.status} - ${errorText}`,
      );

      // Retried like any other failure — see the note above.
      console.error("Non-retryable error:", updateRefResponse.status);
      throw error;
    }
  }, retry ?? DEFAULT_REF_UPDATE_RETRY);
}

/**
 * Commits `files` (read from disk) to the branch in a single commit.
 * Throws on failure; the tool binding converts that into the MCP error envelope.
 */
export async function commitFiles(
  { files, message }: { files: string[]; message: string },
  context: FileOpsContext,
  options: FileOpsOptions = {},
): Promise<ToolResult> {
  const { owner, repo, branch, repoDir, githubToken, baseBranch } = context;

  // Validate all paths are within repository root and get full/relative paths
  const resolvedRepoDir = resolve(repoDir);
  const validatedFiles = await Promise.all(
    files.map(async (filePath) => {
      const fullPath = await validatePathWithinRepo(filePath, repoDir);
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
    baseBranch,
  );

  // 2. Get the base commit
  const baseTreeSha = await getBaseTreeSha(context, baseSha);

  // 3. Create tree entries for all files
  const treeEntries = await Promise.all(
    validatedFiles.map(async ({ fullPath, relativePath }) => {
      // Get the proper file mode based on file permissions
      const fileMode = await getFileMode(fullPath);

      // Check if file is binary (images, etc.)
      const isBinaryFile =
        /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tar|gz|exe|bin|woff|woff2|ttf|eot)$/i.test(
          relativePath,
        );

      if (isBinaryFile) {
        // For binary files, create a blob first using the Blobs API
        const binaryContent = await readFile(fullPath);

        // Create blob using Blobs API (supports encoding parameter)
        const blobUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs`;
        const blobResponse = await fetch(blobUrl, {
          method: "POST",
          headers: githubHeaders(githubToken, true),
          body: JSON.stringify({
            content: binaryContent.toString("base64"),
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
        const content = await readFile(fullPath, "utf-8");
        return {
          path: relativePath,
          mode: fileMode,
          type: "blob",
          content: content,
        };
      }
    }),
  );

  // 4. Create a new tree
  const treeData = await createTree(context, baseTreeSha, treeEntries);

  // 5. Create a new commit
  const newCommitData = await createCommit(
    context,
    message,
    treeData.sha,
    baseSha,
  );

  // 6. Update the reference to point to the new commit
  await updateBranchRef(context, newCommitData.sha, {
    logRetryOn403: false,
    retry: options.retry,
  });

  return toolSuccess({
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
  });
}

/**
 * Deletes `paths` from the branch in a single commit.
 * Throws on failure; the tool binding converts that into the MCP error envelope.
 */
export async function deleteFiles(
  { paths, message }: { paths: string[]; message: string },
  context: FileOpsContext,
  options: FileOpsOptions = {},
): Promise<ToolResult> {
  const { owner, repo, branch, repoDir, githubToken, baseBranch } = context;

  // Convert absolute paths to relative if they match CWD
  const cwd = process.cwd();
  const rawPaths = paths.map((filePath) => {
    if (filePath.startsWith("/")) {
      if (filePath === cwd || filePath.startsWith(cwd + sep)) {
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

  // Validate all paths stay within the repository root (mirrors
  // commit_files' use of validatePathWithinRepo) before they reach the
  // git tree entries below.
  const resolvedRepoDir = resolve(repoDir);
  const processedPaths = await Promise.all(
    rawPaths.map(async (filePath) => {
      await validatePathWithinRepo(filePath, repoDir);
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
    baseBranch,
  );

  // 2. Get the base commit
  const baseTreeSha = await getBaseTreeSha(context, baseSha);

  // 3. Create tree entries for file deletions (setting SHA to null)
  const treeEntries = processedPaths.map((path) => ({
    path: path,
    mode: "100644",
    type: "blob" as const,
    sha: null,
  }));

  // 4. Create a new tree with deletions
  const treeData = await createTree(context, baseTreeSha, treeEntries);

  // 5. Create a new commit
  const newCommitData = await createCommit(
    context,
    message,
    treeData.sha,
    baseSha,
  );

  // 6. Update the reference to point to the new commit
  await updateBranchRef(context, newCommitData.sha, {
    logRetryOn403: true,
    retry: options.retry,
  });

  return toolSuccess({
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
  });
}

export function createFileOpsServer(): McpServer {
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
      try {
        return await commitFiles({ files, message }, readFileOpsContext());
      } catch (error) {
        return toolError(error);
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
      try {
        return await deleteFiles({ paths, message }, readFileOpsContext());
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
  if (
    !process.env.REPO_OWNER ||
    !process.env.REPO_NAME ||
    !process.env.BRANCH_NAME
  ) {
    console.error(MISSING_REPO_ENV_MESSAGE);
    process.exit(1);
  }

  const server = createFileOpsServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

if (import.meta.main) {
  runServer().catch(console.error);
}
