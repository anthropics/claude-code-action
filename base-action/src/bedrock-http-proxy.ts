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
  // Bedrock responses are already in Anthropic format
  // The model name should remain as-is (e.g., "claude-sonnet-4-20250514")
  // Do NOT add "anthropic." prefix - that's only for Bedrock model IDs in requests

  return bedrockResp;
}

/**
 * Extract model ID from Anthropic model name and convert to cross-region inference profile
 * AWS Bedrock requires cross-region inference profiles for on-demand throughput
 * Examples:
 * - "claude-3-sonnet-20240229" -> "us.anthropic.claude-3-sonnet-20240229-v1:0"
 * - "anthropic.claude-sonnet-4-20250514-v1:0" -> "us.anthropic.claude-sonnet-4-20250514-v1:0"
 */
function getBedrockModelId(anthropicModel: string): string {
  // If already in cross-region format (starts with "us."), return as-is
  if (anthropicModel.startsWith("us.")) {
    return anthropicModel;
  }

  // If in standard Bedrock format (starts with "anthropic."), convert to cross-region
  if (anthropicModel.startsWith("anthropic.")) {
    return `us.${anthropicModel}`;
  }

  // Otherwise, construct cross-region inference profile ID
  return `us.anthropic.${anthropicModel}-v1:0`;
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

      console.log(
        `[Bedrock Proxy] Incoming ${req.method} ${url.pathname} from ${req.headers.get("user-agent")?.substring(0, 50)}`,
      );

      // Handle token counting endpoint (SDK uses this for pre-flight checks)
      if (url.pathname === "/v1/messages/count_tokens") {
        console.log(`[Bedrock Proxy] Handling count_tokens request`);
        const body = await req.json();
        // Return a mock token count response
        return new Response(
          JSON.stringify({
            input_tokens: body.messages?.length * 100 || 1000, // Rough estimate
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Handle event logging endpoint (SDK uses this for telemetry)
      if (url.pathname === "/api/event_logging/batch") {
        console.log(`[Bedrock Proxy] Ignoring event_logging request`);
        // Return success to prevent SDK errors
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Only handle /v1/messages endpoint (Anthropic API format)
      if (url.pathname !== "/v1/messages") {
        console.log(
          `[Bedrock Proxy] Rejecting request to ${url.pathname} with 404`,
        );
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
        console.log(
          `[Bedrock Proxy] Bedrock response:`,
          JSON.stringify(bedrockResp).substring(0, 500),
        );

        const anthropicResp = translateBedrockToAnthropic(bedrockResp);

        console.log(`[Bedrock Proxy] Successfully proxied request`);

        // Return response with proper headers
        return new Response(JSON.stringify(anthropicResp), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "request-id": bedrockResp.id || "unknown",
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
    const parsed =
      typeof headersInput === "string"
        ? JSON.parse(headersInput)
        : headersInput;

    return parsed as Record<string, string>;
  } catch (error) {
    console.error("[Bedrock Proxy] Failed to parse custom headers:", error);
    return {};
  }
}
