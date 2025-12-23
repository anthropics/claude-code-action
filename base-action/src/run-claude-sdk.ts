import * as core from "@actions/core";
import { readFile, writeFile } from "fs/promises";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ParsedSdkOptions } from "./parse-sdk-options";

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;

/**
 * Result of running Claude via SDK
 */
export type RunClaudeResult = {
  success: boolean;
  executionFile: string;
  conclusion: "success" | "failure";
  structuredOutput?: string;
  sessionId?: string;
  error?: string;
};

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
        permission_denials: resultMsg.permission_denials,
      },
      null,
      2,
    );
  }

  // Suppress other message types in non-full-output mode
  return null;
}

/**
 * Input for runClaudeWithSdk - either a prompt string or file path
 */
export type PromptInput =
  | { type: "string"; prompt: string }
  | { type: "file"; promptPath: string };

/**
 * Run Claude using the Agent SDK.
 *
 * @param promptInput - Either a direct prompt string or path to prompt file
 * @param parsedOptions - Parsed SDK options
 * @param options - Additional options
 * @param options.setOutputs - Whether to set GitHub Action outputs (default: true for backwards compat)
 * @returns Result of the execution
 */
export async function runClaudeWithSdk(
  promptInput: PromptInput,
  { sdkOptions, showFullOutput, hasJsonSchema }: ParsedSdkOptions,
  { setOutputs = true }: { setOutputs?: boolean } = {},
): Promise<RunClaudeResult> {
  // Get prompt from string or file
  const prompt =
    promptInput.type === "string"
      ? promptInput.prompt
      : await readFile(promptInput.promptPath, "utf-8");

  if (!showFullOutput) {
    console.log(
      "Running Claude Code via SDK (full output hidden for security)...",
    );
    console.log(
      "Rerun in debug mode or enable `show_full_output: true` in your workflow file for full output.",
    );
  }

  if (promptInput.type === "file") {
    console.log(
      `Running Claude with prompt from file: ${promptInput.promptPath}`,
    );
  } else {
    console.log(`Running Claude with prompt string (${prompt.length} chars)`);
  }
  // Log SDK options without env (which could contain sensitive data)
  const { env, ...optionsToLog } = sdkOptions;
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
    if (setOutputs) {
      core.setOutput("conclusion", "failure");
    }
    return {
      success: false,
      executionFile: EXECUTION_FILE,
      conclusion: "failure",
      error: String(error),
    };
  }

  // Write execution file
  try {
    await writeFile(EXECUTION_FILE, JSON.stringify(messages, null, 2));
    console.log(`Log saved to ${EXECUTION_FILE}`);
    if (setOutputs) {
      core.setOutput("execution_file", EXECUTION_FILE);
    }
  } catch (error) {
    core.warning(`Failed to write execution file: ${error}`);
  }

  if (!resultMessage) {
    if (setOutputs) {
      core.setOutput("conclusion", "failure");
    }
    core.error("No result message received from Claude");
    return {
      success: false,
      executionFile: EXECUTION_FILE,
      conclusion: "failure",
      error: "No result message received from Claude",
    };
  }

  const isSuccess = resultMessage.subtype === "success";
  if (setOutputs) {
    core.setOutput("conclusion", isSuccess ? "success" : "failure");
  }

  let structuredOutput: string | undefined;

  // Handle structured output
  if (hasJsonSchema) {
    if (
      isSuccess &&
      "structured_output" in resultMessage &&
      resultMessage.structured_output
    ) {
      structuredOutput = JSON.stringify(resultMessage.structured_output);
      if (setOutputs) {
        core.setOutput("structured_output", structuredOutput);
      }
      core.info(
        `Set structured_output with ${Object.keys(resultMessage.structured_output as object).length} field(s)`,
      );
    } else {
      const errorMsg = `--json-schema was provided but Claude did not return structured_output. Result subtype: ${resultMessage.subtype}`;
      if (setOutputs) {
        core.setFailed(errorMsg);
        core.setOutput("conclusion", "failure");
      }
      return {
        success: false,
        executionFile: EXECUTION_FILE,
        conclusion: "failure",
        error: errorMsg,
      };
    }
  }

  if (!isSuccess) {
    const errors =
      "errors" in resultMessage && resultMessage.errors
        ? resultMessage.errors.join(", ")
        : "Unknown error";
    core.error(`Execution failed: ${errors}`);
    return {
      success: false,
      executionFile: EXECUTION_FILE,
      conclusion: "failure",
      error: errors,
    };
  }

  return {
    success: true,
    executionFile: EXECUTION_FILE,
    conclusion: "success",
    structuredOutput,
  };
}

/**
 * Wrapper for backwards compatibility - reads prompt from file path and exits on failure
 */
export async function runClaudeWithSdkFromFile(
  promptPath: string,
  parsedOptions: ParsedSdkOptions,
): Promise<void> {
  const result = await runClaudeWithSdk(
    { type: "file", promptPath },
    parsedOptions,
    { setOutputs: true },
  );

  if (!result.success) {
    process.exit(1);
  }
}
