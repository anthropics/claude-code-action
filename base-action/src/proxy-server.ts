/**
 * HTTP Proxy Server for Claude API via Cloudflare AI Gateway
 *
 * Intercepts Claude CLI requests and forwards them directly to Cloudflare AI Gateway,
 * which routes to AWS Bedrock or Anthropic API based on availability.
 *
 * This enables:
 * - Direct routing through AI Gateway (no intermediate worker hop)
 * - Centralized monitoring and observability via Cloudflare AI Gateway
 * - Intelligent failover: Bedrock first (uses $100k credits), then Anthropic
 * - Zero-delay failover on 429 rate limits
 */

const PROXY_PORT = 18765; // Local proxy port
const AI_GATEWAY_ACCOUNT = 'b6641681fe423910342b9ffa1364c76d';
const AI_GATEWAY_ID = 'claude-gateway';
const AI_GATEWAY_BASE = `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT}/${AI_GATEWAY_ID}`;

interface ProxyStats {
  requests: number;
  successes: number;
  failures: number;
  lastError?: string;
}

const stats: ProxyStats = {
  requests: 0,
  successes: 0,
  failures: 0,
};

/**
 * Determine proxy mode based on available credentials
 * - "bedrock-anthropic": Both credentials available (full failover)
 * - "anthropic-only": Only Anthropic key available
 * - "bedrock-only": Only Bedrock token available
 * - "direct": No proxy, use direct Anthropic API
 */
function getProxyMode(): 'bedrock-anthropic' | 'anthropic-only' | 'bedrock-only' | 'direct' {
  const hasBedrockToken = !!(process.env.AWS_BEARER_TOKEN_BEDROCK?.trim());
  const hasAnthropicKey = !!(process.env.ANTHROPIC_API_KEY?.trim());

  if (hasBedrockToken && hasAnthropicKey) {
    return 'bedrock-anthropic';
  } else if (hasBedrockToken) {
    return 'bedrock-only';
  } else if (hasAnthropicKey) {
    return 'anthropic-only';
  } else {
    return 'direct';
  }
}

/**
 * Forward request to AWS Bedrock via AI Gateway
 */
async function forwardToBedrock(body: string, headers: Headers): Promise<Response> {
  const bedrockToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!bedrockToken) {
    console.log('⚠️  No Bedrock token available');
    throw new Error('No Bedrock token');
  }

  // AI Gateway URL for Bedrock
  const bedrockUrl = `${AI_GATEWAY_BASE}/aws-bedrock/bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-sonnet-4-5-v1:0/invoke`;

  const bedrockHeaders = new Headers({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${bedrockToken}`,
    'anthropic-version': headers.get('anthropic-version') || '2023-06-01',
  });

  console.log('🔵 Attempting Bedrock via AI Gateway...');

  try {
    const response = await fetch(bedrockUrl, {
      method: 'POST',
      headers: bedrockHeaders,
      body
    });

    if (response.ok) {
      console.log('✅ Bedrock request succeeded via AI Gateway');
    } else {
      console.warn(`⚠️  Bedrock returned ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('❌ Bedrock request error:', error);
    throw error;
  }
}

/**
 * Forward request to Anthropic via AI Gateway
 */
async function forwardToAnthropic(body: string, headers: Headers): Promise<Response> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('❌ No Anthropic API key available');
    return new Response(
      JSON.stringify({ error: 'No API credentials available' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // AI Gateway URL for Anthropic
  const anthropicUrl = `${AI_GATEWAY_BASE}/anthropic/v1/messages`;

  const anthropicHeaders = new Headers({
    'Content-Type': 'application/json',
    'x-api-key': anthropicKey,
    'anthropic-version': headers.get('anthropic-version') || '2023-06-01',
  });

  console.log('🟢 Attempting Anthropic via AI Gateway...');

  try {
    const response = await fetch(anthropicUrl, {
      method: 'POST',
      headers: anthropicHeaders,
      body
    });

    if (response.ok) {
      console.log('✅ Anthropic request succeeded via AI Gateway');
    } else {
      console.error(`❌ Anthropic returned ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error('❌ Anthropic request error:', error);
    return new Response(
      JSON.stringify({ error: 'Anthropic API Error', message: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function startProxyServer(): Promise<number> {
  const mode = getProxyMode();

  // Log proxy configuration
  console.log('🔀 Proxy Mode:', mode);
  if (mode === 'direct') {
    console.log('⚠️  No proxy credentials - using direct Anthropic API');
    console.log('   Set ANTHROPIC_API_KEY to enable monitoring via AI Gateway');
    // Still return the port but proxy won't be used
    return PROXY_PORT;
  }

  const server = Bun.serve({
    port: PROXY_PORT,
    hostname: '127.0.0.1',
    idleTimeout: 300, // 5 minutes for long-running Claude API requests

    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      // Health check endpoint (check this first!)
      if (url.pathname === '/health') {
        return Response.json(stats);
      }

      // Only proxy /v1/messages
      if (url.pathname !== '/v1/messages' || req.method !== 'POST') {
        return new Response('Not Found', { status: 404 });
      }

      // Increment request count once at the start
      stats.requests++;

      const body = await req.text();

      // Try Bedrock first if we have a token
      if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
        try {
          const bedrockResponse = await forwardToBedrock(body, req.headers);

          // If successful, return immediately
          if (bedrockResponse.ok) {
            stats.successes++;
            return bedrockResponse;
          }

          // If 429 rate limit, fall through to Anthropic
          if (bedrockResponse.status === 429) {
            console.log('⚠️  Bedrock rate limited (429) - failing over to Anthropic immediately');
          } else {
            // Other errors, return the error (don't failover for non-429 errors)
            stats.failures++;
            return bedrockResponse;
          }
        } catch (error) {
          console.error('❌ Bedrock request threw error:', error);
          // Fall through to Anthropic on any error
        }
      }

      // Immediate failover to Anthropic API (zero delay!)
      if (process.env.ANTHROPIC_API_KEY) {
        console.log('🔄 Failing over to Anthropic (no delay)...');
        const anthropicResponse = await forwardToAnthropic(body, req.headers);

        if (anthropicResponse.ok) {
          stats.successes++;
        } else {
          stats.failures++;
        }

        return anthropicResponse;
      }

      stats.failures++;
      return new Response(
        JSON.stringify({ error: 'Both Bedrock and Anthropic failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });

  console.log(`✅ Proxy server listening on http://127.0.0.1:${server.port}`);
  console.log(`   Forwarding to Cloudflare AI Gateway (${AI_GATEWAY_BASE})`);
  console.log(`   Mode: ${mode}`);
  if (mode === 'bedrock-anthropic') {
    console.log('   🔒 Bedrock-first with Anthropic failover via AI Gateway');
  } else if (mode === 'bedrock-only') {
    console.log('   🔒 Bedrock-only mode via AI Gateway (no Anthropic fallback)');
  } else if (mode === 'anthropic-only') {
    console.log('   🔒 Anthropic-only mode via AI Gateway (monitoring + observability)');
  }
  console.log(`   📊 Health endpoint: http://127.0.0.1:${server.port}/health`);

  return server.port;
}

export function getProxyUrl(): string {
  return `http://127.0.0.1:${PROXY_PORT}`;
}

export function shouldUseProxy(): boolean {
  return getProxyMode() !== 'direct';
}
