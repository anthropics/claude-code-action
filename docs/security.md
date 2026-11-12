# Security

## Access Control

- **Text From Other People**: Triggering a run does not make someone else's text a request. When a maintainer labels or assigns another person's issue, slash commands in its body do not run, but Claude still reads the body to understand the task, so review it first. A pull request's body can also start a run when a maintainer pushes to, reopens or labels it, where `track_progress` is set. Editing or deleting another person's comment or review does not start a run, even with a `prompt`.
- **Repository Access**: The action can only be triggered by users with write access to the repository. This is checked for issue, pull request, comment, and review events, and for `workflow_run` events, where both the workflow actor and the actor that started the upstream run are checked. `workflow_dispatch`, `repository_dispatch`, and `schedule` events are not checked separately — GitHub itself requires write access to dispatch a workflow, and scheduled runs have no external actor.
- **Bot User Control**: By default, GitHub Apps and bots cannot trigger this action for security reasons. Use the `allowed_bots` parameter to enable specific bots or all bots
  - **⚠️ Allowed bots are not checked for repository permissions.** A bot that matches an entry does **not** need to be installed on your repository or have write access. On a **public repository**, external parties — including GitHub Apps created by anyone — may be able to trigger workflow events such as opening issues, commenting, or reviewing pull requests. If your workflow listens on those events and `allowed_bots` is set to `'*'`, any such App can invoke this action with a prompt it controls.
  - On `pull_request` events, a bot's activity does not vouch for the pull request. Before a run starts, its author must also have write access or be an allowed bot.
  - When `allowed_bots` is set, the token stays out of `.git/config` and git gets it from a credential helper that reads `GH_TOKEN`. A later step that uses the `origin` remote to push, or to fetch, pull or update submodules on a private repository, then needs its own credentials. `origin` names the username `x-access-token`, so those must come from `GH_TOKEN`, `GIT_ASKPASS`, a credential saved under that username, or a remote URL the step sets itself. The token is still in Claude's environment.
  - Prefer an explicit list over `'*'`
  - Only list App names you trust
  - If you need `'*'`, scope workflow `permissions:` to the minimum required
