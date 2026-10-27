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

  test("keeps reading past a result while a background agent is still running", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    // The stream a headless session produces when Claude launches a sub-agent
    // with run_in_background and ends its turn before the agent finishes
    // (#1852): a first result while the agent runs, then the notification,
    // a follow-up turn and a second result.
    const stream = [
      { type: "system", subtype: "init", session_id: "session-123" },
      {
        type: "system",
        subtype: "task_started",
        task_id: "task-1",
        task_type: "local_agent",
        description: "review src/",
        is_backgrounded: true,
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 1000,
        num_turns: 2,
        total_cost_usd: 0.01,
        result: "WAITING FOR THE BACKGROUND AGENT",
        permission_denials: [],
      },
      {
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        status: "completed",
        summary: "done",
        output_file: "/tmp/task-1.txt",
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 500,
        num_turns: 1,
        total_cost_usd: 0.02,
        result: "AGENT REPORTED: SECRET-NUMBER-4471",
        permission_denials: [],
      },
    ];
    // Anything yielded after the second result must not be consumed.
    const sentinel = { type: "system", subtype: "unexpected_after_final" };

    let yielded = 0;
    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        for (const message of stream) {
          yielded++;
          yield message;
        }
        yielded++;
        yield sentinel;
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
      // Consumed every frame of the two-result stream and stopped at the
      // second result.
      expect(yielded).toBe(stream.length);
      const executionFile = join(tempDir, "claude-execution-output.json");
      await expect(readFile(executionFile, "utf-8")).resolves.toBe(
        JSON.stringify(stream, null, 2),
      );
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  test("still stops at the first result when no agent task is in flight", async () => {
    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});

    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-"));
    process.env.RUNNER_TEMP = tempDir;

    const promptPath = join(tempDir, "prompt.txt");
    await writeFile(promptPath, "test prompt");

    const stream = [
      { type: "system", subtype: "init", session_id: "session-123" },
      // A foreground agent that finished before the turn ended.
      {
        type: "system",
        subtype: "task_started",
        task_id: "task-fg",
        task_type: "local_agent",
        description: "look something up",
        is_backgrounded: false,
      },
      {
        type: "system",
        subtype: "task_updated",
        task_id: "task-fg",
        patch: { status: "completed" },
      },
      // A background shell is not an agent and must not hold the run open.
      {
        type: "system",
        subtype: "task_started",
        task_id: "task-shell",
        task_type: "local_bash",
        description: "npm run dev",
        is_backgrounded: true,
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        duration_ms: 1000,
        num_turns: 3,
        total_cost_usd: 0.01,
        permission_denials: [],
      },
    ];

    let yielded = 0;
    mock.module("@anthropic-ai/claude-agent-sdk", () => ({
      query: async function* () {
        for (const message of stream) {
          yielded++;
          yield message;
        }
        // Simulates the iterator that never closes on its own.
        await new Promise(() => {});
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
      expect(yielded).toBe(stream.length);
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
});

describe("InflightAgentTasks", () => {
  const started = (task_id: string, task_type: string) =>
    ({
      type: "system",
      subtype: "task_started",
      task_id,
      task_type,
      description: task_id,
    }) as any;

  test("tracks agent and workflow tasks until they finish", async () => {
    const { InflightAgentTasks } = await import("../src/run-claude-sdk");
    const tasks = new InflightAgentTasks();

    tasks.observe(started("agent-1", "local_agent"));
    tasks.observe(started("workflow-1", "local_workflow"));
    expect(tasks.size).toBe(2);

    tasks.observe({
      type: "system",
      subtype: "task_notification",
      task_id: "agent-1",
      status: "completed",
    } as any);
    expect(tasks.size).toBe(1);

    tasks.observe({
      type: "system",
      subtype: "task_updated",
      task_id: "workflow-1",
      patch: { status: "failed" },
    } as any);
    expect(tasks.size).toBe(0);
  });

  test("ignores non-terminal updates, shells and unrelated frames", async () => {
    const { InflightAgentTasks } = await import("../src/run-claude-sdk");
    const tasks = new InflightAgentTasks();

    tasks.observe(started("agent-1", "local_agent"));
    tasks.observe({
      type: "system",
      subtype: "task_updated",
      task_id: "agent-1",
      patch: { status: "running", description: "still going" },
    } as any);
    expect(tasks.size).toBe(1);

    tasks.observe(started("shell-1", "local_bash"));
    tasks.observe(started("no-type", undefined as any));
    tasks.observe({ type: "system", subtype: "init" } as any);
    tasks.observe({ type: "assistant", message: {} } as any);
    expect(tasks.size).toBe(1);

    // Finishing a task twice, or an unknown one, is harmless.
    tasks.observe({
      type: "system",
      subtype: "task_notification",
      task_id: "agent-1",
    } as any);
    tasks.observe({
      type: "system",
      subtype: "task_notification",
      task_id: "agent-1",
    } as any);
    tasks.observe({
      type: "system",
      subtype: "task_notification",
      task_id: "never-started",
    } as any);
    expect(tasks.size).toBe(0);
  });
});
