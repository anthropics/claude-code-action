import * as core from "@actions/core";
import { writeFile } from "fs/promises";
import {
  query,
  type SDKMessage,
  type Options,
} from "@anthropic-ai/claude-code";

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;

export type ClaudeOptions = {
  allowedTools?: string;
  disallowedTools?: string;
  maxTurns?: string;
  mcpConfig?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  claudeEnv?: string;
  fallbackModel?: string;
  timeoutMinutes?: string;
  model?: string;
};

export function parseCustomEnvVars(claudeEnv?: string): Record<string, string> {
  if (!claudeEnv || claudeEnv.trim() === "") {
    return {};
  }

  const customEnv: Record<string, string> = {};

  // Split by lines and parse each line as KEY: VALUE
  const lines = claudeEnv.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      continue; // Skip empty lines and comments
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) {
      continue; // Skip lines without colons
    }

    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    if (key) {
      customEnv[key] = value;
    }
  }

  return customEnv;
}

export function parseTools(toolsString?: string): string[] | undefined {
  if (!toolsString || toolsString.trim() === "") {
    return undefined;
  }
  return toolsString
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

export function parseMcpConfig(
  mcpConfigString?: string,
): Record<string, any> | undefined {
  if (!mcpConfigString || mcpConfigString.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(mcpConfigString);
  } catch (e) {
    core.warning(`Failed to parse MCP config: ${e}`);
    return undefined;
  }
}

export async function runClaude(promptPath: string, options: ClaudeOptions) {
  // Read prompt from file
  const prompt = await Bun.file(promptPath).text();

  // Parse options
  const customEnv = parseCustomEnvVars(options.claudeEnv);

  // Apply custom environment variables
  for (const [key, value] of Object.entries(customEnv)) {
    process.env[key] = value;
  }

  // Set up SDK options
  const sdkOptions: Options = {
    cwd: process.cwd(),
  };

  if (options.allowedTools) {
    sdkOptions.allowedTools = parseTools(options.allowedTools);
  }

  if (options.disallowedTools) {
    sdkOptions.disallowedTools = parseTools(options.disallowedTools);
  }

  if (options.maxTurns) {
    const maxTurnsNum = parseInt(options.maxTurns, 10);
    if (isNaN(maxTurnsNum) || maxTurnsNum <= 0) {
      throw new Error(
        `maxTurns must be a positive number, got: ${options.maxTurns}`,
      );
    }
    sdkOptions.maxTurns = maxTurnsNum;
  }

  if (options.mcpConfig) {
    sdkOptions.mcpServers = parseMcpConfig(options.mcpConfig);
  }

  if (options.systemPrompt) {
    sdkOptions.customSystemPrompt = options.systemPrompt;
  }

  if (options.appendSystemPrompt) {
    sdkOptions.appendSystemPrompt = options.appendSystemPrompt;
  }

  if (options.fallbackModel) {
    sdkOptions.fallbackModel = options.fallbackModel;
  }

  if (options.model) {
    sdkOptions.model = options.model;
  }

  // Set up timeout
  let timeoutMs = 10 * 60 * 1000; // Default 10 minutes
  if (options.timeoutMinutes) {
    const timeoutMinutesNum = parseInt(options.timeoutMinutes, 10);
    if (isNaN(timeoutMinutesNum) || timeoutMinutesNum <= 0) {
      throw new Error(
        `timeoutMinutes must be a positive number, got: ${options.timeoutMinutes}`,
      );
    }
    timeoutMs = timeoutMinutesNum * 60 * 1000;
  } else if (process.env.INPUT_TIMEOUT_MINUTES) {
    const envTimeout = parseInt(process.env.INPUT_TIMEOUT_MINUTES, 10);
    if (isNaN(envTimeout) || envTimeout <= 0) {
      throw new Error(
        `INPUT_TIMEOUT_MINUTES must be a positive number, got: ${process.env.INPUT_TIMEOUT_MINUTES}`,
      );
    }
    timeoutMs = envTimeout * 60 * 1000;
  }

  // Create abort controller for timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`Claude process timed out after ${timeoutMs / 1000} seconds`);
    abortController.abort();
  }, timeoutMs);

  sdkOptions.abortController = abortController;

  console.log(`Running Claude with prompt from file: ${promptPath}`);

  // Log custom environment variables if any
  if (Object.keys(customEnv).length > 0) {
    const envKeys = Object.keys(customEnv).join(", ");
    console.log(`Custom environment variables: ${envKeys}`);
  }

  const messages: SDKMessage[] = [];
  let executionFailed = false;

  try {
    // Execute the query
    for await (const message of query({
      prompt,
      abortController,
      options: sdkOptions,
    })) {
      messages.push(message);

      // Pretty print the message to stdout
      const prettyJson = JSON.stringify(message, null, 2);
      console.log(prettyJson);

      // Check if execution failed
      if (message.type === "result" && message.is_error) {
        executionFailed = true;
      }
    }
  } catch (error) {
    console.error("Error during Claude execution:", error);
    executionFailed = true;

    // Add error to messages if it's not an abort
    if (error instanceof Error && error.name !== "AbortError") {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  // Save execution output
  try {
    await writeFile(EXECUTION_FILE, JSON.stringify(messages, null, 2));
    console.log(`Log saved to ${EXECUTION_FILE}`);
    core.setOutput("execution_file", EXECUTION_FILE);
  } catch (e) {
    core.warning(`Failed to save execution file: ${e}`);
  }

  // Set conclusion
  if (executionFailed) {
    core.setOutput("conclusion", "failure");
    process.exit(1);
  } else {
    core.setOutput("conclusion", "success");
  }
}
