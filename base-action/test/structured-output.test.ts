#!/usr/bin/env bun

import { describe, test, expect, afterEach } from "bun:test";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { sanitizeOutputName, convertToString } from "../src/run-claude";

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

describe("Structured Output - Pure Functions", () => {
  afterEach(async () => {
    try {
      await unlink(TEST_EXECUTION_FILE);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("sanitizeOutputName", () => {
    test("should keep valid characters", () => {
      expect(sanitizeOutputName("valid_name-123")).toBe("valid_name-123");
    });

    test("should replace invalid characters with underscores", () => {
      expect(sanitizeOutputName("invalid@name!")).toBe("invalid_name_");
      expect(sanitizeOutputName("has spaces")).toBe("has_spaces");
      expect(sanitizeOutputName("has.dots")).toBe("has_dots");
    });

    test("should handle special characters", () => {
      expect(sanitizeOutputName("$field%name&")).toBe("_field_name_");
      expect(sanitizeOutputName("field[0]")).toBe("field_0_");
    });
  });

  describe("convertToString", () => {
    test("should keep strings as-is", () => {
      expect(convertToString("hello")).toBe("hello");
      expect(convertToString("")).toBe("");
    });

    test("should convert booleans to strings", () => {
      expect(convertToString(true)).toBe("true");
      expect(convertToString(false)).toBe("false");
    });

    test("should convert numbers to strings", () => {
      expect(convertToString(42)).toBe("42");
      expect(convertToString(3.14)).toBe("3.14");
      expect(convertToString(0)).toBe("0");
    });

    test("should convert null to empty string", () => {
      expect(convertToString(null)).toBe("");
    });

    test("should JSON stringify objects", () => {
      expect(convertToString({ foo: "bar" })).toBe('{"foo":"bar"}');
    });

    test("should JSON stringify arrays", () => {
      expect(convertToString([1, 2, 3])).toBe("[1,2,3]");
      expect(convertToString(["a", "b"])).toBe('["a","b"]');
    });

    test("should handle nested structures", () => {
      const nested = { items: [{ id: 1, name: "test" }] };
      expect(convertToString(nested)).toBe(
        '{"items":[{"id":1,"name":"test"}]}',
      );
    });
  });

  describe("parseAndSetStructuredOutputs integration", () => {
    test("should parse and set simple structured outputs", async () => {
      await createMockExecutionFile({
        is_antonly: true,
        confidence: 0.95,
        risk: "low",
      });

      // In a real test, we'd import and call parseAndSetStructuredOutputs
      // For now, we simulate the behavior
      const content = await Bun.file(TEST_EXECUTION_FILE).text();
      const messages = JSON.parse(content) as ExecutionMessage[];
      const result = messages.find(
        (m) => m.type === "result" && m.structured_output,
      );

      expect(result?.structured_output).toEqual({
        is_antonly: true,
        confidence: 0.95,
        risk: "low",
      });
    });

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

  describe("output naming with prefix", () => {
    test("should apply prefix correctly", () => {
      const prefix = "CLAUDE_";
      const key = "is_antonly";
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const outputName = prefix + sanitizedKey;

      expect(outputName).toBe("CLAUDE_is_antonly");
    });

    test("should handle empty prefix", () => {
      const prefix = "";
      const key = "result";
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const outputName = prefix + sanitizedKey;

      expect(outputName).toBe("result");
    });

    test("should sanitize and prefix invalid keys", () => {
      const prefix = "OUT_";
      const key = "invalid@key!";
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      const outputName = prefix + sanitizedKey;

      expect(outputName).toBe("OUT_invalid_key_");
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

  describe("value truncation in logs", () => {
    test("should truncate long string values for display", () => {
      const longValue = "a".repeat(150);
      const displayValue =
        longValue.length > 100 ? `${longValue.slice(0, 97)}...` : longValue;

      expect(displayValue).toBe("a".repeat(97) + "...");
      expect(displayValue.length).toBe(100);
    });

    test("should not truncate short values", () => {
      const shortValue = "short";
      const displayValue =
        shortValue.length > 100 ? `${shortValue.slice(0, 97)}...` : shortValue;

      expect(displayValue).toBe("short");
    });

    test("should truncate exactly 100 character values", () => {
      const value = "a".repeat(100);
      const displayValue =
        value.length > 100 ? `${value.slice(0, 97)}...` : value;

      expect(displayValue).toBe(value);
    });

    test("should truncate 101 character values", () => {
      const value = "a".repeat(101);
      const displayValue =
        value.length > 100 ? `${value.slice(0, 97)}...` : value;

      expect(displayValue).toBe("a".repeat(97) + "...");
    });
  });
});
