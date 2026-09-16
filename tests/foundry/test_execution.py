# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/test_execution.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/execution.py, foundry/shared/federal_foundry/interfaces.py
# EnumType:    Test
# EnumEdges:   VALIDATES foundry/shared/federal_foundry/execution.py; VALIDATES foundry/shared/federal_foundry/interfaces.py
# DAG Node:    none
# Intent:      Prove the concrete runner preserves failed and cancelled attempts and rejects altered evidence before replay or promotion.
# ───────────────────────────────────────────────────────────────

"""Exercise real child processes, retained failures and replay integrity."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from foundry.shared.federal_foundry.execution import (
    LocalExperimentRunner,
    builtin_command,
    replay_run,
    verify_run,
)
from foundry.shared.federal_foundry.interfaces import ExperimentRunner, ExperimentSpec
from foundry.shared.federal_foundry.models import FoundryValidationError
from foundry.shared.federal_foundry.validation import canonical, digest
from tests.foundry.test_foundry import ROOT
from tests.foundry.test_workloads import fixture


SUCCESS = "from pathlib import Path; Path('measurement.json').write_text('{\"metrics\":{\"value\":7}}')"


def command_spec(
    code: str, *, inputs: dict | None = None, arguments: tuple = ()
) -> ExperimentSpec:
    """Describe an explicitly reviewed child command for local process tests."""
    return ExperimentSpec(
        "test-attempt",
        (sys.executable, "-c", code, *arguments),
        17,
        inputs or {},
        ("measurement.json",),
    )


class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_argv_can_contain_repeated_arguments(self) -> None:
        code = "import json,sys; from pathlib import Path; Path('measurement.json').write_text(json.dumps({'metrics': {'copies': sys.argv[1:].count('same')}}))"
        output = self.parent / "repeated-args"
        result = await self.runner.run(
            command_spec(code, arguments=("same", "same")), output
        )
        self.assertEqual(result.metrics, {"copies": 2})
        self.assertEqual(verify_run(output, ROOT)["status"], "succeeded")

    async def asyncSetUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.runner = LocalExperimentRunner(ROOT, timeout_seconds=5)

    async def test_real_child_retains_input_logs_metrics_and_matching_artifacts(
        self,
    ) -> None:
        output = self.parent / "run"
        spec = command_spec(
            SUCCESS + "; print('completed')", inputs={"purpose": "fixture"}
        )
        self.assertIsInstance(self.runner, ExperimentRunner)
        result = await self.runner.run(spec, output)
        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.metrics, {"value": 7})
        self.assertEqual(result.artifacts[0].state, "observed")
        self.assertEqual(
            result.artifacts[0].digest,
            digest((output / "measurement.json").read_bytes()),
        )
        self.assertEqual(
            json.loads((output / "input.json").read_text()), {"purpose": "fixture"}
        )
        self.assertEqual((output / "stdout.log").read_text(), "completed\n")
        receipt = verify_run(output, ROOT)
        self.assertEqual(receipt["returncode"], 0)
        self.assertGreater(receipt["elapsed_ms"], 0)
        self.assertEqual(len(receipt["computational_sha256"]), 64)
        with self.assertRaisesRegex(FoundryValidationError, "already exists"):
            await self.runner.run(spec, output)

    async def test_child_does_not_expand_shell_arguments_or_inherit_parent_binding(
        self,
    ) -> None:
        literal = "; ignored shell text | is data"
        code = "import os, sys, json; from pathlib import Path; Path('measurement.json').write_text(json.dumps({'metrics':{'literal':int(sys.argv[1] == '; ignored shell text | is data'),'inherited':int('FOUNDRY_PARENT_TEST_MARKER' in os.environ)}}))"
        with patch.dict(os.environ, {"FOUNDRY_PARENT_TEST_MARKER": "test-only"}):
            result = await self.runner.run(
                command_spec(code, arguments=(literal,)), self.parent / "environment"
            )
        self.assertEqual(result.metrics, {"literal": 1, "inherited": 0})

    async def test_nonzero_exit_missing_output_and_unavailable_process_are_failed_receipts(
        self,
    ) -> None:
        specs = [
            (
                command_spec(
                    "import sys; print('failure', file=sys.stderr); sys.exit(7)"
                ),
                "nonzero_exit",
            ),
            (command_spec("print('no measurement')"), "missing"),
            (
                ExperimentSpec(
                    "absent",
                    (str(self.parent / "no-executable"),),
                    17,
                    {},
                    ("measurement.json",),
                ),
                "process_unavailable",
            ),
        ]
        for index, (spec, reason) in enumerate(specs):
            output = self.parent / str(index)
            result = await self.runner.run(spec, output)
            self.assertEqual(result.status, "failed")
            self.assertIn(reason, result.notes)
            self.assertEqual(result.metrics, {})
            self.assertFalse(result.artifacts)
            receipt = verify_run(output, ROOT)
            self.assertIsNone(receipt["computational_sha256"])

    async def test_timeout_terminates_the_process_and_retains_failure(self) -> None:
        runner = LocalExperimentRunner(ROOT, timeout_seconds=0.1)
        result = await runner.run(
            command_spec("import time; time.sleep(5)"), self.parent / "timeout"
        )
        self.assertEqual(result.status, "failed")
        self.assertEqual(result.notes, "timeout")
        receipt = verify_run(self.parent / "timeout", ROOT)
        self.assertNotEqual(receipt["returncode"], 0)
        self.assertLess(receipt["elapsed_ms"], 3000)

    async def test_output_limit_stops_both_streams_at_the_declared_bound(self) -> None:
        runner = LocalExperimentRunner(ROOT, log_limit=256)
        code = "import sys; sys.stdout.write('x' * 10000); sys.stdout.flush(); sys.stderr.write('y' * 10000); sys.stderr.flush()"
        result = await runner.run(command_spec(code), self.parent / "noisy")
        self.assertEqual(result.status, "failed")
        self.assertIn("output_limit", result.notes)
        self.assertLessEqual((self.parent / "noisy/stdout.log").stat().st_size, 256)
        self.assertLessEqual((self.parent / "noisy/stderr.log").stat().st_size, 256)
        verify_run(self.parent / "noisy", ROOT)

    async def test_cancellation_waits_for_child_cleanup_and_records_cancelled_state(
        self,
    ) -> None:
        output = self.parent / "cancelled"
        task = asyncio.create_task(
            self.runner.run(command_spec("import time; time.sleep(5)"), output)
        )
        for _ in range(100):
            if (output / "request.json").is_file():
                break
            await asyncio.sleep(0.01)
        await asyncio.sleep(0.03)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        receipt = verify_run(output, ROOT)
        self.assertEqual(receipt["status"], "cancelled")
        self.assertEqual(receipt["reason"], "caller_cancelled")
        self.assertIsNone(receipt["computational_sha256"])

    async def test_child_cannot_promote_a_changed_input_or_foreign_measurement(
        self,
    ) -> None:
        cases = [
            (
                SUCCESS + "; Path('input.json').write_text('{}')",
                {"expected": "frozen"},
                "frozen_input_changed",
            ),
            (
                'from pathlib import Path; Path(\'measurement.json\').write_text(\'{"metrics":{"score":1},"lane_id":"wrong"}\')',
                {"lane_id": "expected"},
                "lane_id",
            ),
            (
                'from pathlib import Path; Path(\'measurement.json\').write_text(\'{"metrics":{"score":1},"seed":99}\')',
                {},
                "seed",
            ),
            (
                "from pathlib import Path; Path('measurement.json').write_text('{\"metrics\":{\"score\":true}}')",
                {},
                "finite",
            ),
            (
                "from pathlib import Path; Path('measurement.json').write_text('{\"metrics\":{}}')",
                {},
                "empty",
            ),
            (
                'from pathlib import Path; Path(\'measurement.json\').write_text(\'{"metrics":{"score":1},"resources":{"elapsed_ms":-1,"peak_python_bytes":0}}\')',
                {},
                "negative",
            ),
        ]
        for index, (code, inputs, expected) in enumerate(cases):
            result = await self.runner.run(
                command_spec(code, inputs=inputs), self.parent / f"invalid-{index}"
            )
            self.assertEqual(result.status, "failed")
            self.assertIn(expected, result.notes)
            self.assertFalse(result.artifacts)

    async def test_path_and_resource_bounds_fail_before_execution(self) -> None:
        for kwargs in (
            {"timeout_seconds": 0},
            {"timeout_seconds": 301},
            {"log_limit": 100},
        ):
            with self.assertRaises(FoundryValidationError):
                LocalExperimentRunner(ROOT, **kwargs)
        for artifacts in ((), ("input.json",), ("../measurement.json",)):
            with self.assertRaises(FoundryValidationError):
                await self.runner.run(
                    ExperimentSpec("x", (sys.executable,), 1, {}, artifacts),
                    self.parent / "invalid",
                )
        with self.assertRaises(FoundryValidationError):
            await self.runner.run(
                command_spec(SUCCESS), ROOT / "foundry" / "forbidden-run"
            )
        linked = self.parent / "linked"
        linked.symlink_to(self.parent, target_is_directory=True)
        with self.assertRaises(FoundryValidationError):
            await self.runner.run(command_spec(SUCCESS), linked / "run")
        self.assertFalse((self.parent / "invalid").exists())

    async def test_symlink_artifact_fails_closed_without_reading_its_target(
        self,
    ) -> None:
        target = self.parent / "outside.json"
        target.write_text('{"metrics":{"private":1}}')
        code = "from pathlib import Path; import sys; Path('measurement.json').symlink_to(sys.argv[1])"
        result = await self.runner.run(
            command_spec(code, arguments=(str(target),)), self.parent / "linked-output"
        )
        self.assertEqual(result.status, "failed")
        self.assertFalse(result.artifacts)
        with self.assertRaises(FoundryValidationError):
            verify_run(self.parent / "linked-output", ROOT)
        self.assertEqual(target.read_text(), '{"metrics":{"private":1}}')

    async def test_verifier_rejects_tamper_even_if_a_receipt_file_digest_is_recomputed(
        self,
    ) -> None:
        output = self.parent / "checked"
        await self.runner.run(command_spec(SUCCESS), output)
        path = output / "measurement.json"
        path.write_bytes(b'{"metrics":{"value":99}}\n')
        with self.assertRaisesRegex(FoundryValidationError, "changed"):
            verify_run(output, ROOT)
        receipt_path = output / "receipt.json"
        receipt = json.loads(receipt_path.read_text())
        receipt["artifacts"]["measurement.json"] = digest(path.read_bytes())
        receipt_path.write_bytes(canonical(receipt))
        with self.assertRaisesRegex(FoundryValidationError, "computational"):
            verify_run(output, ROOT)

    async def test_verifier_rejects_receipt_identity_authority_and_source_changes(
        self,
    ) -> None:
        output = self.parent / "receipt"
        await self.runner.run(command_spec(SUCCESS), output)
        path = output / "receipt.json"
        original = json.loads(path.read_text())
        for changes in (
            {"schema_version": "unknown"},
            {"evidence_state": "verified"},
            {"experiment_id": "foreign"},
            {"status": "invented"},
            {"returncode": 5},
            {"status": "failed"},
        ):
            path.write_bytes(canonical({**original, **changes}))
            with self.assertRaises(FoundryValidationError):
                verify_run(output, ROOT)
        path.write_bytes(canonical(original))
        request_path = output / "request.json"
        request = json.loads(request_path.read_text())
        request["source"] = {}
        request_path.write_bytes(canonical(request))
        original["artifacts"]["request.json"] = digest(request_path.read_bytes())
        path.write_bytes(canonical(original))
        with self.assertRaisesRegex(FoundryValidationError, "source differs"):
            verify_run(output, ROOT)

    async def test_builtin_replay_matches_computational_bytes_with_new_timing(
        self,
    ) -> None:
        lane = "navair-acquisition-analysis"
        inputs = {
            "lane_id": lane,
            "candidate_id": "bm25",
            "seed": 17,
            "dataset": fixture(lane),
        }
        spec = ExperimentSpec(
            "retrieval-replay", builtin_command(), 17, inputs, ("measurement.json",)
        )
        original = self.parent / "original"
        result = await self.runner.run(spec, original)
        self.assertEqual(result.status, "succeeded")
        replay = await replay_run(original, self.parent / "replay", ROOT)
        self.assertEqual(replay["state"], "MATCH")
        self.assertEqual(replay["original"], replay["replayed"])
        original_receipt = verify_run(original, ROOT)
        replay_receipt = verify_run(self.parent / "replay", ROOT)
        self.assertNotEqual(
            original_receipt["started_at"], replay_receipt["started_at"]
        )

    async def test_replay_never_executes_arbitrary_saved_commands_or_failed_attempts(
        self,
    ) -> None:
        output = self.parent / "arbitrary"
        await self.runner.run(command_spec(SUCCESS), output)
        with self.assertRaisesRegex(FoundryValidationError, "built-in"):
            await replay_run(output, self.parent / "bad", ROOT)
        failed = self.parent / "failed"
        await self.runner.run(command_spec("raise SystemExit(1)"), failed)
        with self.assertRaisesRegex(FoundryValidationError, "successful"):
            await replay_run(failed, self.parent / "bad", ROOT)
        self.assertFalse((self.parent / "bad").exists())
