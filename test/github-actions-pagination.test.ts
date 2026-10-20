import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/rest";
import {
  listWorkflowJobs,
  listWorkflowRuns,
} from "../src/mcp/github-actions-pagination";

function createPaginatedClient<T>(pages: T[][]) {
  const request = async () => ({ data: pages[0] });
  const client = {
    actions: {
      listWorkflowRunsForRepo: request,
      listJobsForWorkflowRun: request,
    },
    paginate: async () => pages.flat(),
  } as unknown as Octokit;

  return client;
}

describe("GitHub Actions pagination", () => {
  test("returns workflow runs from every page", async () => {
    const firstPage = [{ id: 1 }, { id: 2 }];
    const secondPage = [{ id: 3 }];
    const client = createPaginatedClient([firstPage, secondPage]);

    const runs = await listWorkflowRuns(client, {
      owner: "owner",
      repo: "repo",
      head_sha: "sha",
    });

    expect(runs.map((run) => run.id)).toEqual([1, 2, 3]);
  });

  test("returns workflow jobs from every page", async () => {
    const firstPage = [{ id: 1 }, { id: 2 }];
    const secondPage = [{ id: 3 }];
    const client = createPaginatedClient([firstPage, secondPage]);

    const jobs = await listWorkflowJobs(client, {
      owner: "owner",
      repo: "repo",
      run_id: 123,
    });

    expect(jobs.map((job) => job.id)).toEqual([1, 2, 3]);
  });
});
