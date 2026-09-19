# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/merkle.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.merkle
# Intent:      Freeze replay identity and proof metadata while leaving hashing and attestation execution to their owners.
# ───────────────────────────────────────────────────────────────

"""Describe section 26 Merkle objects without hashing, signing or verifying signatures."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from .contracts import Contract, require, text
from .identity import SemanticId, SubjectRef, ValidTime
from .vocabulary import MerkleState, StringEnum


class HashAlgorithm(StringEnum):
    """Declare the supported digest encodings."""

    SHA256 = "sha256"
    SHA512 = "sha512"


@dataclass(frozen=True, slots=True)
class ContentDigest(Contract):
    """Identify bytes with an explicitly named hash algorithm."""

    value: str
    algorithm: HashAlgorithm = HashAlgorithm.SHA256

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        size = 64 if self.algorithm is HashAlgorithm.SHA256 else 128
        require(
            bool(re.fullmatch(f"[0-9a-f]{{{size}}}", self.value)),
            "digest must be lowercase hex of the algorithm's length",
        )


@dataclass(frozen=True, slots=True)
class PayloadDigest(ContentDigest):
    """Identify deployable payload excluding declared volatile metadata."""


@dataclass(frozen=True, slots=True)
class ArtifactDigest(ContentDigest):
    """Identify a complete immutable release artifact."""


@dataclass(frozen=True, slots=True)
class DeploymentDigest(ContentDigest):
    """Identify the bytes read back from a deployment."""


@dataclass(frozen=True, slots=True)
class ContextRoot(ContentDigest):
    """Identify the context available at a historical decision."""


@dataclass(frozen=True, slots=True)
class SemanticRoot(ContentDigest):
    """Identify a semantic graph snapshot."""


@dataclass(frozen=True, slots=True)
class EvidenceRoot(ContentDigest):
    """Identify a bounded evidence set."""


@dataclass(frozen=True, slots=True)
class SourceRoot(ContentDigest):
    """Identify a source-content snapshot independently of its revision name."""


@dataclass(frozen=True, slots=True)
class ParentRoot(ContentDigest):
    """Identify the predecessor epoch's root."""


@dataclass(frozen=True, slots=True)
class SourceRevision(Contract):
    """Identify a full Git source revision rather than a payload digest."""

    source_sha: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(re.fullmatch(r"[0-9a-f]{40}(?:[0-9a-f]{24})?", self.source_sha)),
            "source_sha must be a full immutable Git revision",
        )


@dataclass(frozen=True, slots=True)
class CanonicalSerialization(Contract):
    """Declare the P0 sorted-key JSON profile; this is not RFC 8785 JCS."""

    version: Literal["semantic-twin-json/1"] = "semantic-twin-json/1"
    byte_encoding: Literal["utf-8"] = "utf-8"
    object_order: Literal["sorted-keys"] = "sorted-keys"
    collection_order: Literal["preserve"] = "preserve"
    included_fields: tuple[str, ...] = ()
    excluded_volatile_fields: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for names in (self.included_fields, self.excluded_volatile_fields):
            require(
                len(names) == len(set(names)), "serialization fields must be unique"
            )
            for name in names:
                text(name, "serialization field")
        require(
            not set(self.included_fields) & set(self.excluded_volatile_fields),
            "included and excluded fields overlap",
        )
        require(
            not {
                "semantic_id",
                "source",
                "state",
                "schema_version",
                "provenance",
                "authority",
            }
            & set(self.excluded_volatile_fields),
            "identity/evidence fields are not volatile",
        )


class EpochScope(StringEnum):
    """Bound a Merkle epoch to its purpose."""

    DEVELOPMENT = "development"
    RELEASE = "release"
    MISSION = "mission"
    INCIDENT = "incident"
    KNOWLEDGE = "knowledge"


@dataclass(frozen=True, slots=True)
class EpochBoundary(Contract):
    """Record the temporal and logical boundary of an epoch."""

    scope: EpochScope
    scope_id: SemanticId
    valid_time: ValidTime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.valid_time.valid_from is not None,
            "epoch boundary requires a start time",
        )


