import * as core from "@actions/core";
import { GITHUB_API_URL, GITHUB_SERVER_URL } from "../github/api/config";
import type { GitHubContext } from "../github/context";
import { isEntityContext } from "../github/context";
import { Octokit } from "@octokit/rest";
import type { AutoDetectedMode } from "../modes/detector";

type PrepareConfigParams = {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
  claudeCommentId?: string;
  allowedTools: string[];
  mode: AutoDetectedMode;
  context: GitHubContext;
};

async function checkActionsReadPermission(
  token: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  try {
    const client = new Octokit({ auth: token, baseUrl: GITHUB_API_URL });

    // Try to list workflow runs - this requires actions:read
    // We use per_page=1 to minimize the response size
    await client.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 1,
    });

    return true;
  } catch (error: any) {
    // Check if it's a permission error
    if (
      error.status === 403 &&
      error.message?.includes("Resource not accessible")
    ) {
      return false;
    }

    // For other errors (network issues, etc), log but don't fail
    core.debug(`Failed to check actions permission: ${error.message}`);
    return false;
  }
}

export async function prepareMcpConfig(
  params: PrepareConfigParams,
): Promise<string> {
  const {
    githubToken,
    owner,
    repo,
    branch,
    baseBranch,
    claudeCommentId,
    allowedTools,
    context,
    mode,
  } = params;
  try {
    const allowedToolsList = allowedTools || [];

    // Detect if we're in agent mode (explicit prompt provided)
    const isAgentMode = mode === "agent";

    const hasGitHubCommentTools = allowedToolsList.some((tool) =>
      tool.startsWith("mcp__github_comment__"),
    );

    const hasGitHubMcpTools = allowedToolsList.some((tool) =>
      tool.startsWith("mcp__github__"),
    );

    const hasInlineCommentTools = allowedToolsList.some((tool) =>
      tool.startsWith("mcp__github_inline_comment__"),
    );

    const hasGitHubCITools = allowedToolsList.some((tool) =>
      tool.startsWith("mcp__github_ci__"),
    );

    const baseMcpConfig: { mcpServers: Record<string, unknown> } = {
      mcpServers: {},
    };

    // Include comment server:
    // - Always in tag mode (for updating Claude comments)
    // - Only with explicit tools in agent mode
    const shouldIncludeCommentServer = !isAgentMode || hasGitHubCommentTools;

    if (shouldIncludeCommentServer) {
      baseMcpConfig.mcpServers.github_comment = {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-comment-server.ts`,
        ],
        env: {
          GITHUB_TOKEN: githubToken,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          ...(claudeCommentId && { CLAUDE_COMMENT_ID: claudeCommentId }),
          GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME || "",
          GITHUB_API_URL: GITHUB_API_URL,
        },
      };
    }

    // Include file ops server when commit signing is enabled
    if (context.inputs.useCommitSigning) {
      baseMcpConfig.mcpServers.github_file_ops = {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-file-ops-server.ts`,
        ],
        env: {
          GITHUB_TOKEN: githubToken,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          BRANCH_NAME: branch,
          BASE_BRANCH: baseBranch,
          REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
          GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME || "",
          IS_PR: process.env.IS_PR || "false",
          GITHUB_API_URL: GITHUB_API_URL,
        },
      };
    }

    // Include inline comment server for PRs when requested via allowed tools
    if (
      isEntityContext(context) &&
      context.isPR &&
      (hasGitHubMcpTools || hasInlineCommentTools)
    ) {
      baseMcpConfig.mcpServers.github_inline_comment = {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-inline-comment-server.ts`,
        ],
        env: {
          GITHUB_TOKEN: githubToken,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          PR_NUMBER: context.entityNumber?.toString() || "",
          GITHUB_API_URL: GITHUB_API_URL,
        },
      };
    }

    // CI server is included when:
    // - In tag mode: when we have a workflow token and context is a PR
    // - In agent mode: same conditions PLUS explicit CI tools in allowedTools
    const hasWorkflowToken = !!process.env.DEFAULT_WORKFLOW_TOKEN;
    const shouldIncludeCIServer =
      (!isAgentMode || hasGitHubCITools) &&
      isEntityContext(context) &&
      context.isPR &&
      hasWorkflowToken;

    if (shouldIncludeCIServer) {
      // Verify the token actually has actions:read permission
      const actuallyHasPermission = await checkActionsReadPermission(
        process.env.DEFAULT_WORKFLOW_TOKEN || "",
        owner,
        repo,
      );

      if (!actuallyHasPermission) {
        core.warning(
          "The github_ci MCP server requires 'actions: read' permission. " +
            "Please ensure your GitHub token has this permission. " +
            "See: https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token",
        );
      }
      baseMcpConfig.mcpServers.github_ci = {
        command: "bun",
        args: [
          "run",
          `${process.env.GITHUB_ACTION_PATH}/src/mcp/github-actions-server.ts`,
        ],
        env: {
          // Use workflow github token, not app token
          GITHUB_TOKEN: process.env.DEFAULT_WORKFLOW_TOKEN,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          PR_NUMBER: context.entityNumber?.toString() || "",
          RUNNER_TEMP: process.env.RUNNER_TEMP || "/tmp",
        },
      };
    }

    if (hasGitHubMcpTools) {
      baseMcpConfig.mcpServers.github = {
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "-e",
          "GITHUB_PERSONAL_ACCESS_TOKEN",
          "-e",
          "GITHUB_HOST",
          "ghcr.io/github/github-mcp-server:sha-23fa0dd", // https://github.com/github/github-mcp-server/releases/tag/v0.17.1
        ],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
          GITHUB_HOST: GITHUB_SERVER_URL,
        },
      };
    }

    // Return only our GitHub servers config
    // User's config will be passed as separate --mcp-config flags
    return JSON.stringify(baseMcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
