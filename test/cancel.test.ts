import { describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0);
    // A process that has ended but that nobody waited for still has an entry.
    return !/^\S+ \(.*\) Z/s.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch (error) {
    return (error as { code?: string }).code === "ENOENT"
      ? process.platform !== "linux"
      : false;
  }
};

async function until(condition: () => boolean, what: string) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// Like a session. Its child is in its own process group, and both ignore SIGTERM. A
// third process takes SIGTERM as git does, which removes its lock files.
const SESSION = `#!/bin/bash
trap '' TERM INT
perl -e 'use POSIX; POSIX::setsid(); sleep 300' &
child=$!
perl -e '$SIG{TERM} = sub { unlink "$ENV{TEST_DIR}/lock"; exit }; open(F, ">$ENV{TEST_DIR}/lock"); sleep 300' &
git_like=$!
echo "$$ $child $git_like" > "$TEST_DIR/pids"
until [ -e "$TEST_DIR/lock" ]; do sleep 0.05; done
echo 'ADDED=1' >> "$GITHUB_ENV"
printf '%s\\n' skipped_due_to_workflow_validation_mismatch=true conclusion=success >> "$GITHUB_OUTPUT"
eval "$IN_SESSION"
touch "$TEST_DIR/started"
while :; do sleep 1; done
`;

const stepScript = (metadata: string) =>
  metadata
    .split(/^    - name: /m)
    .find((step) => step.includes("${GITHUB_ACTION_PATH}/src/"))!
    .match(/^      run: \|\n((?: {8}.*\n|\n)+)/m)![1]!
    .replace(/^ {8}/gm, "");

const parseOutputs = (file: string) =>
  Object.fromEntries(
    [
      ...readFileSync(file, "utf8").matchAll(
        /^([^=\n]+?)(?:=|<<(\S+)\n)(.*)$(?:\n\2$)?/gm,
      ),
    ].map(([, name, , value]) => [name, value]),
  );