@dataclass(frozen=True, slots=True)
class MerkleLeaf(Contract):
    """Describe a versioned, canonically serialized leaf."""

    subject: SubjectRef
    digest: ContentDigest
    serialization: CanonicalSerialization
    epoch_id: SemanticId
    created_at: datetime
    producer_id: SemanticId

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.epoch_id.require_namespace("epoch")


@dataclass(frozen=True, slots=True)
class MerkleNode(Contract):
    """Record an ordered set of child digests under a parent digest."""

    digest: ContentDigest
    children: tuple[ContentDigest, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.children), "Merkle node requires children")
        require(
            all(d.algorithm is self.digest.algorithm for d in self.children),
            "Merkle node mixes algorithms",
        )


@dataclass(frozen=True, slots=True)
class MerkleRoot(Contract):
    """Describe the root of a bounded binary Merkle tree."""

    digest: ContentDigest
    epoch_id: SemanticId
    leaf_count: int
    tree_version: Literal["binary-duplicate-last/1"] = "binary-duplicate-last/1"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.epoch_id.require_namespace("epoch")
        require(self.leaf_count > 0, "Merkle root requires positive leaf_count")


@dataclass(frozen=True, slots=True)
class Attestation(Contract):
    """Reference an external root attestation without handling signing keys."""

    attestation_id: SemanticId
    root_digest: ContentDigest
    signer_id: SemanticId
    signature_reference: SemanticId
    attested_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.attestation_id.require_namespace("attestation")


@dataclass(frozen=True, slots=True)
class MerkleEpoch(Contract):
    """Bind a root to serialization, scope, producer and historical lineage."""

    epoch_id: SemanticId
    boundary: EpochBoundary
    root: MerkleRoot
    serialization: CanonicalSerialization
    created_at: datetime
    producer_id: SemanticId
    parent_root: ParentRoot | None = None
    successor_root: ContentDigest | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.epoch_id.require_namespace("epoch")
        require(
            self.root.epoch_id == self.epoch_id, "root belongs to a different epoch"
        )
        require(
            self.boundary.valid_time.valid_from is not None
            and self.created_at >= self.boundary.valid_time.valid_from,
            "epoch precedes its boundary",
        )
        for root in (self.parent_root, self.successor_root):
            if root is not None:
                require(
                    root.algorithm is self.root.digest.algorithm,
                    "epoch lineage mixes algorithms",
                )
                require(
                    root.value != self.root.digest.value,
                    "epoch cannot supersede itself",
                )


class ProofSide(StringEnum):
    """Locate a sibling relative to the current proof digest."""

    LEFT = "left"
    RIGHT = "right"


@dataclass(frozen=True, slots=True)
class ProofStep(Contract):
    """Record one ordered sibling digest in an inclusion path."""

    side: ProofSide
    digest: ContentDigest


@dataclass(frozen=True, slots=True)
class InclusionProof(Contract):
    """Describe a binary proof path; shape validation is not hash verification."""

    leaf_digest: ContentDigest
    root: MerkleRoot
    leaf_index: int
    path: tuple[ProofStep, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            0 <= self.leaf_index < self.root.leaf_count,
            "inclusion proof index outside tree",
        )
        require(
            self.leaf_digest.algorithm is self.root.digest.algorithm,
            "proof mixes algorithms",
        )
        require(
            len(self.path) == (self.root.leaf_count - 1).bit_length(),
            "inclusion proof path length does not match tree",
        )
        index = self.leaf_index
        for step in self.path:
            require(
                step.digest.algorithm is self.leaf_digest.algorithm,
                "proof mixes algorithms",
            )
            require(
                step.side is (ProofSide.LEFT if index % 2 else ProofSide.RIGHT),
                "proof sibling direction disagrees with index",
            )
            index //= 2
        if self.root.leaf_count == 1:
            require(
                self.leaf_digest == self.root.digest,
                "single-leaf proof must match its root",
            )


@dataclass(frozen=True, slots=True)
class InclusionVerificationReceipt(Contract):
    """Record an external proof comparison bound to its exact leaf, root and subject."""

    receipt_id: SemanticId
    subject: SubjectRef
    proof: InclusionProof
    verifier_id: SemanticId
    verified_at: datetime
    result: Literal["valid", "mismatch"]
    verifier_version: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.receipt_id.require_namespace("receipt")
        text(self.verifier_version, "proof verifier version")


