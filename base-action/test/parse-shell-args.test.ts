import { describe, expect, test } from "bun:test";
import { parse as parseShellArgs } from "shell-quote";

describe("shell-quote parseShellArgs", () => {
  test("should handle empty input", () => {
    expect(parseShellArgs("")).toEqual([]);
    expect(parseShellArgs("   ")).toEqual([]);
  });

  test("should parse simple arguments", () => {
    expect(parseShellArgs("--max-turns 3")).toEqual(["--max-turns", "3"]);
    expect(parseShellArgs("-a -b -c")).toEqual(["-a", "-b", "-c"]);
  });

  test("should handle double quotes", () => {
    expect(parseShellArgs('--config "/path/to/config.json"')).toEqual([
      "--config",
      "/path/to/config.json",
    ]);
    expect(parseShellArgs('"arg with spaces"')).toEqual(["arg with spaces"]);
  });

  test("should handle single quotes", () => {
    expect(parseShellArgs("--config '/path/to/config.json'")).toEqual([
      "--config",
      "/path/to/config.json",
    ]);
    expect(parseShellArgs("'arg with spaces'")).toEqual(["arg with spaces"]);
  });

  test("should handle escaped characters", () => {
    expect(parseShellArgs("arg\\ with\\ spaces")).toEqual(["arg with spaces"]);
    expect(parseShellArgs('arg\\"with\\"quotes')).toEqual(['arg"with"quotes']);
  });

  test("should handle mixed quotes", () => {
    expect(parseShellArgs(`--msg "It's a test"`)).toEqual([
      "--msg",
      "It's a test",
    ]);
    expect(parseShellArgs(`--msg 'He said "hello"'`)).toEqual([
      "--msg",
      'He said "hello"',
    ]);
  });

  test("should handle complex real-world example", () => {
    const input = `--max-turns 3 --mcp-config "/Users/john/config.json" --model claude-3-5-sonnet-latest --system-prompt 'You are helpful'`;
    expect(parseShellArgs(input)).toEqual([
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

  test("should filter out non-string results", () => {
    // shell-quote can return objects for operators like | > < etc
    const result = parseShellArgs("echo hello");
    const filtered = result.filter((arg) => typeof arg === "string");
    expect(filtered).toEqual(["echo", "hello"]);
  });
});
