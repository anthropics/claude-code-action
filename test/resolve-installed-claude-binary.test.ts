import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resolveInstalledClaudeBinary } from "../src/entrypoints/run";

// Regression test for #1242: when install.sh silently fails (curl pipe to
// bash exits 0 even if curl errors out), the binary at $HOME/.local/bin/claude
// won't exist. Before the fix, run.ts handed that non-existent path to the
// Agent SDK, which crashed with "Claude Code native binary not found". After
// the fix, we return undefined so the SDK falls back to its bundled platform
// binary (the v1.0.99 behavior).
describe("resolveInstalledClaudeBinary (regression for #1242)", () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("returns the path when the binary exists on disk", () => {
    const fileExists = (p: string) => p === "/home/runner/.local/bin/claude";
    const result = resolveInstalledClaudeBinary(
      "/home/runner/.local/bin",
      fileExists,
    );
    expect(result).toBe("/home/runner/.local/bin/claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("returns undefined and warns when the binary is missing", () => {
    // This is the air-gapped / unreachable-claude.ai case: install.sh ran but
    // curl never reached claude.ai, so $HOME/.local/bin/claude doesn't exist.
    const fileExists = () => false;
    const result = resolveInstalledClaudeBinary(
      "/home/sh-runner/.local/bin",
      fileExists,
    );
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain("/home/sh-runner/.local/bin/claude");
    // Warning should mention the fallback so users in air-gapped CI know what
    // to do (the behavior they got on v1.0.99 silently).
    expect(message).toContain("bundled");
  });

  test("uses fs.existsSync by default (no injected predicate)", () => {
    // Hitting a path that definitely doesn't exist should return undefined,
    // proving the default predicate is wired up. Don't assert on warnings
    // here — only that the return value is undefined.
    const result = resolveInstalledClaudeBinary(
      "/nonexistent/path/that/should/not/exist/anywhere",
    );
    expect(result).toBeUndefined();
  });
});
