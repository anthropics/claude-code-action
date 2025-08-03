# Setup Guide

## Manual Setup (Direct API)

**Requirements**: You must be a repository admin to complete these steps.

1. Install the Claude GitHub app to your repository: https://github.com/apps/claude
2. Add authentication to your repository secrets ([Learn how to use secrets in GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)):
   - Either `ANTHROPIC_API_KEY` for API key authentication
   - Or `CLAUDE_CODE_OAUTH_TOKEN` for OAuth token authentication (Pro and Max users can generate this by running `claude setup-token` locally)
3. Copy the workflow file from [`examples/claude.yml`](../examples/claude.yml) into your repository's `.github/workflows/`

## Using a Custom GitHub App

If you prefer not to install the official Claude app, you can create your own GitHub App to use with this action. This gives you complete control over permissions and access.

**When you may want to use a custom GitHub App:**

- You need more restrictive permissions than the official app
- Organization policies prevent installing third-party apps
- You're using AWS Bedrock or Google Vertex AI

**Steps to create and use a custom GitHub App:**

1. **Create a new GitHub App:**

   - Go to https://github.com/settings/apps (for personal apps) or your organization's settings
   - Click "New GitHub App"
   - Configure the app with these minimum permissions:
     - **Repository permissions:**
       - Contents: Read & Write
       - Issues: Read & Write
       - Pull requests: Read & Write
     - **Account permissions:** None required
   - Set "Where can this GitHub App be installed?" to your preference
   - Create the app

2. **Generate and download a private key:**

   - After creating the app, scroll down to "Private keys"
   - Click "Generate a private key"
   - Download the `.pem` file (keep this secure!)

3. **Install the app on your repository:**

   - Go to the app's settings page
   - Click "Install App"
   - Select the repositories where you want to use Claude

4. **Add the app credentials to your repository secrets:**

   - Go to your repository's Settings → Secrets and variables → Actions
   - Add these secrets:
     - `APP_ID`: Your GitHub App's ID (found in the app settings)
     - `APP_PRIVATE_KEY`: The contents of the downloaded `.pem` file

5. **Update your workflow to use the custom app:**

   ```yaml
   name: Claude with Custom App
   on:
     issue_comment:
       types: [created]
     # ... other triggers

   jobs:
     claude-response:
       runs-on: ubuntu-latest
       steps:
         # Generate a token from your custom app
         - name: Generate GitHub App token
           id: app-token
           uses: actions/create-github-app-token@v1
           with:
             app-id: ${{ secrets.APP_ID }}
             private-key: ${{ secrets.APP_PRIVATE_KEY }}

         # Use Claude with your custom app's token
         - uses: anthropics/claude-code-action@beta
           with:
             anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
             github_token: ${{ steps.app-token.outputs.token }}
             # ... other configuration
   ```

**Important notes:**

- The custom app must have read/write permissions for Issues, Pull Requests, and Contents
- Your app's token will have the exact permissions you configured, nothing more

For more information on creating GitHub Apps, see the [GitHub documentation](https://docs.github.com/en/apps/creating-github-apps).

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

## Setting Up GitHub Secrets

1. Go to your repository's Settings
2. Click on "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. For authentication, choose one:
   - API Key: Name: `ANTHROPIC_API_KEY`, Value: Your Anthropic API key (starting with `sk-ant-`)
   - OAuth Token: Name: `CLAUDE_CODE_OAUTH_TOKEN`, Value: Your Claude Code OAuth token (Pro and Max users can generate this by running `claude setup-token` locally)
5. Click "Add secret"

### Best Practices for Authentication

1. ✅ Always use `${{ secrets.ANTHROPIC_API_KEY }}` or `${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` in workflows
2. ✅ Never commit API keys or tokens to version control
3. ✅ Regularly rotate your API keys and tokens
4. ✅ Use environment secrets for organization-wide access
5. ❌ Never share API keys or tokens in pull requests or issues
6. ❌ Avoid logging workflow variables that might contain keys
