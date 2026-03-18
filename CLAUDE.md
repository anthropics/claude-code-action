# CLAUDE.md

## Commands

```bash
bun test                # Run tests (Bun native test runner, not Jest)
bun run typecheck       # TypeScript type checking (strict mode)
bun run format          # Format with Prettier
bun run format:check    # Check formatting without writing
```

## What This Is

A GitHub Action that lets Claude respond to `@claude` mentions on issues/PRs (**tag mode**) or run tasks via `prompt` input (**agent mode**). Mode is auto-detected: comment/issue events with `@claude` trigger tag mode; providing `prompt` triggers agent mode. See `src/modes/detector.ts`.

## Architecture Overview

### Execution Flow

Single entrypoint: `src/entrypoints/run.ts` orchestrates four phases:

1. **Prepare** — Parse GitHub context, detect mode, authenticate, check permissions/triggers, create tracking comment, fetch GitHub data, construct prompt, setup branch and git config, configure MCP servers
2. **Install** — Install Claude Code CLI (v2.1.31) with retry logic, or use custom executable
3. **Execute** — Validate env, setup settings/plugins, prepare prompt file, run Claude via `base-action/` functions (imported directly, not as subprocess)
4. **Cleanup** (always runs) — Update tracking comment with results, write GitHub Actions step summary

SSH signing cleanup and token revocation are separate `always()` steps in `action.yml`, not in `run.ts`, so they execute even if the process crashes.

### Directory Structure

```
src/
├── entrypoints/
│   ├── run.ts                    # Main orchestrator (single entrypoint)
│   ├── cleanup-ssh-signing.ts    # SSH signing cleanup (always() step)
│   ├── collect-inputs.ts         # Track which action inputs are present
│   ├── format-turns.ts           # Format execution output for step summary
│   └── update-comment-link.ts    # Update tracking comment with results
├── modes/
│   ├── detector.ts               # Auto-detect "tag" vs "agent" mode
│   ├── tag/index.ts              # Tag mode preparation
│   └── agent/
│       ├── index.ts              # Agent mode preparation
│       └── parse-tools.ts        # Parse allowed tools from claude_args
├── github/
│   ├── api/
│   │   ├── client.ts             # Octokit REST + GraphQL client
│   │   ├── config.ts             # GitHub API URL configuration
│   │   └── queries/github.ts     # GraphQL queries for PR/issue data
│   ├── context.ts                # GitHub event context parsing (discriminated union)
│   ├── constants.ts              # Claude bot ID and login
│   ├── types.ts                  # GitHub data type definitions
│   ├── token.ts                  # GitHub token setup (user token > OIDC > App token)
│   ├── data/
│   │   ├── fetcher.ts            # Fetch PR/issue data via GraphQL
│   │   └── formatter.ts          # Format GitHub data as markdown for prompt
│   ├── validation/
│   │   ├── actor.ts              # Check human vs bot actor
│   │   ├── permissions.ts        # Check write permissions
│   │   └── trigger.ts            # Check @claude mentions, labels, assignments
│   ├── operations/
│   │   ├── branch.ts             # Branch creation and validation
│   │   ├── branch-cleanup.ts     # Branch cleanup
│   │   ├── git-config.ts         # Git auth and SSH signing setup
│   │   ├── comment-logic.ts      # Comment utility functions
│   │   └── comments/
│   │       ├── common.ts         # Shared comment operations
│   │       ├── create-initial.ts # Create initial tracking comment
│   │       └── update-claude-comment.ts  # Update comment with results
│   └── utils/
│       ├── actor-filter.ts       # Wildcard-based actor filtering
│       ├── image-downloader.ts   # Download images from GitHub comments
│       └── sanitizer.ts          # Content sanitization for security
├── create-prompt/
│   ├── index.ts                  # Prompt generation for tag mode
│   └── types.ts                  # Prompt-related types
├── mcp/
│   ├── github-comment-server.ts        # MCP: update tracking comment
│   ├── github-actions-server.ts        # MCP: CI/CD status queries
│   ├── github-file-ops-server.ts       # MCP: atomic file commits
│   ├── github-inline-comment-server.ts # MCP: inline PR review comments
│   ├── install-mcp-server.ts           # Install and configure MCP servers
│   └── path-validation.ts              # Security: validate file paths
└── utils/
    ├── retry.ts                  # Exponential backoff (3 attempts, 5s initial, 20s max)
    ├── branch-template.ts        # Branch name template variable substitution
    └── extract-user-request.ts   # Extract slash commands from content

base-action/                      # Published as @anthropic-ai/claude-code-base-action
├── src/
│   ├── index.ts                  # Standalone entry point
│   ├── run-claude.ts             # Wrapper around run-claude-sdk
│   ├── run-claude-sdk.ts         # Claude Agent SDK execution
│   ├── parse-sdk-options.ts      # Parse/merge SDK options from ClaudeOptions
│   ├── prepare-prompt.ts         # Validate and prepare prompt file
│   ├── setup-claude-code-settings.ts  # Load settings from JSON string or file
│   ├── install-plugins.ts        # Install Claude Code plugins
│   └── validate-env.ts           # Validate env vars per provider
└── test/                         # Base-action unit tests
```

### base-action

`base-action/` is also published standalone as `@anthropic-ai/claude-code-base-action`. Don't break its public API. It reads config from `INPUT_`-prefixed env vars (set by `action.yml`), not from action inputs directly. The main action imports its functions directly (not as a subprocess).

## Key Concepts

### Two Auth Domains

There are two separate auth domains — don't conflate them:

