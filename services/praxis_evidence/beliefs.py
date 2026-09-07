#!/usr/bin/env python3
"""
beliefs.py - attributed propositions, never silently promoted to fact (doc
rule #2/#7). Enforcement here is schema-level, not just app-level: the
epistemic_class field's select enum has exactly ONE legal value
(ATTRIBUTED_BELIEF), so no code path - buggy or malicious - can flip a
belief record into a claim by mutation. Promoting a belief into product
knowledge means creating a SEPARATE knowledge_claims row that cites the
belief as evidence_of_belief, never rewriting the belief row itself.
"""
from __future__ import annotations

from client import PocketBaseClient
from registry import next_display_id


def create_belief(client: PocketBaseClient, *, proposition: str, domain: str,
                   attributed_actor: str = "", attributed_community: str = "",
                   attributed_school: str = "", attributed_tradition: str = "",
                   context: dict | None = None, evidence_of_belief: dict | None = None,
                   supports_claim_ids: list[str] | None = None,
                   conflicts_with_claim_ids: list[str] | None = None) -> dict:
    display_id = next_display_id("knowledge_beliefs", client)
    record = {
        "display_id": display_id, "proposition": proposition, "domain": domain,
        "attributed_actor": attributed_actor, "attributed_community": attributed_community,
        "attributed_school": attributed_school, "attributed_tradition": attributed_tradition,
        "context": context or {}, "evidence_of_belief": evidence_of_belief or {},
        "supports_claims": supports_claim_ids or [], "conflicts_with_claims": conflicts_with_claim_ids or [],
        "prevalence_state": "UNKNOWN", "epistemic_class": "ATTRIBUTED_BELIEF",
    }
    return client.create("knowledge_beliefs", record)


def coexisting_views(client: PocketBaseClient, domain: str) -> list[dict]:
    """Returns ALL attributed beliefs for a domain side by side - disputed
    topics keep VIEW A / VIEW B / VIEW C coexisting, never collapsed by vote."""
    return client.list("knowledge_beliefs", filter_expr=f'domain="{domain}"')
