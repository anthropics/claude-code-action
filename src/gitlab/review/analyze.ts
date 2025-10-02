import { invokeClaude } from "../client/anthropic";
import { buildReviewMessages, parseReviewResponse } from "../client/tooling";
import { createPrompt } from "../prompt";
import type { MergeRequestContext } from "../context/types";
import type { ReviewResult } from "./types";
import { logger } from "../utils/logger";

export async function analyzeMergeRequest(
  context: MergeRequestContext,
): Promise<ReviewResult> {
  logger.info("Building review prompt");
  const prompt = createPrompt({ context });

  const claudeRequest = buildReviewMessages(context, prompt);

  logger.info("Calling Claude for review analysis");
  const response = await invokeClaude(claudeRequest);

  logger.debug("Claude raw response", response);

  const textContent = response.content
    .flatMap((part) => (part.type === "text" ? part.text : ""))
    .join("\n");

  return parseReviewResponse(textContent);
}

