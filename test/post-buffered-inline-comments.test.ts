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

  function capturedRequest() {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy!.mock.calls[0]!;
    return { url, init, body: JSON.parse(String(init?.body)) };
  }

  for (const baseUrl of [
    "https://api.minimax.io/anthropic",
    " https://api.minimaxi.com/anthropic/// ",
  ]) {
    test(`defaults to Flash at ${baseUrl}`, async () => {
      process.env.ANTHROPIC_BASE_URL = baseUrl;
      const comment =
        'Preserve this image link: ![example](https://example.com/a.png)\n"quoted"';
      fetchSpy!.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              { type: "thinking", thinking: "[false]" },
              { type: "text", text: "[true]" },
            ],
          }),
        ),
      );

      expect(await classifyComments([comment])).toEqual([true]);
      const { url, init, body } = capturedRequest();
      expect(url).toBe(`${baseUrl.trim().replace(/\/+$/, "")}/v1/messages`);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        "x-api-key": "test-api-key",
        "anthropic-version": "2023-06-01",
      });
      expect(body).toEqual({
        model: "MiniMax-M3.1-Flash",
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: expect.stringContaining(JSON.stringify(comment)),
          },
        ],
      });
    });
  }

  for (const model of [
    "MiniMax-M3",
    "MiniMax-M2.7",
    "saved-custom-model",
    "claude-haiku-4-5",
  ]) {
    test(`preserves explicit ${model} without Flash parameters`, async () => {
      process.env.ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
      process.env.ANTHROPIC_MODEL = model;
      process.env.CLAUDE_ARGS = "--model MiniMax-M3.1-Flash";
      expect(await classifyComments(["A real review"])).toEqual([true]);
      const { body } = capturedRequest();
      expect(body.model).toBe(model);
      expect(body.max_tokens).toBe(1024);
      expect(Object.keys(body).sort()).toEqual([
        "max_tokens",
        "messages",
        "model",
      ]);
    });
  }

  for (const baseUrl of [
    undefined,
    "https://proxy.example.com/anthropic",
    "https://api.minimax.io.example.com/anthropic",
    "https://api.minimax.io/custom",
    "http://api.minimax.io/anthropic",
  ]) {
    test(`preserves the existing default for ${baseUrl ?? "no base URL"}`, async () => {
      if (baseUrl) process.env.ANTHROPIC_BASE_URL = baseUrl;
      await classifyComments(["A real review"]);
      const { body } = capturedRequest();
      expect(body.model).toBe("claude-haiku-4-5");
      expect(body.max_tokens).toBe(1024);
      expect(Object.keys(body).sort()).toEqual([
        "max_tokens",
        "messages",
        "model",
      ]);
    });
  }

  test("honors explicit Flash through a custom compatible proxy", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com/anthropic/";
    process.env.CLAUDE_ARGS = '--model="MiniMax-M3.1-Flash"';
    await classifyComments(["A real review"]);
    const { url, body } = capturedRequest();
    expect(url).toBe("https://proxy.example.com/anthropic/v1/messages");
    expect(body.model).toBe("MiniMax-M3.1-Flash");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("service_tier");
  });

  test("skips transport without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await classifyComments(["A real review"])).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("preserves the fallback when Flash returns only thinking", async () => {
    process.env.ANTHROPIC_BASE_URL = "https://api.minimax.io/anthropic";
    fetchSpy!.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: "thinking", thinking: "[true]" }],
          stop_reason: "max_tokens",
        }),
      ),
    );
    expect(await classifyComments(["A real review"])).toBeNull();
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
