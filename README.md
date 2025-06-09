![Claude Code Action responding to a comment](https://github.com/user-attachments/assets/1d60c2e9-82ed-4ee5-b749-f9e021c85f4d)

# Claude Code Action

A general-purpose [Claude Code](https://claude.ai/code) action for GitHub PRs and issues that can answer questions and implement code changes. This action listens for a trigger phrase in comments and activates Claude act on the request. It supports multiple authentication methods including Anthropic direct API, Amazon Bedrock, and Google Vertex AI.

## Features

- 🤖 **Interactive Code Assistant**: Claude can answer questions about code, architecture, and programming
- 🔍 **Code Review**: Analyzes PR changes and suggests improvements
- ✨ **Code Implementation**: Can implement simple fixes, refactoring, and even new features
- 💬 **PR/Issue Integration**: Works seamlessly with GitHub comments and PR reviews
- 🛠️ **Flexible Tool Access**: Access to GitHub APIs and file operations (additional tools can be enabled via configuration)
- 📋 **Progress Tracking**: Visual progress indicators with checkboxes that dynamically update as Claude completes tasks
- 🏃 **Runs on Your Infrastructure**: The action executes entirely on your own GitHub runner (Anthropic API calls go to your chosen provider)

## Quickstart

The easiest way to set up this action is through [Claude Code](https://claude.ai/code) in the terminal. Just open `claude` and run `/install-github-app`.

This command will guide you through setting up the GitHub app and required secrets.

**Note**:

- You must be a repository admin to install the GitHub app and add secrets
- This quickstart method is only available for direct Anthropic API users. If you're using AWS Bedrock, please see the instructions below.

### Manual Setup (Direct API)

**Requirements**: You must be a repository admin to complete these steps.

1. Install the Claude GitHub app to your repository: https://github.com/apps/claude
2. Add `ANTHROPIC_API_KEY` to your repository secrets ([Learn how to use secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions))
3. Copy the workflow file from [`examples/claude.yml`](./examples/claude.yml) into your repository's `.github/workflows/`

## 📚 FAQ

Having issues or questions? Check out our [Frequently Asked Questions](./FAQ.md) for solutions to common problems and detailed explanations of Claude's capabilities and limitations.

## Usage

Add a workflow file to your repository (e.g., `.github/workflows/claude.yml`):

```yaml
name: Claude Assistant
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude-response:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: add custom trigger phrase (default: @claude)
          # trigger_phrase: "/claude"
          # Optional: add assignee trigger for issues
          # assignee_trigger: "claude"
          # Optional: add custom environment variables (YAML format)
          # claude_env: |
          #   NODE_ENV: test
          #   DEBUG: true
          #   API_URL: https://api.example.com
```

## Inputs

| Input                 | Description                                                                                                          | Required | Default   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| `anthropic_api_key`   | Anthropic API key (required for direct API, not needed for Bedrock/Vertex)                                           | No\*     | -         |
| `direct_prompt`       | Direct prompt for Claude to execute automatically without needing a trigger (for automated workflows)                | No       | -         |
| `timeout_minutes`     | Timeout in minutes for execution                                                                                     | No       | `30`      |
| `github_token`        | GitHub token for Claude to operate with. **Only include this if you're connecting a custom GitHub app of your own!** | No       | -         |
| `model`               | Model to use (provider-specific format required for Bedrock/Vertex)                                                  | No       | -         |
| `anthropic_model`     | **DEPRECATED**: Use `model` instead. Kept for backward compatibility.                                                | No       | -         |
| `use_bedrock`         | Use Amazon Bedrock with OIDC authentication instead of direct Anthropic API                                          | No       | `false`   |
| `use_vertex`          | Use Google Vertex AI with OIDC authentication instead of direct Anthropic API                                        | No       | `false`   |
| `allowed_tools`       | Additional tools for Claude to use (the base GitHub tools will always be included)                                   | No       | ""        |
| `disallowed_tools`    | Tools that Claude should never use                                                                                   | No       | ""        |
| `custom_instructions` | Additional custom instructions to include in the prompt for Claude                                                   | No       | ""        |
| `mcp_config`          | Additional MCP configuration (JSON string) that merges with the built-in GitHub MCP servers                          | No       | ""        |
| `assignee_trigger`    | The assignee username that triggers the action (e.g. @claude). Only used for issue assignment                        | No       | -         |
| `trigger_phrase`      | The trigger phrase to look for in comments, issue/PR bodies, and issue titles                                        | No       | `@claude` |
| `claude_env`          | Custom environment variables to pass to Claude Code execution (YAML format)                                          | No       | ""        |

\*Required when using direct Anthropic API (default and when not using Bedrock or Vertex)

> **Note**: This action is currently in beta. Features and APIs may change as we continue to improve the integration.

### Using Custom MCP Configuration

The `mcp_config` input allows you to add custom MCP (Model Context Protocol) servers to extend Claude's capabilities. These servers merge with the built-in GitHub MCP servers.

#### Basic Example: Adding a Sequential Thinking Server

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    mcp_config: |
      {
        "mcpServers": {
          "sequential-thinking": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-sequential-thinking"
            ]
          }
        }
      }
    allowed_tools: "mcp__sequential-thinking__sequentialthinking" # Important: Each MCP tool from your server must be listed here, comma-separated
    # ... other inputs
```

#### Passing Secrets to MCP Servers

For MCP servers that require sensitive information like API keys or tokens, use GitHub Secrets in the environment variables:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    mcp_config: |
      {
        "mcpServers": {
          "custom-api-server": {
            "command": "npx",
            "args": ["-y", "@example/api-server"],
            "env": {
              "API_KEY": "${{ secrets.CUSTOM_API_KEY }}",
              "BASE_URL": "https://api.example.com"
            }
          }
        }
      }
    # ... other inputs
```

**Important**:

- Always use GitHub Secrets (`${{ secrets.SECRET_NAME }}`) for sensitive values like API keys, tokens, or passwords. Never hardcode secrets directly in the workflow file.
- Your custom servers will override any built-in servers with the same name.

## Examples

### Ways to Tag @claude

These examples show how to interact with Claude using comments in PRs and issues. By default, Claude will be triggered anytime you mention `@claude`, but you can customize the exact trigger phrase using the `trigger_phrase` input in the workflow.

Claude will see the full PR context, including any comments.

#### Ask Questions

Add a comment to a PR or issue:

```
@claude What does this function do and how could we improve it?
```

Claude will analyze the code and provide a detailed explanation with suggestions.

#### Request Fixes

Ask Claude to implement specific changes:

```
@claude Can you add error handling to this function?
```

#### Code Review

Get a thorough review:

```
@claude Please review this PR and suggest improvements
```

Claude will analyze the changes and provide feedback.

#### Fix Bugs from Screenshots

Upload a screenshot of a bug and ask Claude to fix it:

```
@claude Here's a screenshot of a bug I'm seeing [upload screenshot]. Can you fix it?
```

Claude can see and analyze images, making it easy to fix visual bugs or UI issues.

### Custom Automations

These examples show how to configure Claude to act automatically based on GitHub events, without requiring manual @mentions.

#### Supported GitHub Events

This action supports the following GitHub events ([learn more GitHub event triggers](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)):

- `pull_request` - When PRs are opened or synchronized
- `issue_comment` - When comments are created on issues or PRs
- `pull_request_comment` - When comments are made on PR diffs
- `issues` - When issues are opened or assigned
- `pull_request_review` - When PR reviews are submitted
- `pull_request_review_comment` - When comments are made on PR reviews
- `repository_dispatch` - Custom events triggered via API (coming soon)
- `workflow_dispatch` - Manual workflow triggers (coming soon)

#### Automated Documentation Updates

Automatically update documentation when specific files change (see [`examples/claude-pr-path-specific.yml`](./examples/claude-pr-path-specific.yml)):

```yaml
on:
  pull_request:
    paths:
      - "src/api/**/*.ts"

steps:
  - uses: anthropics/claude-code-action@beta
    with:
      direct_prompt: |
        Update the API documentation in README.md to reflect
        the changes made to the API endpoints in this PR.
```

When API files are modified, Claude automatically updates your README with the latest endpoint documentation and pushes the changes back to the PR, keeping your docs in sync with your code.

#### Author-Specific Code Reviews

Automatically review PRs from specific authors or external contributors (see [`examples/claude-review-from-author.yml`](./examples/claude-review-from-author.yml)):

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review-by-author:
    if: |
      github.event.pull_request.user.login == 'developer1' ||
      github.event.pull_request.user.login == 'external-contributor'
    steps:
      - uses: anthropics/claude-code-action@beta
        with:
          direct_prompt: |
            Please provide a thorough review of this pull request.
            Pay extra attention to coding standards, security practices,
            and test coverage since this is from an external contributor.
```

Perfect for automatically reviewing PRs from new team members, external contributors, or specific developers who need extra guidance.

## How It Works

1. **Trigger Detection**: Listens for comments containing the trigger phrase (default: `@claude`) or issue assignment to a specific user
2. **Context Gathering**: Analyzes the PR/issue, comments, code changes
3. **Smart Responses**: Either answers questions or implements changes
4. **Branch Management**: Creates new PRs for human authors, pushes directly for Claude's own PRs
5. **Communication**: Posts updates at every step to keep you informed

This action is built on top of [`anthropics/claude-code-base-action`](https://github.com/anthropics/claude-code-base-action).

## Capabilities and Limitations

### What Claude Can Do

- **Respond in a Single Comment**: Claude operates by updating a single initial comment with progress and results
- **Answer Questions**: Analyze code and provide explanations
- **Implement Code Changes**: Make simple to moderate code changes based on requests
- **Prepare Pull Requests**: Creates commits on a branch and links back to a prefilled PR creation page
- **Perform Code Reviews**: Analyze PR changes and provide detailed feedback
- **Smart Branch Handling**:
  - When triggered on an **issue**: Always creates a new branch for the work
  - When triggered on an **open PR**: Always pushes directly to the existing PR branch
  - When triggered on a **closed PR**: Creates a new branch since the original is no longer active

### What Claude Cannot Do

- **Submit PR Reviews**: Claude cannot submit formal GitHub PR reviews
- **Approve PRs**: For security reasons, Claude cannot approve pull requests
- **Post Multiple Comments**: Claude only acts by updating its initial comment
- **Execute Commands Outside Its Context**: Claude only has access to the repository and PR/issue context it's triggered in
- **Run Arbitrary Bash Commands**: By default, Claude cannot execute Bash commands unless explicitly allowed using the `allowed_tools` configuration
- **View CI/CD Results**: Cannot access CI systems, test results, or build logs unless an additional tool or MCP server is configured
- **Perform Branch Operations**: Cannot merge branches, rebase, or perform other git operations beyond pushing commits

## Advanced Configuration

### Custom Environment Variables

You can pass custom environment variables to Claude Code execution using the `claude_env` input. This is useful for CI/test setups that require specific environment variables:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    claude_env: |
      NODE_ENV: test
      CI: true
      DATABASE_URL: postgres://test:test@localhost:5432/test_db
    # ... other inputs
```

The `claude_env` input accepts YAML format where each line defines a key-value pair. These environment variables will be available to Claude Code during execution, allowing it to run tests, build processes, or other commands that depend on specific environment configurations.

### Custom Tools

By default, Claude only has access to:

- File operations (reading, committing, editing files, read-only git commands)
- Comment management (creating/updating comments)
- Basic GitHub operations

Claude does **not** have access to execute arbitrary Bash commands by default. If you want Claude to run specific commands (e.g., npm install, npm test), you must explicitly allow them using the `allowed_tools` configuration:

**Note**: If your repository has a `.mcp.json` file in the root directory, Claude will automatically detect and use the MCP server tools defined there. However, these tools still need to be explicitly allowed via the `allowed_tools` configuration.

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    allowed_tools: "Bash(npm install),Bash(npm run test),Edit,Replace,NotebookEditCell"
    disallowed_tools: "TaskOutput,KillTask"
    # ... other inputs
```

**Note**: The base GitHub tools are always included. Use `allowed_tools` to add additional tools (including specific Bash commands), and `disallowed_tools` to prevent specific tools from being used.

### Custom Model

Use a specific Claude model:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    # model: "claude-3-5-sonnet-20241022"  # Optional: specify a different model
    # ... other inputs
```

## Cloud Providers

You can authenticate with Claude using any of these three methods:

1. Direct Anthropic API (default)
2. Amazon Bedrock with OIDC authentication
3. Google Vertex AI with OIDC authentication

For detailed setup instructions for AWS Bedrock and Google Vertex AI, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code/github-actions#using-with-aws-bedrock-%26-google-vertex-ai).

**Note**:

- Bedrock and Vertex use OIDC authentication exclusively
- AWS Bedrock automatically uses cross-region inference profiles for certain models
- For cross-region inference profile models, you need to request and be granted access to the Claude models in all regions that the inference profile uses

### Model Configuration

Use provider-specific model names based on your chosen provider:

```yaml
# For direct Anthropic API (default)
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # ... other inputs

# For Amazon Bedrock with OIDC
- uses: anthropics/claude-code-action@beta
  with:
    model: "anthropic.claude-3-7-sonnet-20250219-beta:0" # Cross-region inference
    use_bedrock: "true"
    # ... other inputs

# For Google Vertex AI with OIDC
- uses: anthropics/claude-code-action@beta
  with:
    model: "claude-3-7-sonnet@20250219"
    use_vertex: "true"
    # ... other inputs
```

### OIDC Authentication for Bedrock and Vertex

Both AWS Bedrock and GCP Vertex AI require OIDC authentication.

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

- uses: anthropics/claude-code-action@beta
  with:
    model: "anthropic.claude-3-7-sonnet-20250219-beta:0"
    use_bedrock: "true"
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

- uses: anthropics/claude-code-action@beta
  with:
    model: "claude-3-7-sonnet@20250219"
    use_vertex: "true"
    # ... other inputs

  permissions:
    id-token: write # Required for OIDC
```

## Security

### Access Control

- **Repository Access**: The action can only be triggered by users with write access to the repository
- **No Bot Triggers**: GitHub Apps and bots cannot trigger this action
- **Token Permissions**: The GitHub app receives only a short-lived token scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

### GitHub App Permissions

The [Claude Code GitHub app](https://github.com/apps/claude) requires these permissions:

- **Pull Requests**: Read and write to create PRs and push changes
- **Issues**: Read and write to respond to issues
- **Contents**: Read and write to modify repository files

### Commit Signing

All commits made by Claude through this action are automatically signed with commit signatures. This ensures the authenticity and integrity of commits, providing a verifiable trail of changes made by the action.

### ⚠️ ANTHROPIC_API_KEY Protection

**CRITICAL: Never hardcode your Anthropic API key in workflow files!**

Your ANTHROPIC_API_KEY must always be stored in GitHub secrets to prevent unauthorized access:

```yaml
# CORRECT ✅
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}

