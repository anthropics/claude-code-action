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

  describe("session_id output", () => {
    // Regression for #1720: the session id was recorded on the result object and
    // logged, but every throw below that point skipped the caller's setOutput
    // block, so steps.<id>.outputs.session_id came back empty on exactly the
    // runs a user needs it to debug.
    async function runWithMessages(
      messages: unknown[],
      options: { hasJsonSchema: boolean },
    ) {
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(
        () => {},
      );
      const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
      const core = await import("@actions/core");
      const coreErrorSpy = spyOn(core, "error").mockImplementation(() => {});
      const coreInfoSpy = spyOn(core, "info").mockImplementation(() => {});
      const coreSetFailedSpy = spyOn(core, "setFailed").mockImplementation(
        () => {},
      );
      const setOutputSpy = spyOn(core, "setOutput").mockImplementation(
        () => {},
      );

      tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
      process.env.RUNNER_TEMP = tempDir;

      const promptPath = join(tempDir, "prompt.txt");
      await writeFile(promptPath, "test prompt");

      mock.module("@anthropic-ai/claude-agent-sdk", () => ({
        query: async function* () {
          for (const message of messages) {
            yield message;
          }
        },
      }));

      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");
      const call = runClaudeWithSdk(promptPath, {
        sdkOptions: {},
        showFullOutput: false,
        hasJsonSchema: options.hasJsonSchema,
      });

      return {
        call,
        setOutputSpy,
        restore: () => {
          consoleErrorSpy.mockRestore();
          consoleLogSpy.mockRestore();
          coreErrorSpy.mockRestore();
          coreInfoSpy.mockRestore();
          coreSetFailedSpy.mockRestore();
          setOutputSpy.mockRestore();
        },
      };
    }

    const initMessage = {
      type: "system",
      subtype: "init",
      session_id: "session-abc",
      model: "claude-sonnet-5",
    };

    test("sets session_id when --json-schema is set but structured_output is missing", async () => {
      // The #1720 shape: the session ran and succeeded, but no structured
      // output came back, so the run throws before the caller sets outputs.
      const { call, setOutputSpy, restore } = await runWithMessages(
        [
          initMessage,
          {
            type: "result",
            subtype: "success",
            is_error: false,
            duration_ms: 332000,
            num_turns: 24,
            total_cost_usd: 0.42,
            permission_denials: [],
          },
        ],
        { hasJsonSchema: true },
      );

      try {
        await expect(call).rejects.toThrow(
          "--json-schema was provided but Claude did not return structured_output",
        );
        expect(setOutputSpy).toHaveBeenCalledWith("session_id", "session-abc");
      } finally {
        restore();
      }
    });

    test("sets session_id when the result reports is_error", async () => {
      const { call, setOutputSpy, restore } = await runWithMessages(
        [
          initMessage,
          {
            type: "result",
            subtype: "success",
            is_error: true,
            duration_ms: 220,
            num_turns: 1,
            total_cost_usd: 0,
            permission_denials: [],
          },
        ],
        { hasJsonSchema: false },
      );

      try {
        await expect(call).rejects.toThrow("result is_error:true");
        expect(setOutputSpy).toHaveBeenCalledWith("session_id", "session-abc");
      } finally {
        restore();
      }
    });

    test("still sets session_id on a successful run", async () => {
      const { call, setOutputSpy, restore } = await runWithMessages(
        [
          initMessage,
          {
            type: "result",
            subtype: "success",
            is_error: false,
            duration_ms: 1200,
            num_turns: 2,
            total_cost_usd: 0.01,
            permission_denials: [],
          },
        ],
        { hasJsonSchema: false },
      );

      try {
        const result = await call;
        expect(result.conclusion).toBe("success");
        expect(result.sessionId).toBe("session-abc");
        expect(setOutputSpy).toHaveBeenCalledWith("session_id", "session-abc");
      } finally {
        restore();
      }
    });

    test("does not set session_id when the init message carries none", async () => {
      const { call, setOutputSpy, restore } = await runWithMessages(
        [
          { type: "system", subtype: "init", model: "claude-sonnet-5" },
          {
            type: "result",
            subtype: "success",
            is_error: false,
            duration_ms: 1200,
            num_turns: 2,
            total_cost_usd: 0.01,
            permission_denials: [],
          },
        ],
        { hasJsonSchema: false },
      );

      try {
        await call;
        expect(setOutputSpy).not.toHaveBeenCalledWith(
          "session_id",
          expect.anything(),
        );
      } finally {
        restore();
      }
    });
  });
});
