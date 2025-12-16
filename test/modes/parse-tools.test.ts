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

  test("handles duplicate --allowedTools flags", () => {
    const args = "--allowedTools --allowedTools mcp__github__*";
    // Should skip the first one since the value is another flag
    // and parse the second one correctly
    expect(parseAllowedTools(args)).toEqual(["mcp__github__*"]);
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

  test("parses multiple space-separated quoted tools (issue #746)", () => {
    // This is the exact format from the bug report
    const args =
      '--allowed-tools "Bash(git log:*)" "Bash(git diff:*)" "Bash(git fetch:*)" "Bash(gh pr:*)"';
    expect(parseAllowedTools(args)).toEqual([
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git fetch:*)",
      "Bash(gh pr:*)",
    ]);
  });

  test("parses multiple --allowedTools flags with different tools", () => {
    const args =
      '--allowedTools "Edit,Read" --model "claude-3" --allowedTools "Bash(npm install)"';
    expect(parseAllowedTools(args)).toEqual([
      "Edit",
      "Read",
      "Bash(npm install)",
    ]);
  });

  test("parses mix of comma-separated and space-separated tools", () => {
    const args =
      '--allowed-tools "Bash(git log:*),Bash(git diff:*)" "Bash(git fetch:*)"';
    expect(parseAllowedTools(args)).toEqual([
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git fetch:*)",
    ]);
  });

  test("handles complex workflow example from issue #746", () => {
    const args =
      '--allowed-tools "Bash(git log:*)" "Bash(git diff:*)" "Bash(git fetch:*)" "Bash(git reflog:*)" "Bash(git merge-tree:*)" "Bash(gh pr:*)" "Bash(gh api:*)"';
    expect(parseAllowedTools(args)).toEqual([
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git fetch:*)",
      "Bash(git reflog:*)",
      "Bash(git merge-tree:*)",
      "Bash(gh pr:*)",
      "Bash(gh api:*)",
    ]);
  });
});
