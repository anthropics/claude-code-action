import { parse as parseShellArgs } from "shell-quote";

// Flags accepted for the model and effort values shown in tracking comments.
// "reasoning-effort" is kept as an alias for older CLI spellings.
const MODEL_FLAGS = ["model"];
const EFFORT_FLAGS = ["effort", "reasoning-effort"];

/**
 * Tokenize a claude_args string the same way base-action/src/parse-sdk-options.ts
 * does. shell-quote returns unquoted glob patterns (e.g. `mcp__github__*`) as
 * `{ op: "glob", pattern }` objects and control operators (`|`, `>`, `;`, …) as
 * bare `{ op }` objects. Recover the glob pattern text and drop operators so we
 * are left with a flat list of argument strings.
 */
function tokenize(claudeArgs: string): string[] {
  return parseShellArgs(claudeArgs)
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
 * Return the value for the first of `flags` present in a claude_args string,
 * or `undefined` if none of them are set. Supports both `--flag value` and
 * `--flag=value` spellings.
 */
export function parseFlagValue(
  claudeArgs: string | undefined,
  flags: string[],
): string | undefined {
  if (!claudeArgs?.trim()) return undefined;

  const args = tokenize(claudeArgs);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) continue;

    const eqIndex = arg.indexOf("=");
    const name = (eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2)).trim();
    if (!flags.includes(name)) continue;

    // `--flag=value` — return the inline value.
    if (eqIndex >= 0) {
      const value = arg.slice(eqIndex + 1);
      return value ? value : undefined;
    }

    // `--flag value` — return the next token when it is not another flag.
    const next = args[i + 1];
    if (next && !next.startsWith("--")) return next;
  }

  return undefined;
}

/**
 * Resolve the active model: the `ANTHROPIC_MODEL` env var takes precedence
 * (mirroring base-action's `options.model || modelFromClaudeArgs`), then
 * `--model` from claude_args. Returns `undefined` when neither is set so the
 * comment can omit the field instead of showing an empty value.
 */
export function resolveModel(claudeArgs?: string): string | undefined {
  return process.env.ANTHROPIC_MODEL || parseFlagValue(claudeArgs, MODEL_FLAGS);
}

/**
 * Resolve the active reasoning-effort level from `--effort` (or its
 * `--reasoning-effort` alias) in claude_args, or `undefined` when unset.
 */
export function resolveEffort(claudeArgs?: string): string | undefined {
  return parseFlagValue(claudeArgs, EFFORT_FLAGS);
}
