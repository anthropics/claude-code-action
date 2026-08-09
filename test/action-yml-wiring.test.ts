#!/usr/bin/env bun

/**
 * Structural invariants of action.yml that nothing else enforces.
 *
 * Both are silent failures: the action still runs, the workflow still goes
 * green, and the damage only shows up as an empty output a caller depends on,
 * or as Bun reading a config file the PR author wrote. Neither is reachable
 * from a unit test of the TypeScript alone, because the wiring lives in YAML.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");

const actionYmlText = readFileSync(join(REPO_ROOT, "action.yml"), "utf8");

/**
 * action.yml is read with small purpose-built readers rather than a YAML
 * parser. Bun.YAML would be the obvious choice but does not exist in the Bun
 * version CI pins (1.2.12), and pulling in a YAML dependency for one test is
 * more weight than the two shapes below need. Each reader is paired with an
 * assertion that it found what it expected, so a reader that silently stops
 * matching fails loudly instead of passing vacuously.
 */
type Step = { name: string; id?: string; run: string };

/** Entries of the top-level `outputs:` block, in file order. */
function parseOutputs(text: string): { name: string; value: string }[] {
  const lines = text.split("\n");
  const start = lines.indexOf("outputs:");
  if (start === -1) return [];

  const parsed: { name: string; value: string }[] = [];
  let current: string | null = null;

  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // next top-level key ends the block
    if (line.trim() === "") continue;

    const name = line.match(/^ {2}([\w-]+):\s*$/);
    if (name) {
      current = name[1]!;
      continue;
    }

    const value = line.match(/^ {4}value:\s*(.+?)\s*$/);
    if (value && current) {
      parsed.push({ name: current, value: value[1]! });
    }
  }

  return parsed;
}

/** Steps under `runs:`, split on the `- name:` that begins each one. */
function parseSteps(text: string): Step[] {
  const runsIndex = text.indexOf("\nruns:");
  if (runsIndex === -1) return [];

  return text
    .slice(runsIndex)
    .split(/\n {4}- name: /)
    .slice(1)
    .map((chunk) => {
      const run = chunk.match(
        / {6}run: \|\s*\n([\s\S]*?)(?=\n {6}[\w-]+:|\n {4}- |$)/,
      );
      return {
        name: chunk.split("\n")[0]!.trim(),
        id: chunk.match(/^ {6}id:\s*(\S+)\s*$/m)?.[1],
        run: run?.[1] ?? "",
      };
    });
}

const outputs = parseOutputs(actionYmlText);
const steps = parseSteps(actionYmlText);
const stepIds = new Set(steps.map((step) => step.id).filter(Boolean));

const runTsSource = readFileSync(
  join(REPO_ROOT, "src/entrypoints/run.ts"),
  "utf8",
);

/** Output names run.ts publishes via core.setOutput("name", ...). */
const setOutputNames = new Set(
  [...runTsSource.matchAll(/core\.setOutput\(\s*"([^"]+)"/g)].map(
    (match) => match[1]!,
  ),
);

/**
 * Outputs run.ts sets that are deliberately NOT re-exported to callers.
 * They are consumed inside action.yml itself (skipped_… gates token
 * revocation). Listing them here is the point: a core.setOutput() added
 * without a matching outputs: entry publishes nothing, which is easy to do
 * and impossible to notice from the TypeScript side.
 */
const INTENTIONALLY_INTERNAL = new Set([
  "conclusion",
  "skipped_due_to_workflow_validation_mismatch",
]);

