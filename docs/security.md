# Security

## Access Control

- **Repository Access**: The action can only be triggered by users with write access to the repository
- **Bot User Control**: By default, GitHub Apps and bots cannot trigger this action for security reasons. Use the `allowed_bots` parameter to enable specific bots or all bots
- **⚠️ Non-Write User Access (RISKY)**: The `allowed_non_write_users` parameter allows bypassing the write permission requirement. **This is a significant security risk and should only be used for workflows with extremely limited permissions** (e.g., issue labeling workflows that only have `issues: write` permission). This feature:
  - Only works when `github_token` is provided as input (not with GitHub App authentication)
  - Accepts either a comma-separated list of specific usernames or `*` to allow all users
  - **Should be used with extreme caution** as it bypasses the primary security mechanism of this action
  - Is designed for automation workflows where user permissions are already restricted by the workflow's permission scope
- **Token Permissions**: The GitHub app receives only a short-lived token scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

## Pull Request Creation

In its default configuration, **Claude does not create pull requests automatically** when responding to `@claude` mentions. Instead:

- Claude commits code changes to a new branch
- Claude provides a **link to the GitHub PR creation page** in its response
- **The user must click the link and create the PR themselves**, ensuring human oversight before any code is proposed for merging

This design ensures that users retain full control over what pull requests are created and can review the changes before initiating the PR workflow.

## ⚠️ Prompt Injection Risks

**Beware of potential hidden markdown when tagging Claude on untrusted content.** External contributors may include hidden instructions through HTML comments, invisible characters, hidden attributes, or other techniques. The action sanitizes content by stripping HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities, but new bypass techniques may emerge. We recommend reviewing the raw content of all input coming from external contributors before allowing Claude to process it.

## GitHub App Permissions

The [Claude Code GitHub app](https://github.com/apps/claude) requests the following permissions:

### Currently Used Permissions

- **Contents** (Read & Write): For reading repository files and creating branches
- **Pull Requests** (Read & Write): For reading PR data and creating/updating pull requests
- **Issues** (Read & Write): For reading issue data and updating issue comments

### Permissions for Future Features

The following permissions are requested but not yet actively used. These will enable planned features in future releases:

- **Discussions** (Read & Write): For interaction with GitHub Discussions
- **Actions** (Read): For accessing workflow run data and logs
- **Checks** (Read): For reading check run results
- **Workflows** (Read & Write): For triggering and managing GitHub Actions workflows

## Commit Signing

By default, commits made by Claude are unsigned. You can enable commit signing using one of two methods:

### Option 1: GitHub API Commit Signing (use_commit_signing)

This uses GitHub's API to create commits, which automatically signs them as verified from the GitHub App:

```yaml
- uses: anthropics/claude-code-action@main
  with:
    use_commit_signing: true
```

This is the simplest option and requires no additional setup. However, because it uses the GitHub API instead of git CLI, it cannot perform complex git operations like rebasing, cherry-picking, or interactive history manipulation.

### Option 2: SSH Signing Key (ssh_signing_key)

This uses an SSH key to sign commits via git CLI. Use this option when you need both signed commits AND standard git operations (rebasing, cherry-picking, etc.):

```yaml
- uses: anthropics/claude-code-action@main
  with:
    ssh_signing_key: ${{ secrets.SSH_SIGNING_KEY }}
    bot_id: "YOUR_GITHUB_USER_ID"
    bot_name: "YOUR_GITHUB_USERNAME"
```

Commits will show as verified and attributed to the GitHub account that owns the signing key.

**Setup steps:**

1. Generate an SSH key pair for signing:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/signing_key -N "" -C "commit signing key"
   ```

2. Add the **public key** to your GitHub account:

   - Go to GitHub → Settings → SSH and GPG keys
   - Click "New SSH key"
   - Select **Key type: Signing Key** (important)
   - Paste the contents of `~/.ssh/signing_key.pub`

3. Add the **private key** to your repository secrets:

   - Go to your repo → Settings → Secrets and variables → Actions
   - Create a new secret named `SSH_SIGNING_KEY`
   - Paste the contents of `~/.ssh/signing_key`

4. Get your GitHub user ID:

   ```bash
   gh api users/YOUR_USERNAME --jq '.id'
   ```

5. Update your workflow with `bot_id` and `bot_name` matching the account where you added the signing key.

**Note:** If both `ssh_signing_key` and `use_commit_signing` are provided, `ssh_signing_key` takes precedence.

## ⚠️ Authentication Protection

**CRITICAL: Never hardcode your Anthropic API key or OAuth token in workflow files!**

Your authentication credentials must always be stored in GitHub secrets to prevent unauthorized access:

```yaml
# CORRECT ✅
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
# OR
claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

# NEVER DO THIS ❌
anthropic_api_key: "sk-ant-api03-..." # Exposed and vulnerable!
claude_code_oauth_token: "oauth_token_..." # Exposed and vulnerable!
```

## ⚠️ Full Output Security Warning

The `show_full_output` option is **disabled by default** for security reasons. When enabled, it outputs ALL Claude Code messages including:

- Full outputs from tool executions (e.g., `ps`, `env`, file reads)
- API responses that may contain tokens or credentials
- File contents that may include secrets
- Command outputs that may expose sensitive system information

**These logs are publicly visible in GitHub Actions for public repositories!**

### Automatic Enabling in Debug Mode

Full output is **automatically enabled** when GitHub Actions debug mode is active (when `ACTIONS_STEP_DEBUG` secret is set to `true`). This helps with debugging but carries the same security risks.

### When to Enable Full Output

Only enable `show_full_output: true` or GitHub Actions debug mode when:

- Working in a private repository with controlled access
- Debugging issues in a non-production environment
- You have verified no secrets will be exposed in the output
- You understand the security implications

### Recommended Practice

For debugging, prefer using `show_full_output: false` (the default) and rely on Claude Code's sanitized output, which shows only essential information like errors and completion status without exposing sensitive data.
