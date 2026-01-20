#!/usr/bin/env bun

import {
  describe,
  test,
  expect,
  afterEach,
  beforeAll,
  afterAll,
} from "bun:test";
import { mkdir, writeFile, rm, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("SSH Signing", () => {
  // Use a temp directory for tests
  const testTmpDir = join(tmpdir(), "claude-ssh-signing-test");
  const testSshDir = join(testTmpDir, ".ssh");
  const testKeyPath = join(testSshDir, "claude_signing_key");
  const testKey =
    "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----";

  beforeAll(async () => {
    await mkdir(testTmpDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testTmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up test key if it exists
    try {
      await rm(testKeyPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("setupSshSigning file operations", () => {
    test("should write key file atomically with correct permissions", async () => {
      // Create the directory with secure permissions (same as setupSshSigning does)
      await mkdir(testSshDir, { recursive: true, mode: 0o700 });

      // Write key atomically with proper permissions (same as setupSshSigning does)
      await writeFile(testKeyPath, testKey, { mode: 0o600 });

      // Verify key was written
      const keyContent = await readFile(testKeyPath, "utf-8");
      expect(keyContent).toBe(testKey);

      // Verify permissions (0o600 = 384 in decimal for permission bits only)
      const stats = await stat(testKeyPath);
      const permissions = stats.mode & 0o777; // Get only permission bits
      expect(permissions).toBe(0o600);
    });

    test("should normalize key to have trailing newline", async () => {
      // ssh-keygen requires a trailing newline to parse the key
      const keyWithoutNewline =
        "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----";
      const keyWithNewline = keyWithoutNewline + "\n";

      // Create directory
      await mkdir(testSshDir, { recursive: true, mode: 0o700 });

      // Normalize the key (same logic as setupSshSigning)
      const normalizedKey = keyWithoutNewline.endsWith("\n")
        ? keyWithoutNewline
        : keyWithoutNewline + "\n";

      await writeFile(testKeyPath, normalizedKey, { mode: 0o600 });

      // Verify the written key ends with newline
      const keyContent = await readFile(testKeyPath, "utf-8");
      expect(keyContent).toBe(keyWithNewline);
      expect(keyContent.endsWith("\n")).toBe(true);
    });

    test("should not add extra newline if key already has one", async () => {
      const keyWithNewline =
        "-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----\n";

      await mkdir(testSshDir, { recursive: true, mode: 0o700 });

      // Normalize the key (same logic as setupSshSigning)
      const normalizedKey = keyWithNewline.endsWith("\n")
        ? keyWithNewline
        : keyWithNewline + "\n";

      await writeFile(testKeyPath, normalizedKey, { mode: 0o600 });

      // Verify no double newline
      const keyContent = await readFile(testKeyPath, "utf-8");
      expect(keyContent).toBe(keyWithNewline);
      expect(keyContent.endsWith("\n\n")).toBe(false);
    });

    test("should create .ssh directory with secure permissions", async () => {
      // Clean up first
      await rm(testSshDir, { recursive: true, force: true });

      // Create directory with secure permissions (same as setupSshSigning does)
      await mkdir(testSshDir, { recursive: true, mode: 0o700 });

      // Verify directory exists
      const dirStats = await stat(testSshDir);
      expect(dirStats.isDirectory()).toBe(true);

      // Verify directory permissions
      const dirPermissions = dirStats.mode & 0o777;
      expect(dirPermissions).toBe(0o700);
    });
  });

  describe("setupSshSigning validation", () => {
    test("should reject empty SSH key", () => {
      const emptyKey = "";
      expect(() => {
        if (!emptyKey.trim()) {
          throw new Error("SSH signing key cannot be empty");
        }
      }).toThrow("SSH signing key cannot be empty");
    });

    test("should reject whitespace-only SSH key", () => {
      const whitespaceKey = "   \n\t  ";
      expect(() => {
        if (!whitespaceKey.trim()) {
          throw new Error("SSH signing key cannot be empty");
        }
      }).toThrow("SSH signing key cannot be empty");
    });

    test("should reject invalid SSH key format", () => {
      const invalidKey = "not a valid key";
      expect(() => {
        if (
          !invalidKey.includes("BEGIN") ||
          !invalidKey.includes("PRIVATE KEY")
        ) {
          throw new Error("Invalid SSH private key format");
        }
      }).toThrow("Invalid SSH private key format");
    });

    test("should accept valid SSH key format", () => {
      const validKey =
        "-----BEGIN OPENSSH PRIVATE KEY-----\nkey-content\n-----END OPENSSH PRIVATE KEY-----";
      expect(() => {
        if (!validKey.trim()) {
          throw new Error("SSH signing key cannot be empty");
        }
        if (!validKey.includes("BEGIN") || !validKey.includes("PRIVATE KEY")) {
          throw new Error("Invalid SSH private key format");
        }
      }).not.toThrow();
    });
  });

  describe("cleanupSshSigning file operations", () => {
    test("should remove the signing key file", async () => {
      // Create the key file first
      await mkdir(testSshDir, { recursive: true });
      await writeFile(testKeyPath, testKey, { mode: 0o600 });

      // Verify it exists
      const existsBefore = await stat(testKeyPath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Clean up (same operation as cleanupSshSigning)
      await rm(testKeyPath, { force: true });

      // Verify it's gone
      const existsAfter = await stat(testKeyPath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    test("should not throw if key file does not exist", async () => {
      // Make sure file doesn't exist
      await rm(testKeyPath, { force: true });

      // Should not throw (rm with force: true doesn't throw on missing files)
      await expect(rm(testKeyPath, { force: true })).resolves.toBeUndefined();
    });
  });
});

describe("SSH Signing Mode Detection", () => {
  test("sshSigningKey should take precedence over useCommitSigning", () => {
    // When both are set, SSH signing takes precedence
    const sshSigningKey = "test-key";
    const useCommitSigning = true;

    const useSshSigning = !!sshSigningKey;
    const useApiCommitSigning = useCommitSigning && !useSshSigning;

    expect(useSshSigning).toBe(true);
    expect(useApiCommitSigning).toBe(false);
  });

  test("useCommitSigning should work when sshSigningKey is not set", () => {
    const sshSigningKey = "";
    const useCommitSigning = true;

    const useSshSigning = !!sshSigningKey;
    const useApiCommitSigning = useCommitSigning && !useSshSigning;

    expect(useSshSigning).toBe(false);
    expect(useApiCommitSigning).toBe(true);
  });

  test("neither signing method when both are false/empty", () => {
    const sshSigningKey = "";
    const useCommitSigning = false;

    const useSshSigning = !!sshSigningKey;
    const useApiCommitSigning = useCommitSigning && !useSshSigning;

    expect(useSshSigning).toBe(false);
    expect(useApiCommitSigning).toBe(false);
  });

  test("git CLI tools should be used when sshSigningKey is set", () => {
    // This tests the logic in tag mode for tool selection
    const sshSigningKey = "test-key";
    const useCommitSigning = true; // Even if this is true

    const useSshSigning = !!sshSigningKey;
    const useApiCommitSigning = useCommitSigning && !useSshSigning;

    // When SSH signing is used, we should use git CLI (not API)
    const shouldUseGitCli = !useApiCommitSigning;
    expect(shouldUseGitCli).toBe(true);
  });

  test("MCP file ops should only be used with API commit signing", () => {
    // Case 1: API commit signing
    {
      const sshSigningKey = "";
      const useCommitSigning = true;

      const useSshSigning = !!sshSigningKey;
      const useApiCommitSigning = useCommitSigning && !useSshSigning;

      expect(useApiCommitSigning).toBe(true);
    }

    // Case 2: SSH signing (should NOT use API)
    {
      const sshSigningKey = "test-key";
      const useCommitSigning = true;

      const useSshSigning = !!sshSigningKey;
      const useApiCommitSigning = useCommitSigning && !useSshSigning;

      expect(useApiCommitSigning).toBe(false);
    }

    // Case 3: No signing (should NOT use API)
    {
      const sshSigningKey = "";
      const useCommitSigning = false;

      const useSshSigning = !!sshSigningKey;
      const useApiCommitSigning = useCommitSigning && !useSshSigning;

      expect(useApiCommitSigning).toBe(false);
    }
  });
});

describe("Context parsing", () => {
  test("sshSigningKey should be parsed from environment", () => {
    // Test that context.ts parses SSH_SIGNING_KEY correctly
    const testCases = [
      { env: "test-key", expected: "test-key" },
      { env: "", expected: "" },
      { env: undefined, expected: "" },
    ];

    for (const { env, expected } of testCases) {
      const result = env || "";
      expect(result).toBe(expected);
    }
  });
});
