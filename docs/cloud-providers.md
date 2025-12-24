# Cloud Providers

You can authenticate with Claude using any of these four methods:

1. Direct Anthropic API (default)
2. Amazon Bedrock
3. Google Vertex AI
4. Microsoft Foundry

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://code.claude.com/docs/en/github-actions#for-aws-bedrock:).

**Note**:

- **AWS Bedrock** supports IAM access keys (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`), temporary credentials via OIDC, or bearer token (`AWS_BEARER_TOKEN_BEDROCK`)
- **Google Vertex AI** supports service account key files (`GOOGLE_APPLICATION_CREDENTIALS`) or OIDC via Workload Identity Federation
- **Microsoft Foundry** supports API key (`ANTHROPIC_FOUNDRY_API_KEY`) or OIDC via Azure login
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
    ANTHROPIC_FOUNDRY_BASE_URL: https://my-resource.services.ai.azure.com

permissions:
  id-token: write # Required for OIDC
```

## Microsoft Foundry Setup

For detailed setup instructions for Microsoft Foundry, see the [official documentation](https://code.claude.com/docs/en/microsoft-foundry).

### Using API Key Authentication (Simpler Setup)

Microsoft Foundry supports API key authentication, which is simpler than OIDC and doesn't require Azure login or GitHub App token setup:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    use_foundry: "true"
    claude_args: |
      --model claude-sonnet-4-5
    # ... other inputs
  env:
    ANTHROPIC_FOUNDRY_RESOURCE: ${{ secrets.ANTHROPIC_FOUNDRY_RESOURCE }}
    ANTHROPIC_FOUNDRY_API_KEY: ${{ secrets.ANTHROPIC_FOUNDRY_API_KEY }}
```

**Required secrets:**

- `ANTHROPIC_FOUNDRY_RESOURCE`: Your Azure Foundry resource name (e.g., `my-foundry-resource`)
- `ANTHROPIC_FOUNDRY_API_KEY`: Your Azure Foundry API key

**Note:** This approach uses the built-in `GITHUB_TOKEN` which is automatically available in GitHub Actions - no additional GitHub App setup required.
