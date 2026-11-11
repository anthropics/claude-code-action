# Pull Request Workflow Guide

This guide describes the recommended workflow for creating and managing pull requests in the Claude Code Action repository.

## Overview

The Claude Code Action GitHub Action automates code review, testing, and deployment tasks. This document outlines best practices for contributing via pull requests.

## Creating a PR

### 1. Create a Feature Branch

```bash
git checkout -b feat/your-feature-name
```

Branch naming conventions:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation improvements
- `chore/` - Maintenance tasks
- `test/` - Test improvements

### 2. Make Your Changes

Ensure your changes:
- Follow TypeScript strictness rules (`noUnusedLocals`, `noUnusedParameters`)
- Pass all tests: `bun test`
- Pass type checking: `bun run typecheck`
- Follow code style: `bun run format`

### 3. Commit Your Changes

```bash
git add .
git commit -m "type: Description of changes

Detailed explanation if needed.

Co-Authored-By: Your Name <your.email@example.com>"
```

### 4. Push and Create PR

```bash
git push origin feat/your-feature-name
gh pr create --title "type: Brief description" --body "Details about your changes"
```

## Quality Standards

All PRs must meet these requirements:

- **Tests**: 90%+ pass rate on existing tests
- **TypeScript**: No type errors (`bun run typecheck`)
- **Formatting**: Code passes prettier check (`bun run format:check`)
- **Documentation**: Updated if needed

## Review Process

1. Automated checks must pass
2. Code review by maintainers
3. Approval required before merge
4. CI/CD must be green

## Merge Strategy

- Squash commits for feature branches
- Preserve history for major releases
- All commits must be signed (SSH or GPG)

## Sign Commits

### SSH Signing

```bash
git config user.signingkey ~/.ssh/your-key
git config gpg.format ssh
git commit -S -m "Your message"
```

## After Merge

Once merged to main:
1. Tag the release if needed
2. Update CHANGELOG
3. Deploy to production via CI/CD

## Common Tasks

### Running Tests
```bash
bun test                    # Run all tests
bun test -- --filters=name # Run specific test
```

### Checking Code Quality
```bash
bun run typecheck           # Type checking
bun run format:check        # Formatting check
bun run format              # Auto-format code
```

### Viewing Changes
```bash
git diff                    # Unstaged changes
git diff --cached           # Staged changes
git log --oneline -10       # Recent commits
```

## Tips for Good PRs

1. **Keep it focused**: One feature or fix per PR
2. **Write clear messages**: Explain the why, not just the what
3. **Test thoroughly**: Include relevant test cases
4. **Document changes**: Update README/docs if needed
5. **Be responsive**: Address feedback promptly

## Questions?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for more information about contributing to this project.
