# Solutions & Use Cases

This guide provides complete, ready-to-use solutions for common automation scenarios with Claude Code Action. Each solution includes working examples, configuration details, and expected outcomes.

## 📋 Table of Contents

- [Automatic PR Code Review](#automatic-pr-code-review)
- [Review Only Specific File Paths](#review-only-specific-file-paths)
- [Review PRs from External Contributors](#review-prs-from-external-contributors)
- [Custom PR Review Checklist](#custom-pr-review-checklist)
- [Scheduled Repository Maintenance](#scheduled-repository-maintenance)
- [Issue Auto-Triage and Labeling](#issue-auto-triage-and-labeling)
- [Documentation Sync on API Changes](#documentation-sync-on-api-changes)
- [Security-Focused PR Reviews](#security-focused-pr-reviews)
- [DIY Progress Tracking](#diy-progress-tracking-in-agent-mode)

---

## Automatic PR Code Review

**When to use:** Automatically review every PR opened or updated in your repository.

**Complete Example:**

```yaml
name: Claude Auto Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            
            Please review this pull request with a focus on:
            - Code quality and best practices
            - Potential bugs or issues
            - Security implications
            - Performance considerations
            
            Note: The PR branch is already checked out in the current working directory.
            
            Use `gh pr comment` for top-level feedback.
            Use `mcp__github_inline_comment__create_inline_comment` to highlight specific code issues.
            Only post GitHub comments - don't submit review text as messages.
            
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"
```

**Key Configuration:**
- Triggers on `opened` and `synchronize` (new commits)
- Always include `REPO` and `PR NUMBER` for context
- Specify tools for commenting and reviewing
- PR branch is pre-checked out

**Expected Output:** Claude posts review comments directly to the PR with inline annotations where appropriate.

---

## Review Only Specific File Paths

**When to use:** Review PRs only when specific critical files change.

**Complete Example:**

```yaml
name: Review Critical Files
on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/auth/**'
      - 'src/api/**'
      - 'config/security.yml'

jobs:
  security-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            
            This PR modifies critical authentication or API files.
            
            Please provide a security-focused review with emphasis on:
            - Authentication and authorization flows
            - Input validation and sanitization
            - SQL injection or XSS vulnerabilities
            - API security best practices
            
            Note: The PR branch is already checked out.
            
            Post detailed security findings as PR comments.
            
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*)"
```

**Key Configuration:**
- `paths:` filter triggers only for specific file changes
- Custom prompt emphasizes security for sensitive areas
- Useful for compliance or security reviews

**Expected Output:** Security-focused review when critical files are modified.

---

## Review PRs from External Contributors

**When to use:** Apply stricter review criteria for external or new contributors.

**Complete Example:**

```yaml
name: External Contributor Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  external-review:
    if: github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            CONTRIBUTOR: ${{ github.event.pull_request.user.login }}
            
            This is a first-time contribution from @${{ github.event.pull_request.user.login }}.
            
            Please provide a comprehensive review focusing on:
            - Compliance with project coding standards
            - Proper test coverage (unit and integration)
            - Documentation for new features
            - Potential breaking changes
            - License header requirements
            
            Be welcoming but thorough in your review. Use inline comments for code-specific feedback.
            
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr view:*)"
```

**Key Configuration:**
- `if:` condition targets specific contributor types
- Includes contributor username in context
- Emphasis on onboarding and standards

**Expected Output:** Detailed review helping new contributors understand project standards.

---

## Custom PR Review Checklist

**When to use:** Enforce specific review criteria for your team's workflow.

**Complete Example:**

```yaml
name: PR Review Checklist
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  checklist-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            
            Review this PR against our team checklist:
            
            ## Code Quality
            - [ ] Code follows our style guide
            - [ ] No commented-out code
            - [ ] Meaningful variable names
            - [ ] DRY principle followed
            
            ## Testing
            - [ ] Unit tests for new functions
            - [ ] Integration tests for new endpoints
            - [ ] Edge cases covered
            - [ ] Test coverage > 80%
            
            ## Documentation
            - [ ] README updated if needed
            - [ ] API docs updated
            - [ ] Inline comments for complex logic
            - [ ] CHANGELOG.md updated
            
            ## Security
            - [ ] No hardcoded credentials
            - [ ] Input validation implemented
            - [ ] Proper error handling
            - [ ] No sensitive data in logs
            
            For each item, check if it's satisfied and comment on any that need attention.
            Post a summary comment with checklist results.
            
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*)"
```

**Key Configuration:**
- Structured checklist in prompt
- Systematic review approach
- Team-specific criteria

**Expected Output:** Systematic review with checklist results and specific feedback.

---

## Scheduled Repository Maintenance

**When to use:** Regular automated maintenance tasks.

**Complete Example:**

```yaml
name: Weekly Maintenance
on:
  schedule:
    - cron: '0 0 * * 0'  # Every Sunday at midnight
  workflow_dispatch:      # Manual trigger option

jobs:
  maintenance:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            
            Perform weekly repository maintenance:
            
            1. Check for outdated dependencies in package.json
            2. Scan for security vulnerabilities using `npm audit`
            3. Review open issues older than 90 days
            4. Check for TODO comments in recent commits
            5. Verify README.md examples still work
            
            Create a single issue summarizing any findings.
            If critical security issues are found, also comment on open PRs.
            
          claude_args: |
            --allowedTools "Read,Bash(npm:*),Bash(gh issue:*),Bash(git:*)"
```

**Key Configuration:**
- `schedule:` for automated runs
- `workflow_dispatch:` for manual triggering
- Comprehensive tool permissions for analysis

**Expected Output:** Weekly maintenance report as GitHub issue.

---

## Issue Auto-Triage and Labeling

**When to use:** Automatically categorize and prioritize new issues.

**Complete Example:**

```yaml
name: Issue Triage
on:
  issues:
    types: [opened]

jobs:
  triage:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      id-token: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            ISSUE NUMBER: ${{ github.event.issue.number }}
            TITLE: ${{ github.event.issue.title }}
            BODY: ${{ github.event.issue.body }}
            AUTHOR: ${{ github.event.issue.user.login }}
            
            Analyze this new issue and:
            1. Determine if it's a bug report, feature request, or question
            2. Assess priority (critical, high, medium, low)
            3. Suggest appropriate labels
            4. Check if it duplicates existing issues
            
            Based on your analysis, add the appropriate labels using:
            `gh issue edit [number] --add-label "label1,label2"`
            
            If it appears to be a duplicate, post a comment mentioning the original issue.
            
          claude_args: |
            --allowedTools "Bash(gh issue:*),Bash(gh search:*)"
```

**Key Configuration:**
- Triggered on new issues
- Issue context in prompt
- Label management capabilities

**Expected Output:** Automatically labeled and categorized issues.

---

## Documentation Sync on API Changes

**When to use:** Keep docs up-to-date when API code changes.

**Complete Example:**

```yaml
name: Sync API Documentation
on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/api/**/*.ts'
      - 'src/routes/**/*.ts'

jobs:
  doc-sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            
            This PR modifies API endpoints. Please:
            
            1. Review the API changes in src/api and src/routes
            2. Update API.md to document any new or changed endpoints
            3. Ensure OpenAPI spec is updated if needed
            4. Update example requests/responses
            
            Use standard REST API documentation format.
            Commit any documentation updates to this PR branch.
            
          claude_args: |
            --allowedTools "Read,Write,Edit,Bash(git:*)"
```

**Key Configuration:**
- Path-specific trigger
- Write permissions for doc updates
- Git tools for committing

**Expected Output:** API documentation automatically updated with code changes.

---

## Security-Focused PR Reviews

**When to use:** Deep security analysis for sensitive repositories.

**Complete Example:**

```yaml
name: Security Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      security-events: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            
            Perform a comprehensive security review:
            
            ## OWASP Top 10 Analysis
            - SQL Injection vulnerabilities
            - Cross-Site Scripting (XSS)
            - Broken Authentication
            - Sensitive Data Exposure
            - XML External Entities (XXE)
            - Broken Access Control
            - Security Misconfiguration
            - Cross-Site Request Forgery (CSRF)
            - Using Components with Known Vulnerabilities
            - Insufficient Logging & Monitoring
            
            ## Additional Security Checks
            - Hardcoded secrets or credentials
            - Insecure cryptographic practices
            - Unsafe deserialization
            - Server-Side Request Forgery (SSRF)
            - Race conditions or TOCTOU issues
            
            Rate severity as: CRITICAL, HIGH, MEDIUM, LOW, or NONE.
            Post detailed findings with recommendations.
            
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*)"
```

**Key Configuration:**
- Security-focused prompt structure
- OWASP alignment
- Severity rating system

**Expected Output:** Detailed security analysis with prioritized findings.

---

## DIY Progress Tracking in Agent Mode

**When to use:** Create manual tracking comments in automation workflows (agent mode doesn't create them automatically).

**Complete Example:**

```yaml
name: Custom Tracking
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review-with-tracking:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1

      # Create initial tracking comment
      - name: Create Tracking Comment
        id: tracking
        run: |
          COMMENT_BODY="## 🤖 Claude Code Review in Progress
          
          - [ ] Analyzing code changes
          - [ ] Checking for security issues
          - [ ] Verifying test coverage
          - [ ] Reviewing documentation
          
          *Status: Starting review...*"
          
          COMMENT_ID=$(gh pr comment ${{ github.event.pull_request.number }} \
            --body "$COMMENT_BODY" --repo ${{ github.repository }} \
            --json id --jq .id)
          echo "comment_id=$COMMENT_ID" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ github.token }}

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}
            TRACKING COMMENT ID: ${{ steps.tracking.outputs.comment_id }}
            
            Review this PR. After each major step, update the tracking comment:
            
            1. After analyzing changes: 
               `gh pr comment edit --comment-id [ID] --body "Updated status with analysis complete"`
            
            2. After security check:
               Mark security checkbox as [x]
            
            3. Continue for each checklist item
            
            Final comment should summarize findings.
            
          claude_args: |
            --allowedTools "Bash(gh pr comment:*),Bash(gh pr diff:*)"

      # Update tracking comment on completion
      - name: Complete Tracking Comment
        if: always()
        run: |
          gh pr comment edit --comment-id ${{ steps.tracking.outputs.comment_id }} \
            --body "## ✅ Claude Code Review Complete
            
            Review has finished. Check the full review comments above."
        env:
          GH_TOKEN: ${{ github.token }}
```

**Key Configuration:**
- Manual tracking comment creation
- Pass comment ID to Claude for updates
- Handles completion status

**Expected Output:** Visual progress tracking even in agent mode.

---

## Tips for All Solutions

### Always Include GitHub Context
```yaml
prompt: |
  REPO: ${{ github.repository }}
  PR NUMBER: ${{ github.event.pull_request.number }}
  [Your specific instructions]
```

### Common Tool Permissions
- **PR Comments**: `Bash(gh pr comment:*)`
- **Inline Comments**: `mcp__github_inline_comment__create_inline_comment`
- **File Operations**: `Read,Write,Edit`
- **Git Operations**: `Bash(git:*)`

### Best Practices
- Be specific in your prompts
- Include expected output format
- Set clear success criteria
- Provide context about the repository
- Use inline comments for code-specific feedback