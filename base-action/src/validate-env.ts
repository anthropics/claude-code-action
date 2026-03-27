/**
 * Validates the environment variables required for running Claude Code
 * based on the selected provider (Anthropic API, AWS Bedrock, Google Vertex AI, or Microsoft Foundry)
 */
export function validateEnvironmentVariables() {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const useFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY === "1";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  const errors: string[] = [];

  // Check for mutual exclusivity between providers
  const activeProviders = [useBedrock, useVertex, useFoundry].filter(Boolean);
  if (activeProviders.length > 1) {
    errors.push(
      "Cannot use multiple providers simultaneously. Please set only one of: CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, or CLAUDE_CODE_USE_FOUNDRY.",
    );
  }

  if (!useBedrock && !useVertex && !useFoundry) {
    if (!anthropicApiKey && !claudeCodeOAuthToken) {
      errors.push(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    }
  } else if (useBedrock) {
    const awsRegion = process.env.AWS_REGION;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;

    // AWS_REGION is always required for Bedrock
    if (!awsRegion) {
      errors.push("AWS_REGION is required when using AWS Bedrock.");
    }

    // IRSA (IAM Roles for Service Accounts) — requires both vars together
    const awsWebIdentityTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
    const awsRoleArn = process.env.AWS_ROLE_ARN;

    // EKS Pod Identity — requires both vars together
    const awsContainerCredentialsFullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    const awsContainerAuthorizationTokenFile = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE;

    const hasAccessKeyCredentials = awsAccessKeyId && awsSecretAccessKey;
    const hasBearerToken = awsBearerToken;
    const hasIRSA = !!(awsWebIdentityTokenFile && awsRoleArn);
    const hasPodIdentity = !!(awsContainerCredentialsFullUri && awsContainerAuthorizationTokenFile);

    // Warn on incomplete IRSA configuration
    if (!!(awsWebIdentityTokenFile || awsRoleArn) && !hasIRSA) {
      errors.push(
        "Incomplete IRSA configuration: both AWS_WEB_IDENTITY_TOKEN_FILE and AWS_ROLE_ARN must be set together.",
      );
    }

    // Warn on incomplete EKS Pod Identity configuration
    if (!!(awsContainerCredentialsFullUri || awsContainerAuthorizationTokenFile) && !hasPodIdentity) {
      errors.push(
        "Incomplete EKS Pod Identity configuration: both AWS_CONTAINER_CREDENTIALS_FULL_URI and AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE must be set together.",
      );
    }

    if (!hasAccessKeyCredentials && !hasBearerToken && !hasIRSA && !hasPodIdentity) {
      errors.push(
        "No valid AWS credentials found for Bedrock. Please provide one of the following:\n" +
        "  1. Static credentials:   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY\n" +
        "  2. Bedrock bearer token: AWS_BEARER_TOKEN_BEDROCK\n" +
        "  3. IRSA:                 AWS_WEB_IDENTITY_TOKEN_FILE + AWS_ROLE_ARN\n" +
        "  4. EKS Pod Identity:     AWS_CONTAINER_CREDENTIALS_FULL_URI + AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
      );
    }
  } else if (useVertex) {
    const requiredVertexVars = {
      ANTHROPIC_VERTEX_PROJECT_ID: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
      CLOUD_ML_REGION: process.env.CLOUD_ML_REGION,
    };

    Object.entries(requiredVertexVars).forEach(([key, value]) => {
      if (!value) {
        errors.push(`${key} is required when using Google Vertex AI.`);
      }
    });
  } else if (useFoundry) {
    const foundryResource = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
    const foundryBaseUrl = process.env.ANTHROPIC_FOUNDRY_BASE_URL;

    // Either resource name or base URL is required
    if (!foundryResource && !foundryBaseUrl) {
      errors.push(
        "Either ANTHROPIC_FOUNDRY_RESOURCE or ANTHROPIC_FOUNDRY_BASE_URL is required when using Microsoft Foundry.",
      );
    }
  }

  if (errors.length > 0) {
    const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
