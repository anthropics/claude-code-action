# CLAUDE.md

## Common Commands

### Development Commands

- Build/Type check: `bun run typecheck`
- Format code: `bun run format`
- Check formatting: `bun run format:check`
- Run tests: `bun test`
- Install dependencies: `bun install`

### Action Testing

- Test action locally: `./test-local.sh`
- Test specific file: `bun test test/prepare-prompt.test.ts`

## Architecture Overview

This is a GitHub Action that allows running Claude Code within GitHub workflows. The action consists of:

### Core Components

1. **Action Definition** (`action.yml`): Defines inputs, outputs, and the composite action steps
2. **Prompt Preparation** (`src/index.ts`): Runs Claude Code with specified arguments

### Key Design Patterns

- Uses Bun runtime for development and execution
- JSON streaming output format for execution logs
- Composite action pattern to orchestrate multiple steps
- Provider-agnostic design supporting Anthropic API, AWS Bedrock, Google Vertex AI, Microsoft Foundry, and OrcaRouter

## Provider Authentication

1. **Anthropic API** (default): Requires API key via `anthropic_api_key` input
2. **AWS Bedrock**: Uses OIDC authentication when `use_bedrock: true`
3. **Google Vertex AI**: Uses OIDC authentication when `use_vertex: true`
4. **Microsoft Foundry**: Uses OIDC authentication when `use_foundry: true`
5. **OrcaRouter**: An OpenAI-compatible gateway. Activated by
   `orcarouter_provider`, `orcarouter_api_key`, or `orcarouter_auth`. The
   credential seam lives in `src/orcarouter/credentials.ts` and has two
   adapters — a pasted `sk-orca-...` key, and OAuth 2.0 + PKCE
   (`orcarouter_stage: connect`). Neither adapter's credential is visible
   downstream: `resolveOrcaRouter` in `src/orcarouter/provider.ts` is the single
   entry point.

## Testing Strategy

### Local Testing

- Use `act` tool to run GitHub Actions workflows locally
- `test-local.sh` script automates local testing setup
- Requires `ANTHROPIC_API_KEY` environment variable

### Test Structure

- Unit tests for configuration logic
- Integration tests for prompt preparation
- Full workflow tests in `.github/workflows/test-base-action.yml`

## Important Technical Details

- Outputs execution logs as JSON to `/tmp/claude-execution-output.json`
- Timeout enforcement via `timeout` command wrapper
- Strict TypeScript configuration with Bun-specific settings
