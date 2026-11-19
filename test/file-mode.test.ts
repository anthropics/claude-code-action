import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "child_process";
import { chmod, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getFileMode } from "../src/mcp/file-mode";

describe("getFileMode", () => {
  let repoDir: string;

  function git(...args: string[]) {
    return execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
  }

  async function trackFile(name: string, executable: boolean) {
    const filePath = join(repoDir, name);
    await writeFile(filePath, "#!/bin/sh\necho hello\n");
    git("add", "--", name);
    git("update-index", executable ? "--chmod=+x" : "--chmod=-x", "--", name);
    // Windows checkout permissions cannot represent the executable bit.
    await chmod(filePath, 0o644);
    return filePath;
  }

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "file-mode-test-"));
    git("init", "--quiet");
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("preserves a tracked executable's index mode on Windows", async () => {
    const filePath = await trackFile("build.sh", true);
    expect(await getFileMode(filePath, repoDir, "win32")).toBe("100755");
  });

  it("looks up filenames with spaces and pathspec characters literally", async () => {
    await trackFile("build d.sh", false);
    const filePath = await trackFile("build [debug].sh", true);
    expect(await getFileMode(filePath, repoDir, "win32")).toBe("100755");
  });

  it("preserves a tracked regular file's mode on Windows", async () => {
    const filePath = await trackFile("README.md", false);
    if (process.platform !== "win32") await chmod(filePath, 0o755);
    expect(await getFileMode(filePath, repoDir, "win32")).toBe("100644");
  });

  it("uses the filesystem mode for an untracked file", async () => {
    const filePath = join(repoDir, "new.txt");
    await writeFile(filePath, "new file\n");
    await chmod(filePath, 0o644);
    expect(await getFileMode(filePath, repoDir, "win32")).toBe("100644");
  });

  it.skipIf(process.platform === "win32")(
    "honors executable-bit changes on Unix even when the index differs",
    async () => {
      const filePath = await trackFile("build.sh", true);
      expect(await getFileMode(filePath, repoDir, "linux")).toBe("100644");
      await chmod(filePath, 0o755);
      git("update-index", "--chmod=-x", "--", "build.sh");
      expect(await getFileMode(filePath, repoDir, "linux")).toBe("100755");
    },
  );
});
