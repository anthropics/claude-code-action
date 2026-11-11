"""Tests for agent_approval_check.py. GitHub is stubbed: nothing here uses the network.

Run from the repository root, with Python 3.11 or newer:

    pip install httpx pyyaml tenacity
    python agent-approval-check/test_agent_approval_check.py
"""

import json
import logging
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

import httpx
import yaml

for name in (
    "CONFIG_FILE",
    "EXCLUDED_APPROVERS",
    "EXEMPT_HEAD_BRANCHES",
    "EXEMPT_PATH_PREFIXES",
    "PROTECTED_BASES",
    "REQUIRED_APPROVALS",
    "STATUS_CONTEXT_PER_BASE",
):
    os.environ.pop(name, None)

sys.dont_write_bytecode = True
import agent_approval_check as aac  # noqa: E402

logging.disable(logging.CRITICAL)

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "o/r"
# Two heads that share their first 12 hex characters.
SHA_A = "abcdef012345" + "a" * 28
SHA_B = "abcdef012345" + "b" * 28
HUMAN = "dev@example.com"
ANTHROPIC = "noreply@anthropic.com"
ACTION_BOT = "41898282+claude[bot]@users.noreply.github.com"
WEB_FLOW = "noreply@github.com"


def config(**overrides) -> aac.AgentConfig:
    values = dict(
        agent_emails=[ANTHROPIC],
        agent_app_logins=["claude[bot]", "claude-code[bot]"],
        excluded_approver_logins=[],
        exempt_head_branches=[],
    )
    values.update(overrides)
    return aac.AgentConfig(**values)


def commit(sha=SHA_A, committer=HUMAN, author=HUMAN) -> dict:
    return {
        "commit": {
            "oid": sha,
            "committer": {"email": committer},
            "author": {"email": author},
            "signature": None,
        }
    }


def review(login, state, at, association="MEMBER", typename="User") -> dict:
    return {
        "author": {"__typename": typename, "login": login},
        "authorAssociation": association,
        "state": state,
        "commit": {"oid": SHA_A},
        "submittedAt": at,
    }


def agent_review(at) -> dict:
    return review("claude", "APPROVED", at, association="NONE", typename="Bot")


def comment(login, body, node=1) -> dict:
    return {
        "id": f"node{node}",
        "databaseId": node,
        "author": {"__typename": "User", "login": login},
        "authorAssociation": "MEMBER",
        "body": body,
        "isMinimized": False,
    }


def changed(path, change_type="MODIFIED") -> dict:
    return {"path": path, "changeType": change_type}


def pull_request(
    head=SHA_A,
    commits=None,
    reviews=(),
    comments=(),
    files=(changed("src/a.py"),),
    base="main",
    author="alice",
    siblings=(),
    reviews_page_info=None,
    commits_truncated=False,
) -> dict:
    return {
        "id": "PR_node",
        "number": 1,
        "headRefOid": head,
        "headRefName": "feature",
        "baseRefName": base,
        "createdAt": "2026-01-01T00:00:00Z",
        "author": {
            "__typename": "Bot" if author == "claude" else "User",
            "login": author,
        },
        "commits": {
            "nodes": commits if commits is not None else [commit(head)],
            "pageInfo": {"hasPreviousPage": commits_truncated},
        },
        "reviews": {
            "nodes": list(reviews),
            "pageInfo": reviews_page_info or {"hasPreviousPage": False},
        },
        "comments": {
            "nodes": list(comments),
            "pageInfo": {"hasPreviousPage": False, "startCursor": None},
        },
        "files": {"nodes": list(files), "pageInfo": {"hasNextPage": False}},
        "headCommit": {
            "nodes": [
                {
                    "commit": {
                        "oid": head,
                        "associatedPullRequests": {
                            "nodes": [
                                {
                                    "state": state,
                                    "number": number,
                                    "baseRefName": sibling_base,
                                    "headRefOid": head,
                                }
                                for number, sibling_base, state in siblings
                            ],
                            "pageInfo": {"hasNextPage": False},
                        },
                    }
                }
            ]
        },
    }


