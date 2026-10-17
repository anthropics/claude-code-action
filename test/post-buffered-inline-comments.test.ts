import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  classifyComments,
  getAnthropicMessagesUrl,
  getClassificationModel,
} from "../src/entrypoints/post-buffered-inline-comments";

describe("post-buffered-inline-comments", () => {
  let originalAnthropicApiKey: string | undefined;
  let originalAnthropicBaseUrl: string | undefined;
  let originalAnthropicModel: string | undefined;
  let originalClaudeArgs: string | undefined;
  let fetchSpy: ReturnType<typeof spyOn> | undefined;

  beforeEach(() => {
    originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
    originalAnthropicModel = process.env.ANTHROPIC_MODEL;
    originalClaudeArgs = process.env.CLAUDE_ARGS;

    process.env.ANTHROPIC_API_KEY = "test-api-key";
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.CLAUDE_ARGS;

    fetchSpy = spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "[true]" }],
      }),
    } as Response);
  });

  afterEach(() => {
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }

    if (originalAnthropicBaseUrl === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl;
    }

    if (originalAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = originalAnthropicModel;
    }

    if (originalClaudeArgs === undefined) {
      delete process.env.CLAUDE_ARGS;
    } else {
      process.env.CLAUDE_ARGS = originalClaudeArgs;
    }

    fetchSpy?.mockRestore();
  });

  test("uses the default Anthropic messages endpoint", () => {
    expect(getAnthropicMessagesUrl()).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  test("trims trailing slashes from ANTHROPIC_BASE_URL", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com/anthropic/";

    await classifyComments(["This catches a bug in the changed branch."]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://proxy.example.com/anthropic/v1/messages",
      expect.any(Object),
    );
  });

  test("prefers ANTHROPIC_MODEL over claude args", () => {
    process.env.ANTHROPIC_MODEL = "MiniMax-M2.7";
    process.env.CLAUDE_ARGS = '--model "MiniMax-M3"';

    expect(getClassificationModel()).toBe("MiniMax-M2.7");
  });

  test("reads the model from claude args when ANTHROPIC_MODEL is unset", async () => {
    process.env.CLAUDE_ARGS = '# comment\n--model "MiniMax-M3" --max-turns 1';

    await classifyComments(["This catches a bug in the changed branch."]);

    const requestBody = JSON.parse(
      String((fetchSpy?.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string };
    expect(requestBody.model).toBe("MiniMax-M3");
  });
});
