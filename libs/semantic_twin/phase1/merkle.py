# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/merkle.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/serializer.py, libs/semantic_twin/ingestion/graph.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/serializer.py; PRODUCES libs/semantic_twin/phase1/context.py
# DAG Node:    semantic-twin.phase-1.merkle-epoch
# Intent:      Root the deterministic object set into a semantic epoch with independently verifiable inclusion proofs.
# ───────────────────────────────────────────────────────

"""Build deterministic semantic epochs and inclusion proofs."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib

from ..ingestion.graph import SemanticGraph
from ..ingestion.serializer import object_leaf_digest


def _parent(left: str, right: str) -> str:
    """Hash one domain-separated Merkle parent."""

    return hashlib.sha256(
        b"\x01" + bytes.fromhex(left) + bytes.fromhex(right)
    ).hexdigest()


@dataclass(frozen=True, slots=True)
class ProofStep:
    """Record one sibling hash and its side in an inclusion proof."""

    side: str
    digest: str


@dataclass(frozen=True, slots=True)
class InclusionProof:
    """Bind one semantic object leaf to an epoch root."""

    semantic_id: str
    leaf_digest: str
    steps: tuple[ProofStep, ...]

    def to_dict(self) -> dict[str, object]:
        """Render a JSON-ready proof."""

        return {
            "semantic_id": self.semantic_id,
            "leaf_digest": self.leaf_digest,
            "steps": [
                {"side": step.side, "digest": step.digest} for step in self.steps
            ],
        }


@dataclass(frozen=True, slots=True)
class SemanticEpoch:
    """Describe one deterministic graph root and all leaf identities."""

    epoch_id: str
    root_digest: str
    object_count: int
    leaves: tuple[tuple[str, str], ...]

    def to_dict(self) -> dict[str, object]:
        """Render epoch metadata without claiming signature or attestation."""

        return {
            "epoch_id": self.epoch_id,
            "root_digest": self.root_digest,
            "object_count": self.object_count,
            "merkle_state": "ROOTED",
            "attested": False,
            "leaves": [
                {"semantic_id": semantic_id, "leaf_digest": digest}
                for semantic_id, digest in self.leaves
            ],
        }


def build_epoch(graph: SemanticGraph) -> SemanticEpoch:
    """Root sorted graph leaves into a deterministic semantic epoch."""

    if not graph.objects:
        raise ValueError("cannot build an epoch from an empty graph")
    leaves = tuple(
        (item.semantic_id, object_leaf_digest(item))
        for item in sorted(graph.objects, key=lambda value: value.semantic_id)
    )
    level = [digest for _, digest in leaves]
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [
            _parent(level[index], level[index + 1]) for index in range(0, len(level), 2)
        ]
    root = level[0]
    return SemanticEpoch(
        epoch_id=f"semantic-epoch:{root[:24]}",
        root_digest=root,
        object_count=len(leaves),
        leaves=leaves,
    )


def inclusion_proof(epoch: SemanticEpoch, semantic_id: str) -> InclusionProof:
    """Build the inclusion path for one semantic identity."""

    identities = [item[0] for item in epoch.leaves]
    if semantic_id not in identities:
        raise KeyError(semantic_id)
    index = identities.index(semantic_id)
    level = [item[1] for item in epoch.leaves]
    leaf = level[index]
    steps: list[ProofStep] = []
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        sibling_index = index - 1 if index % 2 else index + 1
        steps.append(
            ProofStep(
                side="left" if index % 2 else "right",
                digest=level[sibling_index],
            )
        )
        level = [
            _parent(level[offset], level[offset + 1])
            for offset in range(0, len(level), 2)
        ]
        index //= 2
    return InclusionProof(semantic_id, leaf, tuple(steps))


def verify_inclusion(proof: InclusionProof, root_digest: str) -> bool:
    """Verify an inclusion proof against the expected semantic root."""

    current = proof.leaf_digest
    for step in proof.steps:
        current = (
            _parent(step.digest, current)
            if step.side == "left"
            else _parent(current, step.digest)
        )
    return current == root_digest
