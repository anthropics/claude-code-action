"""Unit tests for the pure decision logic in agent_approval_check.py.

This is the fail-closed merge gate for agent-authored PRs (see README.md in
this directory), so the tests focus on the decisions that can wrongly turn
the required status green: who counts as an approver, which /approve
commands are valid, and how agent identities are excluded from both.

Everything here runs without network access — GitHubClient is never
instantiated; permission checks are plain callables.
"""

import json
from pathlib import Path

import agent_approval_check as aac
import pytest

REPO = "org/repo"


def make_config(**overrides) -> aac.AgentConfig:
    defaults = {
        "agent_emails": ["noreply@anthropic.com"],
        "agent_app_logins": ["claude[bot]", "claude-code[bot]"],
        "excluded_approver_logins": [],
        "exempt_head_branches": [],
        "exempt_path_prefixes": {},
        "protected_bases": {},
    }
    defaults.update(overrides)
    return aac.AgentConfig(**defaults)


def make_permission_check(allowed=(), calls=None):
    """Permission-check callable recording every login it was asked about."""
    allowed = {login.lower() for login in allowed}
    if calls is None:
        calls = []

    def check(login: str) -> bool:
        calls.append(login)
        return login.lower() in allowed

    return check


def review(login, state, association="MEMBER", submitted_at="2026-01-01T00:00:00Z"):
    return {
        "user": {"login": login},
        "state": state,
        "author_association": association,
        "submitted_at": submitted_at,
    }


def approve_comment(login, sha, association="MEMBER", comment_id=1):
    return {
        "id": comment_id,
        "node_id": f"node{comment_id}",
        "user": {"login": login},
        "author_association": association,
        "body": f"/approve {sha}",
    }


HEAD = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"


# --- Identity normalization ---


class TestNormalizeGraphqlLogin:
    def test_bot_login_gets_rest_suffix(self):
        # GraphQL drops the [bot] suffix; without it a bot would fail every
        # is_agent_user check configured against REST-style "claude[bot]".
        assert (
            aac.normalize_graphql_login({"__typename": "Bot", "login": "claude-code"})
            == "claude-code[bot]"
        )

    def test_bot_login_already_suffixed_is_unchanged(self):
        assert (
            aac.normalize_graphql_login(
                {"__typename": "Bot", "login": "claude-code[bot]"}
            )
            == "claude-code[bot]"
        )

    def test_user_login_is_unchanged(self):
        assert (
            aac.normalize_graphql_login({"__typename": "User", "login": "alice"})
            == "alice"
        )

    def test_missing_author_returns_empty_string(self):
        assert aac.normalize_graphql_login(None) == ""
        assert aac.normalize_graphql_login({}) == ""


# --- Agent detection ---


class TestGetCommitterEmail:
    def test_reads_nested_committer_email(self):
        commit = {"commit": {"committer": {"email": "noreply@anthropic.com"}}}
        assert aac.get_committer_email(commit) == "noreply@anthropic.com"

    def test_missing_fields_return_empty_string(self):
        assert aac.get_committer_email({}) == ""
        assert aac.get_committer_email({"commit": {}}) == ""


class TestIsAgentCommit:
    def test_matches_configured_email(self):
        commit = {"commit": {"committer": {"email": "noreply@anthropic.com"}}}
        assert aac.is_agent_commit(commit, make_config())

    def test_email_match_is_case_insensitive(self):
        commit = {"commit": {"committer": {"email": "NoReply@Anthropic.COM"}}}
        assert aac.is_agent_commit(commit, make_config())

    def test_human_email_is_not_agent(self):
        commit = {"commit": {"committer": {"email": "human@example.com"}}}
        assert not aac.is_agent_commit(commit, make_config())

    def test_empty_email_is_not_agent(self):
        assert not aac.is_agent_commit({}, make_config())


class TestAgentUserChecks:
    def test_is_agent_user_is_case_insensitive(self):
        config = make_config()
        assert aac.is_agent_user("CLAUDE[bot]", config)
        assert aac.is_agent_user("claude-code[bot]", config)
        assert not aac.is_agent_user("alice", config)

    def test_is_agent_user_with_no_configured_agents(self):
        assert not aac.is_agent_user("claude[bot]", make_config(agent_app_logins=[]))

    def test_is_excluded_approver_is_case_insensitive(self):
        config = make_config(excluded_approver_logins=["stamp-bot"])
        assert aac.is_excluded_approver("Stamp-Bot", config)
        assert not aac.is_excluded_approver("alice", config)

    def test_is_pr_created_by_agent_is_case_insensitive(self):
        config = make_config()
        assert aac.is_pr_created_by_agent("Claude[Bot]", config)
        assert not aac.is_pr_created_by_agent("alice", config)


