import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  configureGitAuth,
  replaceCheckoutCredentials,
} from "../src/github/operations/git-config";
import { GITHUB_SERVER_URL } from "../src/github/api/config";
import { createMockAutomationContext } from "./mockContext";

// Derive host-specific expectations from GITHUB_SERVER_URL so the suite passes
// on GHES runners (where Actions exports that variable) as well as github.com.
const SERVER = new URL(GITHUB_SERVER_URL);
const NOREPLY_DOMAIN =
  SERVER.hostname === "github.com"
    ? "users.noreply.github.com"
    : `users.noreply.${SERVER.hostname}`;
const EXTRAHEADER_KEY = `http.${GITHUB_SERVER_URL}/.extraheader`;
const SSH_SIGNING_PROBE = join(
  import.meta.dir,
  "fixtures",
  "ssh-signing-probe.ts",
);

// git exports these into hooks (e.g. a pre-commit hook running the test
// suite); if inherited they would point every git command below at the
// enclosing repository instead of the temp repo.
const GIT_ENV_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
] as const;

// Pass an explicit env copy: unlike bun's `$`, execFileSync does not pick up
// deletions from process.env, so the GIT_* overrides removed in beforeEach
// would otherwise still reach the child process.
function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env },
  }).trim();
}

function gitConfigGetAll(key: string): string {
  try {
    return runGit(["config", "--local", "--get-all", key]);
  } catch {
    return "";
  }
}

function remoteUrl(): string {
  return runGit(["remote", "get-url", "origin"]);
}

