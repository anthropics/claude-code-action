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

  test("fails closed when a successful result exceeds maxTurns", async () => {
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
      model: "claude-opus-4-7",
    };

    const successResultMessage = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 960000,
      num_turns: 73,
      total_cost_usd: 0,
      permission_denials: [],
    };

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield initMessage;
        yield successResultMessage;
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      await expect(
        runClaudeWithSdk(promptPath, {
          sdkOptions: { maxTurns: 60 },
          showFullOutput: false,
          hasJsonSchema: false,
        }),
      ).rejects.toThrow(
        "Claude reported a successful result after 73 turns, exceeding the configured maximum of 60",
      );

      const executionFile = join(tempDir, "claude-execution-output.json");
      await expect(readFile(executionFile, "utf-8")).resolves.toBe(
        JSON.stringify([initMessage, successResultMessage], null, 2),
      );
      expect(coreErrorSpy).toHaveBeenCalledWith(
        "Claude reported a successful result after 73 turns, exceeding the configured maximum of 60",
      );
    } finally {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      coreErrorSpy.mockRestore();
    }
  });

  test.each([
    {
      name: "assistant billing_error",
      source: "assistant",
      hasJsonSchema: false,
    },
    {
      name: "billing error with JSON schema",
      source: "assistant",
      hasJsonSchema: true,
    },
    { name: "error result text", source: "result", hasJsonSchema: false },
    { name: "error result errors", source: "errors", hasJsonSchema: false },
    { name: "SDK exception", source: "exception", hasJsonSchema: false },
    {
      name: "billing message before SDK exception",
      source: "assistant-exception",
      hasJsonSchema: false,
    },
  ])(
    "explains $name without logging response content",
    async ({ source, hasJsonSchema }) => {
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(
        () => {},
      );
      const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
      const coreErrorSpy = spyOn(
        await import("@actions/core"),
        "error",
      ).mockImplementation(() => {});
      const coreSetFailedSpy = spyOn(
        await import("@actions/core"),
        "setFailed",
      ).mockImplementation(() => {});

      tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
      process.env.RUNNER_TEMP = tempDir;
      const promptPath = join(tempDir, "prompt.txt");
      await writeFile(promptPath, "test prompt");

      const privateContent = "private response content sk-ant-test-secret";
      const creditError = `Credit balance is too low: ${privateContent}`;
      const assistantMessage = {
        type: "assistant",
        error: "billing_error",
        message: {
          role: "assistant",
          content: [{ type: "text", text: privateContent }],
        },
      };
      const resultMessage = {
        type: "result",
        subtype: source === "errors" ? "error_during_execution" : "success",
        is_error: true,
        duration_ms: 500,
        num_turns: 1,
        total_cost_usd: 0,
        permission_denials: [],
        result: source === "result" ? creditError : privateContent,
        ...(source === "errors" ? { errors: [creditError] } : {}),
      };
      const messages: unknown[] = source.startsWith("assistant")
        ? [assistantMessage]
        : [];
      if (!source.includes("exception")) messages.push(resultMessage);

      mock.module("@anthropic-ai/claude-agent-sdk", () => ({
        query: async function* () {
          yield* messages;
          if (source.includes("exception")) {
            throw new Error(
              source === "exception" ? creditError : privateContent,
            );
          }
        },
      }));

      try {
        const { runClaudeWithSdk } = await import("../src/run-claude-sdk");
        await expect(
          runClaudeWithSdk(promptPath, {
            sdkOptions: {},
            showFullOutput: false,
            hasJsonSchema,
          }),
        ).rejects.toThrow("Claude API billing error");

        const logs = JSON.stringify([
          ...consoleLogSpy.mock.calls,
          ...consoleErrorSpy.mock.calls,
          ...coreErrorSpy.mock.calls,
        ]);
        expect(logs).toContain("purchased credits");
        expect(logs).toContain("do not cover Claude Code GitHub Action runs");
        expect(logs).toContain("claude_code_oauth_token");
        expect(logs).not.toContain(privateContent);
        expect(coreSetFailedSpy).not.toHaveBeenCalled();
        expect(
          JSON.parse(
            await readFile(
              join(tempDir, "claude-execution-output.json"),
              "utf-8",
            ),
          ),
        ).toEqual(messages);
      } finally {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
        coreErrorSpy.mockRestore();
        coreSetFailedSpy.mockRestore();
      }
    },
  );

  test("does not diagnose a successful answer about credit balances as a billing error", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;
    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "Explain billing errors");

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield {
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Credit balance is too low" }],
          },
        };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          result: "Credit balance is too low",
          num_turns: 1,
          permission_denials: [],
        };
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
      expect(JSON.stringify(consoleLogSpy.mock.calls)).not.toContain(
        "Claude API billing error",
      );
    } finally {
      consoleLogSpy.mockRestore();
    }
  });
});
