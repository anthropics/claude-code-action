# Capabilities and Limitations

## What Claude Can Do

- **Respond in a Single Comment**: Claude operates by updating a single initial comment with progress and results
- **Answer Questions**: Analyze code and provide explanations
- **Implement Code Changes**: Make simple to moderate code changes based on requests
- **Prepare Pull Requests**: Creates commits on a branch and links back to a prefilled PR creation page
- **Perform Code Reviews**: Analyze PR changes and provide detailed feedback
- **Smart Branch Handling**:
  - When triggered on an **issue**: Always creates a new branch for the work
  - When triggered on an **open PR**: Always pushes directly to the existing PR branch
  - When triggered on a **closed PR**: Creates a new branch since the original is no longer active
- **View GitHub Actions Results**: Can access workflow runs, job logs, and test results on the PR where it's tagged when `actions: read` permission is configured (see [Additional Permissions for CI/CD Integration](./configuration.md#additional-permissions-for-cicd-integration))

## What Claude Cannot Do

- **Submit PR Reviews**: Claude cannot submit formal GitHub PR reviews
- **Approve PRs**: For security reasons, Claude cannot approve pull requests
- **Post Multiple Comments**: Claude only acts by updating its initial comment
- **Execute Commands Outside Its Context**: Claude only has access to the repository and PR/issue context it's triggered in
- **Run Arbitrary Bash Commands**: By default, Claude cannot execute Bash commands unless explicitly allowed using the `allowed_tools` configuration
- **Perform Branch Operations**: Cannot merge branches, rebase, or perform other git operations beyond pushing commits

## How It Works

1. **Trigger Detection**: Listens for comments containing the trigger phrase (default: `@claude`) or issue assignment to a specific user
2. **Context Gathering**: Analyzes the PR/issue, comments, code changes
3. **Smart Responses**: Either answers questions or implements changes
4. **Branch Management**: Creates new PRs for human authors, pushes directly for Claude's own PRs
5. **Communication**: Posts updates at every step to keep you informed

This action is built on top of [`anthropics/claude-code-base-action`](https://github.com/anthropics/claude-code-base-action).
