import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import { buildInstallCommand } from "../src/entrypoints/run";

describe("buildInstallCommand (regression for #1136)", () => {
  it("includes the pinned claude version in the bash -s args", () => {
    const cmd = buildInstallCommand("2.1.114");
    expect(cmd).toContain("bash -s -- 2.1.114");
  });

  it("prefixes the pipeline with `set -o pipefail`", () => {
    const cmd = buildInstallCommand("2.1.114");
    expect(cmd.startsWith("set -o pipefail;")).toBe(true);
  });

  it("keeps the curl -fsSL flags so the script is fetched, not inlined", () => {
    const cmd = buildInstallCommand("2.1.114");
    expect(cmd).toContain(
      "curl -fsSL https://claude.ai/install.sh | bash -s --",
    );
  });
});

describe("pipefail semantics (proves the bug shape and the fix)", () => {
  // Mirrors the real install invocation: a curl that returns non-zero
  // feeding into `bash -s --`. Without pipefail, the pipeline exits 0
  // because bash -s receives an empty stdin and does nothing. With
  // pipefail, curl's exit code wins and the retry loop in run.ts triggers.
  //
  // Uses port 1 (reserved/unused) so curl fails deterministically with no
  // network access. No shell-escaping traps here: the version argument is
  // a numeric literal.
  const unreachable = "http://127.0.0.1:1/nope";
  const version = "2.1.114";

  it("BEFORE FIX: pipeline without pipefail swallows curl failure (exit 0)", () => {
    const buggy = `curl -fsSL ${unreachable} | bash -s -- ${version}`;
    const result = spawnSync("bash", ["-c", buggy], { stdio: "pipe" });
    expect(result.status).toBe(0);
  });

  it("AFTER FIX: buildInstallCommand (against unreachable host) exits non-zero", () => {
    const fixed = buildInstallCommand(version).replace(
      "https://claude.ai/install.sh",
      unreachable,
    );
    const result = spawnSync("bash", ["-c", fixed], { stdio: "pipe" });
    expect(result.status).not.toBe(0);
  });
});
