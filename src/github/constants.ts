/**
 * GitHub-related constants used throughout the application
 */

/**
 * Claude App bot user ID
 * Verified via: curl -s https://api.github.com/users/claude%5Bbot%5D | jq .id
 */
export const CLAUDE_APP_BOT_ID = 209825114;

/**
 * Claude bot username
 */
export const CLAUDE_BOT_LOGIN = "claude[bot]";
