import { parseAllowedTools } from "../../src/modes/agent/parse-tools";

describe("parseAllowedTools", () => {
  test("parses unquoted tools", () => {
    const args =
      "--allowedTools mcp__github__*,mcp__github_comment__*";

    expect(() => parseAllowedTools(args)).toThrow(
      "Wildcard tool permissions are not allowed: mcp__github__*",
    );
  });

  test("parses double-quoted tools", () => {
    const args =
      '--allowedTools "mcp__github__*,mcp__github_comment__*"';

    expect(() => parseAllowedTools(args)).toThrow(
      "Wildcard tool permissions are not allowed: mcp__github__*",
    );
  });

  test("parses single-quoted tools", () => {
    const args =
      "--allowedTools 'mcp__github__*,mcp__github_comment__*'";

    expect(() => parseAllowedTools(args)).toThrow(
      "Wildcard tool permissions are not allowed: mcp__github__*",
    );
  });

  test("returns empty array when no allowedTools", () => {
    const args = "--model sonnet";
    expect(parseAllowedTools(args)).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(parseAllowedTools("")).toEqual([]);
  });

  test("rejects duplicate allowedTools flags", () => {
    const args =
      "--allowedTools Read --allowedTools Glob";

    expect(() => parseAllowedTools(args)).toThrow(
      "Multiple --allowedTools flags are not allowed",
    );
  });

  test("rejects missing value", () => {
    const args = "--allowedTools";

    expect(() => parseAllowedTools(args)).toThrow(
      "--allowedTools requires a value",
    );
  });

  test("parses valid tools", () => {
    const args = "--allowedTools Read,Glob,Grep";

    expect(parseAllowedTools(args)).toEqual([
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("parses multiple separate --allowed-tools flags", () => {
    const args =
      "--allowed-tools Read --allowed-tools Glob";

    expect(() => parseAllowedTools(args)).toThrow(
      "Multiple --allowedTools flags are not allowed",
    );
  });

  test("parses multiple --allowed-tools flags on separate lines", () => {
    const args = `
      --allowed-tools Read
      --allowed-tools Glob
    `;

    expect(() => parseAllowedTools(args)).toThrow(
      "Multiple --allowedTools flags are not allowed",
    );
  });

  test("deduplicates tools from multiple flags", () => {
    const args =
      "--allowedTools Read --allowedTools Read";

    expect(() => parseAllowedTools(args)).toThrow(
      "Multiple --allowedTools flags are not allowed",
    );
  });

  test("handles multiple flags with allowedTools in middle", () => {
    const args =
      '--flag1 value1 --allowedTools Read,Glob --flag2 value2';

    expect(parseAllowedTools(args)).toEqual([
      "Read",
      "Glob",
    ]);
  });

  test("trims whitespace from tool names", () => {
    const args =
      '--allowedTools "Read , Glob , Grep "';

    expect(parseAllowedTools(args)).toEqual([
      "Read",
      "Glob",
      "Grep",
    ]);
  });

  test("parses kebab-case --allowed-tools", () => {
    const args = "--allowed-tools mcp__github__*";

    expect(() => parseAllowedTools(args)).toThrow(
      "Wildcard tool permissions are not allowed: mcp__github__*",
    );
  });

  test("parses quoted kebab-case --allowed-tools", () => {
    const args = '--allowed-tools "mcp__github__*"';

    expect(() => parseAllowedTools(args)).toThrow(
      "Wildcard tool permissions are not allowed: mcp__github__*",
    );
  });

  test("rejects malformed escaping tricks", () => {
    const args =
      '--allowedTools "Read;rm -rf /"';

    expect(() => parseAllowedTools(args)).toThrow(
      "Invalid tool name: Read;rm -rf /",
    );
  });
});