class TestCheckForAgentActivity:
    def test_agent_commit_is_detected_with_reason(self):
        commit = {
            "sha": HEAD,
            "commit": {"committer": {"email": "noreply@anthropic.com"}},
        }
        result = aac.check_for_agent_activity([commit], "alice", make_config())
        assert result.has_agent_activity
        assert result.latest_agent_commit is commit
        assert "noreply@anthropic.com" in result.detection_reason

    def test_only_human_commits_means_no_activity(self):
        commit = {"sha": HEAD, "commit": {"committer": {"email": "a@b.c"}}}
        result = aac.check_for_agent_activity([commit], "alice", make_config())
        assert not result.has_agent_activity
        assert result.detection_reason == ""

    def test_latest_agent_commit_wins_when_multiple(self):
        human = {"sha": "1" * 40, "commit": {"committer": {"email": "a@b.c"}}}
        old_agent = {
            "sha": "2" * 40,
            "commit": {"committer": {"email": "noreply@anthropic.com"}},
        }
        new_agent = {
            "sha": "3" * 40,
            "commit": {"committer": {"email": "NOREPLY@ANTHROPIC.COM"}},
        }
        result = aac.check_for_agent_activity(
            [old_agent, human, new_agent], "alice", make_config()
        )
        assert result.latest_agent_commit is new_agent

    def test_pr_author_agent_triggers_without_agent_commits(self):
        human = {"sha": HEAD, "commit": {"committer": {"email": "a@b.c"}}}
        result = aac.check_for_agent_activity([human], "claude[bot]", make_config())
        assert result.has_agent_activity
        assert result.latest_agent_commit is human
        assert "claude[bot]" in result.detection_reason

    def test_agent_approved_review_triggers_gate(self):
        # Without this path the agent's own APPROVED review would count toward
        # branch protection's required-reviews threshold as if it were human.
        human = {"sha": HEAD, "commit": {"committer": {"email": "a@b.c"}}}
        reviews = [review("claude-code[bot]", "APPROVED")]
        result = aac.check_for_agent_activity(
            [human], "alice", make_config(), reviews=reviews
        )
        assert result.has_agent_activity
        assert "claude-code[bot]" in result.detection_reason

    def test_non_approved_agent_review_does_not_trigger(self):
        human = {"sha": HEAD, "commit": {"committer": {"email": "a@b.c"}}}
        reviews = [review("claude[bot]", "COMMENTED")]
        result = aac.check_for_agent_activity(
            [human], "alice", make_config(), reviews=reviews
        )
        assert not result.has_agent_activity


class TestHasAgentApproval:
    def test_returns_agent_login_for_approved_review(self):
        reviews = [review("claude[bot]", "APPROVED")]
        assert aac.has_agent_approval(reviews, make_config()) == "claude[bot]"

    def test_ignores_non_approved_agent_reviews(self):
        reviews = [review("claude[bot]", "CHANGES_REQUESTED")]
        assert aac.has_agent_approval(reviews, make_config()) is None

    def test_ignores_approved_human_reviews(self):
        reviews = [review("alice", "APPROVED")]
        assert aac.has_agent_approval(reviews, make_config()) is None

    def test_skips_reviews_without_login(self):
        r = {"user": {"login": ""}, "state": "APPROVED"}
        assert aac.has_agent_approval([r], make_config()) is None


# --- /approve command parsing ---


class TestParseApproveCommand:
    def test_valid_command_returns_lowercase_sha(self):
        assert (
            aac.parse_approve_command(f"/approve {HEAD.upper()}") == HEAD.lower()
        )

    def test_minimum_and_maximum_sha_lengths_accepted(self):
        assert aac.parse_approve_command("/approve " + "a" * 12) == "a" * 12
        assert aac.parse_approve_command("/approve " + "a" * 40) == "a" * 40

    def test_too_short_sha_is_rejected(self):
        assert aac.parse_approve_command("/approve " + "a" * 11) is None

    def test_too_long_sha_is_rejected(self):
        assert aac.parse_approve_command("/approve " + "a" * 41) is None

    def test_non_hex_characters_are_rejected(self):
        assert aac.parse_approve_command("/approve zzzzzzzzzzzz") is None

    def test_leading_text_on_first_line_is_rejected(self):
        assert aac.parse_approve_command(f"LGTM /approve {HEAD}") is None

    def test_extra_tokens_on_first_line_are_rejected(self):
        assert aac.parse_approve_command(f"/approve {HEAD} LGTM") is None

    def test_email_reply_keeps_first_line_command(self):
        # GitHub email replies append the quoted notification below the
        # user's text; the first line must still be exactly the command.
        body = f"/approve {HEAD}\r\n\r\nOn Mon, Jan 1, 2026 someone wrote:\r\n> previous"
        assert aac.parse_approve_command(body) == HEAD

    def test_command_after_blank_lines_is_accepted(self):
        body = f"\n\n/approve {HEAD}\n"
        assert aac.parse_approve_command(body) == HEAD

    def test_empty_body_is_rejected(self):
        assert aac.parse_approve_command("") is None
        assert aac.parse_approve_command(None) is None


class TestShaMatches:
    def test_prefix_match_is_case_insensitive(self):
        assert aac.sha_matches(HEAD.upper(), HEAD)

    def test_full_sha_matches_itself(self):
        assert aac.sha_matches(HEAD, HEAD)

    def test_longer_approved_sha_does_not_match(self):
        assert not aac.sha_matches(HEAD + "ff", HEAD)

    def test_different_sha_does_not_match(self):
        assert not aac.sha_matches("b" * 40, HEAD)


# --- Permission/association pre-filters ---


