"""Unit tests for agent_approval_check.

Scope: the pure decision logic that determines whether the `agent-approval-check`
commit status turns green. These functions need no network, no credentials, and
no fixtures beyond plain dicts shaped like the GitHub API responses the script
normalizes internally.

The suite deliberately concentrates on the security-relevant paths — an agent
identity must never satisfy the gate, an `/approve` for the wrong SHA must not
count, and write access must be enforced — because a regression there turns the
gate green on an unreviewed agent-authored PR.
"""

import json

import pytest

import agent_approval_check as aac


# --- Fixtures / builders -------------------------------------------------


AGENT_EMAIL = "noreply@anthropic.com"
AGENT_LOGIN = "claude[bot]"


def make_config(**overrides) -> aac.AgentConfig:
    """An AgentConfig with the action's documented defaults."""
    defaults = dict(
        agent_emails=[AGENT_EMAIL],
        agent_app_logins=[AGENT_LOGIN, "claude-code[bot]"],
        excluded_approver_logins=[],
        exempt_head_branches=[],
        exempt_path_prefixes={},
        protected_bases={},
    )
    defaults.update(overrides)
    return aac.AgentConfig(**defaults)


def commit(sha: str = "a" * 40, email: str = "human@example.com") -> dict:
    return {"sha": sha, "commit": {"committer": {"email": email}}}


def review(
    login: str,
    state: str = "APPROVED",
    submitted_at: str = "2026-01-01T00:00:00Z",
    association: str = "MEMBER",
) -> dict:
    return {
        "user": {"login": login},
        "state": state,
        "submitted_at": submitted_at,
        "author_association": association,
    }


def comment(login: str, body: str, association: str = "MEMBER", **extra) -> dict:
    base = {
        "user": {"login": login},
        "body": body,
        "author_association": association,
        "id": 1,
        "node_id": "NODE",
    }
    base.update(extra)
    return base


def allow_all(_login: str) -> bool:
    return True


def deny_all(_login: str) -> bool:
    return False


# --- normalize_graphql_login ---------------------------------------------


class TestNormalizeGraphqlLogin:
    def test_none_author_returns_empty_string(self):
        assert aac.normalize_graphql_login(None) == ""

    def test_bot_gets_suffix_appended(self):
        author = {"login": "nrg-test", "__typename": "Bot"}
        assert aac.normalize_graphql_login(author) == "nrg-test[bot]"

    def test_bot_already_suffixed_is_unchanged(self):
        author = {"login": "nrg-test[bot]", "__typename": "Bot"}
        assert aac.normalize_graphql_login(author) == "nrg-test[bot]"

    def test_user_never_gets_suffix(self):
        author = {"login": "octocat", "__typename": "User"}
        assert aac.normalize_graphql_login(author) == "octocat"

    def test_missing_login_returns_empty_string(self):
        assert aac.normalize_graphql_login({"__typename": "User"}) == ""


# --- Agent identity matching ---------------------------------------------


class TestAgentIdentity:
    def test_agent_commit_matches_configured_email(self):
        assert aac.is_agent_commit(commit(email=AGENT_EMAIL), make_config())

    def test_agent_commit_is_case_insensitive(self):
        # RFC 5321: the domain is case-insensitive; the script lowercases both sides.
        assert aac.is_agent_commit(commit(email="NoReply@Anthropic.COM"), make_config())

    def test_human_commit_is_not_agent(self):
        assert not aac.is_agent_commit(commit(email="dev@example.com"), make_config())

    def test_missing_committer_email_is_not_agent(self):
        assert aac.get_committer_email({}) == ""
        assert not aac.is_agent_commit({}, make_config())

    @pytest.mark.parametrize("login", [AGENT_LOGIN, "CLAUDE[BOT]", "Claude-Code[Bot]"])
    def test_is_agent_user_is_case_insensitive(self, login):
        assert aac.is_agent_user(login, make_config())

    def test_non_agent_user(self):
        assert not aac.is_agent_user("octocat", make_config())

    def test_excluded_approver_is_case_insensitive(self):
        config = make_config(excluded_approver_logins=["rubber-stamp[bot]"])
        assert aac.is_excluded_approver("Rubber-Stamp[Bot]", config)
        assert not aac.is_excluded_approver("octocat", config)

    def test_pr_created_by_agent_is_case_insensitive(self):
        assert aac.is_pr_created_by_agent("Claude[Bot]", make_config())
        assert not aac.is_pr_created_by_agent("octocat", make_config())


