import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { mergeExecutionFiles } from "../../../src/modes/review/merge-execution";

describe("mergeExecutionFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `merge-exec-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should merge multiple execution files into one", async () => {
    const file1 = join(tempDir, "exec1.json");
    const file2 = join(tempDir, "exec2.json");
    const output = join(tempDir, "merged.json");

    await writeFile(file1, JSON.stringify([{ type: "message", content: "a" }]));
    await writeFile(file2, JSON.stringify([{ type: "message", content: "b" }]));

    await mergeExecutionFiles([file1, file2], output);

    const result = JSON.parse(await readFile(output, "utf-8"));
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a");
    expect(result[1].content).toBe("b");
  });

  it("should skip non-existent files", async () => {
    const file1 = join(tempDir, "exec1.json");
    const nonExistent = join(tempDir, "nonexistent.json");
    const output = join(tempDir, "merged.json");

    await writeFile(file1, JSON.stringify([{ type: "message", content: "a" }]));

    await mergeExecutionFiles([file1, nonExistent], output);

    const result = JSON.parse(await readFile(output, "utf-8"));
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("a");
  });

  it("should produce empty array when no files exist", async () => {
    const output = join(tempDir, "merged.json");

    await mergeExecutionFiles(
      [join(tempDir, "nope1.json"), join(tempDir, "nope2.json")],
      output,
    );

    const result = JSON.parse(await readFile(output, "utf-8"));
    expect(result).toEqual([]);
  });

  it("should handle files with multiple entries", async () => {
    const file1 = join(tempDir, "exec1.json");
    const output = join(tempDir, "merged.json");

    await writeFile(
      file1,
      JSON.stringify([
        { type: "a", data: 1 },
        { type: "b", data: 2 },
        { type: "c", data: 3 },
      ]),
    );

    await mergeExecutionFiles([file1], output);

    const result = JSON.parse(await readFile(output, "utf-8"));
    expect(result).toHaveLength(3);
  });

  it("should skip files with invalid JSON gracefully", async () => {
    const file1 = join(tempDir, "exec1.json");
    const fileBad = join(tempDir, "bad.json");
    const output = join(tempDir, "merged.json");

    await writeFile(file1, JSON.stringify([{ type: "valid" }]));
    await writeFile(fileBad, "not valid json {{{");

    await mergeExecutionFiles([file1, fileBad], output);

    const result = JSON.parse(await readFile(output, "utf-8"));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("valid");
  });
});
