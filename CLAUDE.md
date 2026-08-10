# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install             # Install dependencies
bun test                # Run all tests (Bun's test runner, not jest)
bun run test:coverage   # Run the suite with coverage, then the coverage gate
bun run typecheck       # TypeScript type checking (tsc --noEmit)
bun run format          # Format with prettier
bun run format:check    # Check formatting
bun run install-hooks   # Install the repo's pre-commit hook (format:check → typecheck → test)
```

Running a subset:

```bash
bun test test/restore-config.test.ts        # one file
bun test -t "validateBranchName"            # by test name, across all files
bun test test/modes/                        # one directory
```

Runtime is **Bun**, not Node. Bun's runner discovers `*.test.ts` recursively
from cwd, so a root `bun test` covers **both** `test/` and `base-action/test/`
(52 files at the time of writing) — that is exactly what CI runs. `base-action/`
also has its own `package.json` with the same script names for standalone use.

In a Claude Code session `bun run format` also runs automatically after every
file edit (the `PostToolUse` hook in `.claude/settings.json`), so `format:check`
usually passes without you doing anything. Edits made any other way — the GitHub
web UI, a plain `git commit` — bypass it, and the pre-commit hook or CI is where
that surfaces.

CI (`.github/workflows/ci.yml`) is four jobs: `bun test`, `bun run
format:check`, `bun run typecheck`, and `bun run test:coverage`. The first
three are what the pre-commit hook runs; the coverage gate deliberately stays
out of it, because it re-runs the whole suite to produce the lcov file and
doubling the hook's runtime to catch something CI catches anyway is a bad
trade. `ci-all.yml` is the orchestrator that calls it on every PR and push to
`main`; the integration `test-*.yml` jobs it used to call are commented out in
this fork (see Things That Will Bite You).

**The coverage job is separate from the `test` job on purpose.** If the two
shared a job, a red X would be ambiguous between "a test broke" and "coverage
slipped" — and this repo has already learned once what an ambiguous red check
costs (see the `test-*.yml` entry).

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
   the GitHub step summary via `formatTurnsFromData()`, and sets the step
   outputs (`branch_name`, `github_token`, `execution_file`, `session_id`,
   `structured_output`, `conclusion`, plus
   `skipped_due_to_workflow_validation_mismatch` from the prepare phase).
   **Only the first five are re-exported as composite-action outputs** —
   `conclusion` and `skipped_due_to_workflow_validation_mismatch` are consumed
   inside `action.yml` (the latter gates token revocation) and are invisible to
   callers. Adding a `core.setOutput()` in `run.ts` does not make it reachable
   from a workflow; add it to `action.yml`'s `outputs:` block too.

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
src/mcp/                   # in-process MCP servers (exported handlers + import.meta.main bootstrap) +
                           #   install-mcp-server.ts (writes .mcp.json) + tool-result (shared result envelope) +
                           #   inline-comment-buffer + path-validation (repo-root containment for file ops)
src/create-prompt/         # writes the assembled prompt to a temp file for the CLI
src/utils/                 # retry, branch-template, extract-user-request
scripts/                   # pre-commit hook + install-hooks.sh; check-coverage.ts (the CI coverage gate);
                           #   gh.sh / git-push.sh / edit-issue-labels.sh
                           #   (allow-listed wrappers this repo's own claude.yml + issue-triage.yml hand to Claude)
.github/workflows/         # ci.yml + ci-all.yml (the unit CI that actually gates PRs);
                           #   test-*.yml (integration, disabled in this fork); claude.yml + issue-triage.yml
                           #   (this repo dogfooding its own action, SHA-pinned); release, sync-base-action,
                           #   non-write-users-check
.claude/                   # this repo's OWN Claude Code config, not action code — see below
base-action/               # standalone @anthropic-ai/claude-code-base-action (mirrored)
agent-approval-check/      # separate composite action (Python) — require N human approvals on agent-authored PRs
docs/                      # user docs (setup, usage, configuration, security, cloud-providers, faq, migration, …)
examples/                  # ready-to-copy workflow YAMLs (claude.yml, pr-review-*, issue-triage, claude-wif, …)
test/                      # unit tests for this action (Bun)
bunfig.toml                # deliberately empty; action.yml pins `--config` to it (see Things That Will Bite You)
github-app-manifest.json   # manifest for creating the GitHub App the action authenticates as
```

