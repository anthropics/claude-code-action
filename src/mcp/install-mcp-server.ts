import * as core from "@actions/core";
import { GITHUB_API_URL } from "../github/api/config";
import type { ParsedGitHubContext } from "../github/context";
import { Octokit } from "@octokit/rest";

type PrepareConfigParams = {
  githubToken: string;
  owner: string;
  repo: string;
  branch: string;
  baseBranch: string;
  additionalMcpConfig?: string;
  claudeCommentId?: string;
  allowedTools: string[];
  context: ParsedGitHubContext;
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
    additionalMcpConfig,
    claudeCommentId,
    allowedTools,
    context,
  } = params;
  try {
    const allowedToolsList = allowedTools || [];

    const hasGitHubMcpTools = allowedToolsList.some((tool) =>
      tool.startsWith("mcp__github__"),
    );

    const baseMcpConfig: { mcpServers: Record<string, unknown> } = {
      mcpServers: {},
    };

    // Always include comment server for updating Claude comments
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

    // Only add CI server if we have actions:read permission and we're in a PR context
    const hasActionsReadPermission =
      context.inputs.additionalPermissions.get("actions") === "read";

    if (context.isPR && hasActionsReadPermission) {
      // Verify the token actually has actions:read permission
      const actuallyHasPermission = await checkActionsReadPermission(
        process.env.ACTIONS_TOKEN || "",
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
          GITHUB_TOKEN: process.env.ACTIONS_TOKEN,
          REPO_OWNER: owner,
          REPO_NAME: repo,
          PR_NUMBER: context.entityNumber.toString(),
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
          "ghcr.io/github/github-mcp-server:sha-721fd3e", // https://github.com/github/github-mcp-server/releases/tag/v0.6.0
        ],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
        },
      };
    }

    // Merge with additional MCP config if provided
    if (additionalMcpConfig && additionalMcpConfig.trim()) {
      try {
        const additionalConfig = JSON.parse(additionalMcpConfig);

        // Validate that parsed JSON is an object
        if (typeof additionalConfig !== "object" || additionalConfig === null) {
          throw new Error("MCP config must be a valid JSON object");
        }

        core.info(
          "Merging additional MCP server configuration with built-in servers",
        );

        // Merge configurations with user config overriding built-in servers
        const mergedConfig = {
          ...baseMcpConfig,
          ...additionalConfig,
          mcpServers: {
            ...baseMcpConfig.mcpServers,
            ...additionalConfig.mcpServers,
          },
        };

        return JSON.stringify(mergedConfig, null, 2);
      } catch (parseError) {
        core.warning(
          `Failed to parse additional MCP config: ${parseError}. Using base config only.`,
        );
      }
    }

    return JSON.stringify(baseMcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
