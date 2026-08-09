#!/usr/bin/env bun

/**
 * Two independent parsers read the same `claude_args` string:
 *
 *   src/modes/agent/parse-tools.ts  -> parseAllowedTools()
 *       decides which GitHub MCP servers to install
 *   base-action/src/parse-sdk-options.ts -> parseSdkOptions()
 *       decides which tools the SDK actually grants
 *
 * They must agree. A drift grants Claude a tool whose MCP server was never
 * installed, or installs a server for a tool that was never granted (#1357).
 *
 * Until now that requirement lived in a comment in each file. Both implement
 * the same escape-and-restore of the shell metacharacters ()|&;<> through
 * Unicode private-use codepoints before handing the string to shell-quote —
 * but they implement it *differently*: parse-tools.ts builds the codepoints
 * with String.fromCodePoint(0xe000...), while parse-sdk-options.ts embeds the
 * literal U+E000-U+E006 characters in the source. Those literals are
 * invisible in most editors and diffs, so the shapes can drift apart without
 * anything looking wrong. Every metacharacter is exercised below for exactly
 * that reason.
 *
 * The contract is set equality, not array equality: when a single claude_args
 * uses *both* flag spellings, parse-sdk-options groups all --allowedTools
 * values ahead of all --allowed-tools values while parse-tools preserves
 * encounter order. Permission lists are sets, so that difference is benign —
 * it is pinned explicitly in the last test rather than left undiscovered.
 */

import { describe, expect, test } from "bun:test";
import { parseAllowedTools } from "../src/modes/agent/parse-tools";
import { parseSdkOptions } from "../base-action/src/parse-sdk-options";

function viaSdkParser(claudeArgs: string): string[] {
  return parseSdkOptions({ claudeArgs }).sdkOptions.allowedTools ?? [];
}

function sorted(tools: string[]): string[] {
  return [...tools].sort();
}

/**
 * `expected` pins the actual result as well as the agreement. Mutual agreement
 * alone would still pass if both parsers broke in the same way.
 */
const CASES: { name: string; claudeArgs: string; expected: string[] }[] = [
  {
    name: "quoted parens",
    claudeArgs: `--allowedTools "Bash(gh:*)"`,
    expected: ["Bash(gh:*)"],
  },
  {
    // The original bug: shell-quote split this into a bare `Bash`, silently
    // widening a scoped rule to Bash(*).
    name: "unquoted parens",
    claudeArgs: `--allowedTools Bash(gh:*)`,
    expected: ["Bash(gh:*)"],
  },
  {
    name: "pipe",
    claudeArgs: `--allowedTools "Bash(cmd:a|b)"`,
    expected: ["Bash(cmd:a|b)"],
  },
  {
    name: "ampersand",
    claudeArgs: `--allowedTools "Bash(a && b)"`,
    expected: ["Bash(a && b)"],
  },
  {
    name: "semicolon",
    claudeArgs: `--allowedTools "Bash(a; b)"`,
    expected: ["Bash(a; b)"],
  },
  {
    name: "output redirection",
    claudeArgs: `--allowedTools "Bash(echo > f)"`,
    expected: ["Bash(echo > f)"],
  },
  {
    name: "input redirection",
    claudeArgs: `--allowedTools "Bash(cat < f)"`,
    expected: ["Bash(cat < f)"],
  },
  {
    name: "consecutive values are all consumed",
    claudeArgs: `--allowedTools "Read" "Grep" "mcp__github__get_commit"`,
    expected: ["Read", "Grep", "mcp__github__get_commit"],
  },
  {
    name: "comma-separated values",
    claudeArgs: `--allowedTools Read,Grep`,
    expected: ["Read", "Grep"],
  },
  {
    // shell-quote returns unquoted globs as {op:"glob"} objects, not strings.
    name: "glob pattern",
    claudeArgs: `--allowedTools "mcp__github__*"`,
    expected: ["mcp__github__*"],
  },
  {
    name: "double-star path glob",
    claudeArgs: `--allowedTools "Read(path/**)"`,
    expected: ["Read(path/**)"],
  },
  {
    name: "full comment lines are stripped",
    claudeArgs: `# not a real flag: --allowedTools Bash\n--allowedTools "Read"`,
    expected: ["Read"],
  },
  {
    name: "hyphenated flag spelling",
    claudeArgs: `--allowed-tools "Read"`,
    expected: ["Read"],
  },
  {
    name: "repeated flag accumulates",
    claudeArgs: `--allowedTools Read --allowedTools Write`,
    expected: ["Read", "Write"],
  },
  {
    name: "duplicates collapse",
    claudeArgs: `--allowedTools Read,Read`,
    expected: ["Read"],
  },
  {
    name: "surrounded by unrelated flags",
    claudeArgs: `--model sonnet --allowedTools Read --max-turns 3`,
    expected: ["Read"],
  },
  {
    name: "disallowedTools does not leak into allowed",
    claudeArgs: `--allowedTools Read --disallowedTools Bash`,
    expected: ["Read"],
  },
  {
    name: "flag with no value",
    claudeArgs: `--allowedTools`,
    expected: [],
  },
  { name: "empty string", claudeArgs: ``, expected: [] },
  { name: "whitespace only", claudeArgs: `   `, expected: [] },
  { name: "no tool flags at all", claudeArgs: `--model sonnet`, expected: [] },
];

