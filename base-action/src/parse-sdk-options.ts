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
const ACCUMULATING_FLAGS = new Set(["allowedTools", "disallowedTools"]);

/**
 * Parse claudeArgs string into extraArgs record for SDK pass-through
 * The SDK/CLI will handle --mcp-config, --json-schema, etc.
 * For allowedTools and disallowedTools, multiple occurrences are accumulated (comma-joined).
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
        // For accumulating flags, join multiple values with commas
        if (ACCUMULATING_FLAGS.has(flag) && result[flag]) {
          result[flag] = `${result[flag]},${nextArg}`;
        } else {
          result[flag] = nextArg;
        }
        i++; // Skip the value
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

  // Extract and merge allowedTools from both sources:
  // 1. From extraArgs (parsed from claudeArgs - contains tag mode's tools)
  // 2. From options.allowedTools (direct input - may be undefined)
  // This prevents duplicate flags being overwritten when claudeArgs contains --allowedTools
  const extraArgsAllowedTools = extraArgs["allowedTools"]
    ? extraArgs["allowedTools"].split(",").map((t) => t.trim())
    : [];
  const directAllowedTools = options.allowedTools
    ? options.allowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedAllowedTools = [
    ...new Set([...extraArgsAllowedTools, ...directAllowedTools]),
  ];
  delete extraArgs["allowedTools"];

  // Same for disallowedTools
  const extraArgsDisallowedTools = extraArgs["disallowedTools"]
    ? extraArgs["disallowedTools"].split(",").map((t) => t.trim())
    : [];
  const directDisallowedTools = options.disallowedTools
    ? options.disallowedTools.split(",").map((t) => t.trim())
    : [];
  const mergedDisallowedTools = [
    ...new Set([...extraArgsDisallowedTools, ...directDisallowedTools]),
  ];
  delete extraArgs["disallowedTools"];

  // Build custom environment
  const env: Record<string, string | undefined> = { ...process.env };
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    env.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }

  // Build system prompt option
  let systemPrompt: SdkOptions["systemPrompt"];
  if (options.systemPrompt) {
    systemPrompt = options.systemPrompt;
  } else if (options.appendSystemPrompt) {
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: options.appendSystemPrompt,
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
  };

  return {
    sdkOptions,
    showFullOutput,
    hasJsonSchema,
  };
}
