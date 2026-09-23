# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_career_sources.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/sources.py, libs/career_passport/cli.py, tests/upgrade/test_career_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/career_passport/sources.py; VALIDATES libs/career_passport/cli.py; CONSUMES tests/upgrade/test_career_support.py
# Intent:      Exercise the complete local career compiler and ensure native/repository captures never invent personal achievements or live jobs.
# ───────────────────────────────────────────────────────────────

"""Exercise local source adapters and the 100/10/3 pipeline on explicit fixtures."""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from libs.career_passport.cli import compile_run, main, new_destination
from libs.career_passport.jobs import Discovery
from libs.career_passport.models import WorkBundle
from libs.career_passport.sources import capture_repository, capture_workspace
from libs.evolution.common import digest
from libs.semantic_twin.contracts import ContractError
from tests.upgrade.test_career_support import (
    BOARD,
    PERSON,
    WORKSPACE,
    at,
    jobs,
    lever_rows,
    work,
)


def workspace_export():
    return {
        "schema_version": "buildanddo.career-workspace/v1",
        "person": "cni://person/pocketbase/synthetic",
        "workspace": WORKSPACE,
        "snapshot": {
            "schema_version": "buildanddo.operator-snapshot/v1",
            "workspace": WORKSPACE,
            "observed_at": at(7).isoformat(),
            "sources": {
                "missions": {
                    "state": "available",
                    "page": 1,
                    "has_more": False,
                    "items": [
                        {
                            "id": "mission",
                            "title": "Synthetic reviewed work",
                            "workspace": WORKSPACE,
                            "status": "verified",
                            "owner": "someone-else",
                            "value": {
                                "state": "VERIFIED",
                                "independent": True,
                                "reviewer": "synthetic",
                                "reviewed_at": at(4).isoformat(),
                            },
                        }
                    ],
                }
            },
        },
    }


class SourceTests(unittest.TestCase):
    def test_native_review_is_a_candidate_not_personally_implemented_work(self):
        raw = json.dumps(workspace_export()).encode()
        captured = capture_workspace(
            raw, workspace=WORKSPACE, account_id="synthetic", at=at(10)
        )
        self.assertEqual(captured.contributions[0].participation.value, "VERIFIED")
        self.assertIsNone(captured.contributions[0].agent_assistance)
        self.assertFalse(captured.reviews)
        self.assertEqual(captured.artifacts[0].content, raw.decode())

    def test_native_owner_and_nonindependent_review_are_not_personal_claims(self):
        export = workspace_export()
        export["snapshot"]["sources"]["missions"]["items"][0]["value"][
            "independent"
        ] = False
        captured = capture_workspace(
            json.dumps(export).encode(),
            workspace=WORKSPACE,
            account_id="synthetic",
            at=at(10),
        )
        self.assertFalse(captured.contributions)

    def test_foreign_stale_and_incomplete_workspace_sources_are_explicit(self):
        for change in ("identity", "workspace", "future"):
            export = workspace_export()
            if change == "identity":
                export["person"] = str(PERSON)
            elif change == "workspace":
                export["snapshot"]["sources"]["missions"]["items"][0]["workspace"] = (
                    "foreign"
                )
            else:
                export["snapshot"]["observed_at"] = at(100).isoformat()
            with self.subTest(change=change), self.assertRaises(ContractError):
                capture_workspace(
                    json.dumps(export).encode(),
                    workspace=WORKSPACE,
                    account_id="synthetic",
                    at=at(10),
                )
        export = workspace_export()
        export["snapshot"]["sources"]["missions"]["has_more"] = True
        captured = capture_workspace(
            json.dumps(export).encode(),
            workspace=WORKSPACE,
            account_id="synthetic",
            at=at(10),
        )
        self.assertTrue(any("truncated" in gap for gap in captured.gaps))

    def test_repository_capture_uses_committed_sources_and_agent_attribution(self):
        head = "a" * 40
        path = ".bits/out/synthetic/report.md"

        def git(root, *args):
            if args[0] == "rev-parse":
                return head.encode()
            if "--format=%cI" in args:
                return at(1).isoformat().encode()
            if args[0] == "ls-tree":
                return (path + "\n").encode()
            return b"# Seat:        BITS-CODEGEN\nSynthetic reported source work."

        with (
            patch("libs.career_passport.sources._git", side_effect=git),
            patch("libs.career_passport.sources._history", return_value=()),
        ):
            captured = capture_repository(Path("."), workspace=WORKSPACE, at=at(10))
        self.assertEqual(
            captured.contributions[0].participation.value, "AGENT_EXECUTED"
        )
        self.assertFalse(captured.reviews)
        self.assertTrue(
            all(source.source_revision == head for source in captured.artifacts)
        )

    def test_repository_move_during_capture_is_rejected(self):
        calls = 0

        def git(root, *args):
            nonlocal calls
            if args[0] == "rev-parse":
                calls += 1
                return ("a" * 40 if calls == 1 else "b" * 40).encode()
            if "--format=%cI" in args:
                return at(1).isoformat().encode()
            return b""

        with (
            patch("libs.career_passport.sources._git", side_effect=git),
            patch("libs.career_passport.sources._history", return_value=()),
            self.assertRaises(ContractError),
        ):
            capture_repository(Path("."), workspace=WORKSPACE, at=at(10))

    def test_partial_checkout_preserves_commit_metadata_and_declares_missing_diffs(
        self,
    ):
        head = "a" * 40

        def git(root, *args):
            if args[0] == "rev-parse":
                return head.encode()
            if "--format=%cI" in args:
                return at(1).isoformat().encode()
            if "--name-status" in args:
                raise ContractError("unavailable ancestor tree")
            if args[0] == "log":
                return f"\x1e{head}\x1f\x1f{at(1).isoformat()}\x1fSynthetic history\n".encode()
            return b""

        with patch("libs.career_passport.sources._git", side_effect=git):
            captured = capture_repository(Path("."), workspace=WORKSPACE, at=at(10))
        history = json.loads(captured.artifacts[0].content)
        self.assertEqual(history["history_scope"], "repository_commit_metadata")
        self.assertEqual(history["observations"][0]["commit"], head)
        self.assertFalse(history["observations"][0]["changes"])
        self.assertTrue(any("diffs are unavailable" in gap for gap in captured.gaps))
        self.assertFalse(captured.contributions)


