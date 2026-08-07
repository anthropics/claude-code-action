#!/usr/bin/env bun

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("runClaudeWithSdk", () => {
  const originalRunnerTemp = process.env.RUNNER_TEMP;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    process.env.RUNNER_TEMP = originalRunnerTemp;
  });

  test("writes the execution file when the SDK throws after yielding messages", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    const initMessage = {
      type: "system",
      subtype: "init",
      session_id: "session-123",
      model: "claude-sonnet-4-6",
    };

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield initMessage;
        throw new Error("Claude Code returned error_max_turns");
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      await expect(
        runClaudeWithSdk(promptPath, {
          sdkOptions: {},
          showFullOutput: false,
          hasJsonSchema: false,
        }),
      ).rejects.toThrow("SDK execution error");

      const executionFile = join(tempDir, "claude-execution-output.json");
      await expect(readFile(executionFile, "utf-8")).resolves.toBe(
        JSON.stringify([initMessage], null, 2),
      );
    } finally {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }
  });

  test("logs resolved model limits without exposing token usage", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    const initMessage = {
      type: "system",
      subtype: "init",
      session_id: "session-123",
      model: "claude-opus-5",
    };

    const resultMessage = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 434,
      num_turns: 1,
      total_cost_usd: 1.23,
      permission_denials: [],
      modelUsage: {
        "claude-opus-5": {
          inputTokens: 96209,
          outputTokens: 55324,
          cacheReadInputTokens: 1135701,
          cacheCreationInputTokens: 149043,
          webSearchRequests: 0,
          costUSD: 1.23,
          contextWindow: 200000,
          maxOutputTokens: 64000,
        },
      },
    };

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield initMessage;
        yield resultMessage;
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      await expect(
        runClaudeWithSdk(promptPath, {
          sdkOptions: {},
          showFullOutput: false,
          hasJsonSchema: false,
        }),
      ).resolves.toMatchObject({ conclusion: "success" });

      const sanitizedResult = consoleLogSpy.mock.calls
        .map(([message]) => message)
        .find(
          (message) =>
            typeof message === "string" && message.includes('"type": "result"'),
        );

      expect(sanitizedResult).toBeDefined();
      if (typeof sanitizedResult !== "string") {
        throw new Error("Sanitized result output was not logged");
      }
      expect(JSON.parse(sanitizedResult)).toEqual({
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 434,
        num_turns: 1,
        total_cost_usd: 1.23,
        permission_denials_count: 0,
        modelUsage: {
          "claude-opus-5": {
            contextWindow: 200000,
            maxOutputTokens: 64000,
          },
        },
      });
      expect(sanitizedResult).not.toContain("inputTokens");
      expect(sanitizedResult).not.toContain("costUSD");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  test("fails when result subtype is success but is_error is true", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    const coreErrorSpy = spyOn(
      await import("@actions/core"),
      "error",
    ).mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    const initMessage = {
      type: "system",
      subtype: "init",
      session_id: "session-123",
      model: "claude-sonnet-5",
    };

    const errorResultMessage = {
      type: "result",
      subtype: "success",
      is_error: true,
      duration_ms: 434,
      num_turns: 1,
      total_cost_usd: 0,
      permission_denials: [],
    };

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield initMessage;
        yield errorResultMessage;
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      await expect(
        runClaudeWithSdk(promptPath, {
          sdkOptions: {},
          showFullOutput: false,
          hasJsonSchema: false,
        }),
      ).rejects.toThrow("result is_error:true");

      const executionFile = join(tempDir, "claude-execution-output.json");
      await expect(readFile(executionFile, "utf-8")).resolves.toBe(
        JSON.stringify([initMessage, errorResultMessage], null, 2),
      );
      expect(coreErrorSpy).toHaveBeenCalledWith(
        "Claude result reported subtype success with is_error:true (run did not complete successfully)",
      );
    } finally {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      coreErrorSpy.mockRestore();
    }
  });
});