- **GitHub auth**: `github_token` input (user-provided) > GitHub App OIDC token (default). Token setup in `src/github/token.ts`.
- **Claude API auth**: `anthropic_api_key` or `claude_code_oauth_token`. Also supports `use_bedrock`, `use_vertex`, `use_foundry` for cloud providers.

### Mode Detection

`detectMode()` in `src/modes/detector.ts` returns `"tag"` or `"agent"`:

- **Tag mode**: Triggered by `@claude` mentions in comments, issue assignments/labels, or `track_progress=true`. Creates tracking comments, fetches full GitHub context, builds detailed prompt.
- **Agent mode**: Triggered when `prompt` input is provided. Writes user's prompt directly. Minimal GitHub context. No tracking comment by default.

If both `prompt` and a comment trigger exist, `prompt` wins (agent mode).

### Prompt Construction

This is the most important part of the action — it defines what Claude sees.

**Tag mode** (`src/create-prompt/index.ts`): Fetches GitHub data via GraphQL (`src/github/data/fetcher.ts`), formats as markdown (`src/github/data/formatter.ts`), and writes to a temp file. Includes:

- Issue/PR metadata (title, author, branch, state, additions/deletions)
- Body content (with images downloaded to disk and URLs replaced)
- All comments and review comments (filtered by actor include/exclude lists)
- Changed files with diffs
- CI status
- Detailed instructions (~870 lines) for task breakdown, code review, implementation

**Agent mode**: Writes user's `prompt` directly to temp file. Optional multi-block messaging if `claude-user-request.txt` exists alongside the prompt.

### MCP Servers

Four MCP servers are auto-installed to `~/.claude/mcp/github-{type}-server/` at runtime:

| Server                         | Tools                                                           | Purpose                              |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------ |
| `github-comment-server`        | `update_claude_comment`                                         | Update tracking comment              |
| `github-actions-server`        | `get_ci_status`, `get_workflow_run_details`, `download_job_log` | Query CI/CD                          |
| `github-file-ops-server`       | `commit_files`, `delete_files`                                  | Atomic commits with optional signing |
| `github-inline-comment-server` | (inline review tools)                                           | PR inline comments                   |

### GitHub Context Type System

`GitHubContext` in `src/github/context.ts` is a discriminated union:

```typescript
type GitHubContext = ParsedGitHubContext | AutomationContext;
```

- **`ParsedGitHubContext`**: Entity events (issues, issue_comment, pull_request, pull_request_review, pull_request_review_comment). Has `entityNumber` and `isPR`.
- **`AutomationContext`**: Automation events (workflow_dispatch, repository_dispatch, schedule, workflow_run). No entity fields.

Type guards: `isEntityContext()`, `isIssuesEvent()`, `isPullRequestEvent()`, `isIssueCommentEvent()`, `isPullRequestReviewEvent()`, `isPullRequestReviewCommentEvent()`, `isAutomationContext()`.

## Things That Will Bite You

- **Strict TypeScript**: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `strict` are all enabled. Typecheck will fail on unused variables. Array access returns `T | undefined`.
- **Discriminated unions**: Call `isEntityContext(context)` before accessing `context.entityNumber` or `context.isPR`. The compiler will not let you access them directly on `GitHubContext`.
- **Token lifecycle**: The GitHub App token is obtained early and revoked in a separate `always()` step in `action.yml`. Moving token revocation into `run.ts` means it won't run if the process crashes. Same for SSH signing cleanup.
- **Error phase attribution**: The catch block in `run.ts` uses `prepareCompleted` to distinguish prepare failures from execution failures. The tracking comment shows different messages depending on which phase failed.
- **`action.yml` outputs reference step IDs**: Outputs like `execution_file`, `branch_name`, `github_token` reference `steps.run.outputs.*`. If you rename the step ID in `action.yml`, update the outputs section too.
- **`WorkflowValidationSkipError`**: A special error in `src/github/token.ts` that causes the action to skip gracefully (sets `skipped_due_to_workflow_validation_mismatch` output) instead of failing.
- **Integration testing** happens in a separate repo (`install-test`), not here. The tests in this repo are unit tests only.
- **`verbatimModuleSyntax`**: All type-only imports must use `import type`. The compiler enforces this.
- **Branch name validation**: Strict whitelist pattern (`^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$`) prevents command injection. See `src/github/operations/branch.ts`.

## Code Conventions

- **Runtime is Bun, not Node.** Use `bun test` (Bun native test runner), not Jest. Use `bun:test` imports in test files.
- **`moduleResolution: "bundler"`** — imports don't need `.js` extensions.
- **`verbatimModuleSyntax`** — use `import type` for type-only imports.
- **GitHub API calls** should use retry logic from `src/utils/retry.ts` (exponential backoff: 3 attempts, 5s initial delay, 20s max, 2x backoff factor).
- **Content sanitization**: Use `src/github/utils/sanitizer.ts` when writing user-generated content to comments.
- **Path validation**: Use `src/mcp/path-validation.ts` for any file operations in MCP servers to prevent directory traversal.
- **Actor filtering**: Wildcard support (`*[bot]` matches all bots) in `src/github/utils/actor-filter.ts`.

## CI/CD

Workflows in `.github/workflows/`:

- **`ci.yml`**: Runs on PRs — `bun test`, `bun run format:check`, `bun run typecheck`
- **`test-base-action.yml`**: Tests base-action as standalone
- **`test-mcp-servers.yml`**: Tests MCP server functionality
- **`test-structured-output.yml`**: Tests `--json-schema` output
- **`sync-base-action.yml`**: Syncs base-action to npm registry
- **`release.yml`**: Creates releases and tags
- **`claude.yml`**: Dogfooding — Claude reviews PRs
- **`issue-triage.yml`**: Dogfooding — Claude triages issues
