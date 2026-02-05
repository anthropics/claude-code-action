#!/usr/bin/env bun

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import type { OpenAICompatibleConfig } from "../src/run-openai-compatible";

// Mock fetch globally for testing
const originalFetch = globalThis.fetch;

describe("run-openai-compatible", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    process.env.RUNNER_TEMP = "/tmp/test-runner";
    // Ensure the temp directory exists for execution file writing
    const { mkdirSync } = await import("fs");
    mkdirSync("/tmp/test-runner", { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  describe("buildCompletionsUrl", () => {
    // We test URL building indirectly through the module
    // since it's not exported. We verify behavior via the full API call.

    test("should handle base URL ending with version path", async () => {
      let capturedUrl = "";

      globalThis.fetch = mock(async (input: string | URL | Request) => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return new Response(
          JSON.stringify({
            id: "test-id",
            object: "chat.completion",
            created: Date.now(),
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "test response" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      // Create a temp prompt file
      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Test prompt content");

      const config: OpenAICompatibleConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.z.ai/api/paas/v4",
        model: "glm-4.7",
        maxTokens: 1024,
        showFullOutput: false,
      };

      await runOpenAICompatible(promptPath, config);

      expect(capturedUrl).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    });

    test("should handle base URL already containing /chat/completions", async () => {
      let capturedUrl = "";

      globalThis.fetch = mock(async (input: string | URL | Request) => {
        capturedUrl = typeof input === "string" ? input : input.toString();
        return new Response(
          JSON.stringify({
            id: "test-id",
            object: "chat.completion",
            created: Date.now(),
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "test" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Test prompt");

      const config: OpenAICompatibleConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.example.com/v1/chat/completions",
        model: "test-model",
        maxTokens: 1024,
        showFullOutput: false,
      };

      await runOpenAICompatible(promptPath, config);

      expect(capturedUrl).toBe("https://api.example.com/v1/chat/completions");
    });
  });

  describe("API call handling", () => {
    test("should send correct request headers and body", async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: Record<string, unknown> = {};

      globalThis.fetch = mock(
        async (_input: string | URL | Request, init?: RequestInit) => {
          if (init?.headers) {
            const headers = init.headers as Record<string, string>;
            capturedHeaders = { ...headers };
          }
          if (init?.body) {
            capturedBody = JSON.parse(init.body as string) as Record<
              string,
              unknown
            >;
          }
          return new Response(
            JSON.stringify({
              id: "test-id",
              object: "chat.completion",
              created: Date.now(),
              model: "glm-4.7",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "Response from the model",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
              },
            }),
            { status: 200 },
          );
        },
      ) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Review this code please");

      const config: OpenAICompatibleConfig = {
        apiKey: "sk-test-api-key-123",
        baseUrl: "https://api.z.ai/api/paas/v4",
        model: "glm-4.7",
        maxTokens: 2048,
        showFullOutput: false,
      };

      await runOpenAICompatible(promptPath, config);

      expect(capturedHeaders["Authorization"]).toBe(
        "Bearer sk-test-api-key-123",
      );
      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(capturedBody["model"]).toBe("glm-4.7");
      expect(capturedBody["max_tokens"]).toBe(2048);
      expect(capturedBody["messages"]).toBeDefined();
      expect((capturedBody["messages"] as Array<unknown>).length).toBe(2);
    });

    test("should return success result on successful completion", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            id: "chatcmpl-abc123",
            object: "chat.completion",
            created: Date.now(),
            model: "glm-4.7",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Here is the review." },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Test prompt");

      const config: OpenAICompatibleConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        maxTokens: 1024,
        showFullOutput: false,
      };

      const result = await runOpenAICompatible(promptPath, config);

      expect(result.conclusion).toBe("success");
      expect(result.executionFile).toBeDefined();
    });

    test("should throw on API error after retries", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Internal Server Error", { status: 500 });
      }) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Test prompt");

      const config: OpenAICompatibleConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        maxTokens: 1024,
        showFullOutput: false,
      };

      await expect(runOpenAICompatible(promptPath, config)).rejects.toThrow(
        "OpenAI-compatible API failed after 3 attempts",
      );
    }, 15000);

    test("should throw on non-stop finish reason", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            id: "test-id",
            object: "chat.completion",
            created: Date.now(),
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "partial..." },
                finish_reason: "length",
              },
            ],
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;

      const { runOpenAICompatible } = await import(
        "../src/run-openai-compatible"
      );

      const promptPath = "/tmp/test-prompt.txt";
      await Bun.write(promptPath, "Test prompt");

      const config: OpenAICompatibleConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        maxTokens: 1024,
        showFullOutput: false,
      };

      await expect(runOpenAICompatible(promptPath, config)).rejects.toThrow(
        "non-success finish reason: length",
      );
    });
  });
});