Inside `src/github/` the less obvious modules are `utils/sanitizer.ts` (strips
zero-width/bidi/control characters, markdown image alt text, link titles and
hidden HTML `alt`/`title` attributes out of fetched GitHub content — the
prompt-injection hardening on everything an untrusted commenter can write),
`utils/image-downloader.ts` (pulls `user-attachments/assets` images referenced in
bodies/comments down to disk so Claude can read them), `utils/actor-filter.ts`
(the `include_/exclude_comments_by_actor` lists), `operations/branch-cleanup.ts`
(deletes the working branch again when Claude ended up committing nothing) and
`operations/comment-logic.ts` (what the tracking comment says in each terminal
state).

**`.claude/` is this repo's own tooling** — it configures Claude Code when
working _in_ this repo and ships nothing to action users. `.claude/settings.json`
registers a `PostToolUse` hook that runs `bun run format` after every
Edit/Write/MultiEdit, so formatting is normally already correct by the time you
commit. `.claude/agents/` holds five reviewer subagents (code-quality, security,
performance, test-coverage, documentation-accuracy), `.claude/commands/` three
slash commands (`commit-and-pr`, `review-pr`, `label-issue`), and
`.claude/workflows/pr-stamp-sweep.js` a multi-agent workflow that reviews
candidate PRs and adversarially verifies the security of each stamp candidate.

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

**Who is allowed to trigger a run.** `checkWritePermissions()`
(`src/github/validation/permissions.ts`) resolves the actor through the
collaborator-permission endpoint and requires `admin` or `write`. Two documented
escapes exist, both **default-deny**:

- `allowed_bots` — a `[bot]`-suffixed actor is trusted only if explicitly
  allow-listed (`*` allows all). The suffix is a reliable signal because GitHub
  usernames cannot contain `[` or `]`. Apps whose `GITHUB_ACTOR` is _not_
  `[bot]`-suffixed (Copilot) fall through to the API and are handled in the
  `catch` block, which consults the same list.
- `allowed_non_write_users` — a comma-separated user list, or `*`. Either way it
  logs a loud `SECURITY WARNING`.

**`allowed_non_write_users` only takes effect when `github_token` was supplied by
the caller** (the `githubTokenProvided` argument). Under the default GitHub App
token the bypass is ignored — the intent is that you hand such a workflow a
deliberately narrow token, so a low-privilege user cannot borrow the action's
broad default permissions. Setting the input is therefore not sufficient on its
own, which is easy to misread as the feature being broken.

Setting it also changes `action.yml`'s step wiring: three extra **best-effort**
steps run (`continue-on-error`, so a self-hosted runner without `sudo`/`apt` just
skips them). They install `bubblewrap` + `socat` for subprocess isolation and
relax `kernel.apparmor_restrict_unprivileged_userns` (Ubuntu 24.04+ blocks
unprivileged user namespaces); copy the resolved bun binary to
`$GITHUB_ACTION_PATH/bin/bun` so `always()` post-steps use the same version the
action ran with; and prepend `/usr/bin` and `/bin` to `PATH` (re-applied after
the run step). `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=0` opts out of the isolation
install. Because none of this is load-bearing on the happy path, a broken
sandbox degrades silently — check the step log, not the exit code.

`.github/workflows/non-write-users-check.yml` watches for the input being added
to any `.github/**` YAML in a PR and posts a one-time review comment (deduped by
an HTML marker). It is a nudge, not a gate.

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
timestamp and by the `include_/exclude_comments_by_actor` allow/deny lists, and
every untrusted body passes through `src/github/utils/sanitizer.ts` first —
anything a commenter writes reaches the model only after zero-width, bidi-
override and control characters, image alt text, link titles and hidden
`alt`/`title` attributes have been stripped. New fields added to the formatter
need the same treatment; that is the layer where a hidden-instruction injection
would otherwise land.

