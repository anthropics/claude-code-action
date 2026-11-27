import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { join } from "node:path";

async function callInlineComment(scenario: string, token = "test-token") {
  const client = new Client({ name: "inline-comment-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--preload",
      join(import.meta.dir, "fixtures", "inline-comment-fetch.ts"),
      join(import.meta.dir, "../src/mcp/github-inline-comment-server.ts"),
    ],
    env: {
      REPO_OWNER: "example",
      REPO_NAME: "project",
      PR_NUMBER: "37",
      GITHUB_TOKEN: token,
      CLASSIFY_INLINE_COMMENTS: scenario === "cleanup" ? "true" : "false",
      TEST_INLINE_COMMENT_RESPONSE: scenario,
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const result = CallToolResultSchema.parse(
      await client.callTool({
        name: "create_inline_comment",
        arguments: {
          path: "src/index.ts",
          line: 7,
          body: "A finding",
          commit_id: "b".repeat(40),
          confirmed: true,
        },
      }),
    );
    const content = result.content[0];
    if (content?.type !== "text") {
      throw new Error("Expected a text tool result");
    }
    return { result, details: JSON.parse(content.text) };
  } finally {
    await client.close();
  }
}

describe("inline comment MCP errors", () => {
  test.each([403, 404, 408, 422, 429, 500, 503])(
    "preserves HTTP %d in structured content and failure-hook text",
    async (status) => {
      const { result, details } = await callInlineComment(String(status));
      expect(result.isError).toBe(true);
      expect(details.success).toBe(false);
      expect(details.http_status).toBe(status);
      expect(result.structuredContent).toEqual(details);
      expect(details.message).toContain("Error creating inline comment:");
      expect(JSON.stringify(result)).not.toContain("test-token");
      expect(JSON.stringify(result)).not.toContain("do-not-copy");
      if (status === 422) {
        expect(details.error).toContain("Validation Failed");
        expect(details.message).toContain(
          "line number doesn't exist in the diff",
        );
      }
    },
  );

  test("does not invent an HTTP response for a transport failure", async () => {
    const { result, details } = await callInlineComment("transport");
    expect(result.isError).toBe(true);
    expect(details.success).toBe(false);
    expect(details.error).toContain("fetch failed");
    expect(details).not.toHaveProperty("http_status");
    expect(result.structuredContent).toEqual(details);
  });

  test("keeps local validation errors distinct from HTTP failures", async () => {
    const { result, details } = await callInlineComment("201", "");
    expect(result.isError).toBe(true);
    expect(details.error).toBe("GITHUB_TOKEN environment variable is required");
    expect(details).not.toHaveProperty("http_status");
    expect(result.structuredContent).toEqual(details);
  });

  test("does not imply rejection when cleanup fails after publishing", async () => {
    const { result, details } = await callInlineComment("cleanup");
    expect(result.isError).toBe(true);
    expect(details.error).toBe("Buffer cleanup failed after publishing");
    expect(details).not.toHaveProperty("http_status");
    expect(result.structuredContent).toEqual(details);
  });

  test("preserves the successful publication result", async () => {
    const { result, details } = await callInlineComment("201");
    expect(result.isError).not.toBe(true);
    expect(details.success).toBe(true);
    expect(details.comment_id).toBe(81);
    expect(details).not.toHaveProperty("http_status");
  });
});
