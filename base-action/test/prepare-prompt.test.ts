#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { preparePrompt, type PreparePromptInput } from "../src/prepare-prompt";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";

describe("preparePrompt integration tests", () => {
  let tempDir: string;
  let originalRunnerTemp: string | undefined;

  beforeEach(async () => {
    originalRunnerTemp = process.env.RUNNER_TEMP;
    tempDir = await mkdtemp(join(tmpdir(), "prepare-claude-prompt-"));
    process.env.RUNNER_TEMP = tempDir;
  });

  afterEach(async () => {
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  test("concurrent inline prompts use separate files in the runner temp directory", async () => {
    const [first, second] = await Promise.all([
      preparePrompt({ prompt: "First prompt", promptFile: "" }),
      preparePrompt({ prompt: "Second prompt", promptFile: "" }),
    ]);

    expect(first.type).toBe("inline");
    expect(second.type).toBe("inline");
    expect(first.path).not.toBe(second.path);
    expect(dirname(dirname(first.path))).toBe(tempDir);
    expect(dirname(dirname(second.path))).toBe(tempDir);
    expect(await readFile(first.path, "utf-8")).toBe("First prompt");
    expect(await readFile(second.path, "utf-8")).toBe("Second prompt");
  });

  test("should use existing file when promptFile is provided", async () => {
    const testFilePath = join(tempDir, "test-prompt.txt");
    await writeFile(testFilePath, "Prompt from file");

    const input: PreparePromptInput = {
      prompt: "",
      promptFile: testFilePath,
    };

    const config = await preparePrompt(input);

    expect(config.path).toBe(testFilePath);
    expect(config.type).toBe("file");
  });

  test("should fail when neither prompt nor promptFile is provided", async () => {
    const input: PreparePromptInput = {
      prompt: "",
      promptFile: "",
    };

    await expect(preparePrompt(input)).rejects.toThrow(
      "Neither 'prompt' nor 'prompt_file' was provided",
    );
  });

  test("should fail when promptFile points to non-existent file", async () => {
    const promptFile = join(tempDir, "non-existent-file.txt");
    const input: PreparePromptInput = {
      prompt: "",
      promptFile,
    };

    await expect(preparePrompt(input)).rejects.toThrow(
      `Prompt file '${promptFile}' does not exist.`,
    );
  });

  test("should fail when prompt is empty", async () => {
    const emptyFilePath = join(tempDir, "empty-prompt.txt");
    await writeFile(emptyFilePath, "");

    const input: PreparePromptInput = {
      prompt: "",
      promptFile: emptyFilePath,
    };

    await expect(preparePrompt(input)).rejects.toThrow("Prompt file is empty");
  });

  test("should fail when both prompt and promptFile are provided", async () => {
    const testFilePath = join(tempDir, "test-prompt.txt");
    await writeFile(testFilePath, "Prompt from file");

    const input: PreparePromptInput = {
      prompt: "This should cause an error",
      promptFile: testFilePath,
    };

    await expect(preparePrompt(input)).rejects.toThrow(
      "Both 'prompt' and 'prompt_file' were provided. Please specify only one.",
    );
  });
});
