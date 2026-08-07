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

  test("sets rate_limits output from rate_limit_event messages, keeping the latest snapshot per window", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    const coreSetOutputSpy = spyOn(
      await import("@actions/core"),
      "setOutput",
    ).mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    const staleFiveHourInfo = {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 23,
      resetsAt: 1752684000,
    };
    const latestFiveHourInfo = {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 25,
      resetsAt: 1752684000,
    };
    const sevenDayInfo = {
      status: "allowed_warning",
      rateLimitType: "seven_day",
      utilization: 91,
      resetsAt: 1753029000,
    };

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield {
          type: "system",
          subtype: "init",
          session_id: "session-123",
          model: "claude-sonnet-5",
        };
        yield { type: "rate_limit_event", rate_limit_info: staleFiveHourInfo };
        yield { type: "rate_limit_event", rate_limit_info: sevenDayInfo };
        yield { type: "rate_limit_event", rate_limit_info: latestFiveHourInfo };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 434,
          num_turns: 1,
          total_cost_usd: 0,
          permission_denials: [],
        };
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      const result = await runClaudeWithSdk(promptPath, {
        sdkOptions: {},
        showFullOutput: false,
        hasJsonSchema: false,
      });

      expect(result.conclusion).toBe("success");
      expect(coreSetOutputSpy).toHaveBeenCalledWith(
        "rate_limits",
        JSON.stringify({
          five_hour: latestFiveHourInfo,
          seven_day: sevenDayInfo,
        }),
      );
    } finally {
      consoleLogSpy.mockRestore();
      coreSetOutputSpy.mockRestore();
    }
  });

  test("does not set rate_limits output when no rate_limit_event is received", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    const coreSetOutputSpy = spyOn(
      await import("@actions/core"),
      "setOutput",
    ).mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        yield {
          type: "system",
          subtype: "init",
          session_id: "session-123",
          model: "claude-sonnet-5",
        };
        yield {
          type: "result",
          subtype: "success",
          is_error: false,
          duration_ms: 434,
          num_turns: 1,
          total_cost_usd: 0,
          permission_denials: [],
        };
      },
    }));

    try {
      const { runClaudeWithSdk } = await import("../src/run-claude-sdk");

      const result = await runClaudeWithSdk(promptPath, {
        sdkOptions: {},
        showFullOutput: false,
        hasJsonSchema: false,
      });

      expect(result.conclusion).toBe("success");
      const rateLimitCalls = coreSetOutputSpy.mock.calls.filter(
        ([name]) => name === "rate_limits",
      );
      expect(rateLimitCalls).toHaveLength(0);
    } finally {
      consoleLogSpy.mockRestore();
      coreSetOutputSpy.mockRestore();
    }
  });
});
