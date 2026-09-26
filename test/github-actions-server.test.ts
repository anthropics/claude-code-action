import { describe, test, expect, afterEach } from "bun:test";
import { readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { downloadJobLog } from "../src/mcp/github-actions-server";
import type { Octokit } from "@octokit/rest";

describe("downloadJobLog", () => {
  const tmpDirs: string[] = [];

  const makeRunnerTemp = () => {
    const dir = path.join(
      os.tmpdir(),
      `download-job-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    while (tmpDirs.length) {
      const dir = tmpDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
  });

  const createStallingClient = (): {
    client: Octokit;
    getSignal: () => AbortSignal | undefined;
  } => {
    let signal: AbortSignal | undefined;
    const client = {
      actions: {
        downloadJobLogsForWorkflowRun: (params: {
          request?: { signal?: AbortSignal };
        }) => {
          signal = params.request?.signal;
          return new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              reject(new Error("This operation was aborted"));
            });
            // Otherwise never settles, simulating a stalled fetch.
          });
        },
      },
    } as unknown as Octokit;
    return { client, getSignal: () => signal };
  };

  test("rejects with a timeout instead of hanging when the download stalls", async () => {
    const { client, getSignal } = createStallingClient();
    const runnerTemp = makeRunnerTemp();

    await expect(
      downloadJobLog(
        client,
        { owner: "owner", repo: "repo", job_id: 123 },
        runnerTemp,
        5,
      ),
    ).rejects.toThrow();

    expect(getSignal()?.aborted).toBe(true);
  });

  test("writes the log to disk and clears the timeout when the download succeeds", async () => {
    const runnerTemp = makeRunnerTemp();
    const client = {
      actions: {
        downloadJobLogsForWorkflowRun: async (params: {
          request?: { signal?: AbortSignal };
        }) => {
          expect(params.request?.signal?.aborted).toBe(false);
          return { data: "log line 1\nlog line 2\n" };
        },
      },
    } as unknown as Octokit;

    const result = await downloadJobLog(
      client,
      { owner: "owner", repo: "repo", job_id: 456 },
      runnerTemp,
      30_000,
    );

    expect(result.path).toBe(`${runnerTemp}/github-ci-logs/job-456.log`);
    expect(result.size_bytes).toBe(
      Buffer.byteLength("log line 1\nlog line 2\n", "utf-8"),
    );

    const written = await readFile(result.path, "utf-8");
    expect(written).toBe("log line 1\nlog line 2\n");
  });
});
