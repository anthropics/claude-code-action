import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { validatePathWithinRepo } from "../src/mcp/path-validation";
import { resolve } from "path";
import { mkdir, writeFile, symlink, rm, realpath } from "fs/promises";
import { tmpdir } from "os";

describe("validatePathWithinRepo", () => {
  // Use a real temp directory for tests that need filesystem access
  let testDir: string;
  let repoRoot: string;
  let outsideDir: string;
  // Real paths after symlink resolution (e.g., /tmp -> /private/tmp on macOS)
  let realRepoRoot: string;

  beforeAll(async () => {
    // Create test directory structure
    testDir = resolve(tmpdir(), `path-validation-test-${Date.now()}`);
    repoRoot = resolve(testDir, "repo");
    outsideDir = resolve(testDir, "outside");

    await mkdir(repoRoot, { recursive: true });
    await mkdir(resolve(repoRoot, "src"), { recursive: true });
    await mkdir(outsideDir, { recursive: true });

    // Create test files
    await writeFile(resolve(repoRoot, "file.txt"), "inside repo");
    await writeFile(resolve(repoRoot, "src", "main.js"), "console.log('hi')");
    await writeFile(resolve(outsideDir, "secret.txt"), "sensitive data");

    // Get real paths after symlink resolution
    realRepoRoot = await realpath(repoRoot);
  });

  afterAll(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  describe("valid paths", () => {
    it("should accept simple relative paths", async () => {
      const result = await validatePathWithinRepo("file.txt", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "file.txt"));
    });

    it("should accept nested relative paths", async () => {
      const result = await validatePathWithinRepo("src/main.js", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "src/main.js"));
    });

    it("should accept paths with single dot segments", async () => {
      const result = await validatePathWithinRepo("./src/main.js", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "src/main.js"));
    });

    it("should accept paths that use .. but resolve inside repo", async () => {
      // src/../file.txt resolves to file.txt which is still inside repo
      const result = await validatePathWithinRepo("src/../file.txt", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "file.txt"));
    });

    it("should accept absolute paths within the repo root", async () => {
      const absolutePath = resolve(repoRoot, "file.txt");
      const result = await validatePathWithinRepo(absolutePath, repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "file.txt"));
    });

    it("should accept the repo root itself", async () => {
      const result = await validatePathWithinRepo(".", repoRoot);
      expect(result).toBe(realRepoRoot);
    });

    it("should handle new files (non-existent) in valid directories", async () => {
      const result = await validatePathWithinRepo("src/newfile.js", repoRoot);
      // For non-existent files, we validate the parent but return the initial path
      // (can't realpath a file that doesn't exist yet)
      expect(result).toBe(resolve(repoRoot, "src/newfile.js"));
    });
  });

  describe("path traversal attacks", () => {
    it("should reject simple parent directory traversal", async () => {
      await expect(
        validatePathWithinRepo("../outside/secret.txt", repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });

    it("should reject deeply nested parent directory traversal", async () => {
      await expect(
        validatePathWithinRepo("../../../etc/passwd", repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });

    it("should reject traversal hidden within path", async () => {
      await expect(
        validatePathWithinRepo("src/../../outside/secret.txt", repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });

    it("should reject traversal at the end of path", async () => {
      await expect(
        validatePathWithinRepo("src/../..", repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });

    it("should reject absolute paths outside the repo root", async () => {
      await expect(
        validatePathWithinRepo("/etc/passwd", repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });

    it("should reject absolute paths to sibling directories", async () => {
      await expect(
        validatePathWithinRepo(resolve(outsideDir, "secret.txt"), repoRoot),
      ).rejects.toThrow(/resolves outside the repository root/);
    });
  });

  describe("symlink attacks", () => {
    it("should reject symlinks pointing outside the repo", async () => {
      // Create a symlink inside the repo that points to a file outside
      const symlinkPath = resolve(repoRoot, "evil-link");
      await symlink(resolve(outsideDir, "secret.txt"), symlinkPath);

      try {
        // The symlink path looks like it's inside the repo, but points outside
        await expect(
          validatePathWithinRepo("evil-link", repoRoot),
        ).rejects.toThrow(/resolves outside the repository root/);
      } finally {
        await rm(symlinkPath, { force: true });
      }
    });

    it("should reject symlinks to parent directories", async () => {
      // Create a symlink to the parent directory
      const symlinkPath = resolve(repoRoot, "parent-link");
      await symlink(testDir, symlinkPath);

      try {
        await expect(
          validatePathWithinRepo("parent-link/outside/secret.txt", repoRoot),
        ).rejects.toThrow(/resolves outside the repository root/);
      } finally {
        await rm(symlinkPath, { force: true });
      }
    });

    it("should accept symlinks that resolve within the repo", async () => {
      // Create a symlink inside the repo that points to another file inside
      const symlinkPath = resolve(repoRoot, "good-link");
      await symlink(resolve(repoRoot, "file.txt"), symlinkPath);

      try {
        const result = await validatePathWithinRepo("good-link", repoRoot);
        // Should resolve to the actual file location
        expect(result).toBe(resolve(realRepoRoot, "file.txt"));
      } finally {
        await rm(symlinkPath, { force: true });
      }
    });

    it("should reject directory symlinks that escape the repo", async () => {
      // Create a symlink to outside directory
      const symlinkPath = resolve(repoRoot, "escape-dir");
      await symlink(outsideDir, symlinkPath);

      try {
        await expect(
          validatePathWithinRepo("escape-dir/secret.txt", repoRoot),
        ).rejects.toThrow(/resolves outside the repository root/);
      } finally {
        await rm(symlinkPath, { force: true });
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty path (current directory)", async () => {
      const result = await validatePathWithinRepo("", repoRoot);
      expect(result).toBe(realRepoRoot);
    });

    it("should handle paths with multiple consecutive slashes", async () => {
      const result = await validatePathWithinRepo("src//main.js", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "src/main.js"));
    });

    it("should handle paths with trailing slashes", async () => {
      const result = await validatePathWithinRepo("src/", repoRoot);
      expect(result).toBe(resolve(realRepoRoot, "src"));
    });

    it("should reject prefix attack (repo root as prefix but not parent)", async () => {
      // Create a sibling directory with repo name as prefix
      const evilDir = repoRoot + "-evil";
      await mkdir(evilDir, { recursive: true });
      await writeFile(resolve(evilDir, "file.txt"), "evil");

      try {
        await expect(
          validatePathWithinRepo(resolve(evilDir, "file.txt"), repoRoot),
        ).rejects.toThrow(/resolves outside the repository root/);
      } finally {
        await rm(evilDir, { recursive: true, force: true });
      }
    });

    it("should throw error for non-existent repo root", async () => {
      await expect(
        validatePathWithinRepo("file.txt", "/nonexistent/repo"),
      ).rejects.toThrow(/does not exist/);
    });
  });
});