describe("claude_args tokenizer agreement", () => {
  describe("parseAllowedTools matches parseSdkOptions", () => {
    for (const { name, claudeArgs, expected } of CASES) {
      test(name, () => {
        const fromToolsParser = parseAllowedTools(claudeArgs);
        const fromSdkParser = viaSdkParser(claudeArgs);

        expect(sorted(fromToolsParser)).toEqual(sorted(expected));
        expect(sorted(fromSdkParser)).toEqual(sorted(expected));
        expect(sorted(fromToolsParser)).toEqual(sorted(fromSdkParser));
      });
    }
  });

  test("every escaped shell metacharacter round-trips through both parsers", () => {
    // If the two escape tables ever diverge — a codepoint changed on one side,
    // or an editor mangled the invisible literals in parse-sdk-options.ts —
    // at least one of these stops round-tripping.
    for (const metachar of ["(", ")", "|", "&", ";", "<", ">"]) {
      const tool = `Bash(a${metachar}b)`;
      const claudeArgs = `--allowedTools "${tool}"`;

      expect(parseAllowedTools(claudeArgs)).toEqual([tool]);
      expect(viaSdkParser(claudeArgs)).toEqual([tool]);
    }
  });

  test("no private-use codepoint survives into a parsed tool name", () => {
    // The escape is an internal transport detail; leaking U+E000-U+E006 into a
    // permission rule would silently never match.
    const claudeArgs = `--allowedTools "Bash(gh:*)" "Bash(a|b)" "Bash(c;d)"`;
    const leaked = /[\u{E000}-\u{E006}]/u;

    for (const tool of [
      ...parseAllowedTools(claudeArgs),
      ...viaSdkParser(claudeArgs),
    ]) {
      expect(tool).not.toMatch(leaked);
    }
  });

  test("mixing both flag spellings agrees on the set, not the order", () => {
    // Pinned deliberately: the divergence is real but benign, and a future
    // reader should find it documented rather than rediscover it.
    const claudeArgs = `--allowed-tools "Read"\n--allowedTools "Write"`;

    expect(parseAllowedTools(claudeArgs)).toEqual(["Read", "Write"]);
    expect(viaSdkParser(claudeArgs)).toEqual(["Write", "Read"]);
    expect(sorted(parseAllowedTools(claudeArgs))).toEqual(
      sorted(viaSdkParser(claudeArgs)),
    );
  });
});
