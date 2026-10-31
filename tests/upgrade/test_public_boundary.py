# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_public_boundary.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/verify_public_boundary.py, .buildanddo/public/path-policy.json, scripts/ci/lesson_keys.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/verify_public_boundary.py; VALIDATES .buildanddo/public/path-policy.json
# Intent:      Keep review attribution mandatory after CI migration and reject foreign or missing review evidence without weakening public boundary checks,
#              and prove the answer-key and private-key-file rules fail on a real temporary git repository.
# ───────────────────────────────────────────────────────────────

"""Exercise the real boundary entry point with local files and provider fixtures."""

from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from scripts.ci import lesson_keys
from scripts.ci import verify_public_boundary as boundary

SHA = "a" * 40
REPO = Path(__file__).resolve().parents[2]
POLICY = ".buildanddo/public/path-policy.json"
DATA_DIR = "apps/pocketbase/pb_migrations/data"


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

    def test_public_main_mirror_is_treated_as_the_default_branch(self) -> None:
        code, report = self.run_gate(
            "--gitlab-ci",
            env={
                "CI_PIPELINE_SOURCE": "push",
                "CI_COMMIT_BRANCH": boundary.PUBLIC_MAIN_MIRROR,
                "CI_DEFAULT_BRANCH": "main",
            },
        )
        self.assertEqual(code, 0)
        self.assertEqual(report["actor"]["status"], "NOT_APPLICABLE")

    def test_review_branch_requires_and_accepts_the_bound_pull_request_export(self) -> None:
        env = {
            "CI_PIPELINE_SOURCE": "push",
            "CI_COMMIT_BRANCH": "review/pr-64",
            "CI_DEFAULT_BRANCH": "main",
        }
        self.assertEqual(self.run_gate("--gitlab-ci", env=env)[0], 1)
        event = self.github_event()
        code, report = self.run_gate(
            "--gitlab-ci", env={**env, "BUILDANDDO_GITHUB_PR_EVENT": str(event)}
        )
        self.assertEqual(code, 0)
        self.assertEqual(report["actor"]["actor_label"], "actor:agent")
        moved = self.github_event(head={"sha": "b" * 40})
        self.assertEqual(
            self.run_gate(
                "--gitlab-ci", env={**env, "BUILDANDDO_GITHUB_PR_EVENT": str(moved)}
            )[0],
            1,
        )

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


def by_path(item: dict) -> str:
    return item["path"]


def git_env() -> dict[str, str]:
    """The caller's environment without GIT_* overrides, so git acts on the temp repo."""
    return {name: value for name, value in os.environ.items() if not name.startswith("GIT_")}


