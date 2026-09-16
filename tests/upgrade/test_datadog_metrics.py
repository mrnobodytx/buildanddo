# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_datadog_metrics.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     scripts/ci/emit_datadog_metrics.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/emit_datadog_metrics.py
# DAG Node:    buildanddo.citadel_telemetry.test
# Intent:      Prove Citadel metric collection is complete for known projections and remains non-fatal when state, credentials, or Datadog are unavailable.
# ───────────────────────────────────────────────────────────────
"""Test aggregate Citadel metric collection and best-effort submission."""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import cast
from unittest import mock

from scripts.ci import emit_datadog_metrics as subject


class DatadogMetricTests(unittest.TestCase):
    """Exercise metric extraction without reading or sending private state."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write(self, relative: str, payload: object) -> Path:
        """Write one JSON projection below the isolated test directory."""

        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def full_sources(self) -> subject.Sources:
        """Create a complete set of aggregate input projections."""

        assessment = self.write(
            "state/system_assessment/latest.json",
            {
                "assessment_state": "HOLD",
                "governance": {"sessions_blocked": 3, "sessions_completed": 5},
                "providers": {
                    "hostinger": "PASS",
                    "cloudflare": {"state": "HOLD"},
                    "posthog": {"status": "CONNECTED"},
                },
                "integrations": [
                    {"provider": "discord", "state": "FAIL"},
                    {"id": "elevenlabs", "state": "VERIFIED"},
                ],
            },
        )
        return subject.Sources(
            assessments=(assessment,),
            fleet=self.write(
                "state/fleet/manifest.latest.json",
                {"fleet_totals": {"hosts": 7, "containers_running": 81}},
            ),
            incidents=self.write(
                "state/incidents/index.latest.json",
                {"incident_count": 1094, "relevance_counts": {"HIGH": 1}},
            ),
            surface_proof=self.write(
                "state/surface_proof/latest.json",
                {"state": "PASS", "verified_external_writes": 3},
            ),
            evidence=self.write(
                "state/evidence/index.latest.json",
                {"summary": {"verified_count": 34, "held_count": 6}},
            ),
            content=self.write(
                "state/content/publish-plan.latest.json",
                {"drafts": {"wiki": 2, "forum": 1, "reddit": 4, "interview": 0}},
            ),
        )

    def test_collects_every_requested_metric_with_bounded_dimensions(self) -> None:
        collected = subject.collect_metrics(self.full_sources())
        indexed = {(metric.name, metric.tags): metric for metric in collected}

        self.assertEqual(20, len(collected))
        self.assertEqual(0.5, indexed[("citadel.system_assessment.state", ())].value)
        self.assertEqual(81, indexed[("citadel.fleet.containers_running", ())].value)
        self.assertEqual(7, indexed[("citadel.fleet.hosts", ())].value)
        self.assertEqual(1094, indexed[("citadel.incidents.total", ())].value)
        self.assertEqual(1, indexed[("citadel.incidents.high_relevance", ())].value)
        self.assertEqual(1, indexed[("citadel.surface_proof.state", ())].value)
        self.assertEqual(
            3, indexed[("citadel.surface_proof.verified_writes", ())].value
        )
        self.assertEqual(34, indexed[("citadel.evidence.verified_count", ())].value)
        self.assertEqual(6, indexed[("citadel.evidence.held_count", ())].value)
        self.assertEqual(3, indexed[("citadel.governance.sessions_blocked", ())].value)
        self.assertEqual(
            5, indexed[("citadel.governance.sessions_completed", ())].value
        )
        self.assertEqual(
            0.5, indexed[("citadel.provider.state", ("provider:cloudflare",))].value
        )
        self.assertEqual(
            0, indexed[("citadel.provider.state", ("provider:discord",))].value
        )
        self.assertEqual(
            4, indexed[("citadel.content.drafts_pending", ("surface:reddit",))].value
        )

        series = subject.build_series(collected, 123, ("source:test",))
        for point in series:
            self.assertEqual(
                [
                    "env:citadel",
                    "service:buildanddo",
                    "source:test",
                    "team:citadel-nexus",
                ],
                [
                    tag
                    for tag in cast(list[str], point["tags"])
                    if not tag.startswith(("provider:", "surface:"))
                ],
            )
        count = next(
            point
            for point in series
            if point["metric"] == "citadel.governance.sessions_blocked"
        )
        self.assertEqual(subject.COUNT, count["type"])
        self.assertEqual(3600, count["interval"])

    def test_discovers_conventional_state_paths(self) -> None:
        self.full_sources()
        args = subject._parser().parse_args(["--state-dir", str(self.root / "state")])
        sources = subject.discover_sources(args)

        self.assertEqual(1, len(sources.assessments))
        self.assertEqual(self.root / "state/fleet/manifest.latest.json", sources.fleet)
        self.assertEqual(
            self.root / "state/content/publish-plan.latest.json", sources.content
        )

    def test_state_mapping_and_surface_proof_are_fail_closed(self) -> None:
        for state in ("PASS", "healthy", "connected", "verified"):
            self.assertEqual(1, subject.state_value(state))
        for state in ("HOLD", "degraded", "pending", "unknown"):
            self.assertEqual(0.5, subject.state_value(state))
        for state in ("FAIL", "error", "blocked", "disconnected"):
            self.assertEqual(0, subject.state_value(state))
        self.assertIsNone(subject.state_value("not-a-state"))
        proof = self.write("proof.json", {"state": "HOLD", "verified_writes": 0})
        collected = subject.collect_metrics(
            subject.Sources(assessments=(), surface_proof=proof)
        )
        self.assertEqual(0, collected[0].value)

    def test_malformed_and_missing_inputs_skip_only_affected_metrics(self) -> None:
        malformed = self.root / "assessment.json"
        malformed.write_text("{not-json", encoding="utf-8")
        fleet = self.write("fleet.json", {"hosts": [{"name": "one"}, {"name": "two"}]})
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            collected = subject.collect_metrics(
                subject.Sources(assessments=(malformed,), fleet=fleet)
            )

        self.assertEqual(["citadel.fleet.hosts"], [metric.name for metric in collected])
        self.assertIn("SKIP: assessment.json is invalid JSON", stderr.getvalue())
        self.assertNotIn(str(self.root), stderr.getvalue())

    def test_missing_api_key_reports_skip_and_returns_success(self) -> None:
        sources = self.full_sources()
        stdout = io.StringIO()
        with (
            mock.patch.object(subject, "discover_sources", return_value=sources),
            mock.patch.dict(os.environ, {}, clear=True),
            contextlib.redirect_stdout(stdout),
        ):
            result = subject.run([])

        self.assertEqual(0, result)
        self.assertIn("SKIP: DD_API_KEY is not configured", stdout.getvalue())

    def test_transport_failure_reports_skip_and_returns_success(self) -> None:
        sources = self.full_sources()
        stderr = io.StringIO()
        with (
            mock.patch.object(subject, "discover_sources", return_value=sources),
            mock.patch.object(
                subject, "submit_series", return_value=(False, "timeout")
            ),
            mock.patch.dict(os.environ, {"DD_API_KEY": "test-only"}, clear=True),
            contextlib.redirect_stderr(stderr),
        ):
            result = subject.run([])

        self.assertEqual(0, result)
        self.assertIn(
            "SKIP: Datadog metrics submission failed: timeout", stderr.getvalue()
        )

    def test_successful_submission_reports_metric_count(self) -> None:
        sources = self.full_sources()
        stdout = io.StringIO()
        with (
            mock.patch.object(subject, "discover_sources", return_value=sources),
            mock.patch.object(
                subject, "submit_series", return_value=(True, "202")
            ) as submit,
            mock.patch.dict(
                os.environ,
                {
                    "DD_API_KEY": "test-only",
                    "DD_SITE": "https://us5.datadoghq.com/",
                },
                clear=True,
            ),
            contextlib.redirect_stdout(stdout),
        ):
            result = subject.run([])

        self.assertEqual(0, result)
        self.assertEqual(20, len(submit.call_args.args[0]))
        self.assertIn("PASS: submitted 20 Citadel metrics", stdout.getvalue())

    def test_empty_dry_run_and_empty_live_run_are_successful(self) -> None:
        empty = subject.Sources(assessments=())
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(subject, "discover_sources", return_value=empty),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertEqual(0, subject.run([]))
            self.assertEqual(0, subject.run(["--dry-run"]))
        self.assertIn("SKIP: no aggregate Citadel state", stdout.getvalue())
        self.assertIn('"series": []', stdout.getvalue())

    def test_scheduled_workflow_binds_state_and_existing_datadog_secret(self) -> None:
        source = (
            Path(__file__).resolve().parents[2]
            / ".github/workflows/citadel-stack-telemetry.yml"
        ).read_text(encoding="utf-8")

        self.assertIn("cron: '17 * * * *'", source)
        self.assertIn("secrets.DD_API_KEY", source)
        self.assertIn("vars.CITADEL_STATE_DIR", source)
        self.assertIn("vars.CITADEL_TELEMETRY_RUNNER", source)
        self.assertIn("python scripts/ci/emit_datadog_metrics.py", source)
        self.assertIn("contents: read", source)


if __name__ == "__main__":
    unittest.main()
