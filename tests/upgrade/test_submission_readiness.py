# ─── CGRF Header ───────────────────────────────────────────────
# File:         tests/upgrade/test_submission_readiness.py
# Stage:        08_TEST
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-20
# Depends:      scripts/ci/submission_readiness.py, tests/upgrade/test_hostinger_replay.py
# EnumType:     Service
# EnumEdges:    DEPENDS_ON scripts/ci/submission_readiness.py; DEPENDS_ON tests/upgrade/test_hostinger_replay.py
# DAG Node:     none
# Intent:       Reject unsupported submission claims, missing checkpoints, stale captures and invented official acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise submission gates with synthetic exports and explicit acceptance doubles."""

from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
from datetime import timedelta
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.ci import submission_readiness as submission, hostinger_replay as replay
from scripts.ci.hostinger_readiness import ReadinessError
from tests.upgrade.test_hostinger_readiness import ROOT, write_json
from tests.upgrade.test_hostinger_replay import (
    ReplayFixture,
    NOW,
    SHA,
    SOURCE,
    WORKSPACE,
    MISSION,
    DISPATCH,
)


class SubmissionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="submission-gate-fixture-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.policy = json.loads((ROOT / submission.POLICY).read_text())
        write_json(self.root / submission.POLICY, self.policy)
        for name in (
            "AGENTS.md",
            ".bits/context.md",
            ".github/workflows/pr-governance.yml",
        ):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                "    run: python scripts/ci/submission_readiness.py --check\n"
            )
        self.contract = json.loads(
            (ROOT / ".bits/hostinger-readiness.json").read_text()
        )
        for module in (submission, replay):
            handle = patch.object(
                module, "check_review", return_value=(self.contract, SOURCE)
            )
            handle.start()
            self.addCleanup(handle.stop)
        self.states = {
            check: "PASS"
            for piece in self.contract["pieces"]
            for check in piece["checks"]
        }
        for name in list(self.states):
            if name.startswith("native_"):
                self.states[name + ":package"] = "PASS"
                self.states[name + ":compose"] = "PASS"
        handle = patch.object(
            replay, "acceptance_state", side_effect=lambda *_args: self.states
        )
        handle.start()
        self.addCleanup(handle.stop)
        self.capture = ReplayFixture(self.root, synthetic=False)
        reported = {
            "status": "succeeded",
            "observed_at": self.capture.time(3, 40),
            "receipt_ref": "synthetic-provider/receipt",
            "output": {
                "effect_key": "e" * 64,
                "execution_id": "synthetic-execution",
                "summary": "Synthetic retained result",
            },
        }
        output = json.dumps(
            reported, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
        (self.root / "result.txt").write_bytes(output)
        checksum = hashlib.sha256(output).hexdigest()
        self.capture.capture["action_output"] = self.capture.ref(
            "result.txt", self.capture.time(4)
        )
        self.capture.change("action", result_sha256=checksum)
        self.capture.change("verification", result_sha256=checksum)
        self.capture.change("evidence", content=checksum)
        self.native = {
            "schema_version": "buildanddo.business-replay/v1",
            "workspace": WORKSPACE,
            "captured_at": NOW.isoformat(),
            "page": 1,
            "has_more": False,
            "evidence_state": "recorded",
            "independent_verification": "not_established_by_export",
            "jobs": [
                {
                    "id": "fixture-job",
                    "workspace": WORKSPACE,
                    "mission": MISSION,
                    "provider": "n8n",
                    "status": "succeeded",
                    "worker": "producer",
                    "evidence": "fixtureevidence",
                    "input": {"max_seconds": 60},
                    "result": {
                        "reported": reported,
                        "records": {"evidence": "fixtureevidence"},
                    },
                    "result_sha256": checksum,
                    "started_at": self.capture.time(3, 5),
                    "finished_at": self.capture.time(3, 50),
                    "release_context": {
                        key: self.capture.capture[key]
                        for key in (
                            "candidate_sha",
                            "source_sha256",
                            "artifact_tree_sha256",
                            "dispatch",
                            "environment",
                        )
                    },
                }
            ],
        }
        # All bytes below are unit-test fixtures. No external identity, deployed
        # action, contest eligibility or accepted entry is asserted by this test.
        for name in submission.MATERIALS:
            (self.root / (name + ".txt")).write_text(
                "Synthetic evaluator material: " + name
            )
        self.document = {
            "schema_version": "buildanddo.submission/v1",
            "authority": "internal-preparation-only",
            "candidate_sha": SHA,
            "source_sha256": SOURCE,
            "prepared_at": NOW.isoformat(),
            "workspace": WORKSPACE,
            "mission": MISSION,
            "dispatch": DISPATCH,
            "demo_url": "https://demo.example.org",
            "replay": None,
            "owner_review": None,
            "official_review": None,
            "execution_receipts": None,
            "materials": {
                name: self.ref(name + ".txt") for name in submission.MATERIALS
            },
        }
        self.path = self.root / "submission.json"

    def ref(self, name: str) -> dict[str, str]:
        return self.capture.ref(name, NOW.isoformat())

    def audit(self) -> dict[str, object]:
        write_json(self.path, self.document)
        return submission.audit(
            self.root, self.path, self.root, SHA, "owner-reviewer", NOW
        )

    def reviewed(self) -> None:
        write_json(self.root / "native-execution.json", self.native)
        self.document["execution_receipts"] = self.ref("native-execution.json")
        review = {
            "schema_version": "buildanddo.hostinger-owner-review/v1",
            "reviewer": "owner-reviewer",
            "reviewed_at": NOW.isoformat(),
            "capture_sha256": self.capture.validate()["capture_sha256"],
            "decisions": [
                {
                    "id": piece["id"],
                    "evidence": [self.ref("capture.json")],
                    "runtime_requirements": piece["runtime_requirements"],
                }
                for piece in self.contract["pieces"]
            ],
        }
        write_json(self.root / "owner.json", review)
        self.document.update(
            replay=self.ref("capture.json"), owner_review=self.ref("owner.json")
        )

    def official(self) -> None:
        (self.root / "rules-source.txt").write_text(
            "Explicitly synthetic external rules copy used only in a unit test."
        )
        official = {
            "schema_version": "buildanddo.official-rules-review/v1",
            "reviewer": "owner-reviewer",
            "candidate_sha": SHA,
            "source_url": "https://rules.example.org/entry",
            "source_copy": self.ref("rules-source.txt"),
            "reviewed_at": NOW.isoformat(),
            "deadline": (NOW + timedelta(days=1)).isoformat(),
            "requirements": {
                key: True
                for key in (
                    "eligibility",
                    "hosting",
                    "rights",
                    "materials",
                    "submission_method",
                )
            },
        }
        write_json(self.root / "official.json", official)
        self.document["official_review"] = self.ref("official.json")

    def test_provisional_policy_never_invents_official_eligibility_or_deadline(
        self,
    ) -> None:
        self.assertEqual(len(submission.load_policy(self.root)["milestones"]), 11)
        for change in (
            lambda p: p.update(authority="official"),
            lambda p: p["official_rules"].update(status="approved"),
            lambda p: p["milestones"].pop(),
            lambda p: p["milestones"][3].update(day=8),
            lambda p: p["milestones"][0].update(required=["It works"]),
        ):
            value = copy.deepcopy(self.policy)
            change(value)
            write_json(self.root / submission.POLICY, value)
            with self.assertRaises(ReadinessError):
                submission.load_policy(self.root)

    def test_prepare_creates_draft_once_without_marking_any_checkpoint_passed(
        self,
    ) -> None:
        target = self.root / "new-package"
        path = submission.prepare(self.root, target, SHA)
        data = json.loads(path.read_text())
        self.assertIsNone(data["owner_review"])
        self.assertIsNone(data["official_review"])
        self.assertNotIn("verified_milestones", data)
        with self.assertRaises(ReadinessError):
            submission.prepare(self.root, target, SHA)
        with self.assertRaises(ReadinessError):
            submission.prepare(self.root, self.root / "other", "main")

    def test_required_policy_gate_cannot_be_hidden_in_a_ci_comment(self) -> None:
        submission.check_wiring(self.root)
        (self.root / ".github/workflows/pr-governance.yml").write_text(
            "# run: python scripts/ci/submission_readiness.py --check\n"
        )
        with self.assertRaises(ReadinessError):
            submission.check_wiring(self.root)

    def test_draft_holds_for_missing_runtime_official_and_submission_materials(
        self,
    ) -> None:
        self.document["materials"]["walkthrough"] = None
        self.document["demo_url"] = ""
        result = self.audit()
        self.assertEqual(result["status"], "HOLD")
        self.assertEqual(result["verified_milestones"], 0)
        self.assertEqual(len(result["blockers"]), 4)

    def test_all_eleven_owner_decisions_still_cannot_replace_official_rules(
        self,
    ) -> None:
        self.reviewed()
        result = self.audit()
        self.assertEqual(result["verified_milestones"], 11)
        self.assertEqual(result["official_rules"], "UNCONFIRMED")
        self.assertEqual(result["status"], "HOLD")

    def test_consistent_reviewed_fixture_is_only_ready_for_owner_submission(
        self,
    ) -> None:
        self.reviewed()
        self.official()
        result = self.audit()
        self.assertEqual(result["status"], "READY_FOR_OWNER_SUBMISSION")
        self.assertIn("does not publish", result["scope"])
        self.assertFalse((self.root / "state/roadmap/sprint.json").exists())

    def test_native_receipt_is_required_and_cannot_be_replaced_by_a_written_action_claim(
        self,
    ) -> None:
        self.reviewed()
        self.official()
        self.document["execution_receipts"] = None
        self.assertEqual(self.audit()["status"], "HOLD")
        original = copy.deepcopy(self.native)
        for change in (
            lambda x: x["jobs"][0].update(release_context=None),
            lambda x: x["jobs"][0]["release_context"].update(candidate_sha="0" * 40),
            lambda x: x["jobs"][0].update(worker="different-producer"),
            lambda x: x["jobs"][0].update(evidence="different-evidence"),
            lambda x: x["jobs"][0].update(status="hold"),
            lambda x: x["jobs"][0].update(finished_at=self.capture.time(4)),
            lambda x: x["jobs"][0]["input"].update(max_seconds=600),
            lambda x: x["jobs"][0]["result"]["reported"]["output"].update(
                summary="Substituted result"
            ),
            lambda x: x["jobs"].append(copy.deepcopy(x["jobs"][0])),
        ):
            self.native = copy.deepcopy(original)
            change(self.native)
            self.reviewed()
            with self.assertRaises(ReadinessError):
                self.audit()

    def test_native_erp_effect_is_distinguished_from_external_worker_execution(
        self,
    ) -> None:
        self.native["jobs"][0]["provider"] = "erp"
        self.capture.change("action", execution_kind="native")
        self.reviewed()
        self.official()
        self.assertEqual(self.audit()["status"], "READY_FOR_OWNER_SUBMISSION")

    def test_omitted_milestone_or_skipped_acceptance_cannot_complete_the_entry(
        self,
    ) -> None:
        self.reviewed()
        self.official()
        review = json.loads((self.root / "owner.json").read_text())
        review["decisions"].pop()
        write_json(self.root / "owner.json", review)
        self.document["owner_review"] = self.ref("owner.json")
        self.assertEqual(self.audit()["status"], "HOLD")
        self.reviewed()
        for state in ("HOLD", "BLOCKED", "FAIL", "STALE", "UNMEASURED"):
            self.states["web_tests"] = state
            with self.subTest(state=state), self.assertRaises(ReadinessError):
                self.audit()

    def test_changed_source_and_foreign_workspace_are_rejected(self) -> None:
        self.reviewed()
        for name, wrong in (
            ("source_sha256", "0" * 64),
            ("candidate_sha", "0" * 40),
            ("workspace", "foreign"),
        ):
            old = self.document[name]
            self.document[name] = wrong
            with self.subTest(name=name), self.assertRaises(ReadinessError):
                self.audit()
            self.document[name] = old

    def test_material_tampering_path_escape_and_future_dates_fail_closed(self) -> None:
        original = self.document["materials"]["walkthrough"]
        for reference in (
            {**original, "path": "../elsewhere"},
            {**original, "sha256": "0" * 64},
            {**original, "observed_at": (NOW + timedelta(seconds=1)).isoformat()},
        ):
            self.document["materials"]["walkthrough"] = reference
            with self.assertRaises(ReadinessError):
                self.audit()
        (self.root / "linked.txt").symlink_to(self.root / "walkthrough.txt")
        self.document["materials"]["walkthrough"] = {**original, "path": "linked.txt"}
        with self.assertRaises(ReadinessError):
            self.audit()

    def test_large_walkthrough_is_hashed_in_chunks_without_a_network_request(
        self,
    ) -> None:
        (self.root / "walkthrough.txt").write_bytes(b"fixture" * 700_000)
        self.document["materials"]["walkthrough"] = self.ref("walkthrough.txt")
        self.assertEqual(self.audit()["status"], "HOLD")
        (self.root / "walkthrough.txt").write_bytes(b"changed")
        with self.assertRaisesRegex(ReadinessError, "bytes"):
            self.audit()

    def test_official_review_requires_actual_capture_current_candidate_open_deadline_and_all_requirements(
        self,
    ) -> None:
        self.reviewed()
        self.official()
        path = self.root / "official.json"
        original = json.loads(path.read_text())
        for change in (
            lambda x: x.update(reviewer="producer"),
            lambda x: x.update(deadline=NOW.isoformat()),
            lambda x: x.update(candidate_sha="0" * 40),
            lambda x: x["requirements"].update(hosting=False),
            lambda x: x.update(reviewed_at=(NOW - timedelta(hours=1)).isoformat()),
            lambda x: x["source_copy"].update(sha256="0" * 64),
        ):
            value = copy.deepcopy(original)
            change(value)
            write_json(path, value)
            self.document["official_review"] = self.ref("official.json")
            with self.assertRaises(ReadinessError):
                self.audit()

    def test_public_references_reject_credentials_private_hosts_and_executable_schemes(
        self,
    ) -> None:
        for address in (
            "http://example.org",
            "https://127.0.0.1",
            "https://local.test",
            "https://private.internal",
            "https://user:password@example.org",
            "https://example.org:bad",
            "https://example.org:8080",
            "javascript:alert(1)",
            "https://example.org/#claim",
            None,
        ):
            with self.subTest(address=address), self.assertRaises(ReadinessError):
                submission.public_url(address)
        self.assertEqual(
            submission.public_url("https://example.org/entry"),
            "https://example.org/entry",
        )

    def test_cli_reports_hold_and_requires_real_manifest_inputs(self) -> None:
        write_json(self.path, self.document)
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(submission.main(["--root", str(self.root), "--check"]), 0)
            self.assertEqual(
                submission.main(
                    ["--root", str(self.root), "--manifest", str(self.path)]
                ),
                1,
            )
            self.assertEqual(
                submission.main(
                    [
                        "--root",
                        str(self.root),
                        "--manifest",
                        str(self.path),
                        "--acceptance",
                        str(self.root),
                        "--candidate",
                        SHA,
                        "--reviewer",
                        "owner-reviewer",
                    ]
                ),
                1,
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
