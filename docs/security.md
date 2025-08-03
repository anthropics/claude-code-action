# Security

## Access Control

- **Repository Access**: The action can only be triggered by users with write access to the repository
- **No Bot Triggers**: GitHub Apps and bots cannot trigger this action
- **Token Permissions**: The GitHub app receives only a short-lived token scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

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