class CompilerTests(unittest.TestCase):
    def test_complete_100_10_3_fixture_stays_draft_and_never_claims_live_jobs(self):
        bundle, policy = work()
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            packet = compile_run(
                bundle,
                jobs(100),
                person=PERSON,
                workspace=WORKSPACE,
                at=at(10),
                policy=policy,
                output=output,
                display_name="Synthetic Candidate",
            )
            self.assertEqual(packet["job_count"], 100)
            self.assertEqual(len(packet["dossiers"]), 10)
            self.assertEqual(len(packet["packages"]), 3)
            self.assertEqual(packet["live_jobs_verified"], 0)
            self.assertEqual(packet["state"], "DRAFTS_REQUIRE_REVIEW")
            self.assertEqual(packet["outcomes"]["counts"]["submitted"], 0)
            core = {
                key: value
                for key, value in packet.items()
                if key not in ("content_sha256", "canonical_content")
            }
            self.assertEqual(digest(core), packet["content_sha256"])
            self.assertEqual(json.loads(packet["canonical_content"]), core)
            self.assertEqual(
                len(list(output.glob("application-*/resume_variant.pdf"))), 3
            )

    def test_missing_jobs_and_personal_review_hold_without_fabricating_drafts(self):
        bundle, _ = work()
        with tempfile.TemporaryDirectory() as temp:
            packet = compile_run(
                bundle,
                (),
                person=PERSON,
                workspace=WORKSPACE,
                at=at(10),
                policy=None,
                output=Path(temp),
            )
            self.assertEqual(packet["state"], "HOLD")
            self.assertFalse(packet["packages"])

    def test_cli_roundtrip_consumes_original_captures_and_separate_review_pins(self):
        bundle, policy = work()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "work.json").write_text(bundle.to_json())
            (root / "policy.json").write_text(policy.to_json())
            (root / "jobs.json").write_text(
                json.dumps(
                    {
                        "schema_version": "buildanddo.job-captures/v1",
                        "gaps": [],
                        "captures": [
                            {
                                "board": BOARD.to_dict(),
                                "captured_at": at(6).isoformat(),
                                "body": json.dumps(lever_rows(100)),
                            }
                        ],
                    }
                )
            )
            with contextlib.redirect_stdout(io.StringIO()):
                status = main(
                    [
                        "compile",
                        "--work",
                        str(root / "work.json"),
                        "--jobs",
                        str(root / "jobs.json"),
                        "--review-policy",
                        str(root / "policy.json"),
                        "--person",
                        str(PERSON),
                        "--workspace",
                        WORKSPACE,
                        "--at",
                        at(10).isoformat(),
                        "--output",
                        str(root / "output"),
                    ]
                )
            self.assertEqual(status, 0)
            review = json.loads((root / "output/review.json").read_text())
            self.assertEqual(len(review["packages"]), 3)

    def test_cli_discovery_retains_transport_captures(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "boards.json").write_text(json.dumps([BOARD.to_dict()]))
            found = Discovery(
                jobs(),
                ((BOARD.endpoint(), json.dumps(lever_rows()).encode()),),
                ("Synthetic partial feed",),
                100,
            )
            with (
                patch("libs.career_passport.cli.discover", return_value=found),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                status = main(
                    [
                        "discover",
                        "--boards",
                        str(root / "boards.json"),
                        "--at",
                        at(6).isoformat(),
                        "--output",
                        str(root / "capture"),
                    ]
                )
            self.assertEqual(status, 0)
            captured = json.loads((root / "capture/jobs.json").read_text())
            self.assertEqual(json.loads(captured["captures"][0]["body"]), lever_rows())
            self.assertEqual(
                json.loads((root / "capture/summary.json").read_text())["state"],
                "PARTIAL",
            )

    def test_cli_missing_or_forged_input_is_a_typed_failure(self):
        with (
            tempfile.TemporaryDirectory() as temp,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            result = main(
                [
                    "compile",
                    "--work",
                    str(Path(temp) / "missing.json"),
                    "--person",
                    str(PERSON),
                    "--workspace",
                    WORKSPACE,
                    "--output",
                    str(Path(temp) / "out"),
                ]
            )
        self.assertEqual(result, 2)

    def test_private_outputs_do_not_replace_or_enter_tracked_source(self):
        with tempfile.TemporaryDirectory() as temp:
            output = new_destination(str(Path(temp) / "private"))
            self.assertTrue(output.is_dir())
            with self.assertRaises(ContractError):
                new_destination(str(output))
        with self.assertRaises(ContractError):
            new_destination(
                str(Path(__file__).resolve().parents[2] / "docs" / "private-career")
            )

    def test_work_roundtrip_cannot_import_a_passport_instead_of_evidence(self):
        with self.assertRaises(ContractError):
            WorkBundle.from_dict(
                {"verified_personal_claims": 1, "authority_granted": True}
            )