class StubClient(aac.GitHubClient):
    """Serves canned GraphQL and REST answers and records what was posted."""

    def __init__(self, pr, review_pages=None, rest_files=None):
        super().__init__("token", REPO)
        self.pr = pr
        # Older review pages by the cursor that asks for them; a page may be
        # an exception to raise.
        self.review_pages = review_pages or {}
        self.rest_files = rest_files
        self.rest_calls = []
        self.statuses = []
        self.batches = []

    def _graphql(self, query, variables=None):
        if query == aac.GRAPHQL_REVIEWS_PAGE_QUERY:
            page = self.review_pages[variables["before"]]
            if isinstance(page, Exception):
                raise page
            return {"repository": {"pullRequest": {"reviews": page}}}
        return {
            "repository": {
                "defaultBranchRef": {"name": "main"},
                "pullRequest": self.pr,
            }
        }

    def _rest_request(self, method, path, context="rest", **kwargs):
        self.rest_calls.append((method, path, kwargs))
        if isinstance(self.rest_files, Exception):
            raise self.rest_files
        return httpx.Response(200, json=self.rest_files or [])

    def has_write_permission(self, login):
        return True

    def execute_mutation_batch(self, batch):
        self.batches.append(batch)

    def create_commit_status(self, sha, state, context, description, target_url=None):
        self.statuses.append(
            {"sha": sha, "state": state, "context": context, "description": description}
        )


def evaluate(pr, cfg=None, **client_args) -> StubClient:
    client = StubClient(pr, **client_args)
    aac.process_pr(client, 1, cfg or config())
    return client


class StatusCase(unittest.TestCase):
    def assert_status(self, client, state, text=""):
        self.assertEqual(len(client.statuses), 1, client.statuses)
        status = client.statuses[0]
        self.assertEqual(status["state"], state, status)
        self.assertIn(text, status["description"])


TWO_APPROVALS = [
    review("bob", "APPROVED", "2026-01-01T00:00:00Z"),
    review("carol", "APPROVED", "2026-01-01T00:00:00Z"),
]


class DismissedReviews(StatusCase):
    def test_dismissal_supersedes_earlier_approval(self):
        latest = aac.get_latest_review_per_user(
            [
                {"user": {"login": "b"}, "state": "APPROVED", "submitted_at": "1"},
                {"user": {"login": "b"}, "state": "DISMISSED", "submitted_at": "2"},
            ]
        )
        self.assertEqual(latest["b"]["state"], "DISMISSED")

    def test_approved_then_dismissed_counts_nothing(self):
        client = evaluate(
            pull_request(
                commits=[commit(committer=ANTHROPIC)],
                reviews=[
                    review("bob", "APPROVED", "2026-01-01T00:00:00Z"),
                    review("bob", "DISMISSED", "2026-01-02T00:00:00Z"),
                ],
                comments=[comment("alice", f"/approve {SHA_A}")],
            )
        )
        self.assert_status(client, "pending", "have 1")

    def test_approval_after_dismissal_counts(self):
        client = evaluate(
            pull_request(
                commits=[commit(committer=ANTHROPIC)],
                reviews=[
                    review("bob", "DISMISSED", "2026-01-01T00:00:00Z"),
                    review("bob", "APPROVED", "2026-01-02T00:00:00Z"),
                ],
                comments=[comment("alice", f"/approve {SHA_A}")],
            )
        )
        self.assert_status(client, "success", "2/2")

    def test_equal_timestamps_keep_the_later_review(self):
        latest = aac.get_latest_review_per_user(
            [
                {"user": {"login": "b"}, "state": "APPROVED", "submitted_at": "1"},
                {"user": {"login": "b"}, "state": "DISMISSED", "submitted_at": "1"},
            ]
        )
        self.assertEqual(latest["b"]["state"], "DISMISSED")

    def test_comment_review_does_not_cancel_approval(self):
        latest = aac.get_latest_review_per_user(
            [
                {"user": {"login": "b"}, "state": "APPROVED", "submitted_at": "1"},
                {"user": {"login": "b"}, "state": "COMMENTED", "submitted_at": "2"},
            ]
        )
        self.assertEqual(latest["b"]["state"], "APPROVED")


