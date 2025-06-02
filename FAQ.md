# Frequently Asked Questions (FAQ)

This FAQ addresses common questions and gotchas when using the Claude Code GitHub Action.

## Triggering and Authentication

### Why doesn't tagging @claude from my automated workflow work?

The `github-actions` user cannot trigger subsequent GitHub Actions workflows. This is a GitHub security feature to prevent infinite loops. To make this work, you need to use a Personal Access Token (PAT) instead, which will act as a regular user, or use a separate app token of your own. When posting a comment on an issue or PR from your workflow, use your PAT instead of the `GITHUB_TOKEN` generated in your workflow.

### Why does Claude say I don't have permission to trigger it?

Only users with **write permissions** to the repository can trigger Claude. This is a security feature to prevent unauthorized use. Make sure the user commenting has at least write access to the repository.

### Why am I getting OIDC authentication errors?

If you're using the default GitHub App authentication, you must add the `id-token: write` permission to your workflow:

```yaml
permissions:
  contents: read
  id-token: write # Required for OIDC authentication
```

The OIDC token is required in order for the Claude GitHub app to function. If you wish to not use the GitHub app, you can instead provide a `github_token` input to the action for Claude to operate with. See the [Claude Code permissions documentation][perms] for more.

## Claude's Capabilities and Limitations

### Why won't Claude update workflow files when I ask it to?

The GitHub App for Claude doesn't have workflow write access for security reasons. This prevents Claude from modifying CI/CD configurations that could potentially create unintended consequences. This is something we may reconsider in the future.

### Why won't Claude rebase my branch?

By default, Claude only uses commit tools for non-destructive changes to the branch. Claude is configured to:

- Never push to branches other than where it was invoked (either its own branch or the PR branch)
- Never force push or perform destructive operations

You can grant additional tools via the `allowed_tools` input if needed:

```yaml
allowed_tools: "Bash(git rebase:*)" # Use with caution
```

### Why won't Claude create a pull request?

Claude doesn't create PRs by default. Instead, it pushes commits to a branch and provides a link to a pre-filled PR submission page. This approach ensures your repository's branch protection rules are still adhered to and gives you final control over PR creation.

### Why can't Claude run my tests or see CI results?

Claude cannot access GitHub Actions logs, test results, or other CI/CD outputs by default. It only has access to the repository files. If you need Claude to see test results, you can either:

1. Instruct Claude to run tests before making commits
2. Copy and paste CI results into a comment for Claude to analyze

This limitation exists for security reasons but may be reconsidered in the future based on user feedback.

### Why does Claude only update one comment instead of creating new ones?

Claude is configured to update a single comment to avoid cluttering PR/issue discussions. All of Claude's responses, including progress updates and final results, will appear in the same comment with checkboxes showing task progress.

## Branch and Commit Behavior

### Why did Claude create a new branch when commenting on a closed PR?

Claude's branch behavior depends on the context:

- **Open PRs**: Pushes directly to the existing PR branch
- **Closed/Merged PRs**: Creates a new branch (cannot push to closed PR branches)
- **Issues**: Always creates a new branch with a timestamp

### Why are my commits shallow/missing history?

For performance, Claude uses shallow clones:

- PRs: `--depth=20` (last 20 commits)
- New branches: `--depth=1` (single commit)

If you need full history, you can configure this in your workflow before calling Claude in the `actions/checkout` step.

```
- uses: actions/checkout@v4
  depth: 0 # will fetch full repo history
```

## Configuration and Tools

### What's the difference between `direct_prompt` and `custom_instructions`?

These inputs serve different purposes in how Claude responds:

- **`direct_prompt`**: Bypasses trigger detection entirely. When provided, Claude executes this exact instruction regardless of comments or mentions. Perfect for automated workflows where you want Claude to perform a specific task on every run (e.g., "Update the API documentation based on changes in this PR").

- **`custom_instructions`**: Additional context added to Claude's system prompt while still respecting normal triggers. These instructions modify Claude's behavior but don't replace the triggering comment. Use this to give Claude standing instructions like "You have been granted additional tools for ...".

Example:

```yaml
# Using direct_prompt - runs automatically without @claude mention
direct_prompt: "Review this PR for security vulnerabilities"

# Using custom_instructions - still requires @claude trigger
custom_instructions: "Focus on performance implications and suggest optimizations"
```

### Why doesn't Claude execute my bash commands?

The Bash tool is **disabled by default** for security. To enable individual bash commands:

```yaml
allowed_tools: "Bash(npm:*),Bash(git:*)" # Allows only npm and git commands
```

### Can Claude work across multiple repositories?

No, Claude's GitHub app token is sandboxed to the current repository only. It cannot push to any other repositories. It can, however, read public repositories, but to get access to this, you must configure it with tools to do so.

## MCP Servers and Extended Functionality

### What MCP servers are available by default?

Claude Code Action automatically configures two MCP servers:

1. **GitHub MCP server**: For GitHub API operations
2. **File operations server**: For advanced file manipulation

However, tools from these servers still need to be explicitly allowed via `allowed_tools`.

## Troubleshooting

### How can I debug what Claude is doing?

Check the GitHub Action log for Claude's run for the full execution trace.

### Why can't I trigger Claude with `@claude-mention` or `claude!`?

The trigger uses word boundaries, so `@claude` must be a complete word. Variations like `@claude-bot`, `@claude!`, or `claude@mention` won't work unless you customize the `trigger_phrase`.

## Best Practices

1. **Always specify permissions explicitly** in your workflow file
2. **Use GitHub Secrets** for API keys - never hardcode them
3. **Be specific with `allowed_tools`** - only enable what's necessary
4. **Test in a separate branch** before using on important PRs
5. **Monitor Claude's token usage** to avoid hitting API limits
6. **Review Claude's changes** carefully before merging

## Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/anthropics/claude-code-action/issues)
2. Review the [example workflows](https://github.com/anthropics/claude-code-action#examples)

[perms]: https://docs.anthropic.com/en/docs/claude-code/settings#permissions
