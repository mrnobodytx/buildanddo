#!/usr/bin/env python3
"""
research_quests.py - the compiler that turns a knowledge gap into a typed
request for help, never an automatic rewrite (doc rule: "the system should
not automatically rewrite the method... instead: DRIFT DETECTED -> ResearchQuest").

Deduplicated: never opens a second OPEN quest for the same (subject_type,
subject_id) - re-running the compiler on an already-flagged gap is a no-op,
not quest spam.
"""
from __future__ import annotations
import datetime as dt

from client import PocketBaseClient
from registry import next_display_id

TRIGGER_REASONS = ["CLAIM_DISPUTED", "PRICE_STALE", "TIMING_LOW_CONFIDENCE", "METHOD_OUTCOMES_CONFLICT",
                    "MATERIAL_LACKS_EVIDENCE", "LOGIC_RULE_FAILS", "BELIEF_FACT_DISPUTE",
                    "NEW_DOMAIN_INSUFFICIENT", "SAFETY_FLAG"]


def open_research_quest(client: PocketBaseClient, *, trigger_reason: str, subject_type: str, subject_id: str,
                         question: str, required_capabilities: list[str] | None = None) -> dict:
    if trigger_reason not in TRIGGER_REASONS:
        raise ValueError(f"unknown trigger_reason {trigger_reason!r}, expected one of {TRIGGER_REASONS}")

    existing_open = client.list(
        "governance_research_quests",
        filter_expr=f'subject_type="{subject_type}" && subject_id="{subject_id}" && (status="OPEN" || status="IN_PROGRESS")',
    )
    if existing_open:
        return {"created": False, "reason": "an OPEN/IN_PROGRESS quest already exists for this subject",
                 "existing_quest": existing_open[0]}

    display_id = next_display_id("governance_research_quests", client)
    record = {
        "display_id": display_id, "trigger_reason": trigger_reason, "subject_type": subject_type,
        "subject_id": subject_id, "question": question, "required_capabilities": required_capabilities or [],
        "status": "OPEN",
    }
    quest = client.create("governance_research_quests", record)
    return {"created": True, "quest": quest}


def compile_quests_for_disputed_claims(client: PocketBaseClient) -> list[dict]:
    """The actual auto-trigger: scans real DISPUTED claims and opens a quest for
    any that doesn't already have one. Idempotent - safe to run repeatedly
    (e.g. on a schedule) without creating duplicate quests."""
    disputed = client.list("knowledge_claims", filter_expr='epistemic_state="DISPUTED"')
    results = []
    for claim in disputed:
        result = open_research_quest(
            client, trigger_reason="CLAIM_DISPUTED", subject_type="CLAIM", subject_id=claim["display_id"],
            question=f"Claim {claim['display_id']} ({claim['subject']} {claim['predicate']} {claim['object']}) "
                      f"is disputed - resolve via independent reproduction or corroborating evidence.",
            required_capabilities=["research.evidence_synthesis", "research.reproducibility"])
        results.append({"claim": claim["display_id"], **result})
    return results


def compile_quests_for_stale_prices(client: PocketBaseClient, *, staleness_days: int = 90) -> list[dict]:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=staleness_days)
    prices = client.list("praxis_pricing", per_page=500)
    by_material: dict[str, list[dict]] = {}
    for p in prices:
        by_material.setdefault(p["material"], []).append(p)

    results = []
    for material_id, observations in by_material.items():
        newest = max(observations, key=lambda o: o.get("observed_at", ""))
        try:
            newest_dt = dt.datetime.fromisoformat(newest["observed_at"].replace("Z", "+00:00"))
        except (ValueError, KeyError):
            continue
        if newest_dt < cutoff:
            result = open_research_quest(
                client, trigger_reason="PRICE_STALE", subject_type="MATERIAL", subject_id=material_id,
                question=f"No price observation for material {material_id} in over {staleness_days} days - "
                          f"needs a fresh price check.",
                required_capabilities=["research.field_observation"])
            results.append({"material": material_id, **result})
    return results
