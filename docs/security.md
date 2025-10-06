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

## ⚠️ Prompt Injection Risks

**Beware of potential hidden markdown when tagging Claude on untrusted content.** External contributors may include hidden instructions through HTML comments, invisible characters, hidden attributes, or other techniques. The action sanitizes content by stripping HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities, but new bypass techniques may emerge. We recommend reviewing the raw content of all input coming from external contributors before allowing Claude to process it.  

## GitHub App Permissions

The [Claude Code GitHub app](https://github.com/apps/claude) requires these permissions:

- **Pull Requests**: Read and write to create PRs and push changes
- **Issues**: Read and write to respond to issues
- **Contents**: Read and write to modify repository files

## Commit Signing

All commits made by Claude through this action are automatically signed with commit signatures. This ensures the authenticity and integrity of commits, providing a verifiable trail of changes made by the action.

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
