import { parse as parseShellArgs } from "shell-quote";
import type { ClaudeOptions } from "./run-claude";
import type { Options as SdkOptions } from "@anthropic-ai/claude-agent-sdk";

/**
 * Result of parsing ClaudeOptions for SDK usage
 */
export type ParsedSdkOptions = {
  sdkOptions: SdkOptions;
  showFullOutput: boolean;
  hasJsonSchema: boolean;
};

// Flags that should accumulate multiple values instead of overwriting
// Include both camelCase and hyphenated variants for CLI compatibility
const ACCUMULATING_FLAGS = new Set([
  "allowedTools",
  "allowed-tools",
  "disallowedTools",
  "disallowed-tools",
  "mcp-config",
]);

// Delimiter used to join accumulated flag values
const ACCUMULATE_DELIMITER = "\x00";

// Built-in tool names recognized by the Claude Agent SDK.
// These are the tools the SDK can register via Options.tools (string[] form).
// Anything not in this set is either an MCP tool (mcp__*), a Bash() pattern,
// or an unknown identifier — none of which belong in the registration list.
// Source: @anthropic-ai/claude-agent-sdk type defs and CLI reference docs.
const BUILT_IN_TOOL_NAMES = new Set([
  "Bash",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "LS",
  "NotebookRead",
  "NotebookEdit",
  "Task",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
]);

/**
 * Extract the set of built-in tool names that should be registered with the SDK
 * (`Options.tools`) given a merged allow-list.
 *
 * The SDK's `Options.tools` field is the *registration* knob — it controls which
 * built-in tools are wired into the spawned CLI session. `Options.allowedTools`
 * is a separate, downstream auto-approve gate-list. Historically this action
 * only set `allowedTools`, leaving `tools` undefined; in agent mode the result
 * was that the SDK init reported `tools: ["Bash", "Read"]` regardless of what
 * the user passed in `claude_args: --allowedTools …`. The model literally could
 * not call Edit/Glob/Grep/Write/etc. even when allow-listed.
 *
 * Filtering rules (kept conservative for backwards compatibility):
 *  - Strip any `(…)` suffix, e.g. `Bash(git:*)` → `Bash`.
 *  - Drop entries that start with `mcp__` (MCP tool names, not base tools).
 *  - Keep only entries whose stem is in `BUILT_IN_TOOL_NAMES`.
 *  - Deduplicate, preserving input order.
 *
 * If the resulting set is empty, returns `undefined` so callers can leave
 * `Options.tools` unset and let the SDK fall back to its default preset.
 */
function extractBuiltInTools(
  mergedAllowedTools: string[],
): string[] | undefined {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of mergedAllowedTools) {
    if (!entry) continue;
    if (entry.startsWith("mcp__")) continue;
    // Strip any `(…)` suffix used for Bash command patterns.
    const parenIdx = entry.indexOf("(");
    const stem = parenIdx >= 0 ? entry.slice(0, parenIdx) : entry;
    if (!BUILT_IN_TOOL_NAMES.has(stem)) continue;
    if (seen.has(stem)) continue;
    seen.add(stem);
    result.push(stem);
  }
  return result.length > 0 ? result : undefined;
}

type McpConfig = {
  mcpServers?: Record<string, unknown>;
};

/**
 * Merge multiple MCP config values into a single config.
 * Each config can be a JSON string or a file path.
 * For JSON strings, mcpServers objects are merged.
 * For file paths, they are kept as-is (user's file takes precedence and is used last).
 */
function mergeMcpConfigs(configValues: string[]): string {
  const merged: McpConfig = { mcpServers: {} };
  let lastFilePath: string | null = null;

  for (const config of configValues) {
    const trimmed = config.trim();
    if (!trimmed) continue;

    // Check if it's a JSON string (starts with {) or a file path
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as McpConfig;
        if (parsed.mcpServers) {
          Object.assign(merged.mcpServers!, parsed.mcpServers);
        }
      } catch {
        // If JSON parsing fails, treat as file path
        lastFilePath = trimmed;
      }
    } else {
      // It's a file path - store it to handle separately
      lastFilePath = trimmed;
    }
  }

  // If we have file paths, we need to keep the merged JSON and let the file
  // be handled separately. Since we can only return one value, merge what we can.
  // If there's a file path, we need a different approach - read the file at runtime.
  // For now, if there's a file path, we'll stringify the merged config.
  // The action prepends its config as JSON, so we can safely merge inline JSON configs.

  // If no inline configs were found (all file paths), return the last file path
  if (Object.keys(merged.mcpServers!).length === 0 && lastFilePath) {
    return lastFilePath;
  }

  // Note: If user passes a file path, we cannot merge it at parse time since
  // we don't have access to the file system here. The action's built-in MCP
  // servers are always passed as inline JSON, so they will be merged.
  // If user also passes inline JSON, it will be merged.
  // If user passes a file path, they should ensure it includes all needed servers.

  return JSON.stringify(merged);
}

