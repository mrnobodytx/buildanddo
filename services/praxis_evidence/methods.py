#!/usr/bin/env python3
"""methods.py - competing methods for one objective, never a forced 'best
method' without a stated context and metric (doc rule #5/#18)."""
from __future__ import annotations

from client import PocketBaseClient
from registry import next_display_id


def create_method(client: PocketBaseClient, *, objective: str, domain: str,
                   prerequisites: dict | None = None, parameters: dict | None = None,
                   steps: str = "", applicable_context: dict | None = None,
                   contraindications: dict | None = None, outcome_metrics: dict | None = None,
                   knowledge_state: str = "PROPOSED") -> dict:
    display_id = next_display_id("praxis_methods", client)
    record = {
        "display_id": display_id, "objective": objective, "domain": domain,
        "prerequisites": prerequisites or {}, "parameters": parameters or {}, "steps": steps,
        "applicable_context": applicable_context or {}, "contraindications": contraindications or {},
        "outcome_metrics": outcome_metrics or {}, "community_attempts": 0,
        "community_verified_successes": 0, "knowledge_state": knowledge_state,
    }
    return client.create("praxis_methods", record)


def methods_for_objective(client: PocketBaseClient, objective: str) -> list[dict]:
    """Returns ALL competing methods for an objective - never collapses to one
    'best' method. Caller/UI decides how to present alternatives by context+metric."""
    return client.list("praxis_methods", filter_expr=f'objective~"{objective}"')
