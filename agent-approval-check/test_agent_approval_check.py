# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx",
#   "pyyaml",
#   "tenacity",
# ]
# ///
"""Unit tests for approval counting (#1700)."""

from __future__ import annotations

import unittest

from agent_approval_check import AgentConfig, count_approvers, iter_approve_commands


def _config() -> AgentConfig:
    return AgentConfig(
        agent_emails=[],
        agent_app_logins=["claude[bot]"],
        excluded_approver_logins=[],
        exempt_head_branches=[],
    )


def _review(login: str, association: str, state: str = "APPROVED") -> dict:
    return {
        "user": {"login": login},
        "author_association": association,
        "state": state,
        "submitted_at": "2026-08-19T00:00:00Z",
    }


def _approve_comment(login: str, association: str, sha: str) -> dict:
    return {
        "user": {"login": login},
        "author_association": association,
        "body": f"/approve {sha}",
        "id": 1,
        "node_id": "IC_1",
    }


HEAD = "abcdef1234567890"


class CountApproversAssociationTests(unittest.TestCase):
    def test_none_association_with_write_permission_is_counted(self) -> None:
        approvers = count_approvers(
            HEAD,
            [_review("alice", "NONE")],
            [],
            _config(),
            lambda login: login == "alice",
        )
        self.assertEqual(approvers, {"alice"})

    def test_member_association_without_write_permission_is_not_counted(self) -> None:
        approvers = count_approvers(
            HEAD,
            [_review("bob", "MEMBER")],
            [],
            _config(),
            lambda login: False,
        )
        self.assertEqual(approvers, set())

    def test_approve_comment_none_association_with_write_permission_is_counted(
        self,
    ) -> None:
        approvers = count_approvers(
            HEAD,
            [],
            [_approve_comment("carol", "NONE", HEAD)],
            _config(),
            lambda login: login == "carol",
        )
        self.assertEqual(approvers, {"carol"})

    def test_approve_comment_without_write_permission_is_not_counted(self) -> None:
        commands = list(
            iter_approve_commands(
                [_approve_comment("dave", "COLLABORATOR", HEAD)],
                _config(),
                lambda login: False,
            )
        )
        self.assertEqual(commands, [])


if __name__ == "__main__":
    unittest.main()
