import { describe, expect, test, afterAll } from "bun:test";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * get_ci_status summarises the PR's workflow runs as counts. Drives the real
 * server over stdio against a loopback stand-in for the GitHub REST API, so
 * the tool handler itself is exercised.
 */

const HEAD_SHA = "0123456789abcdef0123456789abcdef01234567";

function run(id: number, status: string, conclusion: string | null) {
  return {
    id,
    name: `workflow-${id}`,
    status,
    conclusion,
    html_url: `https://example.invalid/runs/${id}`,
    created_at: "2026-01-01T00:00:00Z",
    head_sha: HEAD_SHA,
  };
}

const workflowRuns = [
  run(1, "completed", "success"),
  run(2, "completed", "timed_out"),
  run(3, "completed", "cancelled"),
  run(4, "completed", "skipped"),
  run(5, "completed", "action_required"),
  run(6, "in_progress", null),
];

const api = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/repos/o/r/pulls/7") {
      return Response.json({ number: 7, head: { sha: HEAD_SHA } });
    }
    if (url.pathname === "/repos/o/r/actions/runs") {
      return Response.json({
        total_count: workflowRuns.length,
        workflow_runs: workflowRuns,
      });
    }
    return new Response(`unexpected ${req.method} ${url.pathname}`, {
      status: 500,
    });
  },
});

afterAll(() => {
  api.stop(true);
});

describe("get_ci_status summary", () => {
  test("counts every completed run once, in the right bucket", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(import.meta.dir, "../src/mcp/github-actions-server.ts")],
      env: {
        ...process.env,
        REPO_OWNER: "o",
        REPO_NAME: "r",
        PR_NUMBER: "7",
        GITHUB_TOKEN: "test-token",
        GITHUB_API_URL: `http://127.0.0.1:${api.port}`,
      },
      stderr: "ignore",
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);

    try {
      const result = (await client.callTool({
        name: "get_ci_status",
        arguments: {},
      })) as { content: { type: string; text: string }[] };
      const parsed = JSON.parse(result.content[0]!.text);

      expect(parsed.summary).toEqual({
        total_runs: 6,
        failed: 2, // timed_out, cancelled
        passed: 1,
        skipped: 1,
        pending: 2, // action_required (awaiting approval), in_progress
      });
      const { total_runs, ...buckets } = parsed.summary;
      const counted = Object.values(buckets as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      expect(counted).toBe(total_runs);
      expect(parsed.runs).toHaveLength(6);
    } finally {
      await client.close();
    }
  }, 20_000);
});
