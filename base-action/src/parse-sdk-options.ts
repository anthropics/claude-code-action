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
  const args = parseShellArgs(claudeArgs).filter(
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
  // Ensure SDK path uses the same entrypoint as the CLI path
  env.CLAUDE_CODE_ENTRYPOINT = "claude-code-github-action";

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

  // Build SDK options - use merged tools from both direct options and claudeArgs
  const sdkOptions: SdkOptions = {
    // Direct options from ClaudeOptions inputs
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    allowedTools:
      mergedAllowedTools.length > 0 ? mergedAllowedTools : undefined,
    disallowedTools:
      mergedDisallowedTools.length > 0 ? mergedDisallowedTools : undefined,
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
