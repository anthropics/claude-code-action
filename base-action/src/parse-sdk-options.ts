import { parse as parseShellArgs } from "shell-quote";
import type { ClaudeOptions } from "./run-claude";
import type {
  Options as SdkOptions,
  McpStdioServerConfig,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * MCP server configuration object structure (for parsing JSON config files)
 */
type McpConfigFile = {
  mcpServers?: Record<string, McpStdioServerConfig>;
};

/**
 * Parse JSON schema from claudeArgs string
 * Handles formats like: --json-schema '{"type":"object",...}'
 */
function extractJsonSchema(
  claudeArgs?: string,
): Record<string, unknown> | undefined {
  if (!claudeArgs) return undefined;

  // Match --json-schema followed by a JSON string (single or double quoted)
  const singleQuoteMatch = claudeArgs.match(/--json-schema\s+'([^']+)'/);
  if (singleQuoteMatch?.[1]) {
    try {
      return JSON.parse(singleQuoteMatch[1]);
    } catch {
      return undefined;
    }
  }

  const doubleQuoteMatch = claudeArgs.match(/--json-schema\s+"([^"]+)"/);
  if (doubleQuoteMatch?.[1]) {
    try {
      return JSON.parse(doubleQuoteMatch[1]);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Parse MCP config from claudeArgs and mcpConfig input
 * Returns the mcpServers record merged from all configs
 */
function parseMcpConfigs(
  claudeArgs?: string,
  mcpConfigInput?: string,
): Record<string, McpStdioServerConfig> | undefined {
  const result: Record<string, McpStdioServerConfig> = {};
  let hasConfigs = false;

  // Parse from mcpConfig input (direct JSON)
  if (mcpConfigInput?.trim()) {
    try {
      const parsed = JSON.parse(mcpConfigInput) as McpConfigFile;
      if (parsed.mcpServers) {
        Object.assign(result, parsed.mcpServers);
        hasConfigs = true;
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // Parse from claudeArgs --mcp-config flags
  if (claudeArgs?.trim()) {
    const args = parseShellArgs(claudeArgs).filter(
      (arg): arg is string => typeof arg === "string",
    );

    for (let i = 0; i < args.length; i++) {
      const configValue = args[i + 1];
      if (args[i] === "--mcp-config" && configValue) {
        try {
          const parsed = JSON.parse(configValue) as McpConfigFile;
          if (parsed.mcpServers) {
            Object.assign(result, parsed.mcpServers);
            hasConfigs = true;
          }
        } catch {
          // Not valid JSON - could be file path, skip for now
        }
        i++; // Skip the value in next iteration
      }
    }
  }

  return hasConfigs ? result : undefined;
}

/**
 * Result of parsing ClaudeOptions for SDK usage
 */
export type ParsedSdkOptions = {
  sdkOptions: SdkOptions;
  showFullOutput: boolean;
  hasJsonSchema: boolean;
};

/**
 * Parse ClaudeOptions into SDK-compatible options
 */
export function parseSdkOptions(options: ClaudeOptions): ParsedSdkOptions {
  // Determine output verbosity
  const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
  const showFullOutput = options.showFullOutput === "true" || isDebugMode;

  // Parse JSON schema from claudeArgs
  const jsonSchema = extractJsonSchema(options.claudeArgs);

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

  // Build custom environment
  const env: Record<string, string | undefined> = { ...process.env };
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    env.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }

  const sdkOptions: SdkOptions = {
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    allowedTools: options.allowedTools
      ? options.allowedTools.split(",").map((t) => t.trim())
      : undefined,
    disallowedTools: options.disallowedTools
      ? options.disallowedTools.split(",").map((t) => t.trim())
      : undefined,
    systemPrompt,
    mcpServers: parseMcpConfigs(options.claudeArgs, options.mcpConfig),
    outputFormat: jsonSchema
      ? { type: "json_schema", schema: jsonSchema }
      : undefined,
    fallbackModel: options.fallbackModel,
    pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
    // Use bypassPermissions since GitHub Actions runs in a trusted environment
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env,
  };

  return {
    sdkOptions,
    showFullOutput,
    hasJsonSchema: !!jsonSchema,
  };
}
