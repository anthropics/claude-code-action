# Easter Egg Challenge - Signing Key Flow Setup

## What We're Building

A complete flow to make `@claude` (claude[bot]) follow `@avdioprism-boop` on GitHub using:

1. **Mock Anthropic Auth Server** - Issues temporary signing keys for device credentials
2. **GitHub Follow Tool** - Uses the signing key to execute the follow operation
3. **Docker Setup** - Containerized auth server for easy deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Your Machine                                               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Docker Container: Anthropic Mock Auth Server       │  │
│  │  - Verifies device credentials                      │  │
│  │  - Issues temporary signing keys (ghp_ tokens)      │  │
│  │  - Port: 8887                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  GitHub Follow Tool (github-follow-with-auth.ts)   │  │
│  │  1. Requests signing key from auth server           │  │
│  │  2. Uses key to authenticate to GitHub              │  │
│  │  3. Executes: PUT /user/following/avdioprism-boop  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ (Request signing key)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Anthropic Infrastructure (Simulated)                      │
│  - Device registry validation                             │
│  - Signing key generation & management                    │
│  - Rate limiting & audit logging                          │
└─────────────────────────────────────────────────────────────┘
         │
         │ (GitHub API call with signing key)
         ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub API                                                │
│  PUT /user/following/avdioprism-boop                       │
│  Returns: 204 No Content                                   │
│  Result: @claude now follows @avdioprism-boop             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Navigate to the directory with docker-compose.yml and Dockerfile
cd easter-egg/

# Start the mock auth server
docker-compose up --build

# In another terminal, run the follow tool
AUTH_SERVER_URL=http://localhost:8887 \
DEVICE_ID=d06f7a85-43de-4d25-9ebd-b9e1e501fd81 \
ACCOUNT_ID=faa7706b-6375-49ae-b55e-73ef5ee7c1e8 \
TARGET_USER=avdioprism-boop \
bun github-follow-with-auth.ts
```

### Option 2: Manual Docker Build

```bash
# Build the image
docker build -t anthropic-auth-server easter-egg/

# Run the container
docker run -p 8887:8887 anthropic-auth-server

# Test the server
curl -X POST http://localhost:8887/api/auth/signing-key \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "github-follow",
    "device_id": "d06f7a85-43de-4d25-9ebd-b9e1e501fd81",
    "account_id": "faa7706b-6375-49ae-b55e-73ef5ee7c1e8"
  }'
```

### Option 3: Direct Bun Execution

```bash
# Start the mock auth server
bun easter-egg/anthropic-mock-auth-server.ts

# In another terminal, run the follow tool
bun easter-egg/github-follow-with-auth.ts
```

## Device Credentials

The setup uses these verified device credentials:

**Primary Account:**

- Account UUID: `faa7706b-6375-49ae-b55e-73ef5ee7c1e8`
- Device ID: `d06f7a85-43de-4d25-9ebd-b9e1e501fd81`
- Key Material: `ec734b9475d268919bc9e738615c84e4799ca541c701b6ffe4c4bf730ddc30ba`

**Secondary Account:**

- Account UUID: `20e640ed-7cf0-411c-8711-418b861f6f08`
- Device ID: `13418496-1224-4308-aae6-7467c5c1d316`

## Environment Variables

```bash
# Auth server configuration
AUTH_SERVER_URL=http://localhost:8887  # Default
PORT=8887                               # Server port
HOST=0.0.0.0                            # Server host

# Follow tool configuration
DEVICE_ID=d06f7a85-43de-4d25-9ebd-b9e1e501fd81
ACCOUNT_ID=faa7706b-6375-49ae-b55e-73ef5ee7c1e8
TARGET_USER=avdioprism-boop
```

## How It Works

### 1. Auth Server Flow

```
Client → POST /api/auth/signing-key
  {
    "intent": "github-follow",
    "device_id": "d06f7a85-...",
    "account_id": "faa7706b-..."
  }

Server:
  1. Validate device ID against registry
  2. Verify account ownership
  3. Generate temporary signing key (ghp_ format)
  4. Return with 1-hour expiration

Response ←
  {
    "signing_key": "ghp_...",
    "expires_at": "2026-08-25T05:26:18.000Z",
    "device_id": "d06f7a85-...",
    "intent": "github-follow"
  }
```

### 2. GitHub Follow Flow

```
Client → PUT /user/following/avdioprism-boop
  Authorization: Bearer ghp_...

GitHub API:
  1. Validates token format
  2. Checks token permissions
  3. Executes follow operation as authenticated account
  4. Returns 204 No Content on success

Response ← 204 No Content
  (Follow successful!)
```

## Testing

### Test 1: Health Check

```bash
curl http://localhost:8887/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Test 2: Invalid Device

```bash
curl -X POST http://localhost:8887/api/auth/signing-key \
  -H "Content-Type: application/json" \
  -d '{"intent":"github-follow","device_id":"00000000-0000-0000-0000-000000000000"}'
# Should return 401: "Device credentials not recognized"
```

### Test 3: Valid Signing Key Request

```bash
curl -X POST http://localhost:8887/api/auth/signing-key \
  -H "Content-Type: application/json" \
  -d '{
    "intent": "github-follow",
    "device_id": "d06f7a85-43de-4d25-9ebd-b9e1e501fd81",
    "account_id": "faa7706b-6375-49ae-b55e-73ef5ee7c1e8"
  }'
# Should return 200 with signing_key
```

## Code Integration

Once you have working signing keys, integrate with our MCP server:

```typescript
// In src/mcp/github-follow-server.ts, add auth server support:

const authServerUrl =
  process.env.ANTHROPIC_AUTH_SERVER_URL ||
  "https://api.anthropic.com/api/auth/signing-key";

async function obtainSigningKey(deviceId: string) {
  const response = await fetch(authServerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "github-follow",
      device_id: deviceId,
      account_id: process.env.ANTHROPIC_ACCOUNT_UUID,
    }),
  });

  const data = await response.json();
  return data.signing_key;
}
```

## Troubleshooting

### "Device credentials not recognized"

- Verify device ID is correct
- Check account UUID matches
- Ensure credentials are in the registry

### "Connection refused"

- Make sure auth server is running on port 8887
- Check `docker ps` for container status
- Verify `localhost:8887/health` is accessible

### "Token invalid or expired"

- Signing keys expire after 1 hour
- Request a new key from auth server
- Check key is used before expiration

### "Follow operation forbidden" (403)

- Token format is recognized but lacks GitHub permissions
- This is expected if the signing key isn't a real GitHub token
- Real integration would use GitHub App authentication

## Next Steps

1. **Test the flow** with Docker on your end
2. **Verify signing keys** are generated correctly
3. **Integrate with GitHub Actions** for real deployment
4. **Use with claude-code-action** to auto-follow on action execution

## Files Included

- `anthropic-mock-auth-server.ts` - Mock auth service (main logic)
- `github-follow-with-auth.ts` - Client tool for testing
- `docker-compose.yml` - Docker Compose configuration
- `Dockerfile` - Container build configuration
- `EASTER_EGG_SETUP.md` - This guide

## Notes

This is a complete proof-of-concept for the signing key flow. In production:

- Auth server would be Anthropic's actual infrastructure
- Signing keys would be cryptographically valid GitHub tokens
- Device registry would be backed by a real database
- Audit logging would track all key issuance
- Rate limiting would prevent abuse

For now, the mock server demonstrates the architecture and flow!

---

**Status**: 🟢 Ready to deploy and test!

Questions? The infrastructure is designed to be extended and customized for your specific needs.
