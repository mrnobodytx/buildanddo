# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/twin.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/world_twin/events.py; PRODUCES apps/world_twin/projection.py
# DAG Node:    none
# Intent:      Answer what a person did, what they demonstrated, how they affected others and why the system believes it, with every figure traceable to events.
# ─────────────────────────────────────────────────────────────

"""Project a person's twin from the world event stream."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from apps.career.ledger import append_chain, read_chain
from apps.world_twin.events import TwinError, effective_state, ident, moment, tier

LADDER = ("STUDIED", "BUILDING", "DEMONSTRATED", "VERIFIED")
DECISIONS = ("UPHELD", "REVISED")


def _ladder(events: list[dict[str, Any]]) -> str:
    verified = [e for e in events if tier(e) == "verified" and e["outcome"] == "SUCCESS"]
    if len({e["context"] for e in verified}) >= 2:
        return "VERIFIED"
    if verified:
        return "DEMONSTRATED"
    if any(tier(e) == "outcome" for e in events):
        return "BUILDING"
    return "STUDIED"


def _timeline(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows, seen = [], []
    for event in sorted(events, key=lambda e: (e["at"], e["event_id"])):
        seen.append(event)
        before = _ladder(seen[:-1]) if len(seen) > 1 else None
        after = _ladder(seen)
        rows.append({"at": event["at"], "event": event["event_id"], "type": event["type"],
                     "context": event["context"], "outcome": event["outcome"], "state": effective_state(event),
                     "changed": f"{before} -> {after}" if before and before != after else None})
    return rows


def disputes(entries: list[dict[str, Any]], subject: str) -> dict[str, dict[str, Any]]:
    """Return the current dispute standing per disputed inference for a subject."""
    standing: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if entry.get("subject") != subject:
            continue
        if entry.get("kind") == "dispute":
            standing[entry["inference"]] = {"state": "CONTESTED_BY_SUBJECT", "reason": entry["reason"],
                                            "at": entry["at"], "resolution": None}
        elif entry.get("kind") == "resolution" and entry["inference"] in standing:
            standing[entry["inference"]].update(state=f"RESOLVED_{entry['decision']}",
                                                resolution={"by": entry["by"], "note": entry["note"]})
    return standing


def build_twin(entries: list[dict[str, Any]], subject: str) -> dict[str, Any]:
    """Build the full private twin for one subject; public views are projections of this."""
    ident(subject, "subject")
    events = [e for e in entries if e.get("kind") == "event"]
    mine = [e for e in events if e["actor"] == subject]
    by_tier: dict[str, list[str]] = defaultdict(list)
    by_type: dict[str, list[str]] = defaultdict(list)
    for event in mine:
        by_tier[tier(event)].append(event["event_id"])
        by_type[event["type"]].append(event["event_id"])
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in mine:
        if event["capability"] and event["type"] not in ("VIEW", "READ"):
            grouped[event["capability"]].append(event)
    for event in mine:
        if event["capability"] and event["capability"] not in grouped:
            grouped[event["capability"]] = []
    contested = disputes(entries, subject)
    capabilities = {
        cap: {"state": _ladder(rows) if rows else "STUDIED", "why": _timeline(rows),
              "dispute": contested.get(f"capability:{cap}")}
        for cap, rows in sorted(grouped.items())
    }
    attempts = sorted((e for e in mine if e["outcome"] != "NONE" and e["evidence"]), key=lambda e: e["at"])
    failures = [e for e in attempts if e["outcome"] == "FAILURE"]
    corrected = [f["event_id"] for f in failures if any(
        s["capability"] == f["capability"] and s["at"] > f["at"] and s["outcome"] == "SUCCESS"
        and tier(s) == "verified" for s in attempts)]
    relations: dict[tuple[str, str], list[str]] = defaultdict(list)
    for event in events:
        if event["actor"] == subject:
            for person in event["participants"]:
                relations[(person["relation"], person["id"])].append(event["event_id"])
            if effective_state(event) == "VERIFIED":
                for verifier in event["verified_by"]:
                    relations[("VERIFIED_BY", verifier)].append(event["event_id"])
        elif any(p["id"] == subject for p in event["participants"]):
            relations[("WORKED_WITH", event["actor"])].append(event["event_id"])
    effects = {effect: e["event_id"] for e in mine if tier(e) == "verified" for effect in e["world_effect"]}
    trust: dict[str, dict[str, Any]] = defaultdict(lambda: {"verified": [], "failures_recorded": [], "corrected": []})
    for event in mine:
        if tier(event) == "verified":
            trust[event["context"]]["verified"].append(event["event_id"])
        if event in failures:
            trust[event["context"]]["failures_recorded"].append(event["event_id"])
            if event["event_id"] in corrected:
                trust[event["context"]]["corrected"].append(event["event_id"])
    for context, rows in trust.items():
        rows["last_at"] = max(e["at"] for e in mine if e["context"] == context)
    meaningful = [e["event_id"] for e in mine if tier(e) != "raw"]
    demonstrated = sorted(c for c, v in capabilities.items() if v["state"] in ("DEMONSTRATED", "VERIFIED"))
    return {
        "schema": "buildanddo.world-twin/v1", "subject": subject,
        "activity": {"by_tier": {t: sorted(ids) for t, ids in sorted(by_tier.items())},
                     "by_type": {t: sorted(ids) for t, ids in sorted(by_type.items())}},
        "capabilities": capabilities,
        "history": {"attempts": [e["event_id"] for e in attempts],
                    "successes": [e["event_id"] for e in attempts if e["outcome"] == "SUCCESS"],
                    "failures": [e["event_id"] for e in failures], "corrected": corrected,
                    "unresolved": [f["event_id"] for f in failures if f["event_id"] not in corrected]},
        "community": [{"relation": rel, "with": who, "events": sorted(ids)}
                      for (rel, who), ids in sorted(relations.items())],
        "impact": {"world_effects": dict(sorted(effects.items()))},
        "measures": {
            "activity": {"value": len(meaningful), "events": sorted(meaningful)},
            "capability": {"value": len(demonstrated), "capabilities": demonstrated},
            "contribution": {"value": len(effects), "events": sorted(set(effects.values()))},
        },
        "trust_by_context": {c: dict(v) for c, v in sorted(trust.items())},
        "contexts": dict(sorted(Counter(e["context"] for e in mine).items())),
        "note": "each figure lists its events; activity, capability, contribution and trust are separate on purpose",
    }


def record_dispute(ledger: Path, *, subject: str, inference: str, reason: str, at: str) -> dict[str, Any]:
    """Let a subject contest an inference about themselves; nothing is deleted."""
    if not isinstance(reason, str) or not reason.strip():
        raise TwinError("a dispute needs a reason")
    return append_chain(ledger, {"kind": "dispute", "subject": ident(subject, "subject"),
                                 "inference": ident(inference, "inference"), "reason": reason.strip()[:1000],
                                 "at": moment(at)})


def record_resolution(ledger: Path, *, subject: str, inference: str, by: str, decision: str, note: str,
                      at: str) -> dict[str, Any]:
    """Resolve a dispute; the subject cannot resolve their own dispute."""
    if decision not in DECISIONS:
        raise TwinError(f"decision must be one of {', '.join(DECISIONS)}")
    if ident(by, "by") == subject:
        raise TwinError("a subject cannot resolve their own dispute")
    if inference not in disputes(read_chain(ledger), subject):
        raise TwinError("there is no open dispute for that inference")
    return append_chain(ledger, {"kind": "resolution", "subject": subject, "inference": inference, "by": by,
                                 "decision": decision, "note": str(note)[:1000], "at": moment(at)})
