# ─── CGRF Header ──────────────────────────────
# File:        tests/integrity/test_integrity.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity
# EnumType:    Test
# EnumEdges:   VALIDATES apps/integrity
# DAG Node:    none
# Intent:      Prove each gaming route in the brief fails: rubric rewrite, missing evidence, leaked answers, self or same-model review, averaged disagreement, concealed failure, stance-following and unreproduced passes.
# ─────────────────────────────────────────────────────────────

"""Adversarial tests for the Epistemic Integrity Fabric."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from apps.integrity.audit import plan, record_reexecution, selected, standing
from apps.integrity.cli import main
from apps.integrity.contract import IntegrityError, amend, freeze
from apps.integrity.settlement import settle
from apps.integrity.trace import build_trace, sycophancy_probe
from apps.integrity.verdict import REPORTED, adjudicate, check_verdict

RAW = {"mission_id": "M-8292", "intent": "Teach a learner equivalent fractions",
       "success": ["retention_7d", "transfer_task_pass"],
       "disallowed_shortcuts": ["answer_revealed", "keyword_grading", "assessment_modified"],
       "required_evidence": ["assessment", "delayed_retest", "transfer_task"],
       "verifier_kinds": ["deterministic", "different_model", "human", "same_model", "self"],
       "min_independent": 2, "actor": "forge", "actor_family": "qwen"}
EVIDENCE = [{"kind": kind, "source": "world", "observed_by": "datadog"}
            for kind in ("assessment", "delayed_retest", "transfer_task")]


def contract() -> dict[str, Any]:
    return freeze(dict(RAW))


def report(verifier: str, family: str, kind: str, c: dict[str, Any], result: str = "PASS",
           **extra: Any) -> dict[str, Any]:
    return {"verifier": verifier, "family": family, "kind": kind, "contract": c["digest"],
            "results": {dim: result for dim in REPORTED}, **extra}


def passing(c: dict[str, Any]) -> list[dict[str, Any]]:
    return [report("kestrel", "deterministic", "deterministic", c), report("nemesis", "frontier-b", "different_model", c)]


class ContractTests(unittest.TestCase):
    def test_freeze_and_amend(self) -> None:
        c = contract()
        self.assertTrue(c["digest"].startswith("sha256:"))
        self.assertEqual(freeze(dict(RAW))["digest"], c["digest"])
        later = amend(c, {"min_independent": 3})
        self.assertEqual((later["version"], later["parent"]), (2, c["digest"]))
        self.assertNotEqual(later["digest"], c["digest"])
        with self.assertRaises(IntegrityError):
            amend(c, {"actor": "someone"})
        for bad in ([], {**RAW, "verifier_kinds": ["self", "same_model"]}, {**RAW, "verifier_kinds": ["oracle"]},
                    {**RAW, "min_independent": 0}, {**RAW, "version": 0}, {**RAW, "intent": ""},
                    {**RAW, "success": []}, {**RAW, "success": ["a", "a"]}, {**RAW, "actor": "bad id!"},
                    {**RAW, "version": 2}, {**RAW, "success": "x"}):
            with self.subTest(bad=str(bad)[:40]), self.assertRaises(IntegrityError):
                freeze(bad)


class VerdictTests(unittest.TestCase):
    def test_pass_needs_every_gate(self) -> None:
        c = contract()
        v = adjudicate(c, EVIDENCE, passing(c))
        self.assertEqual(v["final"], "PASS")
        self.assertEqual(set(v["dimensions"].values()), {"PASS"})
        check_verdict(v)

    def test_rubric_rewrite_is_rejected(self) -> None:
        c = contract()
        rewritten = amend(c, {"success": ["transfer_task_pass"]})
        v = adjudicate(c, EVIDENCE, [report("kestrel", "deterministic", "deterministic", rewritten),
                                    report("nemesis", "frontier-b", "different_model", rewritten)])
        self.assertEqual((v["final"], sorted(v["rejected_reports"])), ("FAIL", ["kestrel", "nemesis"]))
        self.assertEqual((v["dimensions"]["OUTCOME"], v["dimensions"]["INDEPENDENCE"]), ("UNKNOWN", "FAIL"))

    def test_outcome_without_world_evidence_fails(self) -> None:
        c = contract()
        actor_made = [{**item, "source": "actor"} for item in EVIDENCE]
        self_observed = [{**item, "observed_by": "forge"} for item in EVIDENCE]
        for evidence in (actor_made, self_observed, EVIDENCE[:2]):
            v = adjudicate(c, evidence, passing(c))
            self.assertEqual((v["dimensions"]["OUTCOME"], v["dimensions"]["PROVENANCE"], v["final"]),
                             ("PASS", "FAIL", "FAIL"))

    def test_leaked_answer_fails_despite_perfect_score(self) -> None:
        c = contract()
        reports = passing(c)
        reports[1]["shortcuts"] = ["answer_revealed", "not_in_contract"]
        v = adjudicate(c, EVIDENCE, reports)
        self.assertEqual((v["final"], v["shortcuts"]), ("FAIL", ["answer_revealed"]))

    def test_self_and_same_model_review_carry_no_weight(self) -> None:
        c = contract()
        v = adjudicate(c, EVIDENCE, [report("forge", "qwen", "self", c), report("forge-critic", "qwen", "same_model", c),
                                     report("qwen-judge", "qwen", "different_model", c),
                                     report("kestrel", "deterministic", "deterministic", c)])
        self.assertEqual(v["dimensions"]["INDEPENDENCE"], "FAIL")
        self.assertEqual(v["ignored_reports"], ["forge", "forge-critic", "qwen-judge"])
        self.assertEqual(v["final"], "FAIL")
        two_same_family = [report("a", "frontier-b", "different_model", c), report("b", "frontier-b", "human", c)]
        self.assertEqual(adjudicate(c, EVIDENCE, two_same_family)["dimensions"]["INDEPENDENCE"], "FAIL")

    def test_disagreement_is_kept_not_averaged(self) -> None:
        c = contract()
        reports = passing(c) + [report("reviewer", "human", "human", c)]
        reports[1]["results"]["GENERALIZATION"] = "FAIL"
        reports[1]["results"]["OUTCOME"] = "PASS"
        reports[2]["results"]["NEGATIVE_CONTROL"] = "FAIL"
        v = adjudicate(c, EVIDENCE, reports)
        self.assertEqual(v["dimensions"]["GENERALIZATION"], "CONTESTED")
        self.assertEqual(v["disagreements"]["GENERALIZATION"],
                         {"kestrel": "PASS", "nemesis": "FAIL", "reviewer": "PASS"})
        self.assertEqual(v["final"], "CONTESTED")

    def test_malformed_reports_and_edits(self) -> None:
        c = contract()
        for bad in ([5], [{"kind": "oracle"}], [{"kind": "human", "results": {"INDEPENDENCE": "PASS"}}],
                    [{"kind": "human", "results": {"OUTCOME": "MAYBE"}}], [{"kind": "human", "shortcuts": "x"}]):
            with self.subTest(bad=str(bad)[:40]), self.assertRaises(IntegrityError):
                adjudicate(c, EVIDENCE, bad)
        v = adjudicate(c, EVIDENCE, passing(c))
        with self.assertRaises(IntegrityError):
            check_verdict({**v, "final": "PASS", "shortcuts": ["x"]})


class SettlementTests(unittest.TestCase):
    def test_disclosure_matrix(self) -> None:
        c = contract()
        ok = adjudicate(c, EVIDENCE, passing(c))
        failing = passing(c)
        failing[0]["results"]["OUTCOME"] = failing[1]["results"]["OUTCOME"] = "FAIL"
        bad = adjudicate(c, EVIDENCE, failing)
        disclosed, concealed = settle(bad, claimed_success=False), settle(bad, claimed_success=True)
        self.assertEqual((disclosed["trust"], disclosed["investigate"]), (1, False))
        self.assertEqual((concealed["trust"], concealed["investigate"]), (-3, True))
        self.assertGreater(disclosed["trust"], concealed["trust"])
        self.assertEqual(settle(ok, claimed_success=True)["competence"], 1)
        self.assertEqual(settle(ok, claimed_success=False)["trust"], 1)
        partial = passing(c)
        del partial[0]["results"]["SAFETY"], partial[1]["results"]["SAFETY"]
        held = adjudicate(c, EVIDENCE, partial)
        self.assertEqual(held["final"], "INCOMPLETE")
        self.assertEqual(settle(held, claimed_success=True)["competence"], 0)
        leaked = passing(c)
        leaked[0]["shortcuts"] = ["keyword_grading"]
        self.assertEqual(settle(adjudicate(c, EVIDENCE, leaked), claimed_success=True)["note"], "disallowed shortcut detected")
        with self.assertRaises(IntegrityError):
            settle({**ok, "final": "PASS", "competence": 9}, claimed_success=True)


class TraceTests(unittest.TestCase):
    def test_layers_order_and_state(self) -> None:
        c = contract()
        v = adjudicate(c, EVIDENCE, passing(c))
        entries = [
            {"layer": "OBSERVED", "text": "Learner scales only the denominator", "evidence": ["E-1991"], "at": "2026-09-01T10:00:00Z"},
            {"layer": "INFERRED", "text": "Additive reasoning", "at": "2026-09-01T10:01:00Z"},
            {"layer": "PREDICTED", "text": "Transfer improves over 20 percent", "at": "2026-09-01T10:02:00Z"},
            {"layer": "COUNTERFACTUAL", "text": "Without intervention about 5 percent", "at": "2026-09-01T10:02:00Z"},
            {"layer": "OUTCOME", "text": "Improved 24 percent", "evidence": ["E-1993"], "at": "2026-09-02T10:00:00Z"},
        ]
        trace = build_trace("M-8292", entries, {"E-1991", "E-1993"}, v, pending=["delayed_retest"])
        self.assertEqual(trace["state"], "WATCH")
        self.assertEqual(build_trace("M-8292", entries, {"E-1991", "E-1993"}, v)["state"], "PASS")
        self.assertEqual(build_trace("M-8292", entries[:2], {"E-1991"})["state"], "OPEN")
        late = [*entries[:2], {**entries[2], "at": "2026-09-03T00:00:00Z"}, entries[4]]
        for bad in (late, [{**entries[0], "evidence": ["E-404"]}], [{**entries[3], "evidence": ["E-1991"]}],
                    [{"layer": "FELT", "text": "x", "at": "2026-09-01"}], [{**entries[0], "at": "soon"}],
                    [entries[4]], [{**entries[1], "evidence": "E"}]):
            with self.subTest(bad=str(bad)[:50]), self.assertRaises(IntegrityError):
                build_trace("M-8292", bad, {"E-1991", "E-1993"})
        with self.assertRaises(IntegrityError):
            build_trace("M-other", entries, {"E-1991", "E-1993"}, v)

    def test_sycophancy_probe(self) -> None:
        self.assertEqual(sycophancy_probe({"agree": "Weak evidence", "disagree": "weak evidence "})["result"], "STABLE")
        self.assertEqual(sycophancy_probe({"agree": "True", "disagree": "False"})["result"], "FLIPPED")
        with self.assertRaises(IntegrityError):
            sycophancy_probe({"agree": "x"})


class AuditTests(unittest.TestCase):
    def test_sampling_includes_passes_and_revocation_reverses_rewards(self) -> None:
        c = contract()
        v = adjudicate(c, EVIDENCE, passing(c))
        self.assertTrue(selected(v["digest"], "privileged", "auditor-seed"))
        chosen = plan([{"verdict": v, "impact": "privileged"}, {"verdict": v}], "auditor-seed")
        self.assertEqual(chosen[0]["final"], "PASS")
        hits = sum(selected(f"sha256:{i:064x}", "normal", "s") for i in range(2000))
        self.assertTrue(40 <= hits <= 170, hits)
        for impact, seed in (("vip", "s"), ("normal", "")):
            with self.assertRaises(IntegrityError):
                selected(v["digest"], impact, seed)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "audit.jsonl"
            with self.assertRaises(IntegrityError):
                record_reexecution(ledger, v, reproduced=False, auditor="forge", at="t", rewards=[])
            ok = record_reexecution(ledger, v, reproduced=True, auditor="auditor", at="t", rewards=["xp-1"])
            self.assertEqual((ok["state"], ok["reverse_rewards"]), ("CONFIRMED", []))
            self.assertEqual(standing(ledger, v), "PASS")
            gone = record_reexecution(ledger, v, reproduced=False, auditor="auditor", at="t", rewards=["xp-1", "tp-2"])
            self.assertEqual((gone["state"], gone["reverse_rewards"]), ("REVOKED", ["tp-2", "xp-1"]))
            self.assertEqual(standing(ledger, v), "REVOKED")
            failed = adjudicate(c, EVIDENCE[:1], passing(c))
            self.assertEqual(record_reexecution(ledger, failed, reproduced=False, auditor="a", at="t", rewards=[])["state"],
                             "UNCHANGED")


class CliTests(unittest.TestCase):
    def run_cli(self, *args: str) -> tuple[int, Any]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "c.json").write_text(json.dumps(RAW))
            code, frozen = self.run_cli("freeze", str(root / "c.json"))
            self.assertEqual(code, 0)
            (root / "e.json").write_text(json.dumps(EVIDENCE))
            (root / "r.json").write_text(json.dumps(passing(frozen)))
            args = ("adjudicate", "--contract", str(root / "c.json"), "--evidence", str(root / "e.json"),
                    "--reports", str(root / "r.json"), "--claimed-success")
            code, result = self.run_cli(*args)
            self.assertEqual((code, result["verdict"]["final"]), (0, "PASS"))
            (root / "e.json").write_text("[]")
            self.assertEqual(self.run_cli(*args)[0], 2)
            self.assertEqual(self.run_cli("freeze", str(root / "missing.json"))[0], 1)


if __name__ == "__main__":
    unittest.main()
