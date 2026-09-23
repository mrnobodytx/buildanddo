# ─── CGRF Header ──────────────────────────────
# File:        tests/knowledge_units/test_units.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/knowledge_units
# EnumType:    Test
# EnumEdges:   VALIDATES apps/knowledge_units
# DAG Node:    none
# Intent:      Prove uncited claims fail, state follows review and dates, history survives, CPE is never issued, and mastery rungs need evidence.
# ─────────────────────────────────────────────────────────────

"""Exercise Knowledge Unit validation, receipts and mastery."""

from __future__ import annotations

import contextlib
import copy
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from typing import Any

from apps.knowledge_units.cli import main
from apps.knowledge_units.mastery import mastery, record_assessment, record_transfer, rung
from apps.knowledge_units.receipt import compile_receipt
from apps.knowledge_units.units import UnitError, check_succession, unit_state, validate_unit

FIX = Path(__file__).resolve().parents[1] / "fixtures/knowledge_units/fractions.json"
TODAY = date(2026, 9, 23)


def raw() -> dict[str, Any]:
    return json.loads(FIX.read_text())


class UnitTests(unittest.TestCase):
    def test_sample_is_valid_and_verified(self) -> None:
        unit = validate_unit(raw())
        self.assertEqual(unit_state(unit, TODAY), "VERIFIED")
        self.assertEqual([s["confirmed"] for s in unit["standards"]], [True, False])

    def test_contract_violations(self) -> None:
        def change(**edits: Any) -> dict[str, Any]:
            value = raw()
            for path, new in edits.items():
                target = value
                *parents, last = path.split("__")
                for key in parents:
                    target = target[int(key)] if key.isdigit() else target[key]
                target[int(last) if last.isdigit() else last] = new
            return value
        cases = [
            [], change(schema="x"), change(unit_id="bad id"), change(version="1.0"), change(author=None),
            change(sources=[]), change(sources__1__kind="blog"), change(claims__0__sources=[]),
            change(claims__0__sources=["s9"]), change(claims__0__status="true"),
            change(claims__0__status="retracted"), change(claims=[]), change(claims__1__id="c1"),
            change(claims__0=5), change(items=[{"id": "recall-1", "level": "recall"}]), change(items__0__level="x"),
            change(transfer_task=None), change(transfer_task__rubric=[]), change(standards__0=1),
            change(next_review="2026-01-01"), change(last_review="soon"), change(surfaces={}),
            change(surfaces__professional__suggested_hours=500), change(sources=5), change(title=""),
        ]
        for value in cases:
            with self.subTest(value=str(value)[:60]), self.assertRaises(UnitError):
                validate_unit(value)

    def test_states(self) -> None:
        unit = validate_unit(raw())
        self.assertEqual(unit_state(unit, date(2028, 1, 1)), "STALE")
        same = validate_unit({**raw(), "reviewer": {"id": "teacher.author"}})
        self.assertEqual(unit_state(same, TODAY), "IN_REVIEW")
        draft = raw()
        draft["reviewer"] = None
        for claim in draft["claims"]:
            claim["status"] = "proposed"
        self.assertEqual(unit_state(validate_unit(draft), TODAY), "DRAFT")
        contested = raw()
        contested["claims"][1].update(status="contested", reason="Reader disputes the example")
        self.assertEqual(unit_state(validate_unit(contested), TODAY), "IN_REVIEW")
        unreviewed = raw()
        unreviewed["items"][0]["reviewed"] = False
        self.assertEqual(unit_state(validate_unit(unreviewed), TODAY), "IN_REVIEW")

    def test_claims_are_retracted_not_deleted(self) -> None:
        first = validate_unit(raw())
        later = raw()
        later["version"] = "1.1.0"
        later["claims"][1].update(status="retracted", reason="Superseded by a clearer claim")
        check_succession(first, validate_unit(later))
        self.assertEqual(unit_state(validate_unit(later), TODAY), "VERIFIED")
        deleted = raw()
        deleted["version"] = "1.1.0"
        deleted["claims"] = deleted["claims"][:1]
        for bad in (validate_unit(deleted), first, validate_unit({**raw(), "unit_id": "BDO-OTHER"})):
            with self.assertRaises(UnitError):
                check_succession(first, bad)


