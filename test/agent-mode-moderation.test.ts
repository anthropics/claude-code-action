import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const writer = { login: "writer", type: "User" };
const outsider = { login: "outsider", type: "User" };
const repository = { id: 1, name: "r", owner: { login: "o" } };
const issue = { number: 7, user: outsider };

// The directory is not a git repository, so a run that starts fails later on.
async function runWithPrompt(eventName: string, event: object) {
  const dir = mkdtempSync(join(tmpdir(), "moderation-"));
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) =>
      request.url.endsWith("/permission")
        ? Response.json({ permission: "write" })
        : Response.json({}, { status: 404 }),
  });
  try {
    for (const file of ["output", "env"]) writeFileSync(join(dir, file), "");
    writeFileSync(join(dir, "event.json"), JSON.stringify(event));
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
          GITHUB_EVENT_NAME: eventName,
          GITHUB_EVENT_PATH: join(dir, "event.json"),
          GITHUB_REPOSITORY: "o/r",
          GITHUB_ACTOR: "writer",
          GITHUB_RUN_ID: "1",
          GITHUB_OUTPUT: join(dir, "output"),
          GITHUB_ENV: join(dir, "env"),
          GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
          OVERRIDE_GITHUB_TOKEN: "t",
          ALLOW_FORK_PRS: "true",
          PROMPT: "Respond to this",
        },
      },
    );
    const log = await new Response(child.stdout).text();
    await child.exited;
    return log;
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

const SKIPPED = "No trigger found, skipping remaining steps";
const STARTED = "Preparing with mode: agent";

test("a prompt doesn't run when a maintainer edits or deletes someone else's comment", async () => {
  for (const action of ["edited", "deleted"]) {
    const log = await runWithPrompt("issue_comment", {
      action,
      repository,
      sender: writer,
      issue,
      comment: { id: 1, body: "x", user: outsider },
    });
    expect(log).toContain(SKIPPED);
    expect(log).not.toContain(STARTED);
  }
});

test("a prompt runs on a new comment, and on events that have none", async () => {
  const events: [string, object][] = [
    [
      "issue_comment",
      { action: "created", issue, comment: { id: 1, body: "x", user: writer } },
    ],
    // With a prompt, label_trigger doesn't limit which label starts a run.
    ["issues", { action: "labeled", issue, label: { name: "triage" } }],
  ];
  for (const [eventName, event] of events) {
    const log = await runWithPrompt(eventName, {
      repository,
      sender: writer,
      ...event,
    });
    expect(log).toContain(STARTED);
  }
});
