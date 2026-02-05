import { runClaudeWithSdk } from "./run-claude-sdk";
import type { ClaudeRunResult } from "./run-claude-sdk";
import { parseSdkOptions } from "./parse-sdk-options";
import { runOpenAICompatible } from "./run-openai-compatible";
import type { OpenAICompatibleConfig } from "./run-openai-compatible";

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

/**
 * Check if OpenAI-compatible mode is configured.
 */
export function isOpenAICompatibleMode(): boolean {
  return process.env.USE_OPENAI_COMPATIBLE === "1";
}

/**
 * Build OpenAI-compatible config from environment variables.
 */
function getOpenAICompatibleConfig(
  showFullOutput: boolean,
): OpenAICompatibleConfig {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
  const model = process.env.OPENAI_COMPATIBLE_MODEL;
  const maxTokens = parseInt(
    process.env.OPENAI_COMPATIBLE_MAX_TOKENS || "4096",
    10,
  );

  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      "OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_BASE_URL, and OPENAI_COMPATIBLE_MODEL are required for OpenAI-compatible mode.",
    );
  }

  return {
    apiKey,
    baseUrl,
    model,
    maxTokens,
    showFullOutput,
  };
}

export async function runClaude(
  promptPath: string,
  options: ClaudeOptions,
): Promise<ClaudeRunResult> {
  // Route to OpenAI-compatible provider if configured
  if (isOpenAICompatibleMode()) {
    const isDebugMode = process.env.ACTIONS_STEP_DEBUG === "true";
    const showFullOutput = options.showFullOutput === "true" || isDebugMode;
    const config = getOpenAICompatibleConfig(showFullOutput);
    return runOpenAICompatible(promptPath, config);
  }

  // Default: use Claude Code SDK
  const parsedOptions = parseSdkOptions(options);
  return runClaudeWithSdk(promptPath, parsedOptions);
}
