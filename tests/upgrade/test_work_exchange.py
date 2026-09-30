# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_work_exchange.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     scripts/ci/candidate_manifest.py, scripts/ci/evidence_epoch.py, libs/evolution/work_exchange.py, tests/upgrade/test_work_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/candidate_manifest.py; VALIDATES scripts/ci/evidence_epoch.py; VALIDATES libs/evolution/work_exchange.py; CONSUMES tests/upgrade/test_work_support.py
# Intent:      Prevent wrong-candidate evidence and verify portable result integrity, epoch continuity and non-inflating worker history.
# ───────────────────────────────────────────────────────────────

"""Exercise candidate identity with offline, explicitly synthetic revisions."""

import contextlib
from dataclasses import replace
import hashlib
import io
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from libs.evolution.work import CodeHostIdentity, WorkContract, WorkSource
from libs.evolution.work_exchange import (
    ExperienceInput,
    MAX_CONTRACT_BYTES,
    candidate_paths,
    evidence_bytes,
    load_contract,
    read_bundle,
    worker_experience,
    write_bundle,
)
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from scripts.ci import candidate_manifest, evidence_epoch
from tests.upgrade.test_work_support import (
    ACTOR,
    CANDIDATE,
    NOW,
    at,
    manifest_bytes,
    pinned_review,
    submission,
    work,
)

ROOT = Path(__file__).resolve().parents[2]


