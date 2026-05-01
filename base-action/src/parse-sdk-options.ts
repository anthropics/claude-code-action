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
 * Result of splitting --mcp-config values into the SDK-native inline path
 * and the CLI-handled file-path passthrough.
 *
 * inlineServers: parsed mcpServers entries from inline JSON values (merged).
 *   These are routed to Options.mcpServers — the SDK's typed, in-process MCP
 *   registration path. Going through the typed API avoids the brittle CLI
 *   forwarding of --mcp-config '{...}' from extraArgs, which is the failure
 *   mode reported in #1245 / #1191 (action-prepended JSON correctly stored
 *   in extraArgs but the spawned CLI's session init still reports
 *   `mcp_servers: []`).
 *
 * filePath: at most one --mcp-config file path. File paths cannot be merged
 *   at parse time (no fs access here) and are forwarded to the CLI via
 *   extraArgs["mcp-config"] unchanged. The CLI loads and merges the file
 *   alongside any servers we registered via Options.mcpServers.
 */
type SplitMcpConfigs = {
  inlineServers: Record<string, unknown>;
  filePath: string | null;
};

/**
 * Split --mcp-config values into inline mcpServers (for Options.mcpServers)
 * and at most one file path (for extraArgs passthrough to the CLI).
 *
 * Inline JSON across multiple --mcp-config flags is merged into a single
 * mcpServers map; later entries override earlier ones on key conflict, which
 * matches the previous mergeMcpConfigs() behavior so user inline JSON can
 * still override action-prepended servers.
 */
function splitMcpConfigs(configValues: string[]): SplitMcpConfigs {
  const inlineServers: Record<string, unknown> = {};
  let filePath: string | null = null;

  for (const config of configValues) {
    const trimmed = config.trim();
    if (!trimmed) continue;

    // Check if it's a JSON string (starts with {) or a file path
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as McpConfig;
        if (parsed.mcpServers) {
          Object.assign(inlineServers, parsed.mcpServers);
        }
      } catch {
        // If JSON parsing fails, treat as file path
        filePath = trimmed;
      }
    } else {
      // It's a file path - store it to handle separately
      filePath = trimmed;
    }
  }

  return { inlineServers, filePath };
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

  // Route inline --mcp-config JSON to Options.mcpServers (SDK-native typed
  // path), and leave file paths in extraArgs for the CLI to load.
  //
  // Background (#1245, #1191): the action prepends its bundled servers
  // (github_comment, github_ci, github_inline_comment, github_file_ops,
  // optional github) as a single `--mcp-config '{...}'` flag inside
  // claudeArgs. Earlier this stayed in extraArgs and was meant to be
  // forwarded to the spawned Claude CLI. Multiple users have reported that
  // the spawned CLI's session init reports `mcp_servers: []` even though
  // extraArgs["mcp-config"] is correctly populated — the CLI subprocess
  // never registers the inline servers. The SDK exposes a typed,
  // in-process registration path via Options.mcpServers (used by Anthropic's
  // own SDK demos) which doesn't depend on stringified-JSON CLI forwarding.
  // Routing inline JSON through that path makes the bundled servers spawn
  // reliably; file paths still go through the CLI flag because we can't
  // load them from disk here without changing this function's signature.
  let inlineMcpServers: Record<string, unknown> = {};
  if (extraArgs["mcp-config"]) {
    const mcpConfigValues = extraArgs["mcp-config"].split(ACCUMULATE_DELIMITER);
    const { inlineServers, filePath } = splitMcpConfigs(mcpConfigValues);
    inlineMcpServers = inlineServers;
    if (filePath) {
      extraArgs["mcp-config"] = filePath;
    } else {
      delete extraArgs["mcp-config"];
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
    // Inline --mcp-config JSON (action-bundled + user inline) registered via
    // the SDK's typed mcpServers path so the spawned CLI sees them in
    // session init (`mcp_servers`). Cast keeps the Record<string, unknown>
    // shape we built compatible with the SDK's narrower McpServerConfig union
    // (each entry is the same {command, args, env}/{type, url, ...} shape the
    // SDK already accepts via .mcp.json).
    mcpServers:
      Object.keys(inlineMcpServers).length > 0
        ? (inlineMcpServers as SdkOptions["mcpServers"])
        : undefined,

    // Pass through claudeArgs as extraArgs - CLI handles --mcp-config (file
    // paths only; inline JSON is lifted to mcpServers above), --json-schema,
    // etc. Note: allowedTools and disallowedTools have been removed from
    // extraArgs to prevent duplicates.
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
