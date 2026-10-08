#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { JsonParseError, parseJsonWithLocation } from "../src/validate-json";

describe("parseJsonWithLocation", () => {
  test("returns parsed value for valid JSON", () => {
    const result = parseJsonWithLocation<{ name: string }>(
      '{"name":"claude"}',
      "test source",
    );
    expect(result).toEqual({ name: "claude" });
  });

  test("preserves the parsed type via generic", () => {
    const result = parseJsonWithLocation<number[]>("[1,2,3]", "test source");
    expect(result).toEqual([1, 2, 3]);
  });

  test("throws JsonParseError for malformed JSON", () => {
    expect(() => parseJsonWithLocation("{invalid", "test source")).toThrow(
      JsonParseError,
    );
  });

  test("error message includes the source identifier", () => {
    try {
      parseJsonWithLocation("{invalid", "/tmp/settings.json");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      expect((error as JsonParseError).message).toContain("/tmp/settings.json");
    }
  });

  test("error message includes line and column when parser reports position", () => {
    const malformed = '{\n  "name": "claude",\n  "broken":\n}';
    try {
      parseJsonWithLocation(malformed, "test source");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      const parseError = error as JsonParseError;
      if (parseError.line !== null) {
        expect(parseError.line).toBeGreaterThan(0);
        expect(parseError.column).toBeGreaterThan(0);
        expect(parseError.message).toMatch(/line \d+, column \d+/);
      }
    }
  });

  test("does not include source content in error message", () => {
    const secretLaden = '{"ANTHROPIC_API_KEY":"sk-ant-secret123",}';
    try {
      parseJsonWithLocation(secretLaden, "settings");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      expect((error as JsonParseError).message).not.toContain(
        "sk-ant-secret123",
      );
    }
  });

  test("falls back gracefully when underlying error has no position", () => {
    const error = new JsonParseError("source", "weird message", null, null);
    expect(error.message).toBe("Invalid JSON in source: weird message");
    expect(error.line).toBeNull();
    expect(error.column).toBeNull();
  });
});
