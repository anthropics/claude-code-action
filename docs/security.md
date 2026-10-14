# Security

## Access Control

- **Repository Access**: The action can only be triggered by users with write access to the repository. This is checked for issue, pull request, comment, and review events, and for `workflow_run` events, where both the workflow actor and the actor that started the upstream run are checked. `workflow_dispatch`, `repository_dispatch`, and `schedule` events are not checked separately — GitHub itself requires write access to dispatch a workflow, and scheduled runs have no external actor. `merge_group` events are not checked separately either, because only someone allowed to merge a pull request can add it to a merge queue.
- **Bot User Control**: By default, GitHub Apps and bots cannot trigger this action for security reasons. Use the `allowed_bots` parameter to enable specific bots or all bots
  - **⚠️ Allowed bots are not checked for repository permissions.** A bot that matches an entry does **not** need to be installed on your repository or have write access. On a **public repository**, external parties — including GitHub Apps created by anyone — may be able to trigger workflow events such as opening issues, commenting, or reviewing pull requests. If your workflow listens on those events and `allowed_bots` is set to `'*'`, any such App can invoke this action with a prompt it controls.
  - Prefer an explicit list over `'*'`
  - Only list App names you trust
  - If you need `'*'`, scope workflow `permissions:` to the minimum required
  - On `merge_group` events the actor is whoever queued the pull request. A user account passes, with no write-access check as noted above, and an app that queues pull requests needs an `allowed_bots` entry
- **⚠️ Non-Write User Access (RISKY)**: The `allowed_non_write_users` parameter allows bypassing the write permission requirement. **This is a significant security risk and should only be used for workflows with extremely limited permissions** (e.g., issue labeling workflows that only have `issues: write` permission). This feature:
  - Only works when `github_token` is provided as input (not with GitHub App authentication)
  - Accepts either a comma-separated list of specific usernames or `*` to allow all users
  - **Should be used with extreme caution** as it bypasses the primary security mechanism of this action
  - Is designed for automation workflows where user permissions are already restricted by the workflow's permission scope
  - When set, Claude does a best-effort scrub of Anthropic, cloud, and GitHub Actions secrets from subprocess environments. On Linux runners with bubblewrap available, subprocesses additionally run with PID-namespace isolation. This reduces but does not eliminate prompt injection risk — keep workflow permissions minimal and validate all outputs. Set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 0` in your workflow or job `env:` block to opt out.
  - Optionally set `CLAUDE_CODE_SCRIPT_CAPS` in your workflow `env:` block to limit how many times Claude can call specific scripts per run. Value is JSON: `{"script-name.sh": maxCalls}`. Example: `CLAUDE_CODE_SCRIPT_CAPS: '{"edit-issue-labels.sh":2}'` allows at most 2 calls to `edit-issue-labels.sh`. Useful for write-capable helper scripts.
  - When using `allowed_non_write_users`, always pass `github_token: ${{ secrets.GITHUB_TOKEN }}`. The auto-generated workflow token is scoped to the job's declared permissions and expires when the job completes. **Do not use a personal access token** — a static token does not rotate between runs and could be partially or fully recovered over time via prompt injection. Restricting allowed tools via `claude_args` reduces the rate of recovery but may not eliminate the risk. We recommend restricting allowed tools (e.g. `claude_args: '--allowedTools "Bash(gh issue view:*)"'`) to the minimum required when using `allowed_non_write_users`.
- **Token Permissions**: The GitHub app receives only a short-lived token scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

## Using this action with `pull_request_target` or `workflow_run`

For `workflow_run` events, the action checks the repository access of the actor that started the upstream run (for example, the author of the fork pull request that triggered your CI workflow) in addition to the workflow actor. If that actor does not have write access, the action stops before running Claude. To run on `workflow_run` events downstream of pull requests from contributors without write access, add those users to `allowed_non_write_users` and pass `github_token: ${{ secrets.GITHUB_TOKEN }}` — see the notes on that input above and keep the workflow's permissions minimal.

`pull_request_target` and `workflow_run` execute with the **base repository's secrets**. If your workflow checks out the PR head (`ref: ${{ github.event.pull_request.head.sha }}` for `pull_request_target`, `ref: ${{ github.event.workflow_run.head_sha }}` for `workflow_run`) into `$GITHUB_WORKSPACE` before this action, the action and Claude run with that checkout as the working directory.

**Do not check out an untrusted ref into the workspace root before this action.** Use one of these patterns instead:

```yaml
# Preferred — check out the base ref (default).
- uses: actions/checkout@v6 # no `ref:` → base branch
- uses: anthropics/claude-code-action@v1
```

```yaml
# If you need the PR's files locally — check out the base ref at the workspace
# root (this action expects a git repo there), then check out the head ref into
# a subdirectory and pass it via --add-dir.
- uses: actions/checkout@v6 # no `ref:` → base branch at workspace root
- uses: actions/checkout@v6
  with:
    # For workflow_run use: ${{ github.event.workflow_run.head_sha }}
    ref: ${{ github.event.pull_request.head.sha }}
    path: pr-head
- uses: anthropics/claude-code-action@v1
  with:
    claude_args: "--add-dir pr-head"
