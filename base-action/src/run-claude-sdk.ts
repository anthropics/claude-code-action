import * as core from "@actions/core";
import { readFile, writeFile } from "fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
  Options as SdkOptions,
  McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { SdkRunOptions, McpStdioServerConfig } from "./parse-sdk-options";

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;

/**
 * Sanitizes SDK output to match CLI sanitization behavior
 * Returns a safe summary message or null if the message should be completely suppressed
 */
function sanitizeSdkOutput(
  message: SDKMessage,
  showFullOutput: boolean,
): string | null {
  if (showFullOutput) {
    return JSON.stringify(message, null, 2);
  }

  // System initialization - safe to show
  if (message.type === "system" && message.subtype === "init") {
    return JSON.stringify(
      {
        type: "system",
        subtype: "init",
        message: "Claude Code initialized",
        model: "model" in message ? message.model : "unknown",
      },
      null,
      2,
    );
  }

  // Result messages - Always show the final result (sanitized)
  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    return JSON.stringify(
      {
        type: "result",
        subtype: resultMsg.subtype,
        is_error: resultMsg.is_error,
        duration_ms: resultMsg.duration_ms,
        num_turns: resultMsg.num_turns,
        total_cost_usd: resultMsg.total_cost_usd,
        permission_denials: resultMsg.permission_denials,
      },
      null,
      2,
    );
  }

  // For any other message types, suppress completely in non-full-output mode
  return null;
}

/**
 * Transform SDK messages to include CLI-compatible fields for backward compatibility
 * Adds cost_usd alias since CLI uses cost_usd while SDK uses total_cost_usd
 */
function transformForCompatibility(messages: SDKMessage[]): object[] {
  return messages.map((msg) => {
    if (msg.type === "result") {
      const resultMsg = msg as SDKResultMessage;
      return {
        ...resultMsg,
        // Add cost_usd alias for backward compatibility with update-comment-link.ts
        cost_usd: resultMsg.total_cost_usd,
      };
    }
    return msg;
  });
}

/**
 * Convert SdkRunOptions.mcpServers to SDK-compatible McpServerConfig
 */
function convertMcpServers(
  mcpServers?: Record<string, McpStdioServerConfig>,
): Record<string, McpServerConfig> | undefined {
  if (!mcpServers) return undefined;

  const result: Record<string, McpServerConfig> = {};
  for (const [name, config] of Object.entries(mcpServers)) {
    result[name] = {
      type: "stdio" as const,
      command: config.command,
      args: config.args,
      env: config.env,
    };
  }
  return result;
}

/**
 * Run Claude using the Agent SDK
 */
export async function runClaudeWithSdk(
  promptPath: string,
  options: SdkRunOptions,
): Promise<void> {
  // Read prompt from file
  const prompt = await readFile(promptPath, "utf-8");

  // Build system prompt option
  type SystemPromptOption =
    | string
    | { type: "preset"; preset: "claude_code"; append?: string };
  let systemPrompt: SystemPromptOption | undefined;
  if (options.systemPrompt) {
    systemPrompt = options.systemPrompt;
  } else if (options.appendSystemPrompt) {
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: options.appendSystemPrompt,
    };
  }

  // Build SDK options
  const sdkOptions: SdkOptions = {
    model: options.model,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    disallowedTools: options.disallowedTools,
    systemPrompt,
    mcpServers: convertMcpServers(options.mcpServers),
    outputFormat: options.jsonSchema
      ? { type: "json_schema" as const, schema: options.jsonSchema }
      : undefined,
    fallbackModel: options.fallbackModel,
    pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
    // Use bypassPermissions since GitHub Actions runs in a trusted environment
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    env: options.env ? { ...process.env, ...options.env } : undefined,
  };

  // Log output mode
  if (!options.showFullOutput) {
    console.log(
      "Running Claude Code via SDK (full output hidden for security)...",
    );
    console.log(
      "Rerun in debug mode or enable `show_full_output: true` in your workflow file for full output.",
    );
  }

  console.log(`Running Claude with prompt from file: ${promptPath}`);

  // Collect messages for execution file
  const messages: SDKMessage[] = [];
  let resultMessage: SDKResultMessage | undefined;

  try {
    for await (const message of query({ prompt, options: sdkOptions })) {
      messages.push(message);

      // Output to console with sanitization
      const sanitized = sanitizeSdkOutput(message, options.showFullOutput);
      if (sanitized) {
        console.log(sanitized);
      }

      // Capture result message
      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
      }
    }
  } catch (error) {
    console.error("SDK execution error:", error);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }

  // Write execution file with compatibility transformations
  try {
    const transformed = transformForCompatibility(messages);
    await writeFile(EXECUTION_FILE, JSON.stringify(transformed, null, 2));
    console.log(`Log saved to ${EXECUTION_FILE}`);
    core.setOutput("execution_file", EXECUTION_FILE);
  } catch (error) {
    core.warning(`Failed to write execution file: ${error}`);
  }

  // Handle result
  if (!resultMessage) {
    core.setOutput("conclusion", "failure");
    core.error("No result message received from Claude");
    process.exit(1);
  }

  const isSuccess = resultMessage.subtype === "success";
  core.setOutput("conclusion", isSuccess ? "success" : "failure");

  // Handle structured output
  if (options.jsonSchema) {
    if (
      isSuccess &&
      "structured_output" in resultMessage &&
      resultMessage.structured_output
    ) {
      const structuredOutputJson = JSON.stringify(
        resultMessage.structured_output,
      );
      core.setOutput("structured_output", structuredOutputJson);
      core.info(
        `Set structured_output with ${Object.keys(resultMessage.structured_output as object).length} field(s)`,
      );
    } else {
      const errorMsg =
        `--json-schema was provided but Claude did not return structured_output.\n` +
        `Result subtype: ${resultMessage.subtype}`;
      core.setFailed(errorMsg);
      core.setOutput("conclusion", "failure");
      process.exit(1);
    }
  }

  if (!isSuccess) {
    if ("errors" in resultMessage && resultMessage.errors) {
      core.error(`Execution failed: ${resultMessage.errors.join(", ")}`);
    }
    process.exit(1);
  }
}
