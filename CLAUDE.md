# CLAUDE.md

## Commands

```bash
bun test                # Run tests (Bun's test runner, not jest)
bun run typecheck       # TypeScript type checking (tsc --noEmit)
bun run format          # Format with prettier
bun run format:check    # Check formatting
bun run install-hooks   # Install the repo's git hooks (pre-push)
```

Runtime is **Bun**, not Node. `bun test` runs everything under `test/`;
`base-action/` has its own suite under `base-action/test/`.

## What This Is

A GitHub Action (published as `anthropics/claude-code-action@v1`) that lets
Claude respond to `@claude` mentions on issues/PRs (**tag mode**) or run tasks
via a `prompt` input (**agent mode**). Mode is **auto-detected** by
`detectMode()` in `src/modes/detector.ts`:

- A comment/issue/PR event with an `@claude` trigger (mention, assignee, or
  label) and **no** `prompt` → **tag** mode (interactive, posts a tracking
  comment).
- A `prompt` provided on any event → **agent** mode (headless automation).
- `track_progress: true` forces **tag** mode (with a tracking comment) for
  `pull_request`/`issues`/comment/review events even in automation.
- Everything else defaults to agent mode, which no-ops without a prompt.

It supports the direct Anthropic API, Bedrock, Vertex, Microsoft Foundry, and
**workload identity federation** (OIDC-exchanged Anthropic tokens, no static
key). See `action.yml` for the full input surface.

## How It Runs

