import { describe, expect, test } from "bun:test";
import { isPromptTooLongResult } from "../base-action/src/run-claude-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

const promptTooLongResult = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 0,
  duration_api_ms: 0,
  result: "Prompt is too long",
} as unknown as SDKResultMessage;

describe("isPromptTooLongResult", () => {
  test("recognizes a prompt-size rejection reported as a zero-turn success", () => {
    expect(isPromptTooLongResult(promptTooLongResult)).toBe(true);
  });

  test("does not classify a model response as a prompt-size rejection", () => {
    expect(
      isPromptTooLongResult({
        ...promptTooLongResult,
        num_turns: 1,
        duration_api_ms: 20,
        result: "Prompt is too long for this example.",
      } as unknown as SDKResultMessage),
    ).toBe(false);
  });

  test("does not reclassify SDK errors", () => {
    expect(
      isPromptTooLongResult({
        ...promptTooLongResult,
        is_error: true,
      } as unknown as SDKResultMessage),
    ).toBe(false);
  });
});