class TestIterApproveCommands:
    def test_valid_comment_is_yielded(self):
        calls = []
        comments = [approve_comment("alice", HEAD)]
        cmds = list(
            aac.iter_approve_commands(comments, make_config(), make_permission_check(["alice"], calls))
        )
        assert len(cmds) == 1
        assert cmds[0].commenter == "alice"
        assert cmds[0].sha == HEAD
        assert cmds[0].comment_id == 1
        assert cmds[0].node_id == "node1"
        assert calls == ["alice"]

    def test_comment_without_login_is_skipped(self):
        c = approve_comment("", HEAD)
        c["user"] = {"login": ""}
        cmds = list(aac.iter_approve_commands([c], make_config(), lambda l: True))
        assert cmds == []

    def test_missing_author_association_is_skipped(self):
        # Only WRITE_ACCESS_ASSOCIATIONS pass the cheap pre-filter; anything
        # else (including a missing value) must not reach the REST check.
        c = approve_comment("alice", HEAD)
        c["author_association"] = "NONE"
        calls = []
        cmds = list(
            aac.iter_approve_commands([c], make_config(), make_permission_check(["alice"], calls))
        )
        assert cmds == []
        assert calls == []

    def test_agent_identity_never_yields_approve(self):
        c = approve_comment("claude[bot]", HEAD, association="COLLABORATOR")
        cmds = list(aac.iter_approve_commands([c], make_config(), lambda l: True))
        assert cmds == []

    def test_excluded_approver_never_yields_approve(self):
        config = make_config(excluded_approver_logins=["stamp-bot"])
        c = approve_comment("stamp-bot", HEAD)
        cmds = list(aac.iter_approve_commands([c], config, lambda l: True))
        assert cmds == []

    def test_unparseable_body_is_skipped(self):
        c = approve_comment("alice", HEAD)
        c["body"] = "looks good to me"
        cmds = list(aac.iter_approve_commands([c], make_config(), lambda l: True))
        assert cmds == []

    def test_failed_permission_check_is_skipped(self):
        c = approve_comment("alice", HEAD)
        cmds = list(aac.iter_approve_commands([c], make_config(), lambda l: False))
        assert cmds == []