describe("git-config", () => {
  let originalCwd: string;
  let tempDir: string;
  let repoDir: string;
  let originalActionPath: string | undefined;
  let originalNonWriteUsers: string | undefined;
  let originalGhToken: string | undefined;
  let originalGitEnv: Record<string, string | undefined>;
  let consoleLogSpy: any;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalActionPath = process.env.GITHUB_ACTION_PATH;
    originalNonWriteUsers = process.env.ALLOWED_NON_WRITE_USERS;
    originalGhToken = process.env.GH_TOKEN;
    delete process.env.ALLOWED_NON_WRITE_USERS;
    originalGitEnv = {};
    for (const name of GIT_ENV_OVERRIDES) {
      originalGitEnv[name] = process.env[name];
      delete process.env[name];
    }

    tempDir = mkdtempSync(join(tmpdir(), "git-config-test-"));
    repoDir = join(tempDir, "repo");
    runGit(["init", repoDir]);
    process.env.GITHUB_ACTION_PATH = tempDir;
    process.chdir(repoDir);

    git(["remote", "add", "origin", `https://${SERVER.host}/test/repo.git`]);
    // Mimic the credential actions/checkout persists in the local config
    git([
      "config",
      "--local",
      "--add",
      EXTRAHEADER_KEY,
      "AUTHORIZATION: basic one",
    ]);
    git([
      "config",
      "--local",
      "--add",
      EXTRAHEADER_KEY,
      "AUTHORIZATION: basic two",
    ]);
    git(["config", "--local", "user.name", "pre-existing"]);

    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    consoleLogSpy?.mockRestore();
    restoreEnv("GITHUB_ACTION_PATH", originalActionPath);
    restoreEnv("ALLOWED_NON_WRITE_USERS", originalNonWriteUsers);
    restoreEnv("GH_TOKEN", originalGhToken);
    for (const name of GIT_ENV_OVERRIDES) {
      restoreEnv(name, originalGitEnv[name]);
    }
  });

  describe("replaceCheckoutCredentials", () => {
    test("removes the checkout extraheader and sets a token remote URL", async () => {
      expect(gitConfigGetAll(EXTRAHEADER_KEY)).toContain("AUTHORIZATION");

      await replaceCheckoutCredentials(
        "test-token",
        createMockAutomationContext(),
      );

      expect(gitConfigGetAll(EXTRAHEADER_KEY)).toBe("");
      expect(remoteUrl()).toBe(
        `https://x-access-token:test-token@${SERVER.host}/test-owner/test-repo.git`,
      );
      // Only the credential is touched — the git identity is left alone
      expect(gitConfigGetAll("user.name")).toBe("pre-existing");
    });

    test("uses a credential helper when non-write users are allowed", async () => {
      process.env.ALLOWED_NON_WRITE_USERS = "someone";

      await replaceCheckoutCredentials(
        "helper-token",
        createMockAutomationContext(),
      );

      expect(gitConfigGetAll(EXTRAHEADER_KEY)).toBe("");
      expect(remoteUrl()).toBe(
        `https://${SERVER.host}/test-owner/test-repo.git`,
      );
      const helperPath = join(tempDir, ".git-credential-gh-token");
      expect(gitConfigGetAll("credential.helper")).toBe(helperPath);
      expect(statSync(helperPath).mode & 0o777).toBe(0o700);
      expect(process.env.GH_TOKEN).toBe("helper-token");
    });

    test("succeeds when there is no checkout extraheader to remove", async () => {
      git(["config", "--local", "--unset-all", EXTRAHEADER_KEY]);

      await expect(
        replaceCheckoutCredentials("test-token", createMockAutomationContext()),
      ).resolves.toBeUndefined();

      expect(remoteUrl()).toContain("x-access-token:test-token@");
    });
  });

  describe("configureGitAuth", () => {
    test("configures the git user and replaces the checkout credential", async () => {
      await configureGitAuth("test-token", createMockAutomationContext(), {
        login: "claude[bot]",
        id: 42,
      });

      expect(gitConfigGetAll("user.name")).toBe("claude[bot]");
      expect(gitConfigGetAll("user.email")).toBe(
        `42+claude[bot]@${NOREPLY_DOMAIN}`,
      );
      expect(gitConfigGetAll(EXTRAHEADER_KEY)).toBe("");
      expect(remoteUrl()).toBe(
        `https://x-access-token:test-token@${SERVER.host}/test-owner/test-repo.git`,
      );
    });
  });

  describe("cleanupSshSigning", () => {
    test("removes the signing config so a later commit succeeds", () => {
      runWithTempHome(["bun", "run", SSH_SIGNING_PROBE, "setup"]);
      const keyPath = join(tempDir, ".ssh", "claude_signing_key");
      expect(gitConfigGetAll("user.signingkey")).toBe(keyPath);
      expect(gitConfigGetAll("commit.gpgsign")).toBe("true");

      runWithTempHome(["bun", "run", SSH_SIGNING_PROBE, "cleanup"]);

      expect(existsSync(keyPath)).toBe(false);
      expect(gitConfigGetAll("gpg.format")).toBe("");
      expect(gitConfigGetAll("user.signingkey")).toBe("");
      expect(gitConfigGetAll("commit.gpgsign")).toBe("");
      runWithTempHome([
        "git",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--allow-empty",
        "-m",
        "later step",
      ]);
    });

    test("leaves signing config that points at another key", () => {
      git(["config", "--local", "gpg.format", "ssh"]);
      git(["config", "--local", "user.signingkey", "/home/user/.ssh/own_key"]);
      git(["config", "--local", "commit.gpgsign", "true"]);

      runWithTempHome(["bun", "run", SSH_SIGNING_PROBE, "cleanup"]);

      expect(gitConfigGetAll("gpg.format")).toBe("ssh");
      expect(gitConfigGetAll("user.signingkey")).toBe(
        "/home/user/.ssh/own_key",
      );
      expect(gitConfigGetAll("commit.gpgsign")).toBe("true");
    });
  });

  function git(args: string[]): void {
    runGit(args, repoDir);
  }

  // HOME points at the temp dir so the action's signing key path and git's
  // global config both resolve inside it instead of the developer's home.
  function runWithTempHome(cmd: string[]): void {
    const result = Bun.spawnSync({
      cmd,
      cwd: repoDir,
      env: { ...process.env, HOME: tempDir },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `${cmd.join(" ")} failed (exit ${result.exitCode}): ${result.stderr.toString()}`,
      );
    }
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
