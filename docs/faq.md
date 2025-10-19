# Frequently Asked Questions (FAQ)

This FAQ addresses common questions and gotchas when using the Claude Code GitHub Action.

## Triggering and Authentication

### Why doesn't tagging @claude from my automated workflow work?

The `github-actions` user cannot trigger subsequent GitHub Actions workflows. This is a GitHub security feature to prevent infinite loops. To make this work, you need to use a Personal Access Token (PAT) instead, which will act as a regular user, or use a separate app token of your own. When posting a comment on an issue or PR from your workflow, use your PAT instead of the `GITHUB_TOKEN` generated in your workflow.

### Why does Claude say I don't have permission to trigger it?

Only users with **write permissions** to the repository can trigger Claude. This is a security feature to prevent unauthorized use. Make sure the user commenting has at least write access to the repository.

### Why can't I assign @claude to an issue on my repository?

If you're in a public repository, you should be able to assign to Claude without issue. If it's a private organization repository, you can only assign to users in your own organization, which Claude isn't. In this case, you'll need to make a custom user in that case.

### Why am I getting OIDC authentication errors?

If you're using the default GitHub App authentication, you must add the `id-token: write` permission to your workflow:

```yaml
permissions:
  contents: read
  id-token: write # Required for OIDC authentication
```

The OIDC token is required in order for the Claude GitHub app to function. If you wish to not use the GitHub app, you can instead provide a `github_token` input to the action for Claude to operate with. See the [Claude Code permissions documentation][perms] for more.

### Why am I getting '403 Resource not accessible by integration' errors?

This error occurs when the action tries to fetch the authenticated user information using a GitHub App installation token. GitHub App tokens have limited access and cannot access the `/user` endpoint, which causes this 403 error.

**Solution**: The action now includes `bot_id` and `bot_name` inputs that default to Claude's bot credentials. This avoids the need to fetch user information from the API.

For the default claude[bot]:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # bot_id and bot_name have sensible defaults, no need to specify
```

For custom bots, specify both:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    bot_id: "12345678" # Your bot's GitHub user ID
    bot_name: "my-bot" # Your bot's username
```

This issue typically only affects agent/automation mode workflows. Interactive workflows (with @claude mentions) don't encounter this issue as they use the comment author's information.

## Claude's Capabilities and Limitations

### Why won't Claude update workflow files when I ask it to?

The GitHub App for Claude doesn't have workflow write access for security reasons. This prevents Claude from modifying CI/CD configurations that could potentially create unintended consequences. This is something we may reconsider in the future.

### Why won't Claude rebase my branch?

By default, Claude only uses commit tools for non-destructive changes to the branch. Claude is configured to:

- Never push to branches other than where it was invoked (either its own branch or the PR branch)
- Never force push or perform destructive operations

You can grant additional tools via the `claude_args` input if needed:

```yaml
claude_args: |
  --allowedTools "Bash(git rebase:*)"  # Use with caution
```

### Why won't Claude create a pull request?

Claude doesn't create PRs by default. Instead, it pushes commits to a branch and provides a link to a pre-filled PR submission page. This approach ensures your repository's branch protection rules are still adhered to and gives you final control over PR creation.

### Can Claude see my GitHub Actions CI results?

Yes! Claude can access GitHub Actions workflow runs, job logs, and test results on the PR where it's tagged. To enable this:

1. Add `actions: read` permission to your workflow:

   ```yaml
   permissions:
     contents: write
     pull-requests: write
     issues: write
     actions: read
   ```

2. Configure the action with additional permissions:
   ```yaml
   - uses: anthropics/claude-code-action@v1
     with:
       additional_permissions: |
         actions: read
   ```

Claude will then be able to analyze CI failures and help debug workflow issues. For running tests locally before commits, you can still instruct Claude to do so in your request.

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
- uses: actions/checkout@v5
  depth: 0 # will fetch full repo history
