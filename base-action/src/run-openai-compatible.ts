import * as core from "@actions/core";
import { readFile, writeFile } from "fs/promises";
import type { ClaudeRunResult } from "./run-claude-sdk";

/**
 * Configuration for OpenAI-compatible API providers.
 */
export type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  showFullOutput: boolean;
};

/**
 * Message format for OpenAI chat completions API.
 */
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Response shape from OpenAI chat completions endpoint.
 */
type ChatCompletionResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/claude-execution-output.json`;

/**
 * Build the chat completions endpoint URL from a base URL.
 * Handles cases where the base URL already includes /chat/completions or ends with /v1 etc.
 */
function buildCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");

  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  // If it ends with a version path like /v1, /v4, append /chat/completions
  if (/\/v\d+$/.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  // Otherwise append the full path
  return `${trimmed}/chat/completions`;
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 */
async function callChatCompletions(
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
): Promise<ChatCompletionResponse> {
  const url = buildCompletionsUrl(config.baseUrl);

  console.log(`Calling OpenAI-compatible API: ${url}`);
  console.log(`Model: ${config.model}`);
  console.log(`Max tokens: ${config.maxTokens}`);

  const body = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: 0.7,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI-compatible API request failed (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data;
}

/**
 * Run a prompt through an OpenAI-compatible API provider.
 *
 * This is the alternative execution path for non-Claude models.
 * It reads the prompt file, sends it as a chat completion request,
 * and returns a result compatible with the existing action infrastructure.
 */
export async function runOpenAICompatible(
  promptPath: string,
  config: OpenAICompatibleConfig,
): Promise<ClaudeRunResult> {
  const promptContent = await readFile(promptPath, "utf-8");

  if (!config.showFullOutput) {
    console.log(
      "Running via OpenAI-compatible API (full output hidden for security)...",
    );
    console.log(
      "Enable `show_full_output: true` in your workflow file for full output.",
    );
  }

  console.log(`Running with prompt from file: ${promptPath}`);
  console.log(
    `Provider: ${config.baseUrl} | Model: ${config.model} | Max tokens: ${config.maxTokens}`,
  );

  const systemMessage: ChatMessage = {
    role: "system",
    content:
      "You are a helpful coding assistant integrated into a GitHub Action. " +
      "You help with code reviews, answering questions about code, and providing implementation guidance. " +
      "When analyzing code, be thorough and reference specific files and line numbers. " +
      "Format your responses in GitHub-flavored markdown.",
  };

  const userMessage: ChatMessage = {
    role: "user",
    content: promptContent,
  };

  const messages: ChatMessage[] = [systemMessage, userMessage];

  // Execute the API call with retry logic
  let lastError: Error | undefined;
  let completionResponse: ChatCompletionResponse | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      completionResponse = await callChatCompletions(config, messages);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`API call attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < 3) {
        const delay = attempt * 2000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!completionResponse) {
    throw new Error(
      `OpenAI-compatible API failed after 3 attempts: ${lastError?.message}`,
    );
  }

  const choice = completionResponse.choices[0];
  const assistantContent = choice?.message?.content || "";
  const finishReason = choice?.finish_reason || "unknown";

  if (config.showFullOutput) {
    console.log("=== API Response ===");
    console.log(JSON.stringify(completionResponse, null, 2));
    console.log("====================");
  } else {
    console.log(`Response received. Finish reason: ${finishReason}`);
    if (completionResponse.usage) {
      console.log(
        `Tokens used - prompt: ${completionResponse.usage.prompt_tokens}, completion: ${completionResponse.usage.completion_tokens}, total: ${completionResponse.usage.total_tokens}`,
      );
    }
  }

  // Build execution output in a format compatible with the existing infrastructure
  const executionMessages = [
    {
      type: "system",
      subtype: "init",
      model: completionResponse.model || config.model,
      provider: "openai-compatible",
      base_url: config.baseUrl,
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: assistantContent,
      },
    },
    {
      type: "result",
      subtype: finishReason === "stop" ? "success" : "error",
      is_error: finishReason !== "stop",
      model: completionResponse.model || config.model,
      provider: "openai-compatible",
      usage: completionResponse.usage,
      duration_ms: 0,
      num_turns: 1,
    },
  ];

  const result: ClaudeRunResult = {
    conclusion: finishReason === "stop" ? "success" : "failure",
  };

  // Write execution file
  try {
    await writeFile(EXECUTION_FILE, JSON.stringify(executionMessages, null, 2));
    console.log(`Log saved to ${EXECUTION_FILE}`);
    result.executionFile = EXECUTION_FILE;
  } catch (error) {
    core.warning(`Failed to write execution file: ${error}`);
  }

  if (finishReason !== "stop") {
    throw new Error(
      `OpenAI-compatible model returned non-success finish reason: ${finishReason}`,
    );
  }

  return result;
}
