# Claude Code for GitLab

This repository provides a GitLab-native automation that uses Claude Code to
review merge requests. It replaces the original GitHub Action with a minimal
Node.js service tailored for GitLab CI, focusing on merge request summaries and
inline comments.

## Features

- Automated merge request analysis using Anthropic Claude models
- Summary note posted directly to the merge request
- Inline discussions for actionable findings with severity levels
- Works with project access tokens and Anthropic API keys configured through CI variables

## Getting Started

1. Install dependencies: `npm install`
2. Configure required environment variables (see `docs/setup.md`)
3. Run locally with `npx tsx src/entrypoints/gitlab-review.ts`
4. Add the review stage to your `.gitlab-ci.yml` pipeline

## Documentation

- `docs/overview.md` – project overview and capabilities
- `docs/setup.md` – environment setup and CI job configuration
- `docs/configuration.md` – environment variables and tuning options
- `docs/usage.md` – running locally and in CI
- `docs/limitations.md` – current feature gaps and constraints

## License

MIT
