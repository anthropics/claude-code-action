import { buildSystemPrompt, buildUserPrompt } from "./templates";
import type { PromptInputs } from "./types";

export function createPrompt(inputs: PromptInputs) {
  const systemPrompt = buildSystemPrompt(inputs.context);
  const extraInstructions = process.env.CLAUDE_PROMPT_INSTRUCTIONS?.trim();
  
  // Pass custom instructions to buildUserPrompt so they appear before JSON schema
  const userPrompt = buildUserPrompt(inputs.context, extraInstructions);

  return {
    systemPrompt,
    userPrompt,
  };
}

