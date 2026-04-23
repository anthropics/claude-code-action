import * as core from "@actions/core";
import { readFile, writeFile, access } from "fs/promises";
import { dirname, join } from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ParsedSdkOptions } from "./parse-sdk-options";

export type ClaudeRunResult = {
  executionFile?: string;
  sessionId?: string;
  conclusion: "success" | "failure";
  structuredOutput?: string;
};

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;

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
 * Extracts human-readable error text from a result message.
 * Checks both the `errors` array and the `result` string field.
 */
function getResultErrorText(resultMessage: SDKResultMessage): string | undefined {
  if ("errors" in resultMessage && Array.isArray(resultMessage.errors) && resultMessage.errors.length > 0) {
    return (resultMessage.errors as string[]).join(", ");
  }
  if ("result" in resultMessage && typeof (resultMessage as Record<string, unknown>).result === "string") {
    const resultText = (resultMessage as Record<string, unknown>).result as string;
    if (resultText) {
      return resultText;
    }
  }
  return undefined;
}

/**
 * Maps a raw error string to a user-friendly message with actionable guidance.
 */
function formatErrorMessage(errorText: string): string {
  const lower = errorText.toLowerCase();
  if (
    lower.includes("credit balance is too low") ||
    lower.includes("insufficient credits") ||
    lower.includes("no credits") ||
    lower.includes("out of credit")
  ) {
    return `API key has no credits or credit balance is too low. Add credits at https://console.anthropic.com/settings/billing`;
  }
  if (
    lower.includes("authentication") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("unauthorized")
  ) {
    return `Authentication failed. Verify your API key is valid at https://console.anthropic.com/settings/api-keys`;
  }
  return errorText;
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
    const summary: Record<string, unknown> = {
      type: "result",
      subtype: resultMsg.subtype,
      is_error: resultMsg.is_error,
      duration_ms: resultMsg.duration_ms,
      num_turns: resultMsg.num_turns,
      total_cost_usd: resultMsg.total_cost_usd,
      permission_denials_count: resultMsg.permission_denials?.length ?? 0,
    };
    // When is_error is true, include error details so failures are visible in logs
    if (resultMsg.is_error) {
      const errorText = getResultErrorText(resultMsg);
      if (errorText) {
        summary.error = errorText;
      }
    }
    return JSON.stringify(summary, null, 2);
  }

  // Suppress other message types in non-full-output mode
  return null;
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
    throw new Error(`SDK execution error: ${error}`);
  }

  const result: ClaudeRunResult = {
    conclusion: "failure",
  };

  // Write execution file
  try {
    await writeFile(EXECUTION_FILE, JSON.stringify(messages, null, 2));
    console.log(`Log saved to ${EXECUTION_FILE}`);
    result.executionFile = EXECUTION_FILE;
  } catch (error) {
    core.warning(`Failed to write execution file: ${error}`);
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

  // A result is only successful when subtype is "success" AND is_error is not true
  const isSuccess =
    resultMessage.subtype === "success" && !resultMessage.is_error;
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
    const rawError = getResultErrorText(resultMessage);
    const friendlyError = rawError
      ? formatErrorMessage(rawError)
      : `Claude execution failed with subtype: ${resultMessage.subtype}`;
    core.error(friendlyError);
    throw new Error(friendlyError);
  }

  return result;
}
