#!/usr/bin/env bun

/**
 * Spawns each in-process MCP server the way the action does (`bun run <path>`)
 * and drives a real MCP handshake over stdio: initialize, initialized,
 * tools/list.
 *
 * Unit tests of the extracted handlers cannot catch the failure this covers.
 * A server that no longer starts, throws during registration, or stops
 * advertising a tool would leave every handler test green while Claude loses
 * the ability to commit, comment, or read CI. That is also the specific risk
 * introduced by moving the bootstrap behind `import.meta.main` — this asserts
 * the guard still fires when the file *is* the entrypoint.
 *
 * The servers are only asked to describe themselves, so no GitHub API call is
 * made and the tokens below are never used.
 */

import { describe, expect, test } from "bun:test";
import { join } from "path";

const MCP_DIR = join(import.meta.dir, "..", "src", "mcp");

const BASE_ENV = {
  REPO_OWNER: "test-owner",
  REPO_NAME: "test-repo",
  GITHUB_TOKEN: "test-token",
};

const SERVERS = [
  {
    file: "github-file-ops-server.ts",
    serverName: "GitHub File Operations Server",
    tools: ["commit_files", "delete_files"],
    env: { ...BASE_ENV, BRANCH_NAME: "claude/test-branch" },
  },
  {
    file: "github-comment-server.ts",
    serverName: "GitHub Comment Server",
    tools: ["update_claude_comment"],
    env: { ...BASE_ENV, CLAUDE_COMMENT_ID: "123" },
  },
  {
    file: "github-inline-comment-server.ts",
    serverName: "GitHub Inline Comment Server",
    tools: ["create_inline_comment"],
    env: { ...BASE_ENV, PR_NUMBER: "7" },
  },
  {
    file: "github-actions-server.ts",
    serverName: "GitHub CI Server",
    tools: ["get_ci_status", "get_workflow_run_details", "download_job_log"],
    env: { ...BASE_ENV, PR_NUMBER: "7" },
  },
];

type HandshakeResult = {
  serverInfo: { name: string; version: string };
  tools: string[];
};

async function mcpHandshake(
  file: string,
  env: Record<string, string>,
): Promise<HandshakeResult> {
  const proc = Bun.spawn(["bun", "run", join(MCP_DIR, file)], {
    env: { ...process.env, ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const send = (message: object) =>
      proc.stdin.write(`${JSON.stringify(message)}\n`);

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1.0.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    await proc.stdin.flush();

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    const responses = new Map<number, any>();
    let buffered = "";
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline && !(responses.has(1) && responses.has(2))) {
      const { value, done } = await reader.read();
      if (done) break;

      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";

      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line);
        if (typeof message.id === "number") {
          responses.set(message.id, message);
        }
      }
    }

    const initialize = responses.get(1);
    const toolsList = responses.get(2);

    if (!initialize || !toolsList) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(
        `${file} did not complete the MCP handshake. stderr:\n${stderr}`,
      );
    }

    return {
      serverInfo: initialize.result.serverInfo,
      tools: (toolsList.result.tools as { name: string }[]).map(
        (tool) => tool.name,
      ),
    };
  } finally {
    proc.kill();
  }
}

describe("MCP servers speak MCP over stdio", () => {
  for (const { file, serverName, tools, env } of SERVERS) {
    test(`${file} starts and advertises its tools`, async () => {
      const { serverInfo, tools: advertised } = await mcpHandshake(file, env);

      expect(serverInfo.name).toBe(serverName);
      expect(advertised.sort()).toEqual([...tools].sort());
    }, 30_000);
  }

  test("a tool call reaches its handler and returns the MCP error envelope", async () => {
    // Proves the binding is wired end-to-end, not just registered: the call
    // is dispatched, the handler runs, and its failure comes back through
    // toolError rather than killing the server. commit_files is used because
    // it fails on the first API call with an unusable token.
    const proc = Bun.spawn(
      ["bun", "run", join(MCP_DIR, "github-file-ops-server.ts")],
      {
        env: {
          ...process.env,
          ...BASE_ENV,
          BRANCH_NAME: "claude/test-branch",
          // Point the server at a black hole so it cannot reach GitHub.
          GITHUB_API_URL: "http://127.0.0.1:1",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const send = (message: object) =>
        proc.stdin.write(`${JSON.stringify(message)}\n`);

      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "smoke-test", version: "1.0.0" },
        },
      });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "commit_files",
          arguments: { files: ["README.md"], message: "test" },
        },
      });
      await proc.stdin.flush();

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let callResult: any = null;
      const deadline = Date.now() + 20_000;

      while (Date.now() < deadline && !callResult) {
        const { value, done } = await reader.read();
        if (done) break;

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";

        for (const line of lines.filter(Boolean)) {
          const message = JSON.parse(line);
          if (message.id === 2) callResult = message;
        }
      }

      expect(callResult).not.toBeNull();
      expect(callResult.result.isError).toBe(true);
      expect(callResult.result.content[0].text).toStartWith("Error: ");
    } finally {
      proc.kill();
    }
  }, 30_000);
});
