import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type Step = {
  name: string;
  id?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const action = Bun.YAML.parse(
  readFileSync(join(repoRoot, "action.yml"), "utf8"),
) as {
  inputs: Record<string, { default?: string }>;
  runs: { steps: Step[] };
};
const steps = action.runs.steps;
const step = (name: string): Step => {
  const found = steps.find((s) => s.name === name);
  if (!found) throw new Error(`step not found: ${name}`);
  return found;
};

const pinnedVersion = readFileSync(
  join(repoRoot, "src/entrypoints/run.ts"),
  "utf8",
).match(/const claudeCodeVersion = "([0-9.]+)";/)![1]!;

describe("cache_claude_code metadata", () => {
  test("is opt-in", () => {
    expect(action.inputs.cache_claude_code?.default).toBe("false");
  });

  test("passes the verified cached binary to run.ts only as a fallback to the user's path", () => {
    expect(
      step("Run Claude Code Action").env?.PATH_TO_CLAUDE_CODE_EXECUTABLE,
    ).toBe(
      "${{ inputs.path_to_claude_code_executable || steps.claude-cache.outputs.path }}",
    );
  });

  test("restores and saves the same path and key with the same pinned action", () => {
    const restore = step("Restore Claude Code from cache");
    const save = step("Save Claude Code to cache");
    expect(restore.uses).toMatch(/^actions\/cache\/restore@[0-9a-f]{40}$/);
    expect(save.uses?.replace("/save@", "/restore@")).toBe(restore.uses!);
    expect(save.with).toEqual(restore.with!);
  });

  test("saves only on a cache miss", () => {
    expect(step("Save Claude Code to cache").if).toContain(
      "steps.claude-cache-restore.outputs.cache-hit != 'true'",
    );
  });
});

describe("cache step scripts", () => {
  let dir: string;
  let output: string;

  const runScript = (script: string, env: Record<string, string>) =>
    // Same flags as `shell: bash` in a composite action step
    spawnSync(
      "bash",
      ["--noprofile", "--norc", "-eo", "pipefail", "-c", script],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: dir, GITHUB_OUTPUT: output, ...env },
      },
    );
  const outputs = () =>
    Object.fromEntries(
      readFileSync(output, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claude-cache-"));
    output = join(dir, "github-output");
    writeFileSync(output, "");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("key step reads the version that run.ts installs", () => {
    const result = runScript(step("Resolve Claude Code cache key").run!, {
      GITHUB_ACTION_PATH: repoRoot,
    });
    expect(result.status).toBe(0);
    expect(outputs()).toEqual({
      version: pinnedVersion,
      path: join(dir, ".local/share/claude/versions", pinnedVersion),
    });
  });

  describe("verify step", () => {
    const version = "9.9.9";
    let binary: string;
    let releases: string;

    const writeBinary = (reported: string) => {
      writeFileSync(binary, `#!/bin/sh\necho "${reported} (Claude Code)"\n`);
      chmodSync(binary, 0o755);
    };
    const writeManifest = (checksum: string) => {
      mkdirSync(join(releases, version), { recursive: true });
      const platforms = Object.fromEntries(
        [
          "darwin-arm64",
          "darwin-x64",
          "linux-arm64",
          "linux-x64",
          "linux-arm64-musl",
          "linux-x64-musl",
        ].map((p) => [p, { binary: "claude", checksum, size: 1 }]),
      );
      writeFileSync(
        join(releases, version, "manifest.json"),
        JSON.stringify({ version, platforms }, null, 2),
      );
    };
    const sha256 = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    const verify = () =>
      runScript(step("Verify cached Claude Code").run!, {
        CLAUDE_CODE_PATH: binary,
        CLAUDE_CODE_VERSION: version,
        CLAUDE_CODE_RELEASES_URL: `file://${releases}`,
      });

    beforeEach(() => {
      const versions = join(dir, ".local/share/claude/versions");
      mkdirSync(versions, { recursive: true });
      binary = join(versions, version);
      releases = join(dir, "releases");
    });

    test("uses a binary that matches the manifest checksum and version", () => {
      writeBinary(version);
      writeManifest(sha256(binary));

      const result = verify();

      expect(result.status).toBe(0);
      const launcher = join(dir, ".local/bin/claude");
      expect(outputs()).toEqual({ path: launcher });
      expect(readlinkSync(launcher)).toBe(binary);
    });

    test("discards a binary whose checksum differs from the manifest", () => {
      writeBinary(version);
      writeManifest("0".repeat(64));

      const result = verify();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("checksum does not match");
      expect(outputs()).toEqual({});
      expect(existsSync(binary)).toBe(false);
    });

    test("discards a binary that reports another version", () => {
      writeBinary("9.9.8");
      writeManifest(sha256(binary));

      const result = verify();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("reports version '9.9.8'");
      expect(outputs()).toEqual({});
      expect(existsSync(binary)).toBe(false);
    });

    test("discards the binary when the manifest cannot be downloaded", () => {
      writeBinary(version);

      const result = verify();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "could not download the release manifest",
      );
      expect(outputs()).toEqual({});
      expect(existsSync(binary)).toBe(false);
    });
  });
});