class TestGetLatestReviewPerUser:
    def test_keeps_latest_decision_review_per_user(self):
        reviews = [
            review("alice", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
            review("alice", "APPROVED", submitted_at="2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert set(latest) == {"alice"}
        assert latest["alice"]["submitted_at"] == "2026-01-02T00:00:00Z"

    def test_changes_requested_overrides_earlier_approval(self):
        reviews = [
            review("alice", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
            review("alice", "CHANGES_REQUESTED", submitted_at="2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "CHANGES_REQUESTED"

    def test_approval_after_changes_requested_reapproves(self):
        reviews = [
            review("alice", "CHANGES_REQUESTED", submitted_at="2026-01-01T00:00:00Z"),
            review("alice", "APPROVED", submitted_at="2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "APPROVED"

    def test_commented_reviews_are_ignored(self):
        # A reviewer who approves then adds a comment is still approving —
        # matching GitHub's native behavior.
        reviews = [
            review("alice", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
            review("alice", "COMMENTED", submitted_at="2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "APPROVED"

    def test_reviews_without_login_are_skipped(self):
        r = review("", "APPROVED")
        r["user"] = {"login": None}
        assert aac.get_latest_review_per_user([r]) == {}

    def test_empty_reviews(self):
        assert aac.get_latest_review_per_user([]) == {}


# --- Core approval counting ---


class TestCountApprovers:
    def test_approved_review_with_write_access_counts(self):
        calls = []
        reviews = [review("alice", "APPROVED")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], make_config(), make_permission_check(["alice"], calls)
        )
        assert approvers == {"alice"}
        assert calls == ["alice"]

    def test_author_association_outside_write_set_is_never_counted(self):
        # CONTRIBUTOR/NONE cannot be trusted as a write-access signal; the
        # permission REST call must not even be made for them.
        calls = []
        reviews = [review("alice", "APPROVED", association="CONTRIBUTOR")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], make_config(), make_permission_check(["alice"], calls)
        )
        assert approvers == set()
        assert calls == []

    def test_changes_requested_does_not_count(self):
        reviews = [review("alice", "CHANGES_REQUESTED")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], make_config(), make_permission_check(["alice"])
        )
        assert approvers == set()

    def test_agent_identity_approval_never_counts(self):
        reviews = [review("claude[bot]", "APPROVED", association="COLLABORATOR")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], make_config(), make_permission_check(["claude[bot]"])
        )
        assert approvers == set()

    def test_excluded_approver_never_counts(self):
        config = make_config(excluded_approver_logins=["stamp-bot"])
        reviews = [review("stamp-bot", "APPROVED")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], config, make_permission_check(["stamp-bot"])
        )
        assert approvers == set()

    def test_failed_permission_check_does_not_count(self):
        reviews = [review("alice", "APPROVED")]
        approvers = aac.count_approvers(
            HEAD, reviews, [], make_config(), make_permission_check([])
        )
        assert approvers == set()

    def test_approve_comment_matching_head_counts(self):
        comments = [approve_comment("alice", HEAD)]
        approvers = aac.count_approvers(
            HEAD, [], comments, make_config(), make_permission_check(["alice"])
        )
        assert approvers == {"alice"}

    def test_approve_comment_for_old_sha_does_not_count(self):
        old_sha = "b" * 40
        comments = [approve_comment("alice", old_sha)]
        approvers = aac.count_approvers(
            HEAD, [], comments, make_config(), make_permission_check(["alice"])
        )
        assert approvers == set()

    def test_review_and_comment_from_same_user_dedupe(self):
        reviews = [review("Alice", "APPROVED")]
        comments = [approve_comment("alice", HEAD, comment_id=2)]
        approvers = aac.count_approvers(
            HEAD, reviews, comments, make_config(), make_permission_check(["alice"])
        )
        assert approvers == {"alice"}

    def test_logins_dedupe_case_insensitively(self):
        reviews = [
            review("Alice", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
            review("bob", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
        ]
        approvers = aac.count_approvers(
            HEAD,
            reviews,
            [],
            make_config(),
            make_permission_check(["ALICE", "Bob"]),
        )
        assert approvers == {"alice", "bob"}

    def test_distinct_approvers_from_reviews_and_comments(self):
        reviews = [review("alice", "APPROVED")]
        comments = [approve_comment("bob", HEAD, comment_id=2)]
        approvers = aac.count_approvers(
            HEAD,
            reviews,
            comments,
            make_config(),
            make_permission_check(["alice", "bob"]),
        )
        assert approvers == {"alice", "bob"}

    def test_full_security_scenario(self):
        # Agent approval, rubber-stamp bot, unauthorized user, stale /approve,
        # and a CHANGES_REQUESTED override all fail; only real humans count.
        config = make_config(excluded_approver_logins=["stamp-bot"])
        reviews = [
            review("claude-code[bot]", "APPROVED", association="COLLABORATOR"),
            review("stamp-bot", "APPROVED"),
            review("mallory", "APPROVED", association="NONE"),
            review("carol", "APPROVED", submitted_at="2026-01-01T00:00:00Z"),
            review("carol", "CHANGES_REQUESTED", submitted_at="2026-01-02T00:00:00Z"),
            review("alice", "APPROVED"),
        ]
        comments = [
            approve_comment("bob", "c" * 40, comment_id=2),  # old SHA
            approve_comment("bob", HEAD, comment_id=3),
        ]

        def permission_check(login):
            return login.lower() in {"alice", "bob", "carol"}

        approvers = aac.count_approvers(
            HEAD, reviews, comments, config, permission_check
        )
        assert approvers == {"alice", "bob"}


# --- Stale approvals ---


class TestFindStaleApprovals:
    COMMITS = [
        {"sha": "b" * 40},
        {"sha": HEAD},
    ]

    def test_approve_of_pushed_away_sha_is_stale(self):
        old_sha = "b" * 40
        comments = [approve_comment("alice", old_sha)]
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS,
            make_permission_check(["alice"]),
        )
        assert stale == [{"user": "alice", "sha": old_sha}]

    def test_current_approver_is_not_stale(self):
        old_sha = "b" * 40
        comments = [approve_comment("alice", old_sha)]
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS,
            make_permission_check(["alice"]),
            current_approvers={"alice"},
        )
        assert stale == []

    def test_sha_never_in_pr_commits_is_not_stale(self):
        comments = [approve_comment("alice", "d" * 40)]
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS,
            make_permission_check(["alice"]),
        )
        assert stale == []

    def test_approve_of_current_head_is_not_stale(self):
        comments = [approve_comment("alice", HEAD)]
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS,
            make_permission_check(["alice"]),
        )
        assert stale == []

    def test_one_entry_per_user(self):
        old_sha = "b" * 40
        comments = [
            approve_comment("alice", old_sha, comment_id=1),
            approve_comment("Alice", "e" * 40, comment_id=2),
        ]
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS + [{"sha": "e" * 40}],
            make_permission_check(["alice"]),
        )
        assert len(stale) == 1

    def test_invalid_or_unpermitted_approves_are_ignored(self):
        comments = [
            approve_comment("mallory", "b" * 40),  # fails permission check
        ]
        comments[0]["author_association"] = "NONE"
        stale = aac.find_stale_approvals(
            comments,
            HEAD,
            make_config(),
            self.COMMITS,
            make_permission_check(["mallory"]),
        )
        assert stale == []

    def test_empty_head_sha_returns_nothing(self):
        stale = aac.find_stale_approvals(
            [approve_comment("alice", "b" * 40)],
            "",
            make_config(),
            self.COMMITS,
            make_permission_check(["alice"]),
        )
        assert stale == []


# --- Routing and scoping ---


class TestIsProtectedBase:
    def test_defaults_to_the_repo_default_branch(self):
        config = make_config()
        assert aac.is_protected_base("main", config, REPO, "main")
        assert not aac.is_protected_base("develop", config, REPO, "main")

    def test_unknown_default_branch_fails_open_for_routing(self):
        # Sibling-PR defense is skipped with a warning — routing (not
        # enforcement) treats the base as protected rather than refusing.
        assert aac.is_protected_base("anything", make_config(), REPO, "")

    def test_explicit_exact_entry(self):
        config = make_config(protected_bases={REPO: {"exact": ["main"], "prefixes": []}})
        assert aac.is_protected_base("main", config, REPO, "other")
        assert not aac.is_protected_base("release/1", config, REPO, "other")

    def test_explicit_prefix_entry(self):
        config = make_config(
            protected_bases={REPO: {"exact": [], "prefixes": ["release/"]}}
        )
        assert aac.is_protected_base("release/1.2", config, REPO, "main")

    def test_explicit_entry_excludes_the_default_branch(self):
        # With a protected_bases entry the default branch is not implicitly
        # included — list it.
        config = make_config(protected_bases={REPO: {"exact": ["main"], "prefixes": []}})
        assert not aac.is_protected_base("develop", config, REPO, "develop")


class TestSelectPrCandidate:
    def config_with_protected_main(self):
        return make_config(protected_bases={REPO: {"exact": ["main"], "prefixes": []}})

    def test_empty_candidates_keeps_original(self):
        assert (
            aac.select_pr_candidate(7, "", self.config_with_protected_main(), REPO) == 7
        )

    def test_repo_without_explicit_entry_cannot_rank(self):
        # Without protected_bases the default-branch fallback needs the
        # GraphQL response, so no pre-fetch reordering happens.
        assert aac.select_pr_candidate(7, '[{"number": 5}]', make_config(), REPO) == 7

    def test_invalid_json_keeps_original(self):
        assert (
            aac.select_pr_candidate(7, "not-json", self.config_with_protected_main(), REPO)
            == 7
        )

    def test_non_list_json_keeps_original(self):
        assert (
            aac.select_pr_candidate(7, '{"number": 5}', self.config_with_protected_main(), REPO)
            == 7
        )

    def test_prefers_the_protected_candidate(self):
        candidates = json.dumps(
            [
                {"number": 9, "base": {"ref": "develop"}},
                {"number": 5, "base": {"ref": "main"}},
            ]
        )
        assert (
            aac.select_pr_candidate(9, candidates, self.config_with_protected_main(), REPO)
            == 5
        )

    def test_original_pr_kept_when_it_targets_protected_base(self):
        candidates = json.dumps(
            [
                {"number": 7, "base": {"ref": "main"}},
                {"number": 5, "base": {"ref": "main"}},
            ]
        )
        assert (
            aac.select_pr_candidate(7, candidates, self.config_with_protected_main(), REPO)
            == 7
        )

    def test_no_protected_candidate_keeps_original(self):
        candidates = json.dumps([{"number": 5, "base": {"ref": "develop"}}])
        assert (
            aac.select_pr_candidate(9, candidates, self.config_with_protected_main(), REPO)
            == 9
        )

    def test_malformed_entries_are_skipped(self):
        candidates = json.dumps(["nope", 42, {"base": {"ref": "main"}}])
        assert (
            aac.select_pr_candidate(9, candidates, self.config_with_protected_main(), REPO)
            == 9
        )


class TestExemptions:
    def test_exempt_branch_glob(self):
        config = make_config(exempt_head_branches=["renovate/*", "deps/*"])
        assert aac.is_exempt_branch("renovate/eslint-1.2.3", config)
        assert aac.is_exempt_branch("deps/foo", config)
        assert not aac.is_exempt_branch("feature/work", config)

    def test_no_exempt_patterns(self):
        assert not aac.is_exempt_branch("renovate/x", make_config())

    def _pr_data(self, files, files_incomplete=False):
        return aac.PRData(
            node_id="node",
            number=1,
            head_sha=HEAD,
            head_ref="feature",
            base_ref="main",
            default_branch="main",
            created_at="2026-01-01T00:00:00Z",
            author_login="alice",
            commits=[{"sha": HEAD}],
            reviews=[],
            comments=[],
            files=files,
            commits_incomplete=False,
            files_incomplete=files_incomplete,
        )

    def test_review_exempt_when_all_files_under_prefix(self):
        config = make_config(exempt_path_prefixes={REPO: ["docs/"]})
        pr = self._pr_data(["docs/a.md", "docs/sub/b.md"])
        assert aac.is_review_exempt_pr(pr, config, REPO)

    def test_one_file_outside_prefix_defeats_exemption(self):
        config = make_config(exempt_path_prefixes={REPO: ["docs/"]})
        pr = self._pr_data(["docs/a.md", "src/b.ts"])
        assert not aac.is_review_exempt_pr(pr, config, REPO)

    def test_no_prefixes_configured_fails_closed(self):
        pr = self._pr_data(["docs/a.md"])
        assert not aac.is_review_exempt_pr(pr, make_config(), REPO)

    def test_incomplete_file_list_fails_closed(self):
        config = make_config(exempt_path_prefixes={REPO: ["docs/"]})
        pr = self._pr_data(["docs/a.md"], files_incomplete=True)
        assert not aac.is_review_exempt_pr(pr, config, REPO)

    def test_no_files_fails_closed(self):
        config = make_config(exempt_path_prefixes={REPO: ["docs/"]})
        pr = self._pr_data([])
        assert not aac.is_review_exempt_pr(pr, config, REPO)

    def test_prefixes_for_a_different_repo_do_not_apply(self):
        config = make_config(exempt_path_prefixes={"other/repo": ["docs/"]})
        pr = self._pr_data(["docs/a.md"])
        assert not aac.is_review_exempt_pr(pr, config, REPO)


# --- Configuration loading ---


class TestPolicyConstants:
    def test_write_access_sets_are_not_widened(self):
        # These sets encode who can ever reach the authoritative REST
        # permission check and what it accepts. Lock them so an accidental
        # widening (e.g. a new association string) fails here first.
        assert aac.WRITE_ACCESS_ASSOCIATIONS == frozenset(
            {"OWNER", "MEMBER", "COLLABORATOR"}
        )
        assert aac.WRITE_PERMISSION_LEVELS == frozenset(
            {"write", "push", "maintain", "admin"}
        )


class TestLoadAgentConfig:
    def write_config(self, tmp_path, payload):
        path = tmp_path / "config.yaml"
        path.write_text(payload)
        return path

    def test_full_config_parses(self, tmp_path):
        path = self.write_config(
            tmp_path,
            """
agent_emails: [noreply@anthropic.com]
agent_app_logins: ["claude[bot]"]
excluded_approver_logins: [stamp-bot]
exempt_head_branches: ["renovate/*"]
exempt_path_prefixes:
  org/repo: [docs/]
protected_bases:
  org/repo:
    exact: [main]
    prefixes: [release/]
""",
        )
        config = aac.load_agent_config(path)
        assert config.agent_emails == ["noreply@anthropic.com"]
        assert config.agent_app_logins == ["claude[bot]"]
        assert config.excluded_approver_logins == ["stamp-bot"]
        assert config.exempt_head_branches == ["renovate/*"]
        assert config.exempt_path_prefixes == {REPO: ["docs/"]}
        assert config.protected_bases == {REPO: {"exact": ["main"], "prefixes": ["release/"]}}

    @pytest.mark.parametrize(
        "payload",
        [
            "- a\n- b\n",  # not a mapping
            "agent_emails: not-a-list\n",
            "agent_app_logins: claude[bot]\n",
            "excluded_approver_logins: {a: b}\n",
            "exempt_head_branches: renovate/*\n",
            "exempt_path_prefixes:\n  org/repo: docs/\n",  # not a list of prefixes
            "exempt_path_prefixes:\n  org/repo: [1, 2]\n",  # non-string prefixes
            "protected_bases:\n  org/repo: main\n",  # entry not a mapping
            "protected_bases:\n  org/repo: {exact: [1]}\n",  # non-string exact
        ],
    )
    def test_invalid_config_types_raise(self, tmp_path, payload):
        path = self.write_config(tmp_path, payload)
        with pytest.raises(ValueError):
            aac.load_agent_config(path)

    def test_empty_file_raises(self, tmp_path):
        path = self.write_config(tmp_path, "")
        with pytest.raises(ValueError):
            aac.load_agent_config(path)

    def test_protected_base_entry_defaults_missing_keys(self, tmp_path):
        # Missing exact/prefixes keys pass through raw; is_protected_base
        # defaults them via .get() at read time.
        path = self.write_config(
            tmp_path,
            """
protected_bases:
  org/repo:
    exact: [main]
""",
        )
        config = aac.load_agent_config(path)
        assert config.protected_bases[REPO] == {"exact": ["main"]}

    def test_shipped_example_config_is_valid(self):
        # Keeps the documented example in agent-identities.example.yaml
        # loadable — it is the template users copy.
        example = Path(__file__).parent / "agent-identities.example.yaml"
        config = aac.load_agent_config(example)
        assert config.agent_emails == ["noreply@anthropic.com"]
        assert config.agent_app_logins == ["claude[bot]", "claude-code[bot]"]
        assert config.exempt_path_prefixes["owner/repo"] == ["docs/"]
        assert config.protected_bases["owner/repo"]["exact"] == ["main"]


class TestLoadAgentConfigFromEnv:
    def test_parses_csv_inputs(self, monkeypatch):
        monkeypatch.setenv("AGENT_EMAILS", "noreply@anthropic.com, bot@x.co")
        monkeypatch.setenv("AGENT_LOGINS", "claude[bot],claude-code[bot]")
        monkeypatch.setenv("EXCLUDED_APPROVERS", "stamp-bot")
        monkeypatch.setenv("EXEMPT_HEAD_BRANCHES", "renovate/*")
        monkeypatch.setenv("EXEMPT_PATH_PREFIXES", "docs/, examples/")
        monkeypatch.setenv("PROTECTED_BASES", "main")

        config = aac.load_agent_config_from_env(REPO)
        assert config.agent_emails == ["noreply@anthropic.com", "bot@x.co"]
        assert config.agent_app_logins == ["claude[bot]", "claude-code[bot]"]
        assert config.excluded_approver_logins == ["stamp-bot"]
        assert config.exempt_head_branches == ["renovate/*"]
        assert config.exempt_path_prefixes == {REPO: ["docs/", "examples/"]}
        assert config.protected_bases == {REPO: {"exact": ["main"], "prefixes": []}}

    def test_blank_entries_are_dropped(self, monkeypatch):
        monkeypatch.setenv("AGENT_LOGINS", " claude[bot] , , ,")
        config = aac.load_agent_config_from_env(REPO)
        assert config.agent_app_logins == ["claude[bot]"]

    def test_unset_inputs_leave_defaults_empty(self, monkeypatch):
        for name in (
            "AGENT_EMAILS",
            "AGENT_LOGINS",
            "EXCLUDED_APPROVERS",
            "EXEMPT_HEAD_BRANCHES",
            "EXEMPT_PATH_PREFIXES",
            "PROTECTED_BASES",
            "CONFIG_FILE",
        ):
            monkeypatch.delenv(name, raising=False)
        config = aac.load_agent_config_from_env(REPO)
        assert config.agent_emails == []
        assert config.agent_app_logins == []
        assert config.exempt_path_prefixes == {}
        assert config.protected_bases == {}

    def test_config_file_takes_precedence_over_inline_inputs(self, tmp_path, monkeypatch):
        config_path = tmp_path / "identities.yaml"
        config_path.write_text("agent_emails: [from-file@x.co]\n")
        monkeypatch.setenv("CONFIG_FILE", str(config_path))
        monkeypatch.setenv("AGENT_EMAILS", "from-env@x.co")

        config = aac.load_agent_config_from_env(REPO)
        assert config.agent_emails == ["from-file@x.co"]


class TestResolvePrNumber:
    def write_event(self, tmp_path, event):
        path = tmp_path / "event.json"
        path.write_text(json.dumps(event))
        return str(path)

    @pytest.mark.parametrize("event_name", ["pull_request", "pull_request_target", "pull_request_review"])
    def test_pr_events(self, tmp_path, event_name):
        path = self.write_event(tmp_path, {"pull_request": {"number": 42}})
        assert aac.resolve_pr_number(event_name, path) == 42

    def test_issue_comment_on_a_pr(self, tmp_path):
        path = self.write_event(
            tmp_path, {"issue": {"number": 42, "pull_request": {"url": "x"}}}
        )
        assert aac.resolve_pr_number("issue_comment", path) == 42

    def test_issue_comment_on_a_plain_issue_returns_none(self, tmp_path):
        path = self.write_event(tmp_path, {"issue": {"number": 42}})
        assert aac.resolve_pr_number("issue_comment", path) is None

    def test_workflow_run_with_associated_prs(self, tmp_path):
        path = self.write_event(
            tmp_path,
            {"workflow_run": {"pull_requests": [{"number": 7}, {"number": 5}]}},
        )
        assert aac.resolve_pr_number("workflow_run", path) == 7

    def test_workflow_run_without_prs_returns_none(self, tmp_path):
        path = self.write_event(tmp_path, {"workflow_run": {"pull_requests": []}})
        assert aac.resolve_pr_number("workflow_run", path) is None

    def test_unsupported_event_raises(self, tmp_path):
        path = self.write_event(tmp_path, {})
        with pytest.raises(ValueError):
            aac.resolve_pr_number("push", path)


# --- Output rendering ---


class TestFormatStatusDescription:
    def test_appends_short_sha_suffix(self):
        out = aac.format_status_description("No agent activity", HEAD)
        assert out == f"No agent activity [{HEAD[:12]}]"

    def test_long_message_is_clamped_to_140_chars(self):
        # GitHub rejects commit-status descriptions over 140 characters; the
        # truncated message gets an ellipsis before the SHA suffix.
        out = aac.format_status_description("x" * 200, HEAD)
        assert len(out) == 140
        assert out.endswith(f"… [{HEAD[:12]}]")

    def test_message_exactly_at_the_limit_is_not_truncated(self):
        suffix = f" [{HEAD[:12]}]"
        message = "y" * (140 - len(suffix))
        out = aac.format_status_description(message, HEAD)
        assert out == f"{message}{suffix}"
        assert "…" not in out


class TestGenerateNotificationComment:
    @pytest.fixture(autouse=True)
    def required_approvals(self, monkeypatch):
        monkeypatch.setattr(aac, "REQUIRED_APPROVALS", 2)

    def test_contains_sticky_marker(self):
        body = aac.generate_notification_comment(set(), [], "reason", HEAD)
        assert aac.COMMENT_MARKER in body

    def test_pending_state_shows_counts_and_instructions(self):
        body = aac.generate_notification_comment(set(), [], "reason", HEAD)
        assert "Needs Approval (0/2)" in body
        assert f"/approve {HEAD[:12]}" in body
        assert "How to Approve" in body

    def test_enough_approvers_shows_approved_state(self):
        body = aac.generate_notification_comment({"alice", "bob"}, [], "reason", HEAD)
        assert "Approved (2/2)" in body
        assert "How to Approve" not in body

    def test_approvers_are_listed_sorted(self):
        body = aac.generate_notification_comment({"bob", "alice"}, [], "reason", HEAD)
        assert "- @alice" in body
        assert "- @bob" in body
        assert body.index("@alice") < body.index("@bob")

    def test_stale_section_lists_users_and_shas(self):
        stale = [{"user": "alice", "sha": "b" * 40}]
        body = aac.generate_notification_comment(set(), stale, "reason", HEAD)
        assert "Stale Approvals" in body
        assert "@alice" in body
        assert "b" * 12 in body

    def test_sibling_blocker_section(self):
        body = aac.generate_notification_comment(
            set(), [], "reason", HEAD, sibling_blocker_prs=[7, 9]
        )
        assert "Sibling PRs Share This Commit" in body
        assert "#7, #9" in body

    def test_incomplete_sibling_list_is_disclosed(self):
        body = aac.generate_notification_comment(
            set(), [], "reason", HEAD, sibling_list_incomplete=True
        )
        assert "more may exist" in body


class TestStaleNotifications:
    def test_generate_stale_notification_mentions_users_and_new_sha(self):
        body = aac.generate_stale_notification(
            [{"user": "alice"}, {"user": "bob"}], HEAD
        )
        assert aac.STALE_MARKER in body
        assert "@alice, @bob" in body
        assert f"/approve {HEAD[:12]}" in body

    def test_find_notification_comment_by_marker(self):
        comments = [
            {"body": "unrelated"},
            {"body": f"{aac.COMMENT_MARKER}\n### Agent Activity"},
        ]
        found = aac.find_notification_comment(comments)
        assert found is comments[1]

    def test_find_notification_comment_no_match(self):
        assert aac.find_notification_comment([{"body": "hi"}]) is None
        assert aac.find_notification_comment([{"body": None}]) is None

    def test_find_stale_notification_for_commit(self):
        comments = [
            {"body": f"{aac.STALE_MARKER}\nhead is now `{HEAD[:12]}`"},
            {"body": f"{aac.STALE_MARKER}\nhead is now `{'e' * 12}`"},
        ]
        assert aac.find_stale_notification_for_commit(comments, HEAD) is comments[0]

    def test_find_old_stale_notifications(self):
        comments = [
            {"body": f"{aac.STALE_MARKER}\nhead is now `{HEAD[:12]}`"},
            {"body": f"{aac.STALE_MARKER}\nhead is now `{'e' * 12}`"},
            {"body": "no marker"},
        ]
        old = aac.find_old_stale_notifications(comments, HEAD)
        assert old == [comments[1]]


# --- Mutation batch building ---


class TestMutationBuilder:
    def test_empty_builder_builds_nothing(self):
        assert aac.MutationBuilder().build() is None

    def test_reactions_use_numbered_aliases_and_variables(self):
        builder = aac.MutationBuilder()
        builder.add_reaction("node1", "THUMBS_UP")
        builder.add_reaction("node2", "EYES")
        mutation, variables = builder.build()
        assert "r1: addReaction(input: $r1)" in mutation
        assert "r2: addReaction(input: $r2)" in mutation
        assert "$r1: AddReactionInput!" in mutation
        assert variables["r1"] == {"subjectId": "node1", "content": "THUMBS_UP"}
        assert variables["r2"] == {"subjectId": "node2", "content": "EYES"}

    def test_comment_and_update_use_alias_variables(self):
        builder = aac.MutationBuilder()
        builder.add_comment("createNotif", "pr-node", "body")
        builder.update_comment("updateNotif", "c-node", "new body")
        mutation, variables = builder.build()
        assert "createNotif: addComment(input: $createNotif)" in mutation
        assert "updateNotif: updateIssueComment(input: $updateNotif)" in mutation
        assert variables["createNotif"] == {"subjectId": "pr-node", "body": "body"}
        assert variables["updateNotif"] == {"id": "c-node", "body": "new body"}

    def test_minimize_and_unminimize(self):
        # Aliases share one counter, so the unminimize below becomes u2.
        builder = aac.MutationBuilder()
        builder.minimize_comment("c1", "OUTDATED")
        builder.unminimize_comment("c2")
        mutation, variables = builder.build()
        assert "m1: minimizeComment(input: $m1)" in mutation
        assert "u2: unminimizeComment(input: $u2)" in mutation
        assert variables["m1"] == {"subjectId": "c1", "classifier": "OUTDATED"}
        assert variables["u2"] == {"subjectId": "c2"}


class TestMutationBatch:
    def test_fresh_batch_is_empty(self):
        assert aac.MutationBatch().is_empty()

    def test_any_collected_mutation_makes_it_non_empty(self):
        batch = aac.MutationBatch()
        batch.reactions.append(("node", "THUMBS_UP"))
        assert not batch.is_empty()

        batch = aac.MutationBatch()
        batch.create_comment = ("node", "body")
        assert not batch.is_empty()

        batch = aac.MutationBatch()
        batch.update_comment = ("node", "body")
        assert not batch.is_empty()

        batch = aac.MutationBatch()
        batch.create_stale_comment = ("node", "body")
        assert not batch.is_empty()

        batch = aac.MutationBatch()
        batch.minimize_comments.append(("node", "OUTDATED"))
        assert not batch.is_empty()

        batch = aac.MutationBatch()
        batch.unminimize_comments.append("node")
        assert not batch.is_empty()


# --- Reaction collection ---


class TestCollectApprovalReactions:
    def test_valid_matching_approve_gets_a_reaction(self):
        batch = aac.MutationBatch()
        comments = [approve_comment("alice", HEAD)]
        aac.collect_approval_reactions(
            batch, comments, HEAD, make_config(), make_permission_check(["alice"])
        )
        assert batch.reactions == [("node1", "THUMBS_UP")]

    def test_mismatched_or_invalid_approves_get_no_reaction(self):
        batch = aac.MutationBatch()
        comments = [
            approve_comment("alice", "b" * 40, comment_id=1),  # wrong SHA
            approve_comment("claude[bot]", HEAD, comment_id=2),  # agent
        ]
        aac.collect_approval_reactions(
            batch, comments, HEAD, make_config(), make_permission_check(["alice"])
        )
        assert batch.reactions == []

    def test_empty_head_sha_collects_nothing(self):
        batch = aac.MutationBatch()
        comments = [approve_comment("alice", HEAD)]
        aac.collect_approval_reactions(
            batch, comments, "", make_config(), make_permission_check(["alice"])
        )
        assert batch.reactions == []
