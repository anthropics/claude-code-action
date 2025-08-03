# Custom Automations

These examples show how to configure Claude to act automatically based on GitHub events, without requiring manual @mentions.

## Supported GitHub Events

This action supports the following GitHub events ([learn more GitHub event triggers](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)):

- `pull_request` - When PRs are opened or synchronized
- `issue_comment` - When comments are created on issues or PRs
- `pull_request_comment` - When comments are made on PR diffs
- `issues` - When issues are opened or assigned
- `pull_request_review` - When PR reviews are submitted
- `pull_request_review_comment` - When comments are made on PR reviews
- `repository_dispatch` - Custom events triggered via API (coming soon)
- `workflow_dispatch` - Manual workflow triggers (coming soon)

## Automated Documentation Updates

Automatically update documentation when specific files change (see [`examples/claude-pr-path-specific.yml`](../examples/claude-pr-path-specific.yml)):

```yaml
on:
  pull_request:
    paths:
      - "src/api/**/*.ts"

steps:
  - uses: anthropics/claude-code-action@beta
    with:
      direct_prompt: |
        Update the API documentation in README.md to reflect
        the changes made to the API endpoints in this PR.
```

When API files are modified, Claude automatically updates your README with the latest endpoint documentation and pushes the changes back to the PR, keeping your docs in sync with your code.

## Author-Specific Code Reviews

Automatically review PRs from specific authors or external contributors (see [`examples/claude-review-from-author.yml`](../examples/claude-review-from-author.yml)):

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
      - uses: anthropics/claude-code-action@beta
        with:
          direct_prompt: |
            Please provide a thorough review of this pull request.
            Pay extra attention to coding standards, security practices,
            and test coverage since this is from an external contributor.
```

Perfect for automatically reviewing PRs from new team members, external contributors, or specific developers who need extra guidance.

## Custom Prompt Templates

Use `override_prompt` for complete control over Claude's behavior with variable substitution:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    override_prompt: |
      Analyze PR #$PR_NUMBER in $REPOSITORY for security vulnerabilities.

      Changed files:
      $CHANGED_FILES

      Focus on:
      - SQL injection risks
      - XSS vulnerabilities
      - Authentication bypasses
      - Exposed secrets or credentials

      Provide severity ratings (Critical/High/Medium/Low) for any issues found.
```

The `override_prompt` feature supports these variables:

- `$REPOSITORY`, `$PR_NUMBER`, `$ISSUE_NUMBER`
- `$PR_TITLE`, `$ISSUE_TITLE`, `$PR_BODY`, `$ISSUE_BODY`
- `$PR_COMMENTS`, `$ISSUE_COMMENTS`, `$REVIEW_COMMENTS`
- `$CHANGED_FILES`, `$TRIGGER_COMMENT`, `$TRIGGER_USERNAME`
- `$BRANCH_NAME`, `$BASE_BRANCH`, `$EVENT_TYPE`, `$IS_PR`
