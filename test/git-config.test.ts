#!/usr/bin/env bun

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
} from "bun:test";
import { $ } from "bun";
import { mkdtemp, rm, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildCleanRemoteUrl,
  cleanupGitAuth,
  configureGitAuth,
  getCredentialHelperPath,
  stripCredentialsFromRemoteUrl,
} from "../src/github/operations/git-config";
import type { GitHubContext } from "../src/github/context";

const TOKEN = "ghs_exampletokenvalue1234567890";

const context = {
  repository: { owner: "anthropics", repo: "claude-code-action" },
} as unknown as GitHubContext;

const user = { login: "claude[bot]", id: 1234 };

const cleanUrl = "https://github.com/anthropics/claude-code-action.git";
const tokenUrl = `https://x-access-token:${TOKEN}@github.com/anthropics/claude-code-action.git`;

async function readGitConfig(repoDir: string): Promise<string> {
  return readFile(join(repoDir, ".git", "config"), "utf-8");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("git auth cleanup", () => {
  const originalCwd = process.cwd();
  const originalActionPath = process.env.GITHUB_ACTION_PATH;
  const originalAllowedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
  let repoDir: string;
  let actionDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "claude-git-config-repo-"));
    actionDir = await mkdtemp(join(tmpdir(), "claude-git-config-action-"));
    process.env.GITHUB_ACTION_PATH = actionDir;
    delete process.env.ALLOWED_NON_WRITE_USERS;

    process.chdir(repoDir);
    await $`git init -q`.quiet();
    await $`git remote add origin ${cleanUrl}`.quiet();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(repoDir, { recursive: true, force: true });
    await rm(actionDir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.chdir(originalCwd);
    if (originalActionPath === undefined) {
      delete process.env.GITHUB_ACTION_PATH;
    } else {
      process.env.GITHUB_ACTION_PATH = originalActionPath;
    }
    if (originalAllowedNonWriteUsers === undefined) {
      delete process.env.ALLOWED_NON_WRITE_USERS;
    } else {
      process.env.ALLOWED_NON_WRITE_USERS = originalAllowedNonWriteUsers;
    }
  });

  test("removes the token configureGitAuth embedded in the origin URL", async () => {
    await configureGitAuth(TOKEN, context, user);

    // Precondition: the token really is in .git/config.
    expect(await readGitConfig(repoDir)).toContain("x-access-token");

    await cleanupGitAuth();

    const config = await readGitConfig(repoDir);
    expect(config).not.toContain("x-access-token");
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain("credential.helper");

    const origin = (await $`git remote get-url origin`.quiet().text()).trim();
    expect(origin).toBe(cleanUrl);
  });

  test("leaves origin usable for a later fetch-style operation", async () => {
    await $`git remote set-url origin ${tokenUrl}`.quiet();

    await cleanupGitAuth();

    const origin = (await $`git remote get-url origin`.quiet().text()).trim();
    expect(origin).toBe(cleanUrl);
    expect(origin).not.toContain("@");
  });

  test("removes the credential helper and its script (non-write-user path)", async () => {
    process.env.ALLOWED_NON_WRITE_USERS = "some-user";

    await configureGitAuth(TOKEN, context, user);

    const helperPath = getCredentialHelperPath();
    expect(await fileExists(helperPath)).toBe(true);
    // The non-write-user path deliberately keeps .git/config token-free.
    expect(await readGitConfig(repoDir)).not.toContain(TOKEN);

    await cleanupGitAuth();

    const config = await readGitConfig(repoDir);
    expect(config).not.toContain("x-access-token");
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain("helper");
    expect(await fileExists(helperPath)).toBe(false);
  });

  test("leaves a credential helper set by the workflow alone", async () => {
    await $`git config credential.helper store`.quiet();
    await $`git remote set-url origin ${tokenUrl}`.quiet();

    await cleanupGitAuth();

    // Read local config only: the machine running the tests may have a global
    // credential.helper of its own.
    const helpers = (
      await $`git config --local --get-all credential.helper`.quiet().text()
    ).trim();
    expect(helpers).toBe("store");
    expect(helpers).not.toContain(getCredentialHelperPath());
    expect(await readGitConfig(repoDir)).not.toContain("x-access-token");
  });

  test("is idempotent so a second invocation in the same job is safe", async () => {
    await configureGitAuth(TOKEN, context, user);

    await cleanupGitAuth();
    await cleanupGitAuth();

    const config = await readGitConfig(repoDir);
    expect(config).not.toContain("x-access-token");
    const origin = (await $`git remote get-url origin`.quiet().text()).trim();
    expect(origin).toBe(cleanUrl);
  });

  test("does not rewrite an ssh remote", async () => {
    const sshUrl = "git@github.com:anthropics/claude-code-action.git";
    await $`git remote set-url origin ${sshUrl}`.quiet();

    await cleanupGitAuth();

    const origin = (await $`git remote get-url origin`.quiet().text()).trim();
    expect(origin).toBe(sshUrl);
  });

  test("does not throw when there is no origin remote", async () => {
    await $`git remote remove origin`.quiet();

    await expect(cleanupGitAuth()).resolves.toBeUndefined();
  });
});

describe("remote URL helpers", () => {
  test("buildCleanRemoteUrl has no credentials", () => {
    expect(buildCleanRemoteUrl(context)).toBe(cleanUrl);
  });

  test("stripCredentialsFromRemoteUrl removes an embedded token", () => {
    expect(stripCredentialsFromRemoteUrl(tokenUrl)).toBe(cleanUrl);
  });

  test("stripCredentialsFromRemoteUrl returns null when nothing to strip", () => {
    expect(stripCredentialsFromRemoteUrl(cleanUrl)).toBeNull();
    expect(
      stripCredentialsFromRemoteUrl(
        "git@github.com:anthropics/claude-code-action.git",
      ),
    ).toBeNull();
  });
});
