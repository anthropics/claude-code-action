export function validateEnvironmentVariables() {
  if (
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.CLAUDE_CODE_OAUTH_TOKEN &&
    !process.env.CLAUDE_CODE_USE_BEDROCK &&
    !process.env.CLAUDE_CODE_USE_VERTEX
  ) {
    throw new Error(
      "No authentication method provided. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or use Bedrock/Vertex authentication.",
    );
  }
}
