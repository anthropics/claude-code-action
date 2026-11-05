import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("action metadata", () => {
  test("should expose the conclusion output from the run step", () => {
    const metadata = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(metadata).toMatch(
      /^  conclusion:\n    description: .+\n    value: \$\{\{ steps\.run\.outputs\.conclusion \}\}$/m,
    );
  });

  test("action.yml should omit optional dependencies during install with retries and timeout", () => {
    const actionYml = readFileSync(
      new URL("../action.yml", import.meta.url),
      "utf8",
    );

    expect(actionYml).toContain("bun install --production --omit=optional");
    expect(actionYml).toContain(
      "timeout --foreground --kill-after=10 120 bun install --production --omit=optional",
    );
    expect(actionYml).toContain("for attempt in 1 2 3; do");
  });

  test("base-action/action.yml should omit optional dependencies during install with retries and timeout", () => {
    const baseActionYml = readFileSync(
      new URL("../base-action/action.yml", import.meta.url),
      "utf8",
    );

    expect(baseActionYml).toContain("bun install --production --omit=optional");
    expect(baseActionYml).toContain(
      "timeout --foreground --kill-after=10 120 bun install --production --omit=optional",
    );
    expect(baseActionYml).toContain("for attempt in 1 2 3; do");
  });

  test("bunfig.toml should disable optional dependency installation", () => {
    const bunfig = readFileSync(
      new URL("../bunfig.toml", import.meta.url),
      "utf8",
    );

    expect(bunfig).toMatch(/\[install\]\s+optional\s*=\s*false/);
  });
});
