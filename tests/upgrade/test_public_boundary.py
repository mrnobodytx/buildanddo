# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_public_boundary.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/verify_public_boundary.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/verify_public_boundary.py
# Intent:      Keep review attribution mandatory after CI migration and reject foreign or missing review evidence without weakening public boundary checks.
# ───────────────────────────────────────────────────────────────

"""Exercise the real boundary entry point with local files and provider fixtures."""

from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.ci import verify_public_boundary as boundary

SHA = "a" * 40


class PublicBoundaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="boundary-governance-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.policy = {
            "public_forbidden_prefixes": ["private/"],
            "forbidden_file_names": ["credentials.json"],
            "actor_labels": ["actor:human", "actor:agent", "actor:mixed"],
        }
        self.write(".buildanddo/public/path-policy.json", json.dumps(self.policy))
        self.write("docs/public.txt", "Public fixture\n")
        self.enterContext(
            patch.object(boundary, "git_files", return_value=["docs/public.txt"])
        )
        self.enterContext(
            patch.object(boundary.subprocess, "check_output", return_value=SHA + "\n")
        )

    def write(self, name: str, text: str) -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def run_gate(
        self, *args: str, env: dict[str, str] | None = None
    ) -> tuple[int, dict]:
        with (
            patch.dict(boundary.os.environ, env or {}, clear=True),
            redirect_stdout(io.StringIO()),
        ):
            result = boundary.main(["--root", str(self.root), *args])
        report = json.loads(
            (self.root / ".buildanddo/public/boundary-report.json").read_text()
        )
        return result, report

    def github_event(self, **changes: object) -> Path:
        pr = {
            "number": 64,
            "head": {"sha": SHA},
            "base": {"repo": {"full_name": "mrnobodytx/buildanddo"}},
            "labels": [{"name": "actor:agent"}],
            **changes,
        }
        return self.write("review.json", json.dumps({"pull_request": pr}))

    def test_local_boundary_scan_does_not_invent_review_attribution(self) -> None:
        code, report = self.run_gate()
        self.assertEqual(code, 0)
        self.assertIsNone(report["actor"])

    def test_gitlab_accepts_each_single_actor_label(self) -> None:
        for label in self.policy["actor_labels"]:
            with self.subTest(label=label):
                code, report = self.run_gate(
                    "--gitlab-ci",
                    env={
                        "CI_PIPELINE_SOURCE": "merge_request_event",
                        "CI_MERGE_REQUEST_IID": "12",
                        "CI_MERGE_REQUEST_LABELS": "feature, " + label,
                    },
                )
                self.assertEqual(code, 0)
                self.assertEqual(report["actor"]["provider"], "gitlab")
                self.assertEqual(report["actor"]["actor_label"], label)

    def test_missing_multiple_or_unrelated_labels_fail(self) -> None:
        for labels in ("", "Bits AI", "actor:agent,actor:human", "actor:AGENT"):
            with self.subTest(labels=labels):
                code, report = self.run_gate(
                    "--gitlab-ci",
                    env={
                        "CI_PIPELINE_SOURCE": "merge_request_event",
                        "CI_MERGE_REQUEST_IID": "12",
                        "CI_MERGE_REQUEST_LABELS": labels,
                    },
                )
                self.assertEqual(code, 1)
                self.assertIn(
                    "actor_label", {item["type"] for item in report["failures"]}
                )

    def test_merge_request_identity_cannot_be_missing_or_invalid(self) -> None:
        for iid in ("", "no", "0"):
            with self.subTest(iid=iid):
                code, _ = self.run_gate(
                    "--gitlab-ci",
                    env={
                        "CI_PIPELINE_SOURCE": "merge_request_event",
                        "CI_MERGE_REQUEST_IID": iid,
                        "CI_MERGE_REQUEST_LABELS": "actor:agent",
                    },
                )
                self.assertEqual(code, 1)

    def test_default_branch_scan_reports_review_not_applicable(self) -> None:
        code, report = self.run_gate(
            "--gitlab-ci",
            env={
                "CI_PIPELINE_SOURCE": "push",
                "CI_COMMIT_BRANCH": "main",
                "CI_DEFAULT_BRANCH": "main",
            },
        )
        self.assertEqual(code, 0)
        self.assertEqual(report["actor"]["status"], "NOT_APPLICABLE")
        self.assertIsNone(report["actor"]["actor_label"])

    def test_candidate_and_external_pipelines_require_review_metadata(self) -> None:
        for env in (
            {},
            {
                "CI_PIPELINE_SOURCE": "push",
                "CI_COMMIT_BRANCH": "sprint/fixture",
                "CI_DEFAULT_BRANCH": "main",
            },
            {
                "CI_PIPELINE_SOURCE": "external_pull_request_event",
                "CI_EXTERNAL_PULL_REQUEST_IID": "64",
            },
            {
                "CI_PIPELINE_SOURCE": "external_pull_request_event",
                "CI_COMMIT_BRANCH": "main",
                "CI_DEFAULT_BRANCH": "main",
            },
        ):
            with self.subTest(env=env):
                self.assertEqual(self.run_gate("--gitlab-ci", env=env)[0], 1)

    def test_github_event_is_bound_to_the_tested_commit(self) -> None:
        event = self.github_event()
        code, report = self.run_gate("--github-event", str(event))
        self.assertEqual(code, 0)
        self.assertEqual(report["actor"]["provider"], "github")
        self.assertEqual(report["actor"]["actor_label"], "actor:agent")
        event = self.github_event(head={"sha": "b" * 40})
        self.assertEqual(self.run_gate("--github-event", str(event))[0], 1)

    def test_gitlab_external_review_export_retains_repository_revision_and_number(
        self,
    ) -> None:
        event = self.github_event()
        env = {
            "CI_PIPELINE_SOURCE": "external_pull_request_event",
            "CI_EXTERNAL_PULL_REQUEST_IID": "64",
            "BUILDANDDO_GITHUB_PR_EVENT": str(event),
        }
        self.assertEqual(self.run_gate("--gitlab-ci", env=env)[0], 0)
        for number in ("65", "", "no", "0"):
            with self.subTest(number=number):
                self.assertEqual(
                    self.run_gate(
                        "--gitlab-ci",
                        env={**env, "CI_EXTERNAL_PULL_REQUEST_IID": number},
                    )[0],
                    1,
                )
        self.github_event(base={"repo": {"full_name": "unrelated/repository"}})
        self.assertEqual(self.run_gate("--gitlab-ci", env=env)[0], 1)

    def test_github_event_cannot_substitute_for_a_gitlab_merge_request(self) -> None:
        event = self.github_event()
        self.assertEqual(
            self.run_gate(
                "--gitlab-ci",
                "--github-event",
                str(event),
                env={
                    "CI_PIPELINE_SOURCE": "merge_request_event",
                    "CI_MERGE_REQUEST_IID": "12",
                },
            )[0],
            1,
        )

    def test_github_requires_exactly_one_actor_and_valid_event_shapes(self) -> None:
        for changes in (
            {"labels": []},
            {"labels": [{"name": "Bits AI"}]},
            {"labels": [{"name": "actor:agent"}, {"name": "actor:human"}]},
            {"labels": ["actor:agent"]},
            {"labels": "actor:agent"},
            {"head": {}},
            {"base": {}},
            {"number": "64"},
        ):
            with self.subTest(changes=changes):
                event = self.github_event(**changes)
                self.assertEqual(self.run_gate("--github-event", str(event))[0], 1)

    def test_explicit_missing_or_malformed_event_is_a_failed_gate(self) -> None:
        event = self.root / "missing.json"
        self.assertEqual(self.run_gate("--github-event", str(event))[0], 1)
        for raw in ("invalid JSON", "[]", "{}", '{"pull_request": []}'):
            event = self.write("review.json", raw)
            self.assertEqual(self.run_gate("--github-event", str(event))[0], 1)

    def test_boundary_failures_remain_blocking_with_valid_actor(self) -> None:
        self.write("private/source.txt", "Private path fixture\n")
        self.write("credentials.json", "{}\n")
        self.write("docs/public.txt", "sk-" + "q" * 32)
        with patch.object(
            boundary,
            "git_files",
            return_value=["private/source.txt", "credentials.json", "docs/public.txt"],
        ):
            code, report = self.run_gate(
                "--gitlab-ci",
                env={
                    "CI_PIPELINE_SOURCE": "merge_request_event",
                    "CI_MERGE_REQUEST_IID": "12",
                    "CI_MERGE_REQUEST_LABELS": "actor:agent",
                },
            )
        self.assertEqual(code, 1)
        self.assertEqual(
            {item["type"] for item in report["failures"]},
            {"forbidden_path", "forbidden_filename", "secret_like_literal"},
        )


if __name__ == "__main__":
    unittest.main()
