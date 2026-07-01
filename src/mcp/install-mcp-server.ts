import * as core from "@actions/core";
import { existsSync, statSync } from "fs";
import { GITHUB_API_URL, GITHUB_SERVER_URL } from "../github/api/config";
import type { GitHubContext } from "../github/context";
import { isEntityContext } from "../github/context";
import { Octokit } from "@octokit/rest";
import type { AutoDetectedMode } from "../modes/detector";

/**
 * Resolves a CA certificate bundle path for mounting into Docker containers.
 *
 * Checks (in priority order):
 * 1. NODE_EXTRA_CA_CERTS env var (explicit user config)
 * 2. SSL_CERT_FILE env var
 * 3. /etc/ssl/certs/ca-certificates.crt (Debian/Ubuntu/Alpine)
 * 4. /etc/pki/tls/certs/ca-bundle.crt (RHEL/CentOS/Fedora)
 *
 * Returns the first path that exists and is a regular file, or undefined.
 */
export function resolveHostCACertFile(): string | undefined {
  const candidates: string[] = [];

  if (process.env.NODE_EXTRA_CA_CERTS) {
    candidates.push(process.env.NODE_EXTRA_CA_CERTS);
  }
  if (process.env.SSL_CERT_FILE) {
    candidates.push(process.env.SSL_CERT_FILE);
  }
  candidates.push(
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/pki/tls/certs/ca-bundle.crt",
  );

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Permission error or broken symlink — skip
    }
  }
  return undefined;
}

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
          CLASSIFY_INLINE_COMMENTS: context.inputs.classifyInlineComments
            ? "true"
            : "false",
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
            "Skipping CI server installation. " +
            "To enable CI status checks, add 'actions: read' to your workflow permissions. " +
            "See: https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token",
        );
      } else {
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
    }

    if (hasGitHubMcpTools) {
      const dockerArgs = [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "-e",
        "GITHUB_HOST",
      ];
      const dockerEnv: Record<string, string> = {
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
        GITHUB_HOST: GITHUB_SERVER_URL,
      };

      // Mount the host's CA certificate bundle into the container so the Go
      // binary can trust GHES instances using internal/corporate CAs.
      // Mounted to /custom-ca/ to avoid overwriting the container's own certs.
      const caCertFile = resolveHostCACertFile();
      if (caCertFile) {
        const containerCaPath = "/custom-ca/ca-bundle.crt";
        dockerArgs.push("-v", `${caCertFile}:${containerCaPath}:ro`);
        dockerArgs.push("-e", "SSL_CERT_FILE");
        dockerEnv.SSL_CERT_FILE = containerCaPath;
      }

      dockerArgs.push(
        "ghcr.io/github/github-mcp-server:sha-23fa0dd", // https://github.com/github/github-mcp-server/releases/tag/v0.17.1
      );

      baseMcpConfig.mcpServers.github = {
        command: "docker",
        args: dockerArgs,
        env: dockerEnv,
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
