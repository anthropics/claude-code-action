import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const readMetadata = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const stepsRunningScripts = (path: string) =>
  readMetadata(path)
    .split(/^    - name: /m)
    .filter((step) => step.includes("${GITHUB_ACTION_PATH}/src/"));

/** Runs the first step that starts Bun, with a shell script in place of Bun. */
async function runStep(path: string, fakeBun: string, interrupt = false) {
  const step = stepsRunningScripts(path)[0]!;
  const script = step
    .match(/^      run: \|\n((?: {8}.*\n|\n)+)/m)![1]!
    .replace(/^ {8}/gm, "");
  const dir = mkdtempSync(join(tmpdir(), "action-step-"));
  try {
    writeFileSync(join(dir, "step.sh"), script);
    writeFileSync(join(dir, "bun"), `#!/bin/bash\n${fakeBun}\n`, {
      mode: 0o755,
    });
    const child = spawn(
      "bash",
      ["--noprofile", "--norc", "-e", "-o", "pipefail", join(dir, "step.sh")],
      {
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          STEP: join(dir, "step.sh"),
        },
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    if (interrupt) child.stdout.once("data", () => child.kill("SIGINT"));
    const exitCode = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    return { output, exitCode };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("action metadata", () => {
  test("should expose the conclusion output from the run step", () => {
    const metadata = readMetadata("action.yml");

    expect(metadata).toMatch(
      /^  conclusion:\n    description: .+\n    value: \$\{\{ steps\.run\.outputs\.conclusion \}\}$/m,
    );
  });

  test("should not pass credentials from inputs to steps after the run step", () => {
    const steps = readMetadata("action.yml").split(/^    - name: /m);
    const later = steps.slice(
      steps.findIndex((step) => step.startsWith("Run Claude Code Action")) + 1,
    );

    expect(later.length).toBeGreaterThan(0);
    for (const step of later) {
      const body = step.replace(/^      if: .+$/m, "");
      expect(body).not.toMatch(
        /inputs\.|env\.|ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN/,
      );
      if (body.includes("outputs.github_token")) {
        expect(step).toContain("inputs.github_token == ''");
      }
    }
  });

  test("should keep restrict_untrusted_prs on by default and pass it to the run step", () => {
    const metadata = readMetadata("action.yml");

    expect(metadata).toMatch(
      /^  restrict_untrusted_prs:\n    description: .+\n    required: false\n    default: "true"$/m,
    );
    expect(metadata).toMatch(
      /^        RESTRICT_UNTRUSTED_PRS: \$\{\{ inputs\.restrict_untrusted_prs \}\}$/m,
    );
  });

  test("should refuse fork pull requests by default and pass the input to the run step", () => {
    const metadata = readMetadata("action.yml");

    expect(metadata).toMatch(
      /^  allow_fork_prs:\n    description: .+\n    required: false\n    default: "false"$/m,
    );
    expect(metadata).toMatch(
      /^        ALLOW_FORK_PRS: \$\{\{ inputs\.allow_fork_prs \}\}$/m,
    );
  });

  test("should start each of the action's scripts with the same Bun options", () => {
    const commands = readMetadata("action.yml")
      .replace(/\\\n\s*/g, "")
      .split("\n")
      .filter((line) => line.includes("${GITHUB_ACTION_PATH}/src/"));

    expect(commands).toHaveLength(2);
    for (const command of commands) {
      expect(command).toContain(
        ' --no-env-file --config="${GITHUB_ACTION_PATH}/bunfig.toml"' +
          ' --tsconfig-override="${GITHUB_ACTION_PATH}/tsconfig.json"' +
          " run ${GITHUB_ACTION_PATH}/src/entrypoints/",
      );
    }
  });

  describe.each(["action.yml", "base-action/action.yml"])("%s", (path) => {
    test("should turn off Bun's transpiler cache for the action's scripts", () => {
      const steps = stepsRunningScripts(path);

      expect(steps).toHaveLength(path === "action.yml" ? 2 : 1);
      for (const step of steps) {
        expect(step).toMatch(
          /^      env:\n(?: {8}.*\n|\n)*? {8}BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0"$/m,
        );
      }
    });

    test.each([0, 3])(
      "should not run what is added to the script meanwhile (exit %i)",
      async (code) => {
        const { output, exitCode } = await runStep(
          path,
          `printf '\\necho added\\n' >> "$STEP"; echo ran; exit ${code}`,
        );

        expect(output).toBe("ran\n");
        expect(exitCode).toBe(code);
      },
    );

    test("should let Bun clean up when the step is interrupted", async () => {
      const { output, exitCode } = await runStep(
        path,
        `exec "${process.execPath}" -e 'process.once("SIGINT", () => { console.log("cleaned up"); process.exit(130) }); setTimeout(() => {}, 5000); console.log("started")'`,
        true,
      );

      expect(output).toBe("started\ncleaned up\n");
      expect(exitCode).toBe(130);
    });
  });

  test("should not put step outputs into shell scripts", () => {
    // A session can write step outputs, so an expression in a script could run
    // its commands. Scripts have to read these values from the environment.
    const lines = readMetadata("action.yml").split("\n");
    const inScripts: string[] = [];
    let scriptIndent: number | null = null;
    for (const line of lines) {
      const indent = line.search(/\S/);
      if (scriptIndent !== null && indent !== -1 && indent <= scriptIndent) {
        scriptIndent = null;
      }
      if (scriptIndent !== null && line.includes("${{ steps.")) {
        inScripts.push(line.trim());
      }
      const run = line.match(/^(\s*)run: \|/);
      if (run) scriptIndent = run[1]!.length;
    }
    expect(inScripts).toEqual([]);
  });
});
