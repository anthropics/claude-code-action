#!/usr/bin/env node
//
// GitHub CI MCP Server - read-only access to this PR's workflow runs and logs.
//
// The tool handlers are exported so they can be tested directly. The stdio
// bootstrap only runs when this file is the process entrypoint — importing it
// must never start a server or exit the process.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GITHUB_API_URL } from "../github/api/config";
import { mkdir, writeFile } from "fs/promises";
import { Octokit } from "@octokit/rest";
import { toolError, toolSuccess, type ToolResult } from "./tool-result";

export type CiContext = {
  owner: string;
  repo: string;
  pullNumber: number;
  githubToken: string;
  runnerTemp: string;
};

export const MISSING_ENV_MESSAGE =
  "[GitHub CI Server] Error: REPO_OWNER, REPO_NAME, PR_NUMBER, and GITHUB_TOKEN environment variables are required";

export function readCiContext(env: NodeJS.ProcessEnv = process.env): CiContext {
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;
  const prNumber = env.PR_NUMBER;
  const githubToken = env.GITHUB_TOKEN;

  if (!owner || !repo || !prNumber || !githubToken) {
    throw new Error(MISSING_ENV_MESSAGE);
  }

  return {
    owner,
    repo,
    pullNumber: parseInt(prNumber, 10),
    githubToken,
    runnerTemp: env.RUNNER_TEMP || "/tmp",
  };
}

function createClient(context: CiContext): Octokit {
  return new Octokit({
    auth: context.githubToken,
    baseUrl: GITHUB_API_URL,
  });
}

/** CI status summary for the PR's head commit. */
export async function getCiStatus(
  { status }: { status?: string },
  context: CiContext,
  client: Octokit = createClient(context),
): Promise<ToolResult> {
  const { owner, repo, pullNumber } = context;

  // Get the PR to find the head SHA
  const { data: prData } = await client.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  const headSha = prData.head.sha;

  const { data: runsData } = await client.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: headSha,
    ...(status && { status: status as never }),
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

  return toolSuccess({
    summary,
    runs: processedRuns,
  });
}

/** Job and step details for a workflow run, with failed steps called out. */
export async function getWorkflowRunDetails(
  { run_id }: { run_id: number },
  context: CiContext,
  client: Octokit = createClient(context),
): Promise<ToolResult> {
  const { owner, repo } = context;

  // Get jobs for this workflow run
  const { data: jobsData } = await client.actions.listJobsForWorkflowRun({
    owner,
    repo,
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

  return toolSuccess({ jobs: processedJobs });
}

/** Writes a job's logs under RUNNER_TEMP and returns the path. */
export async function downloadJobLog(
  { job_id }: { job_id: number },
  context: CiContext,
  client: Octokit = createClient(context),
): Promise<ToolResult> {
  const { owner, repo, runnerTemp } = context;

  const response = await client.actions.downloadJobLogsForWorkflowRun({
    owner,
    repo,
    job_id,
  });

  const logsText = response.data as unknown as string;

  const logsDir = `${runnerTemp}/github-ci-logs`;
  await mkdir(logsDir, { recursive: true });

  const logPath = `${logsDir}/job-${job_id}.log`;
  await writeFile(logPath, logsText, "utf-8");

  return toolSuccess({
    path: logPath,
    size_bytes: Buffer.byteLength(logsText, "utf-8"),
  });
}

export function createCiServer(): McpServer {
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
        return await getCiStatus({ status }, readCiContext());
      } catch (error) {
        return toolError(error);
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
        return await getWorkflowRunDetails({ run_id }, readCiContext());
      } catch (error) {
        return toolError(error);
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
        return await downloadJobLog({ job_id }, readCiContext());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

async function runServer() {
  // Fail fast on a misconfigured environment, exactly as this server did when
  // the check ran at module scope.
  try {
    readCiContext();
  } catch {
    console.error(MISSING_ENV_MESSAGE);
    process.exit(1);
  }

  const server = createCiServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.on("exit", () => {
    server.close();
  });
}

if (import.meta.main) {
  runServer().catch(() => {
    process.exit(1);
  });
}
