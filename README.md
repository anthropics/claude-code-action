# Gemini CLI GitHub Action

A general-purpose Gemini CLI action for GitHub PRs and issues that can answer questions and implement code changes. This action listens for a trigger phrase in comments and activates Gemini to act on the request. It supports Google Gemini API and Google Vertex AI.

## Features

- 🤖 **Interactive Code Assistant**: Gemini can answer questions about code, architecture, and programming
- 🔍 **Code Review**: Analyzes PR changes and suggests improvements
- ✨ **Code Implementation**: Can implement simple fixes, refactoring, and even new features
- 💬 **PR/Issue Integration**: Works seamlessly with GitHub comments and PR reviews
- 🛠️ **Flexible Tool Access**: Access to GitHub APIs and file operations (additional tools can be enabled via configuration)
- 📋 **Progress Tracking**: Visual progress indicators with checkboxes that dynamically update as Gemini completes tasks
- 🏃 **Runs on Your Infrastructure**: The action executes entirely on your own GitHub runner (Gemini API calls go to your chosen provider)

## Quickstart

### Manual Setup (Direct API)

**Requirements**: You must be a repository admin to complete these steps.

1. Add `GEMINI_API_KEY` to your repository secrets ([Learn how to use secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions))
2. Copy the workflow file from [`examples/gemini.yml`](./examples/gemini.yml) into your repository's `.github/workflows/`

## 📚 FAQ

Having issues or questions? Check out our [Frequently Asked Questions](./FAQ.md) for solutions to common problems and detailed explanations of Gemini's capabilities and limitations.

## Usage

Add a workflow file to your repository (e.g., `.github/workflows/gemini.yml`):

```yaml
name: Gemini Assistant
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request_review:
    types: [submitted, edited]
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  gemini:
    if: github.actor != 'gemini[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      pull-requests: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: masahif/gemini-cli-action@main
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Usage

Comment `@gemini` on any issue or PR to get AI assistance!

## Configuration

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `trigger_phrase` | Phrase to trigger the action | No | `@gemini` |
| `assignee_trigger` | Username that triggers when assigned | No | - |
| `label_trigger` | Label that triggers the action | No | `gemini` |
| `base_branch` | Base branch for new branches | No | Default branch |
| `branch_prefix` | Prefix for created branches | No | `gemini/` |
| `model` | Gemini model to use | No | `gemini-2.5-pro` |
| `allowed_tools` | Additional tools to enable | No | - |
| `disallowed_tools` | Tools to disable | No | - |
| `custom_instructions` | Additional AI instructions | No | - |
| `direct_prompt` | Direct instruction (bypasses triggers) | No | - |
| `mcp_config` | MCP server configuration | No | - |
| `gemini_env` | Environment variables for Gemini | No | - |
| `gemini_api_key` | Gemini API key | No | - |
| `github_token` | GitHub token | No | `${{ github.token }}` |
| `use_vertex` | Use Vertex AI instead of direct API | No | `false` |
| `max_turns` | Maximum conversation turns | No | `10` |
| `timeout_minutes` | Execution timeout | No | `30` |

### Outputs

| Output | Description |
|--------|-------------|
| `execution_file` | Path to execution output file |

## Examples

### Basic Code Review

```yaml
- name: Gemini Code Review
  uses: masahif/gemini-cli-action@main
  with:
    gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    trigger_phrase: "@gemini review"
```

### Custom Instructions

```yaml
- name: Gemini with Custom Rules
  uses: masahif/gemini-cli-action@main
  with:
    gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    custom_instructions: |
      - Always use TypeScript
      - Follow company coding standards
      - Include comprehensive tests
```

### Vertex AI Configuration

```yaml
- name: Gemini with Vertex AI
  uses: masahif/gemini-cli-action@main
  with:
    use_vertex: true
    github_token: ${{ secrets.GITHUB_TOKEN }}
  env:
    GOOGLE_CLOUD_PROJECT: ${{ secrets.GCP_PROJECT }}
    GOOGLE_CLOUD_LOCATION: "us-central1"
    GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_CREDENTIALS }}
```

## Security & Permissions

### Required Permissions

```yaml
permissions:
  contents: read       # Read repository content
  issues: read         # Read issues
  pull-requests: read  # Read PRs
  id-token: write      # For OIDC authentication
```

### Security Features

- **Input Validation**: All inputs are validated and sanitized
- **Permission Checks**: Verifies write access before making changes
- **Content Filtering**: Removes sensitive information from outputs
- **Actor Validation**: Prevents bot-to-bot interactions
- **Rate Limiting**: Built-in timeout and turn limits

## Troubleshooting

### Common Issues

#### Authentication Errors
```
Error: Gemini API key is required
```
**Solution**: Ensure `GEMINI_API_KEY` is set in GitHub Secrets.

#### Permission Denied
```
Error: Write permissions required
```
**Solution**: Add required permissions to your workflow file.

#### Trigger Not Working
```
No response from @gemini comment
```
**Solutions**:
- Check trigger phrase matches configuration
- Verify the action runs on the correct events
- Ensure the commenting user has repository access

### Getting Help

1. Check the [action logs](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs) for detailed error information
2. Review the [GitHub Actions documentation](https://docs.github.com/en/actions)
3. Open an issue in this repository for bugs or feature requests

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on development setup, code standards, and submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) - The underlying CLI tool
- [Claude Code Action](https://github.com/anthropics/claude-code-action) - Architectural inspiration
- [GitHub Actions](https://github.com/actions) - Platform and tooling