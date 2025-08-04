# Experimental Features

**Note:** Experimental features are considered unstable and not supported for production use. They may change or be removed at any time.

## Execution Modes

The action supports three execution modes, each optimized for different use cases:

### Tag Mode (Default)

The traditional implementation mode that responds to @claude mentions, issue assignments, or labels.

- **Triggers**: `@claude` mentions, issue assignment, label application
- **Features**: Creates tracking comments with progress checkboxes, full implementation capabilities
- **Use case**: General-purpose code implementation and Q&A

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # mode: tag is the default
```

### Agent Mode

**Note: Agent mode is currently in active development and may undergo breaking changes.**

For automation with workflow_dispatch and scheduled events only.

- **Triggers**: Only works with `workflow_dispatch` and `schedule` events - does NOT work with PR/issue events
- **Features**: Perfect for scheduled tasks, works with `override_prompt`
- **Use case**: Maintenance tasks, automated reporting, scheduled checks

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    mode: agent
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    override_prompt: |
      Check for outdated dependencies and create an issue if any are found.
```

### Experimental Review Mode

**Warning: This is an experimental feature that may change or be removed at any time.**

For automated code reviews on pull requests.

- **Triggers**: Pull request events (`opened`, `synchronize`) or `@claude review` comments
- **Features**: Provides detailed code reviews with inline comments and suggestions
- **Use case**: Automated PR reviews, code quality checks

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    mode: experimental-review
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    custom_instructions: |
      Focus on code quality, security, and best practices.
```

See [`examples/claude-modes.yml`](../examples/claude-modes.yml) and [`examples/claude-experimental-review-mode.yml`](../examples/claude-experimental-review-mode.yml) for complete examples of each mode.

## Network Restrictions

For enhanced security, you can restrict Claude's network access to specific domains only. This feature is particularly useful for:

- Enterprise environments with strict security policies
- Preventing access to external services
- Limiting Claude to only your internal APIs and services

When `experimental_allowed_domains` is set, Claude can only access the domains you explicitly list. You'll need to include the appropriate provider domains based on your authentication method.

### Provider-Specific Examples

#### If using Anthropic API or subscription

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # Or: claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    experimental_allowed_domains: |
      .anthropic.com
```

#### If using AWS Bedrock

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    use_bedrock: "true"
    experimental_allowed_domains: |
      bedrock.*.amazonaws.com
      bedrock-runtime.*.amazonaws.com
```

#### If using Google Vertex AI

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    use_vertex: "true"
    experimental_allowed_domains: |
      *.googleapis.com
      vertexai.googleapis.com
```

### Common GitHub Domains

In addition to your provider domains, you may need to include GitHub-related domains. For GitHub.com users, common domains include:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    experimental_allowed_domains: |
      .anthropic.com  # For Anthropic API
      .github.com
      .githubusercontent.com
      ghcr.io
      .blob.core.windows.net
```

For GitHub Enterprise users, replace the GitHub.com domains above with your enterprise domains (e.g., `.github.company.com`, `packages.company.com`, etc.).

To determine which domains your workflow needs, you can temporarily run without restrictions and monitor the network requests, or check your GitHub Enterprise configuration for the specific services you use.
