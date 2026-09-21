# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx",
#   "pyyaml",
#   "tenacity",
# ]
# ///
"""
Agent Approval Check

Enforces that PRs containing agent-authored commits (e.g. from Claude Code)
receive N human approvals before the `agent-approval-check` commit status
turns green. Mark that status as a required check on protected branches to
gate merges.

SECURITY MODEL:
    This script must run from the BASE/DEFAULT branch — via pull_request_target,
    issue_comment, or workflow_run triggers — so a PR cannot modify the check
    that gates it. It is fail-closed: any unhandled exception exits non-zero
    and the required status stays non-success.

    Tamper-resistance assumes the workflow file itself is protected (branch
    protection or CODEOWNERS on .github/workflows/). An actor who can push
    workflow changes to the default branch can spoof any required status
    check, including this one.

AGENT DETECTION:
    A commit is agent-authored if its committer email is in `agent_emails`.
    A PR is agent-authored if its creator login is in `agent_app_logins`.
    A PR also counts as having agent activity if an `agent_app_logins` identity
    has submitted an APPROVED review (so an agent's approval can never satisfy
    this check on its own).

APPROVAL COUNTING:
    Valid approvals come from non-agent users with write access to the
    repository (verified via the collaborators permission API), via either:
    - A non-dismissed APPROVED review (staleness is controlled by GitHub's
      branch protection dismiss_stale_reviews setting)
    - A /approve <sha> comment

    Approvals that DON'T count:
    - Reviews/comments from agent identities
    - /approve for a SHA that doesn't match the PR head commit
    - CHANGES_REQUESTED overrides earlier APPROVED from same user
      (COMMENTED reviews are ignored - they don't change approval status)

OUTPUTS:
    - Commit status: pending (yellow) or success (green)
    - PR comment with full approval status (updated on each run)
    - Stale approval notifications when /approve becomes outdated

RATE LIMIT OPTIMIZATION:
    - 1 GraphQL query to fetch PR, commits, reviews, and comments
      (paginated only if >100 comments)
    - 1 REST permission check per unique candidate approver (cached)
    - 1 GraphQL mutation batch for all writes (comments, reactions, minimize)
    - 1 REST call for commit status (no GraphQL equivalent)
    Total: a small, bounded number of API calls per workflow run
"""

import fnmatch
import json
import logging
import os
import re
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import httpx
import yaml
from tenacity import (
    retry,
    retry_if_exception,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)


def _retryable_http_error(exc: BaseException) -> bool:
    # Retry network errors and 5xx; 4xx won't succeed on retry and the
    # collaborator-permission endpoint legitimately returns 404.
    if isinstance(exc, httpx.RequestError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response is not None and exc.response.status_code >= 500
    return False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)],
)
logger = logging.getLogger(__name__)

# --- Constants ---

CHECK_NAME = "agent-approval-check"
REQUIRED_APPROVALS = int(os.environ.get("REQUIRED_APPROVALS") or 2)

# Only approvals from users with write access to the repo count. authorAssociation
# alone can't prove that (a MEMBER or COLLABORATOR may have read/triage only), so
# it's used as a cheap pre-filter and the actual gate is a per-user REST
# `GET /repos/{o}/{r}/collaborators/{login}/permission` check. A login outside
# this set is not a collaborator at all, so the REST call is skipped.
WRITE_ACCESS_ASSOCIATIONS = frozenset({"OWNER", "MEMBER", "COLLABORATOR"})
WRITE_PERMISSION_LEVELS = frozenset({"write", "push", "maintain", "admin"})
DOCS_URL = (
    os.environ.get("DOCS_URL")
    or "https://github.com/anthropics/claude-code-action/tree/main/agent-approval-check"
)


# GraphQL query to fetch all PR data in a single call.
#
# PAGINATION STRATEGY:
# - Use `last:` to get the most recent items (HEAD commit, recent reviews/approvals)
# - For commits: fail-closed if hasPreviousPage (can't verify all commits are human)
# - For reviews: warn only (old items are likely stale anyway)
# - For comments: paginated fully (older /approve and the sticky comment must be found)
GRAPHQL_PR_QUERY = """
query GetPRData($owner: String!, $repo: String!, $prNumber: Int!) {
  rateLimit {
    limit
    remaining
    used
    resetAt
  }
  repository(owner: $owner, name: $repo) {
    defaultBranchRef {
      name
    }
    pullRequest(number: $prNumber) {
      id
      number
      headRefOid
      headRefName
      baseRefName
      createdAt
      author {
        __typename
        login
      }
      commits(last: 100) {
        nodes {
          commit {
            oid
            committedDate
            committer {
              email
            }
            signature {
              state
              verifiedAt
            }
          }
        }
        pageInfo {
          hasPreviousPage
        }
      }
      headCommit: commits(last: 1) {
        nodes {
          commit {
            oid
            associatedPullRequests(first: 50) {
              nodes {
                number
                state
                baseRefName
                headRefOid
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        }
      }
      reviews(last: 100) {
        nodes {
          author {
            __typename
            login
          }
          authorAssociation
          state
          commit {
            oid
          }
          submittedAt
        }
        pageInfo {
          hasPreviousPage
        }
      }
      comments(last: 100) {
        nodes {
          id
          databaseId
          author {
            __typename
            login
          }
          authorAssociation
          body
          isMinimized
        }
        pageInfo {
          hasPreviousPage
          startCursor
        }
      }
      files(first: 100) {
        nodes {
          path
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
}
"""

GRAPHQL_COMMENTS_PAGE_QUERY = """
query GetPRComments($owner: String!, $repo: String!, $prNumber: Int!, $before: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      comments(last: 100, before: $before) {
        nodes {
          id
          databaseId
          author {
            __typename
            login
          }
          authorAssociation
          body
          isMinimized
        }
        pageInfo {
          hasPreviousPage
          startCursor
        }
      }
    }
  }
}
"""


# --- Data Classes ---


@dataclass
class AgentConfig:
    """Configuration for agent identities."""

    agent_emails: list[str]
    agent_app_logins: list[str]
    excluded_approver_logins: list[str]
    exempt_head_branches: list[str]
    exempt_path_prefixes: dict[str, list[str]] = field(default_factory=dict)
    protected_bases: dict[str, dict[str, list[str]]] = field(default_factory=dict)


@dataclass
class PRData:
    """All data needed for a PR approval check, fetched via GraphQL."""

    node_id: str  # GraphQL node ID for the PR (used for addComment)
    number: int
    head_sha: str  # headRefOid — authoritative head commit (status target)
    head_ref: str  # Branch name (for exempt branch check)
    base_ref: str  # Target branch (for protected-base check)
    default_branch: str  # Repo default branch (protected-base fallback)
    created_at: str
    author_login: str
    commits: list[dict]  # Normalized to REST-like format
    reviews: list[dict]  # Normalized to REST-like format
    comments: list[dict]  # Normalized to REST-like format
    files: list[str]  # Changed file paths
    commits_incomplete: bool  # True if PR has >100 commits (fail-closed)
    files_incomplete: bool  # True if PR has >100 files (fail-closed)
    # Other OPEN PRs whose head is this exact commit, as (number, base_ref).
    # Statuses are SHA-scoped, so a success here would satisfy them too.
    same_sha_open_prs: list[tuple[int, str]] = field(default_factory=list)
    same_sha_prs_incomplete: bool = False  # associatedPullRequests overflowed