describe("action.yml outputs wiring", () => {
  test("the readers found the outputs and steps they expect", () => {
    // Fails loudly if action.yml's formatting drifts out from under the
    // readers, rather than letting every test below pass on empty input.
    expect(outputs.map((output) => output.name)).toEqual([
      "execution_file",
      "branch_name",
      "github_token",
      "structured_output",
      "session_id",
    ]);
    expect(steps.length).toBeGreaterThan(5);
    expect(stepIds).toContain("run");
    expect(setOutputNames.size).toBeGreaterThan(0);
  });

  for (const { name, value } of outputs) {
    describe(`output ${name}`, () => {
      test("references an existing step id", () => {
        const match = value.match(
          /^\$\{\{\s*steps\.([\w-]+)\.outputs\.([\w-]+)\s*\}\}$/,
        );

        // A renamed step id leaves this expression resolving to the empty
        // string forever — valid YAML, valid workflow, silently broken.
        expect(match).not.toBeNull();
        expect(stepIds).toContain(match![1]!);
      });

      test("is actually set by run.ts", () => {
        const innerName = value.match(/outputs\.([\w-]+)\s*\}\}$/)?.[1];

        expect(innerName).toBeDefined();
        expect([...setOutputNames]).toContain(innerName!);
      });
    });
  }

  test("every core.setOutput is either exported or knowingly internal", () => {
    const exported = new Set(
      outputs.map(
        (output) => output.value.match(/outputs\.([\w-]+)\s*\}\}$/)?.[1] ?? "",
      ),
    );

    const unexported = [...setOutputNames].filter(
      (name) => !exported.has(name),
    );

    expect(unexported.sort()).toEqual([...INTENTIONALLY_INTERNAL].sort());
  });
});

describe("bunfig.toml pin", () => {
  // bunfig.toml is deliberately empty, and is NOT in restore-config's
  // SENSITIVE_PATHS — so on a PR event it is never reverted to the base
  // branch. Pinning --config to the action's own copy is the only thing
  // stopping Bun from discovering the PR author's bunfig.toml and taking its
  // runtime config from there.
  test("bunfig.toml exists at the repo root", () => {
    expect(existsSync(join(REPO_ROOT, "bunfig.toml"))).toBe(true);
  });

  /** Step run-scripts with shell line continuations folded into one line. */
  const runScripts = steps
    .filter((step) => step.run)
    .map((step) => ({
      name: step.name,
      script: step.run.replace(/\\\n\s*/g, " "),
    }));

  const entrypointInvocations = runScripts.flatMap(({ name, script }) =>
    script
      .split("\n")
      .filter((line) =>
        /run\s+\$\{GITHUB_ACTION_PATH\}\/src\/entrypoints\//.test(line),
      )
      .map((line) => ({ step: name, line: line.trim() })),
  );

  test("every entrypoint invocation is found", () => {
    // Guards the two tests below against silently matching nothing if the
    // invocation shape in action.yml changes.
    expect(entrypointInvocations.length).toBeGreaterThan(0);
  });

  for (const { step, line } of entrypointInvocations) {
    test(`"${step}" pins --config to the action's bunfig.toml`, () => {
      expect(line).toContain('--config="${GITHUB_ACTION_PATH}/bunfig.toml"');
    });
  }

  test("the set of entrypoints run as their own steps is unchanged", () => {
    // Documents which entrypoints are real action.yml steps. The other files
    // in src/entrypoints/ are modules imported by run.ts, not steps — a
    // distinction that has gone stale before.
    const entrypoints = entrypointInvocations
      .map(({ line }) => line.match(/entrypoints\/([\w-]+\.ts)/)?.[1])
      .filter(Boolean)
      .sort();

    expect(entrypoints).toEqual([
      "cleanup-ssh-signing.ts",
      "post-buffered-inline-comments.ts",
      "run.ts",
    ]);
  });

  test("bun install runs inside the action directory", () => {
    // The one bun invocation without --config. It is exempt because the step
    // cd's into GITHUB_ACTION_PATH first, so Bun's config discovery starts in
    // the action's own checkout rather than the PR working tree.
    const installStep = runScripts.find(({ script }) =>
      /\bbun install\b/.test(script),
    );

    expect(installStep).toBeDefined();
    const script = installStep!.script;
    expect(script.indexOf("cd ${GITHUB_ACTION_PATH}")).toBeGreaterThanOrEqual(
      0,
    );
    expect(script.indexOf("cd ${GITHUB_ACTION_PATH}")).toBeLessThan(
      script.indexOf("bun install"),
    );
  });
});