**Inline comment buffering + classification** (`classify_inline_comments`,
default `true`). During a PR review, inline comments made without
`confirmed=true` are **buffered** to `/tmp/inline-comments-buffer.jsonl`
(`src/mcp/github-inline-comment-server.ts` + `inline-comment-buffer.ts`) instead
of posting live. After the session, the `post-buffered-inline-comments.ts`
`always()` step classifies each buffered comment as "real review" vs
"test/probe" using Haiku and posts only the real ones. If no Anthropic key is
available (Bedrock/Vertex), it falls back to posting everything (pre-buffering
behavior). A comment posted live (`confirmed=true`) drops its buffered copy so
it isn't double-posted. The buffer file is **cleared by `prepareMcpConfig()`
before** a session enables the server and **deleted as soon as
`post-buffered-inline-comments.ts` reads it into memory** (not after posting, so
a failure can't leave it behind). Self-hosted runners are not ephemeral — a
leftover buffer would replay a previous PR's review comments onto the current
one. Same clear-before-use reasoning as the `RUNNER_TEMP` handling in
`src/create-prompt/index.ts`.

**Config restore from base (security).** On PR events the checked-out PR head is
attacker-controlled, and the CLI trusts cwd at startup: it reads `.mcp.json` and
`.claude/settings*.json` and acts on them (hooks incl. SessionStart; env vars
like `NODE_OPTIONS`/`LD_PRELOAD`; `apiKeyHelper` shell commands; MCP
auto-approval) _before_ any tool-permission gating. `run.ts` calls
`restoreConfigFromBase()` (`src/github/operations/restore-config.ts`) to replace
those paths with the PR's reviewed **base**-branch versions before the CLI reads
them. It reads `pull_request.base.ref` from the payload directly (agent mode's
`baseBranch` defaults to the repo default, not the PR target);
`validateBranchName()` guards the ref. Details worth knowing before you touch it:

- **It covers more than `.claude/` + `.mcp.json`.** The full `SENSITIVE_PATHS`
  set is `.claude`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`,
  `CLAUDE.md`, `CLAUDE.local.md`, `.husky` — every PR-controllable path read from
  cwd at CLI startup. Paths absent on base are **deleted**, and a failed restore
  leaves the path deleted (fail-safe: never attacker-controlled).
- **`.claude-pr/` review snapshot.** Before the security delete, each PR-authored
  sensitive path is copied into `.claude-pr/` (git-excluded via
  `.git/info/exclude`) so review agents can see what the PR changed _without
  those files ever executing_. A symlink whose target is absent on the PR head is
  preserved as-is instead of dereferenced (the ENOENT `cpSync` fallback).
- **Delete happens before `git fetch`** (plus `--no-recurse-submodules`): an
  attacker-controlled `.gitmodules` present during the fetch would trigger
  submodule fetching that blocks on credential prompts and hangs CI — deleting
  first closes that DoS window. Order is snapshot → delete → fetch →
  checkout-from-base → `git reset` (unstage, so the revert doesn't leak into
  later CLI commits). Don't reorder.

**MCP servers.** `src/mcp/install-mcp-server.ts` (`prepareMcpConfig()`) writes an
`.mcp.json` listing in-process Bun MCP servers referenced by path under
`$GITHUB_ACTION_PATH/src/mcp/`: `github_comment` (comment-server),
`github_file_ops` (file-ops-server, commit/push with optional signing),
`github_inline_comment` (inline-comment-server), and `github_ci`
(github-actions-server, CI/logs) — plus the official `github` MCP server via
its pinned Docker image. Which servers are enabled depends on mode/permissions.
File paths reaching `github_file_ops` go through `validatePathWithinRepo()`
(`src/mcp/path-validation.ts`), which `realpath`s both sides so neither `../`
nor a symlink can write outside the repo root.

**All four follow the same shape, and a new one should too.** Each server file
exports its tool handlers as named functions that **throw** on failure, reads
its environment through an exported `read*Context(env)` that a test can hand a
fixture instead of mutating `process.env`, registers the tools as thin bindings
inside a `create*Server()` factory, and puts the stdio bootstrap behind
`if (import.meta.main)`. The last parameter of each handler is an optional
Octokit (or, for file-ops, a mockable `node-fetch`), which is how the tests
inject a stub — `mock.module` is process-wide in Bun, so mocking a first-party
module leaks into every other test file in the run.

That shape is not cosmetic: before it, these were 1,104 lines at **zero**
coverage and could not be tested at all. Env validation ran at module scope and
called `process.exit(1)`, the tool bodies were anonymous callbacks inside
top-level `server.tool()` calls, and `runServer()` fired on import — so merely
importing one started a stdio server. The startup fail-fast still exists; it
moved inside `runServer()` so the exit only happens when the file really is the
entrypoint.

Registering a tool is not the same as it working. `test/mcp-servers-smoke.test.ts`
spawns each server the way `action.yml` does (`bun run <path>`) and drives a
real MCP handshake plus one `tools/call`, because a handler unit test stays
green for a server that no longer starts or has stopped advertising a tool —
which is precisely the failure the `import.meta.main` guard makes possible. The
shared result envelope lives in `src/mcp/tool-result.ts` so the four cannot
drift apart on what an error looks like to the model.

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
- **`restoreConfigFromBase()` ordering is load-bearing** — snapshot → delete →
  fetch → checkout-from-base → unstage. The delete precedes `git fetch` so an
  attacker-controlled `.gitmodules` can't hang CI on a submodule credential
  prompt; don't reorder (see the security section).
  `test/restore-config-ordering.test.ts` asserts the sequence, and asserts that
  the sensitive paths are already gone when `git fetch` runs. It exists because
  `restore-config.ts` was at 100% line coverage and the reordering still passed:
  every statement runs either way. Measured — with the delete moved below the
  fetch, all six tests in `test/restore-config.test.ts` stayed green.
- **Error phase attribution**: `run.ts` uses `prepareCompleted` to distinguish
  prepare failures from execution failures; the tracking comment shows different
  messages for each.
- **Never `process.exit()` from code `run.ts` imports.** `setupBranch()`,
  `prepareMcpConfig()`, and `createPrompt()` used to exit(1) on error — a
  leftover from when each was its own action.yml step. In-process that kills
  `run.ts`'s `finally`: the GitHub App token is never revoked and the tracking
  comment stays stuck at "Claude is working…". **Throw** instead. `process.exit()`
  is fine only in the `src/mcp/*-server.ts` entrypoints, which really are their
  own processes. `test/no-process-exit-in-run-graph.test.ts` walks `run.ts`'s
  transitive local imports and fails on a new one.
  `src/entrypoints/update-comment-link.ts` is the single allow-listed exception:
  its exits sit behind an `import.meta.main` guard, which the same test requires
  it to keep.
- **The coverage gate checks for zero-coverage files, not just a percentage.**
  `scripts/check-coverage.ts` (run by `bun run test:coverage`, and by the
  `coverage` job in `ci.yml`) enumerates `src/**` and `base-action/src/**` and
  fails on any file absent from the lcov report. That shape is the whole point:
  **Bun omits files no test ever imports rather than listing them at 0%**, so an
  untested file is invisible in _both_ halves of the percentage. That is exactly
  how 1,485 code lines — the four MCP servers among them — sat at zero while the
  headline read 82.58%. A plain threshold would have reported that repo as
  healthy, so replacing this with one re-opens the hole it was written to close.
  Files that genuinely cannot be covered go in `KNOWN_UNCOVERED` **with a
  reason**; the gate also fails on a _stale_ entry (file now covered, or gone),
  so the list can't rot into a rubber stamp. `MINIMUM_LINE_COVERAGE` is a
  secondary floor, on lcov's basis — which is not the same number the `text`
  reporter prints (71.91% vs 80.80% for the same run), so don't copy a figure
  between them.
- **The file-ops ref update retries _everything_, not just the 403.** The 403
  retry in `github-file-ops-server.ts` exists for a real transient GitHub
  failure ("Resource not accessible by integration"), but no `shouldRetry`
  predicate is passed to `retryWithBackoff`, so a permanent error — a bad ref, a
  revoked token — also costs the full three attempts and ~3s before surfacing.
  The old comment on that branch claimed non-403s "fail immediately without
  retry"; the code has never done that. Actual behaviour is pinned by
  `test/mcp-file-ops-server.test.ts`, so narrowing the retry is a deliberate
  behaviour change and will turn that test red — which is the point. Note also
  that `commit_files` and `delete_files` share this path but differ by one
  console line on 403, preserved behind `logRetryOn403` rather than normalised
  away.
- **`PrepareTagModeError` carries the comment id.** `run.ts` normally learns the
  tracking-comment id from `prepareTagMode()`'s return value, so anything that
  throws after the comment is created (data fetch, git auth, `createPrompt()`,
  MCP config) would leave the comment stale. Throw `PrepareTagModeError` from
  that window so the catch block can still update it.
- **Two tokenizers must stay in agreement**: `src/modes/agent/parse-tools.ts`
  and `base-action/src/parse-sdk-options.ts` both parse `claude_args`/allowed
  tools, including the same escape-and-restore of `()|&;<>` through private-use
  codepoints before `shell-quote`'s `parse()`. Fix one, fix the other — a drift
  grants a tool whose MCP server was never installed, or vice versa.
  `test/tokenizer-agreement.test.ts` runs a shared table of `claude_args`
  through both and compares the resulting tool **sets**. Order is deliberately
  not part of the contract: when one string mixes `--allowedTools` and
  `--allowed-tools`, parse-sdk-options groups all values of the first spelling
  ahead of the second while parse-tools keeps encounter order. Permission lists
  are sets, so that difference is benign — it is pinned explicitly rather than
  left to be rediscovered. Watch the escape tables in particular:
  `parse-sdk-options.ts` embeds the literal U+E000–U+E006 characters, which are
  invisible in most editors and diffs, while `parse-tools.ts` builds them with
  `String.fromCodePoint`.
- **Pass `--` before any path in a git subprocess.** Changed-file paths come
  straight from the PR author, so a file named `-w` or `--stdin` is otherwise
  parsed as a flag (this silently produced wrong hashes in `fetcher.ts`).
  `branch.ts`, `restore-config.ts`, and `fetcher.ts` all guard this way.
- **`action.yml` outputs reference the `run` step id**: `execution_file`,
  `branch_name`, `github_token`, `structured_output`, `session_id` all read
  `steps.run.outputs.*`. Rename the step id → update the outputs section too.
  Note the asymmetry: `run.ts` also sets `conclusion` and
  `skipped_due_to_workflow_validation_mismatch`, which are **not** in the
  `outputs:` block and so never reach a caller — a `core.setOutput()` alone
  publishes nothing. `test/action-yml-wiring.test.ts` checks that every declared
  output points at a step id that exists and at a name `run.ts` actually sets,
  and that the two internal-only outputs stay exactly that — so adding a
  `setOutput()` without exporting it fails loudly instead of silently
  publishing nothing.
- **Don't pass `--tsconfig-override` to Bun**: it triggers a Bun runtime crash
  (see the comment in `action.yml`'s run step and `cleanup-ssh-signing`). Bun
  auto-discovers the action's `tsconfig.json`.
- **`bunfig.toml` is empty on purpose, and must keep existing.** All three bun
  invocations in `action.yml` (the run step, `cleanup-ssh-signing`,
  `post-buffered-inline-comments`) pass
  `--config="${GITHUB_ACTION_PATH}/bunfig.toml"` so Bun takes its runtime config
  from the action directory instead of discovering the _checked-out repo's_
  `bunfig.toml`. Worth knowing: `bunfig.toml` is **not** in `SENSITIVE_PATHS`, so
  unlike `.mcp.json` and `.claude/` it is never reverted to the base branch — on
  a PR event the pin is the only thing standing between a PR-authored
  `bunfig.toml` and the runtime. Deleting the file as "unused", or adding a bun
  invocation without the flag, drops that. Add new bun calls with the flag —
  `test/action-yml-wiring.test.ts` fails on one that runs a `src/entrypoints/`
  file without it, and also pins the set of entrypoints that are their own
  steps. `bun install` is the one deliberate exemption: that step `cd`s into
  `GITHUB_ACTION_PATH` first, so Bun's config discovery already starts in the
  action's own checkout.
- **`prepare.ts` is dead code** — the prepare phase lives in `run.ts`. Edit
  `run.ts`.
- **Some `entrypoints/` files are modules, not steps** — `collect-inputs`,
  `update-comment-link`, `format-turns` are imported by `run.ts`.
- **`test/` and `base-action/test/` are almost entirely unit tests.** Three
  exceptions run real subprocesses and are worth knowing about before you assume
  a test is pure: `restore-config*.test.ts` drive actual `git` against throwaway
  repositories, `ssh-signing.test.ts` does the same, and
  `mcp-servers-smoke.test.ts` spawns each MCP server with `bun run` and speaks
  MCP to it over stdio. None of them touch the network. Integration coverage
  proper lives in `.github/workflows/test-*.yml` (base-action, custom
  executables, MCP servers, settings, structured output), which invoke the action for real and
  need `id-token: write` plus `ANTHROPIC_FEDERATION_RULE_ID` /
  `ANTHROPIC_ORGANIZATION_ID` / `ANTHROPIC_SERVICE_ACCOUNT_ID`. They can't be run
  locally with `bun test`. **In this fork they are disabled** — none of those
  variables are set, so all five failed on every PR (~20 permanently red checks,
  which is how a real failure goes unnoticed). Their `pull_request` triggers are
  removed and the jobs in `ci-all.yml` are commented out; `workflow_dispatch` and
  `workflow_call` still work. `ci-all.yml` carries the note on how to restore
  them.
- **No workflow in this fork goes red merely for missing Claude credentials.**
  `claude.yml` and `issue-triage.yml` invoke the action against the Claude API,
  so without the federation variables they died in
  `validateEnvironmentVariables()` — an unexplained red X on every `@claude`
  mention and every new issue, with the reason only in the log. Both now compute
  a job-level `HAS_CLAUDE_AUTH` env — non-empty
  `vars.ANTHROPIC_FEDERATION_RULE_ID` **and** `vars.ANTHROPIC_ORGANIZATION_ID`;
  the `vars` context is unavailable in a job-level `if`, hence the env
  indirection — gate every real step on it, and otherwise emit a `::notice`
  naming the variables to set. Keep that shape when adding a workflow that
  reaches the Claude API. With the variables present nothing changes.
- **`claude-review.yml` was removed, not disabled.** The automatic
  review-on-PR-open workflow is gone from `.github/workflows/`. Guarding it was
  not enough: dormant, it would have woken up and commented on every PR the
  moment the federation variables were set — which is the recommended next step
  for this fork — and its one real run finished in two seconds with "I'll
  analyze this and get back to you" and never produced a review. `claude.yml`
  stays because there a person asks with `@claude` and gets an answer. Re-add
  from `examples/` if the review quality changes.

## Code Conventions

- Runtime is **Bun**, not Node. Use `bun test`, not `jest`.
- `moduleResolution: "bundler"` — imports don't need `.js` extensions.
- GitHub API calls should use the retry helper (`src/utils/retry.ts`).
- Prefer the existing context guards over ad-hoc `eventName` checks.
- `base-action/` is a mirror — coordinate changes with the upstream/sync
  workflow; don't break its `INPUT_`-env public API.
