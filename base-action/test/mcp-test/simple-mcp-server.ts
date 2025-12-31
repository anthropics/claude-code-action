#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "test-server",
  version: "1.0.0",
});

server.tool("test_tool", "A simple test tool", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "Test tool response",
      },
    ],
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("exit", () => {
    server.close();
  });
}

runServer().catch(console.error);
