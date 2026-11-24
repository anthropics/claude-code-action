import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { GitHubContext, ParsedGitHubContext } from "../src/github/context";
import { setupBranch } from "../src/github/operations/branch";
import {
  isCommentOnRefusedForkPr,
  isRefusedForkEvent,
} from "../src/github/validation/fork-pr";
import {
  createMockAutomationContext,
  mockIssueCommentContext,
  mockIssueOpenedContext,
  mockPullRequestCommentContext,
  mockPullRequestOpenedContext,
  mockPullRequestReviewCommentContext,
  mockPullRequestReviewContext,
} from "./mockContext";

const BASE = { id: 1 };
const FORK = { id: 2 };
type Head = { id: number } | null;

function octokitWith(reply: () => unknown) {
  const calls: unknown[] = [];
  const octokit = {
    pulls: {
      get: async (params: unknown) => {
        calls.push(params);
        return { data: reply() };
      },
    },
  } as any;
  return { octokit, calls };
}

const pullRequest = (head: Head) => ({
  head: { repo: head },
  base: { repo: BASE },
});

const withHead = (
  context: ParsedGitHubContext,
  head: Head,
): ParsedGitHubContext => {
  const payload = context.payload as any;
  return {
    ...context,
    payload: {
      ...payload,
      pull_request: { ...payload.pull_request, ...pullRequest(head) },
    },
  };
};

const workflowRun = (head: Head | undefined): GitHubContext =>
  createMockAutomationContext({
    eventName: "workflow_run",
    payload: {
      workflow_run: { head_repository: head },
      repository: BASE,
    } as any,
  });

// What run.ts asks, in its order.
const isRefusedForkPr = async (octokit: any, context: GitHubContext) =>
  isRefusedForkEvent(context) || isCommentOnRefusedForkPr(octokit, context);

describe("allow_fork_prs", () => {
  const saved = process.env.ALLOW_FORK_PRS;
  const { octokit: unused, calls: unusedCalls } = octokitWith(() => {
    throw new Error("unexpected call");
  });

  beforeEach(() => {
    process.env.ALLOW_FORK_PRS = "false";
    unusedCalls.length = 0;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_FORK_PRS;
    else process.env.ALLOW_FORK_PRS = saved;
  });

  const fork = withHead(mockPullRequestOpenedContext, FORK);

  test.each(["true", "TRUE", " true "])(
    "allows forks when set to %p",
    async (value) => {
      process.env.ALLOW_FORK_PRS = value;
      expect(await isRefusedForkPr(unused, fork)).toBe(false);
      expect(await isRefusedForkPr(unused, mockPullRequestCommentContext)).toBe(
        false,
      );
      expect(await isRefusedForkPr(unused, workflowRun(FORK))).toBe(false);
    },
  );

  test("refuses forks when the input isn't passed", async () => {
    delete process.env.ALLOW_FORK_PRS;
    expect(await isRefusedForkPr(unused, fork)).toBe(true);
  });

  test.each(["false", "False", "", "no", "flase", "0"])(
    "refuses forks when set to %p",
    async (value) => {
      process.env.ALLOW_FORK_PRS = value;
      expect(await isRefusedForkPr(unused, fork)).toBe(true);
    },
  );

  test.each([
    ["pull_request", mockPullRequestOpenedContext],
    ["pull_request_review", mockPullRequestReviewContext],
    ["pull_request_review_comment", mockPullRequestReviewCommentContext],
  ])("%s: reads the head from the event", async (_event, context) => {
    const refused = (head: Head) =>
      isRefusedForkPr(unused, withHead(context, head));
    expect(await refused(FORK)).toBe(true);
    expect(await refused(null)).toBe(true);
    expect(await refused(BASE)).toBe(false);
  });

  test.each([
    [FORK, true],
    [null, true],
    [BASE, false],
  ])("comment on a pull request with head %p: %p", async (head, expected) => {
    const { octokit, calls } = octokitWith(() => pullRequest(head));
    expect(await isRefusedForkPr(octokit, mockPullRequestCommentContext)).toBe(
      expected,
    );
    expect(calls).toEqual([
      {
        owner: mockPullRequestCommentContext.repository.owner,
        repo: mockPullRequestCommentContext.repository.repo,
        pull_number: mockPullRequestCommentContext.entityNumber,
      },
    ]);
  });

  test("a comment fails when the pull request can't be read", async () => {
    const { octokit, calls } = octokitWith(() => {
      throw Object.assign(new Error("secret"), { status: 404 });
    });
    const refused = isRefusedForkPr(octokit, mockPullRequestCommentContext);
    await expect(refused).rejects.toThrow("is from a fork (HTTP 404)");
    expect(calls.length).toBe(1);
  });

  test.each([
    [FORK, true],
    [null, true],
    [undefined, true],
    [BASE, false],
  ])("workflow_run of head %p: %p", async (head, expected) => {
    expect(await isRefusedForkPr(unused, workflowRun(head))).toBe(expected);
  });

  test("issues and other events are not affected", async () => {
    for (const context of [
      mockIssueOpenedContext,
      mockIssueCommentContext,
      createMockAutomationContext({ eventName: "workflow_dispatch" }),
      createMockAutomationContext({ eventName: "schedule" }),
    ]) {
      expect(await isRefusedForkPr(unused, context)).toBe(false);
    }
    expect(unusedCalls).toEqual([]);
  });
});

