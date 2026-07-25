import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import * as fsPromises from "fs/promises";
import { mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { homedir, tmpdir } from "os";
import {
  configureGitAuth,
  setupSshSigning,
  cleanupSshSigning,
} from "../src/github/operations/git-config";
import { createMockContext } from "./mockContext";

const SIGNING_KEY_PATH = join(homedir(), ".ssh", "claude_signing_key");
const VALID_KEY =
  "-----BEGIN OPENSSH PRIVATE KEY-----\nkey-content\n-----END OPENSSH PRIVATE KEY-----";

// The functions under test run real `git config` commands through Bun's $
// shell in the current working directory, so the suite chdirs into a
// throwaway git repository. File system writes (signing key, credential
// helper) are intercepted with spies so nothing touches the real home dir.
const repoDir = join(tmpdir(), `git-config-test-${process.pid}`);
const originalCwd = process.cwd();

function readGitConfig(key: string): string {
  return execFileSync("git", ["config", "--get", key], {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();
}

function readRemoteUrl(): string {
  return execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();
}

const ENV_KEYS = ["ALLOWED_NON_WRITE_USERS", "GH_TOKEN", "GITHUB_ACTION_PATH"];
const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

let mkdirSpy: ReturnType<typeof spyOn<typeof fsPromises, "mkdir">>;
let writeFileSpy: ReturnType<typeof spyOn<typeof fsPromises, "writeFile">>;
let rmSpy: ReturnType<typeof spyOn<typeof fsPromises, "rm">>;
let consoleLogSpy: ReturnType<typeof spyOn<typeof console, "log">>;
let consoleErrorSpy: ReturnType<typeof spyOn<typeof console, "error">>;

beforeAll(() => {
  mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repoDir });
  execFileSync(
    "git",
    ["remote", "add", "origin", "https://github.com/placeholder/repo.git"],
    { cwd: repoDir },
  );
  process.chdir(repoDir);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(repoDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  mkdirSpy = spyOn(fsPromises, "mkdir").mockResolvedValue(undefined);
  writeFileSpy = spyOn(fsPromises, "writeFile").mockResolvedValue(undefined);
  rmSpy = spyOn(fsPromises, "rm").mockResolvedValue(undefined);
  consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  mkdirSpy.mockRestore();
  writeFileSpy.mockRestore();
  rmSpy.mockRestore();
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe("setupSshSigning", () => {
  test("rejects an empty key", async () => {
    await expect(setupSshSigning("")).rejects.toThrow(
      "SSH signing key cannot be empty",
    );
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  test("rejects a whitespace-only key", async () => {
    await expect(setupSshSigning("   \n\t  ")).rejects.toThrow(
      "SSH signing key cannot be empty",
    );
  });

  test("rejects a key without the BEGIN marker", async () => {
    await expect(setupSshSigning("PRIVATE KEY but no begin")).rejects.toThrow(
      "Invalid SSH private key format",
    );
  });

  test("rejects a key without the PRIVATE KEY marker", async () => {
    await expect(setupSshSigning("-----BEGIN SOMETHING-----")).rejects.toThrow(
      "Invalid SSH private key format",
    );
  });

  test("writes the key with secure modes and configures git signing", async () => {
    await setupSshSigning(VALID_KEY);

    expect(mkdirSpy).toHaveBeenCalledWith(join(homedir(), ".ssh"), {
      recursive: true,
      mode: 0o700,
    });
    expect(writeFileSpy).toHaveBeenCalledWith(
      SIGNING_KEY_PATH,
      `${VALID_KEY}\n`,
      { mode: 0o600 },
    );
    expect(readGitConfig("gpg.format")).toBe("ssh");
    expect(readGitConfig("user.signingkey")).toBe(SIGNING_KEY_PATH);
    expect(readGitConfig("commit.gpgsign")).toBe("true");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Configuring SSH signing for commits...",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      `✓ SSH signing key written to ${SIGNING_KEY_PATH}`,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✓ Git configured to use SSH signing for commits",
    );
  });

  test("does not duplicate the trailing newline", async () => {
    await setupSshSigning(`${VALID_KEY}\n`);

    expect(writeFileSpy).toHaveBeenCalledWith(
      SIGNING_KEY_PATH,
      `${VALID_KEY}\n`,
      { mode: 0o600 },
    );
  });
});

describe("cleanupSshSigning", () => {
  test("force-removes the signing key file", async () => {
    await cleanupSshSigning();

    expect(rmSpy).toHaveBeenCalledWith(SIGNING_KEY_PATH, { force: true });
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ SSH signing key cleaned up");
  });

  test("does not throw when removal fails", async () => {
    rmSpy.mockRejectedValueOnce(new Error("locked"));

    await expect(cleanupSshSigning()).resolves.toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalledWith("No SSH signing key to clean up");
  });
});

describe("configureGitAuth", () => {
  const botUser = { login: "claude[bot]", id: 209825114 };

  test("configures the git user with the noreply email", async () => {
    const context = createMockContext();

    await configureGitAuth("tok-123", context, botUser);

    expect(readGitConfig("user.name")).toBe("claude[bot]");
    expect(readGitConfig("user.email")).toBe(
      "209825114+claude[bot]@users.noreply.github.com",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Configuring git authentication for non-signing mode",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("Configuring git user...");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Setting git user as claude[bot]...",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ Set git user as claude[bot]");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Removing existing git authentication headers...",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "No existing authentication headers to remove",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Git authentication configured successfully",
    );
  });

  test("embeds the token in the remote URL by default", async () => {
    const context = createMockContext();

    await configureGitAuth("tok-123", context, botUser);

    expect(readRemoteUrl()).toBe(
      "https://x-access-token:tok-123@github.com/test-owner/test-repo.git",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Updating remote URL with authentication...",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✓ Updated remote URL with authentication token",
    );
  });

  test("removes the authorization header set by actions/checkout", async () => {
    execFileSync(
      "git",
      [
        "config",
        "http.https://github.com/.extraheader",
        "AUTHORIZATION: basic abc",
      ],
      { cwd: repoDir },
    );

    await configureGitAuth("tok-123", createMockContext(), botUser);

    expect(() =>
      readGitConfig("http.https://github.com/.extraheader"),
    ).toThrow();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "✓ Removed existing authentication headers",
    );
  });

  test("uses a credential helper for non-write users instead of a token URL", async () => {
    process.env.ALLOWED_NON_WRITE_USERS = "trusted-user";
    process.env.GITHUB_ACTION_PATH = repoDir;
    const helperPath = join(repoDir, ".git-credential-gh-token");

    await configureGitAuth("tok-456", createMockContext(), botUser);

    expect(process.env.GH_TOKEN).toBe("tok-456");
    expect(writeFileSpy).toHaveBeenCalledWith(
      helperPath,
      '#!/bin/sh\necho username=x-access-token\necho password="$GH_TOKEN"\n',
      { mode: 0o700 },
    );
    expect(readRemoteUrl()).toBe("https://github.com/test-owner/test-repo.git");
    expect(readGitConfig("credential.helper")).toBe(helperPath);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Configuring git credential helper...",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ Configured credential helper");
  });
});
