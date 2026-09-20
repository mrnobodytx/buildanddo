# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/schema.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/models.py, libs/semantic_twin/transactions.py, libs/semantic_twin/transitions.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/models.py; DEPENDS_ON libs/semantic_twin/transactions.py; DEPENDS_ON libs/semantic_twin/transitions.py
# DAG Node:    semantic-twin.phase-0.schema
# Intent:      Export a deterministic versioned wire schema from the same definitions used for runtime validation.
# ───────────────────────────────────────────────────────────────

"""Export the structural JSON Schema; Python constructors enforce semantic guards."""

from __future__ import annotations

import json
from typing import Any

from .contracts import SCHEMA_VERSION
from .models import CanonicalEventEnvelope, CanonicalObjectEnvelope
from .transactions import SemanticTransaction
from .transitions import StateDelta


def canonical_schema() -> dict[str, Any]:
    """Return a detached Draft 2020-12 schema for all top-level P0 wire contracts."""
    definitions: dict[str, Any] = {}
    choices: list[dict[str, str]] = []
    for contract in (
        CanonicalObjectEnvelope,
        CanonicalEventEnvelope,
        SemanticTransaction,
        StateDelta,
    ):
        schema = contract.json_schema()
        definitions.update(schema["$defs"])
        choices.append({"$ref": schema["$ref"]})
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"urn:citadel:semantic-twin:schema:{SCHEMA_VERSION}",
        "title": "Living Semantic System Twin P0",
        "description": "Structural wire schema; domain, evidence and cross-field rules are enforced by the Python contracts.",
        "oneOf": choices,
        "$defs": definitions,
    }


def main() -> None:
    """Print the schema without writing artifacts or contacting a service."""
    print(json.dumps(canonical_schema(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