class CandidateContinuityTests(unittest.TestCase):
    def test_candidate_provenance_refuses_a_different_ci_revision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with (
                patch.dict(os.environ, {"GITHUB_SHA": "b" * 40}, clear=True),
                patch.object(candidate_manifest, "git", side_effect=["a" * 40, ""]),
                patch("sys.argv", ["candidate_manifest", "--root", directory]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(candidate_manifest.main(), 1)
            self.assertFalse(
                (Path(directory) / "BUILDANDDO_CANDIDATE_PROVENANCE.json").exists()
            )

    def test_epoch_refuses_to_label_checkout_bytes_as_another_ci_revision(self) -> None:
        with (
            patch.dict(os.environ, {"GITHUB_SHA": "b" * 40}, clear=True),
            patch.object(evidence_epoch, "git", return_value="a" * 40),
        ):
            with self.assertRaisesRegex(ValueError, "candidate|revision|checkout"):
                evidence_epoch.git_facts(Path("."))

    def test_candidate_work_paths_use_actual_local_git_objects(self) -> None:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        selected = work(source=WorkSource("fixture/public", sha))
        self.assertEqual(candidate_paths(ROOT, selected, sha, "fixture/public"), ())
        with self.assertRaises(ContractError):
            candidate_paths(ROOT, selected, sha, "another/public")
        with self.assertRaises(ContractError):
            candidate_paths(ROOT, selected, "0" * 40, "fixture/public")

    def test_candidate_work_failures_leave_no_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            contract = root / "work.json"
            contract.write_text(work().to_json())
            cases = (
                (
                    ["--repository", "wrong/public"],
                    {"GITHUB_REPOSITORY": "fixture/public"},
                    "",
                ),
                (["--work", str(contract)], {}, ""),
                (
                    ["--work", str(contract), "--repository", "fixture/public"],
                    {},
                    "changed.py",
                ),
            )
            for args, environment, dirty in cases:
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch.object(
                        candidate_manifest,
                        "git",
                        side_effect=lambda _, *a: CANDIDATE
                        if a[0] == "rev-parse"
                        else dirty,
                    ),
                    patch(
                        "libs.evolution.work_exchange.candidate_paths", return_value=()
                    ),
                    patch(
                        "sys.argv", ["candidate_manifest", "--root", directory, *args]
                    ),
                    contextlib.redirect_stdout(io.StringIO()),
                ):
                    self.assertEqual(candidate_manifest.main(), 1)
                self.assertFalse(
                    (root / "BUILDANDDO_CANDIDATE_PROVENANCE.json").exists()
                )


class WorkFixture:
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.evidence = self.root / "source"
        self.value = submission(self.evidence)

    def bundle(self, name="bundle", value=None, **changes):
        options = dict(candidate=CANDIDATE, evidence_root=self.evidence, at=NOW)
        options.update(changes)
        return write_bundle(self.root / name, value or self.value, **options)


class BundleTests(WorkFixture, unittest.TestCase):
    def test_bundle_round_trips_exact_artifacts_and_optional_untrusted_review(
        self,
    ) -> None:
        receipt, _ = pinned_review(self.value)
        written = self.bundle(verification=receipt)
        loaded = read_bundle(self.root / "bundle")
        self.assertEqual(loaded, written)
        self.assertEqual(
            loaded.files["evidence/tests.txt"],
            (self.evidence / "tests.txt").read_bytes(),
        )
        with self.assertRaises(ContractError):
            self.bundle()
        with self.assertRaises(TypeError):
            loaded.files["extra"] = b"no"

    def test_changed_missing_empty_and_size_mismatched_evidence_fails_before_output(
        self,
    ) -> None:
        for content in (b"tampered source\n", b"", b"x" * 100):
            (self.evidence / "tests.txt").write_bytes(content)
            with self.assertRaises(ContractError):
                self.bundle()
            self.assertFalse((self.root / "bundle").exists())
        (self.evidence / "tests.txt").unlink()
        with self.assertRaises(ContractError):
            self.bundle()

    def test_same_length_tamper_is_detected_by_digest(self) -> None:
        source = self.evidence / "tests.txt"
        source.write_bytes(b"x" * source.stat().st_size)
        with self.assertRaisesRegex(ContractError, "digest"):
            evidence_bytes(self.value.result, self.evidence)

    def test_private_or_unreferenced_neighbor_files_never_enter_a_bundle(self) -> None:
        (self.evidence / "unselected.txt").write_text("not selected")
        self.bundle()
        self.assertFalse((self.root / "bundle/evidence/unselected.txt").exists())
        (self.root / "bundle/extra.txt").write_text("unexpected")
        with self.assertRaisesRegex(ContractError, "unreferenced"):
            read_bundle(self.root / "bundle")

    def test_file_directory_root_and_optional_review_symlinks_are_rejected(
        self,
    ) -> None:
        source = self.evidence / "tests.txt"
        original = source.read_bytes()
        outside = self.root / "external.txt"
        outside.write_bytes(original)
        source.unlink()
        source.symlink_to(outside)
        with self.assertRaisesRegex(ContractError, "symlink"):
            self.bundle()
        source.unlink()
        source.write_bytes(original)
        self.bundle()
        (self.root / "alias").symlink_to(self.root / "bundle", target_is_directory=True)
        with self.assertRaisesRegex(ContractError, "symlink"):
            read_bundle(self.root / "alias")
        (self.root / "bundle/verification.json").symlink_to(
            self.root / "missing-review"
        )
        with self.assertRaisesRegex(ContractError, "symlink"):
            read_bundle(self.root / "bundle")

    def test_duplicate_json_keys_unknown_fields_and_oversize_inputs_are_rejected(
        self,
    ) -> None:
        self.bundle()
        target = self.root / "bundle/work.json"
        for raw in (
            b'{"schema":"buildanddo.work/v1","schema":"buildanddo.work/v1"}',
            b"[" * 1500 + b"]" * 1500,
            b"x" * (MAX_CONTRACT_BYTES + 1),
        ):
            target.write_bytes(raw)
            with self.assertRaises(ContractError):
                read_bundle(self.root / "bundle")
        target.write_text(self.value.work.to_json())
        self.assertEqual(load_contract(target, WorkContract), self.value.work)

    def test_candidate_commit_evidence_must_retain_matching_provenance(self) -> None:
        variants = (
            {"schema_version": True},
            {"authority": "production"},
            {"production_authority": True},
            {"upstream_repository": "other/public"},
            {"upstream_sha": "c" * 40},
            {"mirror_commit_before_provenance": "c" * 40},
            {"generated_at": at(50).isoformat()},
            {"tracked_files": "not an inventory"},
            {
                "work_contract": {
                    "schema": "buildanddo.work/v1",
                    "work_digest": "c" * 64,
                }
            },
        )
        for changes in variants:
            with self.subTest(changes=changes):
                raw = manifest_bytes(self.value.work, **changes)
                (self.evidence / "candidate.json").write_bytes(raw)
                result = replace(
                    self.value.result,
                    evidence=(
                        replace(
                            self.value.result.evidence[0],
                            sha256=hashlib.sha256(raw).hexdigest(),
                            size=len(raw),
                        ),
                        *self.value.result.evidence[1:],
                    ),
                )
                with self.assertRaises(ContractError):
                    self.bundle(value=replace(self.value, result=result))

    def test_foreign_verification_cannot_be_packaged(self) -> None:
        changed = replace(
            self.value, result=replace(self.value.result, attempt_id="different")
        )
        receipt, _ = pinned_review(changed)
        with self.assertRaises(ContractError):
            self.bundle(verification=receipt)

    def test_invalid_candidate_or_future_result_is_rejected_before_writes(self) -> None:
        for changes in ({"candidate": "c" * 40}, {"at": at(2)}):
            with self.assertRaises(ContractError):
                self.bundle(**changes)
        self.assertFalse((self.root / "bundle").exists())


class ConnectedEpochTests(WorkFixture, unittest.TestCase):
    def epoch(self, **changes):
        options = dict(work_bundles=("bundle",), repository="fixture/public")
        options.update(changes)
        git_meta = {
            "sha": CANDIDATE,
            "branch": "fixture",
            "author": "synthetic",
            "committer": "synthetic",
            "subject": "synthetic work",
            "committed_at": at(0).isoformat(),
        }

        def checked_paths(root, work, candidate, repository):
            if repository != work.source.repository:
                raise ContractError("repository mismatch")
            work.require_paths(self.value.result.changed_paths)
            return self.value.result.changed_paths

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(evidence_epoch, "git_facts", return_value=git_meta),
            patch(
                "libs.evolution.work_exchange.candidate_paths",
                side_effect=checked_paths,
            ),
        ):
            return evidence_epoch.build_manifest(self.root, "local", {}, NOW, **options)

    def test_actual_candidate_producer_result_and_epoch_are_connected(self) -> None:
        contract = self.root / "selected-work.json"
        contract.write_text(self.value.work.to_json())
        (self.root / "module.py").write_text("# synthetic source\n")
        output = self.evidence / "candidate.json"
        with (
            patch.dict(os.environ, {"GITHUB_SHA": CANDIDATE}, clear=True),
            patch.object(
                candidate_manifest,
                "git",
                side_effect=lambda _, *a: CANDIDATE
                if a[0] == "rev-parse"
                else ("module.py" if a[0] == "ls-files" else ""),
            ),
            patch(
                "libs.evolution.work_exchange.candidate_paths",
                return_value=self.value.result.changed_paths,
            ),
            patch.object(
                candidate_manifest,
                "dt",
                SimpleNamespace(
                    datetime=SimpleNamespace(now=lambda _: at(5)),
                    timezone=SimpleNamespace(utc=None),
                ),
            ),
            patch(
                "sys.argv",
                [
                    "candidate_manifest",
                    "--root",
                    str(self.root),
                    "--output",
                    str(output),
                    "--work",
                    str(contract),
                    "--repository",
                    "fixture/public",
                ],
            ),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(candidate_manifest.main(), 0)
        raw = output.read_bytes()
        self.value = replace(
            self.value,
            result=replace(
                self.value.result,
                evidence=(
                    replace(
                        self.value.result.evidence[0],
                        sha256=hashlib.sha256(raw).hexdigest(),
                        size=len(raw),
                    ),
                    *self.value.result.evidence[1:],
                ),
            ),
        )
        self.bundle()
        manifest = self.epoch()
        self.assertEqual(
            manifest["work_results"][0]["verification"], "not_conferred_by_epoch"
        )
        self.assertEqual(
            manifest["work_results"][0]["result_digest"], self.value.result.digest
        )
        self.assertEqual(manifest["anchor"]["state"], "pending")
        self.assertEqual(
            evidence_epoch.verify_manifest(manifest, self.root, True)["state"], "PASS"
        )
        (self.root / "bundle/evidence/tests.txt").write_text("altered\n")
        self.assertEqual(
            evidence_epoch.verify_manifest(manifest, self.root, True)["state"], "FAIL"
        )

    def test_epoch_preserves_existing_root_algorithm_and_chains_result_bytes(
        self,
    ) -> None:
        self.bundle()
        manifest = self.epoch()
        again = self.epoch()
        self.assertEqual(manifest, again)
        self.assertEqual(
            manifest["root_digest"], evidence_epoch.root_of(manifest["artifacts"])
        )
        before = self.epoch(work_bundles=())
        self.assertNotEqual(before["root_digest"], manifest["root_digest"])
        self.assertNotIn("work_results", before)
        chain = evidence_epoch.append_chain({}, manifest)
        self.assertEqual(chain["latest"]["git_sha"], CANDIDATE)

    def test_epoch_denies_wrong_candidate_repository_unlisted_changes_and_duplicate_attempts(
        self,
    ) -> None:
        self.bundle()
        for changes in (
            {"repository": None},
            {"repository": "other/public"},
            {"work_bundles": ("../escape",)},
            {"work_bundles": ("bundle", "bundle")},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                self.epoch(**changes)
        self.bundle("duplicate")
        with self.assertRaisesRegex(ContractError, "duplicate work attempt"):
            self.epoch(work_bundles=("bundle", "duplicate"))
        wrong = replace(
            self.value,
            result=replace(
                self.value.result,
                candidate_revision="c" * 40,
                evidence=(),
                checks=(),
                status="HOLD",
            ),
        )
        self.bundle("wrong", wrong, candidate="c" * 40)
        with self.assertRaisesRegex(ContractError, "another candidate"):
            self.epoch(work_bundles=("wrong",))
        omitted = replace(
            self.value, result=replace(self.value.result, changed_paths=())
        )
        self.bundle("omitted", omitted)
        with self.assertRaisesRegex(ContractError, "omits"):
            self.epoch(work_bundles=("omitted",))


class ExperienceTests(WorkFixture, unittest.TestCase):
    def summarize(self, *names, policy=None):
        return worker_experience(
            tuple(
                ExperienceInput(self.root / name, self.value.work, CANDIDATE)
                for name in names
            ),
            worker=ACTOR,
            at=NOW,
            policy=policy,
        )

    def test_history_deduplicates_attempts_and_only_counts_separately_pinned_passes(
        self,
    ) -> None:
        receipt, policy = pinned_review(self.value)
        self.bundle(verification=receipt)
        plain = self.summarize("bundle", "bundle")
        self.assertEqual(plain["attempts"], 1)
        self.assertEqual(plain["historical_reviewed_passes"], 0)
        reviewed = self.summarize("bundle", policy=policy)
        self.assertEqual(reviewed["historical_reviewed_passes"], 1)
        self.assertEqual(reviewed["identity_status"], "declared")
        self.assertFalse(reviewed["production_authority"])

    def test_later_review_of_identical_result_is_independent_of_import_order(
        self,
    ) -> None:
        receipt, policy = pinned_review(self.value)
        self.bundle("reported")
        self.bundle("reviewed", verification=receipt)
        forward = self.summarize("reported", "reviewed", policy=policy)
        reverse = self.summarize("reviewed", "reported", policy=policy)
        self.assertEqual(forward, reverse)
        self.assertEqual(forward["attempts"], 1)
        self.assertEqual(forward["historical_reviewed_passes"], 1)

    def test_history_retains_failure_cancellation_rollback_and_scope_separation(
        self,
    ) -> None:
        for name, status in (
            ("fail", "FAIL"),
            ("cancel", "CANCELLED"),
            ("rollback", "ROLLED_BACK"),
            ("hold", "HOLD"),
        ):
            self.bundle(
                name,
                replace(
                    self.value,
                    result=replace(self.value.result, attempt_id=name, status=status),
                ),
            )
        history = self.summarize("fail", "cancel", "rollback", "hold")
        self.assertEqual(history["attempts"], 4)
        self.assertEqual(
            history["reported_outcomes"],
            {"PASS": 0, "FAIL": 1, "CANCELLED": 1, "ROLLED_BACK": 1, "HOLD": 1},
        )
        with self.assertRaises(ContractError):
            worker_experience(
                (ExperienceInput(self.root / "fail", self.value.work, CANDIDATE),),
                worker=SemanticId("cni://agent/foreign"),
                at=NOW,
            )

    def test_conflicting_retry_or_stable_provider_identity_cannot_inflate_history(
        self,
    ) -> None:
        self.bundle()
        self.bundle(
            "conflict",
            replace(self.value, result=replace(self.value.result, status="FAIL")),
        )
        with self.assertRaisesRegex(ContractError, "conflicting result"):
            self.summarize("bundle", "conflict")
        worker = replace(
            self.value.result.worker,
            accounts=(CodeHostIdentity("github", "789", "other-account"),),
        )
        self.bundle(
            "identity",
            replace(
                self.value,
                result=replace(self.value.result, attempt_id="other", worker=worker),
            ),
        )
        with self.assertRaisesRegex(ContractError, "identity conflicts"):
            self.summarize("bundle", "identity")


if __name__ == "__main__":
    unittest.main()
