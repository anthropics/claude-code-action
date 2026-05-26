import * as core from "@actions/core";
import { readFile, access } from "fs/promises";
import { dirname, join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ParsedSdkOptions } from "./parse-sdk-options";
import { writeExecutionFile } from "./execution-file";

export type ClaudeRunResult = {
  executionFile?: string;
  sessionId?: string;
  conclusion: "success" | "failure";
  structuredOutput?: string;
  /**
   * Claude's final assistant text response, extracted from the last
   * `type: "assistant"` message in the stream. Useful for read-only
   * review workflows that capture the response in a sandboxed AI job
   * and post it from a separate, more-privileged job (defense-in-depth).
   * Undefined when Claude's last action was a tool call (no text).
   */
  finalMessage?: string;
};

/** Filename for the user request file, written by prompt generation */
const USER_REQUEST_FILENAME = "claude-user-request.txt";

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a prompt configuration for the SDK.
 * If a user request file exists alongside the prompt file, returns a multi-block
 * SDKUserMessage that enables slash command processing in the CLI.
 * Otherwise, returns the prompt as a simple string.
 */
async function createPromptConfig(
  promptPath: string,
  showFullOutput: boolean,
): Promise<string | AsyncIterable<SDKUserMessage>> {
  const promptContent = await readFile(promptPath, "utf-8");

  // Check for user request file in the same directory
  const userRequestPath = join(dirname(promptPath), USER_REQUEST_FILENAME);
  const hasUserRequest = await fileExists(userRequestPath);

  if (!hasUserRequest) {
    // No user request file - use simple string prompt
    return promptContent;
  }

  // User request file exists - create multi-block message
  const userRequest = await readFile(userRequestPath, "utf-8");
  if (showFullOutput) {
    console.log("Using multi-block message with user request:", userRequest);
  } else {
    console.log("Using multi-block message with user request (content hidden)");
  }

  // Create an async generator that yields a single multi-block message
  // The context/instructions go first, then the user's actual request last
  // This allows the CLI to detect and process slash commands in the user request
  async function* createMultiBlockMessage(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      session_id: "",
      message: {
        role: "user",
        content: [
          { type: "text", text: promptContent }, // Instructions + GitHub context
          { type: "text", text: userRequest }, // User's request (may be a slash command)
        ],
      },
      parent_tool_use_id: null,
    };
  }

  return createMultiBlockMessage();
}

/**
 * Sanitizes SDK output to match CLI sanitization behavior
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

  // Result messages - show sanitized summary
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
        permission_denials_count: resultMsg.permission_denials?.length ?? 0,
      },
      null,
      2,
    );
  }

  // Suppress other message types in non-full-output mode
  return null;
}

/**
 * Extract the final assistant text response from the message stream.
 *
 * Walks `messages` backward to find the last `type: "assistant"` message
 * and joins all of its `type: "text"` content blocks with newlines.
 *
 * Returns `undefined` when there are no assistant messages, or when the
 * last assistant message contains only tool_use blocks (no text). This is
 * intentional: when the agent's last action was a tool call rather than
 * speech, there is no "final message" to surface.
 *
 * Mirrors the text-extraction logic in src/entrypoints/format-turns.ts so
 * the output here matches what users see in the Step Summary.
 */
export function extractFinalAssistantMessage(
  messages: SDKMessage[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.type !== "assistant") continue;
    if (!("message" in msg) || !msg.message) continue;

    const content = (msg.message as { content?: unknown }).content;
    if (!Array.isArray(content)) return undefined;

    const textParts: string[] = [];
    for (const block of content) {
      if (
        block != null &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        textParts.push((block as { text: string }).text);
      }
    }

    return textParts.length > 0 ? textParts.join("\n") : undefined;
  }
  return undefined;
}

/**
 * Run Claude using the Agent SDK
 */
export async function runClaudeWithSdk(
  promptPath: string,
  { sdkOptions, showFullOutput, hasJsonSchema }: ParsedSdkOptions,
): Promise<ClaudeRunResult> {
  // Create prompt configuration - may be a string or multi-block message
  const prompt = await createPromptConfig(promptPath, showFullOutput);

  if (!showFullOutput) {
    console.log(
      "Running Claude Code via SDK (full output hidden for security)...",
    );
    console.log(
      "Rerun in debug mode or enable `show_full_output: true` in your workflow file for full output.",
    );
  }

  console.log(`Running Claude with prompt from file: ${promptPath}`);
  // Log SDK options without env (which could contain sensitive data)
  const { env, extraArgs, ...optionsToLog } = sdkOptions;
  console.log("SDK options:", JSON.stringify(optionsToLog, null, 2));

  const messages: SDKMessage[] = [];
  let resultMessage: SDKResultMessage | undefined;

  try {
    for await (const message of query({ prompt, options: sdkOptions })) {
      messages.push(message);

      const sanitized = sanitizeSdkOutput(message, showFullOutput);
      if (sanitized) {
        console.log(sanitized);
      }

      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
      }
    }
  } catch (error) {
    console.error("SDK execution error:", error);
    await writeExecutionFile(messages);
    throw new Error(`SDK execution error: ${error}`);
  }

  const result: ClaudeRunResult = {
    conclusion: "failure",
  };

  const executionFile = await writeExecutionFile(messages);
  if (executionFile) {
    result.executionFile = executionFile;
  }

  // Extract session_id from system.init message
  const initMessage = messages.find(
    (m) => m.type === "system" && "subtype" in m && m.subtype === "init",
  );
  if (initMessage && "session_id" in initMessage && initMessage.session_id) {
    result.sessionId = initMessage.session_id as string;
    core.info(`Set session_id: ${result.sessionId}`);
  }

  if (!resultMessage) {
    core.error("No result message received from Claude");
    throw new Error("No result message received from Claude");
  }

  const isSuccess = resultMessage.subtype === "success";
  result.conclusion = isSuccess ? "success" : "failure";

  // Handle structured output
  if (hasJsonSchema) {
    if (
      isSuccess &&
      "structured_output" in resultMessage &&
      resultMessage.structured_output
    ) {
      result.structuredOutput = JSON.stringify(resultMessage.structured_output);
      core.info(
        `Set structured_output with ${Object.keys(resultMessage.structured_output as object).length} field(s)`,
      );
    } else {
      core.setFailed(
        `--json-schema was provided but Claude did not return structured_output. Result subtype: ${resultMessage.subtype}`,
      );
      result.conclusion = "failure";
      throw new Error(
        `--json-schema was provided but Claude did not return structured_output. Result subtype: ${resultMessage.subtype}`,
      );
    }
  }

  if (!isSuccess) {
    if ("errors" in resultMessage && resultMessage.errors) {
      core.error(`Execution failed: ${resultMessage.errors.join(", ")}`);
    }
    throw new Error(
      `Claude execution failed: ${
        "errors" in resultMessage && resultMessage.errors
          ? resultMessage.errors.join(", ")
          : "unknown error"
      }`,
    );
  }

  // Extract Claude's final assistant text response for downstream steps.
  // See ClaudeRunResult.finalMessage for the rationale (defense-in-depth
  // review workflows that post from a separate, more-privileged job).
  const finalMessage = extractFinalAssistantMessage(messages);
  if (finalMessage) {
    result.finalMessage = finalMessage;
    core.info(`Set final_message (${finalMessage.length} chars)`);
  }

  return result;
}
