import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { getFileMode } from "../src/mcp/file-mode";
import { resolve } from "path";
import { mkdir, writeFile, symlink, rm, chmod } from "fs/promises";
import { tmpdir } from "os";

describe("getFileMode", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = resolve(tmpdir(), `file-mode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Regular file
    await writeFile(resolve(testDir, "regular.txt"), "hello");

    // Executable file
    const execPath = resolve(testDir, "script.sh");
    await writeFile(execPath, "#!/bin/sh\necho hi");
    await chmod(execPath, 0o755);

    // Directory
    await mkdir(resolve(testDir, "subdir"), { recursive: true });

    // Symbolic link pointing to regular file
    await symlink(
      resolve(testDir, "regular.txt"),
      resolve(testDir, "link.txt"),
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns 100644 for regular files", async () => {
    const mode = await getFileMode(resolve(testDir, "regular.txt"));
    expect(mode).toBe("100644");
  });

  it("returns 100755 for executable files", async () => {
    const mode = await getFileMode(resolve(testDir, "script.sh"));
    expect(mode).toBe("100755");
  });

  it("returns 040000 for directories", async () => {
    const mode = await getFileMode(resolve(testDir, "subdir"));
    expect(mode).toBe("040000");
  });

  it("returns 120000 for symbolic links", async () => {
    const mode = await getFileMode(resolve(testDir, "link.txt"));
    expect(mode).toBe("120000");
  });

  it("returns fallback 100644 for non-existent files", async () => {
    const mode = await getFileMode(resolve(testDir, "does-not-exist.txt"));
    expect(mode).toBe("100644");
  });
});
