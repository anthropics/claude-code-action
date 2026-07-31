#!/usr/bin/env bun

/**
 * Tests for SSH commit signing and git authentication.
 *
 * These exercise the real implementations exported from
 * src/github/operations/git-config.ts against a throwaway git repository,
 * rather than re-stating their logic inline.
 *
 * os.homedir() is mocked before git-config is imported because the module
 * computes SSH_SIGNING_KEY_PATH once at load time — mocking afterwards would
 * leave the constant pointing at the real ~/.ssh.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import * as realOs from "os";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { $ } from "bun";

const fakeHome = await mkdtemp(join(realOs.tmpdir(), "claude-ssh-home-"));
const mockedOs = { ...realOs, homedir: () => fakeHome };
mock.module("os", () => ({ ...mockedOs, default: mockedOs }));

const { setupSshSigning, cleanupSshSigning, configureGitAuth } = await import(
  "../src/github/operations/git-config"
);
const { createMockContext } = await import("./mockContext");

const SSH_DIR = join(fakeHome, ".ssh");
const SIGNING_KEY_PATH = join(SSH_DIR, "claude_signing_key");
const VALID_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----";

const originalCwd = process.cwd();
const originalActionPath = process.env.GITHUB_ACTION_PATH;
const originalAllowedNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
const originalGhToken = process.env.GH_TOKEN;

const scratchDirs: string[] = [];

/** Create a throwaway git repo with an `origin` remote and chdir into it. */
async function useScratchRepo(): Promise<string> {
  const repo = await mkdtemp(join(realOs.tmpdir(), "claude-ssh-repo-"));
  scratchDirs.push(repo);
  process.chdir(repo);
  await $`git init -q`.quiet();
  await $`git remote add origin https://github.com/test-owner/test-repo.git`.quiet();
  return repo;
}

/**
 * Read a repository-local git config value, or null when unset.
 *
 * `--local` is deliberate: a developer's (or CI runner's) global gitconfig may
 * already set commit.gpgsign/gpg.format, which would make these assertions pass
 * without the code under test having done anything.
 */
async function gitConfigGet(key: string): Promise<string | null> {
  try {
    return (await $`git config --local --get ${key}`.quiet().text()).trim();
  } catch {
    return null;
  }
}

/**
 * Read the raw configured origin URL.
 *
 * Deliberately not `git remote get-url`, which applies any `url.*.insteadOf`
 * rewrites from the global config and would hide what was actually stored.
 */
async function originUrl(): Promise<string | null> {
  return gitConfigGet("remote.origin.url");
}

beforeEach(async () => {
  delete process.env.ALLOWED_NON_WRITE_USERS;
  delete process.env.GH_TOKEN;
  await useScratchRepo();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(SIGNING_KEY_PATH, { force: true });
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(fakeHome, { recursive: true, force: true });
  await Promise.all(
    scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };
  restore("GITHUB_ACTION_PATH", originalActionPath);
  restore("ALLOWED_NON_WRITE_USERS", originalAllowedNonWriteUsers);
  restore("GH_TOKEN", originalGhToken);
});

describe("setupSshSigning validation", () => {
  test("rejects an empty key", async () => {
    await expect(setupSshSigning("")).rejects.toThrow(
      "SSH signing key cannot be empty",
    );
  });

  test("rejects a whitespace-only key", async () => {
    await expect(setupSshSigning("   \n\t  ")).rejects.toThrow(
      "SSH signing key cannot be empty",
    );
  });

  test("rejects a key without PEM markers", async () => {
    await expect(setupSshSigning("not a valid key")).rejects.toThrow(
      "Invalid SSH private key format",
    );
  });

  test("rejects a key with BEGIN but no PRIVATE KEY marker", async () => {
    await expect(
      setupSshSigning("-----BEGIN CERTIFICATE-----\nabc\n"),
    ).rejects.toThrow("Invalid SSH private key format");
  });

  test("writes nothing to disk when validation fails", async () => {
    await expect(setupSshSigning("not a valid key")).rejects.toThrow();
    expect(await Bun.file(SIGNING_KEY_PATH).exists()).toBe(false);
  });

  test("leaves git signing config untouched when validation fails", async () => {
    await expect(setupSshSigning("")).rejects.toThrow();
    expect(await gitConfigGet("commit.gpgsign")).toBeNull();
    expect(await gitConfigGet("gpg.format")).toBeNull();
  });
});

describe("setupSshSigning key material", () => {
  test("writes the key with owner-only permissions", async () => {
    await setupSshSigning(VALID_KEY);

    expect(await readFile(SIGNING_KEY_PATH, "utf-8")).toBe(VALID_KEY + "\n");
    expect((await stat(SIGNING_KEY_PATH)).mode & 0o777).toBe(0o600);
  });

  test("creates the .ssh directory with owner-only permissions", async () => {
    await setupSshSigning(VALID_KEY);

    const stats = await stat(SSH_DIR);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.mode & 0o777).toBe(0o700);
  });

  test("appends a trailing newline so ssh-keygen can parse the key", async () => {
    await setupSshSigning(VALID_KEY);

    const written = await readFile(SIGNING_KEY_PATH, "utf-8");
    expect(written.endsWith("\n")).toBe(true);
    expect(written).toBe(VALID_KEY + "\n");
  });

  test("does not add a second newline when the key already ends with one", async () => {
    await setupSshSigning(VALID_KEY + "\n");

    const written = await readFile(SIGNING_KEY_PATH, "utf-8");
    expect(written).toBe(VALID_KEY + "\n");
    expect(written.endsWith("\n\n")).toBe(false);
  });

  test("overwrites a stale key from a previous run", async () => {
    await mkdir(SSH_DIR, { recursive: true, mode: 0o700 });
    await writeFile(SIGNING_KEY_PATH, "stale-key-content\n", { mode: 0o600 });

    await setupSshSigning(VALID_KEY);

    const written = await readFile(SIGNING_KEY_PATH, "utf-8");
    expect(written).toBe(VALID_KEY + "\n");
    expect(written).not.toContain("stale-key-content");
    expect((await stat(SIGNING_KEY_PATH)).mode & 0o777).toBe(0o600);
  });
});