@dataclass
class AgentActivityResult:
    """Result of checking for agent activity in a PR."""

    has_agent_activity: bool
    latest_agent_commit: dict | None
    detection_reason: str


@dataclass
class ApproveCommand:
    """A parsed /approve command from a comment."""

    commenter: str
    sha: str
    comment_id: int
    node_id: str


@dataclass
class MutationBatch:
    """Collects GraphQL mutations to execute in a single call."""

    # Reactions to add: list of (comment_node_id, reaction_content)
    reactions: list[tuple[str, str]] = field(default_factory=list[tuple[str, str]])
    # Comment to create: (subject_node_id, body) - only one notification comment
    create_comment: tuple[str, str] | None = None
    # Comment to update: (comment_node_id, body)
    update_comment: tuple[str, str] | None = None
    # Stale notification to create: (subject_node_id, body)
    create_stale_comment: tuple[str, str] | None = None
    # Comments to minimize: list of (comment_node_id, reason)
    minimize_comments: list[tuple[str, str]] = field(
        default_factory=list[tuple[str, str]]
    )
    # Comments to un-minimize: list of comment_node_id
    unminimize_comments: list[str] = field(default_factory=list[str])

    def is_empty(self) -> bool:
        return (
            not self.reactions
            and not self.create_comment
            and not self.update_comment
            and not self.create_stale_comment
            and not self.minimize_comments
            and not self.unminimize_comments
        )


class MutationBuilder:
    """Builds GraphQL mutations with proper variable handling."""

    def __init__(self) -> None:
        self._parts: list[str] = []
        self._var_defs: list[str] = []
        self._variables: dict[str, dict] = {}
        self._counter: int = 0

    def _next_id(self) -> int:
        self._counter += 1
        return self._counter

    def add_reaction(self, node_id: str, content: str) -> None:
        """Add a reaction to a comment."""
        i = self._next_id()
        self._parts.append(
            f"r{i}: addReaction(input: $r{i}) {{ reaction {{ content }} }}"
        )
        self._var_defs.append(f"$r{i}: AddReactionInput!")
        self._variables[f"r{i}"] = {"subjectId": node_id, "content": content}

    def add_comment(self, alias: str, subject_id: str, body: str) -> None:
        """Add a comment to the PR."""
        self._parts.append(
            f"{alias}: addComment(input: ${alias}) {{ commentEdge {{ node {{ id }} }} }}"
        )
        self._var_defs.append(f"${alias}: AddCommentInput!")
        self._variables[alias] = {"subjectId": subject_id, "body": body}

    def update_comment(self, alias: str, node_id: str, body: str) -> None:
        """Update an existing comment."""
        self._parts.append(
            f"{alias}: updateIssueComment(input: ${alias}) {{ issueComment {{ id }} }}"
        )
        self._var_defs.append(f"${alias}: UpdateIssueCommentInput!")
        self._variables[alias] = {"id": node_id, "body": body}

    def minimize_comment(self, node_id: str, reason: str) -> None:
        """Minimize a comment."""
        i = self._next_id()
        self._parts.append(
            f"m{i}: minimizeComment(input: $m{i}) {{ minimizedComment {{ isMinimized }} }}"
        )
        self._var_defs.append(f"$m{i}: MinimizeCommentInput!")
        self._variables[f"m{i}"] = {"subjectId": node_id, "classifier": reason}

    def unminimize_comment(self, node_id: str) -> None:
        """Un-minimize a comment (make it visible again)."""
        i = self._next_id()
        self._parts.append(
            f"u{i}: unminimizeComment(input: $u{i}) {{ unminimizedComment {{ isMinimized }} }}"
        )
        self._var_defs.append(f"$u{i}: UnminimizeCommentInput!")
        self._variables[f"u{i}"] = {"subjectId": node_id}

    def build(self) -> tuple[str, dict[str, dict]] | None:
        """Build the mutation query and variables. Returns None if empty."""
        if not self._parts:
            return None
        mutation = (
            f"mutation M({', '.join(self._var_defs)}) {{ {' '.join(self._parts)} }}"
        )
        return mutation, self._variables


# --- Rate Limit Logging ---


def log_rate_limit(rate_limit: dict | None, context: str = "") -> None:
    """Log GitHub API rate limit status."""
    if not rate_limit:
        return

    remaining = rate_limit.get("remaining", "?")
    limit = rate_limit.get("limit", "?")
    used = rate_limit.get("used", "?")
    reset_at = rate_limit.get("resetAt", "")

    reset_str = ""
    if reset_at:
        try:
            reset_time = datetime.fromisoformat(reset_at.replace("Z", "+00:00"))
            now = datetime.now(UTC)
            minutes_until_reset = (reset_time - now).total_seconds() / 60
            reset_str = f", resets in {minutes_until_reset:.0f}m"
        except (ValueError, TypeError):
            reset_str = f", resets at {reset_at}"

    prefix = f"[{context}] " if context else ""
    logger.info(
        "%sGitHub API rate limit: %s/%s remaining (%s used%s)",
        prefix,
        remaining,
        limit,
        used,
        reset_str,
    )

    if isinstance(remaining, int) and isinstance(limit, int):
        percent_remaining = (remaining / limit) * 100 if limit > 0 else 0
        if percent_remaining < 10:
            logger.warning(
                "Rate limit critically low: %.1f%% remaining", percent_remaining
            )
        elif percent_remaining < 25:
            logger.warning(
                "Rate limit getting low: %.1f%% remaining", percent_remaining
            )


def log_rest_rate_limit(response: httpx.Response, context: str = "") -> None:
    """Log rate limit from REST API response headers."""
    remaining = response.headers.get("X-RateLimit-Remaining", "?")
    limit = response.headers.get("X-RateLimit-Limit", "?")
    used = response.headers.get("X-RateLimit-Used", "?")
    resource = response.headers.get("X-RateLimit-Resource", "core")

    prefix = f"[{context}] " if context else ""
    logger.info(
        "%sGitHub REST API (%s): %s/%s remaining (%s used)",
        prefix,
        resource,
        remaining,
        limit,
        used,
    )


# --- Commit Helpers ---


def normalize_graphql_login(author: dict | None) -> str:
    """Normalize a GraphQL author node to a REST-compatible login.

    GitHub's GraphQL API returns bot logins without the [bot] suffix
    (e.g. "nrg-test"), while the REST API includes it ("nrg-test[bot]").
    This normalizes to REST format for consistent identity matching.
    """
    if not author:
        return ""
    login = author.get("login", "")
    if author.get("__typename") == "Bot" and not login.endswith("[bot]"):
        login = f"{login}[bot]"
    return login


def get_committer_email(commit: dict) -> str:
    return commit.get("commit", {}).get("committer", {}).get("email", "")


def is_agent_commit(commit: dict, config: AgentConfig) -> bool:
    # Case-insensitive comparison per RFC 5321 (email addresses are case-insensitive)
    email = get_committer_email(commit).lower()
    return email in (e.lower() for e in config.agent_emails)


# --- User/PR Helpers ---


def is_review_exempt_pr(pr_data: PRData, config: AgentConfig, repo: str) -> bool:
    """Check if all changed files are under a configured exempt path prefix.

    Fail-closed: returns False if no prefixes are configured for this repo,
    if the file list is incomplete (>100 files), or if no files are present.
    """
    exempt_prefixes = tuple(config.exempt_path_prefixes.get(repo, []))
    if not exempt_prefixes or pr_data.files_incomplete or not pr_data.files:
        return False
    return all(f.startswith(exempt_prefixes) for f in pr_data.files)


