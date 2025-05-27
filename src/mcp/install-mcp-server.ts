import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";

export async function prepareMcpConfig(
  githubToken: string,
  owner: string,
  repo: string,
  branch: string
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
          },
        },
      },
    };

    // Read existing .mcp.json from execution environment
    const mcpJsonPath = path.join(process.env.GITHUB_WORKSPACE, ".mcp.json");

    try {
      if (fs.existsSync(mcpJsonPath)) {
        const existingMcpContent = fs.readFileSync(mcpJsonPath, "utf8");
        const existingMcpConfig = JSON.parse(existingMcpContent);

        // Merge existing MCP servers with our default ones, preserving our defaults
        if (existingMcpConfig.mcpServers) {
          // Create a new merged object with our defaults taking precedence
          mcpConfig.mcpServers = {
            ...existingMcpConfig.mcpServers,
            ...mcpConfig.mcpServers
          };
        }

        console.log(`Found and merged .mcp.json from: ${mcpJsonPath}`);
      }
    } catch (readError) {
      console.warn(
        `Failed to read .mcp.json from ${mcpJsonPath}: ${readError}`
      );
    }

    return JSON.stringify(mcpConfig, null, 2);
  } catch (error) {
    core.setFailed(`Install MCP server failed with error: ${error}`);
    process.exit(1);
  }
}
