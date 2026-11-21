#!/usr/bin/env bun

import * as core from "@actions/core";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
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

      expect(setOutputSpy).toHaveBeenCalledWith(
        "structured_output",
        structuredOutput,
      );
      const outputFileCall = setOutputSpy.mock.calls.find(
        ([name]) => name === "structured_output_file",
      );
      const outputFile = outputFileCall?.[1];
      if (typeof outputFile !== "string") {
        throw new Error("structured_output_file was not set to a path");
      }

      expect(basename(outputFile)).toBe("claude-structured-output.json");
      expect(dirname(outputFile)).toStartWith(
        join(tempDir, "claude-structured-output-"),
      );
      expect(await readFile(outputFile, "utf8")).toBe(structuredOutput);
      expect((await stat(outputFile)).mode & 0o777).toBe(0o600);
      expect((await stat(dirname(outputFile))).mode & 0o777).toBe(0o700);
    } finally {
      setOutputSpy.mockRestore();
    }
  });

  test("uses a distinct file for each invocation", async () => {
    const setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), "claude-structured-output-"));
    process.env.RUNNER_TEMP = tempDir;

    try {
      await publishStructuredOutput('{"run":1}');
      await publishStructuredOutput('{"run":2}');

      const outputFiles = setOutputSpy.mock.calls
        .filter(([name]) => name === "structured_output_file")
        .map(([, value]) => value);
      expect(outputFiles).toHaveLength(2);
      const [firstOutputFile, secondOutputFile] = outputFiles;
      if (
        typeof firstOutputFile !== "string" ||
        typeof secondOutputFile !== "string"
      ) {
        throw new Error("structured_output_file was not set to a path");
      }

      expect(firstOutputFile).not.toBe(secondOutputFile);
      expect(await readFile(firstOutputFile, "utf8")).toBe('{"run":1}');
      expect(await readFile(secondOutputFile, "utf8")).toBe('{"run":2}');
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
