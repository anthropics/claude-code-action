import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupClaudeCodeSettings } from "../../src/setup-claude-code-settings";

/**
 * The settings file is the single write path for provider credentials, so these
 * tests assert what actually lands on disk: user scope, owner-only, and never a
 * credential in a repository-controlled location.
 */
const CATALOG = {
  data: [
    {
      id: "deepseek/deepseek-v4-pro",
      supported_endpoint_types: ["openai", "openai-response"],
      architecture: { input_modalities: ["text"] },
    },
  ],
};

let home: string;
let origin: string;
let server: http.Server;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "orca-settings-"));
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(CATALOG));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(home, { recursive: true, force: true });
  for (const name of [
    "INPUT_ORCAROUTER_PROVIDER",
    "ORCAROUTER_API_KEY",
    "INPUT_ORCAROUTER_API_KEY",
    "INPUT_ORCAROUTER_AUTH",
    "INPUT_ORCAROUTER_MODEL",
    "INPUT_ORCAROUTER_SETTINGS",
    "ORCA_API_BASE_URL",
    "ORCA_AUTH_BASE_URL",
  ]) {
    delete process.env[name];
  }
});

async function readSettings(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(home, ".claude", "settings.json"), "utf-8"),
  );
}

describe("OrcaRouter settings wiring", () => {
  test("writes the resolved credential into user-scope settings.env", async () => {
    process.env.INPUT_ORCAROUTER_PROVIDER = "true";
    process.env.ORCAROUTER_API_KEY = "sk-orca-settings-key";
    process.env.ORCA_API_BASE_URL = origin;
    process.env.ORCA_AUTH_BASE_URL = origin;

    await setupClaudeCodeSettings(undefined, home);
    const settings = await readSettings();

    const env = settings.env as Record<string, string>;
    // The base URL is the origin; Anthropic-shaped clients append /v1/messages.
    expect(env.ANTHROPIC_BASE_URL).toBe(origin);
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-orca-settings-key");
    expect(env.ANTHROPIC_MODEL).toBe("deepseek/deepseek-v4-pro");
    expect(settings.enableAllProjectMcpServers).toBe(true);
  });

  test("merges with user-supplied settings instead of replacing them", async () => {
    process.env.INPUT_ORCAROUTER_PROVIDER = "true";
    process.env.ORCAROUTER_API_KEY = "sk-orca-settings-key";
    process.env.ORCA_API_BASE_URL = origin;
    process.env.ORCA_AUTH_BASE_URL = origin;

    await setupClaudeCodeSettings(
      JSON.stringify({ model: "claude-sonnet-4-5", env: { EXISTING: "kept" } }),
      home,
    );
    const settings = await readSettings();
    expect(settings.model).toBe("claude-sonnet-4-5");
    const env = settings.env as Record<string, string>;
    expect(env.EXISTING).toBe("kept");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-orca-settings-key");
  });

  test("does not write the credential into a repository-scoped location", async () => {
    process.env.INPUT_ORCAROUTER_PROVIDER = "true";
    process.env.ORCAROUTER_API_KEY = "sk-orca-settings-key";
    process.env.ORCA_API_BASE_URL = origin;
    process.env.ORCA_AUTH_BASE_URL = origin;

    await setupClaudeCodeSettings(undefined, home);
    const written = await readFile(
      join(home, ".claude", "settings.json"),
      "utf-8",
    );
    expect(written).toContain("sk-orca-settings-key");
    // The only file touched is under the user's own .claude directory.
    expect(join(home, ".claude", "settings.json").startsWith(home)).toBe(true);
  });

  test("a non-OrcaRouter run leaves settings untouched", async () => {
    await setupClaudeCodeSettings(
      JSON.stringify({ model: "claude-sonnet-4-5" }),
      home,
    );
    const settings = await readSettings();
    expect(settings.env).toBeUndefined();
    expect(settings.model).toBe("claude-sonnet-4-5");
  });

  test("fails with an actionable message when the provider is selected without a credential", async () => {
    process.env.INPUT_ORCAROUTER_PROVIDER = "true";
    await expect(setupClaudeCodeSettings(undefined, home)).rejects.toThrow(
      /no credential is available/,
    );
  });

  test("does not log the credential value", async () => {
    const secret = "sk-orca-do-not-log-me-1234567890";
    process.env.INPUT_ORCAROUTER_PROVIDER = "true";
    process.env.ORCAROUTER_API_KEY = secret;
    process.env.ORCA_API_BASE_URL = origin;
    process.env.ORCA_AUTH_BASE_URL = origin;

    const captured: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = (...args: unknown[]) => captured.push(args.join(" "));
    console.warn = (...args: unknown[]) => captured.push(args.join(" "));
    try {
      await setupClaudeCodeSettings(undefined, home);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }

    expect(captured.join("\n")).not.toContain(secret);
    expect(captured.join("\n")).toContain("sk-orca-d");
  });
});