# NEVER DO THIS ❌
anthropic_api_key: "sk-ant-api03-..." # Exposed and vulnerable!
```

### Setting Up GitHub Secrets

1. Go to your repository's Settings
2. Click on "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Name: `ANTHROPIC_API_KEY`
5. Value: Your Anthropic API key (starting with `sk-ant-`)
6. Click "Add secret"

### Best Practices for ANTHROPIC_API_KEY

1. ✅ Always use `${{ secrets.ANTHROPIC_API_KEY }}` in workflows
2. ✅ Never commit API keys to version control
3. ✅ Regularly rotate your API keys
4. ✅ Use environment secrets for organization-wide access
5. ❌ Never share API keys in pull requests or issues
6. ❌ Avoid logging workflow variables that might contain keys

## Security Best Practices

**⚠️ IMPORTANT: Never commit API keys directly to your repository! Always use GitHub Actions secrets.**

To securely use your Anthropic API key:

1. Add your API key as a repository secret:

   - Go to your repository's Settings
   - Navigate to "Secrets and variables" → "Actions"
   - Click "New repository secret"
   - Name it `ANTHROPIC_API_KEY`
   - Paste your API key as the value

2. Reference the secret in your workflow:
   ```yaml
   anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

**Never do this:**

```yaml
# ❌ WRONG - Exposes your API key
anthropic_api_key: "sk-ant-..."
```

**Always do this:**

```yaml
# ✅ CORRECT - Uses GitHub secrets
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

This applies to all sensitive values including API keys, access tokens, and credentials.
We also recommend that you always use short-lived tokens when possible

## License

This project is licensed under the MIT License—see the LICENSE file for details.
