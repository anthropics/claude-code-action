#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { mkdir, writeFile } from "fs/promises";
import { Octokit } from "@octokit/rest";
import {
  listWorkflowJobs,
  listWorkflowRuns,
} from "./github-actions-pagination";

const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const PR_NUMBER = process.env.PR_NUMBER;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const RUNNER_TEMP = process.env.RUNNER_TEMP || "/tmp";

// Job logs are fetched by ID from GitHub-hosted storage; bound the request so a
// stalled fetch can't hang this MCP call forever. Mirrors the timeout added to
// fetchImage() in src/github/utils/image-downloader.ts (#1625).
const DOWNLOAD_JOB_LOG_TIMEOUT_MS = 30_000;

if (import.meta.main) {
  if (!REPO_OWNER || !REPO_NAME || !PR_NUMBER || !GITHUB_TOKEN) {
    console.error(
      "[GitHub CI Server] Error: REPO_OWNER, REPO_NAME, PR_NUMBER, and GITHUB_TOKEN environment variables are required",
    );
    process.exit(1);
  }
}

const server = new McpServer({
  name: "GitHub CI Server",
  version: "0.0.1",
});

console.error("[GitHub CI Server] MCP Server instance created");

server.tool(
  "get_ci_status",
  "Get CI status summary for this PR",
  {
    status: z
      .enum([
        "completed",
        "action_required",
        "cancelled",
        "failure",
        "neutral",
        "skipped",
        "stale",
        "success",
        "timed_out",
        "in_progress",
        "queued",
        "requested",
        "waiting",
        "pending",
      ])
      .optional()
      .describe("Filter workflow runs by status"),
  },
  async ({ status }) => {
    try {
      const client = new Octokit({
        auth: GITHUB_TOKEN,
        baseUrl: GITHUB_API_URL,
      });

      // Get the PR to find the head SHA
      const { data: prData } = await client.pulls.get({
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        pull_number: parseInt(PR_NUMBER!, 10),
      });
      const headSha = prData.head.sha;

      const runs = await listWorkflowRuns(client, {
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        head_sha: headSha,
        ...(status && { status }),
      });

      // Process runs to create summary
      const summary = {
        total_runs: runs.length,
        failed: 0,
        passed: 0,
        pending: 0,
      };

      const processedRuns = runs.map((run: any) => {
        // Update summary counts
        if (run.status === "completed") {
          if (run.conclusion === "success") {
            summary.passed++;
          } else if (run.conclusion === "failure") {
            summary.failed++;
          }
        } else {
          summary.pending++;
        }

        return {
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          html_url: run.html_url,
          created_at: run.created_at,
        };
      });

      const result = {
        summary,
        runs: processedRuns,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
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
  "get_workflow_run_details",
  "Get job and step details for a workflow run",
  {
    run_id: z.number().describe("The workflow run ID"),
  },
  async ({ run_id }) => {
    try {
      const client = new Octokit({
        auth: GITHUB_TOKEN,
        baseUrl: GITHUB_API_URL,
      });

      // Get jobs for this workflow run
      const jobs = await listWorkflowJobs(client, {
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        run_id,
      });

      const processedJobs = jobs.map((job: any) => {
        // Extract failed steps
        const failedSteps = (job.steps || [])
          .filter((step: any) => step.conclusion === "failure")
          .map((step: any) => ({
            name: step.name,
            number: step.number,
          }));

        return {
          id: job.id,
          name: job.name,
          conclusion: job.conclusion,
          html_url: job.html_url,
          failed_steps: failedSteps,
        };
      });

      const result = {
        jobs: processedJobs,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
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

export async function downloadJobLog(
  client: Octokit,
  params: { owner: string; repo: string; job_id: number },
  runnerTemp: string,
  timeoutMs: number = DOWNLOAD_JOB_LOG_TIMEOUT_MS,
): Promise<{ path: string; size_bytes: number }> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await client.actions.downloadJobLogsForWorkflowRun({
      owner: params.owner,
      repo: params.repo,
      job_id: params.job_id,
      request: { signal: controller.signal },
    });

    const logsText = response.data as unknown as string;

    const logsDir = `${runnerTemp}/github-ci-logs`;
    await mkdir(logsDir, { recursive: true });

    const logPath = `${logsDir}/job-${params.job_id}.log`;
    await writeFile(logPath, logsText, "utf-8");

    return {
      path: logPath,
      size_bytes: Buffer.byteLength(logsText, "utf-8"),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

server.tool(
  "download_job_log",
  "Download job logs to disk",
  {
    job_id: z.number().describe("The job ID"),
  },
  async ({ job_id }) => {
    try {
      const client = new Octokit({
        auth: GITHUB_TOKEN,
        baseUrl: GITHUB_API_URL,
      });

      const result = await downloadJobLog(
        client,
        { owner: REPO_OWNER!, repo: REPO_NAME!, job_id },
        RUNNER_TEMP,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
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

if (import.meta.main) {
  runServer().catch(() => {
    process.exit(1);
  });
}
