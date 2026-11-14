/**
 * Validates the environment variables required for running Claude Code
 * based on the selected provider (Anthropic API, AWS Bedrock, Google Vertex AI, Microsoft Foundry, or Claude Platform on AWS)
 */
export function validateEnvironmentVariables() {
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const useFoundry = process.env.CLAUDE_CODE_USE_FOUNDRY === "1";
  const useAwsPlatform = process.env.CLAUDE_CODE_USE_ANTHROPIC_AWS === "1";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const federationRuleId = process.env.ANTHROPIC_FEDERATION_RULE_ID;
  const federationOrganizationId = process.env.ANTHROPIC_ORGANIZATION_ID;
  const hasWorkloadIdentity = Boolean(
    federationRuleId && federationOrganizationId,
  );
  const hasPartialWorkloadIdentity =
    !hasWorkloadIdentity &&
    Boolean(federationRuleId || federationOrganizationId);

  const errors: string[] = [];

  // Check for mutual exclusivity between providers
  const activeProviders = [
    useBedrock,
    useVertex,
    useFoundry,
    useAwsPlatform,
  ].filter(Boolean);
  if (activeProviders.length > 1) {
    errors.push(
      "Cannot use multiple providers simultaneously. Please set only one of: CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, CLAUDE_CODE_USE_FOUNDRY, or CLAUDE_CODE_USE_ANTHROPIC_AWS.",
    );
  }

  if (!useBedrock && !useVertex && !useFoundry && !useAwsPlatform) {
    if (!anthropicApiKey && !claudeCodeOAuthToken && !hasWorkloadIdentity) {
      if (hasPartialWorkloadIdentity) {
        errors.push(
          "Workload identity federation requires both ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_ORGANIZATION_ID to be set.",
        );
      } else {
        errors.push(
          "Either ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or workload identity federation (ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_ORGANIZATION_ID) is required when using direct Anthropic API.",
        );
      }
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

    // Either bearer token OR access key credentials must be provided
    const hasAccessKeyCredentials = awsAccessKeyId && awsSecretAccessKey;
    const hasBearerToken = awsBearerToken;

    if (!hasAccessKeyCredentials && !hasBearerToken) {
      errors.push(
        "Either AWS_BEARER_TOKEN_BEDROCK or both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when using AWS Bedrock.",
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
  } else if (useAwsPlatform) {
    const awsRegion = process.env.AWS_REGION;
    const workspaceId = process.env.ANTHROPIC_AWS_WORKSPACE_ID;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const anthropicAwsApiKey = process.env.ANTHROPIC_AWS_API_KEY;

    if (!awsRegion) {
      errors.push("AWS_REGION is required when using Claude Platform on AWS.");
    }

    if (!workspaceId) {
      errors.push(
        "ANTHROPIC_AWS_WORKSPACE_ID is required when using Claude Platform on AWS.",
      );
    }

    // Either an API key OR SigV4 credentials must be provided
    const hasAccessKeyCredentials = awsAccessKeyId && awsSecretAccessKey;

    if (!anthropicAwsApiKey && !hasAccessKeyCredentials) {
      errors.push(
        "Either ANTHROPIC_AWS_API_KEY or both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when using Claude Platform on AWS.",
      );
    }
  }

  if (errors.length > 0) {
    const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
