import type { MergeRequestContext } from "../context/types";

export type PromptInputs = {
  context: MergeRequestContext;
  instructions?: string;
};

export type PromptOptions = {
  maxTokens: number;
  temperature: number;
  model: string;
};