/** Runs an action's step, as the runner does, and cancels it during the session. */
async function cancelStep(
  actionDir: string,
  { signals = ["SIGINT"] as NodeJS.Signals[], inSession = ":" } = {},
) {
  const source = join(import.meta.dir, "..", actionDir);
  const dir = mkdtempSync(join(tmpdir(), "cancel-"));
  const path = (file: string) => join(dir, file);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      Response.json({ login: "writer", type: "User", value: "identity" }),
  });
  const pids = () =>
    existsSync(path("pids"))
      ? [...readFileSync(path("pids"), "utf8").matchAll(/\d+/g)].map(Number)
      : [];
  let step: Bun.Subprocess | undefined;
  try {
    // The action keeps files for the session in its own directory.
    for (const name of ["repo", "bin", "outputs", "action", "action/scripts"]) {
      mkdirSync(path(name));
    }
    for (const name of readdirSync(source)) {
      if (name === "scripts") continue;
      symlinkSync(join(source, name), path(join("action", name)));
    }
    execFileSync("git", ["init", "-q", path("repo")]);
    for (const file of ["outputs/output", "env", "path"]) {
      writeFileSync(path(file), "");
    }
    writeFileSync(path("event.json"), JSON.stringify({ inputs: {} }));
    writeFileSync(path("prompt.txt"), "x");
    writeFileSync(path("claude"), SESSION, { mode: 0o755 });
    writeFileSync(
      path("step.sh"),
      stepScript(readFileSync(join(source, "action.yml"), "utf8")),
    );
    writeFileSync(
      path("bin/bun"),
      `#!/bin/bash\nexec "${process.execPath}" "$@"\n`,
      { mode: 0o755 },
    );

    const running = Bun.spawn(
      [
        "bash",
        "--noprofile",
        "--norc",
        "-e",
        "-o",
        "pipefail",
        path("step.sh"),
      ],
      {
        cwd: path("repo"),
        stdout: "ignore",
        stderr: "ignore",
        env: {
          PATH: `${path("bin")}:${process.env.PATH}`,
          HOME: dir,
          RUNNER_TEMP: dir,
          TEST_DIR: dir,
          IN_SESSION: inSession,
          GITHUB_ACTION_PATH: path("action"),
          GITHUB_API_URL: `http://127.0.0.1:${server.port}`,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_EVENT_PATH: path("event.json"),
          GITHUB_REPOSITORY: "o/r",
          GITHUB_ACTOR: "writer",
          GITHUB_RUN_ID: "1",
          GITHUB_OUTPUT: path("outputs/output"),
          GITHUB_ENV: path("env"),
          GITHUB_PATH: path("path"),
          OVERRIDE_GITHUB_TOKEN: "the-token",
          ANTHROPIC_FEDERATION_RULE_ID: "rule",
          ANTHROPIC_ORGANIZATION_ID: "org",
          ACTIONS_ID_TOKEN_REQUEST_URL: `http://127.0.0.1:${server.port}/?`,
          ACTIONS_ID_TOKEN_REQUEST_TOKEN: "unused",
          PROMPT: "x",
          INPUT_PROMPT_FILE: path("prompt.txt"),
          PATH_TO_CLAUDE_CODE_EXECUTABLE: path("claude"),
          INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE: path("claude"),
        },
      },
    );
    step = running;
    await until(() => existsSync(path("started")), "the session");
    expect(pids().slice(0, 3).map(isRunning)).toEqual([true, true, true]);
    const identity = path("claude-workload-identity");
    expect(existsSync(identity)).toBe(true);

    // The runner signals the step's own process and nothing else.
    for (const name of signals) running.kill(name);
    const exitCode = await running.exited;
    // What was killed can take a moment to be gone.
    await until(() => !pids().some(isRunning), "the session to end");

    return {
      exitCode,
      outputs: parseOutputs(path("outputs/output")),
      env: readFileSync(path("env"), "utf8"),
      leftBehind: [path("lock"), identity]
        .filter(existsSync)
        .concat(readdirSync(path("action/scripts"))),
    };
  } finally {
    step?.kill("SIGKILL");
    chmodSync(path("outputs"), 0o755);
    for (const pid of pids().filter(isRunning)) process.kill(pid, "SIGKILL");
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform === "win32")("a cancelled run", () => {
  test.each([
    [["SIGINT"]],
    [["SIGTERM"]],
    [["SIGINT", "SIGINT", "SIGTERM"]],
  ] as [NodeJS.Signals[]][])(
    "stops the session and has the app token revoked (%p)",
    async (signals) => {
      const result = await cancelStep("", { signals });

      expect(result).toMatchObject({
        exitCode: 130,
        leftBehind: [],
        outputs: {
          github_token: "the-token",
          // A session can't have the revocation skipped, or report success.
          skipped_due_to_workflow_validation_mismatch: "false",
          conclusion: "failure",
        },
      });
      expect(result.env).not.toContain("ADDED");
    },
    20_000,
  );

  test("stops every process a session keeps starting", async () => {
    const result = await cancelStep("", {
      inSession:
        'bash -c "while :; do sleep 30.25 & echo \\$! >> \\"$TEST_DIR/pids\\"; sleep 0.005; done" & until [ $(wc -l < "$TEST_DIR/pids") -gt 9 ]; do sleep 0.05; done',
    });

    expect(result).toMatchObject({ exitCode: 130, leftBehind: [] });
  }, 20_000);

  test("writes its outputs when the session was in the middle of one", async () => {
    const result = await cancelStep("", {
      inSession: `echo 'report<<END' >> "$GITHUB_OUTPUT"`,
    });

    expect(result.outputs).toEqual({
      skipped_due_to_workflow_validation_mismatch: "false",
      github_token: "the-token",
      branch_name: "",
      conclusion: "failure",
    });
  }, 20_000);

  test("stops the session in the base action", async () => {
    const result = await cancelStep("base-action");

    expect(result).toMatchObject({
      exitCode: 130,
      leftBehind: [],
      outputs: { conclusion: "failure" },
    });
  }, 20_000);

  test.skipIf(process.getuid?.() === 0)(
    "cleans up what it can when outputs can't be written",
    async () => {
      const result = await cancelStep("", {
        inSession: 'chmod a-w "$GITHUB_OUTPUT" "$(dirname "$GITHUB_OUTPUT")"',
      });

      expect(result).toMatchObject({ exitCode: 130, leftBehind: [] });
      expect(result.env).not.toContain("ADDED");
    },
    20_000,
  );
});

describe("onCancel", () => {
  // Prints once it is ready, and finishes by itself after a second.
  const finishing = (...signals: NodeJS.Signals[]) => {
    const source = join(import.meta.dir, "../base-action/src/cancel.ts");
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { onCancel } from ${JSON.stringify(source)};
         onCancel([() => console.log("stopped")], () => true);
         setTimeout(() => { console.log("finished"); process.exit(0); }, 1000);
         console.log("ready");`,
      ],
      { stdout: "pipe" },
    );
    return (async () => {
      let output = "";
      for await (const chunk of child.stdout) {
        output += new TextDecoder().decode(chunk);
        if (output === "ready\n") signals.forEach((name) => child.kill(name));
      }
      return { output, exitCode: await child.exited };
    })();
  };

  test.skipIf(process.platform === "win32")(
    "lets a run whose session has ended finish until the second signal",
    async () => {
      expect(await finishing("SIGINT")).toEqual({
        output: "ready\nfinished\n",
        exitCode: 0,
      });
      expect(await finishing("SIGINT", "SIGTERM")).toEqual({
        output: "ready\nstopped\n",
        exitCode: 130,
      });
    },
  );
});
