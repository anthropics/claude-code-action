#!/usr/bin/env bun

import { describe, test, expect, afterEach, beforeEach, spyOn } from "bun:test";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseAndSetStructuredOutputs,
  parseAndSetSessionId,
} from "../src/run-claude";
import * as core from "@actions/core";

// Mock execution file path
const TEST_EXECUTION_FILE = join(tmpdir(), "test-execution-output.json");

// Helper to create mock execution file with structured output
async function createMockExecutionFile(
  structuredOutput?: Record<string, unknown>,
  includeResult: boolean = true,
): Promise<void> {
  const messages: any[] = [
    { type: "system", subtype: "init" },
    { type: "turn", content: "test" },
  ];

  if (includeResult) {
    messages.push({
      type: "result",
      cost_usd: 0.01,
      duration_ms: 1000,
      structured_output: structuredOutput,
    });
  }

  await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));
}

// Spy on core functions
let setOutputSpy: any;
let infoSpy: any;
let warningSpy: any;

beforeEach(() => {
  setOutputSpy = spyOn(core, "setOutput").mockImplementation(() => {});
  infoSpy = spyOn(core, "info").mockImplementation(() => {});
  warningSpy = spyOn(core, "warning").mockImplementation(() => {});
});

describe("parseAndSetStructuredOutputs", () => {
  afterEach(async () => {
    setOutputSpy?.mockRestore();
    infoSpy?.mockRestore();
    warningSpy?.mockRestore();
    try {
      await unlink(TEST_EXECUTION_FILE);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  test("should set structured_output with valid data", async () => {
    await createMockExecutionFile({
      is_flaky: true,
      confidence: 0.85,
      summary: "Test looks flaky",
    });

    await parseAndSetStructuredOutputs(TEST_EXECUTION_FILE);

    expect(setOutputSpy).toHaveBeenCalledWith(
      "structured_output",
      '{"is_flaky":true,"confidence":0.85,"summary":"Test looks flaky"}',
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "Set structured_output with 3 field(s)",
    );
  });

  test("should handle arrays and nested objects", async () => {
    await createMockExecutionFile({
      items: ["a", "b", "c"],
      config: { key: "value", nested: { deep: true } },
    });

    await parseAndSetStructuredOutputs(TEST_EXECUTION_FILE);

    const callArgs = setOutputSpy.mock.calls[0];
    expect(callArgs[0]).toBe("structured_output");
    const parsed = JSON.parse(callArgs[1]);
    expect(parsed).toEqual({
      items: ["a", "b", "c"],
      config: { key: "value", nested: { deep: true } },
    });
  });

  test("should handle special characters in field names", async () => {
    await createMockExecutionFile({
      "test-result": "passed",
      "item.count": 10,
      "user@email": "test",
    });

    await parseAndSetStructuredOutputs(TEST_EXECUTION_FILE);

    const callArgs = setOutputSpy.mock.calls[0];
    const parsed = JSON.parse(callArgs[1]);
    expect(parsed["test-result"]).toBe("passed");
    expect(parsed["item.count"]).toBe(10);
    expect(parsed["user@email"]).toBe("test");
  });

  test("should throw error when result exists but structured_output is undefined", async () => {
    const messages = [
      { type: "system", subtype: "init" },
      { type: "result", cost_usd: 0.01, duration_ms: 1000 },
    ];
    await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

    await expect(
      parseAndSetStructuredOutputs(TEST_EXECUTION_FILE),
    ).rejects.toThrow(
      "--json-schema was provided but Claude did not return structured_output",
    );
  });

  test("should throw error when no result message exists", async () => {
    const messages = [
      { type: "system", subtype: "init" },
      { type: "turn", content: "test" },
    ];
    await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

    await expect(
      parseAndSetStructuredOutputs(TEST_EXECUTION_FILE),
    ).rejects.toThrow(
      "--json-schema was provided but Claude did not return structured_output",
    );
  });

  test("should throw error with malformed JSON", async () => {
    await writeFile(TEST_EXECUTION_FILE, "{ invalid json");

    await expect(
      parseAndSetStructuredOutputs(TEST_EXECUTION_FILE),
    ).rejects.toThrow();
  });

  test("should throw error when file does not exist", async () => {
    await expect(
      parseAndSetStructuredOutputs("/nonexistent/file.json"),
    ).rejects.toThrow();
  });

  test("should handle empty structured_output object", async () => {
    await createMockExecutionFile({});

    await parseAndSetStructuredOutputs(TEST_EXECUTION_FILE);

    expect(setOutputSpy).toHaveBeenCalledWith("structured_output", "{}");
    expect(infoSpy).toHaveBeenCalledWith(
      "Set structured_output with 0 field(s)",
    );
  });
});

describe("parseAndSetSessionId", () => {
  afterEach(async () => {
    setOutputSpy?.mockRestore();
    infoSpy?.mockRestore();
    warningSpy?.mockRestore();
    try {
      await unlink(TEST_EXECUTION_FILE);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  test("should extract session_id from system.init message", async () => {
    const messages = [
      { type: "system", subtype: "init", session_id: "test-session-123" },
      { type: "result", cost_usd: 0.01 },
    ];
    await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

    await parseAndSetSessionId(TEST_EXECUTION_FILE);

    expect(setOutputSpy).toHaveBeenCalledWith("session_id", "test-session-123");
    expect(infoSpy).toHaveBeenCalledWith("Set session_id: test-session-123");
  });

  test("should handle missing session_id gracefully", async () => {
    const messages = [
      { type: "system", subtype: "init" },
      { type: "result", cost_usd: 0.01 },
    ];
    await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

    await parseAndSetSessionId(TEST_EXECUTION_FILE);

    expect(setOutputSpy).not.toHaveBeenCalled();
  });

  test("should handle missing system.init message gracefully", async () => {
    const messages = [{ type: "result", cost_usd: 0.01 }];
    await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

    await parseAndSetSessionId(TEST_EXECUTION_FILE);

    expect(setOutputSpy).not.toHaveBeenCalled();
  });

  test("should handle malformed JSON gracefully with warning", async () => {
    await writeFile(TEST_EXECUTION_FILE, "{ invalid json");

    await parseAndSetSessionId(TEST_EXECUTION_FILE);

    expect(setOutputSpy).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalled();
  });

  test("should handle non-existent file gracefully with warning", async () => {
    await parseAndSetSessionId("/nonexistent/file.json");

    expect(setOutputSpy).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalled();
  });
});
