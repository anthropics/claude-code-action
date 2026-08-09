#!/usr/bin/env bun

/**
 * run.ts is a single in-process orchestrator whose `finally` block does the
 * cleanup that matters: it stops the workload-identity refresher, updates the
 * tracking comment, writes the step summary, and sets the step outputs. A
 * process.exit() anywhere in the code it imports skips all of that — the
 * GitHub App token is never revoked and the tracking comment stays stuck at
 * "Claude is working…".
 *
 * setupBranch(), prepareMcpConfig() and createPrompt() each used to exit(1) on
 * error, left over from when they were their own action.yml steps. They throw
 * now, and nothing stops the pattern coming back: exit() is a normal thing to
 * write in a CLI, and the failure is invisible until a run fails in a way that
 * needs the cleanup.
 *
 * process.exit() is legitimate in src/mcp/*-server.ts — those really are their
 * own processes — and in a standalone-CLI path guarded by `import.meta.main`,
 * which does not execute when the module is imported. Both exemptions are
 * asserted rather than assumed.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const ENTRY = resolve(REPO_ROOT, "src/entrypoints/run.ts");

/**
 * Files in run.ts's import graph that contain a process.exit(). Each one must
 * also carry an `import.meta.main` guard, so the exit belongs to a
 * standalone-CLI path that never runs on the imported path.
 *
 * Adding a file here is a deliberate act. Prefer throwing.
 */
const GUARDED_CLI_ENTRYPOINTS = ["src/entrypoints/update-comment-link.ts"];

function resolveLocalImport(
  specifier: string,
  fromFile: string,
): string | null {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** Transitive local (relative-specifier) imports reachable from `entry`. */
function collectImportGraph(entry: string): string[] {
  const visited = new Set<string>();

  const walk = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    // Covers `from "./x"`, `import "./x"` and `await import("./x")`.
    // Bare specifiers (node builtins, npm packages) are skipped by the
    // leading-dot requirement.
    for (const match of source.matchAll(
      /(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g,
    )) {
      const resolved = resolveLocalImport(match[1]!, file);
      if (resolved) walk(resolved);
    }
  };

  walk(entry);
  return [...visited];
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const graph = collectImportGraph(ENTRY).map((file) =>
  relative(REPO_ROOT, file),
);

const filesWithProcessExit = graph
  .filter((file) =>
    /process\s*\.\s*exit\s*\(/.test(
      stripComments(readFileSync(join(REPO_ROOT, file), "utf8")),
    ),
  )
  .sort();

describe("no process.exit in run.ts's import graph", () => {
  test("the graph resolves to a plausible number of modules", () => {
    // Guards against the walker silently resolving nothing and the whole file
    // passing vacuously.
    expect(graph.length).toBeGreaterThan(20);
    expect(graph).toContain("src/entrypoints/run.ts");
    expect(graph).toContain("src/modes/tag/index.ts");
    expect(graph).toContain("src/github/operations/branch.ts");
  });

  test("only knowingly-guarded CLI entrypoints call process.exit", () => {
    expect(filesWithProcessExit).toEqual([...GUARDED_CLI_ENTRYPOINTS].sort());
  });

  for (const file of GUARDED_CLI_ENTRYPOINTS) {
    test(`${file} keeps its import.meta.main guard`, () => {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");

      // Without the guard the module's CLI body — and its exits — would run on
      // import, killing run.ts before its finally block ever executes.
      expect(source).toMatch(/if\s*\(\s*import\.meta\.main\s*\)/);
    });
  }

  test("importing update-comment-link does not terminate the process", async () => {
    // The behavioural counterpart to the regex above: run.ts imports this
    // module for its exported function, so importing it must be inert. If the
    // guard were removed, the CLI body would run here.
    const module = await import("../src/entrypoints/update-comment-link");

    expect(typeof module.updateCommentLink).toBe("function");
  });

  test("the MCP servers are not in the graph", () => {
    // They are spawned as separate processes (install-mcp-server.ts writes
    // their paths into .mcp.json rather than importing them), which is why
    // process.exit is fine in them. install-mcp-server.ts itself is a normal
    // imported module and is deliberately not matched here.
    const servers = graph.filter((file) =>
      /^src\/mcp\/github-[\w-]+-server\.ts$/.test(file),
    );
    expect(servers).toEqual([]);
  });

  test("the MCP servers really do use process.exit", () => {
    // Pins the reason the exemption above exists; if these stopped exiting,
    // the carve-out would be dead weight.
    const server = readFileSync(
      join(REPO_ROOT, "src/mcp/github-file-ops-server.ts"),
      "utf8",
    );
    expect(server).toMatch(/process\s*\.\s*exit\s*\(/);
  });
});
