import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const script = join(import.meta.dir, "../scripts/configure-npm-registry.sh");

function run(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "npmrc-"));
  const npmrc = join(dir, ".npmrc");
  writeFileSync(npmrc, "registry=https://registry.npmjs.org/\n");
  const result = spawnSync("bash", [script, dir], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: "pipe",
  });
  return { status: result.status, npmrc: readFileSync(npmrc, "utf8") };
}

describe("configure-npm-registry.sh", () => {
  it("leaves .npmrc untouched when npm_registry is empty", () => {
    const r = run({});
    expect(r.status).toBe(0);
    expect(r.npmrc).toBe("registry=https://registry.npmjs.org/\n");
  });

  it("writes the registry with a trailing slash", () => {
    const r = run({ NPM_REGISTRY: "https://art.example.com/api/npm/npm" });
    expect(r.status).toBe(0);
    expect(r.npmrc).toContain("registry=https://art.example.com/api/npm/npm/");
    expect(r.npmrc).not.toContain("_authToken");
  });

  it("adds a host-scoped auth token when provided", () => {
    const r = run({
      NPM_REGISTRY: "https://art.example.com/api/npm/npm/",
      NPM_AUTH_TOKEN: "s3cret",
    });
    expect(r.npmrc).toContain(
      "//art.example.com/api/npm/npm/:_authToken=s3cret",
    );
  });

  it("rejects a registry without an http(s) scheme", () => {
    const r = run({ NPM_REGISTRY: "art.example.com" });
    expect(r.status).not.toBe(0);
    expect(r.npmrc).toBe("registry=https://registry.npmjs.org/\n");
  });
});