@dataclass(frozen=True, slots=True)
class MerkleBinding(Contract):
    """Bind the section 44 digest fields to full section 26 metadata."""

    leaf_digest: ContentDigest | None = None
    epoch_id: SemanticId | None = None
    root_digest: ContentDigest | None = None
    serialization: CanonicalSerialization | None = None
    leaf: MerkleLeaf | None = None
    epoch: MerkleEpoch | None = None
    proof: InclusionProof | None = None
    attestation: Attestation | None = None
    proof_receipt: InclusionVerificationReceipt | None = None
    successor_root: ContentDigest | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.leaf is not None:
            self._bind("leaf_digest", self.leaf.digest)
            self._bind("epoch_id", self.leaf.epoch_id)
            self._bind("serialization", self.leaf.serialization)
        if self.epoch is not None:
            self._bind("epoch_id", self.epoch.epoch_id)
            self._bind("root_digest", self.epoch.root.digest)
            self._bind("serialization", self.epoch.serialization)
            if self.leaf is not None:
                require(
                    self.leaf.digest.algorithm is self.epoch.root.digest.algorithm,
                    "leaf/root algorithms disagree",
                )
        if self.proof is not None:
            require(
                self.epoch is not None and self.proof.root == self.epoch.root,
                "proof root differs from epoch",
            )
            require(
                self.proof.leaf_digest == self.leaf_digest,
                "proof leaf differs from binding",
            )
        if self.attestation is not None:
            require(
                self.attestation.root_digest == self.root_digest,
                "attestation root differs from binding",
            )
        if self.proof_receipt is not None:
            require(
                self.proof_receipt.proof == self.proof,
                "verification receipt names a different inclusion proof",
            )
            require(
                self.leaf is not None
                and self.proof_receipt.subject == self.leaf.subject,
                "proof verification subject/version mismatch",
            )
            assert self.leaf is not None
            require(
                self.proof_receipt.verified_at >= self.leaf.created_at,
                "proof verification precedes leaf creation",
            )
            require(
                self.epoch is not None
                and self.proof_receipt.verified_at >= self.epoch.created_at,
                "proof verification precedes epoch creation",
            )

    def _bind(self, name: str, value: object) -> None:
        old = getattr(self, name)
        require(old is None or old == value, f"Merkle binding disagrees on {name}")
        object.__setattr__(self, name, value)

    def validate_state(self, state: MerkleState, subject: SubjectRef) -> None:
        """Require metadata appropriate to the asserted Merkle state and subject."""
        if state is MerkleState.UNHASHED:
            require(
                all(getattr(self, name) is None for name in self.__dataclass_fields__),
                "UNHASHED cannot carry Merkle material",
            )
            return
        if state in (MerkleState.CORRUPT, MerkleState.QUARANTINED):
            require(
                bool(self.reason and self.reason.strip()),
                "failed Merkle state requires a reason",
            )
            return
        require(self.serialization is not None, "canonicalization metadata is required")
        if state is MerkleState.CANONICALIZED:
            require(
                self.leaf_digest is None and self.root_digest is None,
                "CANONICALIZED has no hash yet",
            )
            return
        require(self.leaf is not None, "hashed Merkle state requires a leaf")
        assert self.leaf is not None
        require(self.leaf.subject == subject, "Merkle leaf subject/version mismatch")
        if state is MerkleState.LEAF_HASHED:
            require(self.root_digest is None, "LEAF_HASHED has no root yet")
            return
        require(self.epoch is not None, "rooted Merkle state requires epoch metadata")
        if state is MerkleState.ATTESTED:
            require(
                self.attestation is not None,
                "ATTESTED requires an attestation reference",
            )
        if state is MerkleState.INCLUSION_PROVEN:
            require(
                self.proof is not None and self.proof_receipt is not None,
                "INCLUSION_PROVEN requires a proof and verification receipt",
            )
            assert self.proof_receipt is not None
            require(
                self.proof_receipt.result == "valid",
                "INCLUSION_PROVEN cannot use a failed proof comparison",
            )
        if state in (MerkleState.STALE, MerkleState.SUPERSEDED):
            require(
                self.successor_root is not None,
                "historical Merkle state requires successor root",
            )
            require(
                self.successor_root != self.root_digest,
                "successor root must be different",
            )
