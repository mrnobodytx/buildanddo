# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/receipts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, .bits/out
# EnumType:    Service
# EnumEdges:   CONSUMES .bits/out; PRODUCES libs/semantic_twin/ingestion/pipeline.py; DEPENDS_ON libs/semantic_twin/ingestion/graph.py
# DAG Node:    semantic-twin.phase-1.receipt-ingestion
# Intent:      Normalize local report and memory evidence into receipt records without treating source assertions as deployed truth.
# ──────────────────────────────────────────────────────────

"""Ingest deployment-relevant evidence from local dispatch reports and memory."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..contracts import ContractError
from ..vocabulary import EvidenceState, RelationPredicate
from .drafts import ObjectDraft, RelationDraft, make_object

_TIMESTAMP = re.compile(
    r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b"
)
_SHA = re.compile(
    r"(?<![0-9a-fA-F])(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{7,12})(?![0-9a-fA-F])"
)
_VERIFICATION = re.compile(r"\b(PASS|FAIL|HOLD)(?:_[A-Z_]+)?\b", re.IGNORECASE)
_STATE_FIELD = re.compile(
    r"\b(?:status|state|result)\s*:\s*([A-Z][A-Z0-9_-]*)",
    re.IGNORECASE,
)
_CODE_REFERENCE = re.compile(r"`([^`]+)`")


@dataclass(frozen=True, slots=True)
class DeploymentReceipt:
    """Normalize the release evidence carried by one report or memory file."""

    source_path: str
    dispatch_id: str
    format: str
    timestamps: tuple[str, ...]
    shas: tuple[str, ...]
    states: tuple[str, ...]
    verification_results: tuple[str, ...]
    evidence_refs: tuple[str, ...]
    source_digest: str


def read_json(path: Path, *, raw: bytes | None = None) -> Any:
    """Read captured JSON, rejecting ambiguous keys and non-finite values."""

    def pairs(values: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in values:
            if key in result:
                raise ContractError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def constant(value: str) -> object:
        raise ContractError(f"non-finite JSON value: {value}")

    try:
        return json.loads(
            path.read_bytes() if raw is None else raw,
            object_pairs_hook=pairs,
            parse_constant=constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ContractError(f"invalid JSON export: {path}") from exc


def _stable(values: Iterable[str]) -> tuple[str, ...]:
    """De-duplicate non-empty strings while retaining first-observed order."""

    return tuple(dict.fromkeys(value for value in values if value))


def _json_values(value: Any, prefix: str = "") -> Iterable[tuple[str, Any]]:
    """Yield every JSON leaf with its dotted key path."""

    if isinstance(value, Mapping):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            yield from _json_values(child, child_prefix)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _json_values(child, f"{prefix}[{index}]")
    else:
        yield prefix, value


def _markdown_receipt(path: Path, source_path: str) -> DeploymentReceipt:
    """Extract evidence fields from a Markdown dispatch report."""

    raw = path.read_bytes()
    text = raw.decode("utf-8")
    timestamps = _stable(_TIMESTAMP.findall(text))
    shas = _stable(value.lower() for value in _SHA.findall(text))
    verification = _stable(value.upper() for value in _VERIFICATION.findall(text))
    states = _stable(
        (
            *(value.upper() for value in _STATE_FIELD.findall(text)),
            *verification,
        )
    )
    references: list[str] = []
    for line in text.splitlines():
        if re.search(
            r"\b(?:verify|evidence|payload|receipt|file)s?\s*:", line, re.IGNORECASE
        ):
            references.extend(_CODE_REFERENCE.findall(line))
    return DeploymentReceipt(
        source_path=source_path,
        dispatch_id=path.parent.name,
        format="markdown",
        timestamps=timestamps,
        shas=shas,
        states=states,
        verification_results=verification,
        evidence_refs=_stable(references),
        source_digest=hashlib.sha256(raw).hexdigest(),
    )


def _json_receipt(path: Path, source_path: str) -> DeploymentReceipt:
    """Extract evidence fields from a JSON memory payload."""

    raw = path.read_bytes()
    payload = read_json(path, raw=raw)
    timestamps: list[str] = []
    shas: list[str] = []
    states: list[str] = []
    verification: list[str] = []
    references: list[str] = []
    for key, value in _json_values(payload):
        if not isinstance(value, str):
            continue
        key_folded = key.casefold()
        timestamps.extend(_TIMESTAMP.findall(value))
        if "sha" in key_folded or "commit" in key_folded:
            shas.extend(match.lower() for match in _SHA.findall(value))
        if any(
            marker in key_folded for marker in ("state", "status", "outcome", "result")
        ):
            states.append(value.upper())
            verification.extend(match.upper() for match in _VERIFICATION.findall(value))
        if any(
            marker in key_folded for marker in ("path", "ref", "evidence", "verify")
        ):
            references.append(value)
    return DeploymentReceipt(
        source_path=source_path,
        dispatch_id=path.parent.name,
        format="json",
        timestamps=_stable(timestamps),
        shas=_stable(shas),
        states=_stable(states),
        verification_results=_stable(verification),
        evidence_refs=_stable(references),
        source_digest=hashlib.sha256(raw).hexdigest(),
    )


def ingest_deployment_receipts(
    evidence_root: Path,
    *,
    repository_root: Path | None = None,
) -> tuple[DeploymentReceipt, ...]:
    """Read every local report and memory payload under the evidence tree."""

    root = repository_root.resolve() if repository_root is not None else None
    records: list[DeploymentReceipt] = []
    paths = sorted(
        (
            *evidence_root.glob("*/report.md"),
            *evidence_root.glob("*/memory.json"),
        ),
        key=lambda item: item.as_posix(),
    )
    for path in paths:
        resolved = path.resolve()
        if root is not None:
            try:
                source_path = resolved.relative_to(root).as_posix()
            except ValueError:
                source_path = resolved.as_posix()
        else:
            source_path = path.as_posix()
        if path.name == "report.md":
            records.append(_markdown_receipt(path, source_path))
        else:
            records.append(_json_receipt(path, source_path))
    return tuple(records)


def _receipt_id(record: DeploymentReceipt) -> str:
    """Create a stable identity for one local receipt file."""

    digest = hashlib.sha256(record.source_path.encode("utf-8")).hexdigest()
    return f"receipt://buildanddo/{digest}"


def receipt_objects(
    records: tuple[DeploymentReceipt, ...],
    *,
    release_receipt_id: str,
    commit: str | None = None,
) -> tuple[ObjectDraft, ...]:
    """Convert normalized receipt files into canonical graph objects."""

    objects: list[ObjectDraft] = []
    for record in records:
        relation = RelationDraft(
            predicate=RelationPredicate.REFINES,
            target=release_receipt_id,
            evidence=(record.source_path,),
            confidence=1.0,
            state=EvidenceState.OBSERVED,
        )
        objects.append(
            make_object(
                _receipt_id(record),
                "DeploymentReceipt",
                record.source_path,
                claims=(
                    {
                        "dispatch_id": record.dispatch_id,
                        "format": record.format,
                        "deployment_timestamps": list(record.timestamps),
                        "commit_shas": list(record.shas),
                        "states": list(record.states),
                        "verification_results": list(record.verification_results),
                        "evidence_refs": list(record.evidence_refs),
                    },
                ),
                relations=(relation,),
                evidence_state=EvidenceState.OBSERVED,
                lifecycle_state="INGESTED_EVIDENCE",
                commit=commit,
                documentation=(record.source_path,),
                input_digest=record.source_digest,
            )
        )
    return tuple(objects)