# --- parse_approve_command / sha_matches ---------------------------------


class TestParseApproveCommand:
    SHA = "abcdef123456789012345678901234567890abcd"

    def test_parses_full_sha(self):
        assert aac.parse_approve_command(f"/approve {self.SHA}") == self.SHA

    def test_parses_twelve_char_short_sha(self):
        assert aac.parse_approve_command("/approve abcdef123456") == "abcdef123456"

    def test_rejects_sha_shorter_than_twelve(self):
        assert aac.parse_approve_command("/approve abcdef12345") is None

    def test_result_is_lowercased(self):
        assert aac.parse_approve_command("/APPROVE ABCDEF123456") == "abcdef123456"

    def test_email_reply_quoted_notification_is_ignored(self):
        # Documented behaviour: GitHub email replies append the quoted
        # notification below the user's text.
        body = f"/approve {self.SHA}\r\n\r\nOn Mon, Jan 1 2026, GitHub wrote:\r\n> ..."
        assert aac.parse_approve_command(body) == self.SHA

    def test_leading_whitespace_and_newlines_are_stripped(self):
        assert aac.parse_approve_command(f"\n\n  /approve {self.SHA}") == self.SHA

    def test_rejects_leading_text_on_the_command_line(self):
        assert aac.parse_approve_command(f"lgtm /approve {self.SHA}") is None

    def test_rejects_extra_tokens_after_the_sha(self):
        assert aac.parse_approve_command(f"/approve {self.SHA} lgtm") is None

    def test_rejects_command_on_a_later_line(self):
        assert aac.parse_approve_command(f"lgtm\n/approve {self.SHA}") is None

    def test_none_body(self):
        assert aac.parse_approve_command(None) is None

    def test_empty_body(self):
        assert aac.parse_approve_command("") is None

    def test_non_hex_sha_rejected(self):
        assert aac.parse_approve_command("/approve zzzzzzzzzzzz") is None


class TestShaMatches:
    def test_exact_match(self):
        assert aac.sha_matches("a" * 40, "a" * 40)

    def test_short_sha_prefix_matches_full_sha(self):
        assert aac.sha_matches("abcdef123456", "abcdef123456789012345678901234567890abcd")

    def test_case_insensitive(self):
        assert aac.sha_matches("ABCDEF123456", "abcdef123456789012345678901234567890abcd")

    def test_different_sha_does_not_match(self):
        assert not aac.sha_matches("abcdef123456", "f" * 40)


# --- get_latest_review_per_user ------------------------------------------


