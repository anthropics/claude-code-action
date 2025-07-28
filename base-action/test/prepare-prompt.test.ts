#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { preparePrompt, type PreparePromptInput } from "../src/prepare-prompt";
import { unlink, writeFile, readFile, stat } from "fs/promises";

describe("preparePrompt integration tests", () => {
  beforeEach(async () => {
    try {
      await unlink("/tmp/claude-action/prompt.txt");
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    try {
      await unlink("/tmp/claude-action/prompt.txt");
    } catch {
      // Ignore if file doesn't exist
    }
  });

  test("should create temporary prompt file when only prompt is provided", async () => {
    const input: PreparePromptInput = {
      prompt: "This is a test prompt",
      promptFile: "",
    };

    const config = await preparePrompt(input);

    expect(config.path).toBe("/tmp/claude-action/prompt.txt");
    expect(config.type).toBe("inline");

    const fileContent = await readFile(config.path, "utf-8");
    expect(fileContent).toBe("This is a test prompt");

    const fileStat = await stat(config.path);
    expect(fileStat.size).toBeGreaterThan(0);
  });

  test("should use existing file when promptFile is provided", async () => {
    const testFilePath = "/tmp/test-prompt.txt";
    await writeFile(testFilePath, "Prompt from file");

    const input: PreparePromptInput = {
      prompt: "",
      promptFile: testFilePath,
    };

    const config = await preparePrompt(input);

    expect(config.path).toBe(testFilePath);
    expect(config.type).toBe("file");

    await unlink(testFilePath);
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
    const input: PreparePromptInput = {
      prompt: "",
      promptFile: "/tmp/non-existent-file.txt",
    };

    await expect(preparePrompt(input)).rejects.toThrow(
      "Prompt file '/tmp/non-existent-file.txt' does not exist.",
    );
  });

  test("should fail when prompt is empty", async () => {
    const emptyFilePath = "/tmp/empty-prompt.txt";
    await writeFile(emptyFilePath, "");

    const input: PreparePromptInput = {
      prompt: "",
      promptFile: emptyFilePath,
    };

    await expect(preparePrompt(input)).rejects.toThrow("Prompt file is empty");

    try {
      await unlink(emptyFilePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should fail when both prompt and promptFile are provided", async () => {
    const testFilePath = "/tmp/test-prompt.txt";
    await writeFile(testFilePath, "Prompt from file");

    const input: PreparePromptInput = {
      prompt: "This should cause an error",
      promptFile: testFilePath,
    };

    await expect(preparePrompt(input)).rejects.toThrow(
      "Both 'prompt' and 'prompt_file' were provided. Please specify only one.",
    );

    await unlink(testFilePath);
  });
});