```

## Configuration and Tools

### How does automatic mode detection work?

The action intelligently detects whether to run in interactive mode or automation mode:

- **With `prompt` input**: Runs in automation mode - executes immediately without waiting for @claude mentions
- **Without `prompt` input**: Runs in interactive mode - waits for @claude mentions in comments

This automatic detection eliminates the need to manually configure modes.

Example:

```yaml
# Automation mode - runs automatically
prompt: "Review this PR for security vulnerabilities"
# Interactive mode - waits for @claude mention
# (no prompt provided)
```

### What happened to `direct_prompt` and `custom_instructions`?

**These inputs are deprecated in v1.0:**

- **`direct_prompt`** → Use `prompt` instead
- **`custom_instructions`** → Use `claude_args` with `--system-prompt`

Migration examples:

```yaml
# Old (v0.x)
direct_prompt: "Review this PR"
custom_instructions: "Focus on security"

# New (v1.0)
prompt: "Review this PR"
claude_args: |
  --system-prompt "Focus on security"
```

### Why doesn't Claude execute my bash commands?

The Bash tool is **disabled by default** for security. To enable individual bash commands using `claude_args`:

```yaml
claude_args: |
  --allowedTools "Bash(npm:*),Bash(git:*)"  # Allows only npm and git commands
```

### Can Claude work across multiple repositories?

No, Claude's GitHub app token is sandboxed to the current repository only. It cannot push to any other repositories. It can, however, read public repositories, but to get access to this, you must configure it with tools to do so.

### Why aren't comments posted as claude[bot]?

Comments appear as claude[bot] when the action uses its built-in authentication. However, if you provide a `github_token` in your workflow, the action will use that token's authentication instead, causing comments to appear under a different username.

**Solution**: Remove `github_token` from your workflow file unless you're using a custom GitHub App.

**Note**: The `use_sticky_comment` feature only works with claude[bot] authentication. If you're using a custom `github_token`, sticky comments won't update properly since they expect the claude[bot] username.

## MCP Servers and Extended Functionality

### What MCP servers are available by default?

Claude Code Action automatically configures two MCP servers:

1. **GitHub MCP server**: For GitHub API operations
2. **File operations server**: For advanced file manipulation

However, tools from these servers still need to be explicitly allowed via `claude_args` with `--allowedTools`.

## Troubleshooting

### How can I debug what Claude is doing?

Check the GitHub Action log for Claude's run for the full execution trace.

### Why can't I trigger Claude with `@claude-mention` or `claude!`?

The trigger uses word boundaries, so `@claude` must be a complete word. Variations like `@claude-bot`, `@claude!`, or `claude@mention` won't work unless you customize the `trigger_phrase`.

### How can I use custom executables in specialized environments?

For specialized environments like Nix, NixOS, or custom container setups where you need to provide your own executables:

**Using a custom Claude Code executable:**

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    path_to_claude_code_executable: "/path/to/custom/claude"
    # ... other inputs
```

**Using a custom Bun executable:**

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    path_to_bun_executable: "/path/to/custom/bun"
    # ... other inputs
```

**Common use cases:**

- Nix/NixOS environments where packages are managed differently
- Docker containers with pre-installed executables
- Custom build environments with specific version requirements
- Debugging specific issues with particular versions

**Important notes:**

- Using an older Claude Code version may cause problems if the action uses newer features
- Using an incompatible Bun version may cause runtime errors
- The action will skip automatic installation when custom paths are provided
- Ensure the custom executables are available in your GitHub Actions environment

## Best Practices

1. **Always specify permissions explicitly** in your workflow file
2. **Use GitHub Secrets** for API keys - never hardcode them
3. **Be specific with tool permissions** - only enable what's necessary via `claude_args`
4. **Test in a separate branch** before using on important PRs
5. **Monitor Claude's token usage** to avoid hitting API limits
6. **Review Claude's changes** carefully before merging

## Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/anthropics/claude-code-action/issues)
2. Review the [example workflows](https://github.com/anthropics/claude-code-action#examples)

[perms]: https://docs.anthropic.com/en/docs/claude-code/settings#permissions