def is_protected_base(
    base_ref: str, config: AgentConfig, repo: str, default_branch: str
) -> bool:
    """Check if the PR's base branch is one this check is meant to protect.

    Commit statuses are SHA-scoped, so evaluating a PR that targets an
    unprotected base (e.g. a sibling PR opened from the same head branch)
    could stamp success on a SHA shared with a PR that does target a
    protected base.

    A repo with a protected_bases entry uses it exclusively (the default
    branch is not implicitly included — list it). A repo without an entry
    protects exactly its default branch, so onboarding a repo needs no
    config unless it gates additional branches.
    """
    repo_config = config.protected_bases.get(repo)
    if repo_config is None:
        if not default_branch:
            logger.warning(
                "No protected_bases entry for %s and default branch unknown "
                "— sibling-PR defense skipped",
                repo,
            )
            return True
        return base_ref == default_branch
    if base_ref in repo_config.get("exact", []):
        return True
    return any(base_ref.startswith(p) for p in repo_config.get("prefixes", []))


def select_pr_candidate(
    pr_number: int, candidates_json: str, config: AgentConfig, repo: str
) -> int:
    """Pick which PR to evaluate when the triggering run lists several.

    For pull_request / pull_request_review signals, workflow_run.pull_requests
    lists every open PR sharing the run's head SHA — including sibling PRs from
    the same head branch that target a different base. Prefer a candidate whose
    base is protected so the status update lands on the PR this check gates.

    Routing only, not enforcement: is_protected_base on the fetched PR data is
    what actually refuses to evaluate an unprotected base, so any fallback to
    the original pr_number here is safe.
    """
    if not candidates_json.strip():
        return pr_number
    if repo not in config.protected_bases:
        # Without an explicit entry we can't rank candidates before fetching
        # (the default-branch fallback needs the GraphQL response).
        return pr_number
    try:
        candidates = json.loads(candidates_json)
    except json.JSONDecodeError:
        logger.warning("GH_PR_CANDIDATES is not valid JSON — keeping PR #%d", pr_number)
        return pr_number
    if not isinstance(candidates, list):
        logger.warning("GH_PR_CANDIDATES is not a list — keeping PR #%d", pr_number)
        return pr_number

    protected_numbers: list[int] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        number = candidate.get("number")
        base_ref = ((candidate.get("base") or {}).get("ref")) or ""
        if isinstance(number, int) and is_protected_base(
            base_ref, config, repo, default_branch=""
        ):
            protected_numbers.append(number)

    if pr_number in protected_numbers:
        return pr_number
    if not protected_numbers:
        logger.warning(
            "No workflow_run PR candidate targets a protected base for %s — "
            "keeping PR #%d (the protected-base check will refuse it)",
            repo,
            pr_number,
        )
        return pr_number
    selected = min(protected_numbers)
    logger.warning(
        "PR #%d does not target a protected base for %s; evaluating sibling "
        "PR #%d from the same head SHA instead (protected candidates: %s)",
        pr_number,
        repo,
        selected,
        sorted(protected_numbers),
    )
    return selected


def is_exempt_branch(head_ref: str, config: AgentConfig) -> bool:
    """Check if the PR's head branch matches an exempt pattern.

    Uses fnmatch glob matching against configured exempt_head_branches patterns.
    """
    return any(
        fnmatch.fnmatch(head_ref, pattern) for pattern in config.exempt_head_branches
    )


def is_agent_user(login: str, config: AgentConfig) -> bool:
    # Case-insensitive comparison (GitHub usernames are case-insensitive)
    login_lower = login.lower()
    return login_lower in (l.lower() for l in config.agent_app_logins)


def is_excluded_approver(login: str, config: AgentConfig) -> bool:
    """Check if a login is excluded from counting as an approver.

    These are bots (e.g. an auto-approve bot) whose automated approvals should not
    satisfy the human review requirement. Unlike agents, they don't trigger agent
    detection — they are simply ignored when counting approvals.
    """
    login_lower = login.lower()
    return login_lower in (l.lower() for l in config.excluded_approver_logins)


def is_pr_created_by_agent(pr_author: str, config: AgentConfig) -> bool:
    # Case-insensitive comparison (GitHub usernames are case-insensitive)
    author_lower = pr_author.lower()
    return author_lower in (l.lower() for l in config.agent_app_logins)


# --- Approval Helpers ---


def parse_approve_command(body: str | None) -> str | None:
    """Parse /approve <sha> command and return the SHA, or None if not valid.

    Only the first line of the comment is considered. GitHub email replies
    append the quoted notification below the user's text, so a reply of just
    "/approve <sha>" arrives as "/approve <sha>\r\n\r\nOn <date> ... wrote:".
    The first line must still be exactly the command — leading text or extra
    tokens on that line are rejected.
    """
    first_line = (body or "").lstrip().splitlines()[0:1]
    first_line = first_line[0].strip() if first_line else ""
    match = re.match(r"^/approve\s+([a-f0-9]{12,40})\s*$", first_line, re.IGNORECASE)
    return match.group(1).lower() if match else None


def sha_matches(approved_sha: str, target_sha: str) -> bool:
    return target_sha.lower().startswith(approved_sha.lower())


def iter_approve_commands(
    comments: list[dict],
    config: AgentConfig,
    permission_check: Callable[[str], bool],
) -> Iterator[ApproveCommand]:
    for comment in comments:
        commenter = comment.get("user", {}).get("login", "")
        if not commenter:  # Skip deleted users or null authors
            continue
        if comment.get("author_association") not in WRITE_ACCESS_ASSOCIATIONS:
            continue
        if is_agent_user(commenter, config):
            continue
        if is_excluded_approver(commenter, config):
            continue
        approved_sha = parse_approve_command(comment.get("body", ""))
        if not approved_sha:
            continue
        if not permission_check(commenter):
            continue
        yield ApproveCommand(
            commenter=commenter,
            sha=approved_sha,
            comment_id=comment.get("id", 0),
            node_id=comment.get("node_id", ""),
        )


def get_latest_review_per_user(reviews: list[dict]) -> dict[str, dict]:
    """Get the latest decision review per user.

    Only considers "decision" reviews (APPROVED, CHANGES_REQUESTED) that change
    approval status. COMMENTED reviews are ignored because they don't represent
    a decision change - a reviewer who approves then adds a comment is still
    approving, matching GitHub's native behavior.
    """
    decision_states = {"APPROVED", "CHANGES_REQUESTED"}
    latest: dict[str, dict] = {}
    for review in reviews:
        login = review.get("user", {}).get("login")
        if not login:
            continue
        # Only consider decision reviews (APPROVED, CHANGES_REQUESTED)
        if review.get("state") not in decision_states:
            continue
        existing = latest.get(login)
        if not existing or review.get("submitted_at", "") > existing.get(
            "submitted_at", ""
        ):
            latest[login] = review
    return latest


# --- Config Loading ---


