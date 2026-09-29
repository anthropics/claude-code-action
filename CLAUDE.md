# CLAUDE.md

## Commands

```bash
bun test                # Run tests
bun run typecheck       # TypeScript type checking
bun run format          # Format with prettier
bun run format:check    # Check formatting
```

## What This Is

A GitHub Action that lets Claude respond to `@claude` mentions on issues/PRs (tag mode) or run tasks via `prompt` input (agent mode). Mode is auto-detected: if `prompt` is provided, it's agent mode; if triggered by a comment/issue event with `@claude`, it's tag mode. See `src/modes/detector.ts`.

## How It Runs

Single entrypoint: `src/entrypoints/run.ts` orchestrates everything — prepare (auth, permissions, trigger check, branch/comment creation), install Claude Code CLI, execute Claude via `base-action/` functions (imported directly, not subprocess), then cleanup (update tracking comment, write step summary). SSH signing cleanup and token revocation are separate `always()` steps in `action.yml`.

`base-action/` is also published standalone as `@anthropic-ai/claude-code-base-action`. Don't break its public API. It reads config from `INPUT_`-prefixed env vars (set by `action.yml`), not from action inputs directly.

## Key Concepts

**Auth priority**: `github_token` input (user-provided) > GitHub App OIDC token (default). The `claude_code_oauth_token` and `anthropic_api_key` are for the Claude API, not GitHub. Token setup lives in `src/github/token.ts`.

**Mode lifecycle**: `detectMode()` in `src/modes/detector.ts` picks the mode name ("tag" or "agent"). Trigger checking and prepare dispatch are inlined in `run.ts`: tag mode calls `prepareTagMode()` from `src/modes/tag/`, agent mode calls `prepareAgentMode()` from `src/modes/agent/`.

**Prompt construction**: Tag mode's `prepareTagMode()` builds the prompt by fetching GitHub data (`src/github/data/fetcher.ts`), formatting it as markdown (`src/github/data/formatter.ts`), and writing it to a temp file via `createPrompt()`. Agent mode writes the user's prompt directly. The prompt includes issue/PR body, comments, diff, and CI status. This is the most important part of the action — it's what Claude sees.

## Things That Will Bite You

- **Strict TypeScript**: `noUnusedLocals` and `noUnusedParameters` are enabled. Typecheck will fail on unused variables.
- **Discriminated unions for GitHub context**: `GitHubContext` is a union type — call `isEntityContext(context)` before accessing entity-specific fields like `context.issue` or `context.pullRequest`.
- **Token lifecycle matters**: The GitHub App token is obtained early and revoked in a separate `always()` step in `action.yml`. If you move token revocation into `run.ts`, it won't run if the process crashes. Same for SSH signing cleanup.
- **Error phase attribution**: The catch block in `run.ts` uses `prepareCompleted` to distinguish prepare failures from execution failures. The tracking comment shows different messages for each.
- **`action.yml` outputs reference step IDs**: Outputs like `execution_file`, `branch_name`, `github_token` reference `steps.run.outputs.*`. If you rename the step ID, update the outputs section too.
- **Integration testing** happens in a separate repo (`install-test`), not here. The tests in this repo are unit tests.

## Code Conventions

- Runtime is Bun, not Node. Use `bun test`, not `jest`.
- `moduleResolution: "bundler"` — imports don't need `.js` extensions.
- GitHub API calls should use retry logic (`src/utils/retry.ts`).
- MCP servers are auto-installed at runtime to `~/.claude/mcp/github-{type}-server/`.

## Security hardening for GitHub Actions

Workflow jobs in this repository that call Claude run with three protections. Keep them when you add or edit a workflow.

1. **Egress-firewall runner.** The job has `runs-on: ubuntu-24.04-firewall`, a GitHub-hosted runner that filters the job's outbound network traffic. Do not move a job that calls Claude to another runner.
2. **Network allow list.** `.github/egress-firewall.yaml` lists the hosts those jobs may reach, besides any that GitHub's firewall allows by default. Keep `mode: enforce`, which is what makes the firewall block the rest. Follow that file's header when you add a host.
3. **Auto permission mode.** Every step that runs the Claude Code action (`uses: anthropics/claude-code-action`, or this repository's own `./` and `./base-action`) passes `--permission-mode auto` in `claude_args`. A tool call that needs permission and that the allowed tools do not cover then runs only if Claude Code's safety review passes it. Allow only the tools the job needs, and keep any `--disallowedTools` list a step has. Use `claude-opus-4-6` or a newer model: on an older one Claude Code falls back to its default permission mode.

`claude.yml` answers `@claude` mentions. The Claude Code action sets `--permission-mode acceptEdits` for those, and the `--permission-mode auto` in the workflow's `claude_args`, which comes after it, replaces it.

`.github/workflows/workflow-hardening.yml` fails when a job that runs the Claude Code action or mentions `ANTHROPIC_FEDERATION_RULE_ID` breaks protection 1 or 3, or when the allow list is missing, empty, not `mode: enforce`, or names a host with `*`. It cannot see a job that calls Claude another way, so check new workflows by hand too. If a job cannot meet protection 1 or 3, add it with the reason to the matching exemption table in `.github/scripts/check_workflow_hardening.py`. A job in `EXEMPT_FROM_AUTO_MODE` must set no permission mode at all. Do not skip or weaken the check.

Keep each workflow's `permissions:` block minimal, and never print tokens or environment variables in workflow logs.
