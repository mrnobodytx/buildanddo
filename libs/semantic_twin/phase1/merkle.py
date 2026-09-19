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

import hashlib
from dataclasses import dataclass
from datetime import datetime

from ..contracts import Contract, ContractError, require
from ..identity import SemanticId, ValidTime
from ..ingestion.graph import SemanticGraph
from ..ingestion.serializer import SERIALIZATION, object_leaf_digest
from ..merkle import (
    ContentDigest,
    EpochBoundary,
    EpochScope,
    InclusionProof,
    MerkleEpoch,
    MerkleLeaf,
    MerkleRoot,
    ProofSide,
    ProofStep,
)
from ..models import CanonicalObjectEnvelope

PRODUCER = SemanticId("cni://agent/buildanddo-semantic-twin-ingestion")


def _parent(left: str, right: str) -> str:
    """Hash an ordered binary parent with its node domain separator."""
    return hashlib.sha256(
        b"\x01" + bytes.fromhex(left) + bytes.fromhex(right)
    ).hexdigest()


def _levels(digests: tuple[str, ...]) -> tuple[tuple[str, ...], ...]:
    """Build binary levels with duplicate-last padding for odd populations."""
    if not digests:
        raise ContractError("cannot root an empty graph")
    levels = [digests]
    while len(levels[-1]) > 1:
        level = levels[-1]
        padded = level + (level[-1],) if len(level) % 2 else level
        levels.append(
            tuple(_parent(padded[i], padded[i + 1]) for i in range(0, len(padded), 2))
        )
    return tuple(levels)


@dataclass(frozen=True, slots=True)
class SemanticEpoch(Contract):
    """Bind typed Phase 0 leaves to the exact ordered semantic epoch."""

    metadata: MerkleEpoch
    leaves: tuple[MerkleLeaf, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        ids = tuple(leaf.subject.semantic_id for leaf in self.leaves)
        require(
            ids == tuple(sorted(set(ids))),
            "epoch leaves must have unique sorted identities",
        )
        require(
            len(self.leaves) == self.metadata.root.leaf_count,
            "epoch leaf count mismatch",
        )
        require(
            all(
                leaf.epoch_id == self.epoch_id
                and leaf.serialization == self.metadata.serialization
                for leaf in self.leaves
            ),
            "leaf metadata disagrees with epoch",
        )
        require(
            _levels(tuple(leaf.digest.value for leaf in self.leaves))[-1][0]
            == self.root_digest,
            "epoch root does not match its leaf set",
        )

    @property
    def epoch_id(self) -> SemanticId:
        """Return the canonical epoch identity."""
        return self.metadata.epoch_id

    @property
    def root_digest(self) -> str:
        """Return the SHA-256 semantic root."""
        return self.metadata.root.digest.value

    @property
    def object_count(self) -> int:
        """Return the number of bound objects."""
        return self.metadata.root.leaf_count


def build_epoch(graph: SemanticGraph) -> SemanticEpoch:
    """Root whole canonical objects using the Phase 0 leaf and epoch contracts."""
    ordered = tuple(sorted(graph.objects, key=lambda value: value.semantic_id))
    digests = tuple(object_leaf_digest(item) for item in ordered)
    root = _levels(digests)[-1][0]
    times = tuple(
        item.observed_time for item in ordered if item.observed_time is not None
    )
    require(bool(times), "an epoch requires a recorded capture time")
    created: datetime = max(times)
    epoch_id = SemanticId(f"cni://epoch/buildanddo/{root}")
    metadata = MerkleEpoch(
        epoch_id=epoch_id,
        boundary=EpochBoundary(
            EpochScope.DEVELOPMENT,
            SemanticId("cni://system/buildanddo"),
            ValidTime(valid_from=min(times)),
        ),
        root=MerkleRoot(ContentDigest(root), epoch_id, len(ordered)),
        serialization=SERIALIZATION,
        created_at=created,
        producer_id=PRODUCER,
    )
    leaves = tuple(
        MerkleLeaf(
            item.subject,
            ContentDigest(digest),
            SERIALIZATION,
            epoch_id,
            created,
            PRODUCER,
        )
        for item, digest in zip(ordered, digests, strict=True)
    )
    return SemanticEpoch(metadata, leaves)


def inclusion_proof(epoch: SemanticEpoch, semantic_id: str) -> InclusionProof:
    """Build a typed path with index and tree shape bound to the epoch."""
    ids = [str(leaf.subject.semantic_id) for leaf in epoch.leaves]
    if semantic_id not in ids:
        raise KeyError(semantic_id)
    index = ids.index(semantic_id)
    original_index = index
    steps = []
    for level in _levels(tuple(leaf.digest.value for leaf in epoch.leaves))[:-1]:
        sibling = index - 1 if index % 2 else min(index + 1, len(level) - 1)
        steps.append(
            ProofStep(
                ProofSide.LEFT if index % 2 else ProofSide.RIGHT,
                ContentDigest(level[sibling]),
            )
        )
        index //= 2
    return InclusionProof(
        epoch.leaves[original_index].digest,
        epoch.metadata.root,
        original_index,
        tuple(steps),
    )


def verify_inclusion(
    proof: InclusionProof,
    root_digest: str,
    *,
    item: CanonicalObjectEnvelope | None = None,
) -> bool:
    """Check path hashes against a trusted root and optionally exact object bytes."""
    if proof.root.digest.value != root_digest:
        return False
    if item is not None and object_leaf_digest(item) != proof.leaf_digest.value:
        return False
    current = proof.leaf_digest.value
    for step in proof.path:
        current = (
            _parent(step.digest.value, current)
            if step.side is ProofSide.LEFT
            else _parent(current, step.digest.value)
        )
    return current == root_digest
