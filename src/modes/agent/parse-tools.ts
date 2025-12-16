import { parse as parseShellArgs, type ParseEntry } from "shell-quote";

/**
 * Extract the string value from a shell-quote ParseEntry.
 * Handles both plain strings and glob patterns (which are returned as objects).
 */
function entryToString(entry: ParseEntry): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  // Handle glob patterns - shell-quote returns { op: "glob", pattern: "..." }
  if (typeof entry === "object" && "op" in entry && entry.op === "glob") {
    return (entry as { op: "glob"; pattern: string }).pattern;
  }
  return null;
}

export function parseAllowedTools(claudeArgs: string): string[] {
  if (!claudeArgs?.trim()) return [];

  const result: string[] = [];

  // Use shell-quote to properly tokenize the arguments
  // This handles quoted strings, escaped characters, etc.
  const rawArgs = parseShellArgs(claudeArgs);

  for (let i = 0; i < rawArgs.length; i++) {
    const entry = rawArgs[i];
    if (!entry) continue;
    const arg = entryToString(entry);
    if (!arg) continue;

    // Match both --allowedTools and --allowed-tools
    if (arg === "--allowedTools" || arg === "--allowed-tools") {
      // Collect all subsequent non-flag values as tools
      while (i + 1 < rawArgs.length) {
        const nextEntry = rawArgs[i + 1];
        if (!nextEntry) break;
        const toolArg = entryToString(nextEntry);

        // Stop if we hit another flag or a non-parseable entry
        if (!toolArg || toolArg.startsWith("--")) {
          break;
        }

        // Split by comma in case tools are comma-separated within a single value
        const tools = toolArg.split(",").map((t) => t.trim());
        result.push(...tools.filter((t) => t.length > 0));
        i++;
      }
    }
  }

  return result;
}