class ReviewPagination(StatusCase):
    FIRST_PAGE = [
        review("u", "COMMENTED", "2026-02-01T00:00:00Z", association="NONE")
    ] * 100
    TRUNCATED = {"hasPreviousPage": True, "startCursor": "c1"}

    def test_agent_approval_on_an_older_page_is_found(self):
        client = evaluate(
            pull_request(reviews=self.FIRST_PAGE, reviews_page_info=self.TRUNCATED),
            review_pages={
                "c1": {
                    "nodes": [agent_review("2026-01-01T00:00:00Z")],
                    "pageInfo": {"hasPreviousPage": False, "startCursor": "c0"},
                }
            },
        )
        self.assert_status(client, "pending", "Need 2 approvals (have 0)")

    def test_pages_are_walked_to_the_start_in_order(self):
        client = StubClient(
            pull_request(
                reviews=[review("bob", "DISMISSED", "2026-01-03T00:00:00Z")],
                reviews_page_info=self.TRUNCATED,
            ),
            review_pages={
                "c1": {
                    "nodes": [review("bob", "APPROVED", "2026-01-02T00:00:00Z")],
                    "pageInfo": {"hasPreviousPage": True, "startCursor": "c0"},
                },
                "c0": {
                    "nodes": [review("carol", "APPROVED", "2026-01-01T00:00:00Z")],
                    "pageInfo": {"hasPreviousPage": False, "startCursor": None},
                },
            },
        )
        data = client.fetch_pr_data(1)
        self.assertFalse(data.reviews_incomplete)
        self.assertEqual(
            [r["user"]["login"] for r in data.reviews], ["carol", "bob", "bob"]
        )

    def test_human_pr_with_complete_older_pages_still_passes(self):
        client = evaluate(
            pull_request(reviews=self.FIRST_PAGE, reviews_page_info=self.TRUNCATED),
            review_pages={
                "c1": {
                    "nodes": [],
                    "pageInfo": {"hasPreviousPage": False, "startCursor": None},
                }
            },
        )
        self.assert_status(client, "success", "No agent activity")

    def test_unreadable_page_is_pending_not_no_agent_activity(self):
        for failure in (
            RuntimeError("GraphQL errors"),
            httpx.ConnectError("down"),
            {"nodes": None, "pageInfo": {}},
        ):
            with self.subTest(failure=failure):
                client = evaluate(
                    pull_request(
                        reviews=self.FIRST_PAGE, reviews_page_info=self.TRUNCATED
                    ),
                    review_pages={"c1": failure},
                )
                self.assert_status(client, "pending", "Cannot read all reviews")

    def test_missing_cursor_is_pending(self):
        client = evaluate(
            pull_request(
                reviews=self.FIRST_PAGE,
                reviews_page_info={"hasPreviousPage": True, "startCursor": None},
            )
        )
        self.assert_status(client, "pending", "Cannot read all reviews")

    def test_enough_visible_approvals_still_hold_while_incomplete(self):
        client = evaluate(
            pull_request(
                reviews=TWO_APPROVALS,
                reviews_page_info={"hasPreviousPage": True, "startCursor": None},
            )
        )
        self.assert_status(client, "pending", "Cannot read all reviews")
        created = client.batches[0].create_comment[1]
        self.assertIn("Needs Approval", created)
        self.assertNotIn("Approved (", created)

    def test_truncated_commits_still_require_approval(self):
        client = evaluate(pull_request(commits_truncated=True))
        self.assert_status(client, "pending", "Need 2 approvals")


