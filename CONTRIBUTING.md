# Contributing to Claude Code Action

Thank you for your interest in contributing to Claude Code Action! This document provides guidelines and instructions for contributing to the project.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Docker](https://www.docker.com/) (for running GitHub Actions locally)
- [act](https://github.com/nektos/act) (installed automatically by our test script)
- An Anthropic API key (for testing)

### Setup

1. Fork the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/your-username/claude-code-action.git
   cd claude-code-action
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up your Anthropic API key:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

## Development

### Available Scripts

- `bun test` - Run all tests
- `bun run typecheck` - Type check the code
- `bun run format` - Format code with Prettier
- `bun run format:check` - Check code formatting

## Testing

### Running Tests Locally

1. **Unit Tests**:

   ```bash
   bun test
   ```

## Pull Request Process

1. Create a new branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:

   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. Run tests and formatting:

   ```bash
   bun test
   bun run typecheck
   bun run format:check
   ```

4. Push your branch and create a Pull Request:

   ```bash
   git push origin feature/your-feature-name
   ```

5. Ensure all CI checks pass. On a pull request from a fork, checks usually start only after a maintainer approves them, and jobs that call Claude are skipped because forks don't get the credentials they need.

6. Request review from maintainers

### Breaking changes

Add the `breaking-change` label if a workflow that works today could fail or behave differently after upgrading, with no change on the workflow's side. Workflows on `@v1` get each release straight away, so this is their only warning.

Labeled pull requests go in their own section of the release notes, and the release title says `(breaking changes)`. The notes show only the pull request's title, so make it say what changes.

### For Maintainers: Pull Requests from Outside Contributors

These steps are for pull requests from forks whose author does not have write access.

1. Review the changes, including any to workflow files and test scripts.
2. Select **Approve and run**, which starts every waiting workflow. `ci.yml` runs the tests, type check and format check. GitHub gives these runs a read-only token and no secrets. New commits can need a new approval.
3. Check the result. Jobs that call Claude, such as `claude-review.yml` and the ones in `test-*.yml`, show as skipped, which doesn't mean they passed. The `test-*.yml` jobs run on `main` after the merge.
4. If you want help, mention `@claude` in a comment on the conversation, not in a review. Claude can see whether `ci.yml` passed, but commands such as `bun` are denied. See [Running code from pull requests](./docs/security.md#running-code-from-pull-requests).

## Action Development

### Testing Your Changes

When modifying the action:

1. Test in a real GitHub Actions workflow by:
   - Creating a test repository
   - Using your branch as the action source:
     ```yaml
     uses: your-username/claude-code-action@your-branch
     ```

### Debugging

- Use `console.log` for debugging in development
- Check GitHub Actions logs for runtime issues
- Use `act` with `-v` flag for verbose output:
  ```bash
  act push -v --secret ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
  ```

## Common Issues

### Docker Issues

Make sure Docker is running before using `act`. You can check with:

```bash
docker ps
```
