import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildInstallCommand,
  installClaudeCode,
  verifyClaudeExecutable,
} from "../src/entrypoints/run";

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

/**
 * End-to-end: drive the real installClaudeCode() against a fake installer.
 *
 * buildInstallCommand() shells out to `curl … | bash -s -- <version>`, so a
 * fake `curl` placed first on PATH can emit any install script we like. The
 * fake script below reproduces the #1817 log shape verbatim: it prints the
 * setup-notes warning and "successfully installed", exits 0, and creates no
 * launcher. HOME is pointed at a temp dir so ~/.local/bin/claude is ours.
 *
 * The scripts are plain bash and touch nothing outside the temp HOME.
 */
describe("installClaudeCode against an installer that exits 0 without a launcher (#1817)", () => {
  let home: string;
  let fakeBin: string;
  let attemptsLog: string;
  const savedEnv: Record<string, string | undefined> = {};

  // `mode`:
  //   "never"  — launcher is never created (the reported failure)
  //   "second" — launcher appears on the 2nd attempt (the intermittent shape
  //              reported in #1817: same image, pass/fail minutes apart)
  //   "always" — launcher is created on the 1st attempt (healthy installer)
  function installFakeCurl(mode: "never" | "second" | "always") {
    const launcher = join(home, ".local", "bin", "claude");
    const script = [
      "#!/usr/bin/env bash",
      `echo attempt >> "${attemptsLog}"`,
      `n=$(wc -l < "${attemptsLog}" | tr -d ' ')`,
      `echo "Installing Claude Code native build $1..."`,
      `echo "Setting up launcher and shell integration..."`,
      mode === "always"
        ? "create=1"
        : mode === "second"
          ? 'if [ "$n" -ge 2 ]; then create=1; else create=0; fi'
          : "create=0",
      'if [ "$create" = 1 ]; then',
      `  mkdir -p "$(dirname "${launcher}")"`,
      `  printf '#!/bin/sh\\necho 2.1.265\\n' > "${launcher}"`,
      `  chmod +x "${launcher}"`,
      "else",
      `  echo "⚠ Setup notes:"`,
      `  echo "  ● claude command at ${launcher} missing or broken"`,
      "fi",
      `echo "✔ Claude Code successfully installed!"`,
      `echo "  Location: ~/.local/bin/claude"`,
      "exit 0",
    ].join("\n");

    // The fake curl ignores its arguments and streams the install script,
    // exactly as the real `curl -fsSL https://claude.ai/install.sh` would.
    const installScript = join(home, "install.sh");
    writeFileSync(installScript, script + "\n");
    writeFileSync(
      join(fakeBin, "curl"),
      `#!/bin/sh\ncat "${installScript}"\n`,
      {
        mode: 0o755,
      },
    );
  }

  function attempts(): number {
    return existsSync(attemptsLog)
      ? readFileSync(attemptsLog, "utf-8").trim().split("\n").length
      : 0;
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "claude-install-e2e-"));
    fakeBin = join(home, "fake-bin");
    mkdirSync(fakeBin);
    attemptsLog = join(home, "attempts.log");

    for (const k of [
      "HOME",
      "PATH",
      "GITHUB_PATH",
      "PATH_TO_CLAUDE_CODE_EXECUTABLE",
    ]) {
      savedEnv[k] = process.env[k];
    }
    process.env.HOME = home;
    process.env.PATH = `${fakeBin}:${process.env.PATH}`;
    delete process.env.GITHUB_PATH;
    delete process.env.PATH_TO_CLAUDE_CODE_EXECUTABLE;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it("BUG SHAPE: the install pipeline exits 0 even though no launcher was created", () => {
    installFakeCurl("never");

    const result = spawnSync("bash", ["-c", buildInstallCommand("2.1.265")], {
      stdio: "pipe",
      env: process.env,
    });

    // Exit code alone cannot distinguish this from a healthy install — which
    // is why the retry loop never fired in #1817.
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toContain("successfully installed");
    expect(existsSync(join(home, ".local", "bin", "claude"))).toBe(false);
  });

  it(
    "retries all 3 attempts and fails at the install step with a clear error when the launcher never appears",
    async () => {
      installFakeCurl("never");

      const launcher = join(home, ".local", "bin", "claude");
      let caught: unknown;
      try {
        await installClaudeCode();
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message).toContain(
        "Failed to install Claude Code after 3 attempts",
      );
      expect(message).toContain("Installer reported success");
      expect(message).toContain(launcher);
      expect(attempts()).toBe(3);
    },
    // installClaudeCode sleeps 5s between attempts.
    { timeout: 20_000 },
  );

  it(
    "recovers via the existing retry loop when the launcher appears on a later attempt",
    async () => {
      installFakeCurl("second");

      const launcher = join(home, ".local", "bin", "claude");
      const result = await installClaudeCode();

      expect(result).toBe(launcher);
      expect(existsSync(launcher)).toBe(true);
      expect(attempts()).toBe(2);
    },
    { timeout: 20_000 },
  );

  it("still succeeds on the first attempt with a healthy installer", async () => {
    installFakeCurl("always");
    const githubPath = join(home, "github_path");
    writeFileSync(githubPath, "");
    process.env.GITHUB_PATH = githubPath;

    const launcher = join(home, ".local", "bin", "claude");
    const result = await installClaudeCode();

    expect(result).toBe(launcher);
    expect(attempts()).toBe(1);
    // PATH plumbing is unchanged by the fix.
    expect(readFileSync(githubPath, "utf-8")).toBe(`${home}/.local/bin\n`);
    expect(process.env.PATH!.startsWith(`${home}/.local/bin:`)).toBe(true);
  });
});