**One live entrypoint: `src/entrypoints/run.ts`.** It is a unified TypeScript
orchestrator (the header calls it "Merges all previously separate action.yml
steps into a single orchestrator") that runs four phases inside one
try/catch/finally:

1. **Prepare** — `collectActionInputsPresence()`, `parseGitHubContext()`,
   `detectMode()`, `setupGitHubToken()`, `checkWritePermissions()`,
   `checkContainsTrigger()`, then the mode's prepare
   (`prepareTagMode()` / `prepareAgentMode()`). Early-returns (no trigger,
   workflow-validation skip) exit cleanly here.
2. **Install** — `installClaudeCode()` shells out to `claude.ai/install.sh`
   (3 retries) unless `PATH_TO_CLAUDE_CODE_EXECUTABLE` is set. **The Claude
   Code version is pinned in `run.ts`** (`claudeCodeVersion`) and bumped by the
   routine `chore: bump Claude Code …` PRs — that's the version travelling with
   the action.
3. **Run** — imports `base-action/` functions **directly** (not as a
   subprocess): `setupWorkloadIdentity()`, `validateEnvironmentVariables()`,
   `restoreConfigFromBase()` (security, see below), `setupClaudeCodeSettings()`,
   `installPlugins()`, `preparePrompt()`, then `runClaude()`.
4. **Cleanup (`finally`, always runs)** — stops the workload-identity token
   refresher, updates the tracking comment via `updateCommentLink()`, writes
   the GitHub step summary via `formatTurnsFromData()`, and sets the action
   outputs (`branch_name`, `github_token`, `execution_file`, `session_id`,
   `structured_output`, `conclusion`).

**Sibling files in `src/entrypoints/` are NOT all standalone steps.**
`collect-inputs.ts`, `update-comment-link.ts`, and `format-turns.ts` are
**helper modules imported by `run.ts`** (they live here for historical
reasons). Only these entrypoints are invoked as their own `action.yml` steps:

- `cleanup-ssh-signing.ts` — separate `always()` step (removes the SSH signing
  key). Kept out of `run.ts` so it runs even if the process crashes.
- `post-buffered-inline-comments.ts` — separate `always()` step (see inline
  comment buffering below).

`prepare.ts` is a **legacy standalone entrypoint, no longer wired into
`action.yml`** — its logic was inlined into `run.ts`'s prepare phase. Don't
extend it; change `run.ts`.

Token revocation is a final inline `curl` `always()` step in `action.yml` (not
TypeScript), so it runs regardless of process state.

## base-action

`base-action/` is also published standalone as
`@anthropic-ai/claude-code-base-action` — **don't break its public API.** It
reads config from **`INPUT_`-prefixed env vars** (set by `action.yml`), not
from action inputs directly. `run.ts` imports its functions rather than
spawning it. Notable modules: `run-claude.ts` / `run-claude-sdk.ts` (drives the
Agent SDK), `prepare-prompt.ts`, `setup-claude-code-settings.ts`,
`validate-env.ts`, `parse-sdk-options.ts` (parses `claude_args`/allowed-tools),
`install-plugins.ts`, `workload-identity.ts`, `execution-file.ts`. It is
mirrored, not developed in place — `.github/workflows/sync-base-action.yml`
keeps the standalone copy in sync (see `base-action/MIRROR_DISCLAIMER.md` and
`base-action/CLAUDE.md`).

## Repository layout

```
action.yml                 # Composite action: input surface + step wiring (the source of truth for env/steps)
src/entrypoints/           # run.ts (live) + cleanup-ssh-signing, post-buffered-inline-comments (steps);
                           #   collect-inputs, update-comment-link, format-turns (helper modules); prepare.ts (legacy)
src/modes/                 # detector.ts + tag/ + agent/ (each mode's prepare*() )
src/github/                # token, context (discriminated-union GitHubContext), api/, data/ (fetch+format the prompt),
                           #   operations/ (branch, comments, git-config, restore-config), validation/, utils/
src/mcp/                   # in-process MCP servers + install-mcp-server.ts (writes .mcp.json) + inline-comment-buffer
src/utils/                 # retry, branch-template, extract-user-request
base-action/               # standalone @anthropic-ai/claude-code-base-action (mirrored)
agent-approval-check/      # separate composite action (Python) — require N human approvals on agent-authored PRs
docs/                      # user docs (setup, usage, configuration, security, cloud-providers, faq, migration, …)
examples/                  # ready-to-copy workflow YAMLs (claude.yml, pr-review-*, issue-triage, claude-wif, …)
test/                      # unit tests for this action (Bun)
```

## Key Concepts

**Auth priority (GitHub).** `github_token` input (user-provided) > GitHub App
OIDC token (default, auto-minted and auto-revoked). `claude_code_oauth_token` /
`anthropic_api_key` are for the **Claude API**, not GitHub. Token setup lives in
`src/github/token.ts`. For the Claude API, workload identity federation
(`anthropic_federation_rule_id` + `anthropic_organization_id`, requires
`id-token: write`) is an alternative to a static key —
`base-action/src/workload-identity.ts` mints a GitHub OIDC JWT, writes it to a
file, and points the CLI at it via `ANTHROPIC_IDENTITY_TOKEN_FILE`, refreshing
it in the background.

**Mode lifecycle.** `detectMode()` returns `"tag"` or `"agent"`. Trigger
checking and prepare dispatch are inlined in `run.ts`: tag mode calls
`prepareTagMode()` (`src/modes/tag/`), agent mode calls `prepareAgentMode()`
(`src/modes/agent/`). Both prepare `git-config` (auth + optional SSH signing),
check the human actor, and build the MCP config; tag mode additionally creates
the tracking comment and sets up the working branch.

**Prompt construction (the most important part — it's what Claude sees).** Tag
mode's `prepareTagMode()` fetches GitHub data (`src/github/data/fetcher.ts`),
formats it as markdown (`src/github/data/formatter.ts` — issue/PR body,
comments, diff, changed files, review comments, CI status, labels), and writes
it to a temp file via `createPrompt()` (`src/create-prompt/`). Agent mode writes
the user's `prompt` directly. Comment/review data is filtered to the trigger
timestamp and by the `include_/exclude_comments_by_actor` allow/deny lists.

**Inline comment buffering + classification** (`classify_inline_comments`,
default `true`). During a PR review, inline comments made without
`confirmed=true` are **buffered** to `/tmp/inline-comments-buffer.jsonl`
(`src/mcp/github-inline-comment-server.ts` + `inline-comment-buffer.ts`) instead
of posting live. After the session, the `post-buffered-inline-comments.ts`
`always()` step classifies each buffered comment as "real review" vs
"test/probe" using Haiku and posts only the real ones. If no Anthropic key is
available (Bedrock/Vertex), it falls back to posting everything (pre-buffering
behavior). A comment posted live (`confirmed=true`) drops its buffered copy so
it isn't double-posted.

**Config restore from base (security).** On PR events, `.claude/` and `.mcp.json`
in the checkout are attacker-controlled. `run.ts` calls `restoreConfigFromBase()`
(`src/github/operations/restore-config.ts`) to restore those CLI-startup paths
from the PR's **base** branch before the CLI reads them. It reads
`pull_request.base.ref` from the payload directly (agent mode's `baseBranch`
defaults to the repo default, not the PR target). `validateBranchName()` guards
the ref.

**MCP servers.** `src/mcp/install-mcp-server.ts` (`prepareMcpConfig()`) writes an
`.mcp.json` listing in-process Bun MCP servers referenced by path under
`$GITHUB_ACTION_PATH/src/mcp/`: `github_comment` (comment-server),
`github_file_ops` (file-ops-server, commit/push with optional signing),
`github_inline_comment` (inline-comment-server), and `github_ci`
(github-actions-server, CI/logs) — plus the official `github` MCP server via
its pinned Docker image. Which servers are enabled depends on mode/permissions.

**Plugins.** `plugins` / `plugin_marketplaces` inputs →
`base-action/src/install-plugins.ts` installs Claude Code plugins before the
run (names/URLs are strictly validated against path traversal).

## Things That Will Bite You

- **Strict TypeScript**: `noUnusedLocals` and `noUnusedParameters` are on.
  Typecheck fails on unused variables/params.
- **Discriminated unions for GitHub context**: `GitHubContext` is a union —
  call `isEntityContext(context)` before touching entity fields like
  `context.issue` / `context.pullRequest`. Similar guards exist for event kinds
  (`isPullRequestEvent`, `isIssueCommentEvent`, …).
- **Token/cleanup lifecycle**: the GitHub App token is minted early and revoked
  in a separate `always()` step; SSH-signing cleanup and buffered-inline-comment
  posting are also separate `always()` steps. Moving any of these into `run.ts`
  means they won't run if the process crashes.
- **Error phase attribution**: `run.ts` uses `prepareCompleted` to distinguish
  prepare failures from execution failures; the tracking comment shows different
  messages for each.
- **`action.yml` outputs reference the `run` step id**: `execution_file`,
  `branch_name`, `github_token`, `structured_output`, `session_id` all read
  `steps.run.outputs.*`. Rename the step id → update the outputs section too.
- **Don't pass `--tsconfig-override` to Bun**: it triggers a Bun runtime crash
  (see the comment in `action.yml`'s run step and `cleanup-ssh-signing`). Bun
  auto-discovers the action's `tsconfig.json`.
- **`prepare.ts` is dead code** — the prepare phase lives in `run.ts`. Edit
  `run.ts`.
- **Some `entrypoints/` files are modules, not steps** — `collect-inputs`,
  `update-comment-link`, `format-turns` are imported by `run.ts`.
- **Integration testing** happens in a separate repo (`install-test`), not
  here. Tests in this repo (and `base-action/test/`) are unit tests.

## Code Conventions

- Runtime is **Bun**, not Node. Use `bun test`, not `jest`.
- `moduleResolution: "bundler"` — imports don't need `.js` extensions.
- GitHub API calls should use the retry helper (`src/utils/retry.ts`).
- Prefer the existing context guards over ad-hoc `eventName` checks.
- `base-action/` is a mirror — coordinate changes with the upstream/sync
  workflow; don't break its `INPUT_`-env public API.
