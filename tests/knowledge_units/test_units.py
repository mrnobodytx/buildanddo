# ─── CGRF Header ──────────────────────────────
# File:        tests/knowledge_units/test_units.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
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

from apps.career.ledger import append_chain, read_chain
from apps.knowledge_units.cli import main
from apps.knowledge_units.mastery import mastery, record_assessment, record_transfer, rung
from apps.knowledge_units.receipt import compile_receipt
from apps.knowledge_units.units import UnitError, check_succession, unit_digest, unit_state, validate_unit

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

    def test_receipt_rejects_unbound_or_different_revision_mastery(self) -> None:
        unit = validate_unit(raw())
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            for level in ("recall", "explain"):
                record_assessment(ledger, unit, learner="a", level=level, passed=True, at="t")
            record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=True, at="t")
            learning = mastery(ledger, unit)
            self.assertEqual(compile_receipt(unit, TODAY, learning)["verified_mastery"], 1)
            for changed in ({**unit, "version": "2.0.0"}, {**unit, "explanation": "Changed content"},
                            {**unit, "unit_id": "BDO-OTHER"}):
                with self.assertRaises(UnitError):
                    compile_receipt(changed, TODAY, learning)
            for field in ("unit_id", "version", "unit_digest"):
                with self.assertRaises(UnitError):
                    compile_receipt(unit, TODAY, {k: v for k, v in learning.items() if k != field})


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

    def test_recorded_evidence_identifies_exact_unit_content(self) -> None:
        unit = validate_unit(raw())
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            assessment = record_assessment(ledger, unit, learner="a", level="recall", passed=True, at="t")
            transfer = record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=True, at="t")
            for event in (assessment, transfer, mastery(ledger, unit)):
                self.assertEqual((event.get("unit_id"), event.get("version"), event.get("unit_digest")),
                                 (unit["unit_id"], unit["version"], unit_digest(unit)))
            self.assertEqual(read_chain(ledger), [assessment, transfer])

    def test_mastery_does_not_follow_version_or_content_changes(self) -> None:
        unit = validate_unit(raw())
        changes = [
            {"version": "2.0.0"}, {"explanation": "Changed explanation"},
            {"claims": [{**unit["claims"][0], "text": "Changed claim"}, unit["claims"][1]]},
            {"items": [{**unit["items"][0], "id": "new-recall"}, unit["items"][1]]},
            {"transfer_task": {**unit["transfer_task"], "rubric": ["Changed rubric"]}},
            {"author": "different.author"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            for level in ("recall", "explain"):
                record_assessment(ledger, unit, learner="a", level=level, passed=True, at="t")
            record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=True, at="t")
            before = ledger.read_bytes()
            events = read_chain(ledger)
            self.assertEqual(rung(events, unit, "a"), "VERIFIED")
            for change in changes:
                changed = {**unit, **change}
                self.assertEqual(rung(events, changed, "a"), "NONE")
                report = mastery(ledger, changed)
                self.assertEqual((report["learners"], report["attempts"]), ({}, 0))
                self.assertEqual(sum(report["counts"].values()), 0)
            self.assertEqual(mastery(ledger, unit)["learners"], {"a": "VERIFIED"})
            self.assertEqual(ledger.read_bytes(), before)

    def test_assessment_and_transfer_cannot_mix_revisions(self) -> None:
        unit = validate_unit(raw())
        later = {**unit, "version": "2.0.0"}
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            record_assessment(ledger, unit, learner="a", level="recall", passed=True, at="t")
            record_assessment(ledger, later, learner="a", level="explain", passed=True, at="t")
            record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=True, at="t")
            self.assertEqual(mastery(ledger, later)["learners"], {"a": "UNDERSTAND"})
            record_assessment(ledger, later, learner="a", level="recall", passed=True, at="t")
            self.assertEqual(mastery(ledger, later)["learners"], {"a": "DEMONSTRATE"})
            self.assertEqual(mastery(ledger, later)["attempts"], 2)
            record_transfer(ledger, later, learner="a", reviewer="peer.x", meets_rubric=True, at="t")
            self.assertEqual(mastery(ledger, later)["learners"], {"a": "VERIFIED"})
            self.assertEqual(mastery(ledger, unit)["learners"], {"a": "KNOW"})

    def test_unbound_history_stays_ineligible_without_backfill(self) -> None:
        unit = validate_unit(raw())
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            base = {"unit_id": unit["unit_id"], "version": unit["version"], "learner": "a", "at": "t"}
            for level in ("recall", "explain"):
                append_chain(ledger, {**base, "kind": "assessment", "level": level, "passed": True})
            append_chain(ledger, {**base, "kind": "transfer", "reviewer": "peer.x", "meets_rubric": True})
            before = ledger.read_bytes()
            self.assertEqual(rung(read_chain(ledger), unit, "a"), "NONE")
            self.assertEqual(mastery(ledger, unit)["learners"], {})
            self.assertEqual(mastery(ledger, unit)["attempts"], 0)
            self.assertEqual(ledger.read_bytes(), before)
            record_assessment(ledger, unit, learner="a", level="recall", passed=True, at="t")
            self.assertEqual(mastery(ledger, unit)["learners"], {"a": "KNOW"})
            self.assertEqual(mastery(ledger, unit)["attempts"], 1)
            self.assertTrue(ledger.read_bytes().startswith(before))

    def test_incomplete_or_foreign_bindings_do_not_count(self) -> None:
        unit = validate_unit(raw())
        event = {"unit_id": unit["unit_id"], "version": unit["version"], "unit_digest": unit_digest(unit),
                 "learner": "a", "kind": "assessment", "level": "recall", "passed": True}
        self.assertEqual(rung([event], unit, "a"), "KNOW")
        for field in ("unit_id", "version", "unit_digest", "learner"):
            for value in (None, "", "other"):
                self.assertEqual(rung([{**event, field: value}], unit, "a"), "NONE")
            self.assertEqual(rung([{k: v for k, v in event.items() if k != field}], unit, "a"), "NONE")
        self.assertEqual(rung([{**event, "unit_digest": "wrong", "passed": "false"}], unit, "a"), "NONE")

    def test_assessment_recorder_rejects_non_boolean_pass(self) -> None:
        unit = validate_unit(raw())
        invalid: tuple[Any, ...] = ("false", "true", "", 0, 1, 0.0, 1.0, None, [], {}, [True])
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            for value in invalid:
                with self.assertRaisesRegex(UnitError, "passed.*boolean"):
                    record_assessment(ledger, unit, learner="a", level="recall", passed=value, at="t")
                self.assertFalse(ledger.exists())
            record_assessment(ledger, unit, learner="a", level="recall", passed=False, at="t")
            before = ledger.read_bytes()
            with self.assertRaises(UnitError):
                record_assessment(ledger, unit, learner="a", level="recall", passed=invalid[0], at="t")
            self.assertEqual(ledger.read_bytes(), before)

    def test_transfer_recorder_rejects_non_boolean_result(self) -> None:
        unit = validate_unit(raw())
        invalid: tuple[Any, ...] = ("false", "true", "", 0, 1, 0.0, 1.0, None, [], {}, [True])
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "l.jsonl"
            for value in invalid:
                with self.assertRaisesRegex(UnitError, "meets_rubric.*boolean"):
                    record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=value, at="t")
                self.assertFalse(ledger.exists())
            record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=False, at="t")
            before = ledger.read_bytes()
            with self.assertRaises(UnitError):
                record_transfer(ledger, unit, learner="a", reviewer="peer.x", meets_rubric=invalid[0], at="t")
            self.assertEqual(ledger.read_bytes(), before)

    def test_consumer_rejects_non_boolean_results(self) -> None:
        unit = validate_unit(raw())
        base = {"unit_id": unit["unit_id"], "version": unit["version"], "unit_digest": unit_digest(unit),
                "learner": "a", "at": "t"}
        for kind, field in (("assessment", "passed"), ("transfer", "meets_rubric")):
            for value in ("false", "true", "", 0, 1, 0.0, 1.0, None, [], {}, [True]):
                event = {**base, "kind": kind, "level": "recall", "reviewer": "peer.x", field: value}
                with self.assertRaisesRegex(UnitError, f"{field}.*boolean"):
                    rung([event], unit, "a")
            with self.assertRaises(UnitError):
                rung([{k: v for k, v in event.items() if k != field}], unit, "a")

    def test_incomplete_bound_evidence_cannot_establish_mastery(self) -> None:
        unit = validate_unit(raw())
        base = {"unit_id": unit["unit_id"], "version": unit["version"], "unit_digest": unit_digest(unit),
                "learner": "a", "at": "t"}
        assessments = [{**base, "kind": "assessment", "level": level, "passed": True} for level in ("recall", "explain")]
        for reviewer in (None, "", "  ", "a"):
            transfer = {**base, "kind": "transfer", "reviewer": reviewer, "meets_rubric": True}
            with self.assertRaises(UnitError):
                rung([*assessments, transfer], unit, "a")
        with self.assertRaises(UnitError):
            rung([{**base, "kind": "assessment", "passed": True}], unit, "a")


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

    def test_cli_receipt_does_not_inherit_old_mastery(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            ledger = str(base / "l.jsonl")
            for level in ("recall", "explain"):
                self.assertEqual(self.run_cli("record", "assessment", str(FIX), "--ledger", ledger, "--learner", "a",
                                              "--at", "t", "--level", level, "--passed")[0], 0)
            self.assertEqual(self.run_cli("record", "transfer", str(FIX), "--ledger", ledger, "--learner", "a",
                                          "--at", "t", "--reviewer", "peer.x", "--meets-rubric")[0], 0)
            later = base / "later.json"
            later.write_text(json.dumps({**raw(), "version": "2.0.0"}))
            code, receipt = self.run_cli("receipt", str(later), "--ledger", ledger, "--today", "2026-09-23")
            self.assertEqual((code, receipt["verified_mastery"], receipt["mastery_attempts"]), (0, 0, 0))

    def test_cli_rejects_imported_non_boolean_results(self) -> None:
        unit = validate_unit(raw())
        for kind, field in (("assessment", "passed"), ("transfer", "meets_rubric")):
            with tempfile.TemporaryDirectory() as tmp:
                ledger = Path(tmp) / "l.jsonl"
                append_chain(ledger, {"kind": kind, "unit_id": unit["unit_id"], "version": unit["version"],
                                      "unit_digest": unit_digest(unit), "learner": "a", "level": "recall",
                                      "reviewer": "peer.x", field: "false", "at": "t"})
                before = ledger.read_bytes()
                code, result = self.run_cli("receipt", str(FIX), "--ledger", str(ledger), "--today", "2026-09-23")
                self.assertEqual((code, result.get("state")), (1, "FAIL"))
                self.assertIn(f"{field} must be a boolean", result["error"])
                self.assertEqual(ledger.read_bytes(), before)

    def test_cli_flags_are_booleans_not_text_values(self) -> None:
        for kind, flag, field, extra in (("assessment", "--passed", "passed", ["--level", "recall"]),
                                         ("transfer", "--meets-rubric", "meets_rubric", ["--reviewer", "peer.x"])):
            with tempfile.TemporaryDirectory() as tmp:
                ledger = Path(tmp) / "l.jsonl"
                args = ["record", kind, str(FIX), "--ledger", str(ledger), "--learner", "a", "--at", "t", *extra]
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                    main([*args, flag, "false"])
                self.assertEqual(caught.exception.code, 2)
                self.assertFalse(ledger.exists())
                code, event = self.run_cli(*args)
                self.assertEqual(code, 0)
                self.assertIs(event[field], False)
                self.assertEqual(mastery(ledger, validate_unit(raw()))["learners"], {"a": "NONE"})


if __name__ == "__main__":
    unittest.main()
