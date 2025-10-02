import type { MergeRequestContext } from "../context/types";
import type { ReviewResult } from "../review/types";
import type { ClaudeRequest } from "./types";

export function buildReviewMessages(
  context: MergeRequestContext,
  prompt: { systemPrompt: string; userPrompt: string },
): ClaudeRequest {
  const changesSummary = context.changes
    .map((change) => `### ${change.new_path}
${change.diff}`)
    .join("\n\n");

  return {
    system: prompt.systemPrompt,
    messages: [
      {
        role: "user",
        content: `${prompt.userPrompt}

${changesSummary}`,
      },
    ],
  };
}

export function parseReviewResponse(content: string): ReviewResult {
  try {
    const parsed = JSON.parse(content) as ReviewResult;

    if (!Array.isArray(parsed.findings)) {
      throw new Error("findings must be an array");
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse review response: ${String(error)}`);
  }
}

