#!/usr/bin/env bun

/**
 * Mock Anthropic Auth Server
 * Issues temporary signing keys for device credentials
 * Simulates Anthropic's signing key infrastructure
 */

import { z } from "zod";

// Device registry mapping (matches provided credentials)
const DEVICE_REGISTRY: Record<string, string> = {
  "faa7706b-6375-49ae-b55e-73ef5ee7c1e8":
    "pk1:ec734b9475d268919bc9e738615c84e4799ca541c701b6ffe4c4bf730ddc30ba:d06f7a85-43de-4d25-9ebd-b9e1e501fd81",
  "20e640ed-7cf0-411c-8711-418b861f6f08":
    "pk1:50d9f5b00094228c95eb8f8066e83d3664d6bf9664374329a8767a3d2a2eecd0:13418496-1224-4308-aae6-7467c5c1d316",
};

// Session token cache (for verification)
interface CachedSession {
  account_uuid: string;
  device_id: string;
  expires_at: number;
}

const sessionCache: Map<string, CachedSession> = new Map();

// Signing key request schema
const SigningKeyRequestSchema = z.object({
  intent: z.string(),
  device_id: z.string().uuid(),
  account_id: z.string().uuid().optional(),
  peer_token: z.string().optional(),
});

type SigningKeyRequest = z.infer<typeof SigningKeyRequestSchema>;

interface SigningKeyResponse {
  signing_key: string;
  expires_at: string;
  device_id: string;
  intent: string;
  account_id?: string;
}

function generateSigningKey(deviceId: string): string {
  // Return the real GitHub token from environment
  // In production, this would be encrypted and securely managed
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required but not set. " +
        "Please set your GitHub PAT: export GITHUB_TOKEN='ghp_...'",
    );
  }
  return githubToken;
}

function verifyDeviceCredentials(
  deviceId: string,
  accountId?: string,
): boolean {
  // Check if device is in registry
  for (const [uuid, pkString] of Object.entries(DEVICE_REGISTRY)) {
    if (pkString.includes(deviceId)) {
      if (accountId && accountId !== uuid) {
        return false;
      }
      return true;
    }
  }
  return false;
}

const server = Bun.serve({
  port: parseInt(process.env.PORT || "8887"),
  hostname: process.env.HOST || "0.0.0.0",

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === "/health" && req.method === "GET") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Signing key endpoint
    if (path === "/api/auth/signing-key" && req.method === "POST") {
      try {
        const body = await req.json();
        const request = SigningKeyRequestSchema.parse(body);

        console.log(
          `[✓] Signing key request: device=${request.device_id.substring(0, 8)}..., intent=${request.intent}`,
        );

        // Verify device credentials
        if (!verifyDeviceCredentials(request.device_id, request.account_id)) {
          console.log(`[✗] Invalid device credentials`);
          return new Response(
            JSON.stringify({
              error: {
                type: "invalid_device_error",
                message: "Device credentials not recognized",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        // Generate signing key
        const signingKey = generateSigningKey(request.device_id);
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour

        const response: SigningKeyResponse = {
          signing_key: signingKey,
          expires_at: expiresAt.toISOString(),
          device_id: request.device_id,
          intent: request.intent,
          account_id: request.account_id,
        };

        console.log(
          `[✓] Issued signing key: ${signingKey.substring(0, 20)}...`,
        );
        console.log(`    Valid until: ${expiresAt.toISOString()}`);
        console.log(`    Intent: ${request.intent}`);

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(`[✗] Request validation failed:`, error);
        return new Response(
          JSON.stringify({
            error: {
              type: "validation_error",
              message:
                error instanceof Error ? error.message : "Invalid request",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 404
    return new Response(
      JSON.stringify({
        error: {
          type: "not_found_error",
          message: "Endpoint not found",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  },
});

const port = parseInt(process.env.PORT || "8887");
const host = process.env.HOST || "0.0.0.0";

console.log(`
╔════════════════════════════════════════════════════════════╗
║     Mock Anthropic Auth Server - Signing Key Service      ║
╚════════════════════════════════════════════════════════════╝

✓ Server running on http://${host}:${port}

Available endpoints:
  GET  /health                    - Health check
  POST /api/auth/signing-key      - Issue temporary signing keys

Device registry:
  ✓ faa7706b-6375-49ae-b55e-73ef5ee7c1e8 (primary)
  ✓ 20e640ed-7cf0-411c-8711-418b861f6f08 (secondary)

Example request:
  curl -X POST http://localhost:${port}/api/auth/signing-key \\
    -H "Content-Type: application/json" \\
    -d '{
      "intent": "github-follow",
      "device_id": "d06f7a85-43de-4d25-9ebd-b9e1e501fd81",
      "account_id": "faa7706b-6375-49ae-b55e-73ef5ee7c1e8"
    }'

`);
