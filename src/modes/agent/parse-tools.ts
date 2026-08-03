import { splitClaudeArgs } from "../../../base-action/src/parse-sdk-options";

// Flags whose values make up the allowed-tools list.
// Include both camelCase and hyphenated variants for CLI compatibility.
const ALLOWED_TOOLS_FLAGS = new Set(["allowedTools", "allowed-tools"]);

/**
 * Parse the list of allowed tool names from a user-provided claude_args string.
 *
 * This is used to decide which GitHub MCP servers to install. It MUST stay in
 * agreement with how the actual tool list is built for the SDK in
 * base-action/src/parse-sdk-options.ts (parseClaudeArgsToExtraArgs): otherwise a
 * tool can be granted to Claude without its MCP server being installed, or a
 * server can be installed for a tool that was never granted (#1357).
 *
 * To stay in agreement it uses that file's tokenizer (`splitClaudeArgs`) and
 * the same "an accumulating flag consumes all consecutive non-flag values"
 * semantics, so `--allowedTools "Read" "Grep" "mcp__github__get_commit"`
 * captures all three values, and commented-out lines are ignored.
 */
export function parseAllowedTools(claudeArgs: string): string[] {
  if (!claudeArgs?.trim()) return [];

  const args = splitClaudeArgs(claudeArgs);
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
