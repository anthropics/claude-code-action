# Cloud Providers

You can authenticate with Claude using any of these five methods:

1. Direct Anthropic API (default)
2. Custom API Gateway (Bearer token)
3. Amazon Bedrock with OIDC authentication
4. Google Vertex AI with OIDC authentication
5. Microsoft Foundry with OIDC authentication

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://code.claude.com/docs/en/github-actions#for-aws-bedrock:).

**Note**:

- Bedrock, Vertex, and Microsoft Foundry use OIDC authentication exclusively
- AWS Bedrock automatically uses cross-region inference profiles for certain models
- For cross-region inference profile models, you need to request and be granted access to the Claude models in all regions that the inference profile uses

## Model Configuration

Use provider-specific model names based on your chosen provider:

```yaml
# For direct Anthropic API (default)
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # ... other inputs

# For custom API gateway with Bearer token
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.GATEWAY_API_KEY }}  # satisfies input validation
    # ... other inputs
  env:
    ANTHROPIC_BASE_URL: https://your-gateway.example.com/anthropic/
    ANTHROPIC_AUTH_TOKEN: ${{ secrets.GATEWAY_API_KEY }}

# For Amazon Bedrock with OIDC
- uses: anthropics/claude-code-action@v1
  with:
    use_bedrock: "true"
    claude_args: |
      --model anthropic.claude-4-0-sonnet-20250805-v1:0
    # ... other inputs

# For Google Vertex AI with OIDC
- uses: anthropics/claude-code-action@v1
  with:
    use_vertex: "true"
    claude_args: |
      --model claude-4-0-sonnet@20250805
    # ... other inputs

# For Microsoft Foundry with OIDC
- uses: anthropics/claude-code-action@v1
  with:
    use_foundry: "true"
    claude_args: |
      --model claude-sonnet-4-5
    # ... other inputs
```

## Custom API Gateway (Bearer Token)

Some organizations route Anthropic API requests through a custom API gateway (e.g. Azure API Management, corporate proxy) that uses `Authorization: Bearer <token>` instead of the standard `x-api-key` header.

Use `ANTHROPIC_AUTH_TOKEN` to send the key as a Bearer token:

```yaml
- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v2
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- uses: anthropics/claude-code-action@v1
  with:
    github_token: ${{ steps.app-token.outputs.token }}
    anthropic_api_key: ${{ secrets.GATEWAY_API_KEY }}  # satisfies input validation
    claude_args: |
      --model claude-sonnet-4-6
  env:
    ANTHROPIC_BASE_URL: https://your-gateway.example.com/anthropic/
    ANTHROPIC_AUTH_TOKEN: ${{ secrets.GATEWAY_API_KEY }}
```

**How it works:**
- `ANTHROPIC_BASE_URL` points to your gateway endpoint
- `ANTHROPIC_AUTH_TOKEN` sends the key as `Authorization: Bearer <token>` (used by the Anthropic SDK when set)
- `ANTHROPIC_API_KEY` input is still required to pass action validation (can use the same key)

## OIDC Authentication for Cloud Providers

AWS Bedrock, GCP Vertex AI, and Microsoft Foundry all support OIDC authentication.

```yaml
# For AWS Bedrock with OIDC
- name: Configure AWS Credentials (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
    aws-region: us-west-2

- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v2
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- uses: anthropics/claude-code-action@v1
  with:
    use_bedrock: "true"
    claude_args: |
      --model anthropic.claude-4-0-sonnet-20250805-v1:0
    # ... other inputs

  permissions:
    id-token: write # Required for OIDC
```

```yaml
# For GCP Vertex AI with OIDC
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v2
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- uses: anthropics/claude-code-action@v1
  with:
    use_vertex: "true"
    claude_args: |
      --model claude-4-0-sonnet@20250805
    # ... other inputs

  permissions:
    id-token: write # Required for OIDC
```

```yaml
# For Microsoft Foundry with OIDC
- name: Authenticate to Azure
  uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

- name: Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v2
  with:
    app-id: ${{ secrets.APP_ID }}
    private-key: ${{ secrets.APP_PRIVATE_KEY }}

- uses: anthropics/claude-code-action@v1
  with:
    use_foundry: "true"
    claude_args: |
      --model claude-sonnet-4-5
    # ... other inputs
  env:
    ANTHROPIC_FOUNDRY_BASE_URL: https://my-resource.services.ai.azure.com

permissions:
  id-token: write # Required for OIDC
```

## Microsoft Foundry Setup

For detailed setup instructions for Microsoft Foundry, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code/microsoft-foundry).
