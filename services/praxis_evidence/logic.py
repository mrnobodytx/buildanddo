#!/usr/bin/env python3
"""
logic.py - prerequisite/causal/diagnostic rules, kept SEPARATE from claims
(doc rule: logic describes relationships/prerequisites/rules/falsifiers, a
different truth behavior than a claim about the world). A DETERMINISTIC rule
type requires no falsifier (it's definitionally true given its conditions);
every other type must declare one, or it isn't a testable rule at all.
"""
from __future__ import annotations

from client import PocketBaseClient
from registry import next_display_id

RULE_TYPES = ["DETERMINISTIC", "EMPIRICAL_RULE", "HEURISTIC", "CAUSAL_HYPOTHESIS", "CULTURAL_RULE", "LEGAL_RULE"]


def create_logic_rule(client: PocketBaseClient, *, domain: str, rule_type: str, if_conditions: dict,
                       then_result: dict, certainty: str | None = None, falsifier: str = "",
                       evidence_claim_ids: list[str] | None = None, status: str = "PROPOSED") -> dict:
    if rule_type not in RULE_TYPES:
        raise ValueError(f"unknown rule_type {rule_type!r}, expected one of {RULE_TYPES}")
    if rule_type != "DETERMINISTIC" and not falsifier:
        raise ValueError(f"rule_type={rule_type} requires a falsifier - a non-deterministic rule "
                          f"with no way to be proven wrong isn't a testable rule")
    display_id = next_display_id("knowledge_logic", client)
    record = {
        "display_id": display_id, "domain": domain, "rule_type": rule_type,
        "if_conditions": if_conditions, "then_result": then_result, "certainty": certainty,
        "falsifier": falsifier, "evidence": evidence_claim_ids or [], "status": status,
    }
    return client.create("knowledge_logic", record)


def record_falsification(client: PocketBaseClient, *, rule_id: str) -> dict:
    """A rule whose falsifier condition was actually observed moves to REFUTED -
    never silently stays PROPOSED/COMMUNITY_TESTED once its own stated failure
    condition has occurred."""
    return client._request("PATCH", f"/api/collections/knowledge_logic/records/{rule_id}",  # noqa: SLF001
                            {"status": "REFUTED"})
