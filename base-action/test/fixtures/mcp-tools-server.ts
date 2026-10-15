#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Serves the tools named in TOOL_NAMES (comma-separated)
const server = new McpServer({ name: "tools-server", version: "1.0.0" });

for (const name of (process.env.TOOL_NAMES ?? "").split(",")) {
  server.tool(name, `The ${name} tool`, {}, async () => ({
    content: [{ type: "text", text: name }],
  }));
}

await server.connect(new StdioServerTransport());
