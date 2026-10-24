#!/usr/bin/env bun

import * as core from "@actions/core";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { publishStructuredOutput } from "../src/structured-output-file";

describe("publishStructuredOutput", () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp;
    }
  });

  test("sets the JSON output and writes the same bytes to a private file", async () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), "claude-structured-output-"));
    process.env.RUNNER_TEMP = tempDir;
    const structuredOutput = JSON.stringify({
      verdict: "approve",
      report_markdown: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.example",
    });

    try {
      await publishStructuredOutput(structuredOutput);

      const outputFile = join(tempDir, "claude-structured-output.json");
      expect(setOutputSpy).toHaveBeenCalledWith(
        "structured_output",
        structuredOutput,
      );
      expect(setOutputSpy).toHaveBeenCalledWith(
        "structured_output_file",
        outputFile,
      );
      expect(await readFile(outputFile, "utf8")).toBe(structuredOutput);
      expect((await stat(outputFile)).mode & 0o777).toBe(0o600);
    } finally {
      setOutputSpy.mockRestore();
    }
  });

  test("still sets the JSON output when RUNNER_TEMP is unset", async () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    const warningSpy = spyOn(core, "warning").mockImplementation(() => {});
    delete process.env.RUNNER_TEMP;

    try {
      await publishStructuredOutput('{"ok":true}');
      expect(setOutputSpy).toHaveBeenCalledTimes(1);
      expect(setOutputSpy).toHaveBeenCalledWith(
        "structured_output",
        '{"ok":true}',
      );
      expect(warningSpy).toHaveBeenCalledWith(
        "Failed to write structured output file: RUNNER_TEMP is not set",
      );
    } finally {
      setOutputSpy.mockRestore();
      warningSpy.mockRestore();
    }
  });
});
