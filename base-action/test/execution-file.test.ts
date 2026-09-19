#!/usr/bin/env bun

import * as core from "@actions/core";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  initializeExecutionFile,
  setExecutionFileOutputIfPresent,
  writeExecutionFile,
} from "../src/execution-file";

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

  test("sets execution_file output for the current invocation only", async () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), "claude-execution-file-"));
    process.env.RUNNER_TEMP = tempDir;
    initializeExecutionFile();
    // Files left by older action versions must never be recovered.
    await writeFile(join(tempDir, "claude-execution-output.json"), "[]");

    try {
      expect(setExecutionFileOutputIfPresent()).toBeUndefined();
      expect(setOutputSpy).not.toHaveBeenCalled();
      const executionFile = await writeExecutionFile([]);
      expect(executionFile).toBeDefined();
      expect(setExecutionFileOutputIfPresent()).toBe(executionFile!);
      expect(setOutputSpy).toHaveBeenCalledWith(
        "execution_file",
        executionFile!,
      );
    } finally {
      setOutputSpy.mockRestore();
    }
  });
});
