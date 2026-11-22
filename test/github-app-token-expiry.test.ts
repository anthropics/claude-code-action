import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

async function runWithInstallationToken({
  minutes,
  override,
  renewalResponse = "issue",
  branch,
  rotateInSession = false,
  scrub = false,
  recordFailedPush = false,
}: {
  minutes: number;
  override?: string;
  renewalResponse?: "issue" | "deny" | "reuse";
  branch?: string;
  rotateInSession?: boolean;
  scrub?: boolean;
  recordFailedPush?: boolean;
}) {
  const dir = await mkdtemp(join(tmpdir(), "claude-app-token-expiry-"));
  try {
    const eventPath = join(dir, "event.json");
    const outputPath = join(dir, "output");
    const promptPath = join(dir, "prompt.txt");
    const summaryPath = join(dir, "summary");
    const workspace = join(dir, "workspace");
    const actionPath = join(dir, "action");
    await mkdir(workspace);
    await mkdir(join(actionPath, "scripts"), { recursive: true });
    if (recordFailedPush) {
      for (const args of [
        ["init", "-b", "claude-issue-7"],
        [
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.test",
          "commit",
          "--allow-empty",
          "-m",
          "Base",
        ],
        [
          "remote",
          "add",
          "origin",
          "https://x-access-token@github.com/test-owner/test-repo.git",
        ],
      ]) {
        const result = Bun.spawnSync(["git", ...args], { cwd: workspace });
        if (!result.success) throw new Error(result.stderr.toString());
      }
    }
    await writeFile(
      eventPath,
      JSON.stringify({
        action: "created",
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
          default_branch: "main",
        },
        issue: { number: 7 },
        comment: {
          id: 1,
          body: "@claude help with this issue",
          user: { login: "contributor" },
        },
      }),
    );
    await writeFile(outputPath, "");
    await writeFile(promptPath, "Help with this issue");
    await writeFile(summaryPath, "");

    const child = Bun.spawn(
      [
        process.execPath,
        "run",
        "--no-env-file",
        "--preload",
        join(import.meta.dir, "fixtures/github-app-token-expiry.ts"),
        join(import.meta.dir, "../src/entrypoints/run.ts"),
      ],
      {
        cwd: workspace,
        env: {
          PATH: process.env.PATH,
          GIT_CONFIG_GLOBAL: join(dir, "gitconfig"),
          GITHUB_ACTOR: "contributor",
          GITHUB_REPOSITORY: "test-owner/test-repo",
          GITHUB_EVENT_NAME: "issue_comment",
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_API_URL: "https://github-api.example.test",
          GITHUB_RUN_ID: "1",
          GITHUB_OUTPUT: outputPath,
          GITHUB_ACTION_PATH: actionPath,
          GITHUB_WORKSPACE: workspace,
          GITHUB_SERVER_URL: "https://github.com",
          GITHUB_STEP_SUMMARY: summaryPath,
          RUNNER_TEMP: dir,
          INPUT_PROMPT_FILE: promptPath,
          PATH_TO_CLAUDE_CODE_EXECUTABLE: process.execPath,
          CLAUDE_CODE_OAUTH_TOKEN: "test-claude-token",
          TEST_SESSION_MINUTES: String(minutes),
          TEST_RENEWAL_RESPONSE: renewalResponse,
          TEST_FINALIZATION_BRANCH: branch,
          TEST_ROTATE_IN_SESSION: String(rotateInSession),
          TEST_RECORD_FAILED_PUSH: String(recordFailedPush),
          CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: scrub ? "1" : undefined,
          OVERRIDE_GITHUB_TOKEN: override,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const output = await readFile(outputPath, "utf8");
    const summary = await readFile(summaryPath, "utf8");
    return { exitCode, log: stdout + stderr, output, summary };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("GitHub App token during tag-mode finalization", () => {
  test.each([56, 61])(
    "renews before finalization after %i minutes",
    async (minutes) => {
      const result = await runWithInstallationToken({
        minutes,
        branch: "claude-issue-7",
        scrub: true,
      });

      expect(result.log).toContain("Fixture received a second token exchange");
      expect(result.log).toContain("Fixture applied the renewed token to Git");
      expect(result.log).toContain(
        "Fixture received revocation of the previous token",
      );
      expect(result.log).toContain("Updated issue comment 42");
      expect(result.output).toMatch(
        /^github_token<<.+\r?\ntest-renewed-installation-token\r?\n/m,
      );
      expect(result.output).toMatch(/^conclusion<<.+\r?\nsuccess\r?\n/m);
      expect(result.exitCode).toBe(0);
    },
  );

  test("rotates the token while Claude is still running and reuses it for finalization", async () => {
    const result = await runWithInstallationToken({
      minutes: 61,
      branch: "claude-issue-7",
      rotateInSession: true,
    });

    expect(result.log).toContain(
      "Fixture used the renewed token before Claude exited",
    );
    expect(
      result.log.match(/Fixture received a second token exchange/g),
    ).toHaveLength(1);
    expect(result.log).toContain("Updated issue comment 42");
    expect(result.log).toContain(
      "Fixture received revocation of the previous token",
    );
    expect(result.output).toMatch(/^conclusion<<.+\r?\nsuccess\r?\n/m);
    expect(result.exitCode).toBe(0);
  });

  test("passes an authenticated push attempt to branch recovery after renewal", async () => {
    const result = await runWithInstallationToken({
      minutes: 61,
      branch: "claude-issue-7",
      rotateInSession: true,
      recordFailedPush: true,
    });

    expect(result.log).toContain(
      "Fixture passed the recorded push to recovery with renewed Git auth",
    );
    expect(result.log).toContain("Updated issue comment 42");
    expect(result.exitCode).toBe(0);
  });

  test("reports failure if the exchange rejects renewal and the old token is expired", async () => {
    const result = await runWithInstallationToken({
      minutes: 61,
      renewalResponse: "deny",
    });

    expect(result.log).toContain("Set session_id: test-session");
    expect(result.log).toContain("Fetching issue comment 42");
    expect(result.log).toContain("GitHub App token renewal failed");
    expect(result.log).not.toContain("Fixture received revocation");
    expect(result.output).toContain("execution_file<<");
    expect(result.output).toContain("github_token<<");
    expect(result.summary).toContain("Claude Code Report");
    expect(result.exitCode).toBe(1);
    expect(result.log).toContain(
      "GitHub rejected the action's installation token during finalization (HTTP 401)",
    );
    expect(result.output).toMatch(/^conclusion<<.+\r?\nfailure\r?\n/m);
  });

  test("keeps the current token when the exchange returns it again", async () => {
    const result = await runWithInstallationToken({
      minutes: 56,
      renewalResponse: "reuse",
    });

    expect(result.log).toContain(
      "GitHub App exchange returned the current installation token",
    );
    expect(result.log).not.toContain("Fixture received revocation");
    expect(result.output).toMatch(
      /^github_token<<.+\r?\ntest-installation-token\r?\n/m,
    );
    expect(result.exitCode).toBe(0);
  });

  test("keeps the run successful while the token is valid", async () => {
    const result = await runWithInstallationToken({ minutes: 10 });

    expect(result.log).toContain("Updated issue comment 42");
    expect(result.log).not.toContain(
      "Fixture received a second token exchange",
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/^conclusion<<.+\r?\nsuccess\r?\n/m);
  });

  test("keeps the existing cleanup behavior for a workflow-provided token", async () => {
    const result = await runWithInstallationToken({
      minutes: 61,
      override: "test-provided-token",
    });

    expect(result.log).toContain("Using provided GITHUB_TOKEN");
    expect(result.log).toContain("Fetching issue comment 42");
    expect(result.log).not.toContain(
      "Fixture received a second token exchange",
    );
    expect(result.exitCode).toBe(0);
  });
});
