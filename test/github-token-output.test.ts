import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TOKEN = "test-app-token-2111";
const writer = { login: "writer", type: "User" };
const repository = { id: 1, name: "r", owner: { login: "o" } };
const issue = { number: 7, user: writer };

// All github_token values written to a $GITHUB_OUTPUT file, in order.
// @actions/core writes them in the heredoc key-value format.
function tokenOutputs(outputFile: string): string[] {
  let content = "";
  try {
    content = readFileSync(outputFile, "utf-8");
  } catch {
    return [];
  }
  const values: string[] = [];
  const pattern = /github_token<<ghadelimiter_[^\n]*\n([^\n]*)\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1] !== undefined) values.push(match[1]);
  }
  return values;
}

type SpawnedRun = {
  outputFile: string;
  kill: (signal: "SIGKILL") => void;
  exited: Promise<number>;
  log: () => Promise<string>;
};

// Starts the real entrypoint the way action.yml does, against a local fake
// GitHub API. `hangPermissionCheck` leaves the collaborator-permission
// request — the first API call after the token is set up — unanswered, so
// the process stays alive mid-run with its finally block unreached, like a
// run whose cancellation left Bun orphaned (#2111).
function startRun(hangPermissionCheck: boolean): {
  dir: string;
  server: ReturnType<typeof Bun.serve>;
  run: SpawnedRun;
} {
  const dir = mkdtempSync(join(tmpdir(), "token-output-"));
  const outputFile = join(dir, "output");
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      if (request.url.endsWith("/permission")) {
        if (hangPermissionCheck) return new Promise<Response>(() => {});
        return Response.json({ permission: "write" });
      }
      return Response.json({}, { status: 404 });
    },
  });
  for (const file of ["output", "env"]) writeFileSync(join(dir, file), "");
  writeFileSync(
    join(dir, "event.json"),
    JSON.stringify({
      action: "created",
      repository,
      sender: writer,
      issue,
      comment: { id: 1, body: "x", user: writer },
    }),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      join(import.meta.dir, "../src/entrypoints/run.ts"),
    ],
    {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        RUNNER_TEMP: dir,
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_EVENT_PATH: join(dir, "event.json"),
        GITHUB_REPOSITORY: "o/r",
        GITHUB_ACTOR: "writer",
        GITHUB_RUN_ID: "1",
        GITHUB_OUTPUT: outputFile,
        GITHUB_ENV: join(dir, "env"),
        GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
        OVERRIDE_GITHUB_TOKEN: TOKEN,
        ALLOW_FORK_PRS: "true",
        PROMPT: "Respond to this",
      },
    },
  );
  return {
    dir,
    server,
    run: {
      outputFile,
      kill: (signal) => child.kill(signal),
      exited: child.exited,
      log: async () => await new Response(child.stdout).text(),
    },
  };
}

async function waitForTokenOutput(
  outputFile: string,
  timeoutMs: number,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let values = tokenOutputs(outputFile);
  while (values.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    values = tokenOutputs(outputFile);
  }
  return values;
}

test("github_token output is written as soon as the token is set up, before the run can be interrupted", async () => {
  const { dir, server, run } = startRun(true);
  try {
    // The process is stuck after token setup and can never reach its
    // finally block. The output must already be on disk.
    const values = await waitForTokenOutput(run.outputFile, 10_000);
    expect(values).toEqual([TOKEN]);

    // Kill it the hard way, like the runner's orphan cleanup does: no
    // finally, no second chance to write outputs. The value written at
    // setup time is the one the "Revoke app token" step would read.
    run.kill("SIGKILL");
    await run.exited;
    expect(tokenOutputs(run.outputFile)).toEqual([TOKEN]);
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

test("a run that completes still ends with the minted token as the github_token output", async () => {
  const { dir, server, run } = startRun(false);
  try {
    await run.exited;
    // The directory is not a git repository, so the run fails during
    // prepare and unwinds through its finally block. The token output
    // must be present, and the finally block's write must leave the
    // minted token as the last value.
    const values = tokenOutputs(run.outputFile);
    expect(values.length).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBe(TOKEN);
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
