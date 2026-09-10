import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  classifyComments,
  getAnthropicMessagesUrl,
} from "../src/entrypoints/post-buffered-inline-comments";

describe("post-buffered-inline-comments classification", () => {
  let originalAnthropicApiKey: string | undefined;
  let originalAnthropicBaseUrl: string | undefined;
  let fetchSpy: any;

  beforeEach(() => {
    originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_API_KEY = "test-api-key";
    delete process.env.ANTHROPIC_BASE_URL;

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

    fetchSpy.mockRestore();
  });

  test("uses the default Anthropic messages endpoint", () => {
    expect(getAnthropicMessagesUrl()).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  test("appends the messages path to ANTHROPIC_BASE_URL", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com/anthropic";

    await classifyComments(["This catches a bug in the changed branch."]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://proxy.example.com/anthropic/v1/messages",
      expect.any(Object),
    );
  });

  test("handles a trailing slash in ANTHROPIC_BASE_URL", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com/anthropic/";

    await classifyComments(["This catches a bug in the changed branch."]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://proxy.example.com/anthropic/v1/messages",
      expect.any(Object),
    );
  });
});
