#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  parseAndValidateSettingsJson,
  validateExistingSettings,
  loadAndValidateSettingsFile,
  processSettingsInput,
} from "../src/validation/settings";
import { tmpdir } from "os";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";

const testDir = join(tmpdir(), "validate-settings-test", Date.now().toString());
const testFilePath = join(testDir, "test-settings.json");

describe("validate-settings", () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("parseAndValidateSettingsJson", () => {
    test("should parse and validate valid JSON settings", () => {
      const validJson = JSON.stringify({
        model: "claude-opus",
        env: { DEBUG: "true" },
      });

      const result = parseAndValidateSettingsJson(validJson);
      expect(result.model).toBe("claude-opus");
      expect(result.env).toEqual({ DEBUG: "true" });
    });

    test("should throw on invalid JSON syntax", () => {
      const invalidJson = '{"model": "test",}';

      expect(() => parseAndValidateSettingsJson(invalidJson)).toThrow(
        /JSON syntax error.*Hint:/s,
      );
    });

    test("should throw on schema validation failure", () => {
      const invalidSchema = JSON.stringify({
        permissions: { allow: "should be array" },
      });

      expect(() => parseAndValidateSettingsJson(invalidSchema)).toThrow(
        /Invalid.*permissions\.allow.*Expected array/s,
      );
    });
  });

  describe("validateExistingSettings", () => {
    test("should validate and return valid settings in non-strict mode", () => {
      const validJson = JSON.stringify({
        model: "claude-opus",
        permissions: { allow: ["Bash"] },
      });

      const result = validateExistingSettings(validJson);
      expect(result.model).toBe("claude-opus");
    });

    test("should warn but return invalid settings in non-strict mode", () => {
      const invalidSchema = JSON.stringify({
        permissions: { allow: "should be array" },
      });

      // Capture console output
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (...args) => warnings.push(args.join(" "));

      try {
        const result = validateExistingSettings(invalidSchema, false);
        expect(result).toEqual({ permissions: { allow: "should be array" } });
        expect(warnings.some((w) => w.includes("validation issues"))).toBe(
          true,
        );
      } finally {
        console.warn = originalWarn;
      }
    });

    test("should throw on invalid settings in strict mode", () => {
      const invalidSchema = JSON.stringify({
        permissions: { allow: "should be array" },
      });

      expect(() => validateExistingSettings(invalidSchema, true)).toThrow(
        /Invalid.*permissions\.allow/s,
      );
    });

    test("should always throw on JSON syntax errors", () => {
      const invalidJson = '{"test": "value",}';

      expect(() => validateExistingSettings(invalidJson)).toThrow(
        /Cannot proceed with invalid existing settings file/,
      );
    });
  });

  describe("loadAndValidateSettingsFile", () => {
    test("should load and validate a valid settings file", async () => {
      const validSettings = {
        model: "claude-sonnet",
        includeCoAuthoredBy: true,
      };

      await writeFile(testFilePath, JSON.stringify(validSettings));

      const result = await loadAndValidateSettingsFile(testFilePath);
      expect(result.model).toBe("claude-sonnet");
      expect(result.includeCoAuthoredBy).toBe(true);
    });

    test("should throw on non-existent file", async () => {
      await expect(
        loadAndValidateSettingsFile("/non/existent/file.json"),
      ).rejects.toThrow(/ENOENT/);
    });

    test("should throw on invalid JSON in file", async () => {
      await writeFile(testFilePath, '{"invalid": "json",}');

      await expect(loadAndValidateSettingsFile(testFilePath)).rejects.toThrow(
        /JSON syntax error.*test-settings\.json/,
      );
    });
  });

  describe("processSettingsInput", () => {
    test("should parse JSON string input", async () => {
      const jsonInput = JSON.stringify({ model: "claude-opus" });
      const result = await processSettingsInput(jsonInput);
      expect(result.model).toBe("claude-opus");
    });

    test("should load from file path", async () => {
      const settings = { env: { API_KEY: "test" } };
      await writeFile(testFilePath, JSON.stringify(settings));

      const result = await processSettingsInput(testFilePath);
      expect(result.env).toEqual({ API_KEY: "test" });
    });

    test("should throw error for malformed JSON that looks like JSON", async () => {
      const malformedJson = '{"test": "value",}';

      await expect(processSettingsInput(malformedJson)).rejects.toThrow(
        /JSON syntax error.*input settings/,
      );
    });

    test("should throw error for non-existent file that doesn't look like JSON", async () => {
      await expect(
        processSettingsInput("/path/to/nonexistent.json"),
      ).rejects.toThrow(
        /Settings input is neither valid JSON nor a readable file path/,
      );
    });

    test("should handle whitespace in input", async () => {
      const jsonWithWhitespace =
        "   " + JSON.stringify({ model: "test" }) + "   ";
      const result = await processSettingsInput(jsonWithWhitespace);
      expect(result.model).toBe("test");
    });
  });
});