class AgentCommitDetection(StatusCase):
    def test_agent_identity_in_either_field(self):
        cases = [
            ("action bot committer", ACTION_BOT, HUMAN),
            ("action bot author, GitHub committer", WEB_FLOW, ACTION_BOT),
            ("configured email as author", HUMAN, ANTHROPIC),
            ("configured email as committer", ANTHROPIC, HUMAN),
            ("mixed case", "41898282+Claude[Bot]@Users.Noreply.GitHub.com", HUMAN),
            ("noreply without id", "claude-code[bot]@users.noreply.github.com", HUMAN),
            ("enterprise host", "1+claude[bot]@users.noreply.ghe.example.com", HUMAN),
        ]
        for label, committer, author in cases:
            with self.subTest(label):
                client = evaluate(
                    pull_request(commits=[commit(committer=committer, author=author)])
                )
                self.assert_status(client, "pending", "Need 2 approvals")

    def test_human_identities_are_not_agents(self):
        for email in (
            HUMAN,
            WEB_FLOW,
            "123+alice@users.noreply.github.com",
            "alice@users.noreply.github.com",
            "claude[bot]@example.com",
        ):
            with self.subTest(email):
                client = evaluate(
                    pull_request(commits=[commit(committer=email, author=email)])
                )
                self.assert_status(client, "success", "No agent activity")

    def test_null_identities_do_not_crash(self):
        node = commit()
        node["commit"]["committer"] = None
        node["commit"]["author"] = {"email": None}
        client = evaluate(pull_request(commits=[node]))
        self.assert_status(client, "success", "No agent activity")

    def test_detection_reason_names_the_matching_email(self):
        client = evaluate(pull_request(commits=[commit(author=ACTION_BOT)]))
        self.assertIn(ACTION_BOT, client.batches[0].create_comment[1])

    def test_query_asks_for_the_author(self):
        self.assertIn("author {\n              email", aac.GRAPHQL_PR_QUERY)


class ApproveCommand(StatusCase):
    def test_only_a_full_sha_parses(self):
        self.assertEqual(aac.parse_approve_command(f"/approve {SHA_A}"), SHA_A)
        self.assertEqual(aac.parse_approve_command(f"/APPROVE {SHA_A.upper()}"), SHA_A)
        for short in (SHA_A[:12], SHA_A[:39]):
            self.assertIsNone(aac.parse_approve_command(f"/approve {short}"))
        self.assertIsNone(aac.parse_approve_command(f"/approve {SHA_A}0"))

    def test_email_reply_with_full_sha_still_parses(self):
        body = f"/approve {SHA_A}\r\n\r\nOn Monday someone wrote:\r\n> text"
        self.assertEqual(aac.parse_approve_command(body), SHA_A)

    def test_shared_prefix_does_not_approve_another_head(self):
        for approved in (SHA_A[:12], SHA_A):
            with self.subTest(approved=approved):
                client = evaluate(
                    pull_request(
                        head=SHA_B,
                        commits=[commit(SHA_A), commit(SHA_B, committer=ANTHROPIC)],
                        comments=[
                            comment("alice", f"/approve {approved}", 1),
                            comment("bob", f"/approve {approved}", 2),
                        ],
                    )
                )
                self.assert_status(client, "pending", "have 0")

    def test_full_head_sha_counts(self):
        client = evaluate(
            pull_request(
                commits=[commit(committer=ANTHROPIC)],
                comments=[
                    comment("alice", f"/approve {SHA_A}", 1),
                    comment("bob", f"/approve {SHA_A}", 2),
                ],
            )
        )
        self.assert_status(client, "success", "2/2")

    def test_full_sha_for_an_older_commit_is_flagged_stale(self):
        stale = aac.find_stale_approvals(
            [
                {
                    "id": 1,
                    "node_id": "n",
                    "user": {"login": "bob"},
                    "author_association": "MEMBER",
                    "body": f"/approve {SHA_A}",
                }
            ],
            SHA_B,
            config(),
            [{"sha": SHA_A}, {"sha": SHA_B}],
            lambda login: True,
        )
        self.assertEqual(stale, [{"user": "bob", "sha": SHA_A}])

    def test_bot_instructions_give_the_full_sha(self):
        body = aac.generate_notification_comment(set(), [], "reason", SHA_A)
        self.assertIn(f"/approve {SHA_A}\n", body)
        stale = aac.generate_stale_notification([{"user": "b", "sha": SHA_B}], SHA_A)
        self.assertIn(f"/approve {SHA_A}\n", stale)


