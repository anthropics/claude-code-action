import type { Octokit } from "@octokit/rest";

type ActionsClient = Octokit["actions"];

export type WorkflowRunsParams = Parameters<
  ActionsClient["listWorkflowRunsForRepo"]
>[0];

export type WorkflowJobsParams = Parameters<
  ActionsClient["listJobsForWorkflowRun"]
>[0];

export function listWorkflowRuns(client: Octokit, params: WorkflowRunsParams) {
  return client.paginate(client.actions.listWorkflowRunsForRepo, params);
}

export function listWorkflowJobs(client: Octokit, params: WorkflowJobsParams) {
  return client.paginate(client.actions.listJobsForWorkflowRun, params);
}
