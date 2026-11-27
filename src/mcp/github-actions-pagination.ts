import type { Octokit } from "@octokit/rest";

type ActionsClient = Octokit["actions"];

export type WorkflowRunsParams = Parameters<
  ActionsClient["listWorkflowRunsForRepo"]
>[0];

export type WorkflowJobsParams = Parameters<
  ActionsClient["listJobsForWorkflowRun"]
>[0] & { attempt_number?: number };

export function listWorkflowRuns(client: Octokit, params: WorkflowRunsParams) {
  return client.paginate(client.actions.listWorkflowRunsForRepo, params);
}

export function listWorkflowJobs(
  client: Octokit,
  { attempt_number, ...params }: WorkflowJobsParams,
) {
  if (attempt_number !== undefined) {
    return client.paginate(client.actions.listJobsForWorkflowRunAttempt, {
      ...params,
      attempt_number,
    });
  }
  return client.paginate(client.actions.listJobsForWorkflowRun, params);
}
