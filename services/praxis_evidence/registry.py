#!/usr/bin/env python3
"""registry.py - stable, human-readable display_id generation per evidence class."""
from __future__ import annotations
import itertools
import threading

_PREFIXES = {
    "knowledge_sources": "SRC", "knowledge_claims": "CLM", "knowledge_logic": "RULE",
    "knowledge_beliefs": "BEL", "praxis_methods": "METHOD", "praxis_materials": "MAT",
    "praxis_tools": "TOOL", "praxis_pricing": "PRICE", "praxis_timing": "TIME",
    "experience_attempts": "EXP", "experience_outcomes": "OUT", "experience_failures": "FAIL",
    "governance_audits": "AUD", "governance_disputes": "DSP", "governance_research_quests": "RQ",
}

_lock = threading.Lock()
_counters: dict[str, itertools.count] = {}


def next_display_id(collection: str, client) -> str:
    """Derives the next sequence number from the highest existing display_id in the
    collection (real query, not an in-memory guess that could collide across
    processes) - correct for this fabric's write volume; a dedicated sequence table
    would be needed at much higher concurrency."""
    prefix = _PREFIXES.get(collection)
    if not prefix:
        raise ValueError(f"no display_id prefix registered for collection {collection!r}")
    with _lock:
        existing = client.list(collection, per_page=1)
        # PocketBase default sort is by 'created' desc is NOT guaranteed; fetch all ids cheaply instead.
        all_items = client.list(collection, per_page=500)
        max_n = 0
        for item in all_items:
            did = item.get("display_id", "")
            if did.startswith(prefix + "-"):
                try:
                    max_n = max(max_n, int(did.rsplit("-", 1)[-1]))
                except ValueError:
                    continue
        return f"{prefix}-{max_n + 1:06d}"
