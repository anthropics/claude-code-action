import * as core from "@actions/core";

export async function prepareMcpConfig(
  githubToken: string,
  owner: string,
  repo: string,
  branch: string,
  claudeCommentId?: string,
): Promise<string> {
  try {
    const mcpConfig = {
      mcpServers: {
        github: {
          command: "docker",
          args: [
            "run",
            "-i",
            "--rm",
            "-e",
            "GITHUB_PERSONAL_ACCESS_TOKEN",
            "ghcr.io/anthropics/github-mcp-server:sha-7382253",
          ],
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
          },
        },
        github_file_ops: {
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
            REPO_DIR: process.env.GITHUB_WORKSPACE || process.cwd(),
            ...(claudeCommentId && { CLAUDE_COMMENT_ID: claudeCommentId }),
            GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME || "",
            IS_PR: process.env.IS_PR || "false",
          },
        },
      },
    };

    return JSON.stringify(mcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