def load_agent_config(config_path: Path) -> AgentConfig:
    with config_path.open() as f:
        config = yaml.safe_load(f)

    if not isinstance(config, dict):
        raise ValueError(f"Invalid config format: expected dict, got {type(config)}")

    agent_emails = config.get("agent_emails", [])
    agent_app_logins = config.get("agent_app_logins", [])
    excluded_approver_logins = config.get("excluded_approver_logins", [])
    exempt_head_branches = config.get("exempt_head_branches", [])
    exempt_path_prefixes = config.get("exempt_path_prefixes", {})
    protected_bases = config.get("protected_bases", {})

    # Validate list types to prevent silent failures (e.g., iterating over string chars)
    if not isinstance(agent_emails, list):
        raise ValueError(f"agent_emails must be a list, got {type(agent_emails)}")
    if not isinstance(agent_app_logins, list):
        raise ValueError(
            f"agent_app_logins must be a list, got {type(agent_app_logins)}"
        )
    if not isinstance(excluded_approver_logins, list):
        raise ValueError(
            f"excluded_approver_logins must be a list, got {type(excluded_approver_logins)}"
        )
    if not isinstance(exempt_head_branches, list):
        raise ValueError(
            f"exempt_head_branches must be a list, got {type(exempt_head_branches)}"
        )
    if not isinstance(exempt_path_prefixes, dict):
        raise ValueError(
            f"exempt_path_prefixes must be a dict keyed by owner/repo, "
            f"got {type(exempt_path_prefixes)}"
        )
    for repo, prefixes in exempt_path_prefixes.items():
        if not isinstance(prefixes, list):
            raise ValueError(
                f"exempt_path_prefixes[{repo!r}] must be a list, got {type(prefixes)}"
            )
        if not all(isinstance(p, str) and p for p in prefixes):
            raise ValueError(
                f"exempt_path_prefixes[{repo!r}] entries must be non-empty strings"
            )
    if not isinstance(protected_bases, dict):
        raise ValueError(
            f"protected_bases must be a dict keyed by owner/repo, "
            f"got {type(protected_bases)}"
        )
    for repo, entry in protected_bases.items():
        if not isinstance(entry, dict):
            raise ValueError(
                f"protected_bases[{repo!r}] must be a dict with exact/prefixes, "
                f"got {type(entry)}"
            )
        for key in ("exact", "prefixes"):
            vals = entry.get(key, [])
            if not isinstance(vals, list) or not all(
                isinstance(v, str) and v for v in vals
            ):
                raise ValueError(
                    f"protected_bases[{repo!r}][{key!r}] must be a list of "
                    f"non-empty strings"
                )

    return AgentConfig(
        agent_emails=agent_emails,
        agent_app_logins=agent_app_logins,
        excluded_approver_logins=excluded_approver_logins,
        exempt_head_branches=exempt_head_branches,
        exempt_path_prefixes=exempt_path_prefixes,
        protected_bases=protected_bases,
    )


def _csv(name: str) -> list[str]:
    return [v.strip() for v in (os.environ.get(name) or "").split(",") if v.strip()]


def load_agent_config_from_env(repo: str) -> AgentConfig:
    """Build an AgentConfig from action inputs (env vars).

    A CONFIG_FILE, if set, takes precedence over the inline inputs.
    """
    config_file = os.environ.get("CONFIG_FILE", "").strip()
    if config_file:
        return load_agent_config(Path(config_file))

    exempt_prefixes = _csv("EXEMPT_PATH_PREFIXES")
    protected_exact = _csv("PROTECTED_BASES")
    return AgentConfig(
        agent_emails=_csv("AGENT_EMAILS"),
        agent_app_logins=_csv("AGENT_LOGINS"),
        excluded_approver_logins=_csv("EXCLUDED_APPROVERS"),
        exempt_head_branches=_csv("EXEMPT_HEAD_BRANCHES"),
        exempt_path_prefixes={repo: exempt_prefixes} if exempt_prefixes else {},
        protected_bases=(
            {repo: {"exact": protected_exact, "prefixes": []}}
            if protected_exact
            else {}
        ),
    )


def resolve_pr_number(event_name: str, event_path: str) -> int | None:
    """Derive the PR number from the triggering event payload.

    Supports pull_request / pull_request_target, pull_request_review, and
    issue_comment (only when the issue is a PR). Returns None when the event
    has no PR (e.g. an issue_comment on a plain issue) — callers exit 0 so
    the workflow run succeeds without posting a status.
    """
    with open(event_path) as f:
        event = json.load(f)
    if event_name in {"pull_request", "pull_request_target", "pull_request_review"}:
        return int(event["pull_request"]["number"])
    if event_name == "issue_comment":
        issue = event.get("issue") or {}
        if issue.get("pull_request"):
            return int(issue["number"])
        return None
    if event_name == "workflow_run":
        prs = event.get("workflow_run", {}).get("pull_requests") or []
        return int(prs[0]["number"]) if prs else None
    raise ValueError(f"Unsupported event: {event_name}")


# --- Core Logic ---


def get_detection_reason(commit: dict, config: AgentConfig) -> str:
    email = get_committer_email(commit)
    short_sha = commit.get("sha", "")[:12]
    # Case-insensitive check to match is_agent_commit behavior
    email_lower = email.lower()
    assert email_lower in (e.lower() for e in config.agent_emails), (
        f"Expected agent email but got {email}"
    )
    return f"Commit {short_sha} has agent email ({email})"


def has_agent_approval(
    reviews: list[dict],
    config: AgentConfig,
) -> str | None:
    """Check if any agent identity has submitted an APPROVED review.

    Returns the agent login if found, None otherwise.
    """
    for review in reviews:
        if review.get("state") != "APPROVED":
            continue
        login = review.get("user", {}).get("login", "")
        if login and is_agent_user(login, config):
            return login
    return None


def check_for_agent_activity(
    commits: list[dict],
    pr_author: str,
    config: AgentConfig,
    reviews: list[dict] | None = None,
) -> AgentActivityResult:
    is_agent_pr = is_pr_created_by_agent(pr_author, config)
    latest_agent_commit: dict | None = None

    # Any agent-email commit counts as agent activity. An earlier carve-out
    # that endorsed agent commits pushed before the PR was opened was removed:
    # closing a pending PR and reopening a new one against the same head
    # rewinds pr.createdAt past every commit, so the carve-out auto-passed
    # the very PR it was meant to gate.
    for commit in commits:
        if is_agent_commit(commit, config):
            logger.info("Agent commit detected: %s", commit.get("sha"))
            latest_agent_commit = commit

    if latest_agent_commit:
        return AgentActivityResult(
            has_agent_activity=True,
            latest_agent_commit=latest_agent_commit,
            detection_reason=get_detection_reason(latest_agent_commit, config),
        )

    if is_agent_pr:
        logger.info(
            "PR created by agent app %s, no agent commits - using HEAD", pr_author
        )
        return AgentActivityResult(
            has_agent_activity=True,
            latest_agent_commit=commits[-1] if commits else None,
            detection_reason=f"PR was created by {pr_author}",
        )

    # Edge case: an agent has submitted an APPROVED review. Without this
    # check, the agent's approval would count toward branch protection's
    # required-reviews threshold as if it were human.
    if reviews:
        agent_login = has_agent_approval(reviews, config)
        if agent_login:
            logger.info(
                "Agent APPROVED review from %s detected",
                agent_login,
            )
            return AgentActivityResult(
                has_agent_activity=True,
                latest_agent_commit=commits[-1] if commits else None,
                detection_reason=f"PR has an APPROVED review from agent: {agent_login}",
            )

    return AgentActivityResult(
        has_agent_activity=False, latest_agent_commit=None, detection_reason=""
    )