class CurriculumKeyBoundaryTests(unittest.TestCase):
    """The answer-key and key-file rules on a real temporary git repository.

    Every key here is made up or synthetic and generated at test time. Key text is
    compared without being printed, and failures must carry only path and slug.
    """

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="boundary-keys-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        subprocess.run(
            ["git", "-C", str(self.root), "init", "-q"],
            check=True,
            capture_output=True,
            env=git_env(),
        )
        # The shipped policy, so these tests also prove it turns the rules on.
        self.policy = json.loads((REPO / POLICY).read_text(encoding="utf-8"))
        self.track(POLICY, json.dumps(self.policy))
        self.track("docs/public.txt", "Public fixture\n")
        self.explanation = "Made-up boundary explanation " + secrets.token_hex(8)

    def track(self, name: str, content: str | bytes) -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")
        self.add(name)
        return path

    def add(self, name: str) -> None:
        subprocess.run(
            ["git", "-C", str(self.root), "add", "--", name],
            check=True,
            capture_output=True,
            env=git_env(),
        )

    def run_gate(self) -> tuple[int, dict, str]:
        """Run the real entry point; return its code, report and every byte it emitted."""
        stdout = io.StringIO()
        environment = {"PATH": os.environ.get("PATH", os.defpath)}
        with (
            patch.dict(boundary.os.environ, environment, clear=True),
            redirect_stdout(stdout),
        ):
            code = boundary.main(["--root", str(self.root)])
        text = (self.root / ".buildanddo/public/boundary-report.json").read_text()
        return code, json.loads(text), stdout.getvalue() + text

    def failures(self, report: dict, kind: str) -> list[dict]:
        return [item for item in report["failures"] if item["type"] == kind]

    def assert_no_key_text(self, output: str, *extra: str) -> None:
        for value in (self.explanation, lesson_keys.SYNTHETIC_PREFIX, *extra):
            self.assertFalse(value in output, "the boundary output carries key or data text")

    def curriculum(self, slug: object = "boundary-fixture", **members: object) -> str:
        check = {
            "question": "Which fixture choice is marked?",
            "choices": ["First", "Second", "Third"],
            **members,
        }
        lesson = {"id": "fixture00000001", "slug": slug, "lesson": {"schema_version": 1, "check": check}}
        return json.dumps({"version": "fixture-1", "lessons": [lesson]}, indent=2) + "\n"

    def key_document(self, salt: str, **changes: object) -> dict:
        document = lesson_keys.synthetic_document(REPO, salt)
        document.update(changes)
        return document

    def test_shipped_policy_activates_both_rules(self) -> None:
        self.assertEqual(self.policy["curriculum_data_globs"], [f"{DATA_DIR}/*.json"])
        self.assertEqual(
            tuple(self.policy["curriculum_data_globs"]), boundary.CURRICULUM_DATA_GLOBS
        )
        self.assertEqual(self.policy["private_key_schema"], lesson_keys.SCHEMA)
        self.assertEqual(boundary.PRIVATE_KEY_SCHEMA, lesson_keys.SCHEMA)
        self.assertIn("lesson-keys.json", self.policy["forbidden_file_names"])
        code, report, _ = self.run_gate()
        self.assertEqual((code, report["state"]), (0, "PASS"))

    def test_keyed_data_file_fails_with_path_and_slug_only(self) -> None:
        name = f"{DATA_DIR}/fixture-lessons.json"
        for members in (
            {"answer": 1, "explanation": self.explanation},
            {"answer": 2},
            {"explanation": self.explanation},
        ):
            with self.subTest(members=sorted(members)):
                self.track(name, self.curriculum(**members))
                code, report, output = self.run_gate()
                self.assertEqual(code, 1)
                self.assertEqual(
                    report["failures"],
                    [{"type": "curriculum_answer_key", "path": name, "slug": "boundary-fixture"}],
                )
                self.assert_no_key_text(output)

    def test_checks_without_choices_nested_checks_and_bad_slugs_fail(self) -> None:
        leaky = "Leaky-" + secrets.token_hex(6)
        self.track(
            f"{DATA_DIR}/check-only.json",
            json.dumps({"lessons": [{"slug": "check-only", "lesson": {"check": {"question": "Q", "answer": 0}}}]}),
        )
        self.track(
            f"{DATA_DIR}/nested.json",
            json.dumps({"groups": [[{"choices": "not a list", "explanation": self.explanation}]]}),
        )
        self.track(f"{DATA_DIR}/bad-slug.json", self.curriculum(slug=leaky, answer=0))
        self.track(f"{DATA_DIR}/long-slug.json", self.curriculum(slug="a" * 81, answer=0))
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        found = {(item["path"], item["slug"]) for item in self.failures(report, "curriculum_answer_key")}
        self.assertEqual(
            found,
            {
                (f"{DATA_DIR}/check-only.json", "check-only"),
                (f"{DATA_DIR}/nested.json", None),
                (f"{DATA_DIR}/bad-slug.json", "<invalid slug>"),
                (f"{DATA_DIR}/long-slug.json", "<invalid slug>"),
            },
        )
        self.assert_no_key_text(output, leaky, "a" * 81)

    def test_stripped_unrelated_and_out_of_scope_files_pass(self) -> None:
        self.track(f"{DATA_DIR}/fixture-lessons.json", self.curriculum())
        # An answer outside any knowledge check is not a key.
        self.track(f"{DATA_DIR}/faq.json", json.dumps({"faq": [{"question": "Q", "answer": "A"}]}))
        # The rule covers the curriculum data files the policy names.
        self.track("docs/notes.json", self.curriculum(answer=1, explanation=self.explanation))
        code, report, output = self.run_gate()
        self.assertEqual((code, report["failures"]), (0, []))
        self.assert_no_key_text(output)

    def test_unreadable_or_unparseable_data_file_fails_closed(self) -> None:
        unparseable = {
            "invalid.json": b'{"lessons": [',
            "repeated.json": b'{"choices": ["a"], "answer": 1, "choices": "x"}',
            "constant.json": b'{"choices": ["a"], "weight": NaN}',
            "bom.json": b"\xef\xbb\xbf" + self.curriculum().encode(),
            "bytes.json": b'{"choices": ["\xff"]}',
            "deep.json": b"[" * 100_000 + b"]" * 100_000,
        }
        for name, raw in unparseable.items():
            self.track(f"{DATA_DIR}/{name}", raw)
        removed = self.track(f"{DATA_DIR}/removed.json", self.curriculum())
        removed.unlink()
        outside = self.root.parent / f"{self.root.name}-outside.json"
        outside.write_text(self.curriculum())
        self.addCleanup(outside.unlink)
        os.symlink(outside, self.root / DATA_DIR / "linked.json")
        self.add(f"{DATA_DIR}/linked.json")
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        expected = [
            {"type": "curriculum_answer_key", "path": f"{DATA_DIR}/{name}", "slug": None, "reason": reason}
            for name, reason in [
                *((name, "unparseable") for name in unparseable),
                ("removed.json", "unreadable"),
                ("linked.json", "unreadable"),
            ]
        ]
        self.assertEqual(
            sorted(self.failures(report, "curriculum_answer_key"), key=by_path),
            sorted(expected, key=by_path),
        )
        self.assert_no_key_text(output)

    def test_public_curricula_pass_and_fail_once_synthetic_keys_return(self) -> None:
        names = [f"{DATA_DIR}/{name}" for name in lesson_keys.CURRICULA]
        texts = {name: (REPO / name).read_text(encoding="utf-8") for name in names}
        for name, text in texts.items():
            self.track(name, text)
        code, report, _ = self.run_gate()
        self.assertEqual((code, report["failures"]), (0, []))
        # merge_text restores the exact pre-strip layout, here with synthetic keys.
        entries = self.key_document("boundary")["lessons"]
        expected = set()
        for name, text in texts.items():
            self.track(name, lesson_keys.merge_text(text, entries, name))
            expected |= {(name, lesson["slug"]) for lesson in json.loads(text)["lessons"]}
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        found = [(item["path"], item["slug"]) for item in report["failures"]]
        self.assertEqual(len(found), len(expected))
        self.assertEqual(set(found), expected)
        self.assertEqual(len(expected), len(entries))
        self.assert_no_key_text(output)

    def test_tracked_lesson_keys_json_fails_even_when_synthetic(self) -> None:
        synthetic = "docs/lesson-keys.json"
        private = "tests/fixtures/nested/lesson-keys.json"
        self.track(synthetic, json.dumps(self.key_document("named")))
        self.track(private, json.dumps(self.key_document("named", synthetic=False)))
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        self.assertEqual(
            sorted(item["path"] for item in self.failures(report, "forbidden_filename")),
            sorted([synthetic, private]),
        )
        self.assertEqual(
            self.failures(report, "private_lesson_keys"),
            [{"type": "private_lesson_keys", "path": private}],
        )
        self.assert_no_key_text(output)

    def test_renamed_non_synthetic_key_file_fails(self) -> None:
        marker = json.dumps(lesson_keys.SCHEMA)
        unlabelled = self.key_document("renamed")
        del unlabelled["synthetic"]
        variants: dict[str, str | bytes] = {
            "tests/fixtures/relabelled.json": json.dumps(self.key_document("renamed", synthetic=False)),
            "tests/fixtures/unlabelled.json": json.dumps(unlabelled),
            "tests/fixtures/string-flag.json": json.dumps(self.key_document("renamed", synthetic="true")),
            "tests/fixtures/number-flag.json": json.dumps(self.key_document("renamed", synthetic=1)),
            "tests/fixtures/made-up.json": json.dumps(
                {"schema_version": lesson_keys.SCHEMA, "synthetic": False,
                 "lessons": {"boundary-fixture": {"answer": 1, "explanation": self.explanation}}}
            ),
            "tests/fixtures/minimal.json": "{\"schema_version\": " + marker + "}",
            "tests/fixtures/repeated-flag.json": "{\"schema_version\": " + marker + ", \"synthetic\": true, \"synthetic\": false}",
            "tests/fixtures/repeated-schema.json": "{\"schema_version\": " + marker + ", \"schema_version\": \"other/1\"}",
            "tests/fixtures/bom.json": b"\xef\xbb\xbf" + json.dumps(self.key_document("renamed", synthetic=False)).encode(),
            "tests/fixtures/bytes.json": b'{"schema_version": ' + marker.encode() + b', "note": "\xff"}',
            "tests/fixtures/Upper-Case.JSON": json.dumps(self.key_document("renamed", synthetic=False)),
        }
        for name, content in variants.items():
            self.track(name, content)
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        self.assertEqual(
            sorted(self.failures(report, "private_lesson_keys"), key=by_path),
            sorted(({"type": "private_lesson_keys", "path": name} for name in variants), key=by_path),
        )
        self.assertEqual(len(report["failures"]), len(variants))
        self.assert_no_key_text(output)

    def test_synthetic_key_files_and_non_key_json_pass(self) -> None:
        with tempfile.TemporaryDirectory(prefix="boundary-synthetic-") as scratch:
            out = Path(scratch) / "keys.json"
            made = subprocess.run(
                [sys.executable, "-I", str(REPO / "scripts/ci/lesson_keys.py"), "synthetic", "--out", str(out)],
                capture_output=True,
                check=False,
                env=git_env(),
            )
            self.assertEqual(made.returncode, 0, "lesson_keys.py synthetic failed")
            self.track("tests/fixtures/synthetic-keys.json", out.read_bytes())
        self.track(
            "tests/fixtures/minimal-synthetic.json",
            json.dumps({"schema_version": lesson_keys.SCHEMA, "synthetic": True}),
        )
        self.track(
            "tests/fixtures/digests.json",
            json.dumps({"schema_version": lesson_keys.DIGEST_SCHEMA, "synthetic": False}),
        )
        self.track("tests/fixtures/commented.json", "// not JSON\n{\"schema_version\": \"x\"}\n")
        outside = self.root.parent / f"{self.root.name}-outside-keys.json"
        outside.write_text(json.dumps(self.key_document("linked", synthetic=False)))
        self.addCleanup(outside.unlink)
        os.symlink(outside, self.root / "tests/fixtures/linked-keys.json")
        self.add("tests/fixtures/linked-keys.json")
        code, report, output = self.run_gate()
        self.assertEqual((code, report["failures"]), (0, []))
        self.assert_no_key_text(output)

    def test_policy_defaults_keep_the_rules_and_malformed_fields_refuse(self) -> None:
        legacy = {key: value for key, value in self.policy.items()
                  if key not in {"curriculum_data_globs", "private_key_schema"}}
        self.track(POLICY, json.dumps(legacy))
        self.track(f"{DATA_DIR}/fixture-lessons.json", self.curriculum(answer=1))
        self.track("tests/fixtures/keys.json", json.dumps({"schema_version": lesson_keys.SCHEMA}))
        code, report, _ = self.run_gate()
        self.assertEqual(code, 1)
        self.assertEqual(
            sorted(item["type"] for item in report["failures"]),
            ["curriculum_answer_key", "private_lesson_keys"],
        )
        self.track(POLICY, json.dumps({**self.policy, "curriculum_data_globs": [f"{DATA_DIR}/*.json", "content/*.json"]}))
        self.track("content/extra.json", self.curriculum(explanation=self.explanation))
        code, report, output = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn(
            {"type": "curriculum_answer_key", "path": "content/extra.json", "slug": "boundary-fixture"},
            report["failures"],
        )
        self.assert_no_key_text(output)
        for changes in (
            {"private_key_schema": ""},
            {"private_key_schema": ["buildanddo.lesson-keys/1"]},
            {"curriculum_data_globs": f"{DATA_DIR}/*.json"},
            {"curriculum_data_globs": [1]},
        ):
            with self.subTest(changes=changes):
                self.track(POLICY, json.dumps({**self.policy, **changes}))
                with self.assertRaises(boundary.BoundaryError):
                    self.run_gate()


if __name__ == "__main__":
    unittest.main()