/**
 * Strip comment lines from a shell argument string.
 * Lines whose first non-whitespace character is `#` are removed entirely.
 * Inline `#` within a line (e.g. inside a quoted value) is left untouched
 * because shell-quote handles quoting — we only need to remove full comment lines
 * before shell-quote sees them.
 */
function stripShellComments(input: string): string {
  return input
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/**
 * Parse claudeArgs string into extraArgs record for SDK pass-through
 * The SDK/CLI will handle --mcp-config, --json-schema, etc.
 * For allowedTools and disallowedTools, multiple occurrences are accumulated (null-char joined).
 * Accumulating flags also consume all consecutive non-flag values
 * (e.g., --allowed-tools "Tool1" "Tool2" "Tool3" captures all three).
 */
function parseClaudeArgsToExtraArgs(
  claudeArgs?: string,
): Record<string, string | null> {
  if (!claudeArgs?.trim()) return {};

  const result: Record<string, string | null> = {};
  const args = parseShellArgs(stripShellComments(claudeArgs)).filter(
    (arg): arg is string => typeof arg === "string",
  );

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const flag = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if next arg is a value (not another flag)
      if (nextArg && !nextArg.startsWith("--")) {
        // For accumulating flags, consume all consecutive non-flag values
        // This handles: --allowed-tools "Tool1" "Tool2" "Tool3"
        if (ACCUMULATING_FLAGS.has(flag)) {
          const values: string[] = [];
          while (i + 1 < args.length && !args[i + 1]?.startsWith("--")) {
            i++;
            values.push(args[i]!);
          }
          const joinedValues = values.join(ACCUMULATE_DELIMITER);
          if (result[flag]) {
            result[flag] =
              `${result[flag]}${ACCUMULATE_DELIMITER}${joinedValues}`;
          } else {
            result[flag] = joinedValues;
          }
        } else {
          result[flag] = nextArg;
          i++; // Skip the value
        }
      } else {
        result[flag] = null; // Boolean flag
      }
    }
  }

  return result;
}

/**
 * Parse ClaudeOptions into SDK-compatible options
 * Uses extraArgs for CLI pass-through instead of duplicating option parsing
 */
