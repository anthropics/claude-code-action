import { parse as parseShellArgs } from "shell-quote";

// Flags whose values make up the allowed-tools list.
// Include both camelCase and hyphenated variants for CLI compatibility.
const ALLOWED_TOOLS_FLAGS = new Set(["allowedTools", "allowed-tools"]);
const DISALLOWED_TOOLS_FLAGS = new Set(["disallowedTools", "disallowed-tools"]);

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
 * does: strip full comment lines, then run shell-quote. shell-quote returns
 * unquoted glob patterns (e.g. `mcp__github__*`) as `{ op: "glob", pattern }`
 * objects rather than strings, so recover their literal text; drop operator
 * tokens (`|`, `>`, `;`, ...) which carry no value.
 */
function tokenize(claudeArgs: string): string[] {
  return parseShellArgs(stripShellComments(claudeArgs))
    .map((token) => {
      if (typeof token === "string") return token;
      if (token && typeof token === "object" && "pattern" in token) {
        return (token as { pattern: string }).pattern;
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
  return parseToolFlags(claudeArgs, ALLOWED_TOOLS_FLAGS);
}

/** Parse the deny rules from a user-provided claude_args string. */
export function parseDisallowedTools(claudeArgs: string): string[] {
  return parseToolFlags(claudeArgs, DISALLOWED_TOOLS_FLAGS);
}

/**
 * Whether a deny rule such as `Bash(git commit:*)` covers every use of a command.
 * Narrower rules, such as `Bash(git commit --amend:*)`, don't count.
 */
export function deniesCommand(rules: string[], command: string): boolean {
  return rules.some((rule) => {
    const pattern = /^Bash\((.*)\)$/
      .exec(rule)?.[1]
      ?.replace(/(?::\*| \*|\*)$/, "")
      .trim();
    return (
      !!pattern && (command === pattern || command.startsWith(`${pattern} `))
    );
  });
}

function parseToolFlags(claudeArgs: string, flags: Set<string>): string[] {
  if (!claudeArgs?.trim()) return [];

  const args = tokenize(claudeArgs);
  const tools: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg?.startsWith("--")) continue;

    const flag = arg.slice(2);
    if (!flags.has(flag)) continue;

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