class ExemptPaths(StatusCase):
    CONFIG = config(exempt_path_prefixes={REPO: ["docs/"]})
    AGENT = [commit(committer=ANTHROPIC)]

    def run_files(self, files, rest_files=None):
        return evaluate(
            pull_request(commits=self.AGENT, files=files),
            self.CONFIG,
            rest_files=rest_files,
        )

    def test_rename_into_exempt_prefix_is_not_exempt(self):
        client = self.run_files(
            [changed("docs/p.py", "RENAMED")],
            [{"filename": "docs/p.py", "previous_filename": "src/p.py"}],
        )
        self.assert_status(client, "pending", "Need 2 approvals")

    def test_copy_into_exempt_prefix_is_not_exempt(self):
        client = self.run_files(
            [changed("docs/p.py", "COPIED")],
            [{"filename": "docs/p.py", "previous_filename": "src/p.py"}],
        )
        self.assert_status(client, "pending", "Need 2 approvals")

    def test_rename_inside_exempt_prefix_stays_exempt(self):
        client = self.run_files(
            [changed("docs/new.md", "RENAMED")],
            [{"filename": "docs/new.md", "previous_filename": "docs/old.md"}],
        )
        self.assert_status(client, "success", "Review-exempt PR")

    def test_rename_source_is_looked_up_with_one_rest_call(self):
        client = self.run_files(
            [changed("docs/new.md", "RENAMED")],
            [{"filename": "docs/new.md", "previous_filename": "docs/old.md"}],
        )
        self.assertEqual(len(client.rest_calls), 1)
        self.assertEqual(client.rest_calls[0][1], "/repos/o/r/pulls/1/files")

    def test_unknown_rename_source_is_not_exempt(self):
        for label, rest_files in (
            ("not listed", []),
            ("no previous_filename", [{"filename": "docs/new.md"}]),
            ("lookup failed", httpx.ConnectError("down")),
        ):
            with self.subTest(label):
                client = self.run_files([changed("docs/new.md", "RENAMED")], rest_files)
                self.assert_status(client, "pending", "Need 2 approvals")

    def test_unknown_change_type_is_not_exempt(self):
        for node in ({"path": "docs/a.md"}, changed("docs/a.md", "SOMETHING_NEW")):
            with self.subTest(node=node):
                client = self.run_files([node], [{"filename": "docs/a.md"}])
                self.assert_status(client, "pending", "Need 2 approvals")

    def test_plain_changes_stay_exempt_without_a_rest_call(self):
        client = self.run_files(
            [
                changed("docs/a.md", "ADDED"),
                changed("docs/b.md", "MODIFIED"),
                changed("docs/c.md", "DELETED"),
                changed("docs/d.md", "CHANGED"),
            ]
        )
        self.assert_status(client, "success", "Review-exempt PR")
        self.assertEqual(client.rest_calls, [])

    def test_mixed_paths_are_not_exempt_and_skip_the_lookup(self):
        client = self.run_files(
            [changed("docs/a.md", "RENAMED"), changed("src/b.py")],
        )
        self.assert_status(client, "pending", "Need 2 approvals")
        self.assertEqual(client.rest_calls, [])

    def test_real_query_asks_for_change_type(self):
        self.assertIn("changeType", aac.GRAPHQL_PR_QUERY)

    def test_rest_lookup_reads_github_pull_files(self):
        def answer(status, body):
            request = httpx.Request("GET", "https://api.github.com/x")
            return httpx.Response(status, json=body, request=request)

        client = aac.GitHubClient("token", REPO)
        rows = [{"filename": "docs/p.py", "previous_filename": "src/p.py"}]
        with mock.patch("httpx.request", return_value=answer(200, rows)) as request:
            self.assertEqual(client.fetch_previous_paths(1), {"docs/p.py": "src/p.py"})
        self.assertEqual(request.call_args.kwargs["params"], {"per_page": 100})
        data = aac.PRData(
            node_id="n",
            number=1,
            head_sha=SHA_A,
            head_ref="f",
            base_ref="main",
            default_branch="main",
            created_at="",
            author_login="alice",
            commits=[],
            reviews=[],
            comments=[],
            files=["docs/p.py"],
            commits_incomplete=False,
            files_incomplete=False,
            moved_files=["docs/p.py"],
        )
        with mock.patch("httpx.request", return_value=answer(404, {})):
            self.assertFalse(
                aac.is_review_exempt_pr(
                    data, self.CONFIG, REPO, client.fetch_previous_paths
                )
            )


