# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/verdict.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity/contract.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/integrity/contract.py; PRODUCES apps/integrity/settlement.py
# DAG Node:    none
# Intent:      Adjudicate a claimed success dimension by dimension from independent verifiers only, keeping disagreement instead of averaging it away.
# ─────────────────────────────────────────────────────────────

"""Hard-gate, multi-dimension adjudication with measured verifier independence."""

from __future__ import annotations

from typing import Any

from apps.career.evidence import canonical_digest
from apps.integrity.contract import INDEPENDENT_KINDS, VERIFIER_KINDS, IntegrityError

DIMENSIONS = ("OUTCOME", "PROVENANCE", "SAFETY", "GENERALIZATION", "NEGATIVE_CONTROL", "INDEPENDENCE",
              "REPRODUCIBILITY")
# Verifiers may report these; INDEPENDENCE and PROVENANCE are computed here, never reported.
REPORTED = ("OUTCOME", "SAFETY", "GENERALIZATION", "NEGATIVE_CONTROL", "REPRODUCIBILITY")
RESULTS = ("PASS", "FAIL")


def _report(raw: Any, contract: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict) or raw.get("kind") not in VERIFIER_KINDS:
        raise IntegrityError("each report needs a known verifier kind")
    results = raw.get("results", {})
    if not isinstance(results, dict) or not set(results) <= set(REPORTED) or \
            any(value not in RESULTS for value in results.values()):
        raise IntegrityError(f"report results may cover only {', '.join(REPORTED)} with PASS or FAIL")
    shortcuts = raw.get("shortcuts", [])
    if not isinstance(shortcuts, list):
        raise IntegrityError("shortcuts must be a list")
    return {"verifier": str(raw.get("verifier", "")), "family": str(raw.get("family", "")), "kind": raw["kind"],
            "contract": raw.get("contract"), "results": dict(results), "shortcuts": [str(s) for s in shortcuts]}


def independent(report: dict[str, Any], contract: dict[str, Any]) -> bool:
    """Return whether a report is independent of the actor by identity, model family and kind."""
    return (report["kind"] in INDEPENDENT_KINDS and report["kind"] in contract["verifier_kinds"]
            and report["verifier"] not in ("", contract["actor"])
            and report["family"] != contract["actor_family"])


def adjudicate(contract: dict[str, Any], evidence: list[dict[str, Any]], reports: list[Any]) -> dict[str, Any]:
    """Return per-dimension results, disagreements and a final verdict; nothing is averaged."""
    parsed = [_report(item, contract) for item in reports]
    rejected = [r["verifier"] for r in parsed if r["contract"] != contract["digest"]]
    usable = [r for r in parsed if r["contract"] == contract["digest"]]
    counted = [r for r in usable if independent(r, contract)]
    ignored = [r["verifier"] for r in usable if not independent(r, contract)]
    dims: dict[str, str] = {}
    disagreements: dict[str, dict[str, str]] = {}
    for dim in REPORTED:
        votes = {r["verifier"]: r["results"][dim] for r in counted if dim in r["results"]}
        if not votes:
            dims[dim] = "UNKNOWN"
        elif len(set(votes.values())) > 1:
            dims[dim], disagreements[dim] = "CONTESTED", votes
        else:
            dims[dim] = next(iter(votes.values()))
    world = {item.get("kind") for item in evidence if isinstance(item, dict) and item.get("source") == "world"
             and item.get("observed_by") != contract["actor"]}
    missing = [kind for kind in contract["required_evidence"] if kind not in world]
    dims["PROVENANCE"] = "FAIL" if missing else "PASS"
    identities = {r["verifier"] for r in counted}
    families = {r["family"] for r in counted}
    dims["INDEPENDENCE"] = "PASS" if min(len(identities), len(families)) >= contract["min_independent"] else "FAIL"
    shortcuts = sorted({s for r in counted for s in r["shortcuts"] if s in contract["disallowed_shortcuts"]})
    if shortcuts or any(v == "FAIL" for v in dims.values()):
        final = "FAIL"
    elif any(v == "CONTESTED" for v in dims.values()):
        final = "CONTESTED"
    elif any(v == "UNKNOWN" for v in dims.values()):
        final = "INCOMPLETE"
    else:
        final = "PASS"
    body = {
        "schema": "buildanddo.integrity-verdict/v1", "mission_id": contract["mission_id"],
        "contract": contract["digest"], "actor": contract["actor"],
        "dimensions": {dim: dims[dim] for dim in DIMENSIONS}, "final": final,
        "disagreements": disagreements, "shortcuts": shortcuts, "missing_evidence": missing,
        "independent_verifiers": sorted(identities), "ignored_reports": sorted(ignored),
        "rejected_reports": sorted(rejected),
    }
    return {**body, "digest": canonical_digest(body)}


def check_verdict(verdict: dict[str, Any]) -> None:
    """Refuse a verdict whose body no longer matches its digest."""
    if verdict.get("digest") != canonical_digest({k: v for k, v in verdict.items() if k != "digest"}):
        raise IntegrityError("verdict was edited after adjudication")