export function parseSdkOptions(options: ClaudeOptions): ParsedSdkOptions {
  // Determine output verbosity
  const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
  const showFullOutput = options.showFullOutput === "true" || isDebugMode;

  // Parse claudeArgs into extraArgs for CLI pass-through
  const extraArgs = parseClaudeArgsToExtraArgs(options.claudeArgs);

  // Detect if --json-schema is present (for hasJsonSchema flag)
  const hasJsonSchema = "json-schema" in extraArgs;

  // Extract and merge allowedTools from all sources:
  // 1. From extraArgs (parsed from claudeArgs - contains tag mode's tools)
  //    - Check both camelCase (--allowedTools) and hyphenated (--allowed-tools) variants
  // 2. From options.allowedTools (direct input - may be undefined)
  // This prevents duplicate flags being overwritten when claudeArgs contains --allowedTools
  const allowedToolsValues = [
    extraArgs["allowedTools"],
    extraArgs["allowed-tools"],
  ]
    .filter(Boolean)
    .join(ACCUMULATE_DELIMITER);
  const extraArgsAllowedTools = allowedToolsValues
    ? allowedToolsValues
        .split(ACCUMULATE_DELIMITER)
        .flatMap((v) => v.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const directAllowedTools = options.allowedTools
    ? options.allowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedAllowedTools = [
    ...new Set([...extraArgsAllowedTools, ...directAllowedTools]),
  ];
  delete extraArgs["allowedTools"];
  delete extraArgs["allowed-tools"];

  // Same for disallowedTools - check both camelCase and hyphenated variants
  const disallowedToolsValues = [
    extraArgs["disallowedTools"],
    extraArgs["disallowed-tools"],
  ]
    .filter(Boolean)
    .join(ACCUMULATE_DELIMITER);
  const extraArgsDisallowedTools = disallowedToolsValues
    ? disallowedToolsValues
        .split(ACCUMULATE_DELIMITER)
        .flatMap((v) => v.split(","))
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const directDisallowedTools = options.disallowedTools
    ? options.disallowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedDisallowedTools = [
    ...new Set([...extraArgsDisallowedTools, ...directDisallowedTools]),
  ];
  delete extraArgs["disallowedTools"];
  delete extraArgs["disallowed-tools"];

  // Merge multiple --mcp-config values by combining their mcpServers objects
  // The action prepends its config (github_comment, github_ci, etc.) as inline JSON,
  // and users may provide their own config as inline JSON or file path
  if (extraArgs["mcp-config"]) {
    const mcpConfigValues = extraArgs["mcp-config"].split(ACCUMULATE_DELIMITER);
    if (mcpConfigValues.length > 1) {
      extraArgs["mcp-config"] = mergeMcpConfigs(mcpConfigValues);
    }
  }

  // Build custom environment
  const env: Record<string, string | undefined> = { ...process.env };
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    env.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }
  // Set the entrypoint for Claude Code to identify this as the GitHub Action
  env.CLAUDE_CODE_ENTRYPOINT = "claude-code-github-action";

  // Remove OIDC token request variables so Claude cannot mint new tokens.
  // These are only needed by the action itself (via @actions/core.getIDToken()),
  // not by the Claude session.
  delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
  delete env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

  // Build system prompt option - default to claude_code preset
  let systemPrompt: SdkOptions["systemPrompt"];
  if (options.systemPrompt) {
    systemPrompt = options.systemPrompt;
  } else if (options.appendSystemPrompt) {
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: options.appendSystemPrompt,
    };
  } else {
    // Default to claude_code preset when no custom prompt is specified
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
    };
  }

  // Derive the set of built-in tools to register with the SDK. The SDK uses
  // `Options.tools` as the *registration* knob; `Options.allowedTools` is only
  // the auto-approve gate-list. Without this, agent mode init reports
  // `tools: ["Bash", "Read"]` regardless of what the user passes via
  // `claude_args: --allowedTools …` — the model literally cannot call
  // Edit/Glob/Grep/Write/etc. (See issues #690, #181, #533, #264.)
  const builtInTools = extractBuiltInTools(mergedAllowedTools);

  // Build SDK options - use merged tools from both direct options and claudeArgs
  const sdkOptions: SdkOptions = {
    // Direct options from ClaudeOptions inputs
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    allowedTools:
      mergedAllowedTools.length > 0 ? mergedAllowedTools : undefined,
    disallowedTools:
      mergedDisallowedTools.length > 0 ? mergedDisallowedTools : undefined,
    // Register the built-in tools the user actually asked for. If
    // `mergedAllowedTools` contained no built-in stems (e.g. only MCP tools or
    // bare `Bash(...)` was filtered to `Bash` only), `extractBuiltInTools`
    // returns undefined and we leave `tools` unset so the SDK keeps its
    // default preset — preserving prior behaviour for that case.
    tools: builtInTools,
    systemPrompt,
    fallbackModel: options.fallbackModel,
    pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,

    // Pass through claudeArgs as extraArgs - CLI handles --mcp-config, --json-schema, etc.
    // Note: allowedTools and disallowedTools have been removed from extraArgs to prevent duplicates
    extraArgs,
    env,

    // Load settings from sources - prefer user's --setting-sources if provided, otherwise use all sources
    // This ensures users can override the default behavior (e.g., --setting-sources user to avoid in-repo configs)
    settingSources: extraArgs["setting-sources"]
      ? (extraArgs["setting-sources"].split(
          ",",
        ) as SdkOptions["settingSources"])
      : ["user", "project", "local"],
  };

  // Remove setting-sources from extraArgs to avoid passing it twice
  delete extraArgs["setting-sources"];

  return {
    sdkOptions,
    showFullOutput,
    hasJsonSchema,
  };
}
