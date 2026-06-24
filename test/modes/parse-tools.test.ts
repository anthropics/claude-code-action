import { describe, test, expect } from "bun:test";
import { parseAllowedTools } from "../../src/modes/agent/parse-tools";

describe("parseAllowedTools", () => {
  test("parses unquoted tools", () => {
    const args = "--allowedTools mcp__github__*,mcp__github_comment__*";
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });

  test("parses double-quoted tools", () => {
    const args = '--allowedTools "mcp__github__*,mcp__github_comment__*"';
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });

  test("parses single-quoted tools", () => {
    const args = "--allowedTools 'mcp__github__*,mcp__github_comment__*'";
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });

  test("returns empty array when no allowedTools", () => {
    const args = "--someOtherFlag value";
    expect(parseAllowedTools(args)).toEqual([]);
  });

  test("handles empty string", () => {
    expect(parseAllowedTools("")).toEqual([]);
  });

  test("handles --allowedTools followed by another --allowedTools flag", () => {
    const args = "--allowedTools --allowedTools mcp__github__*";
    // The first --allowedTools has no value (the next token is another flag);
    // the second consumes mcp__github__*. This matches how the SDK option
    // parser (parse-sdk-options.ts) reads the same input.
    expect(parseAllowedTools(args)).toEqual(["mcp__github__*"]);
  });

  test("captures multiple values after a single --allowedTools flag", () => {
    // Regression for #1357: the install-decision parser must capture every
    // value, not just the first, so it agrees with the tools actually granted
    // to Claude. Previously only "Read" was seen, so the github MCP server was
    // not installed even though mcp__github__get_commit was granted.
    const args = '--allowedTools "Read" "Grep" "mcp__github__get_commit"';
    expect(parseAllowedTools(args)).toEqual([
      "Read",
      "Grep",
      "mcp__github__get_commit",
    ]);
  });

  test("captures multiple values spread across lines under one flag", () => {
    const args = `--allowedTools
 "Read"
 "Grep"
 "mcp__github__get_commit"`;
    expect(parseAllowedTools(args)).toEqual([
      "Read",
      "Grep",
      "mcp__github__get_commit",
    ]);
  });

  test("ignores commented-out lines", () => {
    // Regression for #1357: a commented-out flag must not be counted, matching
    // the SDK parser which strips comment lines before parsing.
    const args = `# --allowedTools "mcp__github__get_commit"
--allowedTools "Read"`;
    expect(parseAllowedTools(args)).toEqual(["Read"]);
  });

  test("parses multiple separate --allowed-tools flags", () => {
    const args =
      "--allowed-tools 'mcp__context7__*' --allowed-tools 'Read,Glob' --allowed-tools 'mcp__github_inline_comment__*'";
    expect(parseAllowedTools(args)).toEqual([
      "mcp__context7__*",
      "Read",
      "Glob",
      "mcp__github_inline_comment__*",
    ]);
  });

  test("parses multiple --allowed-tools flags on separate lines", () => {
    const args = `--model 'claude-haiku'
--allowed-tools 'mcp__context7__*'
--allowed-tools 'Read,Glob,Grep'
--allowed-tools 'mcp__github_inline_comment__create_inline_comment'`;
    expect(parseAllowedTools(args)).toEqual([
      "mcp__context7__*",
      "Read",
      "Glob",
      "Grep",
      "mcp__github_inline_comment__create_inline_comment",
    ]);
  });

  test("deduplicates tools from multiple flags", () => {
    const args =
      "--allowed-tools 'Read,Glob' --allowed-tools 'Glob,Grep' --allowed-tools 'Read'";
    expect(parseAllowedTools(args)).toEqual(["Read", "Glob", "Grep"]);
  });

  test("handles typo --alloedTools", () => {
    const args = "--alloedTools mcp__github__*";
    expect(parseAllowedTools(args)).toEqual([]);
  });

  test("handles multiple flags with allowedTools in middle", () => {
    const args =
      '--flag1 value1 --allowedTools "mcp__github__*" --flag2 value2';
    expect(parseAllowedTools(args)).toEqual(["mcp__github__*"]);
  });

  test("trims whitespace from tool names", () => {
    const args = "--allowedTools 'mcp__github__* , mcp__github_comment__* '";
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });

  test("handles tools with special characters", () => {
    const args =
      '--allowedTools "mcp__github__create_issue,mcp__github_comment__update"';
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__create_issue",
      "mcp__github_comment__update",
    ]);
  });

  test("parses kebab-case --allowed-tools", () => {
    const args = "--allowed-tools mcp__github__*,mcp__github_comment__*";
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });

  test("parses quoted kebab-case --allowed-tools", () => {
    const args = '--allowed-tools "mcp__github__*,mcp__github_comment__*"';
    expect(parseAllowedTools(args)).toEqual([
      "mcp__github__*",
      "mcp__github_comment__*",
    ]);
  });
});
