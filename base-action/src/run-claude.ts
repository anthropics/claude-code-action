import { runClaudeWithSdk } from "./run-claude-sdk";
import { parseSdkOptions } from "./parse-sdk-options";

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
};

export async function runClaude(promptPath: string, options: ClaudeOptions) {
  const parsedOptions = parseSdkOptions(options);
  return runClaudeWithSdk(promptPath, parsedOptions);
}
