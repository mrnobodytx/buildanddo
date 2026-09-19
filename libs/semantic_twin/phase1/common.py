# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/common.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/vocabulary.py
# EnumType:    Adapter
# EnumEdges:   PRODUCES libs/semantic_twin/phase1/compiler.py; CONSUMES libs/semantic_twin/ingestion/graph.py
# DAG Node:    semantic-twin.phase-1.common
# Intent:      Keep local Phase 1 adapters deterministic through shared identity, path, JSON and relation helpers.
# ────────────────────────────────────────────────────────

"""Share deterministic helpers across local Phase 1 adapters."""

from __future__ import annotations

from collections.abc import Mapping
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ..models import Relation
from ..vocabulary import EvidenceState, RelationPredicate


def stable_id(namespace: str, *parts: object) -> str:
    """Build a stable semantic identifier from caller-owned values."""

    normalized = "\x1f".join(str(part) for part in parts)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{namespace}://buildanddo/{digest}"


def named_id(namespace: str, name: str) -> str:
    """Build a readable identifier for a normalized name."""

    return f"{namespace}://buildanddo/{quote(name.strip(), safe='@._-')}"


def relative_path(path: Path, repository_root: Path | None) -> str:
    """Render a repository-relative path when the file belongs to the repository."""

    resolved = path.resolve()
    if repository_root is not None:
        try:
            return resolved.relative_to(repository_root.resolve()).as_posix()
        except ValueError:
            pass
    return resolved.as_posix()


def read_json(path: Path) -> Any:
    """Read one JSON value and report its path on malformed input."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid JSON export: {path}") from exc


def as_mapping(value: Any) -> Mapping[str, Any]:
    """Return a JSON object or an empty read-only-compatible mapping."""

    return value if isinstance(value, Mapping) else {}


def relation(
    predicate: RelationPredicate,
    target: str,
    evidence: str,
    *,
    state: EvidenceState = EvidenceState.OBSERVED,
    confidence: float = 1.0,
) -> Relation:
    """Create one deterministic evidence-bearing Phase 0 relation."""

    return Relation(
        predicate=predicate,
        target=target,
        evidence=(evidence,),
        confidence=confidence,
        state=state,
    )