class ReceiptTests(unittest.TestCase):
    def test_receipt_counts_and_cpe_boundary(self) -> None:
        receipt = compile_receipt(validate_unit(raw()), TODAY)
        self.assertEqual((receipt["state"], receipt["freshness"], receipt["claims"]), ("VERIFIED", "PASS", 2))
        self.assertEqual((receipt["sources"], receipt["primary_sources"]), (2, 1))
        self.assertEqual((receipt["standards_declared"], receipt["standards_confirmed"]), (2, 1))
        self.assertEqual(receipt["cpe"]["credit"], "NOT_ISSUED")
        self.assertNotIn("learners", receipt)
        approved = validate_unit({**raw(), "cpe": {"provider_approval": "PROVIDER-REF-1"}})
        self.assertEqual(compile_receipt(approved, TODAY)["cpe"]["credit"], "PROVIDER_REFERENCE_RECORDED")
        self.assertIsNone(compile_receipt(validate_unit({**raw(), "reviewer": {"id": "teacher.author"}}), TODAY)["reviewer"])
        self.assertEqual(compile_receipt(validate_unit(raw()), date(2028, 1, 1))["freshness"], "STALE")


class MasteryTests(unittest.TestCase):
    def test_ladder_needs_evidence_and_independent_review(self) -> None:
        unit = validate_unit(raw())
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            at = "2026-09-23T10:00:00Z"
            record_assessment(ledger, unit, learner="a", level="recall", passed=True, at=at)
            record_assessment(ledger, unit, learner="b", level="explain", passed=True, at=at)
            record_assessment(ledger, unit, learner="c", level="recall", passed=False, at=at)
            for who in ("d", "e", "f"):
                record_assessment(ledger, unit, learner=who, level="recall", passed=True, at=at)
                record_assessment(ledger, unit, learner=who, level="explain", passed=True, at=at)
            record_transfer(ledger, unit, learner="e", reviewer="teacher.author", meets_rubric=True, at=at)
            record_transfer(ledger, unit, learner="f", reviewer="peer.x", meets_rubric=True, at=at)
            record_transfer(ledger, unit, learner="d", reviewer="peer.x", meets_rubric=False, at=at)
            report = mastery(ledger, unit)
            self.assertEqual(report["learners"], {"a": "KNOW", "b": "UNDERSTAND", "c": "NONE", "d": "DEMONSTRATE",
                                                  "e": "APPLY", "f": "VERIFIED"})
            self.assertEqual(report["attempts"], 9)
            receipt = compile_receipt(unit, TODAY, report)
            self.assertEqual((receipt["learners"], receipt["verified_mastery"]), (6, 1))
            self.assertEqual(rung([], unit, "nobody"), "NONE")
            with self.assertRaises(UnitError):
                record_transfer(ledger, unit, learner="a", reviewer="a", meets_rubric=True, at=at)
            with self.assertRaises(UnitError):
                record_assessment(ledger, unit, learner="a", level="watched", passed=True, at=at)


class CliTests(unittest.TestCase):
    def run_cli(self, *args: str) -> tuple[int, Any]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ledger = str(base / "l.jsonl")
            self.assertEqual(self.run_cli("check", str(FIX))[0], 0)
            later = copy.deepcopy(raw())
            later["claims"] = later["claims"][:1]
            later["version"] = "2.0.0"
            (base / "later.json").write_text(json.dumps(later))
            self.assertEqual(self.run_cli("check", str(base / "later.json"), "--previous", str(FIX))[0], 1)
            for level in ("recall", "explain"):
                self.assertEqual(self.run_cli("record", "assessment", str(FIX), "--ledger", ledger, "--learner", "a",
                                              "--at", "2026-09-23T00:00:00Z", "--level", level, "--passed")[0], 0)
            self.assertEqual(self.run_cli("record", "transfer", str(FIX), "--ledger", ledger, "--learner", "a",
                                          "--reviewer", "peer.x", "--meets-rubric", "--at", "2026-09-23T00:00:00Z")[0], 0)
            code, receipt = self.run_cli("receipt", str(FIX), "--ledger", ledger, "--today", "2026-09-23")
            self.assertEqual((code, receipt["verified_mastery"]), (0, 1))
            self.assertEqual(self.run_cli("receipt", str(FIX))[0], 0)
            for args in (("record", "assessment", str(FIX), "--ledger", ledger, "--learner", "a", "--at", "t"),
                         ("record", "transfer", str(FIX), "--ledger", ledger, "--learner", "a", "--at", "t"),
                         ("check", str(base / "missing.json")),
                         ("receipt", str(FIX), "--today", "someday")):
                self.assertEqual(self.run_cli(*args)[0], 1)


if __name__ == "__main__":
    unittest.main()
