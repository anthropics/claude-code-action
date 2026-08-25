#!/usr/bin/env bun

/**
 * GitHub Follow Authentication Validator
 * Validates GitHub token permissions and tests follow/unfollow operations
 * Establishes authenticated identity for follow operations
 */

interface FollowAuthConfig {
  githubToken: string;
  userId?: number;
  username?: string;
}

interface TokenPermissions {
  hasUserRead: boolean;
  hasUserFollowScope: boolean;
  isValid: boolean;
  message: string;
}

export async function validateFollowAuth(
  config: FollowAuthConfig,
): Promise<TokenPermissions> {
  const { githubToken } = config;

  try {
    // Validate token format
    if (!githubToken || !githubToken.trim()) {
      return {
        hasUserRead: false,
        hasUserFollowScope: false,
        isValid: false,
        message: "GitHub token is empty or invalid",
      };
    }

    // Check if it's a valid token format
    const isPersonalAccessToken = githubToken.startsWith("ghp_");
    const isOAuthToken = githubToken.startsWith("gho_");
    const isAppToken = githubToken.startsWith("ghu_");

    if (!isPersonalAccessToken && !isOAuthToken && !isAppToken) {
      return {
        hasUserRead: false,
        hasUserFollowScope: false,
        isValid: false,
        message: "Invalid GitHub token format",
      };
    }

    // Test basic authentication - get authenticated user
    const authResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (authResponse.status === 401) {
      return {
        hasUserRead: false,
        hasUserFollowScope: false,
        isValid: false,
        message: "Token is invalid or expired",
      };
    }

    if (authResponse.status !== 200) {
      return {
        hasUserRead: false,
        hasUserFollowScope: false,
        isValid: false,
        message: `Failed to validate token: HTTP ${authResponse.status}`,
      };
    }

    const userData = (await authResponse.json()) as { login: string };

    // Check follow permission by attempting a dry-run follow
    // Try to follow a test user with low permission impact
    const testFollowResponse = await fetch(
      "https://api.github.com/user/following/github",
      {
        method: "GET",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    const hasFollowScope =
      testFollowResponse.status === 204 ||
      testFollowResponse.status === 404 ||
      testFollowResponse.status === 403;

    return {
      hasUserRead: true,
      hasUserFollowScope: testFollowResponse.status !== 403,
      isValid: true,
      message: `Authenticated as ${userData.login}. Follow scope: ${
        hasFollowScope ? "available" : "not available"
      }`,
    };
  } catch (error: any) {
    return {
      hasUserRead: false,
      hasUserFollowScope: false,
      isValid: false,
      message: `Error validating token: ${error.message}`,
    };
  }
}

export async function validateFollowOperation(
  githubToken: string,
  targetUsername: string,
): Promise<{
  success: boolean;
  status: number;
  message: string;
}> {
  try {
    const response = await fetch(
      `https://api.github.com/user/following/${targetUsername}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (response.status === 204) {
      return {
        success: true,
        status: 204,
        message: `Successfully followed @${targetUsername}`,
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        status: 401,
        message: "Authentication failed - token is invalid or expired",
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        status: 403,
        message:
          "Follow operation forbidden - token may lack user:follow scope",
      };
    }

    if (response.status === 404) {
      return {
        success: false,
        status: 404,
        message: `User @${targetUsername} not found`,
      };
    }

    return {
      success: false,
      status: response.status,
      message: `Unexpected response: HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      status: 0,
      message: `Error performing follow operation: ${error.message}`,
    };
  }
}
