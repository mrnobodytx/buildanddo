# ─── CGRF Header ──────────────────────────────
# File:        tests/world_twin/test_world_twin.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin
# EnumType:    Test
# EnumEdges:   VALIDATES apps/world_twin
# DAG Node:    none
# Intent:      Prove farming routes earn nothing, failures and corrections show, every figure drills down to events, disputes persist and projections withhold what they should.
# ─────────────────────────────────────────────────────────────

"""Exercise the personal world twin."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from apps.career.ledger import read_chain
from apps.world_twin.cli import main
from apps.world_twin.events import TwinError, effective_state, record_event, tier, validate_event
from apps.world_twin.projection import project, world_state
from apps.world_twin.twin import build_twin, record_dispute, record_resolution

N = 0


def ev(**fields: Any) -> dict[str, Any]:
    global N
    N += 1
    base = {"event_id": f"EV-{N}", "actor": "john", "type": "ATTEMPT", "target": "knowledge:fractions",
            "context": "algebra", "capability": "algebra", "at": f"2026-09-{10 + N % 18:02d}T10:00:00Z"}
    return validate_event({**base, **fields})


def verified(**fields: Any) -> dict[str, Any]:
    return ev(state="VERIFIED", outcome="SUCCESS", evidence=["receipt:1"], verified_by=["teacher:9"], **fields)


class EventTests(unittest.TestCase):
    def test_self_and_friend_verification_earn_nothing(self) -> None:
        self.assertEqual(effective_state(ev(state="VERIFIED", evidence=["r"], verified_by=["john"])), "OBSERVED")
        friend = ev(state="VERIFIED", evidence=["r"], verified_by=["amy"],
                    participants=[{"id": "amy", "relation": "BUILT_WITH"}])
        self.assertEqual(effective_state(friend), "OBSERVED")
        self.assertEqual(effective_state(ev(state="VERIFIED", verified_by=["teacher:9"])), "INFERRED")
        self.assertEqual(effective_state(verified()), "VERIFIED")
        self.assertEqual([tier(e) for e in (ev(type="VIEW"), ev(), ev(outcome="FAILURE", evidence=["r"]), verified())],
                         ["raw", "meaningful", "outcome", "verified"])

    def test_malformed_events(self) -> None:
        good = {"event_id": "E", "actor": "a", "type": "READ", "target": "t", "at": "2026-09-01T00:00:00Z"}
        for bad in (5, {**good, "type": "CLICK"}, {**good, "state": "TRUE"}, {**good, "actor": "bad id!"},
                    {**good, "at": "2026-09-01T00:00:00"}, {**good, "at": "soon"}, {**good, "evidence": "r"},
                    {**good, "participants": [{"id": "x", "relation": "FOLLOWS"}]}, {**good, "participants": "x"}):
            with self.subTest(bad=str(bad)[:50]), self.assertRaises(TwinError):
                validate_event(bad)
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "w.jsonl"
            record_event(ledger, good)
            with self.assertRaises(TwinError):
                record_event(ledger, good)


class TwinTests(unittest.TestCase):
    def test_capability_ladder_and_why(self) -> None:
        views = [ev(type="READ") for _ in range(50)]
        self.assertEqual(build_twin(views, "john")["capabilities"]["algebra"]["state"], "STUDIED")
        entries = [ev(type="READ"), ev(outcome="FAILURE", evidence=["r"], at="2026-09-01T00:00:00Z"),
                   verified(at="2026-09-02T00:00:00Z"),
                   verified(context="classroom", at="2026-09-03T00:00:00Z")]
        twin = build_twin(entries, "john")
        cap = twin["capabilities"]["algebra"]
        self.assertEqual(cap["state"], "VERIFIED")
        self.assertEqual([row["changed"] for row in cap["why"]],
                         [None, "BUILDING -> DEMONSTRATED", "DEMONSTRATED -> VERIFIED"])
        one_context = build_twin([verified(), verified()], "john")
        self.assertEqual(one_context["capabilities"]["algebra"]["state"], "DEMONSTRATED")

    def test_failures_corrections_and_drilldown(self) -> None:
        fixed = ev(outcome="FAILURE", evidence=["r"], at="2026-09-01T00:00:00Z")
        open_fail = ev(outcome="FAILURE", evidence=["r"], capability="security", context="security",
                       at="2026-09-05T00:00:00Z")
        success = verified(at="2026-09-02T00:00:00Z", world_effect=["knowledge:fractions:v3->v4"],
                           participants=[{"id": "bob", "relation": "LEARNED_FROM"}])
        claimed = ev(state="VERIFIED", outcome="SUCCESS", evidence=["r"], verified_by=["john"],
                     world_effect=["knowledge:fake"])
        other = ev(actor="carol", participants=[{"id": "john", "relation": "REVIEWED_WITH"}])
        twin = build_twin([fixed, open_fail, success, claimed, other], "john")
        history = twin["history"]
        self.assertEqual((history["corrected"], history["unresolved"]), ([fixed["event_id"]], [open_fail["event_id"]]))
        self.assertEqual(twin["impact"]["world_effects"], {"knowledge:fractions:v3->v4": success["event_id"]})
        self.assertEqual(twin["measures"]["contribution"]["events"], [success["event_id"]])
        relations = {(r["relation"], r["with"]) for r in twin["community"]}
        self.assertEqual(relations, {("LEARNED_FROM", "bob"), ("VERIFIED_BY", "teacher:9"), ("WORKED_WITH", "carol")})
        self.assertEqual(sorted(twin["trust_by_context"]), ["algebra", "security"])
        self.assertEqual(twin["trust_by_context"]["algebra"]["corrected"], [fixed["event_id"]])
        self.assertNotIn("trust", twin["measures"])
        for ids in twin["activity"]["by_tier"].values():
            self.assertTrue(all(i.startswith("EV-") for i in ids))
        with self.assertRaises(TwinError):
            build_twin([], "bad id!")


class DisputeTests(unittest.TestCase):
    def test_dispute_persists_until_someone_else_resolves(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "w.jsonl"
            record_event(ledger, verified(context="x"))
            record_dispute(ledger, subject="john", inference="capability:algebra", reason="Help was provided",
                           at="2026-09-20T00:00:00Z")
            cap = build_twin(read_chain(ledger), "john")["capabilities"]["algebra"]
            self.assertEqual((cap["state"], cap["dispute"]["state"]), ("DEMONSTRATED", "CONTESTED_BY_SUBJECT"))
            for kwargs in ({"by": "john", "decision": "UPHELD"}, {"by": "t", "decision": "IGNORED"}):
                with self.assertRaises(TwinError):
                    record_resolution(ledger, subject="john", inference="capability:algebra", note="n",
                                      at="2026-09-21T00:00:00Z", **kwargs)
            with self.assertRaises(TwinError):
                record_resolution(ledger, subject="john", inference="capability:python", by="t",
                                  decision="UPHELD", note="n", at="2026-09-21T00:00:00Z")
            with self.assertRaises(TwinError):
                record_dispute(ledger, subject="john", inference="capability:algebra", reason=" ", at="2026-09-21T00:00:00Z")
            record_resolution(ledger, subject="john", inference="capability:algebra", by="teacher:9",
                              decision="REVISED", note="Scope reduced", at="2026-09-21T00:00:00Z")
            entries = read_chain(ledger)
            dispute = build_twin(entries, "john")["capabilities"]["algebra"]["dispute"]
            self.assertEqual(dispute["state"], "RESOLVED_REVISED")
            self.assertEqual(sum(e.get("kind") == "event" for e in entries), 1)


class ProjectionTests(unittest.TestCase):
    def test_audiences_minors_and_aggregates(self) -> None:
        entries = [verified(visibility="PUBLIC"), verified(context="c2", visibility="COMMUNITY"),
                   verified(context="c3", participants=[{"id": "bob", "relation": "TAUGHT"}])]
        private = project(entries, "john", "private")
        self.assertEqual(private["capabilities"]["algebra"]["state"], "VERIFIED")
        community = project(entries, "john", "community", shared=("capabilities", "community"))
        self.assertEqual(community["capabilities"]["algebra"]["state"], "VERIFIED")
        self.assertIn("history", community["withheld"])
        public = project(entries, "john", "public", shared=("capabilities",))
        self.assertEqual(public["capabilities"]["algebra"]["state"], "DEMONSTRATED")
        self.assertNotIn("community", project(entries, "john", "community", shared=("community",), minor=True))
        self.assertIn("minor", project(entries, "john", "public", shared=("capabilities",), minor=True)["withheld"])
        for args in (("everyone", ()), ("public", ("secrets",))):
            with self.assertRaises(TwinError):
                project(entries, "john", args[0], shared=args[1])
        crowd = [verified(actor=f"p{i}", context="x") for i in range(12)] + [ev(actor="q", capability="rare")]
        crowd.append({"kind": "dispute"})
        state = world_state(crowd)
        self.assertEqual(state["capabilities"]["algebra"], {"people": 12, "with_verified_success": 12})
        self.assertEqual(state["capabilities"]["rare"], {"people": None, "with_verified_success": None})
        self.assertEqual(state["open_disputes"], 1)


class CliTests(unittest.TestCase):
    def run_cli(self, *args: str) -> tuple[int, Any]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ledger = str(root / "w.jsonl")
            (root / "e.json").write_text(json.dumps({"event_id": "E1", "actor": "john", "type": "REVIEW",
                                                     "target": "k", "capability": "review", "at": "2026-09-01T00:00:00Z"}))
            self.assertEqual(self.run_cli("--ledger", ledger, "record", str(root / "e.json"))[0], 0)
            code, twin = self.run_cli("--ledger", ledger, "twin", "john")
            self.assertEqual((code, twin["capabilities"]["review"]["state"]), (0, "STUDIED"))
            self.assertEqual(self.run_cli("--ledger", ledger, "twin", "john", "--audience", "public",
                                          "--share", "capabilities")[0], 0)
            common = ("--subject", "john", "--inference", "capability:review", "--at", "2026-09-02T00:00:00Z")
            self.assertEqual(self.run_cli("--ledger", ledger, "dispute", *common, "--reason", "no")[0], 0)
            self.assertEqual(self.run_cli("--ledger", ledger, "resolve", *common, "--by", "t", "--decision", "UPHELD",
                                          "--note", "n")[0], 0)
            self.assertEqual(self.run_cli("--ledger", ledger, "world")[1]["open_disputes"], 0)
            self.assertEqual(self.run_cli("--ledger", ledger, "record", str(root / "missing.json"))[0], 1)


if __name__ == "__main__":
    unittest.main()