describe("setupSshSigning git configuration", () => {
  test("configures git to sign commits with the written key", async () => {
    await setupSshSigning(VALID_KEY);

    expect(await gitConfigGet("gpg.format")).toBe("ssh");
    expect(await gitConfigGet("commit.gpgsign")).toBe("true");
    expect(await gitConfigGet("user.signingkey")).toBe(SIGNING_KEY_PATH);
  });

  test("points user.signingkey at a file that actually exists", async () => {
    await setupSshSigning(VALID_KEY);

    const configured = await gitConfigGet("user.signingkey");
    expect(configured).not.toBeNull();
    expect(await Bun.file(configured!).exists()).toBe(true);
  });
});

describe("cleanupSshSigning", () => {
  test("removes the signing key", async () => {
    await setupSshSigning(VALID_KEY);
    expect(await Bun.file(SIGNING_KEY_PATH).exists()).toBe(true);

    await cleanupSshSigning();

    expect(await Bun.file(SIGNING_KEY_PATH).exists()).toBe(false);
  });

  test("resolves without throwing when no key is present", async () => {
    expect(await Bun.file(SIGNING_KEY_PATH).exists()).toBe(false);

    await expect(cleanupSshSigning()).resolves.toBeUndefined();
  });

  test("is safe to call twice", async () => {
    await setupSshSigning(VALID_KEY);

    await cleanupSshSigning();
    await expect(cleanupSshSigning()).resolves.toBeUndefined();
    expect(await Bun.file(SIGNING_KEY_PATH).exists()).toBe(false);
  });
});

describe("configureGitAuth identity", () => {
  const user = { login: "claude[bot]", id: 1234 };

  test("sets the git user to the provided bot identity", async () => {
    await configureGitAuth("ghs_token", createMockContext(), user);

    expect(await gitConfigGet("user.name")).toBe("claude[bot]");
    expect(await gitConfigGet("user.email")).toBe(
      "1234+claude[bot]@users.noreply.github.com",
    );
  });
});

describe("configureGitAuth token handling", () => {
  const user = { login: "claude[bot]", id: 1234 };

  test("embeds the token in the origin URL by default", async () => {
    await configureGitAuth("ghs_secret_token", createMockContext(), user);

    expect(await originUrl()).toBe(
      "https://x-access-token:ghs_secret_token@github.com/test-owner/test-repo.git",
    );
  });

  describe("with ALLOWED_NON_WRITE_USERS set", () => {
    let actionPath: string;

    beforeEach(async () => {
      process.env.ALLOWED_NON_WRITE_USERS = "some-user";
      actionPath = await mkdtemp(join(realOs.tmpdir(), "claude-action-path-"));
      scratchDirs.push(actionPath);
      process.env.GITHUB_ACTION_PATH = actionPath;
    });

    test("keeps the token out of the origin URL", async () => {
      await configureGitAuth("ghs_secret_token", createMockContext(), user);

      const remote = await originUrl();
      expect(remote).toBe("https://github.com/test-owner/test-repo.git");
      expect(remote).not.toContain("ghs_secret_token");
    });

    test("keeps the token out of .git/config entirely", async () => {
      const repo = process.cwd();
      await configureGitAuth("ghs_secret_token", createMockContext(), user);

      const gitConfigContents = await readFile(
        join(repo, ".git", "config"),
        "utf-8",
      );
      expect(gitConfigContents).not.toContain("ghs_secret_token");
    });

    test("configures a credential helper that reads the token from GH_TOKEN", async () => {
      await configureGitAuth("ghs_secret_token", createMockContext(), user);

      const helperPath = join(actionPath, ".git-credential-gh-token");
      expect(await gitConfigGet("credential.helper")).toBe(helperPath);

      const helper = await readFile(helperPath, "utf-8");
      expect(helper).toContain("username=x-access-token");
      expect(helper).toContain('password="$GH_TOKEN"');
      expect(helper).not.toContain("ghs_secret_token");
    });

    test("writes the credential helper as an owner-only executable", async () => {
      await configureGitAuth("ghs_secret_token", createMockContext(), user);

      const helperPath = join(actionPath, ".git-credential-gh-token");
      expect((await stat(helperPath)).mode & 0o777).toBe(0o700);
    });

    test("exports the token via GH_TOKEN for the helper to read", async () => {
      await configureGitAuth("ghs_secret_token", createMockContext(), user);

      expect(process.env.GH_TOKEN).toBe("ghs_secret_token");
    });
  });
});
