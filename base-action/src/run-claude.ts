import { runClaudeWithSdk } from "./run-claude-sdk";
import type { ClaudeRunResult } from "./run-claude-sdk";
import { parseSdkOptions } from "./parse-sdk-options";
import { disallowUnlistedMcpTools } from "./mcp-tool-filter";

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export type ClaudeOptions = {
  claudeArgs?: string;
  model?: string;
  pathToClaudeCodeExecutable?: string;
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  fallbackModel?: string;
  showFullOutput?: string;
  /** Mode to switch to when auto mode was asked for but isn't available. */
  fallbackPermissionMode?: PermissionMode;
  disallowUnlistedMcpTools?: string;
};

export async function runClaude(
  promptPath: string,
  options: ClaudeOptions,
): Promise<ClaudeRunResult> {
  const parsedOptions = parseSdkOptions(options);
  if (options.disallowUnlistedMcpTools === "true") {
    await disallowUnlistedMcpTools(parsedOptions.sdkOptions);
  }
  return runClaudeWithSdk(promptPath, parsedOptions);
}
