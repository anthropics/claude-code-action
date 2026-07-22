#!/usr/bin/env bun

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { extractFinalAssistantMessage } from "../src/run-claude-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

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
});

/**
 * Helper to cast plain test fixtures to SDKMessage[].
 * The real SDK types are unions with many discriminator fields; tests only
 * need to match the shape that `extractFinalAssistantMessage` reads.
 */
const asMessages = (fixtures: unknown[]): SDKMessage[] =>
  fixtures as SDKMessage[];

describe("extractFinalAssistantMessage", () => {
  test("returns undefined for an empty message stream", () => {
    expect(extractFinalAssistantMessage(asMessages([]))).toBeUndefined();
  });

  test("returns undefined when there are no assistant messages", () => {
    const messages = asMessages([
      { type: "system", subtype: "init", session_id: "abc", tools: [] },
      {
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      },
      { type: "result", subtype: "success", is_error: false },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBeUndefined();
  });

  test("returns text from a single assistant message", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Here is my review." }],
        },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBe("Here is my review.");
  });

  test("joins multiple text blocks in a single assistant message with newlines", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "First paragraph." },
            { type: "text", text: "Second paragraph." },
          ],
        },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBe(
      "First paragraph.\nSecond paragraph.",
    );
  });

  test("ignores tool_use blocks and returns only text content", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Let me check the diff." },
            {
              type: "tool_use",
              id: "tool_1",
              name: "Read",
              input: { path: "diff.txt" },
            },
            { type: "text", text: "Looks good overall." },
          ],
        },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBe(
      "Let me check the diff.\nLooks good overall.",
    );
  });

  test("returns undefined when the last assistant message has only tool_use blocks", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "Read",
              input: { path: "x" },
            },
          ],
        },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBeUndefined();
  });

  test("does NOT walk back to earlier assistants when the last has only tool_use", () => {
    // Intentional behavior: "final message" means the literal last assistant's
    // text response, not any earlier text the agent said. If the last assistant
    // turn is a tool call, we surface undefined rather than digging further.
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Earlier thoughts." }],
        },
      },
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "Read",
              input: { path: "x" },
            },
          ],
        },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBeUndefined();
  });

  test("finds the last assistant when followed by a result message", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "All done." }],
        },
      },
      { type: "result", subtype: "success", is_error: false },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBe("All done.");
  });

  test("returns the LAST assistant's text when multiple assistant messages exist", () => {
    const messages = asMessages([
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "First reply." }] },
      },
      {
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "ok" }] },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Final reply." }] },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBe("Final reply.");
  });

  test("returns undefined when assistant message has non-array content", () => {
    // Defensive: malformed SDK output shouldn't crash extraction.
    const messages = asMessages([
      {
        type: "assistant",
        message: { content: "not an array" },
      },
    ]);

    expect(extractFinalAssistantMessage(messages)).toBeUndefined();
  });
});
