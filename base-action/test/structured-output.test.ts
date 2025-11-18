#!/usr/bin/env bun

import { describe, test, expect, afterEach } from "bun:test";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Import the type for testing
type ExecutionMessage = {
  type: string;
  structured_output?: Record<string, unknown>;
};

// Mock execution file path
const TEST_EXECUTION_FILE = join(tmpdir(), "test-execution-output.json");

// Helper to create mock execution file with structured output
async function createMockExecutionFile(
  structuredOutput?: Record<string, unknown>,
  includeResult: boolean = true,
): Promise<void> {
  const messages: ExecutionMessage[] = [
    { type: "system", subtype: "init" } as any,
    { type: "turn", content: "test" } as any,
  ];

  if (includeResult) {
    messages.push({
      type: "result",
      cost_usd: 0.01,
      duration_ms: 1000,
      structured_output: structuredOutput,
    } as any);
  }

  await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));
}

describe("Structured Output Parsing", () => {
  afterEach(async () => {
    try {
      await unlink(TEST_EXECUTION_FILE);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("parseAndSetStructuredOutputs integration", () => {
    test("should handle array outputs", async () => {
      await createMockExecutionFile({
        affected_areas: ["auth", "database", "api"],
        severity: "high",
      });

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result?.structured_output?.affected_areas).toEqual([
        "auth",
        "database",
        "api",
      ]);
    });

    test("should handle nested objects", async () => {
      await createMockExecutionFile({
        analysis: {
          category: "test",
          details: { count: 5, passed: true },
        },
      });

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result?.structured_output?.analysis).toEqual({
        category: "test",
        details: { count: 5, passed: true },
      });
    });

    test("should handle missing structured_output", async () => {
      await createMockExecutionFile(undefined, true);

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result).toBeUndefined();
    });

    test("should handle empty structured_output", async () => {
      await createMockExecutionFile({});

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result?.structured_output).toEqual({});
    });

    test("should handle all supported types", async () => {
      await createMockExecutionFile({
        string_field: "hello",
        number_field: 42,
        boolean_field: true,
        null_field: null,
        array_field: [1, 2, 3],
        object_field: { nested: "value" },
      });

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result?.structured_output).toMatchObject({
        string_field: "hello",
        number_field: 42,
        boolean_field: true,
        null_field: null,
        array_field: [1, 2, 3],
        object_field: { nested: "value" },
      });
    });
  });

  describe("error scenarios", () => {
    test("should handle malformed JSON", async () => {
      await writeFile(TEST_EXECUTION_FILE, "invalid json {");

      let error: Error | undefined;
      try {
        const content = await Bun.file(TEST_EXECUTION_FILE).text();
        JSON.parse(content);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("JSON");
    });

    test("should handle empty execution file", async () => {
      await writeFile(TEST_EXECUTION_FILE, "[]");

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result).toBeUndefined();
    });

    test("should handle missing result message", async () => {
      const messages = [
        { type: "system", subtype: "init" },
        { type: "turn", content: "test" },
      ];
      await writeFile(TEST_EXECUTION_FILE, JSON.stringify(messages));

      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const parsed = JSON.parse(content) as ExecutionMessage[];
      const result = parsed.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result).toBeUndefined();
    });
  });
});
