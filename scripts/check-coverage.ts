#!/usr/bin/env bun

/**
 * Coverage gate for CI.
 *
 * The primary check is NOT the global percentage. Bun omits files that no test
 * ever imports from its report entirely rather than listing them at 0%, so a
 * file can be completely untested and simply not appear — which is how 1,485
 * code lines (the four MCP servers among them) sat at zero while the headline
 * read 82.58%. A plain percentage threshold reproduces that exact blind spot,
 * because the invisible files are missing from both sides of the fraction.
 *
 * So the gate enumerates the source tree and fails on any file that is absent
 * from the report (or present with no covered lines) and not explicitly
 * acknowledged below. The global floor is a secondary guard.
 *
 * Run via `bun run test:coverage`, which produces the lcov file first.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Glob } from "bun";

const REPO_ROOT = join(import.meta.dir, "..");
const LCOV_PATH = join(REPO_ROOT, "coverage", "lcov.info");

/**
 * Files with no coverage, each with the reason it is acceptable. An entry here
 * is a deliberate statement, not a parking space — the gate fails on a stale
 * one, so a file that gains coverage or disappears has to be removed from the
 * list rather than quietly accumulating.
 */
const KNOWN_UNCOVERED: Record<string, string> = {
  "src/create-prompt/types.ts":
    "type-only module — emits no runtime code, so it can never appear in a coverage report",
  "src/github/types.ts":
    "type-only module — emits no runtime code, so it can never appear in a coverage report",
  "src/entrypoints/prepare.ts":
    "legacy standalone entrypoint, no longer wired into action.yml (see CLAUDE.md)",
  "src/entrypoints/cleanup-ssh-signing.ts":
    "12-line always() step; the logic it calls lives in git-config.ts and is covered by ssh-signing.test.ts",
  "base-action/src/index.ts":
    "standalone package entrypoint — reads INPUT_ env vars and delegates to functions that are covered",
  "src/entrypoints/post-buffered-inline-comments.ts":
    "GAP: posts inline comments to PRs after the session, incl. Haiku classification and the no-key fallback. Largest remaining untested surface",
  "src/github/operations/comments/update-with-branch.ts":
    "GAP: builds the tracking-comment body that carries the branch link",
};

/**
 * Floor for overall line coverage, on lcov's basis (which differs from the
 * text reporter's — do not copy a number between them). This is a floor, not a
 * target: raise it when it is comfortably cleared. The zero-coverage check
 * above is what actually protects against the failure this gate exists for.
 */
const MINIMUM_LINE_COVERAGE = 70;

type FileCoverage = { lines: number; covered: number };

function parseLcov(lcov: string): Map<string, FileCoverage> {
  const files = new Map<string, FileCoverage>();
  let current: FileCoverage | undefined;

  for (const line of lcov.split("\n")) {
    if (line.startsWith("SF:")) {
      current = { lines: 0, covered: 0 };
      files.set(line.slice(3).trim(), current);
    } else if (line.startsWith("DA:") && current) {
      const hits = Number(line.slice(3).split(",")[1]);
      current.lines++;
      if (hits > 0) current.covered++;
    }
  }

  return files;
}

function sourceFiles(): string[] {
  const found: string[] = [];
  for (const pattern of ["src/**/*.ts", "base-action/src/**/*.ts"]) {
    for (const path of new Glob(pattern).scanSync(REPO_ROOT)) {
      if (!path.endsWith(".test.ts")) found.push(path);
    }
  }
  return found.sort();
}

function main(): void {
  if (!existsSync(LCOV_PATH)) {
    console.error(
      `No coverage report at ${LCOV_PATH}.\n` +
        `Run \`bun run test:coverage\`, which generates it before this check.`,
    );
    process.exit(1);
  }

  const coverage = parseLcov(readFileSync(LCOV_PATH, "utf8"));
  const sources = sourceFiles();
  const failures: string[] = [];

  // 1. Files with no coverage at all.
  const uncovered = sources.filter((file) => {
    const entry = coverage.get(file);
    return !entry || entry.covered === 0;
  });

  const unacknowledged = uncovered.filter((file) => !(file in KNOWN_UNCOVERED));
  if (unacknowledged.length > 0) {
    failures.push(
      `${unacknowledged.length} source file(s) have no test coverage at all:\n` +
        unacknowledged.map((file) => `    ${file}`).join("\n") +
        `\n\n  Add a test, or — if it genuinely cannot be covered — add it to\n` +
        `  KNOWN_UNCOVERED in scripts/check-coverage.ts with the reason.`,
    );
  }

  // 2. Stale allow-list entries, so the list cannot rot into a rubber stamp.
  const stale = Object.keys(KNOWN_UNCOVERED).filter((file) => {
    if (!sources.includes(file)) return true; // deleted or moved
    return !uncovered.includes(file); // now covered
  });
  if (stale.length > 0) {
    failures.push(
      `${stale.length} KNOWN_UNCOVERED entr(y/ies) are stale — the file is now\n` +
        `  covered, or no longer exists. Remove them from\n` +
        `  scripts/check-coverage.ts:\n` +
        stale.map((file) => `    ${file}`).join("\n"),
    );
  }

  // 3. Global floor.
  let totalLines = 0;
  let totalCovered = 0;
  for (const file of sources) {
    const entry = coverage.get(file);
    if (!entry) continue;
    totalLines += entry.lines;
    totalCovered += entry.covered;
  }
  const percent = totalLines === 0 ? 0 : (100 * totalCovered) / totalLines;

  if (percent < MINIMUM_LINE_COVERAGE) {
    failures.push(
      `Line coverage ${percent.toFixed(2)}% is below the ${MINIMUM_LINE_COVERAGE}% floor.`,
    );
  }

  console.log(
    `Line coverage: ${totalCovered}/${totalLines} (${percent.toFixed(2)}%), ` +
      `floor ${MINIMUM_LINE_COVERAGE}%`,
  );
  console.log(
    `Source files: ${sources.length}, of which ${uncovered.length} uncovered ` +
      `(all acknowledged: ${unacknowledged.length === 0 ? "yes" : "NO"})`,
  );

  if (failures.length > 0) {
    console.error(`\nCoverage gate failed:\n`);
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exit(1);
  }

  console.log("Coverage gate passed.");
}

main();
