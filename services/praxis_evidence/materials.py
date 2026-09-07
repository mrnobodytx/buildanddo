#!/usr/bin/env python3
"""materials.py / tools.py - canonical identity for physical/digital resources,
domain-agnostic (a material is a 2x4 in construction, an ingredient in cooking,
a resistor in electronics - same schema, different semantics)."""
from __future__ import annotations

from client import PocketBaseClient
from registry import next_display_id


def create_material(client: PocketBaseClient, *, canonical_name: str, category: str,
                     aliases: list[str] | None = None, specification: dict | None = None,
                     substitutions: list | None = None, hazards: list[str] | None = None) -> dict:
    display_id = next_display_id("praxis_materials", client)
    record = {
        "display_id": display_id, "canonical_name": canonical_name, "category": category,
        "aliases": aliases or [], "specification": specification or {},
        "substitutions": substitutions or [], "hazards": hazards or [],
    }
    return client.create("praxis_materials", record)


def create_tool(client: PocketBaseClient, *, canonical_name: str, category: str,
                 specification: dict | None = None) -> dict:
    display_id = next_display_id("praxis_tools", client)
    record = {"display_id": display_id, "canonical_name": canonical_name, "category": category,
               "specification": specification or {}}
    return client.create("praxis_tools", record)
