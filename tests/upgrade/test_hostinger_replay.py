# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_hostinger_replay.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/hostinger_replay.py, tests/upgrade/test_hostinger_readiness.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/hostinger_replay.py; CONSUMES tests/upgrade/test_hostinger_readiness.py
# Intent:      Exercise a clearly synthetic captured demo and reject altered, cross-scope, self-reviewed, incomplete and stale evidence before roadmap projection.
# ───────────────────────────────────────────────────────────────

"""Test captured-export consistency; fixtures are not actual deployment evidence."""

from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
from pathlib import Path
import tempfile
from typing import Any
import unittest
from unittest.mock import patch

from scripts.ci import hostinger_replay as replay
from scripts.ci.hostinger_readiness import ReadinessError
from scripts.ci.sprint_cycle import CAMPAIGN_ID
from tests.upgrade import test_hostinger_readiness as fixtures

NOW = datetime(2026, 9, 20, 12, tzinfo=timezone.utc)
SHA, SOURCE, ARTIFACT = "a" * 40, "b" * 64, "c" * 64
WORKSPACE, MISSION, DISPATCH = (
    "syntheticworkspace",
    "syntheticmission",
    "fixture-dispatch",
)


class ReplayFixture:
    """Prepare a complete synthetic export in a disposable directory."""

    def __init__(self, root: Path, *, synthetic: bool = True) -> None:
        self.root = root
        self.path = root / "capture.json"
        self.start = NOW - timedelta(hours=1)
        environment = "fixture" if synthetic else "staging"
        self.capture: dict[str, Any] = {
            "schema_version": "buildanddo.hostinger-replay/v1",
            "campaign_id": CAMPAIGN_ID,
            "candidate_sha": SHA,
            "source_sha256": SOURCE,
            "artifact_tree_sha256": ARTIFACT,
            "workspace": WORKSPACE,
            "mission": MISSION,
            "dispatch": DISPATCH,
            "environment": environment,
            "synthetic": synthetic,
            "captured_at": NOW.isoformat(),
            "records": {},
            "release_receipts": [],
            "gitlab_exports": [],
            "datadog_exports": [],
        }
        output = b"Explicitly synthetic bounded job output; never a real receipt.\n"
        (root / "result.txt").write_bytes(output)
        result_digest = hashlib.sha256(output).hexdigest()
        self.capture["action_output"] = self.ref("result.txt", self.time(4))
        signal = {
            "workspace": WORKSPACE,
            "id": "fixturesignal",
            "updated": self.time(1),
            "title": "Synthetic evidence blocker",
            "description": "Fixture only",
            "source": "synthetic-source",
            "type": "fact",
            "owner": "producer",
        }
        plan = {"version": 1, "risk": "A1", "independent_review": True}
        approval = {
            "workspace": WORKSPACE,
            "id": MISSION,
            "owner": "producer",
            "status": "approved",
            "mission_plan": plan,
            "mission_approved_by": "approver",
            "mission_approved_at": self.time(3),
        }
        scope = {
            "workspace": WORKSPACE,
            "mission": MISSION,
            "dispatch": DISPATCH,
            "candidate_sha": SHA,
            "artifact_tree_sha256": ARTIFACT,
            "environment": environment,
            "job_id": "fixture-job",
            "result_sha256": result_digest,
        }
        evidence = {
            "workspace": WORKSPACE,
            "mission": MISSION,
            "id": "fixtureevidence",
            "owner": "producer",
            "source": "synthetic-result",
            "content": result_digest,
        }
        documents = {
            "context": {
                "workspace": WORKSPACE,
                "state": "MEASURED",
                "source_ref": "synthetic-context",
                "observed_at": self.time(0),
            },
            "signal": signal,
            "proposal": {
                "workspace": WORKSPACE,
                "mission": MISSION,
                "id": "fixtureproposal",
                "owner": "producer",
                "type": "observed",
                "category": "signal",
                "content": json.dumps(
                    {
                        "signal": signal["id"],
                        **{
                            key: signal[key]
                            for key in (
                                "updated",
                                "title",
                                "description",
                                "source",
                                "type",
                                "owner",
                            )
                        },
                    }
                ),
            },
            "approval": approval,
            "action": {
                **scope,
                "execution_kind": "worker",
                "status": "PASS",
                "producer": "producer",
                "limits": {"max_seconds": 60},
                "started_at": self.time(3, 5),
                "completed_at": self.time(3, 50),
            },
            "verification": {
                **scope,
                "status": "PASS",
                "verifier": "reviewer",
                "verified_at": self.time(4, 50),
                "checks": {
                    key: "PASS" for key in ("test", "evaluate", "verify", "validate")
                },
            },
            "evidence": evidence,
            "outcome": {
                **approval,
                "status": "verified",
                "mission_reviewed_by": "reviewer",
                "mission_reviewed_at": self.time(6, 50),
                "mission_review": {
                    "reflection": "Synthetic independent review",
                    **{
                        key: {
                            "outcome": "pass",
                            "evidence": "fixtureevidence",
                            "observation": "Synthetic passing observation",
                        }
                        for key in ("test", "evaluate", "verify", "validate")
                    },
                },
            },
            "operator": {
                "schema_version": "buildanddo.operator-snapshot/v1",
                "workspace": WORKSPACE,
                "observed_at": self.time(8),
                "sources": {
                    "missions": {
                        "state": "available",
                        "page": 1,
                        "has_more": False,
                        "items": [{"id": MISSION, "status": "verified"}],
                    },
                    "evidence": {
                        "state": "available",
                        "page": 1,
                        "has_more": False,
                        "items": [{"id": "fixtureevidence"}],
                    },
                },
            },
        }
        for index, stage in enumerate(replay.STAGES):
            fixtures.write_json(root / (stage + ".json"), documents[stage])
            self.capture["records"][stage] = self.ref(stage + ".json", self.time(index))
        release = {
            "schema": "buildanddo.external-readback/v1",
            "environment": "staging",
            "state": "PASS",
            "expected_sha": SHA,
            "deployed_sha": SHA,
            "artifact_tree_sha256": ARTIFACT,
            "health_pass": True,
            "sha_match": True,
            "flagship_lesson_readback": True,
            "verified_at": self.time(0),
        }
        fixtures.write_json(root / "release.json", release)
        self.capture["release_receipts"] = [self.ref("release.json", self.time(0))]
        self.save()

    def time(self, minutes: int, seconds: int = 0) -> str:
        """Return ordered synthetic observation times."""
        return (self.start + timedelta(minutes=minutes, seconds=seconds)).isoformat()

    def ref(self, name: str, observed: str) -> dict[str, str]:
        """Bind synthetic bytes so semantic rejection is tested separately from tampering."""
        return {
            "path": name,
            "sha256": hashlib.sha256((self.root / name).read_bytes()).hexdigest(),
            "observed_at": observed,
        }

    def save(self) -> None:
        """Save the explicit fixture manifest."""
        fixtures.write_json(self.path, self.capture)

    def change(self, stage: str, **values: Any) -> None:
        """Replace a stage and deliberately rebind bytes to test cross-record constraints."""
        path = self.root / (stage + ".json")
        data = json.loads(path.read_text())
        data.update(values)
        fixtures.write_json(path, data)
        if stage == "release":
            self.capture["release_receipts"] = [self.ref(path.name, self.time(0))]
        else:
            prior = self.capture["records"][stage]
            self.capture["records"][stage] = self.ref(path.name, prior["observed_at"])
        self.save()

    def validate(self, **overrides: Any) -> dict[str, object]:
        """Run production validation with independently selected synthetic scope."""
        return replay.validate_capture(
            self.path,
            **{
                "candidate": SHA,
                "source": SOURCE,
                "workspace": WORKSPACE,
                "mission": MISSION,
                "dispatch": DISPATCH,
                "now": NOW,
                **overrides,
            },
        )


class ReplayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="hostinger-replay-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.fixture = ReplayFixture(self.root)

    def test_fixture_is_identified_and_missing_release_remains_hold(self) -> None:
        result = self.fixture.validate()
        self.assertEqual(result["status"], "SYNTHETIC_CAPTURE")
        self.assertEqual(
            result["release"]["rows"]["staging_verification"]["status"], "OBSERVED_PASS"
        )
        self.assertEqual(result, self.fixture.validate())
        self.fixture.capture["release_receipts"] = []
        self.fixture.save()
        self.assertEqual(self.fixture.validate()["status"], "HOLD")

    def test_nonsynthetic_declaration_only_establishes_captured_consistency(
        self,
    ) -> None:
        self.fixture = ReplayFixture(self.root, synthetic=False)
        result = self.fixture.validate()
        self.assertEqual(result["status"], "CONSISTENT_CAPTURE")
        self.assertIn("No live action", result["scope"])
        self.assertNotIn("milestones", result)

    def test_caller_identity_mismatch_is_rejected(self) -> None:
        for name, value in (
            ("candidate", "d" * 40),
            ("source", "d" * 64),
            ("workspace", "other"),
            ("mission", "other"),
            ("dispatch", "other"),
        ):
            with self.subTest(name=name), self.assertRaises(ReadinessError):
                self.fixture.validate(**{name: value})

    def test_changed_bytes_paths_symlinks_and_duplicate_references_are_rejected(
        self,
    ) -> None:
        (self.root / "result.txt").write_text("changed after capture")
        with self.assertRaisesRegex(ReadinessError, "Captured bytes"):
            self.fixture.validate()
        self.fixture = ReplayFixture(self.root)
        self.fixture.capture["action_output"]["path"] = "../result.txt"
        self.fixture.save()
        with self.assertRaises(ReadinessError):
            self.fixture.validate()
        self.fixture = ReplayFixture(self.root)
        (self.root / "result-link.txt").symlink_to(self.root / "result.txt")
        self.fixture.capture["action_output"]["path"] = "result-link.txt"
        self.fixture.save()
        with self.assertRaises(ReadinessError):
            self.fixture.validate()
        self.fixture = ReplayFixture(self.root)
        self.fixture.capture["release_receipts"] *= 2
        self.fixture.save()
        with self.assertRaisesRegex(ReadinessError, "twice"):
            self.fixture.validate()

    def test_cross_record_scope_authority_and_review_failures(self) -> None:
        cases = [
            ("context", {"state": "UNMEASURED"}),
            ("signal", {"id": True}),
            ("signal", {"source": {"asserted": True}}),
            ("signal", {"workspace": "foreign"}),
            ("signal", {"updated": "another revision"}),
            ("proposal", {"mission": "foreign"}),
            ("approval", {"status": "proposed"}),
            ("approval", {"mission_plan": {"independent_review": False}}),
            ("action", {"execution_kind": "recorded_workflow"}),
            ("action", {"dispatch": "other"}),
            ("action", {"limits": {"max_seconds": 1}}),
            ("action", {"result_sha256": "d" * 64}),
            ("verification", {"verifier": "producer"}),
            ("verification", {"job_id": "other"}),
            ("verification", {"checks": {"test": "PASS"}}),
            ("evidence", {"owner": "reviewer"}),
            ("evidence", {"content": "No result digest"}),
            ("outcome", {"mission_reviewed_by": "other"}),
            ("outcome", {"mission_review": {"reflection": ""}}),
            (
                "operator",
                {"sources": {"missions": {"state": "unavailable", "items": []}}},
            ),
        ]
        for stage, values in cases:
            self.fixture = ReplayFixture(self.root)
            self.fixture.change(stage, **values)
            with (
                self.subTest(stage=stage, values=values),
                self.assertRaises(ReadinessError),
            ):
                self.fixture.validate()

    def test_time_order_stale_payload_and_future_observations_are_rejected(
        self,
    ) -> None:
        cases = [
            ("context", {"observed_at": self.fixture.time(-20)}),
            ("action", {"started_at": self.fixture.time(2)}),
            ("verification", {"verified_at": self.fixture.time(3)}),
            ("outcome", {"mission_reviewed_at": self.fixture.time(4)}),
            ("operator", {"observed_at": self.fixture.time(0)}),
            ("release", {"verified_at": (NOW - timedelta(days=4)).isoformat()}),
        ]
        for stage, values in cases:
            self.fixture = ReplayFixture(self.root)
            self.fixture.change(stage, **values)
            with self.subTest(stage=stage), self.assertRaises(ReadinessError):
                self.fixture.validate()
        self.fixture = ReplayFixture(self.root)
        self.fixture.capture["records"]["signal"]["observed_at"] = self.fixture.time(-1)
        self.fixture.save()
        with self.assertRaises(ReadinessError):
            self.fixture.validate()
        self.fixture = ReplayFixture(self.root)
        with self.assertRaises(ReadinessError):
            self.fixture.validate(now=NOW + timedelta(days=3))
        with self.assertRaises(ReadinessError):
            self.fixture.validate(now=NOW - timedelta(days=1))

    def test_wrong_source_and_failed_health_remain_hold(self) -> None:
        self.fixture.change("release", deployed_sha="f" * 40)
        self.assertEqual(self.fixture.validate()["status"], "HOLD")
        self.fixture = ReplayFixture(self.root)
        self.fixture.change("release", health_pass=False)
        self.assertEqual(self.fixture.validate()["status"], "HOLD")

    def test_provider_exports_reconcile_without_promoting_partial_production(
        self,
    ) -> None:
        fixtures.write_json(
            self.root / "gitlab.json",
            {
                "pipelines": [{"id": 1, "sha": SHA, "status": "success"}],
                "jobs": [],
                "artifacts": [{"id": 2, "sha": SHA, "artifact_tree_sha256": ARTIFACT}],
            },
        )
        fixtures.write_json(
            self.root / "datadog.json",
            {"dora": [], "traces": [], "events": [], "verifications": []},
        )
        self.fixture.capture["gitlab_exports"] = [
            self.fixture.ref("gitlab.json", self.fixture.time(8))
        ]
        self.fixture.capture["datadog_exports"] = [
            self.fixture.ref("datadog.json", self.fixture.time(8))
        ]
        self.fixture.save()
        self.assertEqual(self.fixture.validate()["status"], "SYNTHETIC_CAPTURE")
        self.fixture.capture.update(environment="production", synthetic=False)
        self.fixture.change("action", environment="production")
        self.fixture.change("verification", environment="production")
        self.fixture.change("release", environment="production")
        result = self.fixture.validate()
        self.assertEqual(
            result["release"]["rows"]["production_verification"]["status"],
            "OBSERVED_PASS",
        )
        self.assertEqual(result["status"], "HOLD")

    def test_cli_requires_scope_and_never_overwrites_an_export(self) -> None:
        arguments = [
            str(self.fixture.path),
            "--candidate-sha",
            SHA,
            "--workspace",
            WORKSPACE,
            "--mission",
            MISSION,
            "--dispatch",
            DISPATCH,
        ]
        with (
            patch.object(replay, "check_review", return_value=({}, SOURCE)),
            patch.object(
                replay, "validate_capture", return_value={"status": "SYNTHETIC_CAPTURE"}
            ),
            redirect_stdout(io.StringIO()),
            redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(replay.main(arguments), 0)
            target = self.root / "output.json"
            self.assertEqual(replay.main([*arguments, "--output", str(target)]), 0)
            self.assertEqual(replay.main([*arguments, "--output", str(target)]), 1)
            self.assertEqual(
                replay.main([*arguments, "--owner-review", str(self.fixture.path)]), 1
            )


class MilestoneReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="hostinger-review-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.fixture = ReplayFixture(self.root, synthetic=False)
        self.result = self.fixture.validate()
        self.contract = json.loads(
            (fixtures.ROOT / ".bits/hostinger-readiness.json").read_text()
        )
        self.review: dict[str, Any] = {
            "schema_version": "buildanddo.hostinger-owner-review/v1",
            "reviewer": "owner-reviewer",
            "reviewed_at": NOW.isoformat(),
            "capture_sha256": self.result["capture_sha256"],
            "decisions": [
                {
                    "id": "HS-01",
                    "evidence": [self.fixture.ref("capture.json", NOW.isoformat())],
                    "runtime_requirements": self.contract["pieces"][0][
                        "runtime_requirements"
                    ],
                }
            ],
        }
        self.states = {name: "PASS" for name in self.contract["pieces"][0]["checks"]}

    def project(self) -> dict[str, object]:
        """Supply explicit owner/check doubles; captured chain validation stays real."""
        with (
            patch.object(replay, "check_review", return_value=(self.contract, SOURCE)),
            patch.object(replay, "acceptance_state", return_value=self.states),
        ):
            return replay.project_milestones(
                self.root,
                self.result,
                self.review,
                self.root,
                "owner-reviewer",
                NOW,
                review_root=self.root,
            )

    def test_only_owner_selected_milestone_is_projected(self) -> None:
        projected = self.project()
        self.assertEqual(projected["milestones"][0]["status"], "verified")
        self.assertTrue(
            all(item["status"] == "planned" for item in projected["milestones"][1:])
        )
        self.assertIn("#sha256=", projected["milestones"][0]["evidence"])
        self.assertFalse((self.root / "state/roadmap/sprint.json").exists())

    def test_synthetic_replay_cannot_earn_any_milestone(self) -> None:
        self.result["synthetic"] = True
        with self.assertRaises(ReadinessError):
            self.project()

    def test_required_checks_must_all_be_current_passes(self) -> None:
        for state in ("STALE", "HOLD", "BLOCKED", "FAIL", "UNMEASURED"):
            self.states["web_tests"] = state
            with self.subTest(state=state), self.assertRaises(ReadinessError):
                self.project()

    def test_review_cannot_omit_dependencies_receipts_or_runtime_requirements(
        self,
    ) -> None:
        original = copy.deepcopy(self.review)
        cases = [
            lambda x: x.update(capture_sha256="0" * 64),
            lambda x: x.update(reviewer="producer"),
            lambda x: x["decisions"][0].update(runtime_requirements=["ci_account"]),
            lambda x: x["decisions"][0].update(evidence=["asserted without a file"]),
            lambda x: x["decisions"][0].update(id="HS-99"),
            lambda x: x["decisions"].append(x["decisions"][0]),
            lambda x: x["decisions"][0].update(
                id="HS-02", runtime_requirements=["browser"]
            ),
        ]
        for mutate in cases:
            self.review = copy.deepcopy(original)
            mutate(self.review)
            with (
                self.subTest(case=cases.index(mutate)),
                self.assertRaises(ReadinessError),
            ):
                self.project()


if __name__ == "__main__":
    unittest.main(verbosity=2)
