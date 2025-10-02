import { buildSystemPrompt, buildUserPrompt } from "./templates";
import type { PromptInputs } from "./types";

export function createPrompt(inputs: PromptInputs) {
  const systemPrompt = buildSystemPrompt(inputs.context);
  const userPrompt = buildUserPrompt(inputs.context);

  return {
    systemPrompt,
    userPrompt,
  };
}

