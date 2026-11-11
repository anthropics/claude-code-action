# Agent Approval Check

Require **N human approvals** on any pull request that contains commits
authored by an AI agent (Claude, Claude Code, or any bot identity you
configure). PRs without agent activity are unaffected.

This is the same gate Anthropic runs internally on every agent-authored PR.

## What it does

When a PR is opened, pushed to, commented on, or reviewed, this action:

1. Scans the PR's commits, author, and reviews for the configured agent
   identities (committer or author email, including a bot login's GitHub
   noreply address, bot login, or an `APPROVED` review from a bot). If none
   are found it posts `success: No agent activity` and stops.
2. Counts distinct human approvals: each login whose latest decision is an
   `APPROVED` review (a later `CHANGES_REQUESTED` or dismissal cancels it),
   plus any `/approve <head-sha>` comment naming the current head's full
   SHA. Only users with write access to the repo count (verified per-user
   via the collaborators permission API); agent and excluded-bot logins
   never count.
3. Posts an `agent-approval-check` commit status (`success` once the count
   reaches `required_approvals`, otherwise `pending`) and a sticky PR
   comment explaining what's still needed.
4. Re-evaluates on every new push, comment, or review. A push moves the
   head SHA, so earlier `/approve <old-sha>` comments are flagged stale.
   Reviews reach the check through a separate signal workflow (see Setup),
   which GitHub does not connect to PRs from forks: on those, a review is
   picked up the next time the workflow runs (on push or `/approve`).

Mark `agent-approval-check` as a **required status check** on your protected
branches and GitHub will refuse to merge until it's green.

## Setup

Copy [`examples/agent-approval-check.yml`](../examples/agent-approval-check.yml)
and [`examples/agent-approval-check-review-signal.yml`](../examples/agent-approval-check-review-signal.yml)
into `.github/workflows/` in your repo, then add `agent-approval-check` to the
required status checks on your protected branch. Without the signal workflow,
a review changes the status only at the next push or comment, so an agent's
approval can leave an earlier `No agent activity` success in place.

This action is designed to run **alongside** GitHub's native branch
protection, not replace it. On the same protected branch you should also:

