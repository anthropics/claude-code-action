# Cloud Providers

You can authenticate with Claude using any of these five methods:

1. Direct Anthropic API (default)
2. Amazon Bedrock with OIDC authentication
3. Google Vertex AI with OIDC authentication
4. Microsoft Foundry with OIDC authentication
5. [OrcaRouter](https://www.orcarouter.ai) — an OpenAI-compatible AI gateway that routes many providers behind one endpoint

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://code.claude.com/docs/en/github-actions#using-with-amazon-bedrock-and-google-cloud).

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
    ANTHROPIC_FOUNDRY_BASE_URL: https://my-resource.services.ai.azure.com

permissions:
  id-token: write # Required for OIDC
```

## Microsoft Foundry Setup

For detailed setup instructions for Microsoft Foundry, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code/microsoft-foundry).

## OrcaRouter Setup

[OrcaRouter](https://www.orcarouter.ai) is an OpenAI-compatible AI gateway that
routes many providers behind one endpoint. It is available as a first-class
provider with two independent ways to sign in.

**OrcaRouter - API** — paste an existing key. Find or create one in the
[OrcaRouter console](https://www.orcarouter.ai/console/token):

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    orcarouter_api_key: ${{ secrets.ORCAROUTER_API_KEY }}
    orcarouter_model: openai/gpt-5.5
    prompt: "..."
```

**OrcaRouter - Auth** — sign in with your OrcaRouter account using OAuth 2.0 +
PKCE. Nothing needs to be registered in advance and no client secret is involved.
Because a GitHub Actions step runs headless and cannot rely on an interactive
prompt, the flow is split across two steps: the first prints the consent URL and
the second redeems the code it displays.

```yaml
- id: orca-connect
  uses: anthropics/claude-code-action@v1
  with:
    orcarouter_auth: "true"
    orcarouter_stage: connect
    # The consent URL is written to the step summary. Open it, approve access,
    # and copy the code the consent screen displays into the next step.

- uses: anthropics/claude-code-action@v1
  with:
    orcarouter_auth: "true"
    orcarouter_code: ${{ secrets.ORCAROUTER_AUTH_CODE }}
    prompt: "..."
```

The issued key is stored in the user's own `~/.claude` credential directory and
reused on later runs, so the consent screen appears once rather than on every
run. `orcarouter_stage: status` reports which entry point is configured with the
secret masked, and `orcarouter_stage: logout` removes a stored login.

Both entry points reach the same inference API at
`https://api.orcarouter.ai/v1` with `Authorization: Bearer <key>`; only the way
the key is obtained differs. Selecting `orcarouter_model` is optional — the
action discovers the models your key can actually call from
`GET https://api.orcarouter.ai/v1/models` and clears a selection that the current
entry point does not support.

Self-hosted deployments can point at a single shared origin with `ORCA_BASE_URL`,
or at separate origins with `ORCA_AUTH_BASE_URL` and `ORCA_API_BASE_URL`. Explicit
overrides take precedence over the shared value, non-loopback origins must use
HTTPS, and authentication always follows the auth origin while inference always
follows the API origin. `ORCA_*` values are read from the workflow's `env:` block
(the `orcarouter_*` inputs take precedence for the credential itself).

Once a login is stored, later runs only need `orcarouter_auth: "true"` — no code
is required, and the stored key is reused until you revoke the app from
[Authorized Apps](https://www.orcarouter.ai/console/authorized-apps). Revoking
every key at once is expected: the action reports the exact account as needing
reauthentication rather than retrying a dead credential.
