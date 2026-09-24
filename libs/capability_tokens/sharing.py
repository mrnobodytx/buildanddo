# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/sharing.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/verification.py, libs/evolution/common.py, libs/evolution/episode.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/episode.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Export only reviewed closed-vocabulary learning patterns while retaining tenant evidence locally.
# ───────────────────────────────────────────────────────────────

"""Separate private learning provenance from reviewed portable hypotheses."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from libs.evolution.common import digest, unique
from libs.evolution.episode import Episode
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier, RelationPredicate

from .verification import ReviewPolicy, require_review


@dataclass(frozen=True, slots=True)
class GeneralizedPattern(Contract):
    """Restrict reusable patterns to a closed public vocabulary, without arbitrary values."""

    domain: Literal["python_imports", "verification", "workflow", "connector"]
    symptom: Literal[
        "module_missing", "revision_mismatch", "duplicate_effect", "stale_binding"
    ]
    strategy: Literal[
        "restore_package_boundary",
        "bind_exact_receipt",
        "reconcile_before_retry",
        "refresh_binding",
    ]
    relations: tuple[RelationPredicate, ...]
    tests: tuple[
        Literal[
            "imports", "revision_integrity", "idempotency", "configuration_readback"
        ],
        ...,
    ]
    state: Literal["HYPOTHESIS"] = "HYPOTHESIS"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        allowed = {
            "python_imports": ("module_missing", "restore_package_boundary", "imports"),
            "verification": (
                "revision_mismatch",
                "bind_exact_receipt",
                "revision_integrity",
            ),
            "workflow": ("duplicate_effect", "reconcile_before_retry", "idempotency"),
            "connector": ("stale_binding", "refresh_binding", "configuration_readback"),
        }
        symptom, strategy, test = allowed[self.domain]
        require(
            (self.symptom, self.strategy) == (symptom, strategy) and test in self.tests,
            "unsupported generalization",
        )
        require(bool(self.relations), "pattern needs graph relationships")
        unique(tuple(r.value for r in self.relations), "pattern relation")
        unique(self.tests, "pattern test")


@dataclass(frozen=True, slots=True)
class SharingDraft(Contract):
    """Keep source scope and episode provenance in a private review packet."""

    scope_id: str
    prepared_at: datetime
    pattern: GeneralizedPattern
    source_episodes: tuple[str, ...]
    source_root: ContentDigest
    recipient: Literal["public"] = "public"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "sharing source scope")
        require(
            len(self.source_episodes) >= 2, "generalization needs repeated episodes"
        )
        unique(self.source_episodes, "sharing episode")

    @property
    def subject(self) -> SubjectRef:
        """Bind consent and privacy review to this exact private-to-public projection."""
        return SubjectRef(
            SemanticId("cni://hypothesis/capability-sharing/" + digest(self.pattern)),
            digest(self),
        )

    @property
    def draft_id(self) -> SemanticId:
        """Address the private review packet without exporting it."""
        return SemanticId("cni://evaluation/capability-sharing/" + digest(self))


def prepare_sharing(
    episodes: tuple[Episode, ...],
    pattern: GeneralizedPattern,
    *,
    scope_id: str,
    at: datetime,
) -> SharingDraft:
    """Retain verified private provenance; independent export review remains necessary."""
    require(len(episodes) >= 2, "insufficient private episodes")
    for episode in episodes:
        require(
            episode.status == "VERIFIED", "incomplete episode cannot support sharing"
        )
        require(
            all(e.scope_id == scope_id and e.ingested_at <= at for e in episode.events),
            "foreign or future private evidence",
        )
    return SharingDraft(
        scope_id,
        at,
        pattern,
        tuple(sorted(e.episode_id for e in episodes)),
        ContentDigest(digest(tuple(sorted(episodes, key=lambda e: e.episode_id)))),
    )


@dataclass(frozen=True, slots=True)
class SharedPattern(Contract):
    """Carry a reviewed public hypothesis with no tenant IDs, examples or evidence bodies."""

    pattern: GeneralizedPattern
    export_review_digest: ContentDigest
    schema_version: Literal["cnwb.shared-pattern/v1"] = "cnwb.shared-pattern/v1"

    @property
    def subject(self) -> SubjectRef:
        """Provide public learning lineage for a newly scoped capability candidate."""
        return SubjectRef(
            SemanticId("cni://hypothesis/capability-pattern/" + digest(self.pattern)),
            digest(self),
        )


def export_pattern(
    draft: SharingDraft,
    receipt: VerificationReceipt,
    policy: ReviewPolicy,
    *,
    scope_id: str,
    at: datetime,
) -> SharedPattern:
    """Require pinned A3 consent and privacy review before emitting a public projection."""
    require(draft.scope_id == scope_id, "sharing cannot cross tenant scope")
    require_review(
        receipt,
        draft.subject,
        policy,
        at=at,
        tier=AuthorityTier.A3,
        checks=("sharing.consent", "sharing.privacy", "sharing.generalization"),
        sources=(draft.draft_id,),
        since=draft.prepared_at,
    )
    return SharedPattern(draft.pattern, ContentDigest(digest(receipt)))
