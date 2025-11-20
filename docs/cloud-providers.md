# Cloud Providers

You can authenticate with Claude using any of these four methods:

1. Direct Anthropic API (default)
2. Amazon Bedrock with OIDC authentication
3. Google Vertex AI with OIDC authentication
4. Microsoft Foundry with OIDC authentication

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code/github-actions#using-with-aws-bedrock-%26-google-vertex-ai).

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
    ANTHROPIC_FOUNDRY_RESOURCE: my-azure-resource
    # Optional: Set custom deployment names
    ANTHROPIC_DEFAULT_SONNET_MODEL: claude-sonnet-4-5
    ANTHROPIC_DEFAULT_HAIKU_MODEL: claude-haiku-4-5
    ANTHROPIC_DEFAULT_OPUS_MODEL: claude-opus-4-1

permissions:
  id-token: write # Required for OIDC
```

## Microsoft Foundry Setup

### Prerequisites

Before using Microsoft Foundry with Claude Code Action, ensure you have:

- An Azure subscription with access to Microsoft Foundry
- RBAC permissions to create Microsoft Foundry resources and deployments
- Created Claude model deployments in your Microsoft Foundry resource:
  - Claude Opus
  - Claude Sonnet
  - Claude Haiku

### Authentication

Microsoft Foundry uses Microsoft Entra ID (OIDC) authentication:

1. Set up Azure Workload Identity Federation for your GitHub repository
2. Configure the `azure/login` action with your Azure credentials
3. Set the `ANTHROPIC_FOUNDRY_RESOURCE` environment variable to your resource name

```yaml
- name: Authenticate to Azure
  uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

- uses: anthropics/claude-code-action@v1
  with:
    use_foundry: "true"
  env:
    ANTHROPIC_FOUNDRY_RESOURCE: my-azure-resource
```

### Environment Variables

| Variable                         | Required | Description                                  |
| -------------------------------- | -------- | -------------------------------------------- |
| `ANTHROPIC_FOUNDRY_RESOURCE`     | Yes\*    | Your Microsoft Foundry resource name         |
| `ANTHROPIC_FOUNDRY_BASE_URL`     | Yes\*    | Full base URL (alternative to resource name) |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | No       | Custom deployment name for Sonnet model      |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | No       | Custom deployment name for Haiku model       |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`   | No       | Custom deployment name for Opus model        |

\*Either `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL` is required.

If `ANTHROPIC_FOUNDRY_RESOURCE` is provided, the base URL will be automatically constructed as:

```
https://{resource}.services.ai.azure.com
```

### Model Deployment Names

By default, Claude Code expects the following deployment names in your Microsoft Foundry resource:

- `claude-sonnet-4-5` for Claude Sonnet
- `claude-haiku-4-5` for Claude Haiku
- `claude-opus-4-1` for Claude Opus

If your deployments use different names, set the corresponding environment variables:

```yaml
env:
  ANTHROPIC_FOUNDRY_RESOURCE: my-azure-resource
  ANTHROPIC_DEFAULT_SONNET_MODEL: my-sonnet-deployment
  ANTHROPIC_DEFAULT_HAIKU_MODEL: my-haiku-deployment
  ANTHROPIC_DEFAULT_OPUS_MODEL: my-opus-deployment
```

### Azure RBAC Configuration

The following Azure roles include the required permissions for invoking Claude models:

- `Azure AI User` (recommended)
- `Cognitive Services User`

For more restrictive custom roles, ensure they include:

```json
{
  "permissions": [
    {
      "dataActions": ["Microsoft.CognitiveServices/accounts/providers/*"]
    }
  ]
}
```

For more details, see [Microsoft Foundry RBAC documentation](https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/rbac-azure-ai-foundry).

### Troubleshooting

**Error: "Failed to get token from azureADTokenProvider: ChainedTokenCredential authentication failed"**

This indicates that Azure authentication is not properly configured. Ensure you have configured Entra ID authentication using the `azure/login` action before calling the claude-code-action.

**Error: "Either ANTHROPIC_FOUNDRY_RESOURCE or ANTHROPIC_FOUNDRY_BASE_URL is required"**

You must provide either the resource name or the full base URL. Set the `ANTHROPIC_FOUNDRY_RESOURCE` environment variable with your Microsoft Foundry resource name.