1. Require at least 1 approving review from someone with write access.
2. Enable **Dismiss stale pull request approvals when new commits are pushed**.
3. Enable **Require a pull request before merging**, with no bypass, on every
   branch that requires this check, and list each of those branches in
   `protected_bases`. See [Commit statuses and direct pushes](#commit-statuses-and-direct-pushes).

```yaml
name: agent-approval-check
on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]
  workflow_run:
    workflows: [agent-approval-check-review-signal]
    types: [completed]
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

| Input                     | Default                        | Meaning                                                                                                                               |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `required_approvals`      | `2`                            | Distinct human approvals needed.                                                                                                      |
| `agent_emails`            | `noreply@anthropic.com`        | Committer or author emails that mark a commit agent-authored. An `agent_logins` identity's GitHub noreply address always counts too.  |
| `agent_logins`            | `claude[bot],claude-code[bot]` | Logins treated as agents (PR author or approving reviewer).                                                                           |
| `excluded_approvers`      | _(empty)_                      | Logins whose approvals never count.                                                                                                   |
| `exempt_head_branches`    | _(empty)_                      | Head-branch globs that auto-pass. ⚠️ Leave empty — branch names are attacker-controlled, so this is not a safe place to encode trust. |
| `exempt_path_prefixes`    | _(empty)_                      | PRs touching only these prefixes auto-pass. A renamed or copied file must be under a prefix on both sides.                            |
| `protected_bases`         | _(default branch)_             | Base branches this check gates (see threat model).                                                                                    |
| `status_context_per_base` | `false`                        | `true` posts the status as `agent-approval-check/<base>`. Branch rules must then require that name. See below.                        |
| `config_file`             | _(empty)_                      | Path to an [agent-identities YAML](./agent-identities.example.yaml) replacing the inline inputs. See the warning below.               |
| `docs_url`                | this README                    | Link in the PR comment footer.                                                                                                        |
| `github_token`            | `${{ github.token }}`          | Needs `statuses:write` + `pull-requests:write`.                                                                                       |

> ⚠️ **`config_file` and checkout:** if you set `config_file`, your workflow
> must check out the **base** branch to read it (the default behaviour of
> `actions/checkout` under `pull_request_target`). Never check out the PR
> head ref — doing so would let the PR author control the config and bypass
> this check.

## Approving

A human counts as an approver by either:

- submitting a normal GitHub **Approve** review, or
- commenting `/approve <sha>` where `<sha>` is the current head commit's full
  40-character SHA. A shorter prefix does not count, because a later commit
  could share it and inherit the approval. This path lets the PR author — who
  can't approve their own PR in GitHub's UI — vouch for commits an agent pushed on their behalf.
  The author's `/approve` is subject to the same write-access verification
  as any other approver, so a fork-PR author without write access on the
  base repository cannot self-count. The author counts as **one** approval;
  the remaining approvals must come from other reviewers with write access.

## Threat model

- **Tamper-proof triggers.** `pull_request_target` and `issue_comment` run
  the workflow file from the base/default branch, so the PR under review
  cannot edit this check. `pull_request_review` does **not** share this
  property — it runs from the merge ref — so the example workflow does not
  use it. The signal workflow does, with no permissions, and only causes a
  `workflow_run` of the check from the default branch. A PR can suppress its
  own re-evaluation by editing the signal workflow, but cannot change the
  result. `workflow_run` lists no PR for a fork's signal, so a fork PR's
  review waits for the next push or comment. This tamper-resistance assumes
  the workflow file itself is protected: an actor who can push workflow changes to the
  default branch can spoof any required status check, including this one,
  so protect `.github/workflows/` via branch protection or CODEOWNERS.
- **Fail-closed.** Any unhandled error exits non-zero and posts nothing, so a
  PR with no status stays blocked; a success already on that commit stays
  until a later run replaces it. PRs with >100 commits are treated as
  agent-authored because the full commit list can't be verified. If some
  reviews can't be read, the status is `pending` whatever the count.
- **Renames.** GitHub lists a renamed file under its new path only, so the
  action looks up the old path and exempts the file only if both are under
  `exempt_path_prefixes`. If it can't find the old path, the file isn't exempt.
- **Sibling-PR guard.** Commit statuses attach to a SHA, not a PR. The
  action refuses to post a status on a PR whose base isn't in
  `protected_bases`, and withholds `success` while another open PR to a
  protected base shares the same head commit — otherwise a green status on
  one PR would also unblock the other.
- **No checkout of PR code.** The action never checks out the PR's branch;
  it reads PR metadata via the GitHub API, so the usual
  `pull_request_target` code-execution risk does not apply.

### Commit statuses and direct pushes

A commit status belongs to a commit, not to a branch or PR, and it stays there.
Once `agent-approval-check` is green on a commit, that commit satisfies the
required check on **every** branch that requires it. This action has no way to
stop that from a workflow: nothing runs before a push lands, and a `push` run
could only report on code that has already landed. So:

- **Direct pushes are for your branch rules to stop.** Without **Require a pull
  request before merging**, anyone who can push can put an approved commit on
  another branch that requires this check, and no run ever evaluates it. People
  and apps allowed to bypass the rule keep that ability.
- **List every branch that requires the check in `protected_bases`.** A PR to an
  unlisted base is not evaluated and gets no status, so it keeps any success
  the commit already has. The action can't safely clear that success, because
  the same status may be what an open PR to a protected base legitimately earned.
- **A new PR on an approved commit is briefly green.** Until its first run posts
  `pending`, usually seconds, it shows the status the commit already has.

`status_context_per_base: true` removes the inheritance: the status is posted as
`agent-approval-check/<base>`, so success earned for `main` doesn't satisfy
`agent-approval-check/release`. Require the name for each branch in its branch
rule, and list the branch in `protected_bases`; a required name that no run posts
blocks the branch. It doesn't replace **Require a pull request before merging**.
