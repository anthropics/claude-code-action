#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error(
    "[GitHub Follow Server] Error: GITHUB_TOKEN environment variable is required",
  );
  process.exit(1);
}

const server = new McpServer({
  name: "GitHub Follow Server",
  version: "0.0.1",
});

console.error("[GitHub Follow Server] MCP Server instance created");

server.tool(
  "follow_user",
  "Follow a GitHub user",
  {
    username: z.string().describe("The GitHub username to follow"),
  },
  async ({ username }) => {
    try {
      const followUrl = `${GITHUB_API_URL}/user/following/${username}`;

      const response = await fetch(followUrl, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Length": "0",
        },
      });

      if (response.status === 204) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully followed ${username}`,
                  username: username,
                },
                null,
                2,
              ),
            },
          ],
        };
      } else if (response.status === 401) {
        throw new Error("Unauthorized: Invalid GitHub token");
      } else if (response.status === 403) {
        throw new Error("Forbidden: Check token permissions");
      } else if (response.status === 404) {
        throw new Error(`User not found: ${username}`);
      } else {
        const errorText = await response.text();
        throw new Error(
          `Failed to follow user: ${response.status} - ${errorText}`,
        );
      }
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
  "unfollow_user",
  "Unfollow a GitHub user",
  {
    username: z.string().describe("The GitHub username to unfollow"),
  },
  async ({ username }) => {
    try {
      const unfollowUrl = `${GITHUB_API_URL}/user/following/${username}`;

      const response = await fetch(unfollowUrl, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (response.status === 204) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully unfollowed ${username}`,
                  username: username,
                },
                null,
                2,
              ),
            },
          ],
        };
      } else if (response.status === 401) {
        throw new Error("Unauthorized: Invalid GitHub token");
      } else if (response.status === 403) {
        throw new Error("Forbidden: Check token permissions");
      } else if (response.status === 404) {
        throw new Error(`User not found: ${username}`);
      } else {
        const errorText = await response.text();
        throw new Error(
          `Failed to unfollow user: ${response.status} - ${errorText}`,
        );
      }
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
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.on("exit", () => {
      server.close();
    });
  } catch (error) {
    throw error;
  }
}

runServer().catch(() => {
  process.exit(1);
});
