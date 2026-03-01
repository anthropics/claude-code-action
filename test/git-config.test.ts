#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { configureGitAuth } from "../src/github/operations/git-config";
import type { GitHubContext } from "../src/github/context";

/**
 * Tests for configureGitAuth compatibility with actions/checkout credential storage.
 *
 * actions/checkout@v6 changed how persist-credentials works: instead of setting
 * http.*.extraheader directly in the local git config, it writes the credential
 * to a separate file and includes it via includeIf.gitdir. configureGitAuth must
 * remove both styles to prevent the read-only GITHUB_TOKEN from taking precedence
 * over the app token set in the remote URL.
 */

const TEST_APP_TOKEN = "ghs_test_app_token_123";
const HEADER_VALUE = "AUTHORIZATION: basic READONLY_TOKEN";

const mockContext = {
  repository: { owner: "test-owner", repo: "test-repo", full_name: "test-owner/test-repo" },
} as GitHubContext;

const mockUser = { login: "claude[bot]", id: 41898282 };

describe("configureGitAuth", () => {
  const testDir = join(tmpdir(), `claude-git-config-test-${Date.now()}`);
  const repoDir = join(testDir, "repo");
  const credFile = join(testDir, "git-credentials.config");

  beforeEach(async () => {
    await mkdir(repoDir, { recursive: true });
    $.cwd(repoDir);
    await $`git init`.quiet();
    await $`git remote add origin https://github.com/test-owner/test-repo.git`.quiet();
  });

  afterEach(async () => {
    $.cwd(process.cwd());
    await rm(testDir, { recursive: true, force: true });
  });

  test("clears extraheader set directly in local config (checkout v4 style)", async () => {
    // Simulate actions/checkout@v4 credential storage
    await $`git config --local http.https://github.com/.extraheader ${HEADER_VALUE}`.quiet();

    // Verify it's set before calling configureGitAuth
    const before = await $`git config --get http.https://github.com/.extraheader`.text();
    expect(before.trim()).toBe(HEADER_VALUE);

    await configureGitAuth(TEST_APP_TOKEN, mockContext, mockUser);

    // The extraheader should be gone
    const result = await $`git config --get http.https://github.com/.extraheader`.quiet().nothrow();
    expect(result.exitCode).not.toBe(0);
  });

  test("clears extraheader stored via includeIf (checkout v6 style)", async () => {
    // Simulate actions/checkout@v6 credential storage:
    // 1. Write extraheader to a separate config file
    await writeFile(
      credFile,
      [
        '[http "https://github.com/"]',
        `\textraheader = ${HEADER_VALUE}`,
        "",
      ].join("\n"),
    );
    // 2. Include that file via includeIf.gitdir
    await $`git config --local includeIf.gitdir:${repoDir}/.git.path ${credFile}`.quiet();

    // Verify the extraheader is visible via the include
    const before = await $`git config --get http.https://github.com/.extraheader`.text();
    expect(before.trim()).toBe(HEADER_VALUE);

    await configureGitAuth(TEST_APP_TOKEN, mockContext, mockUser);

    // After configureGitAuth, the checkout extraheader must not be resolvable
    const result = await $`git config --get http.https://github.com/.extraheader`.quiet().nothrow();
    expect(result.exitCode).not.toBe(0);
  });
});
