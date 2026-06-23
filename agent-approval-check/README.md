# Agent Approval Check

Require **N human approvals** on any pull request that contains commits
authored by an AI agent (Claude, Claude Code, or any bot identity you
configure). PRs without agent activity are unaffected.

This is the same gate Anthropic runs internally on every agent-authored PR.

## What it does

When a PR is opened, pushed to, or commented on, this action:

1. Scans the PR's commits, author, and reviews for the configured agent
   identities (committer email, bot login, or an `APPROVED` review from a
   bot). If none are found it posts `success: No agent activity` and stops.
2. Counts distinct human approvals: the latest `APPROVED` review per login,
   plus any `/approve <head-sha>` comment whose SHA matches the current
   head. Only users with write access to the repo count (verified per-user
   via the collaborators permission API); agent and excluded-bot logins
   never count.
3. Posts an `agent-approval-check` commit status (`success` once the count
   reaches `required_approvals`, otherwise `pending`) and a sticky PR
   comment explaining what's still needed.
4. Re-evaluates on every new push or comment. A push moves the head SHA,
   so earlier `/approve <old-sha>` comments are flagged stale. Approving
   reviews still count toward the threshold — they're picked up the next
   time the workflow runs (on push or `/approve`); they just don't trigger
   a run on their own.

Mark `agent-approval-check` as a **required status check** on your protected
branches and GitHub will refuse to merge until it's green.

## Setup

Copy [`examples/agent-approval-check.yml`](../examples/agent-approval-check.yml)
into `.github/workflows/` in your repo, then add `agent-approval-check` to the
required status checks on your protected branch.

This action is designed to run **alongside** GitHub's native branch
protection, not replace it. On the same protected branch you should also:

1. Require at least 1 approving review from someone with write access.
2. Enable **Dismiss stale pull request approvals when new commits are pushed**.

```yaml
name: agent-approval-check
on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]
permissions:
  contents: read
  pull-requests: write
  statuses: write
jobs:
  check:
    if: github.event_name != 'issue_comment' || github.event.issue.pull_request
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action/agent-approval-check@main
        with:
          required_approvals: 2
          agent_emails: noreply@anthropic.com
          agent_logins: claude[bot],claude-code[bot]
```

## Inputs

| Input                  | Default                        | Meaning                                                                                                                               |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `required_approvals`   | `2`                            | Distinct human approvals needed.                                                                                                      |
| `agent_emails`         | `noreply@anthropic.com`        | Committer emails that mark a commit agent-authored.                                                                                   |
| `agent_logins`         | `claude[bot],claude-code[bot]` | Logins treated as agents (PR author or approving reviewer).                                                                           |
| `excluded_approvers`   | _(empty)_                      | Logins whose approvals never count.                                                                                                   |
| `exempt_head_branches` | _(empty)_                      | Head-branch globs that auto-pass. ⚠️ Leave empty — branch names are attacker-controlled, so this is not a safe place to encode trust. |
| `exempt_path_prefixes` | _(empty)_                      | PRs touching only these prefixes auto-pass.                                                                                           |
| `protected_bases`      | _(default branch)_             | Base branches this check gates (see threat model).                                                                                    |
| `config_file`          | _(empty)_                      | Path to an [agent-identities YAML](./agent-identities.example.yaml) replacing the inline inputs. See the warning below.               |
| `docs_url`             | this README                    | Link in the PR comment footer.                                                                                                        |
| `github_token`         | `${{ github.token }}`          | Needs `statuses:write` + `pull-requests:write`.                                                                                       |

> ⚠️ **`config_file` and checkout:** if you set `config_file`, your workflow
> must check out the **base** branch to read it (the default behaviour of
> `actions/checkout` under `pull_request_target`). Never check out the PR
> head ref — doing so would let the PR author control the config and bypass
> this check.

## Approving

A human counts as an approver by either:

- submitting a normal GitHub **Approve** review, or
- commenting `/approve <sha>` where `<sha>` is the current head commit
  (12–40 hex chars). This path lets the PR author — who can't approve their
  own PR in GitHub's UI — vouch for commits an agent pushed on their behalf.
  The author's `/approve` is subject to the same write-access verification
  as any other approver, so a fork-PR author without write access on the
  base repository cannot self-count. The author counts as **one** approval;
  the remaining approvals must come from other reviewers with write access.

## Threat model

- **Tamper-proof triggers.** `pull_request_target` and `issue_comment` run
  the workflow file from the base/default branch, so the PR under review
  cannot edit this check. `pull_request_review` does **not** share this
  property — it runs from the merge ref — so the example workflow omits it;
  native Approve reviews are picked up on the next synchronize or
  `/approve` comment. This tamper-resistance assumes the workflow file
  itself is protected: an actor who can push workflow changes to the
  default branch can spoof any required status check, including this one,
  so protect `.github/workflows/` via branch protection or CODEOWNERS.
- **Fail-closed.** Any unhandled error exits non-zero; the required status
  stays non-success and the PR stays blocked. PRs with >100 commits are
  treated as agent-authored because the full commit list can't be verified.
- **Sibling-PR guard.** Commit statuses attach to a SHA, not a PR. The
  action refuses to post a status on a PR whose base isn't in
  `protected_bases`, and withholds `success` while another open PR to a
  protected base shares the same head commit — otherwise a green status on
  one PR would also unblock the other.
- **No checkout of PR code.** The action never checks out the PR's branch;
  it reads PR metadata via the GitHub API, so the usual
  `pull_request_target` code-execution risk does not apply.
