# Using this repo as a Claude Code plugin

Alongside its role as a GitHub Action, this repository is installable as a
Claude Code plugin. The plugin bundles the MCP servers the action configures so
you can drive them from an interactive Claude Code session instead of only from
inside a workflow run.

- Manifest: [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json)
- Server config: [`.mcp.json`](../.mcp.json)

## Bundled servers

| Server                  | Source                                      | Tools                                                           |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `github_comment`        | `src/mcp/github-comment-server.ts`          | `update_claude_comment`                                         |
| `github_inline_comment` | `src/mcp/github-inline-comment-server.ts`   | `create_inline_comment`                                         |
| `github_file_ops`       | `src/mcp/github-file-ops-server.ts`         | `commit_files`, `delete_files`                                  |
| `github_ci`             | `src/mcp/github-actions-server.ts`          | `get_ci_status`, `get_workflow_run_details`, `download_job_log` |
| `github`                | `ghcr.io/github/github-mcp-server` (Docker) | Upstream GitHub toolset                                         |

The first four are this repo's own code, spawned as stdio processes with `bun`
using the same flags the action uses (`--no-env-file` plus `--config` pinned to
this repo's `bunfig.toml`) so runtime config resolves from the plugin directory
rather than your current working directory.

The fifth, `github`, is GitHub's own upstream server. It runs as a Docker
container pinned to the same digest the action pins — `sha-23fa0dd`,
[v0.17.1](https://github.com/github/github-mcp-server/releases/tag/v0.17.1).
Bump it here and in `prepareMcpConfig` together, or the plugin and the action
will drift.

## Requirements

- `bun` on `PATH`.
- Dependencies installed in the plugin directory (`bun install`).
- A GitHub token with access to the target repository.
- A running Docker daemon, but only for the `github` server. The other four do
  not need it.

## Environment variables

Values are read from your shell at server start. Variables with a default are
optional.

### Required by the four `bun` servers

| Variable       | Purpose                              |
| -------------- | ------------------------------------ |
| `GITHUB_TOKEN` | Token used for all GitHub API calls. |
| `REPO_OWNER`   | Owner of the target repository.      |
| `REPO_NAME`    | Name of the target repository.       |

### Per server

| Variable                       | Servers                           | Default                          |
| ------------------------------ | --------------------------------- | -------------------------------- |
| `GITHUB_API_URL`               | comment, inline_comment, file_ops | `https://api.github.com`         |
| `GITHUB_EVENT_NAME`            | comment, file_ops                 | empty                            |
| `CLAUDE_COMMENT_ID`            | comment                           | empty                            |
| `PR_NUMBER`                    | inline_comment, ci                | _required_                       |
| `CLASSIFY_INLINE_COMMENTS`     | inline_comment                    | `false`                          |
| `BRANCH_NAME`                  | file_ops                          | _required_                       |
| `BASE_BRANCH`                  | file_ops                          | `main`                           |
| `REPO_DIR`                     | file_ops                          | _required_ — local checkout path |
| `IS_PR`                        | file_ops                          | `false`                          |
| `RUNNER_TEMP`                  | ci                                | `/tmp`                           |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | github                            | _required_                       |
| `GITHUB_SERVER_URL`            | github                            | `https://github.com`             |

The `github` server reads its own `GITHUB_PERSONAL_ACCESS_TOKEN` rather than
`GITHUB_TOKEN`. The action passes the same value to both; locally you can do the
same, or scope a separate token to it.

For GitHub Enterprise, set `GITHUB_API_URL` to your instance's API endpoint and
`GITHUB_SERVER_URL` to its web host.

## Caveats

The four `bun` servers were written for the Actions runtime, and that shows:

- `github_comment` edits a specific tracking comment. Without a valid
  `CLAUDE_COMMENT_ID` it has nothing to update.
- `github_inline_comment` and `github_ci` only make sense against a real pull
  request, so `PR_NUMBER` must point at one.
- `github_file_ops` commits through the GitHub API (the commit-signing path),
  not through local git. It writes to `BRANCH_NAME` on the remote.

The `github` server is the exception. It is a general-purpose GitHub toolset
with no Actions-specific assumptions, so it behaves normally in a local session.

## Verifying the install

Run `/mcp` in an interactive session to confirm the servers connected and to see
the exact tool names as they are exposed to you. Inside the action the tools are
namespaced `mcp__github_comment__*`, `mcp__github_inline_comment__*`,
`mcp__github_file_ops__*`, `mcp__github_ci__*`, and `mcp__github__*`; when
loaded as a plugin the prefix is plugin-scoped, so read the names off `/mcp`
rather than assuming.

Use `claude --debug` to inspect connection and tool-discovery failures.
