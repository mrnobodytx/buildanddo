# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_work_cli.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work_cli.py, libs/evolution/intelligence.py, tests/upgrade/test_work_support.py, tests/upgrade/test_development_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/work_cli.py; CONSUMES libs/evolution/intelligence.py; CONSUMES tests/upgrade/test_work_support.py; CONSUMES tests/upgrade/test_development_support.py
# Intent:      Exercise real mission packet producers and local work commands without remote effects or fabricated acceptance.
# ───────────────────────────────────────────────────────────────

"""Run the public command boundary and existing mission producer with synthetic inputs."""

import contextlib
from dataclasses import replace
from datetime import timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from libs.evolution.intelligence import write_mission_packet
from libs.evolution import work_cli
from libs.evolution.common import digest
from libs.evolution.work import PUBLIC_FORBIDDEN, WorkContract, WorkCheck
from libs.evolution.work_exchange import load_contract
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from tests.upgrade.test_development_support import AT, opportunity, prediction
from tests.upgrade.test_work_support import (
    ACTOR,
    CANDIDATE,
    NOW,
    pinned_review,
    submission,
)


class WorkCliTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.value = submission(self.root / "source")
        self.work_path = self.write("work.json", self.value.work.to_dict())
        self.result_path = self.write("result.json", self.value.result.to_dict())

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        return path

    def call(self, *argv, at=NOW):
        stream = io.StringIO()
        with (
            contextlib.redirect_stdout(stream),
            patch.object(work_cli, "datetime") as clock,
        ):
            clock.now.return_value = at
            result = work_cli.main(tuple(str(v) for v in argv))
        return result, stream.getvalue()

    def prepare(self, name="bundle", **options):
        extra = []
        for key, value in options.items():
            extra.extend(("--" + key.replace("_", "-"), value))
        return self.call(
            "bundle",
            "--work",
            self.work_path,
            "--result",
            self.result_path,
            "--candidate",
            CANDIDATE,
            "--evidence-root",
            self.root / "source",
            "--output",
            self.root / name,
            *extra,
        )

    def packet(self):
        source = opportunity(prediction(self.root / "source-repo"))
        return write_mission_packet(
            source,
            self.root / "mission-packet",
            srs="SRS-BUILDANDDO-FIXTURE-001",
            dispatch="VCC-BUILDANDDO-FIXTURE-001",
            builder=ACTOR,
            verifier=SemanticId("cni://verifier/fixture"),
            at=AT,
        )

    def convert(self, packet, **changes):
        options = dict(
            repository="fixture/public",
            producer="buildanddo",
            lane="operations",
            allowed_paths=("apps/fixture/**",),
            forbidden_paths=PUBLIC_FORBIDDEN,
            capabilities=("python",),
            evidence_required=("commit", "test", "artifact"),
            at=AT,
        )
        options.update(changes)
        return work_cli.from_development_mission(packet, **options)

    def test_schema_command_exports_existing_codec_for_each_contract_without_overwriting(
        self,
    ) -> None:
        for kind in ("work", "result", "worker"):
            path = self.root / f"{kind}.schema.json"
            self.assertEqual(self.call("schema", kind, "--output", path)[0], 0)
            self.assertIn("$defs", json.loads(path.read_text()))
            original = path.read_bytes()
            self.assertEqual(self.call("schema", kind, "--output", path)[0], 1)
            self.assertEqual(path.read_bytes(), original)

    def test_validate_describes_proposal_and_denies_missing_or_future_work(
        self,
    ) -> None:
        code, output = self.call("validate-work", self.work_path)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output)["status"], "PROPOSED")
        self.assertFalse(json.loads(output)["production_authority"])
        self.assertEqual(self.call("validate-work", self.root / "absent.json")[0], 1)
        self.assertEqual(
            self.call(
                "validate-work",
                self.work_path,
                at=self.value.work.created_at - timedelta(seconds=1),
            )[0],
            1,
        )

    def test_real_development_packet_converts_with_original_lineage_and_no_auth_change(
        self,
    ) -> None:
        packet = self.packet()
        destination = self.root / "converted.json"
        result, output = self.call(
            "from-mission",
            self.root / "mission-packet/mission.json",
            "--repository",
            "fixture/public",
            "--producer",
            "buildanddo",
            "--lane",
            "operations",
            "--allowed-path",
            "apps/fixture/**",
            "--forbidden-path",
            "apps/fixture/protected/**",
            "--capability",
            "python",
            "--require-evidence",
            "runtime",
            "--output",
            destination,
            at=AT,
        )
        self.assertEqual(result, 0, output)
        converted = load_contract(destination, WorkContract)
        self.assertEqual(converted.source.revision, packet["source_sha"])
        self.assertEqual(converted.origin, self.convert(packet).origin)
        self.assertEqual(converted.origin.version, digest(packet))
        self.assertEqual(converted.scope_id, packet["proposal"]["scope_id"])
        self.assertIn("runtime", converted.evidence_required)
        self.assertEqual(converted.authority, "candidate_only")
        self.assertEqual(json.loads(output)["status"], "PROPOSED")

    def test_packet_lineage_mutation_missing_identity_and_private_inputs_fail_closed(
        self,
    ) -> None:
        packet = self.packet()
        for changes in (
            {"schema_version": "wrong"},
            {"status": "approved"},
            {"source_sha": "f" * 40},
            {"proposal": {}},
            {"context_root": {}},
            {"authority": "A3"},
            {"independent_review": False},
            {"builder": packet["verifier"]},
            {"builder": None},
            {"srs": None},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                self.convert(packet | changes)
        private = json.loads(json.dumps(packet))
        private["opportunity"]["signals"][0]["access"] = "authorized"
        with self.assertRaisesRegex(ContractError, "non-public"):
            self.convert(private)
        with self.assertRaises(ContractError):
            self.convert(packet, at=AT - timedelta(seconds=1))

    def test_produced_work_can_return_result_for_existing_independent_review(
        self,
    ) -> None:
        contract = self.convert(self.packet())
        returned = submission(self.root / "converted-evidence", contract)
        returned = replace(
            returned,
            result=replace(
                returned.result,
                checks=(
                    WorkCheck(
                        "acceptance-1",
                        "PASS",
                        tuple(e.evidence_id for e in returned.result.evidence),
                    ),
                ),
            ),
        )
        expected = self.write("converted-work.json", contract.to_dict())
        result_path = self.write("converted-result.json", returned.result.to_dict())
        receipt, policy = pinned_review(returned)
        verification = self.write("verification.json", receipt.to_dict())
        review_policy = self.write("receiving-policy.json", policy.to_dict())
        at = AT + timedelta(seconds=30)
        code, output = self.call(
            "bundle",
            "--work",
            expected,
            "--result",
            result_path,
            "--candidate",
            CANDIDATE,
            "--evidence-root",
            self.root / "converted-evidence",
            "--verification",
            verification,
            "--output",
            self.root / "converted-bundle",
            at=at,
        )
        self.assertEqual(code, 0, output)
        code, output = self.call(
            "inspect",
            self.root / "converted-bundle",
            "--work",
            expected,
            "--candidate",
            CANDIDATE,
            "--review-policy",
            review_policy,
            at=at,
        )
        self.assertEqual(code, 0, output)
        self.assertEqual(json.loads(output)["state"], "REVIEWED_PASS")

    def test_packaging_and_untrusted_attached_review_cannot_self_certify(self) -> None:
        receipt, policy = pinned_review(self.value)
        verification = self.write("verification.json", receipt.to_dict())
        self.assertEqual(self.prepare(verification=verification)[0], 0)
        args = (
            "inspect",
            self.root / "bundle",
            "--work",
            self.work_path,
            "--candidate",
            CANDIDATE,
        )
        code, output = self.call(*args)
        self.assertEqual(code, 2)
        self.assertEqual(json.loads(output)["state"], "READY_FOR_REVIEW")
        self.assertFalse((self.root / "bundle/review-policy.json").exists())
        policy_file = self.write("policy.json", policy.to_dict())
        self.assertEqual(self.call(*args, "--review-policy", policy_file)[0], 0)
        invalid = self.write(
            "unpinned.json", replace(policy, receipt_digests=()).to_dict()
        )
        self.assertEqual(self.call(*args, "--review-policy", invalid)[0], 1)

    def test_experience_cli_keeps_selected_pins_separate_and_deduplicates_retries(
        self,
    ) -> None:
        receipt, policy = pinned_review(self.value)
        verification = self.write("verification.json", receipt.to_dict())
        policy_file = self.write("policy.json", policy.to_dict())
        self.prepare(verification=verification)
        selection = self.write(
            "selection.json",
            [
                {
                    "bundle": str(self.root / "bundle"),
                    "expected_work": str(self.work_path),
                    "candidate": CANDIDATE,
                }
            ]
            * 2,
        )
        output = self.root / "history.json"
        code, message = self.call(
            "experience",
            selection,
            "--worker",
            ACTOR,
            "--review-policy",
            policy_file,
            "--output",
            output,
        )
        self.assertEqual(code, 0, message)
        history = json.loads(output.read_text())
        self.assertEqual(history["attempts"], 1)
        self.assertEqual(history["historical_reviewed_passes"], 1)
        selection.write_text('[{"candidate": true}]')
        self.assertEqual(
            self.call(
                "experience",
                selection,
                "--worker",
                ACTOR,
                "--output",
                self.root / "rejected.json",
            )[0],
            1,
        )

    def test_invalid_result_never_creates_output_and_instruction_text_is_inert(
        self,
    ) -> None:
        self.result_path.write_text(
            self.result_path.read_text().replace(CANDIDATE, "c" * 40)
        )
        self.assertEqual(self.prepare()[0], 1)
        self.assertFalse((self.root / "bundle").exists())
        text = "$(touch /tmp/not-executed-by-work-contract)"
        contract = replace(self.value.work, objective=text)
        path = self.write("inert.json", contract.to_dict())
        self.assertEqual(self.call("validate-work", path)[0], 0)
        self.assertEqual(load_contract(path, WorkContract).objective, text)


if __name__ == "__main__":
    unittest.main()
