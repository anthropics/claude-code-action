import { runClaudeWithSdk } from "./run-claude-sdk";
import type { ClaudeRunResult } from "./run-claude-sdk";
import { parseSdkOptions } from "./parse-sdk-options";
import { disallowUnlistedMcpTools } from "./mcp-tool-filter";

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
