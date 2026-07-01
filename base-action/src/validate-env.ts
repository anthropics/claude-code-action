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
  const activeProviders = [useBedrock, useVertex, useFoundry].filter(Boolean);
  if (activeProviders.length > 1) {
    errors.push(
      "Cannot use multiple providers simultaneously. Please set only one of: CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, or CLAUDE_CODE_USE_FOUNDRY.",
    );
  }

  if (!useBedrock && !useVertex && !useFoundry) {
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
    const awsRoleArn = process.env.AWS_ROLE_ARN;
    const awsWebIdentityTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;

    // AWS_REGION is always required for Bedrock
    if (!awsRegion) {
      errors.push("AWS_REGION is required when using AWS Bedrock.");
    }

    // Credentials can come from a bearer token, static access keys, or IRSA
    // (IAM Roles for Service Accounts), where AWS_ROLE_ARN and
    // AWS_WEB_IDENTITY_TOKEN_FILE are injected into the environment and the AWS
    // SDK resolves them automatically via the default credential provider chain.
    const hasAccessKeyCredentials = awsAccessKeyId && awsSecretAccessKey;
    const hasBearerToken = awsBearerToken;
    const hasWebIdentity = awsRoleArn && awsWebIdentityTokenFile;

    if (!hasAccessKeyCredentials && !hasBearerToken && !hasWebIdentity) {
      errors.push(
        "AWS Bedrock requires one of: AWS_BEARER_TOKEN_BEDROCK, both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or IRSA credentials (AWS_ROLE_ARN and AWS_WEB_IDENTITY_TOKEN_FILE).",
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
