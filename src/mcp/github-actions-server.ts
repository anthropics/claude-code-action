#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { mkdir, writeFile } from "fs/promises";
import { Octokit } from "@octokit/rest";

const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const PR_NUMBER = process.env.PR_NUMBER;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const RUNNER_TEMP = process.env.RUNNER_TEMP || "/tmp";

if (!REPO_OWNER || !REPO_NAME || !PR_NUMBER || !GITHUB_TOKEN) {
  console.error(
    "[GitHub CI Server] Error: REPO_OWNER, REPO_NAME, PR_NUMBER, and GITHUB_TOKEN environment variables are required",
  );
  process.exit(1);
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

      const { data: runsData } = await client.actions.listWorkflowRunsForRepo({
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        head_sha: headSha,
        ...(status && { status }),
      });

      // Process runs to create summary
      const runs = runsData.workflow_runs || [];
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
      const { data: jobsData } = await client.actions.listJobsForWorkflowRun({
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        run_id,
      });

      const processedJobs = jobsData.jobs.map((job: any) => {
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

      const response = await client.actions.downloadJobLogsForWorkflowRun({
        owner: REPO_OWNER!,
        repo: REPO_NAME!,
        job_id,
      });

      const logsText = response.data as unknown as string;

      const logsDir = `${RUNNER_TEMP}/github-ci-logs`;
      await mkdir(logsDir, { recursive: true });

      const logPath = `${logsDir}/job-${job_id}.log`;
      await writeFile(logPath, logsText, "utf-8");

      const result = {
        path: logPath,
        size_bytes: Buffer.byteLength(logsText, "utf-8"),
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