def count_approvers(
    head_sha: str,
    reviews: list[dict],
    comments: list[dict],
    config: AgentConfig,
    permission_check: Callable[[str], bool],
) -> set[str]:
    # Use lowercase for deduplication (GitHub usernames are case-insensitive)
    approvers: set[str] = set()

    # Count all non-dismissed APPROVED reviews from non-agent users.
    # GitHub's branch protection settings (dismiss_stale_reviews_on_push)
    # control which reviews remain active — we defer to that.
    for login, review in get_latest_review_per_user(reviews).items():
        if review.get("author_association") not in WRITE_ACCESS_ASSOCIATIONS:
            continue
        if is_agent_user(login, config):
            continue
        if is_excluded_approver(login, config):
            continue
        if review.get("state") != "APPROVED":
            continue
        if not permission_check(login):
            continue
        logger.info("Counting APPROVE from %s", login)
        approvers.add(login.lower())

    # /approve comments must match the PR head SHA — approving an older
    # commit does not vouch for what's currently being merged.
    for cmd in iter_approve_commands(comments, config, permission_check):
        if not sha_matches(cmd.sha, head_sha):
            continue
        logger.info("Counting /approve from %s for SHA %s", cmd.commenter, cmd.sha)
        approvers.add(cmd.commenter.lower())

    logger.info("Total approvers: %d (%s)", len(approvers), ", ".join(approvers))
    return approvers


# --- Reaction/Comment Helpers ---

REACTION_VALID = "THUMBS_UP"  # GraphQL enum value


def collect_approval_reactions(
    batch: MutationBatch,
    comments: list[dict],
    head_sha: str,
    config: AgentConfig,
    permission_check: Callable[[str], bool],
) -> None:
    """Add reactions for valid /approve comments to the batch."""
    if not head_sha:
        return

    for cmd in iter_approve_commands(comments, config, permission_check):
        if sha_matches(cmd.sha, head_sha) and cmd.node_id:
            batch.reactions.append((cmd.node_id, REACTION_VALID))
            logger.info("Will add thumbs up to /approve from %s", cmd.commenter)


def find_stale_approvals(
    comments: list[dict],
    head_sha: str,
    config: AgentConfig,
    commits: list[dict],
    permission_check: Callable[[str], bool],
    current_approvers: set[str] | None = None,
) -> list[dict]:
    if not head_sha:
        return []

    # current_approvers uses lowercase (from count_approvers)
    current_approvers = current_approvers or set()
    stale_by_user: dict[str, str] = {}
    commit_shas = [c.get("sha", "") for c in commits]

    for cmd in iter_approve_commands(comments, config, permission_check):
        # Use lowercase to match current_approvers
        commenter_lower = cmd.commenter.lower()
        if commenter_lower in current_approvers:
            continue
        if not any(sha_matches(cmd.sha, sha) for sha in commit_shas):
            continue
        if not sha_matches(cmd.sha, head_sha):
            if commenter_lower not in stale_by_user:
                # Store original case for display in notifications
                stale_by_user[commenter_lower] = cmd.sha

    # Return original usernames for @ mentions (GitHub handles case)
    return [{"user": user, "sha": sha} for user, sha in stale_by_user.items()]


# --- Notification Comment ---

COMMENT_MARKER = "<!-- agent-approval-check -->"
STALE_MARKER = "<!-- agent-approval-stale -->"


def find_notification_comment(comments: list[dict]) -> dict | None:
    for c in comments:
        if COMMENT_MARKER in (c.get("body") or ""):
            return c
    return None


def find_stale_notification_for_commit(
    comments: list[dict], latest_sha: str
) -> dict | None:
    short_sha = latest_sha[:12]
    for c in comments:
        body = c.get("body") or ""
        if STALE_MARKER in body and short_sha in body:
            return c
    return None


def find_old_stale_notifications(comments: list[dict], latest_sha: str) -> list[dict]:
    short_sha = latest_sha[:12]
    return [
        c
        for c in comments
        if STALE_MARKER in (c.get("body") or "")
        and short_sha not in (c.get("body") or "")
    ]


def generate_notification_comment(
    approvers: set[str],
    stale_approvals: list[dict],
    detection_reason: str,
    head_sha: str,
    sibling_blocker_prs: list[int] | None = None,
    sibling_list_incomplete: bool = False,
) -> str:
    short_sha = head_sha[:12]
    approver_count = len(approvers)
    has_enough = approver_count >= REQUIRED_APPROVALS

    lines = [COMMENT_MARKER]

    if has_enough:
        lines.append(
            f"### Agent Activity - Approved ({approver_count}/{REQUIRED_APPROVALS})\n"
        )
        lines.append(
            f"This PR has received {approver_count}/{REQUIRED_APPROVALS} required approvals.\n"
        )
    else:
        lines.append(
            f"### Agent Activity - Needs Approval ({approver_count}/{REQUIRED_APPROVALS})\n"
        )
        lines.append(
            f"This PR requires **{REQUIRED_APPROVALS} trusted actor approvals** before it can be merged.\n"
        )

    lines.append(f"\n> {detection_reason}\n")

    # The commit status is held at pending while sibling PRs share this head
    # commit (statuses are SHA-scoped — see post_status). Say so here too,
    # otherwise an "Approved" comment contradicts a pending required check.
    if sibling_blocker_prs or sibling_list_incomplete:
        lines.append("\n### Blocked — Sibling PRs Share This Commit\n")
        if sibling_blocker_prs:
            listed = ", ".join(f"#{n}" for n in sibling_blocker_prs)
            lines.append(
                f"Open PR(s) with the same head commit also target a protected "
                f"branch: {listed}."
            )
        if sibling_list_incomplete:
            lines.append(
                "The full list of PRs sharing this commit could not be verified — "
                "more may exist."
            )
        lines.append(
            "\nA success status here would also satisfy their required check "
            "without review, so this check stays `pending` until those PRs are "
            "closed or re-targeted."
        )

    if approvers:
        lines.append("\n### Approvers\n")
        for approver in sorted(approvers):
            lines.append(f"- @{approver}")
        lines.append("")

    if stale_approvals:
        lines.append("\n### Stale Approvals\n")
        lines.append("The following approvals need to be re-submitted:\n")
        for stale in stale_approvals:
            lines.append(f"- @{stale['user']} (approved `{stale['sha'][:12]}`)")
        lines.append("")

    if not has_enough:
        lines.append("\n### How to Approve\n")
        lines.append("1. **Submit a GitHub review** with 'Approve', or")
        lines.append("2. **Comment:**")
        lines.append(f"```\n/approve {short_sha}\n```")
        lines.append(
            f"\n> **Note:** If you requested this change, your approval counts as "
            f"one of the {REQUIRED_APPROVALS} required approvals."
        )

    lines.append("\n---\n")
    lines.append(f"[Learn more about this check]({DOCS_URL})")

    return "\n".join(lines)


def generate_stale_notification(stale_approvals: list[dict], latest_sha: str) -> str:
    short_sha = latest_sha[:12]
    users = ", ".join(f"@{a['user']}" for a in stale_approvals)
    return f"""{STALE_MARKER}
{users}: Your previous `/approve` has become stale because new commits were pushed (head is now `{short_sha}`).

Please re-approve:
```
/approve {short_sha}
```"""


# --- GitHub Client ---