class TestGetLatestReviewPerUser:
    def test_commented_reviews_are_ignored(self):
        # Documented: a reviewer who approves then comments is still approving.
        reviews = [
            review("alice", "APPROVED", "2026-01-01T00:00:00Z"),
            review("alice", "COMMENTED", "2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "APPROVED"

    def test_changes_requested_overrides_earlier_approval(self):
        reviews = [
            review("alice", "APPROVED", "2026-01-01T00:00:00Z"),
            review("alice", "CHANGES_REQUESTED", "2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "CHANGES_REQUESTED"

    def test_later_approval_overrides_earlier_changes_requested(self):
        reviews = [
            review("alice", "CHANGES_REQUESTED", "2026-01-01T00:00:00Z"),
            review("alice", "APPROVED", "2026-01-02T00:00:00Z"),
        ]
        latest = aac.get_latest_review_per_user(reviews)
        assert latest["alice"]["state"] == "APPROVED"

    def test_reviews_without_a_login_are_skipped(self):
        reviews = [{"user": {}, "state": "APPROVED", "submitted_at": "2026-01-01"}]
        assert aac.get_latest_review_per_user(reviews) == {}

    def test_tracks_each_user_separately(self):
        reviews = [review("alice"), review("bob", "CHANGES_REQUESTED")]
        latest = aac.get_latest_review_per_user(reviews)
        assert set(latest) == {"alice", "bob"}


# --- count_approvers (the core gate) -------------------------------------


class TestCountApprovers:
    HEAD = "abcdef123456789012345678901234567890abcd"

    def test_counts_a_human_approving_review(self):
        approvers = aac.count_approvers(
            self.HEAD, [review("alice")], [], make_config(), allow_all
        )
        assert approvers == {"alice"}

    def test_agent_approval_never_counts(self):
        # The central security property: an agent cannot satisfy its own gate.
        approvers = aac.count_approvers(
            self.HEAD, [review(AGENT_LOGIN)], [], make_config(), allow_all
        )
        assert approvers == set()

    def test_excluded_approver_never_counts(self):
        config = make_config(excluded_approver_logins=["rubber-stamp[bot]"])
        approvers = aac.count_approvers(
            self.HEAD, [review("rubber-stamp[bot]")], [], config, allow_all
        )
        assert approvers == set()

    def test_changes_requested_does_not_count(self):
        approvers = aac.count_approvers(
            self.HEAD, [review("alice", "CHANGES_REQUESTED")], [], make_config(), allow_all
        )
        assert approvers == set()

    @pytest.mark.parametrize("association", ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR"])
    def test_review_without_write_association_does_not_count(self, association):
        approvers = aac.count_approvers(
            self.HEAD,
            [review("alice", association=association)],
            [],
            make_config(),
            allow_all,
        )
        assert approvers == set()

    def test_review_fails_when_permission_check_denies(self):
        # author_association is only a pre-filter; the REST permission check is the gate.
        approvers = aac.count_approvers(
            self.HEAD, [review("alice")], [], make_config(), deny_all
        )
        assert approvers == set()

    def test_approve_comment_matching_head_counts(self):
        comments = [comment("bob", f"/approve {self.HEAD}")]
        approvers = aac.count_approvers(
            self.HEAD, [], comments, make_config(), allow_all
        )
        assert approvers == {"bob"}

    def test_approve_comment_for_a_different_sha_does_not_count(self):
        comments = [comment("bob", "/approve " + "f" * 40)]
        approvers = aac.count_approvers(
            self.HEAD, [], comments, make_config(), allow_all
        )
        assert approvers == set()

    def test_approve_comment_from_agent_does_not_count(self):
        comments = [comment(AGENT_LOGIN, f"/approve {self.HEAD}")]
        approvers = aac.count_approvers(
            self.HEAD, [], comments, make_config(), allow_all
        )
        assert approvers == set()

    def test_approve_comment_without_write_association_does_not_count(self):
        comments = [comment("bob", f"/approve {self.HEAD}", association="NONE")]
        approvers = aac.count_approvers(
            self.HEAD, [], comments, make_config(), allow_all
        )
        assert approvers == set()

    def test_same_user_via_review_and_comment_counts_once(self):
        comments = [comment("alice", f"/approve {self.HEAD}")]
        approvers = aac.count_approvers(
            self.HEAD, [review("alice")], comments, make_config(), allow_all
        )
        assert approvers == {"alice"}

    def test_login_case_variants_dedupe_to_one_approver(self):
        # GitHub logins are case-insensitive; the set is lowercased for dedup.
        comments = [comment("Alice", f"/approve {self.HEAD}")]
        approvers = aac.count_approvers(
            self.HEAD, [review("alice")], comments, make_config(), allow_all
        )
        assert approvers == {"alice"}

    def test_two_distinct_humans_both_count(self):
        approvers = aac.count_approvers(
            self.HEAD, [review("alice"), review("bob")], [], make_config(), allow_all
        )
        assert approvers == {"alice", "bob"}


# --- Agent activity detection --------------------------------------------


class TestHasAgentApproval:
    def test_detects_agent_approved_review(self):
        assert aac.has_agent_approval([review(AGENT_LOGIN)], make_config()) == AGENT_LOGIN

    def test_ignores_agent_non_approved_review(self):
        assert aac.has_agent_approval([review(AGENT_LOGIN, "COMMENTED")], make_config()) is None

    def test_ignores_human_approval(self):
        assert aac.has_agent_approval([review("alice")], make_config()) is None


class TestCheckForAgentActivity:
    def test_agent_commit_triggers_the_gate(self):
        commits = [commit(sha="b" * 40, email=AGENT_EMAIL)]
        result = aac.check_for_agent_activity(commits, "octocat", make_config())
        assert result.has_agent_activity
        assert result.latest_agent_commit is commits[0]
        assert "agent email" in result.detection_reason

    def test_latest_agent_commit_wins_when_several_exist(self):
        first = commit(sha="1" * 40, email=AGENT_EMAIL)
        last = commit(sha="2" * 40, email=AGENT_EMAIL)
        result = aac.check_for_agent_activity([first, last], "octocat", make_config())
        assert result.latest_agent_commit is last

    def test_agent_authored_pr_triggers_the_gate_without_agent_commits(self):
        commits = [commit(email="dev@example.com")]
        result = aac.check_for_agent_activity(commits, AGENT_LOGIN, make_config())
        assert result.has_agent_activity
        assert "created by" in result.detection_reason

    def test_agent_approving_review_triggers_the_gate(self):
        # Without this, an agent's APPROVED review would silently count toward
        # branch protection's required-reviews threshold as if it were human.
        commits = [commit(email="dev@example.com")]
        result = aac.check_for_agent_activity(
            commits, "octocat", make_config(), reviews=[review(AGENT_LOGIN)]
        )
        assert result.has_agent_activity
        assert AGENT_LOGIN in result.detection_reason

    def test_purely_human_pr_is_not_gated(self):
        commits = [commit(email="dev@example.com")]
        result = aac.check_for_agent_activity(
            commits, "octocat", make_config(), reviews=[review("alice")]
        )
        assert not result.has_agent_activity
        assert result.latest_agent_commit is None
        assert result.detection_reason == ""


# --- Protected base / exemptions -----------------------------------------


class TestIsProtectedBase:
    def test_no_entry_protects_the_default_branch(self):
        assert aac.is_protected_base("main", make_config(), "o/r", "main")

    def test_no_entry_does_not_protect_other_branches(self):
        assert not aac.is_protected_base("feature", make_config(), "o/r", "main")

    def test_no_entry_and_unknown_default_branch_fails_closed(self):
        # Cannot rank without a default branch, so evaluate rather than skip.
        assert aac.is_protected_base("anything", make_config(), "o/r", "")

    def test_exact_entry_matches(self):
        config = make_config(protected_bases={"o/r": {"exact": ["release"]}})
        assert aac.is_protected_base("release", config, "o/r", "main")

    def test_prefix_entry_matches(self):
        config = make_config(protected_bases={"o/r": {"prefixes": ["release/"]}})
        assert aac.is_protected_base("release/2026-01", config, "o/r", "main")

    def test_explicit_entry_does_not_implicitly_include_default_branch(self):
        # Documented: "the default branch is not implicitly included — list it".
        config = make_config(protected_bases={"o/r": {"exact": ["release"]}})
        assert not aac.is_protected_base("main", config, "o/r", "main")


class TestIsExemptBranch:
    def test_glob_pattern_matches(self):
        config = make_config(exempt_head_branches=["dependabot/*"])
        assert aac.is_exempt_branch("dependabot/npm/lodash", config)

    def test_non_matching_branch(self):
        config = make_config(exempt_head_branches=["dependabot/*"])
        assert not aac.is_exempt_branch("feature/x", config)

    def test_empty_config_exempts_nothing(self):
        assert not aac.is_exempt_branch("anything", make_config())


class TestIsReviewExemptPr:
    def make_pr(self, files, files_incomplete=False) -> aac.PRData:
        return aac.PRData(
            node_id="N",
            number=1,
            head_sha="a" * 40,
            head_ref="feature",
            base_ref="main",
            default_branch="main",
            created_at="2026-01-01T00:00:00Z",
            author_login="octocat",
            commits=[],
            reviews=[],
            comments=[],
            files=files,
            commits_incomplete=False,
            files_incomplete=files_incomplete,
        )

    def test_all_files_under_exempt_prefix(self):
        config = make_config(exempt_path_prefixes={"o/r": ["docs/"]})
        pr = self.make_pr(["docs/a.md", "docs/b.md"])
        assert aac.is_review_exempt_pr(pr, config, "o/r")

    def test_one_file_outside_the_prefix_defeats_the_exemption(self):
        config = make_config(exempt_path_prefixes={"o/r": ["docs/"]})
        pr = self.make_pr(["docs/a.md", "src/main.py"])
        assert not aac.is_review_exempt_pr(pr, config, "o/r")

    def test_no_configured_prefixes_fails_closed(self):
        assert not aac.is_review_exempt_pr(self.make_pr(["docs/a.md"]), make_config(), "o/r")

    def test_incomplete_file_list_fails_closed(self):
        config = make_config(exempt_path_prefixes={"o/r": ["docs/"]})
        pr = self.make_pr(["docs/a.md"], files_incomplete=True)
        assert not aac.is_review_exempt_pr(pr, config, "o/r")

    def test_empty_file_list_fails_closed(self):
        config = make_config(exempt_path_prefixes={"o/r": ["docs/"]})
        assert not aac.is_review_exempt_pr(self.make_pr([]), config, "o/r")

    def test_prefixes_configured_for_a_different_repo_do_not_apply(self):
        config = make_config(exempt_path_prefixes={"other/repo": ["docs/"]})
        assert not aac.is_review_exempt_pr(self.make_pr(["docs/a.md"]), config, "o/r")


# --- select_pr_candidate -------------------------------------------------


class TestSelectPrCandidate:
    def config_with_protected(self):
        return make_config(protected_bases={"o/r": {"exact": ["main"]}})

    def test_empty_candidates_keeps_original(self):
        assert aac.select_pr_candidate(7, "", self.config_with_protected(), "o/r") == 7

    def test_repo_without_protected_bases_entry_keeps_original(self):
        candidates = json.dumps([{"number": 9, "base": {"ref": "main"}}])
        assert aac.select_pr_candidate(7, candidates, make_config(), "o/r") == 7

    def test_invalid_json_keeps_original(self):
        assert aac.select_pr_candidate(7, "{not json", self.config_with_protected(), "o/r") == 7

    def test_non_list_payload_keeps_original(self):
        assert aac.select_pr_candidate(7, '{"a": 1}', self.config_with_protected(), "o/r") == 7

    def test_original_pr_is_kept_when_it_targets_a_protected_base(self):
        candidates = json.dumps(
            [{"number": 7, "base": {"ref": "main"}}, {"number": 9, "base": {"ref": "main"}}]
        )
        assert aac.select_pr_candidate(7, candidates, self.config_with_protected(), "o/r") == 7

    def test_sibling_targeting_protected_base_is_selected(self):
        candidates = json.dumps(
            [{"number": 7, "base": {"ref": "scratch"}}, {"number": 9, "base": {"ref": "main"}}]
        )
        assert aac.select_pr_candidate(7, candidates, self.config_with_protected(), "o/r") == 9

    def test_lowest_numbered_protected_candidate_wins(self):
        candidates = json.dumps(
            [
                {"number": 12, "base": {"ref": "main"}},
                {"number": 9, "base": {"ref": "main"}},
            ]
        )
        assert aac.select_pr_candidate(7, candidates, self.config_with_protected(), "o/r") == 9

    def test_no_protected_candidate_keeps_original(self):
        candidates = json.dumps([{"number": 9, "base": {"ref": "scratch"}}])
        assert aac.select_pr_candidate(7, candidates, self.config_with_protected(), "o/r") == 7

    def test_malformed_candidate_entries_are_skipped(self):
        candidates = json.dumps(["nonsense", {"number": 9, "base": {"ref": "main"}}])
        assert aac.select_pr_candidate(7, candidates, self.config_with_protected(), "o/r") == 9


# --- find_stale_approvals ------------------------------------------------


class TestFindStaleApprovals:
    HEAD = "b" * 40
    OLD = "a" * 40

    def test_approval_for_a_superseded_commit_is_stale(self):
        comments = [comment("alice", f"/approve {self.OLD}")]
        commits = [commit(sha=self.OLD), commit(sha=self.HEAD)]
        stale = aac.find_stale_approvals(
            comments, self.HEAD, make_config(), commits, allow_all
        )
        assert stale == [{"user": "alice", "sha": self.OLD}]

    def test_approval_for_current_head_is_not_stale(self):
        comments = [comment("alice", f"/approve {self.HEAD}")]
        commits = [commit(sha=self.OLD), commit(sha=self.HEAD)]
        assert aac.find_stale_approvals(comments, self.HEAD, make_config(), commits, allow_all) == []

    def test_user_who_still_counts_is_not_reported_stale(self):
        comments = [comment("alice", f"/approve {self.OLD}")]
        commits = [commit(sha=self.OLD), commit(sha=self.HEAD)]
        stale = aac.find_stale_approvals(
            comments,
            self.HEAD,
            make_config(),
            commits,
            allow_all,
            current_approvers={"alice"},
        )
        assert stale == []

    def test_sha_not_in_this_pr_is_ignored(self):
        comments = [comment("alice", "/approve " + "c" * 40)]
        commits = [commit(sha=self.OLD), commit(sha=self.HEAD)]
        assert aac.find_stale_approvals(comments, self.HEAD, make_config(), commits, allow_all) == []

    def test_no_head_sha_returns_empty(self):
        comments = [comment("alice", f"/approve {self.OLD}")]
        assert aac.find_stale_approvals(comments, "", make_config(), [], allow_all) == []


# --- resolve_pr_number ---------------------------------------------------


class TestResolvePrNumber:
    def write_event(self, tmp_path, payload) -> str:
        path = tmp_path / "event.json"
        path.write_text(json.dumps(payload))
        return str(path)

    @pytest.mark.parametrize(
        "event_name", ["pull_request", "pull_request_target", "pull_request_review"]
    )
    def test_pull_request_events(self, tmp_path, event_name):
        path = self.write_event(tmp_path, {"pull_request": {"number": 42}})
        assert aac.resolve_pr_number(event_name, path) == 42

    def test_issue_comment_on_a_pr(self, tmp_path):
        path = self.write_event(
            tmp_path, {"issue": {"number": 42, "pull_request": {"url": "..."}}}
        )
        assert aac.resolve_pr_number("issue_comment", path) == 42

    def test_issue_comment_on_a_plain_issue_returns_none(self, tmp_path):
        path = self.write_event(tmp_path, {"issue": {"number": 42}})
        assert aac.resolve_pr_number("issue_comment", path) is None

    def test_workflow_run_uses_first_listed_pr(self, tmp_path):
        path = self.write_event(
            tmp_path, {"workflow_run": {"pull_requests": [{"number": 42}, {"number": 43}]}}
        )
        assert aac.resolve_pr_number("workflow_run", path) == 42

    def test_workflow_run_without_prs_returns_none(self, tmp_path):
        path = self.write_event(tmp_path, {"workflow_run": {"pull_requests": []}})
        assert aac.resolve_pr_number("workflow_run", path) is None

    def test_unsupported_event_raises(self, tmp_path):
        path = self.write_event(tmp_path, {})
        with pytest.raises(ValueError, match="Unsupported event"):
            aac.resolve_pr_number("push", path)


# --- format_status_description -------------------------------------------


class TestFormatStatusDescription:
    def test_appends_short_sha_suffix(self):
        out = aac.format_status_description("2 of 2 approvals", "abcdef123456789")
        assert out == "2 of 2 approvals [abcdef123456]"

    def test_clamps_to_githubs_140_character_limit(self):
        out = aac.format_status_description("x" * 300, "a" * 40)
        assert len(out) <= 140

    def test_clamped_message_is_ellipsised_and_keeps_the_suffix(self):
        out = aac.format_status_description("x" * 300, "a" * 40)
        assert out.endswith(" [aaaaaaaaaaaa]")
        assert "…" in out

    def test_message_at_the_limit_is_not_truncated(self):
        suffix_len = len(" [aaaaaaaaaaaa]")
        message = "x" * (140 - suffix_len)
        out = aac.format_status_description(message, "a" * 40)
        assert out == f"{message} [aaaaaaaaaaaa]"
        assert "…" not in out


# --- Config loading ------------------------------------------------------


class TestLoadAgentConfig:
    def write(self, tmp_path, text) -> "aac.Path":
        path = tmp_path / "agents.yaml"
        path.write_text(text)
        return path

    def test_loads_a_valid_config(self, tmp_path):
        path = self.write(
            tmp_path,
            "agent_emails:\n"
            "  - noreply@anthropic.com\n"
            "agent_app_logins:\n"
            "  - claude[bot]\n"
            "protected_bases:\n"
            "  o/r:\n"
            "    exact: [main]\n",
        )
        config = aac.load_agent_config(path)
        assert config.agent_emails == ["noreply@anthropic.com"]
        assert config.agent_app_logins == ["claude[bot]"]
        assert config.protected_bases == {"o/r": {"exact": ["main"]}}

    def test_missing_keys_default_to_empty(self, tmp_path):
        config = aac.load_agent_config(self.write(tmp_path, "agent_emails: []\n"))
        assert config.agent_app_logins == []
        assert config.exempt_path_prefixes == {}

    def test_non_mapping_document_is_rejected(self, tmp_path):
        with pytest.raises(ValueError, match="expected dict"):
            aac.load_agent_config(self.write(tmp_path, "- just\n- a\n- list\n"))

    def test_scalar_where_a_list_is_required_is_rejected(self, tmp_path):
        # Guards the documented failure mode: iterating a string's characters.
        with pytest.raises(ValueError, match="agent_emails must be a list"):
            aac.load_agent_config(self.write(tmp_path, "agent_emails: noreply@anthropic.com\n"))

    def test_exempt_path_prefixes_must_be_keyed_by_repo(self, tmp_path):
        with pytest.raises(ValueError, match="exempt_path_prefixes must be a dict"):
            aac.load_agent_config(self.write(tmp_path, "exempt_path_prefixes: [docs/]\n"))

    def test_exempt_path_prefix_entries_must_be_non_empty_strings(self, tmp_path):
        with pytest.raises(ValueError, match="non-empty strings"):
            aac.load_agent_config(
                self.write(tmp_path, "exempt_path_prefixes:\n  o/r: ['']\n")
            )

    def test_protected_bases_entry_must_be_a_mapping(self, tmp_path):
        with pytest.raises(ValueError, match="must be a dict with exact/prefixes"):
            aac.load_agent_config(
                self.write(tmp_path, "protected_bases:\n  o/r: [main]\n")
            )

    def test_shipped_example_config_is_valid(self):
        # The example file is what users copy; keep it loadable.
        example = aac.Path(__file__).parent / "agent-identities.example.yaml"
        config = aac.load_agent_config(example)
        assert isinstance(config, aac.AgentConfig)


class TestLoadAgentConfigFromEnv:
    def test_parses_csv_inputs(self, monkeypatch):
        monkeypatch.delenv("CONFIG_FILE", raising=False)
        monkeypatch.setenv("AGENT_EMAILS", "a@x.com, b@x.com")
        monkeypatch.setenv("AGENT_LOGINS", "claude[bot]")
        monkeypatch.setenv("EXCLUDED_APPROVERS", "")
        monkeypatch.setenv("EXEMPT_HEAD_BRANCHES", "dependabot/*")
        monkeypatch.setenv("PROTECTED_BASES", "main,release")
        config = aac.load_agent_config_from_env("o/r")
        assert config.agent_emails == ["a@x.com", "b@x.com"]
        assert config.excluded_approver_logins == []
        assert config.exempt_head_branches == ["dependabot/*"]
        assert config.protected_bases == {"o/r": {"exact": ["main", "release"], "prefixes": []}}

    def test_blank_entries_are_dropped(self, monkeypatch):
        monkeypatch.delenv("CONFIG_FILE", raising=False)
        monkeypatch.setenv("AGENT_EMAILS", " , a@x.com , ")
        for name in ("AGENT_LOGINS", "EXCLUDED_APPROVERS", "EXEMPT_HEAD_BRANCHES", "PROTECTED_BASES"):
            monkeypatch.setenv(name, "")
        config = aac.load_agent_config_from_env("o/r")
        assert config.agent_emails == ["a@x.com"]

    def test_unset_protected_bases_leaves_the_mapping_empty(self, monkeypatch):
        monkeypatch.delenv("CONFIG_FILE", raising=False)
        for name in ("AGENT_EMAILS", "AGENT_LOGINS", "EXCLUDED_APPROVERS", "EXEMPT_HEAD_BRANCHES", "PROTECTED_BASES", "EXEMPT_PATH_PREFIXES"):
            monkeypatch.setenv(name, "")
        config = aac.load_agent_config_from_env("o/r")
        assert config.protected_bases == {}
        assert config.exempt_path_prefixes == {}

    def test_config_file_takes_precedence_over_inline_inputs(self, tmp_path, monkeypatch):
        path = tmp_path / "agents.yaml"
        path.write_text("agent_emails:\n  - from-file@x.com\n")
        monkeypatch.setenv("CONFIG_FILE", str(path))
        monkeypatch.setenv("AGENT_EMAILS", "from-env@x.com")
        config = aac.load_agent_config_from_env("o/r")
        assert config.agent_emails == ["from-file@x.com"]


# --- Notification comment helpers ----------------------------------------


class TestNotificationHelpers:
    def test_finds_the_marked_notification_comment(self):
        comments = [comment("x", "unrelated"), comment("bot", f"{aac.COMMENT_MARKER}\nbody")]
        assert aac.find_notification_comment(comments) is comments[1]

    def test_returns_none_when_absent(self):
        assert aac.find_notification_comment([comment("x", "unrelated")]) is None

    def test_finds_stale_notification_for_the_current_commit(self):
        sha = "abcdef123456789"
        comments = [comment("bot", f"{aac.STALE_MARKER} for abcdef123456")]
        assert aac.find_stale_notification_for_commit(comments, sha) is comments[0]

    def test_stale_notifications_for_other_commits_are_reported_as_old(self):
        comments = [comment("bot", f"{aac.STALE_MARKER} for ffffffffffff")]
        assert aac.find_old_stale_notifications(comments, "abcdef123456789") == comments

    def test_comments_with_a_none_body_do_not_crash_the_scan(self):
        assert aac.find_notification_comment([{"body": None}]) is None
        assert aac.find_old_stale_notifications([{"body": None}], "a" * 40) == []
