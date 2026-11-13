import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import {
  validateSettingsJson,
  validateSettingsInput,
  validateClaudeArgs,
} from "../src/utils/config-validation";

const testDir = join(
  tmpdir(),
  "config-validation-test",
  Date.now().toString(),
);

describe("validateSettingsJson", () => {
  test("accepts valid JSON object", () => {
    const result = validateSettingsJson(
      '{"model": "claude-sonnet-4-20250514", "permissions": {"allow": ["Read"]}}',
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("accepts empty string", () => {
    const result = validateSettingsJson("");
    expect(result.valid).toBe(true);
  });

  test("accepts whitespace-only string", () => {
    const result = validateSettingsJson("   \n\t  ");
    expect(result.valid).toBe(true);
  });

  test("rejects malformed JSON with trailing comma", () => {
    const result = validateSettingsJson('{"model": "test",}');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  test("rejects JSON with missing closing brace", () => {
    const result = validateSettingsJson('{"model": "test"');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  test("rejects JSON with single quotes", () => {
    const result = validateSettingsJson("{'model': 'test'}");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  test("rejects array as top-level value", () => {
    const result = validateSettingsJson('["Read", "Grep"]');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("must be a JSON object");
    expect(result.errors[0]).toContain("an array");
  });

  test("rejects string primitive", () => {
    const result = validateSettingsJson('"just a string"');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  test("rejects number primitive", () => {
    const result = validateSettingsJson("42");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  test("rejects null", () => {
    const result = validateSettingsJson("null");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  test("includes line number info for multiline JSON errors", () => {
    const badJson = `{
  "model": "test",
  "permissions": {
    "allow": ["Read",]
  }
}`;
    const result = validateSettingsJson(badJson);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    // Should mention "Invalid JSON" and contain line reference info
    expect(result.errors[0]).toContain("Invalid JSON");
  });

  test("accepts complex valid settings", () => {
    const settings = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      permissions: {
        allow: ["Read", "Grep", "Bash(git:*)"],
        deny: [],
      },
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo test" }],
          },
        ],
      },
      env: { API_KEY: "test" },
      enableAllProjectMcpServers: true,
    });
    const result = validateSettingsJson(settings);
    expect(result.valid).toBe(true);
  });
});

describe("validateSettingsInput", () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("accepts undefined input", async () => {
    const result = await validateSettingsInput(undefined);
    expect(result.valid).toBe(true);
  });

  test("accepts empty string input", async () => {
    const result = await validateSettingsInput("");
    expect(result.valid).toBe(true);
  });

  test("accepts valid JSON string input", async () => {
    const result = await validateSettingsInput('{"model": "test"}');
    expect(result.valid).toBe(true);
  });

  test("rejects malformed JSON string input", async () => {
    const result = await validateSettingsInput("{bad json}");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("accepts valid JSON file path", async () => {
    const filePath = join(testDir, "valid-settings.json");
    await writeFile(filePath, '{"model": "test"}');
    const result = await validateSettingsInput(filePath);
    expect(result.valid).toBe(true);
  });

  test("rejects file with malformed JSON", async () => {
    const filePath = join(testDir, "bad-settings.json");
    await writeFile(filePath, '{"model": "test",}');
    const result = await validateSettingsInput(filePath);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("settings file");
  });

  test("rejects non-existent file path", async () => {
    const result = await validateSettingsInput("/no/such/file.json");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("gives helpful error for JSON-like input that fails to parse", async () => {
    const result = await validateSettingsInput('{ "key": value }');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Should have a hint about the issue
    expect(result.errors[0]).toContain("JSON");
  });
});

describe("validateClaudeArgs", () => {
  test("accepts empty string", () => {
    const result = validateClaudeArgs("");
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("accepts valid allowed-tools syntax with quotes", () => {
    const result = validateClaudeArgs(
      '--allowed-tools "Read" "Grep" "Bash"',
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("accepts valid allowed-tools with commas", () => {
    const result = validateClaudeArgs("--allowed-tools Read,Grep,Bash");
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("accepts valid multiline allowed-tools", () => {
    const args = `--allowed-tools "Read"
--allowed-tools "Grep"
--allowed-tools "Bash"`;
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("warns on YAML list syntax with hyphens after --allowed-tools", () => {
    const args = `--allowed-tools
- Read
- Grep
- Bash`;
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("YAML list syntax");
  });

  test("warns on YAML list syntax with allowedTools camelCase", () => {
    const args = `--allowedTools
- Read
- Grep`;
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("YAML list syntax");
  });

  test("does not warn on hyphens that are flags", () => {
    const args = `--allowed-tools "Read"
--model claude-sonnet`;
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("warns on tool name starting with hyphen", () => {
    const args = '--allowed-tools "-Read"';
    const result = validateClaudeArgs(args);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("starts with a hyphen");
  });

  test("does not false-positive on legitimate flags after tool args", () => {
    const args = `--allowed-tools "Read,Grep"
--model claude-sonnet-4-20250514
--max-turns 10`;
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("handles args with no allowed-tools flags at all", () => {
    const args = "--model claude-sonnet --max-turns 5";
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test("detects YAML list mixed with valid tools", () => {
    const args = `--allowed-tools "Read"
- Grep
- Bash`;
    // After --allowed-tools "Read", the lines "- Grep" and "- Bash" are outside
    // a new --allowed-tools block but still within it since no new flag resets it
    const result = validateClaudeArgs(args);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
