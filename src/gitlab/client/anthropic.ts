import { Anthropic } from "@anthropic-ai/sdk";
import type { ClaudeMessage } from "./types";
import { loadEnv } from "../utils/env";

export type ClaudeResponse = {
  highLevelSummary: string;
  findings: ClaudeFinding[];
  testingGuidance?: string;
  risks?: string[];
};

export type ClaudeFinding = {
  title: string;
  summary: string;
  severity: "suggestion" | "issue" | "critical";
  path: string;
  line?: number;
  suggestion?: string;
};

export async function invokeClaude(messages: ClaudeMessage[]) {
  const env = loadEnv();
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const response = await client.messages.create({
    model: env.CLAUDE_MODEL,
    max_output_tokens: Number(env.CLAUDE_MAX_TOKENS),
    temperature: Number(env.CLAUDE_TEMPERATURE),
    messages: messages.map(({ role, content }) => ({
      role,
      content,
    })),
  });

  return response;
}

