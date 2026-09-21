#!/usr/bin/env bun

import * as core from "@actions/core";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setExecutionFileOutputIfPresent } from "../src/execution-file";

describe("execution file output", () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    process.env.RUNNER_TEMP = originalRunnerTemp;
  });

  test("sets execution_file output when the default execution file exists", async () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), "claude-execution-file-"));
    process.env.RUNNER_TEMP = tempDir;
    const executionFile = join(tempDir, "claude-execution-output.json");
    await writeFile(executionFile, "[]");

    try {
      expect(setExecutionFileOutputIfPresent()).toBe(executionFile);
      expect(setOutputSpy).toHaveBeenCalledWith(
        "execution_file",
        executionFile,
      );
    } finally {
      setOutputSpy.mockRestore();
    }
  });
});