- **⚠️ Non-Write User Access (RISKY)**: The `allowed_non_write_users` parameter allows bypassing the write permission requirement. **This is a significant security risk and should only be used for workflows with extremely limited permissions** (e.g., issue labeling workflows that only have `issues: write` permission). This feature:
  - Only works when `github_token` is provided as input (not with GitHub App authentication)
  - Accepts either a comma-separated list of specific usernames or `*` to allow all users
  - **Should be used with extreme caution** as it bypasses the primary security mechanism of this action
  - Is designed for automation workflows where user permissions are already restricted by the workflow's permission scope
  - When set, Claude does a best-effort scrub of Anthropic, cloud, and GitHub Actions secrets from subprocess environments. On Linux runners with bubblewrap available, subprocesses additionally run with PID-namespace isolation. This reduces but does not eliminate prompt injection risk — keep workflow permissions minimal and validate all outputs. Set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: 0` in your workflow or job `env:` block to opt out.
  - Optionally set `CLAUDE_CODE_SCRIPT_CAPS` in your workflow `env:` block to limit how many times Claude can call specific scripts per run. Value is JSON: `{"script-name.sh": maxCalls}`. Example: `CLAUDE_CODE_SCRIPT_CAPS: '{"edit-issue-labels.sh":2}'` allows at most 2 calls to `edit-issue-labels.sh`. Useful for write-capable helper scripts.
  - Runs with this input or `allowed_bots` keep the earlier permission defaults instead of auto mode, so the safety review can't pass a call those defaults deny, unless `claude_args` sets another [permission mode](./usage.md#permission-mode)
  - When using `allowed_non_write_users`, always pass `github_token: ${{ secrets.GITHUB_TOKEN }}`. The auto-generated workflow token is scoped to the job's declared permissions and expires when the job completes. **Do not use a personal access token** — a static token does not rotate between runs and could be partially or fully recovered over time via prompt injection. Restricting allowed tools via `claude_args` reduces the rate of recovery but may not eliminate the risk. We recommend restricting allowed tools (e.g. `claude_args: '--allowedTools "Bash(gh issue view:*)"'`) to the minimum required when using `allowed_non_write_users`.
- **Token Permissions**: The GitHub app receives only a short-lived token scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

## Using this action with `pull_request_target` or `workflow_run`

For `workflow_run` events, the action checks the repository access of the actor that started the upstream run (for example, the author of the fork pull request that triggered your CI workflow) in addition to the workflow actor. When the run came from a fork, it also checks the fork's owner, because GitHub credits a run to whoever caused it, such as a maintainer reopening the pull request. If any of these accounts does not have write access, the action stops before running Claude. To run on `workflow_run` events downstream of pull requests from contributors without write access, add those users to `allowed_non_write_users` and pass `github_token: ${{ secrets.GITHUB_TOKEN }}` — see the notes on that input above and keep the workflow's permissions minimal.

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

When the action runs against a pull request, it restores a fixed list of Claude configuration paths from the PR base branch before starting Claude: `.claude/`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, and `.husky/`. Paths in that list that do not exist on the base branch are removed, and the PR-authored versions are kept under `.claude-pr/` for reference only.

Everything else in the working tree — including `package.json`, lockfiles, `Makefile`, `node_modules/`, and formatter/linter config files — stays at the PR head. If a hook, `apiKeyHelper`, or `statusLine` command in your base-branch `.claude/settings.json` runs a package-manager script (`bun run …`, `npm run …`, `yarn …`, `pnpm run …`), a `make` target, a repo-relative script, or a tool that loads executable project config, that command resolves through files the pull request supplies. Keep such commands self-contained: invoke the tool directly with a pinned version and pass its configuration on the command line (for example `bunx prettier@3.5.3 --no-config --write .` rather than `bun run format`).

Note that the runtime executing the tool also reads project config. `bunx <tool>` runs the tool's script under `node` when `node` is on `PATH` (as it is on GitHub-hosted runners); when only Bun is available, Bun executes the script itself and reads `bunfig.toml` from the checkout — including `preload` entries — which comes from the PR head. On such runners, make sure `node` is on `PATH` for the hook, and treat `bunfig.toml` and `.npmrc` in the checkout as PR-controlled runtime config.

### Running code from pull requests

A command that runs repository code (`npm install`, `bun test`, `make`) runs whatever the checkout contains, in a job that holds your workflow's tokens. Tag mode checks out the pull request's head, so on a pull request from an outside contributor that code is theirs, even when a maintainer triggered the run.

By default, when the pull request's author does not have write access, the action denies commands that commonly run repository code (package managers, test runners, interpreters and shells), even if `claude_args` allows them. Claude can still read and edit files, commit and push. Bots count as authors without write access, even if they are listed in `allowed_bots`, and if the check fails the author is treated the same way. Issues and pull requests from authors with write access are not affected. Runs on `workflow_run`, `workflow_dispatch`, `repository_dispatch` and `schedule` events are not covered, so follow the checkout guidance above if those check out pull request code. On a closed or merged pull request, tag mode works from the base branch rather than the pull request's code, so nothing is denied.

- **This is a list of common commands, not a sandbox.** A rule such as `Bash(./scripts/test.sh)` stays allowed, and the action logs a warning with the number of `Bash` rules in `claude_args` that the list does not cover. Rules in the `settings` input or settings files are not checked. Other ways of writing a command, such as `git --no-pager -c`, may not match the list. Add your own rules with `--disallowedTools` if they can run pull request code.
- **Trust follows the pull request's author.** If someone with write access opens a pull request from another person's branch, or pushes someone else's commits, that code is treated as theirs. Review it before asking Claude to run it.
- **Commands outside the list follow your permission mode.** With `--permission-mode auto`, a command that no rule covers runs only if Claude Code's safety review passes it, which we recommend where it is available. In the modes that ask for approval, such a command is denied, because a workflow has no one to approve it. Either way, a rule in `--allowedTools` skips that decision, so don't rely on the review for commands you allow. If `claude_args` turns off permission checks, for example with `bypassPermissions`, commands outside the list run without approval, and the action logs a warning.
- **Text can still steer Claude.** On an issue or a trusted author's pull request these commands stay allowed, so text from an outside contributor could try to get Claude to edit a file and then run it. Keep the rules you grant in `claude_args` as narrow as you can.
- **Other broad rules weaken the protections.** `Write` lets Claude write outside the workspace, and `Bash(git:*)` can still run programs through forms this list does not deny, such as `git rebase --exec`. Avoid them in workflows that handle outside contributions.

**Upgrading:** workflows that use a floating tag or branch such as `@v1` or `@main` get this behavior without changing anything. If a workflow relied on commands like `npm test` running on pull requests from outside contributors or bots, those commands are now denied. The run still succeeds, so check the log for the warning. Set `restrict_untrusted_prs: false` to turn this off.

### What a session can leave behind

Steps that run after Claude, including post steps such as `actions/checkout`'s cleanup, trust `GITHUB_ENV`, `GITHUB_PATH` and git's config files. When the session ends, the action restores those files, including config pulled in through `include.path`, to how they were before it started, and logs a warning naming any it changed. A session therefore can't pass environment variables to later steps through `GITHUB_ENV`, and `git config` changes it made, such as the upstream that `git push -u` records, don't last. Use `GITHUB_OUTPUT` or `--json-schema` to pass results on.

While Claude runs, and for the action's own git commands afterwards, git ignores `core.fsmonitor`. Git hooks are off for the action's own commits after the session, and from before the checkout on pull requests that `restrict_untrusted_prs` applies to. Git LFS uploads through a hook, so the action uploads objects itself for its own commits, but a push Claude makes on such a pull request won't include them.

This has limits:

- It is not a sandbox. Code running on the runner, for example through an allowed `npm test`, can stop the action before it restores anything, or change the files later steps run, including the code of this and other actions. An allow rule for `Write` can reach those files too, so treat it like allowing code to run.
- A run that is cancelled or times out during the session does not restore anything, and later `always()` and post steps still run.
- Submodule config, a repository checked out to a subdirectory, and an `include.path` target that does not exist yet are not restored.
- The git settings need git 2.31 or newer. On older versions they have no effect.

### `claude-code-action` vs `claude-code-base-action`

`claude-code-base-action` is a lower-level building block that installs and runs Claude Code with the inputs you provide. It does not perform actor permission checks, restrict commands on pull requests from outside contributors, or restore project configuration from the base ref. If you need those behaviors, use this action (`claude-code-action`). See the [base-action README](../base-action/README.md#trust-model) for details.

## Pull Request Creation

In its default configuration, **Claude does not create pull requests automatically** when responding to `@claude` mentions. Instead:

- Claude commits code changes to a new branch, or to the pull request's branch, through wrapper scripts in the action. A deny rule for `git commit` or `git push` in `claude_args` also covers those scripts. A deny rule in a settings file doesn't, so pass it in `claude_args`
- Claude's push command can't update any other branch. For a pull request from a fork, its branch is `pr-N` in your repository, and the fork's branch is not updated
- Branch protection on your default branch is still worth having: a workflow can allow other push commands, and a pull request opened from the default branch has that branch as its own
- Claude provides a **link to the GitHub PR creation page** in its response
- **The user must click the link and create the PR themselves**, ensuring human oversight before any code is proposed for merging

This design ensures that users retain full control over what pull requests are created and can review the changes before initiating the PR workflow.

## ⚠️ Prompt Injection Risks

**Beware of potential hidden markdown when tagging Claude on untrusted content.** External contributors may include hidden instructions through HTML comments, invisible characters, hidden attributes, or other techniques. The action sanitizes content by stripping HTML comments, invisible characters, markdown image alt text, hidden HTML attributes, and HTML entities, but new bypass techniques may emerge. We recommend reviewing the raw content of all input coming from external contributors before allowing Claude to process it.

On public repos, you can also use `include_comments_by_actor` to allowlist which users' comments are passed to Claude, reducing exposure to untrusted input. Use `exclude_comments_by_actor` to filter out noisy bot comments (e.g., `dependabot[bot]`, `renovate[bot]`). If an actor matches both lists, exclusion takes priority. See [Usage](./usage.md) for details.

### Auto mode is a review, not a boundary

By default the action uses [auto mode](./usage.md#permission-mode), where a safety review decides tool calls that your allow rules don't cover. It catches many unsafe actions, but a call can still run if the review passes it. For a strict list of what Claude may run, use `--permission-mode acceptEdits` or `default`.

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

With `prompt`, a run on an issue commits to `issue-N`. A run on a pull request commits to the pull request's branch, or to `pr-N` if that branch isn't known to be in this repository. `issue-N` and `pr-N` start from the base branch. To use another branch, set `CLAUDE_BRANCH` in the step's `env`.

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
