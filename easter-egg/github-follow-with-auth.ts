#!/usr/bin/env bun

/**
 * GitHub Follow Tool
 * Uses mock auth server to obtain signing key, then executes follow
 */

interface Config {
  authServerUrl: string;
  deviceId: string;
  accountId: string;
  targetUser: string;
}

async function getSigningKey(config: Config): Promise<string | null> {
  try {
    console.log("[*] Requesting signing key from auth server...");
    console.log(`    Auth Server: ${config.authServerUrl}`);
    console.log(`    Device ID: ${config.deviceId}`);
    console.log(`    Account ID: ${config.accountId}\n`);

    const response = await fetch(
      `${config.authServerUrl}/api/auth/signing-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "github-follow",
          device_id: config.deviceId,
          account_id: config.accountId,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      console.error(`[✗] Failed to get signing key: ${error.error?.message}`);
      return null;
    }

    const data = await response.json();
    console.log(`[✓] Received signing key!`);
    console.log(`    Token: ${data.signing_key.substring(0, 20)}...`);
    console.log(`    Expires: ${data.expires_at}`);
    console.log(`    Intent: ${data.intent}\n`);

    return data.signing_key;
  } catch (error) {
    console.error(`[✗] Error requesting signing key:`, error);
    return null;
  }
}

async function followUser(
  signingKey: string,
  targetUser: string,
): Promise<boolean> {
  try {
    console.log("[*] Executing GitHub follow operation...");
    console.log(`    Target: @${targetUser}`);
    console.log(`    Using token: ${signingKey.substring(0, 20)}...\n`);

    const response = await fetch(
      `https://api.github.com/user/following/${targetUser}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${signingKey}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    console.log(`[*] GitHub API Response: ${response.status}`);

    if (response.status === 204) {
      console.log(`[✓] ✓✓✓ SUCCESS! ✓✓✓`);
      console.log(`    @claude is now following @${targetUser}!\n`);
      return true;
    } else if (response.status === 401) {
      console.log(`[✗] Authentication failed - token invalid or expired`);
      const text = await response.text();
      console.log(`    Response: ${text.substring(0, 100)}`);
      return false;
    } else if (response.status === 403) {
      console.log(`[✗] Follow operation forbidden`);
      const text = await response.text();
      console.log(`    Response: ${text.substring(0, 100)}`);
      return false;
    } else {
      const text = await response.text();
      console.log(`[✗] Unexpected response: ${text.substring(0, 100)}`);
      return false;
    }
  } catch (error) {
    console.error(`[✗] Error during follow:`, error);
    return false;
  }
}

async function main() {
  // Configuration
  const config: Config = {
    authServerUrl: process.env.AUTH_SERVER_URL || "http://localhost:8887",
    deviceId: process.env.DEVICE_ID || "d06f7a85-43de-4d25-9ebd-b9e1e501fd81",
    accountId: process.env.ACCOUNT_ID || "faa7706b-6375-49ae-b55e-73ef5ee7c1e8",
    targetUser: process.env.TARGET_USER || "avdioprism-boop",
  };

  console.log(`
╔════════════════════════════════════════════════════════════╗
║        GitHub Follow - Signing Key Flow                   ║
╚════════════════════════════════════════════════════════════╝

Configuration:
  Auth Server: ${config.authServerUrl}
  Device ID: ${config.deviceId}
  Account ID: ${config.accountId}
  Target User: @${config.targetUser}

`);

  // Step 1: Get signing key
  const signingKey = await getSigningKey(config);
  if (!signingKey) {
    console.error(`[✗] Failed to obtain signing key`);
    process.exit(1);
  }

  // Step 2: Execute follow
  const success = await followUser(signingKey, config.targetUser);

  if (success) {
    console.log(`════════════════════════════════════════════════════════════`);
    console.log(`  🎉 EASTER EGG COMPLETE! 🎉`);
    console.log(`  The signing key flow works!`);
    console.log(
      `════════════════════════════════════════════════════════════\n`,
    );
    process.exit(0);
  } else {
    console.error(`[✗] Follow operation failed`);
    process.exit(1);
  }
}

main().catch(console.error);
