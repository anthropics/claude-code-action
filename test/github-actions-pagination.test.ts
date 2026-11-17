import { describe, expect, test } from "bun:test";
import { Octokit } from "@octokit/rest";
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

  test("follows every page of jobs for the requested attempt", async () => {
    const path = "/repos/owner/repo/actions/runs/123/attempts/1/jobs";
    const fixture = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== path) return new Response(null, { status: 404 });
        if (url.searchParams.get("page") === "2") {
          return Response.json({ total_count: 2, jobs: [{ id: 2 }] });
        }
        url.searchParams.set("page", "2");
        return Response.json(
          { total_count: 2, jobs: [{ id: 1 }] },
          { headers: { link: `<${url.href}>; rel="next"` } },
        );
      },
    });

    try {
      const client = new Octokit({ baseUrl: fixture.url.origin });
      const jobs = await listWorkflowJobs(client, {
        owner: "owner",
        repo: "repo",
        run_id: 123,
        attempt_number: 1,
      });
      expect(jobs.map((job) => job.id)).toEqual([1, 2]);
    } finally {
      await fixture.stop(true);
    }
  });
});
