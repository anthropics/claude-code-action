# Cloud Providers

You can authenticate with Claude using any of these five methods:

1. Direct Anthropic API (default)
2. Amazon Bedrock with OIDC authentication
3. Google Vertex AI with OIDC authentication
4. Microsoft Foundry with OIDC authentication
5. Claude Platform on AWS with OIDC or API key authentication

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://code.claude.com/docs/en/github-actions#using-with-amazon-bedrock-and-google-cloud).

**Note**:

- Bedrock, Vertex, and Microsoft Foundry use OIDC authentication exclusively
- AWS Bedrock automatically uses cross-region inference profiles for certain models
- For cross-region inference profile models, you need to request and be granted access to the Claude models in all regions that the inference profile uses
- Claude Platform on AWS uses your AWS account's IAM credentials (OIDC-assumed role or the default AWS credential chain) for SigV4 authentication, or an `ANTHROPIC_AWS_API_KEY` generated in the AWS Console

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

# For Claude Platform on AWS with OIDC
- uses: anthropics/claude-code-action@v1
  with:
    use_aws_platform: "true"
    claude_args: |
      --model claude-sonnet-5
    # ... other inputs
  env:
    ANTHROPIC_AWS_WORKSPACE_ID: ${{ secrets.ANTHROPIC_AWS_WORKSPACE_ID }}
```

## OIDC Authentication for Cloud Providers

AWS Bedrock, GCP Vertex AI, Microsoft Foundry, and Claude Platform on AWS all support OIDC authentication.

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

```yaml
# For Claude Platform on AWS with OIDC
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
    use_aws_platform: "true"
    claude_args: |
      --model claude-sonnet-5
    # ... other inputs
  env:
    ANTHROPIC_AWS_WORKSPACE_ID: ${{ secrets.ANTHROPIC_AWS_WORKSPACE_ID }}

  permissions:
    id-token: write # Required for OIDC
```

## Microsoft Foundry Setup

For detailed setup instructions for Microsoft Foundry, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code/microsoft-foundry).

## Claude Platform on AWS Setup

Claude Platform on AWS gives you Anthropic's native Claude Platform (API, Console, and beta features) through your existing AWS account and billing.

- Create a workspace from the AWS Console and note its workspace ID (`wrkspc_...`) — set it as `ANTHROPIC_AWS_WORKSPACE_ID`
- Workspaces are bound to a single AWS region; `AWS_REGION` must match it
- Authenticate with SigV4 (via `aws-actions/configure-aws-credentials` OIDC, as shown above, or the default AWS credential chain) or set `ANTHROPIC_AWS_API_KEY` with a key generated in the AWS Console under **Claude Platform on AWS → API keys**
- The API base URL defaults to `https://aws-external-anthropic.{AWS_REGION}.api.aws`; override it by setting `ANTHROPIC_AWS_BASE_URL`

For detailed setup instructions, see the [official documentation](https://platform.claude.com/docs/en/build-with-claude/claude-platform-on-aws).
