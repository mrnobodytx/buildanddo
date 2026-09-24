# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_development_sources.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development_sources.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/development_sources.py
# Intent:      Reject cross-source and incomplete CI evidence while proving authenticated-reader observations cannot mint test truth.
# ───────────────────────────────────────────────────────────────

"""Use explicitly synthetic provider responses to exercise the receiving boundary."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from libs.evolution.development_sources import (
    GitHubRunCapture,
    SourceUnavailable,
    collect_github_run,
    ingest_run,
    repository_name,
    repository_read,
)
from libs.evolution.episode import build_episodes
from libs.evolution.store import Journal
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

AT = datetime(2026, 9, 21, 1, tzinfo=timezone.utc)
REPO = "example/synthetic-development-fixture"
SHA = "a" * 40


def capture(conclusion: str = "success") -> GitHubRunCapture:
    """Build a synthetic run whose steps do not constitute test outcome labels."""
    run = {
        "id": 10,
        "run_attempt": 2,
        "head_sha": SHA,
        "repository": {"full_name": REPO},
        "html_url": f"https://github.com/{REPO}/actions/runs/10",
        "created_at": (AT - timedelta(minutes=2)).isoformat(),
        "updated_at": (AT - timedelta(seconds=1)).isoformat(),
        "status": "completed",
        "conclusion": conclusion,
        "name": "Fixture CI",
    }
    jobs = {
        "total_count": 1,
        "jobs": [
            {
                "id": 42,
                "run_id": 10,
                "run_attempt": 2,
                "head_sha": SHA,
                "name": "fixture source tests",
                "status": "completed",
                "conclusion": conclusion,
                "steps": [
                    {
                        "number": 1,
                        "name": "Run tests",
                        "status": "completed",
                        "conclusion": conclusion,
                        "started_at": run["created_at"],
                        "completed_at": run["updated_at"],
                    }
                ],
            }
        ],
    }
    return GitHubRunCapture(REPO, 10, 2, AT, json.dumps(run), json.dumps(jobs))


class ProviderCaptureTests(unittest.TestCase):
    def test_statuses_never_become_test_truth_or_authority(self) -> None:
        for conclusion in (
            "success",
            "failure",
            "skipped",
            "cancelled",
            "timed_out",
            "neutral",
        ):
            with self.subTest(conclusion=conclusion):
                event = capture(conclusion).event(
                    scope_id="fixture", expected_sha=SHA, ingested_at=AT
                )
                self.assertEqual(event.data["conclusion"], conclusion)
                self.assertEqual(event.data["test_outcomes"], "UNMEASURED")
                self.assertIs(event.evidence_state, EvidenceState.OBSERVED)
                self.assertIs(event.authority, AuthorityTier.A0)
                self.assertIsNone(event.verification)
                self.assertEqual(build_episodes((event,))[0].status, "INCOMPLETE")

    def test_source_identity_and_chronology_fail_closed(self) -> None:
        original = capture()
        for key, value in (
            ("id", 11),
            ("run_attempt", 1),
            ("head_sha", "short"),
            ("repository", {"full_name": "other/tenant"}),
            ("html_url", "https://example.invalid/pretend"),
            ("updated_at", (AT + timedelta(seconds=1)).isoformat()),
            ("conclusion", None),
        ):
            with self.subTest(key=key), self.assertRaises(ContractError):
                replace(original, run_response=json.dumps({**original.run, key: value}))
        with self.assertRaises(ContractError):
            original.event(scope_id="fixture", expected_sha="b" * 40, ingested_at=AT)
        with self.assertRaises(ContractError):
            replace(original, run_response='{"id":10,"id":10}')

    def test_incomplete_duplicate_and_foreign_jobs_are_rejected(self) -> None:
        original = capture()
        jobs = json.loads(original.jobs_response)
        for field, value in (
            ("run_id", 11),
            ("run_attempt", 1),
            ("head_sha", "b" * 40),
        ):
            changed = json.loads(original.jobs_response)
            changed["jobs"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ContractError):
                replace(original, jobs_response=json.dumps(changed))
        for changed in (
            {**jobs, "total_count": 200},
            {"total_count": 2, "jobs": jobs["jobs"] * 2},
            {"total_count": True, "jobs": jobs["jobs"]},
            {"total_count": 0, "jobs": "pretend"},
        ):
            with self.subTest(changed=changed), self.assertRaises(ContractError):
                replace(original, jobs_response=json.dumps(changed))

    def test_bad_steps_and_future_steps_are_rejected(self) -> None:
        original = capture()
        for changes in (
            {"number": 0},
            {"completed_at": (AT + timedelta(days=1)).isoformat()},
        ):
            jobs = json.loads(original.jobs_response)
            jobs["jobs"][0]["steps"][0].update(changes)
            with self.assertRaises(ContractError):
                replace(original, jobs_response=json.dumps(jobs))
        jobs = json.loads(original.jobs_response)
        jobs["jobs"][0]["steps"] *= 2
        with self.assertRaises(ContractError):
            replace(original, jobs_response=json.dumps(jobs))

    def test_retry_deduplicates_without_crossing_repository_or_journal_scope(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.sqlite"
            with Journal(path, scope_id="one") as journal:
                first = ingest_run(
                    journal, capture(), repository=REPO, candidate=SHA, at=AT
                )
                again = ingest_run(
                    journal,
                    capture(),
                    repository=REPO,
                    candidate=SHA,
                    at=AT + timedelta(seconds=10),
                )
                self.assertEqual(first.event_id, again.event_id)
                self.assertEqual(len(journal.events()), 1)
                with self.assertRaises(ContractError):
                    ingest_run(
                        journal,
                        capture(),
                        repository="foreign/repo",
                        candidate=SHA,
                        at=AT,
                    )
            with Journal(path, scope_id="two") as journal:
                self.assertEqual(journal.events(), ())

    def test_collector_uses_only_explicit_attempt_relative_get_paths(self) -> None:
        original = capture()
        calls = []

        def reader(argv: tuple[str, ...]) -> bytes:
            calls.append(argv)
            return (
                original.jobs_response
                if "/jobs?" in argv[-1]
                else original.run_response
            ).encode()

        observed = collect_github_run(REPO, 10, 2, reader=reader)
        self.assertEqual(observed.run_response, original.run_response)
        self.assertEqual(len(calls), 2)
        for call in calls:
            self.assertEqual(call[:4], ("gh", "api", "--method", "GET"))
            self.assertIn(
                call[-1],
                (
                    f"repos/{REPO}/actions/runs/10",
                    f"repos/{REPO}/actions/runs/10/attempts/2/jobs?per_page=100",
                ),
            )

    def test_missing_jobs_preserves_observation_with_explicit_gap(self) -> None:
        original = capture("failure")

        def reader(argv: tuple[str, ...]) -> bytes:
            if "/jobs?" in argv[-1]:
                raise SourceUnavailable("fixture unavailable")
            return original.run_response.encode()

        observed = collect_github_run(REPO, 10, 2, reader=reader)
        event = observed.event(
            scope_id="one", expected_sha=SHA, ingested_at=observed.observed_at
        )
        self.assertFalse(event.data["jobs_observed"])
        self.assertEqual(event.data["jobs"], ())
        with self.assertRaises(SourceUnavailable):
            collect_github_run(
                REPO,
                10,
                2,
                reader=lambda _: (_ for _ in ()).throw(SourceUnavailable("fixture")),
            )

    def test_reader_rejects_writes_options_urls_and_unsafe_ids(self) -> None:
        for value in ("--repo", "https://github.com/a/b", "a/b/c", "a/../b", "a/b?x=1"):
            with self.subTest(value=value), self.assertRaises(ContractError):
                repository_name(value)
        for argv in (
            ("gh", "api", "anything"),
            (
                "gh",
                "api",
                "--hostname",
                "github.com",
                "--method",
                "POST",
                "repos/a/b/actions/runs/1/attempts/1",
            ),
        ):
            with self.assertRaises(ContractError):
                repository_read(argv)
        for value in (0, -1, True):
            with self.assertRaises(ContractError):
                collect_github_run(REPO, value, 1)

    def test_transport_failures_do_not_expose_stderr(self) -> None:
        argv = ("gh", "api", "--method", "GET", "repos/a/b/actions/runs/1")
        for result in (
            subprocess.CompletedProcess(argv, 1, b"", b"sensitive-fixture"),
            OSError("sensitive-fixture"),
            subprocess.TimeoutExpired(argv, 45),
        ):
            with patch(
                "libs.evolution.development_sources.subprocess.run",
                **(
                    {"side_effect": result}
                    if isinstance(result, Exception)
                    else {"return_value": result}
                ),
            ):
                with self.assertRaises(SourceUnavailable) as caught:
                    repository_read(argv)
                self.assertNotIn("sensitive-fixture", str(caught.exception))
        with patch(
            "libs.evolution.development_sources.subprocess.run",
            return_value=subprocess.CompletedProcess(argv, 0, b"{}", b""),
        ):
            self.assertEqual(repository_read(argv), b"{}")


if __name__ == "__main__":
    unittest.main()
