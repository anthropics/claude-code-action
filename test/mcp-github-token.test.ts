import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GITHUB_TOKEN_FILE_ENV,
  readGitHubToken,
} from "../src/mcp/github-token";

describe("MCP GitHub token lookup", () => {
  let directory: string;
  let tokenPath: string;
  let replacementPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "claude-mcp-github-token-"));
    tokenPath = join(directory, "token");
    replacementPath = join(directory, "replacement");
  });

  afterEach(async () => {
    for (const path of [tokenPath, replacementPath]) {
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    await rmdir(directory);
  });

  test("reads the replacement token on the next operation", async () => {
    const env = {
      [GITHUB_TOKEN_FILE_ENV]: tokenPath,
      GITHUB_TOKEN: "static-token",
    };
    await writeFile(tokenPath, "first-token", { mode: 0o600 });
    expect(await readGitHubToken(env)).toBe("first-token");

    await writeFile(replacementPath, "ghs_12345.jwt-token\r\n", {
      mode: 0o600,
    });
    await rename(replacementPath, tokenPath);
    expect(await readGitHubToken(env)).toBe("ghs_12345.jwt-token");
  });

  test("uses the caller-supplied token when no token file is configured", async () => {
    expect(await readGitHubToken({ GITHUB_TOKEN: "static-token" })).toBe(
      "static-token",
    );
    await expect(readGitHubToken({})).rejects.toThrow(
      "GITHUB_TOKEN environment variable is required",
    );
  });

  test("does not fall back to the old token if the file cannot be read", async () => {
    await expect(
      readGitHubToken({
        [GITHUB_TOKEN_FILE_ENV]: tokenPath,
        GITHUB_TOKEN: "static-token",
      }),
    ).rejects.toThrow("Could not read the GitHub App token file");
  });

  test("rejects non-regular and oversized token files", async () => {
    await expect(
      readGitHubToken({ [GITHUB_TOKEN_FILE_ENV]: directory }),
    ).rejects.toThrow("Could not read the GitHub App token file");

    await writeFile(tokenPath, "x".repeat(64 * 1024), { mode: 0o600 });
    await expect(
      readGitHubToken({ [GITHUB_TOKEN_FILE_ENV]: tokenPath }),
    ).rejects.toThrow("Could not read the GitHub App token file");
  });

  test("rejects an empty or malformed file without exposing its contents", async () => {
    const env = {
      [GITHUB_TOKEN_FILE_ENV]: tokenPath,
      GITHUB_TOKEN: "static-token",
    };
    for (const value of ["", "token\nsecret", "token\x00"]) {
      await writeFile(tokenPath, value, { mode: 0o600 });
      await expect(readGitHubToken(env)).rejects.toThrow(
        /^GitHub App token file contains an invalid token$/,
      );
    }
  });
});
