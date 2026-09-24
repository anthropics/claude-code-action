import { describe, test, expect, afterEach } from "bun:test";
import { readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { Octokit } from "@octokit/rest";
import { downloadJobLog } from "../src/mcp/github-actions-server";

const JOB = { owner: "owner", repo: "repo", job_id: 123 };
const IDLE_TIMEOUT_MS = 250;

describe("downloadJobLog", () => {
  const tmpDirs: string[] = [];
  const servers: ReturnType<typeof Bun.serve>[] = [];

  const makeRunnerTemp = () => {
    const dir = path.join(
      os.tmpdir(),
      `download-job-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tmpDirs.push(dir);
    return dir;
  };

  // A real Octokit client against a local server, so each case goes through
  // Octokit's own fetch and body handling.
  const serve = (
    handler: (req: Request) => Response | Promise<Response>,
  ): Octokit => {
    const server = Bun.serve({ port: 0, fetch: handler });
    servers.push(server);
    return new Octokit({ baseUrl: server.url.origin });
  };

  // Sends each chunk after pauseMs, then ends the body or leaves it open.
  const logResponse = (
    chunks: string[],
    pauseMs: number,
    { stall = false } = {},
  ) =>
    new Response(
      new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            await Bun.sleep(pauseMs);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          if (!stall) controller.close();
        },
      }),
      { headers: { "content-type": "text/plain" } },
    );

  afterEach(async () => {
    while (servers.length) {
      servers.pop()!.stop(true);
    }
    while (tmpDirs.length) {
      const dir = tmpDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("writes the log to disk when the download succeeds", async () => {
    const client = serve(() =>
      logResponse(["log line 1\n", "log line 2\n"], 0),
    );
    const runnerTemp = makeRunnerTemp();

    const result = await downloadJobLog(client, JOB, runnerTemp);

    expect(result.path).toBe(`${runnerTemp}/github-ci-logs/job-123.log`);
    expect(result.size_bytes).toBe(
      Buffer.byteLength("log line 1\nlog line 2\n", "utf-8"),
    );
    expect(await readFile(result.path, "utf-8")).toBe(
      "log line 1\nlog line 2\n",
    );
  });

  test("rejects when no response arrives within the idle timeout", async () => {
    const client = serve(() => new Promise<Response>(() => {}));

    await expect(
      downloadJobLog(client, JOB, makeRunnerTemp(), IDLE_TIMEOUT_MS),
    ).rejects.toThrow("timed out");
  });

  test("rejects instead of writing an empty log when the body stalls", async () => {
    const client = serve(() =>
      logResponse(["log line 1\n"], 0, { stall: true }),
    );
    const runnerTemp = makeRunnerTemp();

    await expect(
      downloadJobLog(client, JOB, runnerTemp, IDLE_TIMEOUT_MS),
    ).rejects.toThrow("timed out");
    expect(
      await Bun.file(`${runnerTemp}/github-ci-logs/job-123.log`).exists(),
    ).toBe(false);
  });

  test("rejects when the redirected log download stalls", async () => {
    // GitHub answers with a 302 to blob storage, which serves the log body.
    const client = serve((req) =>
      new URL(req.url).pathname === "/blob"
        ? logResponse(["log line 1\n"], 0, { stall: true })
        : Response.redirect(new URL("/blob", req.url).toString(), 302),
    );

    await expect(
      downloadJobLog(client, JOB, makeRunnerTemp(), IDLE_TIMEOUT_MS),
    ).rejects.toThrow("timed out");
  });

  test("completes a slow download that keeps receiving data", async () => {
    // 20 chunks 25 ms apart: about twice the idle timeout in total, but never
    // idle for longer than a tenth of it.
    const lines = Array.from({ length: 20 }, (_, i) => `log line ${i}\n`);
    const client = serve(() => logResponse(lines, 25));

    const result = await downloadJobLog(
      client,
      JOB,
      makeRunnerTemp(),
      IDLE_TIMEOUT_MS,
    );

    expect(await readFile(result.path, "utf-8")).toBe(lines.join(""));
  });

  test("rejects a download that trickles in past the total timeout", async () => {
    // One byte every 25 ms, forever: never idle, never finished.
    const client = serve(
      () =>
        new Response(
          new ReadableStream({
            async pull(controller) {
              await Bun.sleep(25);
              controller.enqueue(new TextEncoder().encode("x"));
            },
          }),
          { headers: { "content-type": "text/plain" } },
        ),
    );

    await expect(
      downloadJobLog(
        client,
        JOB,
        makeRunnerTemp(),
        IDLE_TIMEOUT_MS,
        2 * IDLE_TIMEOUT_MS,
      ),
    ).rejects.toThrow("before it finished");
  });
});