class GitHubClient:
    """GitHub API client optimized for minimal API calls.

    Uses GraphQL for reads and batched writes, REST only for commit status.
    """

    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo
        parts = repo.split("/")
        if len(parts) != 2:
            raise ValueError(f"Invalid repo format, expected 'owner/repo': {repo}")
        self.owner, self.repo_name = parts
        self._write_permission_cache: dict[str, bool] = {}
        self.base_url = "https://api.github.com"
        self.graphql_url = "https://api.github.com/graphql"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def _graphql(self, query: str, variables: dict | None = None) -> dict:
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={"query": query, "variables": variables or {}},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            # Log rate limit even on errors - helps debug rate limit issues
            log_rate_limit(data.get("rateLimit"), "GraphQL error")
            errors = data["errors"]
            error_messages = [e.get("message", str(e)) for e in errors]
            raise RuntimeError(f"GraphQL errors: {error_messages}")

        return data.get("data", {})

    @retry(
        retry=retry_if_exception(_retryable_http_error),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def _rest_request(
        self, method: str, path: str, context: str = "rest", **kwargs
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        response = httpx.request(
            method, url, headers=self.headers, timeout=30, **kwargs
        )
        response.raise_for_status()
        log_rest_rate_limit(response, context)
        return response

    def has_write_permission(self, login: str) -> bool:
        """True if `login` has write/maintain/admin on this repo.

        Cached per login so repeated reviews/comments from the same user cost
        one REST call. 404 (not a collaborator) and read/triage return False.
        """
        key = login.lower()
        if key in self._write_permission_cache:
            return self._write_permission_cache[key]
        path = f"/repos/{self.owner}/{self.repo_name}/collaborators/{login}/permission"
        try:
            response = self._rest_request(
                "GET", path, context="collaborator-permission"
            )
        except httpx.HTTPStatusError as e:
            if e.response is not None and e.response.status_code == 404:
                logger.info("Permission check: %s is not a collaborator", login)
                self._write_permission_cache[key] = False
                return False
            raise
        permission = (response.json() or {}).get("permission", "")
        result = permission in WRITE_PERMISSION_LEVELS
        logger.info(
            "Permission check: %s -> %s (%s)",
            login,
            permission,
            "write" if result else "no-write",
        )
        self._write_permission_cache[key] = result
        return result

    def fetch_pr_data(self, pr_number: int) -> PRData:
        """Fetch all PR data in a single GraphQL call."""
        logger.info("Fetching PR #%d data via GraphQL", pr_number)

        data = self._graphql(
            GRAPHQL_PR_QUERY,
            {"owner": self.owner, "repo": self.repo_name, "prNumber": pr_number},
        )

        log_rate_limit(data.get("rateLimit"), "GraphQL read")

        repository = data.get("repository") or {}
        pr_data = repository.get("pullRequest")
        if not pr_data:
            raise RuntimeError(f"PR #{pr_number} not found")

        # Authoritative head commit. commits(last:1) is usually the head, but
        # headRefOid is the branch tip GitHub actually merges and attaches
        # statuses to, so it's used everywhere a head SHA is needed.
        head_ref_oid = pr_data.get("headRefOid") or ""

        # GraphQL can return an explicit `null` for a connection on a
        # partial/retried response. For commits/reviews/comments/headCommit,
        # acting on empty data is fail-open (missed agent activity, dropped
        # /approve comments, missed same-SHA sibling PRs), so raise and let
        # the workflow fail closed. For files, empty data is safe:
        # is_review_exempt_pr fails closed on an empty file list.
        for name in ("commits", "reviews", "comments", "headCommit"):
            conn = pr_data.get(name)
            if conn is None or conn.get("nodes") is None:
                raise RuntimeError(
                    f"GraphQL returned null for {name!r} connection (partial response)"
                )
        commits_conn = pr_data["commits"]
        reviews_conn = pr_data["reviews"]
        comments_conn = pr_data["comments"]
        files_conn = pr_data.get("files") or {}

        # Check pagination - using `last:` so we check hasPreviousPage
        # For commits: fail-closed if incomplete (security concern)
        # For reviews/comments: just warn (old items likely stale)

        commits_incomplete = (commits_conn.get("pageInfo") or {}).get(
            "hasPreviousPage", False
        )
        if commits_incomplete:
            logger.warning(
                "PR has >100 commits - cannot verify all commits, will require approval"
            )
        if (reviews_conn.get("pageInfo") or {}).get("hasPreviousPage"):
            logger.warning("PR has more than 100 reviews - some may be missed")

        commit_nodes = commits_conn["nodes"]

        # Normalize to REST-like format
        commits = [
            {
                "sha": (node.get("commit") or {}).get("oid", ""),
                "commit": {
                    "committer": {
                        "email": (
                            (node.get("commit") or {}).get("committer") or {}
                        ).get("email", ""),
                    },
                    "signature": (node.get("commit") or {}).get("signature"),
                },
            }
            for node in commit_nodes
        ]

        reviews = [
            {
                "user": {"login": normalize_graphql_login(node.get("author"))},
                "author_association": node.get("authorAssociation", ""),
                "state": node.get("state", ""),
                "commit_id": (node.get("commit") or {}).get("oid", ""),
                "submitted_at": node.get("submittedAt", ""),
            }
            for node in reviews_conn["nodes"]
        ]

        def normalize_comment(node: dict) -> dict:
            return {
                "id": node.get("databaseId", 0),
                "node_id": node.get("id", ""),
                "user": {"login": normalize_graphql_login(node.get("author"))},
                "author_association": node.get("authorAssociation", ""),
                "body": node.get("body", ""),
                "is_minimized": node.get("isMinimized", False),
            }

        comments = [normalize_comment(node) for node in comments_conn["nodes"]]

        # Paginate the full comment history. The notification comment (and any
        # earlier /approve commands) can fall outside the most-recent-100 window
        # on long-lived PRs; without the full set we'd post duplicate sticky
        # comments and silently drop valid approvals.
        page_info = comments_conn.get("pageInfo") or {}
        cursor = page_info.get("startCursor")
        while page_info.get("hasPreviousPage") and cursor:
            page = self._graphql(
                GRAPHQL_COMMENTS_PAGE_QUERY,
                {
                    "owner": self.owner,
                    "repo": self.repo_name,
                    "prNumber": pr_number,
                    "before": cursor,
                },
            )
            page_conn = (
                ((page.get("repository") or {}).get("pullRequest") or {}).get(
                    "comments"
                )
                or {}
            )
            page_nodes = page_conn.get("nodes")
            if page_nodes is None:
                raise RuntimeError(
                    "GraphQL returned null for paginated comments (partial response)"
                )
            comments = [normalize_comment(n) for n in page_nodes] + comments
            page_info = page_conn.get("pageInfo") or {}
            cursor = page_info.get("startCursor")

        files = [node.get("path", "") for node in (files_conn.get("nodes") or [])]
        files_incomplete = (files_conn.get("pageInfo") or {}).get("hasNextPage", False)
        if files_incomplete:
            logger.warning("PR has >100 changed files - cannot verify all file paths")

        # Other open PRs whose head is this exact commit. Filtering on
        # headRefOid keeps stacked PRs (whose branches merely contain this
        # commit) out of the list — only true same-SHA siblings count.
        #
        # Any null along the nested path (headCommit node, commit,
        # associatedPullRequests, its nodes) means the sibling list is
        # unverifiable. Treating it as empty would be fail-open — the guard
        # in process_pr would stamp success on the shared SHA — so mark it
        # incomplete instead, which holds success at pending. Same partial-
        # response class as the top-level connection check above, but
        # non-lossy: the run still completes and posts a status.
        same_sha_open_prs: list[tuple[int, str]] = []
        head_commit_nodes = pr_data["headCommit"]["nodes"]
        head_commit = (
            (head_commit_nodes[0] or {}).get("commit") if head_commit_nodes else None
        ) or {}
        # `.get(k) or default` (not `.get(k, default)`) throughout: an explicit
        # JSON null returns None from .get(k, default), and these values feed
        # security decisions.
        # commits(last:1) is date-ordered, so it can return a non-head commit;
        # if its oid != headRefOid the associatedPullRequests below are for the
        # wrong commit and the sibling list is unverifiable.
        head_commit_oid = head_commit.get("oid")
        assoc = head_commit.get("associatedPullRequests")
        assoc_nodes = (assoc or {}).get("nodes")
        if (
            not head_commit
            or not head_ref_oid
            or head_commit_oid != head_ref_oid
            or assoc_nodes is None
        ):
            # Without the head OID the stacked-PR filter below can't tell
            # siblings from stacked PRs, so the whole list is unverifiable.
            same_sha_prs_incomplete = True
            logger.warning(
                "Head commit's associatedPullRequests unverifiable (partial "
                "response or commits(last:1) != headRefOid) — treating "
                "same-SHA sibling list as incomplete"
            )
        else:
            same_sha_prs_incomplete = ((assoc or {}).get("pageInfo") or {}).get(
                "hasNextPage", False
            )
            for node in assoc_nodes:
                state = (node or {}).get("state")
                number = (node or {}).get("number")
                base_ref = (node or {}).get("baseRefName")
                node_head_oid = (node or {}).get("headRefOid")
                if (
                    not node
                    or state is None
                    or not isinstance(number, int)
                    or not base_ref
                    or not node_head_oid
                ):
                    # Null element or null scalar leaf — we can't tell whether
                    # this entry is an open protected-base sibling. Coercing
                    # (e.g. base_ref -> "") would silently drop it from the
                    # guard, which is fail-open; mark unverifiable instead.
                    same_sha_prs_incomplete = True
                    continue
                if state != "OPEN" or number == pr_number:
                    continue
                if node_head_oid != head_ref_oid:
                    continue
                same_sha_open_prs.append((number, base_ref))

        return PRData(
            node_id=pr_data.get("id") or "",
            number=pr_data.get("number") or pr_number,
            head_sha=head_ref_oid,
            head_ref=pr_data.get("headRefName") or "",
            base_ref=pr_data.get("baseRefName") or "",
            default_branch=(repository.get("defaultBranchRef") or {}).get("name") or "",
            created_at=pr_data.get("createdAt") or "",
            author_login=normalize_graphql_login(pr_data.get("author")),
            commits=commits,
            reviews=reviews,
            comments=comments,
            files=files,
            commits_incomplete=commits_incomplete,
            files_incomplete=files_incomplete,
            same_sha_open_prs=same_sha_open_prs,
            same_sha_prs_incomplete=same_sha_prs_incomplete,
        )

    def execute_mutation_batch(self, batch: MutationBatch) -> None:
        """Execute all mutations in a single GraphQL call."""
        if batch.is_empty():
            logger.info("No mutations to execute")
            return

        builder = MutationBuilder()

        for node_id, content in batch.reactions:
            builder.add_reaction(node_id, content)

        if batch.create_comment:
            builder.add_comment("createNotif", *batch.create_comment)

        if batch.update_comment:
            builder.update_comment("updateNotif", *batch.update_comment)

        if batch.create_stale_comment:
            builder.add_comment("createStale", *batch.create_stale_comment)

        for node_id, reason in batch.minimize_comments:
            builder.minimize_comment(node_id, reason)

        for node_id in batch.unminimize_comments:
            builder.unminimize_comment(node_id)

        result = builder.build()
        if not result:
            return

        logger.info(
            "Executing batched mutations: %d reactions, %s notification, %s stale, %d minimize, %d unminimize",
            len(batch.reactions),
            "create"
            if batch.create_comment
            else ("update" if batch.update_comment else "none"),
            "create" if batch.create_stale_comment else "none",
            len(batch.minimize_comments),
            len(batch.unminimize_comments),
        )

        mutation, variables = result
        data = self._graphql(mutation, variables)
        log_rate_limit(data.get("rateLimit"), "GraphQL write")

    def create_commit_status(
        self,
        sha: str,
        state: str,
        context: str,
        description: str,
        target_url: str | None = None,
    ) -> dict:
        """Create commit status via REST (no GraphQL equivalent)."""
        payload: dict = {"state": state, "context": context, "description": description}
        if target_url:
            payload["target_url"] = target_url
        return self._rest_request(
            "POST",
            f"/repos/{self.repo}/statuses/{sha}",
            context="commit-status",
            json=payload,
        ).json()


# --- Main Processing ---


def get_workflow_run_url(repo: str) -> str | None:
    run_id = os.environ.get("GITHUB_RUN_ID")
    if run_id:
        return f"https://github.com/{repo}/actions/runs/{run_id}"
    return None


# Status description format includes SHA for cache detection
def format_status_description(message: str, head_sha: str) -> str:
    """Format status description with SHA suffix for traceability.

    GitHub rejects commit-status descriptions over 140 characters; clamp the
    message rather than letting the status POST fail.
    """
    suffix = f" [{head_sha[:12]}]"
    max_message = 140 - len(suffix)
    if len(message) > max_message:
        message = message[: max_message - 1] + "…"
    return f"{message}{suffix}"


def process_pr(
    client: GitHubClient,
    pr_number: int,
    config: AgentConfig,
) -> None:
    """Process a single PR for agent approval check."""
    logger.info("Processing PR #%d", pr_number)
    run_url = get_workflow_run_url(client.repo)

    # === GraphQL read ===
    pr_data = client.fetch_pr_data(pr_number)

    if not is_protected_base(
        pr_data.base_ref, config, client.repo, pr_data.default_branch
    ):
        # Refuse to post any status for a PR that doesn't target a protected
        # base — commit statuses are SHA-scoped, so a success here would also
        # satisfy the required check on a sibling PR from the same head SHA
        # that does target a protected base.
        logger.info(
            "PR #%d targets %r, which is not a protected base for %s — "
            "not posting a status",
            pr_number,
            pr_data.base_ref,
            client.repo,
        )
        return

    if not pr_data.commits:
        logger.info("No commits found in PR")
        return

    head_sha = pr_data.head_sha
    if not head_sha:
        logger.error("Could not determine HEAD SHA")
        return

    # Statuses are SHA-scoped: a success posted here also satisfies the
    # required check on any other open protected-base PR whose head is this
    # same commit, even though that PR's base-relative diff was never
    # evaluated. Hold success at pending until those siblings are closed or
    # re-targeted (rare in practice — a handful of same-branch hotfix pairs
    # per month).
    open_protected_siblings = sorted(
        number
        for number, base_ref in pr_data.same_sha_open_prs
        if number != pr_number
        and is_protected_base(base_ref, config, client.repo, pr_data.default_branch)
    )

    sibling_blocker = bool(open_protected_siblings) or pr_data.same_sha_prs_incomplete

    def sibling_blocker_message() -> str:
        if not open_protected_siblings:
            return "Cannot list PRs sharing this commit — holding at pending"
        listed = ", ".join(f"#{n}" for n in open_protected_siblings[:3])
        if len(open_protected_siblings) > 3:
            listed += f" +{len(open_protected_siblings) - 3} more"
        note = " (list may be incomplete)" if pr_data.same_sha_prs_incomplete else ""
        return (
            f"Sibling PR(s) {listed}{note} share this commit — close or re-target them"
        )

    def post_status(state: str, message: str) -> None:
        if state == "success" and sibling_blocker:
            message = sibling_blocker_message()
            logger.warning(
                "Withholding success for PR #%d: open protected-base PRs %s share head %s",
                pr_number,
                open_protected_siblings or "(unverified)",
                head_sha,
            )
            state = "pending"
        client.create_commit_status(
            sha=head_sha,
            state=state,
            context=CHECK_NAME,
            description=format_status_description(message, head_sha),
            target_url=run_url,
        )
        logger.info("Set status: %s — %s", state, message)

    if is_review_exempt_pr(pr_data, config, client.repo):
        post_status("success", "Review-exempt PR")
        logger.info("Review-exempt PR")
        return

    if is_exempt_branch(pr_data.head_ref, config):
        post_status("success", "Exempt branch")
        logger.info("Exempt branch '%s'", pr_data.head_ref)
        return

    # If we couldn't fetch all commits, fail-closed (require approval)
    # This prevents an attacker from hiding agent commits beyond the 100 limit
    if pr_data.commits_incomplete:
        result = AgentActivityResult(
            has_agent_activity=True,
            latest_agent_commit=pr_data.commits[-1] if pr_data.commits else None,
            detection_reason=(
                "⚠️ PR has >100 commits — cannot verify all commits are human-authored, "
                "so approval is required as a security precaution"
            ),
        )
    else:
        # Check for agent activity
        result = check_for_agent_activity(
            pr_data.commits,
            pr_data.author_login,
            config,
            reviews=pr_data.reviews,
        )

    if not result.has_agent_activity:
        # No agent activity - set success status directly
        # === REST commit status ===
        post_status("success", "No agent activity")
        logger.info("No agent activity detected")
        return

    logger.info("Agent activity detected. Head SHA: %s", head_sha)

    # Count approvals. The PR author counts as one approver (via /approve
    # comment) like anyone else with write access — they cannot single-handedly
    # satisfy the threshold.
    approvers = count_approvers(
        head_sha,
        pr_data.reviews,
        pr_data.comments,
        config,
        client.has_write_permission,
    )
    stale_approvals = find_stale_approvals(
        pr_data.comments,
        head_sha,
        config,
        pr_data.commits,
        client.has_write_permission,
        current_approvers=approvers,
    )

    approver_count = len(approvers)
    has_enough = approver_count >= REQUIRED_APPROVALS

    # Build mutation batch
    batch = MutationBatch()

    # Collect reactions for valid /approve comments
    collect_approval_reactions(
        batch, pr_data.comments, head_sha, config, client.has_write_permission
    )

    # Prepare notification comment. The sibling blocker is threaded in so the
    # comment never claims "approved" while post_status holds the required
    # check at pending for sibling PRs sharing this head commit.
    comment_body = generate_notification_comment(
        approvers=approvers,
        stale_approvals=stale_approvals,
        detection_reason=result.detection_reason,
        head_sha=head_sha,
        sibling_blocker_prs=open_protected_siblings or None,
        sibling_list_incomplete=pr_data.same_sha_prs_incomplete,
    )

    existing_comment = find_notification_comment(pr_data.comments)
    if existing_comment:
        batch.update_comment = (existing_comment["node_id"], comment_body)
        # Minimize when approved (including author-approved) — once the check
        # succeeds, the remaining gate is a normal GitHub review which shows
        # natively in the UI. The bot comment is just noise at that point.
        # Never minimize while a sibling blocker holds the status at pending:
        # the comment carries the only explanation of why.
        if (
            has_enough
            and not sibling_blocker
            and not existing_comment.get("is_minimized")
        ):
            batch.minimize_comments.append((existing_comment["node_id"], "RESOLVED"))
        elif (not has_enough or sibling_blocker) and existing_comment.get(
            "is_minimized"
        ):
            batch.unminimize_comments.append(existing_comment["node_id"])
    else:
        batch.create_comment = (pr_data.node_id, comment_body)

    # Handle stale notifications
    if stale_approvals and not has_enough:
        # Minimize old stale notifications
        for old_comment in find_old_stale_notifications(pr_data.comments, head_sha):
            if not old_comment.get("is_minimized"):
                batch.minimize_comments.append((old_comment["node_id"], "OUTDATED"))

        # Create new stale notification if not exists
        if not find_stale_notification_for_commit(pr_data.comments, head_sha):
            stale_body = generate_stale_notification(stale_approvals, head_sha)
            batch.create_stale_comment = (pr_data.node_id, stale_body)

    # === GraphQL batch write ===
    client.execute_mutation_batch(batch)

    # === REST commit status ===
    if has_enough:
        post_status("success", f"{approver_count}/{REQUIRED_APPROVALS} approvals")
    else:
        post_status(
            "pending",
            f"Need {REQUIRED_APPROVALS} approvals (have {approver_count})",
        )

    logger.info("Approvals: %d/%d", approver_count, REQUIRED_APPROVALS)


def main() -> None:
    """Main entry point."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        logger.error("GH_TOKEN not set")
        sys.exit(1)

    repo = os.environ.get("GH_REPOSITORY") or os.environ.get("GITHUB_REPOSITORY")
    if not repo:
        logger.error("GH_REPOSITORY not set")
        sys.exit(1)

    config = load_agent_config_from_env(repo)
    logger.info(
        "Agent config: emails=%s app_logins=%s excluded_approvers=%s "
        "exempt_path_prefixes[%s]=%s required_approvals=%d",
        config.agent_emails,
        config.agent_app_logins,
        config.excluded_approver_logins,
        repo,
        config.exempt_path_prefixes.get(repo, []),
        REQUIRED_APPROVALS,
    )
    if not config.agent_emails and not config.agent_app_logins:
        logger.error(
            "No agent identities configured (agent_emails / agent_logins are empty)"
        )
        sys.exit(1)
    if REQUIRED_APPROVALS < 1:
        logger.error("REQUIRED_APPROVALS must be >= 1 (got %d)", REQUIRED_APPROVALS)
        sys.exit(1)

    pr_number_str = os.environ.get("GH_PR_NUMBER", "").strip()
    if pr_number_str:
        pr_number: int | None = int(pr_number_str)
    else:
        event_name = os.environ.get("GH_EVENT_NAME") or os.environ.get(
            "GITHUB_EVENT_NAME", ""
        )
        event_path = os.environ.get("GH_EVENT_PATH") or os.environ.get(
            "GITHUB_EVENT_PATH", ""
        )
        if not event_name or not event_path:
            logger.error("Neither GH_PR_NUMBER nor GH_EVENT_NAME/PATH are set")
            sys.exit(1)
        pr_number = resolve_pr_number(event_name, event_path)
        if pr_number is None:
            logger.info("Event %s is not associated with a PR — nothing to do", event_name)
            return

    pr_number = select_pr_candidate(
        pr_number, os.environ.get("GH_PR_CANDIDATES", ""), config, repo
    )

    client = GitHubClient(token, repo)
    process_pr(client, pr_number, config)


if __name__ == "__main__":
    main()