class ReviewReevaluation(StatusCase):
    def event_file(self, payload) -> str:
        handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        self.addCleanup(os.unlink, handle.name)
        with handle:
            json.dump(payload, handle)
        return handle.name

    def test_agent_review_after_a_green_run_turns_pending(self):
        first = evaluate(pull_request())
        self.assert_status(first, "success", "No agent activity")
        second = evaluate(pull_request(reviews=[agent_review("2026-01-02T00:00:00Z")]))
        self.assert_status(second, "pending", "Need 2 approvals")
        self.assertEqual(first.statuses[0]["sha"], second.statuses[0]["sha"])

    def test_review_events_resolve_to_the_pr(self):
        path = self.event_file({"pull_request": {"number": 7}})
        self.assertEqual(aac.resolve_pr_number("pull_request_review", path), 7)

    def test_workflow_run_resolves_to_the_pr(self):
        path = self.event_file({"workflow_run": {"pull_requests": [{"number": 7}]}})
        self.assertEqual(aac.resolve_pr_number("workflow_run", path), 7)

    def test_workflow_run_from_a_fork_has_no_pr(self):
        path = self.event_file({"workflow_run": {"pull_requests": []}})
        self.assertIsNone(aac.resolve_pr_number("workflow_run", path))

    def test_workflow_run_candidates_prefer_a_protected_base(self):
        # The shape of toJSON(github.event.workflow_run.pull_requests).
        candidates = json.dumps(
            [
                {"number": 1, "base": {"ref": "dev"}},
                {"number": 2, "base": {"ref": "main"}},
            ]
        )
        cfg = config(protected_bases={REPO: {"exact": ["main"]}})
        self.assertEqual(aac.select_pr_candidate(1, candidates, cfg, REPO), 2)

    def test_example_workflows_are_connected(self):
        check = yaml.safe_load((ROOT / "examples/agent-approval-check.yml").read_text())
        signal = yaml.safe_load(
            (ROOT / "examples/agent-approval-check-review-signal.yml").read_text()
        )
        # YAML reads the bare key `on` as True.
        check_on, signal_on = check[True], signal[True]
        self.assertEqual(check_on["workflow_run"]["workflows"], [signal["name"]])
        self.assertEqual(check_on["workflow_run"]["types"], ["completed"])
        self.assertNotIn("pull_request_review", check_on)
        self.assertEqual(
            signal_on["pull_request_review"]["types"], ["submitted", "dismissed"]
        )
        self.assertEqual(signal["permissions"], {})


class StatusScope(StatusCase):
    def test_context_is_unchanged_by_default(self):
        client = evaluate(pull_request())
        self.assertEqual(client.statuses[0]["context"], "agent-approval-check")

    def test_context_can_be_bound_to_the_base(self):
        with mock.patch.object(aac, "STATUS_CONTEXT_PER_BASE", True):
            cfg = config(protected_bases={REPO: {"exact": ["release"]}})
            client = evaluate(pull_request(base="release"), cfg)
        self.assertEqual(client.statuses[0]["context"], "agent-approval-check/release")

    def test_new_pr_on_an_approved_commit_gets_its_own_verdict(self):
        cfg = config(protected_bases={REPO: {"exact": ["main", "release"]}})
        agent = [commit(committer=ANTHROPIC)]
        approved = evaluate(pull_request(commits=agent, reviews=TWO_APPROVALS), cfg)
        self.assert_status(approved, "success", "2/2")
        later = evaluate(pull_request(commits=agent, base="release"), cfg)
        self.assert_status(later, "pending", "Need 2 approvals")

    def test_unprotected_base_posts_nothing(self):
        client = evaluate(pull_request(base="dev"))
        self.assertEqual(client.statuses, [])

    def test_open_protected_sibling_holds_success(self):
        cfg = config(protected_bases={REPO: {"exact": ["main", "release"]}})
        client = evaluate(pull_request(siblings=[(2, "release", "OPEN")]), cfg)
        self.assert_status(client, "pending", "Sibling")


if __name__ == "__main__":
    unittest.main()
