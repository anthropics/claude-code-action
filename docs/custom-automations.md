# Custom Automations

These examples show how to configure Claude to act automatically based on GitHub events. When you provide a `prompt` input, the action automatically runs in agent mode without requiring manual @mentions. Without a `prompt`, it runs in interactive mode, responding to @claude mentions.

## Mode Detection & Tracking Comments

The action automatically detects which mode to use based on your configuration:

- **Interactive Mode** (no `prompt` input): Responds to @claude mentions, creates tracking comments with progress indicators
- **Automation Mode** (with `prompt` input): Executes immediately, **does not create tracking comments**

> **Note**: In v1, automation mode intentionally does not create tracking comments by default to reduce noise in automated workflows. If you need progress tracking, use the `track_progress: true` input parameter.

## Supported GitHub Events

This action supports the following GitHub events ([learn more GitHub event triggers](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)):

- `pull_request` or `pull_request_target` - When PRs are opened or synchronized
- `issue_comment` - When comments are created on issues or PRs
- `pull_request_comment` - When comments are made on PR diffs
- `issues` - When issues are opened or assigned
- `pull_request_review` - When PR reviews are submitted
- `pull_request_review_comment` - When comments are made on PR reviews
- `repository_dispatch` - Custom events triggered via API
- `workflow_dispatch` - Manual workflow triggers (coming soon)
- `merge_group` - When pull requests enter a merge queue

## Automated Documentation Updates

Automatically update documentation when specific files change (see [`examples/pr-review-filtered-paths.yml`](../examples/pr-review-filtered-paths.yml)):

```yaml
on:
  pull_request:
    paths:
      - "src/api/**/*.ts"

steps:
  - uses: anthropics/claude-code-action@v1
    with:
      prompt: |
        Update the API documentation in README.md to reflect
        the changes made to the API endpoints in this PR.
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

When API files are modified, the action automatically detects that a `prompt` is provided and runs in agent mode. Claude updates your README with the latest endpoint documentation and pushes the changes back to the PR, keeping your docs in sync with your code.

## Merge Queue Checks

Run Claude on each merge group before it lands (see [`examples/merge-queue-check.yml`](../examples/merge-queue-check.yml)):

```yaml
on:
  pull_request:
  merge_group:
    types: [checks_requested]

jobs:
  claude-merge-check:
    if: github.event_name == 'merge_group'
    permissions:
      contents: read
    steps:
      # The example writes merge-group.diff in an earlier step and fails the
      # job in a later one unless Claude approves.
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            merge-group.diff contains every change this merge group would bring
            into the target branch. Decide whether anything in it must not merge.
          github_token: ${{ secrets.GITHUB_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: |
            --restricted
            --strict-mcp-config
            --tools "Read,Grep,Glob"
```

`merge_group` runs in agent mode, so it needs a `prompt` and does not support `track_progress`. The action step succeeds whatever Claude concludes, and with read-only tools and the default output settings nothing Claude finds shows up in the run. To make the queue wait for a verdict, add a step that fails the job when Claude finds a problem, as the example does with `--json-schema` and `structured_output`, then add the job as a required status check. GitHub also requires a required check to pass on the pull request before it can join the queue; the `pull_request` trigger and job-level `if` above handle this, since a job skipped by `if` reports success.

GitHub attributes a `merge_group` run to whoever queued the pull request. A person passes the action's bot check, and an app that queues pull requests, such as a merge bot, needs an `allowed_bots` entry (see [access control](./security.md#access-control)).

Pass `github_token: ${{ secrets.GITHUB_TOKEN }}` for merge queue checks. Without it, the action exchanges an OIDC token for a Claude GitHub App token, and that exchange skips the run whenever the workflow file differs from the default branch's copy. In a merge queue that happens every time a queued pull request edits the workflow, and on queues for branches whose copy of the workflow differs, so a required check would never get a verdict.

The merge group commit contains the queued pull requests' changes, so before Claude starts the action restores its configuration files from the branch the group merges into, [as it does for pull requests](./security.md#which-files-come-from-the-base-branch-on-pull-requests). Those paths in the working tree then hold the target branch's versions, so give Claude the changes as a diff. The comments in the example explain how it keeps queued changes from shaping that diff and what the `claude_args` above switch off; keep those flags if you adapt it. See [security](./security.md#using-this-action-with-merge_group) for how to limit what these runs can reach.

## Author-Specific Code Reviews

Automatically review PRs from specific authors or external contributors (see [`examples/pr-review-filtered-authors.yml`](../examples/pr-review-filtered-authors.yml)):

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review-by-author:
    if: |
      github.event.pull_request.user.login == 'developer1' ||
      github.event.pull_request.user.login == 'external-contributor'
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Please provide a thorough review of this pull request.
            Pay extra attention to coding standards, security practices,
            and test coverage since this is from an external contributor.
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Perfect for automatically reviewing PRs from new team members, external contributors, or specific developers who need extra guidance. The action automatically runs in agent mode when a `prompt` is provided.

## Custom Prompt Templates

Use the `prompt` input with GitHub context variables for dynamic automation:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    prompt: |
      Analyze PR #${{ github.event.pull_request.number }} in ${{ github.repository }} for security vulnerabilities.

      Focus on:
      - SQL injection risks
      - XSS vulnerabilities
      - Authentication bypasses
      - Exposed secrets or credentials

      Provide severity ratings (Critical/High/Medium/Low) for any issues found.
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

You can access any GitHub context variable using the standard GitHub Actions syntax:

- `${{ github.repository }}` - The repository name
- `${{ github.event.pull_request.number }}` - PR number
- `${{ github.event.issue.number }}` - Issue number
- `${{ github.event.pull_request.title }}` - PR title
- `${{ github.event.pull_request.body }}` - PR description
- `${{ github.event.comment.body }}` - Comment text
- `${{ github.actor }}` - User who triggered the workflow
- `${{ github.base_ref }}` - Base branch for PRs
- `${{ github.head_ref }}` - Head branch for PRs

## Advanced Configuration with claude_args

For more control over Claude's behavior, use the `claude_args` input to pass CLI arguments directly:

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    prompt: "Review this PR for performance issues"
    claude_args: |
      --max-turns 15
      --model claude-4-0-sonnet-20250805
      --allowedTools Edit,Read,Write,Bash
      --system-prompt "You are a performance optimization expert. Focus on identifying bottlenecks and suggesting improvements."
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

This provides full access to Claude Code CLI capabilities while maintaining the simplified action interface.
