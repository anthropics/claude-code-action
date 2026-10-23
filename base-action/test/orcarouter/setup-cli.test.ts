import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCliCommand,
  runOrcaRouterCli,
} from "../../src/orcarouter/setup-cli";
import { OrcaRouterCredentialStore } from "../../src/orcarouter/credentials";

/**
 * The two credential entry points must both be discoverable from a headless
 * host: the API key through configuration, the login through these commands.
 */
let home: string;
let captured: string[];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "orca-cli-"));
  captured = [];
  const original = console.log;
  console.log = (...args: unknown[]) => captured.push(args.join(" "));
  console.error = (...args: unknown[]) => captured.push(args.join(" "));
  captureRestore = () => {
    console.log = original;
  };
});

let captureRestore: () => void;

afterEach(async () => {
  captureRestore();
  await rm(home, { recursive: true, force: true });
});

describe("OrcaRouter credential commands", () => {
  test("the stand-alone commands are only reachable through their own flags", () => {
    expect(parseCliCommand([])).toBeNull();
    expect(parseCliCommand(["--prompt", "do work"])).toBeNull();
    expect(parseCliCommand(["--connect"])).toBe("connect");
    expect(parseCliCommand(["--logout"])).toBe("logout");
    expect(parseCliCommand(["--status"])).toBe("status");
  });

  test("status reports both entry points with the secret masked", async () => {
    await new OrcaRouterCredentialStore(home).save({
      key: "sk-orca-stored-0123456789abcdef",
      source: "pkce",
    });
    const code = await runOrcaRouterCli(["--status"], {
      HOME: home,
      ORCAROUTER_API_KEY: "sk-orca-pasted-abcdefghijklmnop",
    });
    expect(code).toBe(0);
    const output = captured.join("\n");
    expect(output).toContain("OrcaRouter – API");
    expect(output).toContain("OrcaRouter – Auth");
    expect(output).toContain("generation 1");
    expect(output).not.toContain("sk-orca-stored-0123456789abcdef");
    expect(output).not.toContain("sk-orca-pasted-abcdefghijklmnop");
  });

  test("status on an unconfigured host points at both entry points", async () => {
    const code = await runOrcaRouterCli(["--status"], { HOME: home });
    expect(code).toBe(0);
    const output = captured.join("\n");
    expect(output).toContain("sk-orca-");
    expect(output).toContain("--connect");
  });

  test("logout clears the stored login but not a supplied key", async () => {
    await new OrcaRouterCredentialStore(home).save({
      key: "sk-orca-gone",
      source: "pkce",
    });
    const code = await runOrcaRouterCli(["--logout"], { HOME: home });
    expect(code).toBe(0);
    expect(await new OrcaRouterCredentialStore(home).read()).toBeNull();
    expect(captured.join("\n")).toMatch(/Removed the stored OrcaRouter login/);
  });

  test("logout is idempotent", async () => {
    const code = await runOrcaRouterCli(["--logout"], { HOME: home });
    expect(code).toBe(0);
    expect(captured.join("\n")).toMatch(/nothing to remove/);
  });

  test("connect without a code fails with an actionable message and stores nothing", async () => {
    const code = await runOrcaRouterCli(["--connect"], {
      HOME: home,
      ORCA_AUTH_BASE_URL: "http://127.0.0.1:9",
    });
    expect(code).toBe(1);
    expect(await new OrcaRouterCredentialStore(home).read()).toBeNull();
    expect(captured.join("\n")).toMatch(/authorization failed/i);
  });

  test("connect accepts an explicit cancel and stores nothing", async () => {
    const code = await runOrcaRouterCli(["--connect", "--cancel"], {
      HOME: home,
      ORCA_AUTH_BASE_URL: "http://127.0.0.1:9",
    });
    expect(code).toBe(1);
    expect(await new OrcaRouterCredentialStore(home).read()).toBeNull();
    expect(captured.join("\n")).toMatch(/cancelled/i);
  });

  test("connect presents a consent URL containing no verifier", async () => {
    await runOrcaRouterCli(["--connect", "--cancel"], {
      HOME: home,
      ORCA_AUTH_BASE_URL: "https://www.orcarouter.ai",
    });
    const output = captured.join("\n");
    expect(output).toContain("https://www.orcarouter.ai/auth?");
    expect(output).toContain("code_challenge=");
    expect(output).toContain("code_challenge_method=S256");
    expect(output).toContain("callback_url=oob");
    expect(output).not.toContain("code_verifier");
  });
});