```

This is general guidance for these event types — see [GitHub's documentation](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/).

### Which files come from the base branch on pull requests

When the action runs against a pull request, it restores a fixed list of Claude configuration paths from the PR base branch before starting Claude. It does the same for a `merge_group` event, restoring from the branch the merge group targets, since the merge group commit contains the queued pull requests' changes. The paths are `.claude/`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, and `.husky/`. Paths in that list that do not exist on the base branch are removed, and the PR-authored versions are kept under `.claude-pr/` for reference only.

Everything else in the working tree — including `package.json`, lockfiles, `Makefile`, `node_modules/`, and formatter/linter config files — stays at the PR head. If a hook, `apiKeyHelper`, or `statusLine` command in your base-branch `.claude/settings.json` runs a package-manager script (`bun run …`, `npm run …`, `yarn …`, `pnpm run …`), a `make` target, a repo-relative script, or a tool that loads executable project config, that command resolves through files the pull request supplies. Keep such commands self-contained: invoke the tool directly with a pinned version and pass its configuration on the command line (for example `bunx prettier@3.5.3 --no-config --write .` rather than `bun run format`).

Note that the runtime executing the tool also reads project config. `bunx <tool>` runs the tool's script under `node` when `node` is on `PATH` (as it is on GitHub-hosted runners); when only Bun is available, Bun executes the script itself and reads `bunfig.toml` from the checkout — including `preload` entries — which comes from the PR head. On such runners, make sure `node` is on `PATH` for the hook, and treat `bunfig.toml` and `.npmrc` in the checkout as PR-controlled runtime config.

### `claude-code-action` vs `claude-code-base-action`

`claude-code-base-action` is a lower-level building block that installs and runs Claude Code with the inputs you provide. It does not perform actor permission checks or restore project configuration from the base ref. If you need those behaviors, use this action (`claude-code-action`). See the [base-action README](../base-action/README.md#trust-model) for details.

## Using this action with `merge_group`

`merge_group` runs have the base repository's secrets, and `actions/checkout` with no `ref` checks out the merge group commit, which contains the queued pull requests' changes. Someone allowed to merge approved those changes by queueing them, but if your queue accepts pull requests from forks, treat that code as untrusted input to Claude:

- **Token**: Pass `github_token: ${{ secrets.GITHUB_TOKEN }}` with a minimal `permissions:` block. Without `github_token` the action uses the Claude GitHub App's token, which the job's `permissions:` does not limit. The action stores the token in the workspace's `.git/config`, where Claude's file tools can read it, so treat whatever the token can do as within reach of the queued content
- **Tools**: `--allowedTools` only pre-approves tools, and whether the others can run depends on the session's permission mode. Pass `--tools` with the tools the check needs to remove the rest, and `--restricted` to keep the file tools inside the workspace
- **Bash**: If the check needs Bash, also set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 1` in the job's `env:`. The scrub needs `bubblewrap` and `socat` on the runner: without `bubblewrap` Claude Code exits at startup, and without `socat` every Bash call fails. The action turns the scrub on and installs both by itself only when `allowed_non_write_users` is set, so otherwise install them in a step before the action, the way the `Install subprocess isolation dependencies` step in [`action.yml`](../action.yml) does
- **Output**: Whatever the workflow prints from Claude's output is visible to everyone who can read the run's logs, and GitHub masks only exact secret values
- **The workflow file**: GitHub reads the workflow itself from the merge group commit, so a queued pull request that edits it runs its own version, with the same secrets, and can change or remove the step that fails the check. Nothing in the action can prevent that. Protect `.github/workflows/` with CODEOWNERS or branch protection so that workflow edits get a trusted review

The `no ref: → base branch` comments in the patterns for `pull_request_target` and `workflow_run` do not hold here, because the default checkout is the merge group itself. [`examples/merge-queue-check.yml`](../examples/merge-queue-check.yml) checks it out at the workspace root and relies on a read-only token and on `--tools`, `--restricted` and `--strict-mcp-config`.

With those flags Claude Code loads no project settings, `.mcp.json`, `CLAUDE.md` or skills at all, the target branch's own included. A check that needs them depends instead on the action restoring [its configuration files from the target branch](#which-files-come-from-the-base-branch-on-pull-requests), and two limits of that restore matter for merge groups as they do for pull requests:

- A hook, `apiKeyHelper`, or `statusLine` command in the target branch's `.claude/settings.json`, or a server command in its `.mcp.json`, runs outside the allowed tools, and if it calls a package script or a repo-relative script it runs what the queued pull requests supply. Checking out `${{ github.event.merge_group.base_ref }}` at the workspace root and `${{ github.event.merge_group.head_sha }}` into a subdirectory passed with `--add-dir` avoids that
- The restore covers only the listed paths at the workspace root. In either layout Claude Code still loads `CLAUDE.md`, `.claude/rules/` and `.claude/skills/` from other directories once Claude reads a file there, so queued content can reach Claude as instructions. Pass `--setting-sources user` to load none of them, which also skips the target branch's own `CLAUDE.md` and `.claude/`

## Pull Request Creation

In its default configuration, **Claude does not create pull requests automatically** when responding to `@claude` mentions. Instead:

- Claude commits code changes to a new branch
- Claude provides a **link to the GitHub PR creation page** in its response
- **The user must click the link and create the PR themselves**, ensuring human oversight before any code is proposed for merging

This design ensures that users retain full control over what pull requests are created and can review the changes before initiating the PR workflow.

## ⚠️ Prompt Injection Risks

**Beware of potential hidden markdown when tagging Claude on untrusted content.** External contributors may include hidden instructions through HTML comments, invisible characters, hidden attributes, or other techniques. The action sanitizes content by stripping HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities, but new bypass techniques may emerge. We recommend reviewing the raw content of all input coming from external contributors before allowing Claude to process it.

On public repos, you can also use `include_comments_by_actor` to allowlist which users' comments are passed to Claude, reducing exposure to untrusted input. Use `exclude_comments_by_actor` to filter out noisy bot comments (e.g., `dependabot[bot]`, `renovate[bot]`). If an actor matches both lists, exclusion takes priority. See [Usage](./usage.md) for details.

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
