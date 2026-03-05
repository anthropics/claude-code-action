# Claude Code Action - Setup Guide

## Prerequisites

1. An Anthropic API key (get one at https://console.anthropic.com)

## Installation

1. Copy the `.github/workflows/` folder into your repository root
2. Add the `ANTHROPIC_API_KEY` secret to your repository:
   - Go to **Settings > Secrets and variables > Actions**
   - Click **New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key

## Included Workflows

| File                | Mode  | Trigger                         | What it does                                                    |
| ------------------- | ----- | ------------------------------- | --------------------------------------------------------------- |
| `claude.yml`        | Tag   | `@claude` mention on issues/PRs | Claude responds to mentions, can write code and create branches |
| `claude-review.yml` | Agent | PR opened/updated               | Automatic code review with inline comments                      |
| `claude-agent.yml`  | Agent | Manual (workflow_dispatch)      | Run any task via GitHub Actions UI                              |

## Usage

- **Tag mode**: Comment `@claude fix this bug` on any issue or PR
- **PR review**: Automatic on every new/updated PR
- **Agent mode**: Go to Actions > Claude Agent > Run workflow, enter a prompt

## Customization

- Edit `claude_args` in each workflow to restrict/allow specific tools
- Add `--model claude-opus-4-6` to `claude_args` to use a specific model
- Set `trigger_phrase` to change from `@claude` to something else
