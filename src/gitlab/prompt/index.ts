import { buildSystemPrompt, buildUserPrompt } from "./templates";
import type { PromptInputs } from "./types";

export function createPrompt(inputs: PromptInputs) {
  const systemPrompt = buildSystemPrompt(inputs.context);
  const baseUserPrompt = buildUserPrompt(inputs.context);

  const extraInstructions = process.env.CLAUDE_PROMPT_INSTRUCTIONS?.trim();
  const userPrompt = extraInstructions
    ? `${baseUserPrompt}

Additional reviewer instructions:
${extraInstructions}`
    : baseUserPrompt;

  return {
    systemPrompt,
    userPrompt,
  };
}

