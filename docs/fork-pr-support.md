# Fork PR Support

This guide explains how to configure Claude Code to work with pull requests from forked repositories. Fork PRs require special configuration because they involve code from external repositories with different permissions.

## Related Issues

This documentation addresses the following open issues:
- [#339 - Claude review fails on PRs from forks](https://github.com/anthropics/claude-code-action/issues/339)
- [#542 - Could not fetch an OIDC token when attempting to execute on a branch from a fork](https://github.com/anthropics/claude-code-action/issues/542)
- [#223 - Claude Code Action fails with "couldn't find remote ref" error for PRs from forks](https://github.com/anthropics/claude-code-action/issues/223)
- [#46 - Comments in (forked) PR trigger claude-code-action with wrong branch](https://github.com/anthropics/claude-code-action/issues/46)

## Credits

Special thanks to [@CryptoGnome](https://github.com/CryptoGnome) whose [aster_lick_hunter_node repository](https://github.com/CryptoGnome/aster_lick_hunter_node) provided valuable insights for the fork repository checkout solution.

## Overview

Fork PRs present two main challenges:

1. **Branch Accessibility**: Fork branches don't exist in the base repository
2. **Permissions**: Fork contributors typically don't have write access to the base repository

Claude Code supports **two scenarios** for fork PRs:

- **@claude Mentions** (`issue_comment` trigger) - On-demand reviews when someone tags @claude
- **Automated Reviews** (`pull_request_target` trigger) - Automatic reviews when PRs are opened/updated

Each scenario requires different configuration.

---

## Scenario 1: @claude Mentions on Fork PRs

When someone tags `@claude` in a comment on a fork PR, the workflow needs to checkout the fork repository.

### Problem

The default checkout fails because fork branches don't exist in the base repository:
```
fatal: couldn't find remote ref [branch-name]
```

### Solution

Dynamically detect fork PRs and checkout the fork repository directly:

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      # Step 1: Get PR info for fork detection
      - name: Get PR info for fork support
        if: github.event.issue.pull_request
        id: pr-info
        run: |
          PR_DATA=$(gh api repos/${{ github.repository }}/pulls/${{ github.event.issue.number }})
          echo "pr_head_owner=$(echo "$PR_DATA" | jq -r '.head.repo.owner.login')" >> $GITHUB_OUTPUT
          echo "pr_head_repo=$(echo "$PR_DATA" | jq -r '.head.repo.name')" >> $GITHUB_OUTPUT
          echo "pr_head_ref=$(echo "$PR_DATA" | jq -r '.head.ref')" >> $GITHUB_OUTPUT
          echo "is_fork=$(echo "$PR_DATA" | jq -r '.head.repo.fork')" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Step 2: Checkout repository (fork or base)
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          repository: ${{ github.event.issue.pull_request && steps.pr-info.outputs.is_fork == 'true' && format('{0}/{1}', steps.pr-info.outputs.pr_head_owner, steps.pr-info.outputs.pr_head_repo) || github.repository }}
          ref: ${{ github.event.issue.pull_request && steps.pr-info.outputs.pr_head_ref || github.ref }}
          fetch-depth: 0

      # Step 3: Run Claude Code
      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### How It Works

1. **Detect Fork**: Use `gh api` to get PR details and check if it's from a fork
2. **Dynamic Checkout**:
   - Fork PR: Checkout `fork-owner/fork-repo @ branch-name`
   - Regular PR: Checkout `base-repo @ branch-name`
   - Non-PR: Checkout base repository

This approach works because `actions/checkout` can checkout any public repository, not just the base repo.

---

## Scenario 2: Automated Reviews on Fork PRs

Automated reviews trigger when PRs are opened or updated, requiring `pull_request_target` for fork PR write access.

### Problems

Fork PRs encounter **three issues** with automated reviews:

1. **Branch not found**: Fork branches don't exist in base repo
2. **OIDC authentication failure**: `pull_request_target` has OIDC issues with forks
3. **Permission denied**: Fork contributors lack write access

### Solution

Apply **three fixes** to your workflow:

```yaml
name: Claude Code Review

on:
  pull_request_target:  # Required for fork PR write access
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      # Fix 1: Checkout fork repository
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      # Fix 2 & 3: Add github_token and allow fork contributors
      - name: Run Claude Code Review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}      # Fix 2: Bypass OIDC
          allowed_non_write_users: '*'                    # Fix 3: Allow fork contributors
          prompt: |
            Review this PR for:
            - Code quality
            - Potential bugs
            - Security concerns
            - Performance issues
```

### Fix Details

#### Fix 1: Checkout Fork Repository
```yaml
repository: ${{ github.event.pull_request.head.repo.full_name }}
ref: ${{ github.event.pull_request.head.ref }}
```
**Why**: `pull_request_target` provides fork repository info in the event payload. This works for both fork and non-fork PRs.

#### Fix 2: Bypass OIDC Authentication
```yaml
github_token: ${{ secrets.GITHUB_TOKEN }}
```
**Why**: `pull_request_target` runs in base repo context where `GITHUB_TOKEN` has proper permissions. Explicit `github_token` bypasses problematic OIDC authentication.

#### Fix 3: Allow Fork Contributors
```yaml
allowed_non_write_users: '*'
```
**Why**: By default, only users with write access can trigger Claude. Fork contributors have read-only access, so this parameter allows them to trigger automated reviews.

**Security Note**: This is safe for review-only workflows because:
- ✅ Reviews only read code and post comments (no code execution)
- ✅ Runs in base repo context with `pull_request_target` (secure)
- ✅ Standard pattern for PR review automation

---

## Security Considerations

### Safe Use Cases ✅

Fork contributor access is **safe** when:
- Workflow only reads code and posts comments
- Uses `pull_request_target` (runs in base repo context)
- No code execution from fork
- No deployment or build steps with untrusted code

### Unsafe Use Cases ⚠️

**DO NOT** use `allowed_non_write_users: '*'` when:
- Workflow executes code from the fork
- Workflow has deployment capabilities
- Workflow runs tests/builds with untrusted dependencies
- Workflow accesses secrets or credentials

For CI/CD workflows that build/test fork code, use `pull_request` (not `pull_request_target`) and accept that some operations won't work from forks.

---

## Comparison: pull_request vs pull_request_target

| Feature | `pull_request` | `pull_request_target` |
|---------|---------------|----------------------|
| **Context** | Fork repo | Base repo |
| **Secrets Access** | ❌ No (from fork) | ✅ Yes (from base) |
| **Write Access** | ❌ Limited | ✅ Full (to base) |
| **Code Execution** | ⚠️ Untrusted (fork) | ✅ Trusted (base workflow) |
| **Fork PR Support** | ⚠️ Limited | ✅ Full (with fixes) |
| **Use Case** | CI/CD, Testing | Reviews, Comments, Labeling |

### When to Use Each

**Use `pull_request`** for:
- CI/CD pipelines
- Running tests
- Building artifacts
- Any code execution from PR

**Use `pull_request_target`** for:
- Code reviews
- Labeling/triaging
- Adding comments
- Read-only analysis

---

## Complete Examples

### Example 1: @claude Mentions with Fork Support

Complete workflow for on-demand reviews:

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - name: Get PR info for fork support
        if: github.event.issue.pull_request
        id: pr-info
        run: |
          PR_DATA=$(gh api repos/${{ github.repository }}/pulls/${{ github.event.issue.number }})
          echo "pr_head_owner=$(echo "$PR_DATA" | jq -r '.head.repo.owner.login')" >> $GITHUB_OUTPUT
          echo "pr_head_repo=$(echo "$PR_DATA" | jq -r '.head.repo.name')" >> $GITHUB_OUTPUT
          echo "pr_head_ref=$(echo "$PR_DATA" | jq -r '.head.ref')" >> $GITHUB_OUTPUT
          echo "is_fork=$(echo "$PR_DATA" | jq -r '.head.repo.fork')" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          repository: ${{ github.event.issue.pull_request && steps.pr-info.outputs.is_fork == 'true' && format('{0}/{1}', steps.pr-info.outputs.pr_head_owner, steps.pr-info.outputs.pr_head_repo) || github.repository }}
          ref: ${{ github.event.issue.pull_request && steps.pr-info.outputs.pr_head_ref || github.ref }}
          fetch-depth: 0

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Example 2: Automated Reviews with Fork Support

Complete workflow for automatic PR reviews:

```yaml
name: Claude Code Review

on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - name: Run Claude Code Review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: '*'
          prompt: |
            Review this pull request and provide feedback on:
            - Code quality and best practices
            - Potential bugs or issues
            - Performance considerations
            - Security concerns
            - Test coverage
```

---

## Troubleshooting

### "couldn't find remote ref" error

**Problem**: Workflow tries to checkout fork branch from base repo

**Solution**: Add fork repository checkout as shown in examples above

### "Invalid OIDC token" error

**Problem**: `pull_request_target` has OIDC authentication issues

**Solution**: Add `github_token: ${{ secrets.GITHUB_TOKEN }}`

### "Actor does not have write permissions" error

**Problem**: Fork contributors don't have write access

**Solution**: Add `allowed_non_write_users: '*'` (safe for review workflows only)

### Re-running failed workflows

**Important**: Re-running a workflow uses the **original workflow definition**, not the current one. If you fix the workflow file, you need a **fresh trigger** (new PR or new commit) to use the updated workflow.

---

## FAQ

### Can I restrict which fork contributors can trigger reviews?

Yes! Instead of `'*'`, specify usernames:

```yaml
allowed_non_write_users: 'user1,user2,user3'
```

### Does this work with private forks?

No, `actions/checkout` can only checkout **public repositories**. Private forks require the action to have access to the fork repository, which is not currently supported.

### Why not use `pull_request` instead?

`pull_request` runs in the fork's context and cannot:
- Access base repository secrets
- Post comments as claude[bot]
- Write to base repository

For code reviews, `pull_request_target` is required.

### What if I want to filter automated reviews?

Add conditions to your workflow:

```yaml
jobs:
  claude-review:
    # Only review PRs from first-time contributors
    if: github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'

    # Or only review specific file paths
on:
  pull_request_target:
    types: [opened, synchronize]
    paths:
      - 'src/**/*.ts'
      - 'src/**/*.js'
```

---

## Migration Guide

If you have existing workflows without fork support, apply these changes:

### For @claude Mention Workflows

Add fork detection before checkout:

```diff
  steps:
+   - name: Get PR info for fork support
+     if: github.event.issue.pull_request
+     id: pr-info
+     run: |
+       PR_DATA=$(gh api repos/${{ github.repository }}/pulls/${{ github.event.issue.number }})
+       echo "pr_head_owner=$(echo "$PR_DATA" | jq -r '.head.repo.owner.login')" >> $GITHUB_OUTPUT
+       echo "pr_head_repo=$(echo "$PR_DATA" | jq -r '.head.repo.name')" >> $GITHUB_OUTPUT
+       echo "pr_head_ref=$(echo "$PR_DATA" | jq -r '.head.ref')" >> $GITHUB_OUTPUT
+       echo "is_fork=$(echo "$PR_DATA" | jq -r '.head.repo.fork')" >> $GITHUB_OUTPUT
+     env:
+       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    - name: Checkout repository
      uses: actions/checkout@v4
      with:
-       fetch-depth: 1
+       repository: ${{ github.event.issue.pull_request && steps.pr-info.outputs.is_fork == 'true' && format('{0}/{1}', steps.pr-info.outputs.pr_head_owner, steps.pr-info.outputs.pr_head_repo) || github.repository }}
+       ref: ${{ github.event.issue.pull_request && steps.pr-info.outputs.pr_head_ref || github.ref }}
+       fetch-depth: 0
```

### For Automated Review Workflows

Update checkout and add parameters:

```diff
  on:
-   pull_request:
+   pull_request_target:
      types: [opened, synchronize]

  steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      with:
-       fetch-depth: 1
+       repository: ${{ github.event.pull_request.head.repo.full_name }}
+       ref: ${{ github.event.pull_request.head.ref }}
+       fetch-depth: 0

    - name: Run Claude Code Review
      uses: anthropics/claude-code-action@v1
      with:
        anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
+       github_token: ${{ secrets.GITHUB_TOKEN }}
+       allowed_non_write_users: '*'
```

---

## Additional Resources

- [GitHub Actions: Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
- [Keeping your GitHub Actions secure with pull_request_target](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)
- [Claude Code Action Documentation](https://github.com/anthropics/claude-code-action)