test("setupBranch refuses a fork when allow_fork_prs is off", async () => {
  const saved = process.env.ALLOW_FORK_PRS;
  process.env.ALLOW_FORK_PRS = "false";
  try {
    const data = { contextData: { state: "OPEN", isCrossRepository: true } };
    await expect(
      (setupBranch as any)({}, data, mockPullRequestCommentContext),
    ).rejects.toThrow("is from a fork");
  } finally {
    if (saved === undefined) delete process.env.ALLOW_FORK_PRS;
    else process.env.ALLOW_FORK_PRS = saved;
  }
});

describe("run.ts with allow_fork_prs off, the default", () => {
  // Returns the exit code, the output and the requests made. The directory is not a
  // git repository, so a run that goes on to check something out fails.
  async function run(
    eventName: string,
    event: object,
    pull?: object,
    env: Record<string, string> = {},
  ) {
    const dir = mkdtempSync(join(tmpdir(), "fork-pr-"));
    const requests: string[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        const { pathname } = new URL(request.url);
        requests.push(pathname);
        if (pathname.startsWith("/users/")) {
          const type = pathname.includes("bot") ? "Bot" : "User";
          return Response.json({ type });
        }
        if (pathname.endsWith("/permission")) {
          const writer = pathname.includes("/writer/");
          return Response.json({ permission: writer ? "write" : "read" });
        }
        return pull && pathname.endsWith("/pulls/7")
          ? Response.json(pull)
          : Response.json({}, { status: 404 });
      },
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
            TRIGGER_PHRASE: "@claude",
            // With no token, a run that asks for one fails.
            ...(pull && { OVERRIDE_GITHUB_TOKEN: "t" }),
            ...env,
          },
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { exitCode, log: stdout + stderr, requests };
    } finally {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const repository = { id: 1, name: "r", owner: { login: "o" } };
  const sender = { login: "writer", type: "User" };

  test("skips a fork's event before it asks for a token", async () => {
    const result = await run("pull_request_review", {
      action: "submitted",
      repository,
      sender,
      review: { id: 1, body: "@claude", user: sender },
      pull_request: { number: 7, ...pullRequest(FORK) },
    });
    expect(result.log).toContain("Skipped, because allow_fork_prs");
    expect(result.exitCode).toBe(0);
    expect(result.requests).toEqual([]);
  });

  test("skips a comment on a fork's pull request before it does anything else", async () => {
    const result = await run(
      "issue_comment",
      {
        action: "created",
        repository,
        sender,
        issue: { number: 7, pull_request: {}, user: { login: "outsider" } },
        comment: { id: 1, body: "@claude", user: sender },
      },
      pullRequest(FORK),
    );
    expect(result.log).toContain("Skipped, because allow_fork_prs");
    expect(result.exitCode).toBe(0);
    expect(result.requests).toEqual([
      "/repos/o/r/collaborators/writer/permission",
      "/repos/o/r/pulls/7",
      "/users/writer",
    ]);
  });

  test.each([
    ["writer", "pull_request_target", 0],
    ["outsider", "pull_request_target", 1],
    ["writer", "workflow_run", 0],
    ["outsider", "workflow_run", 1],
  ])("%s's fork on %s exits %p", async (login, eventName, exitCode) => {
    const actor = { login, type: "User" };
    const head = { ...FORK, full_name: `${login}/r` };
    const event =
      eventName === "workflow_run"
        ? {
            action: "completed",
            repository: { ...repository, full_name: "o/r" },
            sender: actor,
            workflow_run: { id: 1, actor, head_repository: head },
          }
        : {
            action: "opened",
            repository,
            sender: actor,
            pull_request: { number: 7, user: actor, ...pullRequest(FORK) },
          };
    const env = { GITHUB_ACTOR: login, PROMPT: "Review this" };
    const result = await run(eventName, event, pullRequest(FORK), env);
    expect(result.exitCode).toBe(exitCode);
    expect(result.log).toContain(
      exitCode
        ? "Actor does not have write permissions"
        : "Skipped, because allow_fork_prs",
    );
  });

  test("a bot's action on an outsider's fork still fails", async () => {
    const bot = { login: "helper[bot]", type: "Bot" };
    const result = await run(
      "pull_request_target",
      {
        action: "synchronize",
        repository,
        sender: bot,
        pull_request: {
          number: 7,
          user: { login: "outsider" },
          ...pullRequest(FORK),
        },
      },
      pullRequest(FORK),
      { GITHUB_ACTOR: bot.login, ALLOWED_BOTS: "*", PROMPT: "Review this" },
    );
    expect(result.exitCode).toBe(1);
    expect(result.log).toContain("A bot acted on this pull request");
  });

  test.each([
    ["writer", "t", "", 0],
    ["outsider", "t", "", 1],
    ["outsider", "", "", 0],
    ["outsider", "", "key", 1],
  ])(
    "%s's fork in a private repository with token %p and key %p exits %p",
    async (login, token, key, exitCode) => {
      const actor = { login, type: "User" };
      const result = await run(
        "pull_request",
        {
          action: "opened",
          repository: { ...repository, private: true },
          sender: actor,
          pull_request: { number: 7, user: actor, ...pullRequest(FORK) },
        },
        pullRequest(FORK),
        {
          GITHUB_ACTOR: login,
          PROMPT: "Review",
          OVERRIDE_GITHUB_TOKEN: token,
          ANTHROPIC_API_KEY: key,
        },
      );
      expect(result.exitCode).toBe(exitCode);
    },
    30_000, // without a token, the action retries before it fails
  );

  test.each([
    ["", 1],
    ["helper", 0],
  ])(
    "a bot's own fork with allowed_bots %p exits %p",
    async (bots, exitCode) => {
      const bot = { login: "helper[bot]", type: "Bot" };
      const result = await run(
        "pull_request_target",
        {
          action: "opened",
          repository,
          sender: bot,
          pull_request: { number: 7, user: bot, ...pullRequest(FORK) },
        },
        pullRequest(FORK),
        { GITHUB_ACTOR: bot.login, ALLOWED_BOTS: bots, PROMPT: "Review" },
      );
      expect(result.exitCode).toBe(exitCode);
      if (exitCode) expect(result.log).toContain("non-human actor");
    },
  );

  test("goes on with a comment on a pull request in this repository", async () => {
    const result = await run(
      "issue_comment",
      {
        action: "created",
        repository,
        sender,
        issue: { number: 7, pull_request: {}, user: { login: "outsider" } },
        comment: { id: 1, body: "@claude", user: sender },
      },
      pullRequest(BASE),
    );
    expect(result.log).not.toContain("Skipped, because allow_fork_prs");
    expect(result.requests.length).toBeGreaterThan(2);
  });
});
