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
};

/** Filename for the user request file, written by prompt generation */
const USER_REQUEST_FILENAME = "claude-user-request.txt";

/**
 * Task types whose completion wakes the main thread for a follow-up turn.
 * A sub-agent launched with `run_in_background: true` is one of these: the
 * turn that launched it ends with a `result`, and when the agent finishes
 * the CLI delivers a `task_notification`, runs another turn and emits a
 * second `result`. Background shells (`Bash` with `run_in_background`) are
 * also reported through task frames but may never finish, so they are not
 * tracked here.
 */
const DEFERRING_TASK_TYPES = new Set(["local_agent", "local_workflow"]);

/** `task_updated` patch statuses after which a task is finished. */
const TERMINAL_TASK_STATUSES = new Set([
  "completed",
  "failed",
  "stopped",
  "killed",
]);

/**
 * Tracks sub-agent tasks the CLI has started but not yet reported finished,
 * from the `system` task lifecycle frames in the message stream.
 */
export class InflightAgentTasks {
  private readonly taskIds = new Set<string>();

  /** Feed every message from the stream; non-task frames are ignored. */
  observe(message: SDKMessage): void {
    if (message.type !== "system" || !("subtype" in message)) {
      return;
    }
    const frame = message as {
      subtype: string;
      task_id?: string;
      task_type?: string;
      patch?: { status?: string };
    };
    if (!frame.task_id) {
      return;
    }
    switch (frame.subtype) {
      case "task_started":
        if (frame.task_type && DEFERRING_TASK_TYPES.has(frame.task_type)) {
          this.taskIds.add(frame.task_id);
        }
        break;
      case "task_notification":
        this.taskIds.delete(frame.task_id);
        break;
      case "task_updated": {
        const status = frame.patch?.status;
        if (status && TERMINAL_TASK_STATUSES.has(status)) {
          this.taskIds.delete(frame.task_id);
        }
        break;
      }
    }
  }

  get size(): number {
    return this.taskIds.size;
  }
}

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

type ModelUsageSummary = Record<
  string,
  {
    contextWindow: number;
    maxOutputTokens: number;
  }
>;

/**
 * Keep resolved model limits visible without exposing token usage or cost details.
 */
function sanitizeModelUsage(
  modelUsage: SDKResultMessage["modelUsage"] | undefined,
): ModelUsageSummary | undefined {
  if (!modelUsage) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(modelUsage).map(([model, usage]) => [
      model,
      {
        contextWindow: usage.contextWindow,
        maxOutputTokens: usage.maxOutputTokens,
      },
    ]),
  );
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
        modelUsage: sanitizeModelUsage(resultMsg.modelUsage),
      },
      null,
      2,
    );
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
  const inflightAgents = new InflightAgentTasks();

  try {
    for await (const message of query({ prompt, options: sdkOptions })) {
      messages.push(message);
      inflightAgents.observe(message);

      const sanitized = sanitizeSdkOutput(message, showFullOutput);
      if (sanitized) {
        console.log(sanitized);
      }

      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
        // A result ends a turn, not necessarily the run. When Claude has
        // launched a sub-agent in the background, the turn ends while the
        // agent is still working; the CLI then delivers its completion as a
        // task_notification, runs a follow-up turn and emits another
        // result. Stopping at the first one would tear down the agents and
        // report success with their work (e.g. review comments) never
        // posted. Keep reading while such agents are in flight.
        if (inflightAgents.size > 0) {
          console.log(
            `Result received while ${inflightAgents.size} background agent task(s) are still running; waiting for the follow-up turn`,
          );
          continue;
        }
        // The SDK's query() iterator should close itself after the
        // result message, but in some workflow contexts (notably
        // pull_request-triggered runs) it stays open indefinitely and
        // the for-await hangs until the workflow's timeout-minutes
        // kills the job. This causes the action to "succeed" inside
        // Claude (verdict posted, $cost recorded) but be reported as
        // cancelled with no execution-output.json written. Break
        // explicitly: with no agent task in flight, no further turn is
        // owed after a result, so the break is safe.
        break;
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

  if (
    resultMessage.subtype === "success" &&
    !resultMessage.is_error &&
    sdkOptions.maxTurns !== undefined &&
    resultMessage.num_turns > sdkOptions.maxTurns
  ) {
    const message = `Claude reported a successful result after ${resultMessage.num_turns} turns, exceeding the configured maximum of ${sdkOptions.maxTurns}`;
    core.error(message);
    throw new Error(message);
  }

  // subtype "success" with is_error:true means the run errored without producing
  // a real result — treat it as failure so CI does not show a misleading green check.
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
    if (resultMessage.subtype === "success" && resultMessage.is_error) {
      core.error(
        "Claude result reported subtype success with is_error:true (run did not complete successfully)",
      );
    }
    if ("errors" in resultMessage && resultMessage.errors) {
      core.error(`Execution failed: ${resultMessage.errors.join(", ")}`);
    }
    throw new Error(
      `Claude execution failed: ${
        resultMessage.subtype === "success" && resultMessage.is_error
          ? "result is_error:true"
          : "errors" in resultMessage && resultMessage.errors
            ? resultMessage.errors.join(", ")
            : "unknown error"
      }`,
    );
  }

  return result;
}
