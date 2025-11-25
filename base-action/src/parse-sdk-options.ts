import { parse as parseShellArgs } from "shell-quote";
import type { ClaudeOptions } from "./run-claude";

/**
 * MCP server configuration for stdio-based servers
 */
export type McpStdioServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

/**
 * MCP server configuration object structure
 */
export type McpConfigFile = {
  mcpServers?: Record<string, McpStdioServerConfig>;
};

/**
 * Options for the SDK runner
 */
export type SdkRunOptions = {
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  mcpServers?: Record<string, McpStdioServerConfig>;
  jsonSchema?: Record<string, unknown>;
  fallbackModel?: string;
  pathToClaudeCodeExecutable?: string;
  showFullOutput: boolean;
  env?: Record<string, string>;
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
 * Parse MCP config from string (either JSON or file path reference)
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
          // File paths would need to be resolved at runtime
        }
        i++; // Skip the value in next iteration
      }
    }
  }

  return hasConfigs ? result : undefined;
}

/**
 * Parse ClaudeOptions into SDK-compatible options
 */
export function parseSdkOptions(options: ClaudeOptions): SdkRunOptions {
  // Determine output verbosity
  const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
  const showFullOutput = options.showFullOutput === "true" || isDebugMode;

  // Build base options from direct inputs
  const sdkOptions: SdkRunOptions = {
    model: options.model,
    maxTurns: options.maxTurns ? parseInt(options.maxTurns, 10) : undefined,
    allowedTools: options.allowedTools
      ? options.allowedTools.split(",").map((t) => t.trim())
      : undefined,
    disallowedTools: options.disallowedTools
      ? options.disallowedTools.split(",").map((t) => t.trim())
      : undefined,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
    fallbackModel: options.fallbackModel,
    pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
    showFullOutput,
  };

  // Parse MCP servers from mcpConfig input and claudeArgs
  const mcpServers = parseMcpConfigs(options.claudeArgs, options.mcpConfig);
  if (mcpServers) {
    sdkOptions.mcpServers = mcpServers;
  }

  // Extract JSON schema from claudeArgs
  const jsonSchema = extractJsonSchema(options.claudeArgs);
  if (jsonSchema) {
    sdkOptions.jsonSchema = jsonSchema;
  }

  // Build custom environment
  const customEnv: Record<string, string> = {};
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    customEnv.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }
  if (Object.keys(customEnv).length > 0) {
    sdkOptions.env = customEnv;
  }

  return sdkOptions;
}
