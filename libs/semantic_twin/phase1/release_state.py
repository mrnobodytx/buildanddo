# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/release_state.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tools/buildanddo_release.py, libs/semantic_twin/phase1/common.py
# EnumType:    Service
# EnumEdges:   CONSUMES state/sprint; CONSUMES .citadel-release; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.release-state
# Intent:      Normalize controller-generated release JSON into observed receipt objects without executing deployment code.
# ────────────────────────────────────────────────────────

"""Ingest local JSON receipts written by the release controller."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..contracts import ContractError
from ..ingestion.drafts import GraphDraft, make_object
from ..vocabulary import EvidenceState, RelationPredicate
from .common import read_json, relation, relative_path, stable_id

_TIME_KEYS = (
    "verified_at",
    "emitted_at",
    "deployed_at",
    "built_at",
    "generated_at",
    "timestamp",
)
_NESTED = {
    "build",
    "artifact",
    "deployment",
    "verification",
    "dora",
    "staging",
    "production",
}
_FIELDS = (
    "schema",
    "state",
    "status",
    "environment",
    "expected_sha",
    "deployed_sha",
    "commit_sha",
    "candidate_sha",
    "artifact_tree_sha256",
    "artifact_sha256",
    "artifact_digest",
    "payload_sha256",
    "receipt_path",
    "health_pass",
    "sha_match",
    "flagship_lesson_readback",
    "health_status",
    "version_status",
    "http_status",
    "remote_writes",
    *_TIME_KEYS,
)


@dataclass(frozen=True, slots=True)
class ReleaseStateReceipt:
    """Keep each receipt's exact file identity apart from release identities."""

    name: str
    source_path: str
    pointer: str
    fields: Mapping[str, Any]
    source_digest: str

    @property
    def environment(self) -> str | None:
        value = self.fields.get("environment")
        return value if isinstance(value, str) else None

    @property
    def commit_sha(self) -> str | None:
        for key in ("commit_sha", "candidate_sha", "deployed_sha"):
            value = self.fields.get(key)
            if isinstance(value, str):
                return value
        return None


def discover_release_receipts(repository_root: Path) -> tuple[Path, ...]:
    """Find controller receipts while excluding files inside deployed artifacts."""
    candidates: set[Path] = set()
    state_root = repository_root / "state"
    if state_root.is_dir():
        candidates.update(
            path
            for path in state_root.rglob("*.json")
            if "release" in {part.casefold() for part in path.parts}
        )
    artifact_root = repository_root / ".citadel-release"
    if artifact_root.is_dir():
        candidates.update(artifact_root.glob("*.json"))
    return tuple(sorted(candidates))


def _kind(payload: Mapping[str, Any], name: str) -> str:
    schema = payload.get("schema")
    if schema == "buildanddo.external-readback/v1":
        return "verification"
    if schema == "buildanddo.release-artifact/v1":
        return "build"
    if schema == "buildanddo.deployment/v1":
        return "deployment"
    if "dora" in name.casefold():
        return "dora"
    return "summary"


def ingest_release_receipts(
    paths: tuple[Path, ...], *, repository_root: Path | None = None
) -> tuple[ReleaseStateReceipt, ...]:
    """Normalize root and nested controller receipts without dropping readback identity."""
    records = []
    for path in sorted(set(paths)):
        raw = path.read_bytes()
        payload = read_json(path, raw=raw)
        if not isinstance(payload, Mapping):
            raise ContractError(f"release receipt must be an object: {path}")
        source = relative_path(path, repository_root)
        digest = hashlib.sha256(raw).hexdigest()
        name = path.stem.removesuffix(".latest")

        def visit(
            value: Mapping[str, Any],
            pointer: str,
            environment: str | None,
            name_hint: str,
        ) -> None:
            fields = {key: value[key] for key in _FIELDS if key in value}
            explicit = value.get("environment")
            env = explicit if isinstance(explicit, str) else environment
            if env is not None:
                fields["environment"] = env
            fields["receipt_kind"] = _kind(value, name_hint)
            manifest = value.get("manifest")
            if isinstance(manifest, Mapping) and isinstance(
                manifest.get("tree_sha256"), str
            ):
                fields["artifact_tree_sha256"] = manifest["tree_sha256"]
            if (
                pointer == ""
                or fields.get("schema")
                or any(key in value for key in _TIME_KEYS)
                or name_hint == "dora"
            ):
                records.append(
                    ReleaseStateReceipt(name, source, pointer, fields, digest)
                )
            for key in sorted(_NESTED):
                child = value.get(key)
                if isinstance(child, Mapping):
                    visit(
                        child,
                        pointer + "/" + key,
                        key if key in {"staging", "production"} else env,
                        key,
                    )

        visit(payload, "", None, name)
    return tuple(records)


def release_receipt_graph(
    records: tuple[ReleaseStateReceipt, ...],
    *,
    anchor_id: str,
    commit: str | None = None,
) -> GraphDraft:
    """Stage captured receipt facts without granting a VERIFIED evidence state."""
    objects = []
    for record in records:
        objects.append(
            make_object(
                stable_id("release-state", record.source_path, record.pointer),
                "ReleaseStateReceipt",
                record.source_path,
                claims=(
                    {
                        **record.fields,
                        "name": record.name,
                        "json_pointer": record.pointer,
                        "source_digest": record.source_digest,
                    },
                ),
                relations=(
                    relation(RelationPredicate.REFINES, anchor_id, record.source_path),
                ),
                evidence_state=EvidenceState.OBSERVED,
                lifecycle_state="OBSERVED_LOCAL_RECEIPT",
                commit=commit,
                documentation=(record.source_path,),
                input_digest=record.source_digest,
            )
        )
    return GraphDraft(tuple(objects))
