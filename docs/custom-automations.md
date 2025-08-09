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

Use `override_prompt` for complete control over Claude's behavior with variable substitution. Variables are replaced with formatted data from the GitHub context.

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

### Available Variables

| Variable | Description | Example Output | Availability |
|----------|-------------|----------------|--------------|
| `$REPOSITORY` | Full repository name | `owner/repo` | All contexts |
| `$PR_NUMBER` | Pull request number | `123` | PR contexts only |
| `$ISSUE_NUMBER` | Issue number | `456` | Issue contexts only |
| `$PR_TITLE` | Pull request title | `feat: add new feature` | PR contexts only |
| `$ISSUE_TITLE` | Issue title | `Bug: Login not working` | Issue contexts only |
| `$PR_BODY` | Formatted PR description with images replaced | Multi-line markdown content | PR contexts only |
| `$ISSUE_BODY` | Formatted issue description with images replaced | Multi-line markdown content | Issue contexts only |
| `$PR_COMMENTS` | Formatted PR comments | `[username at 2024-01-01]: Comment text`<br/><br/>`[user2 at 2024-01-02]: Another comment` | PR contexts only |
| `$ISSUE_COMMENTS` | Formatted issue comments | Same format as PR_COMMENTS | Issue contexts only |
| `$REVIEW_COMMENTS` | Formatted PR review comments with inline code locations | `[Review by user at 2024-01-01]: APPROVED`<br/>`Review body text`<br/>`  [Comment on src/file.js:10]: Inline comment` | PR contexts only |
| `$CHANGED_FILES` | List of changed files with stats and SHAs | `- src/file.js (MODIFIED) +10/-5 SHA: abc123`<br/>`- docs/readme.md (ADDED) +50/-0 SHA: def456` | PR contexts only |
| `$TRIGGER_COMMENT` | The comment that triggered Claude | `@claude please review this` | Comment events only |
| `$TRIGGER_USERNAME` | Username who triggered the action | `johndoe` | All contexts |
| `$BRANCH_NAME` | Current branch name (claudeBranch or baseBranch) | `feature-123` or `main` | All contexts |
| `$BASE_BRANCH` | Base branch for PRs/issues | `main` | All contexts |
| `$EVENT_TYPE` | GitHub event type | `pull_request_review_comment`, `issues`, etc. | All contexts |
| `$IS_PR` | Whether context is a PR | `true` or `false` | All contexts |

### Important Notes

- **Empty variables**: Variables that don't apply to the current context (e.g., `$PR_NUMBER` in an issue) will be replaced with empty strings
- **Image handling**: `$PR_BODY`, `$ISSUE_BODY`, and comment variables automatically have image URLs replaced with local file paths
- **Formatting**: Comments include author and timestamp, changed files include modification stats
- **Mode availability**: Variable substitution works in all modes (tag, review, agent) when using `override_prompt`

### Variable Output Examples

#### Comments Format

```text
$PR_COMMENTS outputs:
[alice at 2024-12-01T10:30:00Z]: This looks great! Just one suggestion below.

[bob at 2024-12-01T11:00:00Z]: I agree with Alice. Also, can we add tests?
```

#### Changed Files Format

```text
$CHANGED_FILES outputs:
- src/components/Button.tsx (MODIFIED) +25/-10 SHA: a1b2c3d4
- src/components/Button.test.tsx (ADDED) +100/-0 SHA: e5f6g7h8
- src/old/Legacy.js (DELETED) +0/-150 SHA: deleted
```

#### Review Comments Format

```text
$REVIEW_COMMENTS outputs:
[Review by charlie at 2024-12-01T12:00:00Z]: REQUEST_CHANGES
Please address the security concern below.
  [Comment on src/auth.js:45]: This could be vulnerable to SQL injection
  [Comment on src/auth.js:67]: Consider using prepared statements here
```

### Mode-Specific Considerations

#### Review Mode

- All PR-related variables are available since review mode only works on pull requests
- `$TRIGGER_COMMENT` contains the review comment if triggered by a review
- Variable substitution fully supported with `override_prompt`

#### Agent Mode

- Typically used for automation without PR/issue context
- PR/issue-specific variables will be empty when no context is available
- Variable substitution fully supported with `override_prompt`

#### Tag Mode

- Full variable support for both PR and issue contexts
- Variables adapt based on whether triggered on a PR or issue
- Variable substitution fully supported with `override_prompt`
