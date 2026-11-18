#!/usr/bin/env bun

import * as core from "@actions/core";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
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

  test("writes execution JSON without unpaired surrogate escapes", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "claude-execution-file-"));
    process.env.RUNNER_TEMP = tempDir;
    const executionFile = join(tempDir, "claude-execution-output.json");

    expect(
      await writeExecutionFile([
        {
          text: "Résumé 😀 \uD800 \uDFFF",
          literalEscape: "\\ud800",
          escapeBeforeSurrogate: "\\\uD800",
          "\uD800 key": "\uD801\uDC37",
        },
      ]),
    ).toBe(executionFile);

    expect(JSON.parse(await readFile(executionFile, "utf-8"))).toEqual([
      {
        text: "Résumé 😀 \uFFFD \uFFFD",
        literalEscape: "\\ud800",
        escapeBeforeSurrogate: "\\\uFFFD",
        "\uFFFD key": "\uD801\uDC37",
      },
    ]);
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
