import type { MergeRequestContext } from "../context/types";
import type { ReviewResult } from "../review/types";

export function buildReviewMessages(
  context: MergeRequestContext,
  prompt: { systemPrompt: string; userPrompt: string },
) {
  const changesSummary = context.changes
    .map((change) => `### ${change.new_path}
${change.diff}`)
    .join("\n\n");

  return [
    {
      role: "system" as const,
      content: `${prompt.systemPrompt}`,
    },
    {
      role: "user" as const,
      content: `${prompt.userPrompt}

${changesSummary}`,
    },
  ];
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

