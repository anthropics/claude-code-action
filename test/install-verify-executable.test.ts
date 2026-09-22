import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { verifyClaudeExecutable } from "../src/entrypoints/run";

// Regression for #1817: the native installer can exit 0 and print
// "successfully installed" while its launcher step silently fails, leaving
// nothing at ~/.local/bin/claude. installClaudeCode() must not trust the exit
// code alone — a missing launcher has to fail the attempt so the retry loop
// runs and the error surfaces at the install step, not as a later SDK ENOENT.
describe("verifyClaudeExecutable (regression for #1817)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claude-install-verify-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns normally when the launcher exists", () => {
    const bin = join(dir, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const claude = join(bin, "claude");
    writeFileSync(claude, "#!/bin/sh\n", { mode: 0o755 });

    expect(() => verifyClaudeExecutable(claude)).not.toThrow();
  });

  it("throws when the launcher is missing even though the bin dir exists", () => {
    const bin = join(dir, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    const claude = join(bin, "claude");

    expect(() => verifyClaudeExecutable(claude)).toThrow(
      /installer reported success.*not found/i,
    );
  });

  it("throws when the bin dir itself was never created", () => {
    const claude = join(dir, ".local", "bin", "claude");

    expect(() => verifyClaudeExecutable(claude)).toThrow(claude);
  });
});
