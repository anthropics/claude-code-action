#!/usr/bin/env bun

/**
 * HTTP proxy server that translates between Anthropic API format and Bedrock API format.
 * This allows using HTTP requests with custom headers to Bedrock endpoints without AWS SDK.
 *
 * Flow:
 * 1. Claude SDK -> Anthropic format -> Proxy (localhost:PROXY_PORT)
 * 2. Proxy translates Anthropic format to Bedrock format
 * 3. Proxy -> Bedrock format + custom headers -> APIM gateway
 * 4. APIM -> AWS Bedrock
 * 5. Response flows back with reverse translation
 */

import { serve } from "bun";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; [key: string]: any }>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  stream?: boolean;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: any;
}

interface BedrockRequest {
  anthropic_version: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: any;
}

/**
 * Translate Anthropic API request to Bedrock API request
 */
function translateAnthropicToBedrock(
  anthropicReq: AnthropicRequest,
): BedrockRequest {
  const { model, stream, ...bedrockFields } = anthropicReq;

  return {
    anthropic_version: "bedrock-2023-05-31",
    ...bedrockFields,
  };
}

/**
 * Translate Bedrock API response to Anthropic API response
 * Bedrock and Anthropic responses are mostly compatible, but this ensures proper format
 */
function translateBedrockToAnthropic(bedrockResp: any): any {
  // Bedrock responses are already in Anthropic format for the most part
  // Just ensure proper structure
  return bedrockResp;
}

/**
 * Extract model ID from Anthropic model name
 * Examples:
 * - "claude-3-sonnet-20240229" -> "anthropic.claude-3-sonnet-20240229-v1:0"
 * - "anthropic.claude-sonnet-4-20250514-v1:0" -> "anthropic.claude-sonnet-4-20250514-v1:0"
 */
function getBedrockModelId(anthropicModel: string): string {
  // If already in Bedrock format (starts with "anthropic."), return as-is
  if (anthropicModel.startsWith("anthropic.")) {
    return anthropicModel;
  }

  // Otherwise, construct Bedrock model ID
  // This is a simplified mapping - may need to be extended
  return `anthropic.${anthropicModel}-v1:0`;
}

/**
 * Start the Bedrock HTTP proxy server
 */
export async function startBedrockProxy(
  targetBaseUrl: string,
  customHeaders: Record<string, string>,
  port: number = 8765,
): Promise<{ port: number; close: () => void }> {
  console.log(`[Bedrock Proxy] Starting proxy server on port ${port}`);
  console.log(`[Bedrock Proxy] Target: ${targetBaseUrl}`);
  console.log(
    `[Bedrock Proxy] Custom headers: ${Object.keys(customHeaders).join(", ")}`,
  );

  const server = serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // Only handle /v1/messages endpoint (Anthropic API format)
      if (url.pathname !== "/v1/messages") {
        return new Response("Not Found", { status: 404 });
      }

      try {
        // Parse Anthropic request
        const anthropicReq = (await req.json()) as AnthropicRequest;

        // Extract model ID
        const bedrockModelId = getBedrockModelId(anthropicReq.model);

        // Translate to Bedrock format
        const bedrockReq = translateAnthropicToBedrock(anthropicReq);

        // Construct Bedrock URL
        const bedrockUrl = `${targetBaseUrl}/bedrock/model/${bedrockModelId}/invoke`;

        console.log(
          `[Bedrock Proxy] Translating request for model: ${bedrockModelId}`,
        );
        console.log(`[Bedrock Proxy] Bedrock URL: ${bedrockUrl}`);

        // Forward to APIM with custom headers
        const headers = {
          "Content-Type": "application/json",
          ...customHeaders,
        };

        const response = await fetch(bedrockUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(bedrockReq),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[Bedrock Proxy] Error from APIM: ${response.status} ${errorText}`,
          );
          return new Response(errorText, {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Translate response back to Anthropic format
        const bedrockResp = await response.json();
        const anthropicResp = translateBedrockToAnthropic(bedrockResp);

        console.log(`[Bedrock Proxy] Successfully proxied request`);

        return new Response(JSON.stringify(anthropicResp), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        console.error(`[Bedrock Proxy] Error:`, error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  console.log(`[Bedrock Proxy] Server started on http://localhost:${port}`);

  return {
    port,
    close: () => {
      console.log(`[Bedrock Proxy] Stopping server`);
      server.stop();
    },
  };
}

/**
 * Parse custom headers from JSON string or object
 */
export function parseCustomHeaders(
  headersInput?: string,
): Record<string, string> {
  if (!headersInput) {
    return {};
  }

  try {
    console.log("[Bedrock Proxy] Raw headers input:", headersInput);
    console.log("[Bedrock Proxy] Input type:", typeof headersInput);

    const parsed =
      typeof headersInput === "string"
        ? JSON.parse(headersInput)
        : headersInput;

    console.log("[Bedrock Proxy] Parsed headers:", JSON.stringify(parsed, null, 2));
    console.log("[Bedrock Proxy] Header keys:", Object.keys(parsed));

    return parsed as Record<string, string>;
  } catch (error) {
    console.error("[Bedrock Proxy] Failed to parse custom headers:", error);
    return {};
  }
}
