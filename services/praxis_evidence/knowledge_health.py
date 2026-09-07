#!/usr/bin/env python3
"""
knowledge_health.py - per-dimension health for a domain, NEVER averaged into
one fake score (doc rule #24). A domain can be 100% source-covered and 0%
reproduced at the same time; hiding that behind one number is the exact
anti-pattern this fabric exists to prevent.
"""
from __future__ import annotations
import datetime as dt

from client import PocketBaseClient
from source_lineage import independent_source_count

_VERIFIED_STATES = {"COMMUNITY_AUDITED", "EXPERT_REVIEWED", "REPRODUCED", "FIELD_VERIFIED"}
_SOURCED_STATES = {"SOURCE_BACKED", "CORROBORATED"} | _VERIFIED_STATES


def domain_health(client: PocketBaseClient, domain: str, *, freshness_days: int = 180) -> dict:
    claims = client.list("knowledge_claims", filter_expr=f'domain="{domain}"')
    methods = client.list("praxis_methods", filter_expr=f'domain="{domain}"')
    logic_rules = client.list("knowledge_logic", filter_expr=f'domain="{domain}"')
    open_quests = client.list("governance_research_quests",
                                filter_expr=f'subject_type="CLAIM" && (status="OPEN" || status="IN_PROGRESS")')

    n_claims = len(claims)
    if n_claims == 0:
        return {"domain": domain, "state": "NO_DATA", "n_claims": 0}

    sourced_or_better = sum(1 for c in claims if c["epistemic_state"] in _SOURCED_STATES)
    reproduced_or_verified = sum(1 for c in claims if c["epistemic_state"] in _VERIFIED_STATES)
    disputed_claims = sum(1 for c in claims if c["epistemic_state"] == "DISPUTED")

    all_source_ids = sorted({sid for c in claims for sid in (c.get("supporting_sources") or [])})
    lineage = independent_source_count(client, all_source_ids) if all_source_ids else \
        {"raw_count": 0, "independent_count": 0}

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=freshness_days)

    def _fresh(c: dict) -> bool:
        try:
            return dt.datetime.fromisoformat(c["observed_at"].replace("Z", "+00:00")) >= cutoff
        except (ValueError, KeyError):
            return False

    fresh_count = sum(1 for c in claims if _fresh(c))

    method_evidence = (sum(m.get("community_attempts") or 0 for m in methods) / len(methods)) if methods else 0.0

    # unresolved_disputes counts claims directly in the DISPUTED epistemic state -
    # a simpler, honest signal than cross-referencing governance_disputes, which
    # nothing populates yet (no disputes.py built - a known, stated gap, not
    # silently assumed to be covered).
    domain_claim_ids = {c["display_id"] for c in claims}
    domain_quest_ids = {q["subject_id"] for q in open_quests}
    open_research_gaps = len(domain_quest_ids & domain_claim_ids)

    return {
        "domain": domain, "state": "OK",
        "n_claims": n_claims, "n_methods": len(methods), "n_logic_rules": len(logic_rules),
        "factual_coverage": round(sourced_or_better / n_claims, 3),
        "source_diversity": {"raw_sources": lineage["raw_count"], "independent_sources": lineage["independent_count"]},
        "freshness": round(fresh_count / n_claims, 3),
        "reproducibility": round(reproduced_or_verified / n_claims, 3),
        "method_evidence_mean_attempts": round(method_evidence, 1),
        "unresolved_disputes": disputed_claims,
        "open_research_gaps": open_research_gaps,
        "safety_review": "NOT_IMPLEMENTED",  # honest placeholder - no SAFETY_FLAG-specific query built yet
    }
