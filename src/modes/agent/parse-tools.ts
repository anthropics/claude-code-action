import { parse as parseShellArgs } from "shell-quote";

// Flags whose values make up the allowed-tools list.
// Include both camelCase and hyphenated variants for CLI compatibility.
const ALLOWED_TOOLS_FLAGS = new Set(["allowedTools", "allowed-tools"]);

// shell-quote treats ()|&;<> as control operators and splits adjacent text
// around them into separate tokens (returned as `{op}` objects, which get
// dropped below). For CLI args these must be literal characters — e.g.
// unquoted `--allowedTools Bash(gh:*)` would otherwise be mangled into bare
// `Bash`, silently widening a scoped permission rule. We escape each
// metachar to a Unicode private-use codepoint before parsing and restore it
// afterward, mirroring base-action/src/parse-sdk-options.ts exactly — this
// tokenizer MUST stay in agreement with that one (see parseAllowedTools below).
// Codepoints U+E000-U+E006, a Unicode private-use range that can't appear in
// real CLI args, so round-tripping through it is lossless.
const SHELL_META_PAIRS: [string, string][] = [
  ["(", String.fromCodePoint(0xe000)],
  [")", String.fromCodePoint(0xe001)],
  ["|", String.fromCodePoint(0xe002)],
  ["&", String.fromCodePoint(0xe003)],
  [";", String.fromCodePoint(0xe004)],
  ["<", String.fromCodePoint(0xe005)],
  [">", String.fromCodePoint(0xe006)],
];
const SHELL_META_ESCAPE = new Map(SHELL_META_PAIRS);
const SHELL_META_UNESCAPE = new Map(SHELL_META_PAIRS.map(([k, v]) => [v, k]));
const SHELL_META_ESCAPE_RE = /[()|&;<>]/g;
const SHELL_META_UNESCAPE_RE = new RegExp(
  `[\\u${(0xe000).toString(16)}-\\u${(0xe006).toString(16)}]`,
  "g",
);

function escapeShellMeta(s: string): string {
  return s.replace(SHELL_META_ESCAPE_RE, (c) => SHELL_META_ESCAPE.get(c)!);
}

function unescapeShellMeta(s: string): string {
  return s.replace(SHELL_META_UNESCAPE_RE, (c) => SHELL_META_UNESCAPE.get(c)!);
}

/**
 * Strip comment lines from a shell argument string.
 * Lines whose first non-whitespace character is `#` are removed entirely.
 * Mirrors stripShellComments in base-action/src/parse-sdk-options.ts.
 */
function stripShellComments(input: string): string {
  return input
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/**
 * Tokenize a claude_args string the same way base-action/src/parse-sdk-options.ts
 * does: strip full comment lines, escape shell metacharacters, then run
 * shell-quote. shell-quote returns unquoted glob patterns (e.g.
 * `mcp__github__*`) as `{ op: "glob", pattern }` objects rather than strings,
 * so recover their literal text (unescaping metachars back); drop operator
 * tokens (`|`, `>`, `;`, ...) which carry no value.
 */
function tokenize(claudeArgs: string): string[] {
  const escaped = escapeShellMeta(stripShellComments(claudeArgs));
  return parseShellArgs(escaped)
    .map((token) => {
      if (typeof token === "string") return unescapeShellMeta(token);
      if (token && typeof token === "object" && "pattern" in token) {
        return unescapeShellMeta((token as { pattern: string }).pattern);
      }
      return null;
    })
    .filter((token): token is string => token !== null);
}

/**
 * Parse the list of allowed tool names from a user-provided claude_args string.
 *
 * This is used to decide which GitHub MCP servers to install. It MUST stay in
 * agreement with how the actual tool list is built for the SDK in
 * base-action/src/parse-sdk-options.ts (parseClaudeArgsToExtraArgs): otherwise a
 * tool can be granted to Claude without its MCP server being installed, or a
 * server can be installed for a tool that was never granted (#1357).
 *
 * To stay in agreement it uses the same shell-quote tokenizer and the same
 * "an accumulating flag consumes all consecutive non-flag values" semantics,
 * so `--allowedTools "Read" "Grep" "mcp__github__get_commit"` captures all
 * three values, and commented-out lines are ignored.
 */
export function parseAllowedTools(claudeArgs: string): string[] {
  if (!claudeArgs?.trim()) return [];

  const args = tokenize(claudeArgs);
  const tools: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg?.startsWith("--")) continue;

    const flag = arg.slice(2);
    if (!ALLOWED_TOOLS_FLAGS.has(flag)) continue;

    // Consume all consecutive non-flag values, e.g.
    //   --allowedTools "Read" "Grep" "mcp__github__get_commit"
    while (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
      i++;
      for (const tool of args[i]!.split(",")) {
        const trimmed = tool.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          tools.push(trimmed);
        }
      }
    }
  }

  return tools;
}
