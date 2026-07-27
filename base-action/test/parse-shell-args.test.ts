import { describe, expect, test } from "bun:test";
import { splitClaudeArgs } from "../src/parse-sdk-options";

describe("splitClaudeArgs", () => {
  test("should handle empty input", () => {
    expect(splitClaudeArgs("")).toEqual([]);
    expect(splitClaudeArgs("   ")).toEqual([]);
  });

  test("should parse simple arguments", () => {
    expect(splitClaudeArgs("--max-turns 3")).toEqual(["--max-turns", "3"]);
    expect(splitClaudeArgs("-a -b -c")).toEqual(["-a", "-b", "-c"]);
  });

  test("should handle double quotes", () => {
    expect(splitClaudeArgs('--config "/path/to/config.json"')).toEqual([
      "--config",
      "/path/to/config.json",
    ]);
    expect(splitClaudeArgs('"arg with spaces"')).toEqual(["arg with spaces"]);
  });

  test("should handle single quotes", () => {
    expect(splitClaudeArgs("--config '/path/to/config.json'")).toEqual([
      "--config",
      "/path/to/config.json",
    ]);
    expect(splitClaudeArgs("'arg with spaces'")).toEqual(["arg with spaces"]);
  });

  test("should handle escaped characters", () => {
    expect(splitClaudeArgs("arg\\ with\\ spaces")).toEqual(["arg with spaces"]);
    expect(splitClaudeArgs('arg\\"with\\"quotes')).toEqual(['arg"with"quotes']);
  });

  test("should handle mixed quotes", () => {
    expect(splitClaudeArgs(`--msg "It's a test"`)).toEqual([
      "--msg",
      "It's a test",
    ]);
    expect(splitClaudeArgs(`--msg 'He said "hello"'`)).toEqual([
      "--msg",
      'He said "hello"',
    ]);
  });

  test("should handle complex real-world example", () => {
    const input = `--max-turns 3 --mcp-config "/Users/john/config.json" --model claude-3-5-sonnet-latest --system-prompt 'You are helpful'`;
    expect(splitClaudeArgs(input)).toEqual([
      "--max-turns",
      "3",
      "--mcp-config",
      "/Users/john/config.json",
      "--model",
      "claude-3-5-sonnet-latest",
      "--system-prompt",
      "You are helpful",
    ]);
  });

  test("should keep shell metacharacters literal", () => {
    expect(splitClaudeArgs("--allowedTools Bash(gh:*)")).toEqual([
      "--allowedTools",
      "Bash(gh:*)",
    ]);
    expect(splitClaudeArgs("--allowedTools Read(path/**)")).toEqual([
      "--allowedTools",
      "Read(path/**)",
    ]);
  });

  test("should keep a # that is inside a quoted value", () => {
    const input = `--append-system-prompt "rules:\n# 1. never force push\n"`;
    expect(splitClaudeArgs(input)).toEqual([
      "--append-system-prompt",
      "rules:\n# 1. never force push\n",
    ]);
  });

  test("should drop a comment line and a trailing comment", () => {
    expect(
      splitClaudeArgs("--model sonnet\n# a comment\n--max-turns 5"),
    ).toEqual(["--model", "sonnet", "--max-turns", "5"]);
    expect(splitClaudeArgs("--model sonnet # pick a model")).toEqual([
      "--model",
      "sonnet",
    ]);
  });

  test("should join a continued line without emitting an empty argument", () => {
    const input = `--disallowedTools \\\n  "Bash(rm:*)" "Bash(sudo:*)"`;
    expect(splitClaudeArgs(input)).toEqual([
      "--disallowedTools",
      "Bash(rm:*)",
      "Bash(sudo:*)",
    ]);
  });
});
