#!/usr/bin/env python3
"""
source_lineage.py - "five websites repeating one article are not five
independent sources" (doc rule #7).

Only DERIVED_FROM and COPIES edges collapse lineage - they mean "this
source's content came from that other source." CITES (a reference),
REPRODUCES (an independent repeat that itself constitutes new evidence),
CONTRADICTS, and INDEPENDENT_OF do NOT collapse: reproducing an experiment
independently is exactly what corroboration means and must count fully,
not be treated as a copy.
"""
from __future__ import annotations

from client import PocketBaseClient


def record_lineage(client: PocketBaseClient, *, source_id: str, relation: str, target_source_ids: list[str]) -> dict:
    valid = {"cites", "derived_from", "copies", "reproduces", "contradicts_sources", "independent_of"}
    if relation not in valid:
        raise ValueError(f"unknown lineage relation {relation!r}, expected one of {sorted(valid)}")
    existing = client.get("knowledge_sources", source_id).get(relation, [])
    merged = sorted(set(existing) | set(target_source_ids))
    return client._request("PATCH", f"/api/collections/knowledge_sources/records/{source_id}",  # noqa: SLF001
                            {relation: merged})


def _lineage_root(client: PocketBaseClient, source_id: str, _cache: dict[str, str] | None = None) -> str:
    """Follows derived_from/copies edges to the earliest ancestor with no such
    edges of its own - that's the lineage root. Cycle-safe (visited set)."""
    cache = _cache if _cache is not None else {}
    if source_id in cache:
        return cache[source_id]
    visited = {source_id}
    current = source_id
    while True:
        record = client.get("knowledge_sources", current)
        upstream = (record.get("derived_from") or []) + (record.get("copies") or [])
        upstream = [u for u in upstream if u not in visited]
        if not upstream:
            cache[source_id] = current
            return current
        visited.add(upstream[0])
        current = upstream[0]


def independent_source_count(client: PocketBaseClient, source_ids: list[str]) -> dict:
    """Returns both the raw count and the collapsed independent-lineage count for
    a set of sources supposedly corroborating a claim. The doc's own example:
    100 sources copying one origin must reduce to 1, never inflate corroboration."""
    if not source_ids:
        return {"raw_count": 0, "independent_count": 0, "lineage_roots": []}
    cache: dict[str, str] = {}
    roots = {_lineage_root(client, sid, cache) for sid in source_ids}
    return {"raw_count": len(source_ids), "independent_count": len(roots), "lineage_roots": sorted(roots)}
