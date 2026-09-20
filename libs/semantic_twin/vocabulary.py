# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/vocabulary.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md
# EnumType:    Schema
# EnumEdges:   PRODUCES libs/semantic_twin/models.py; PRODUCES libs/semantic_twin/transitions.py
# DAG Node:    semantic-twin.phase-0.vocabulary
# Intent:      Give every Phase 0 consumer one exact vocabulary for evidence, validation, authority, causality and relation meaning.
# ───────────────────────────────────────────────────────────

"""Freeze the Living Semantic System Twin Phase 0 vocabulary."""

from __future__ import annotations

from enum import Enum
from types import MappingProxyType
from typing import Final, Mapping


class StringEnum(str, Enum):
    """Represent a wire-safe string enumeration."""

    def __str__(self) -> str:
        """Return the canonical wire value."""

        return str(self.value)


class EvidenceState(StringEnum):
    """Describe the evidentiary standing of a claim or object."""

    UNMEASURED = "UNMEASURED"
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    HYPOTHESIS = "HYPOTHESIS"
    TESTING = "TESTING"
    VERIFIED = "VERIFIED"
    CONTRADICTED = "CONTRADICTED"
    INSUFFICIENT = "INSUFFICIENT"
    QUARANTINED = "QUARANTINED"
    SUPERSEDED = "SUPERSEDED"
    RETIRED = "RETIRED"


class ShaclState(StringEnum):
    """Describe structural validation against the active SHACL shapes."""

    NOT_EVALUATED = "NOT_EVALUATED"
    CONFORMS = "CONFORMS"
    WARNING = "WARNING"
    VIOLATES = "VIOLATES"
    DEFERRED = "DEFERRED"
    QUARANTINED = "QUARANTINED"
    SUPERSEDED = "SUPERSEDED"
    RETIRED = "RETIRED"


class MerkleState(StringEnum):
    """Describe canonicalization, hashing, rooting and proof standing."""

    UNHASHED = "UNHASHED"
    CANONICALIZED = "CANONICALIZED"
    LEAF_HASHED = "LEAF_HASHED"
    ROOTED = "ROOTED"
    ATTESTED = "ATTESTED"
    INCLUSION_PROVEN = "INCLUSION_PROVEN"
    STALE = "STALE"
    SUPERSEDED = "SUPERSEDED"
    CORRUPT = "CORRUPT"
    QUARANTINED = "QUARANTINED"


class CgrfActionState(StringEnum):
    """Describe the governed lifecycle of a proposed action."""

    OBSERVED = "OBSERVED"
    PROPOSED = "PROPOSED"
    POLICY_EVALUATING = "POLICY_EVALUATING"
    DENIED = "DENIED"
    AUTHORIZED = "AUTHORIZED"
    RESERVED = "RESERVED"
    EXECUTING = "EXECUTING"
    MUTATED_UNVERIFIED = "MUTATED_UNVERIFIED"
    VERIFYING = "VERIFYING"
    VERIFIED = "VERIFIED"
    WATCH = "WATCH"
    ROLLBACK_REQUIRED = "ROLLBACK_REQUIRED"
    ROLLED_BACK = "ROLLED_BACK"
    FAILED_CLOSED = "FAILED_CLOSED"
    SUPERSEDED = "SUPERSEDED"


class TevvState(StringEnum):
    """Describe test, evaluation, verification and validation standing."""

    NOT_TESTED = "NOT_TESTED"
    TESTING = "TESTING"
    PASS = "PASS"
    FAIL = "FAIL"
    HOLD = "HOLD"
    WATCH = "WATCH"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    SUPERSEDED = "SUPERSEDED"


class SemanticTransactionState(StringEnum):
    """Describe the lifecycle of a verified semantic transaction."""

    DRAFT = "DRAFT"
    PARSED = "PARSED"
    SHACL_VALIDATED = "SHACL_VALIDATED"
    EVIDENCE_BOUND = "EVIDENCE_BOUND"
    POLICY_EVALUATED = "POLICY_EVALUATED"
    AUTHORIZED = "AUTHORIZED"
    EXECUTING = "EXECUTING"
    MUTATED_UNVERIFIED = "MUTATED_UNVERIFIED"
    VERIFYING = "VERIFYING"
    VERIFIED = "VERIFIED"
    CANONICALIZED = "CANONICALIZED"
    WATCH = "WATCH"
    ROLLED_BACK = "ROLLED_BACK"
    REJECTED = "REJECTED"
    SUPERSEDED = "SUPERSEDED"


class CausalState(StringEnum):
    """Describe the strength and disposition of a causal claim."""

    TEMPORAL_ONLY = "TEMPORAL_ONLY"
    CORRELATED = "CORRELATED"
    CANDIDATE_CAUSE = "CANDIDATE_CAUSE"
    HYPOTHESIZED_CAUSE = "HYPOTHESIZED_CAUSE"
    EXPERIMENTALLY_SUPPORTED = "EXPERIMENTALLY_SUPPORTED"
    VERIFIED_CAUSE = "VERIFIED_CAUSE"
    REFUTED_CAUSE = "REFUTED_CAUSE"
    UNDECIDABLE = "UNDECIDABLE"


class CorpusUseState(StringEnum):
    """Describe how external corpus knowledge may be used in Citadel."""

    DISCOVERY_ONLY = "DISCOVERY_ONLY"
    COMPARATIVE_OBSERVATION = "COMPARATIVE_OBSERVATION"
    PATTERN_CANDIDATE = "PATTERN_CANDIDATE"
    CITADEL_HYPOTHESIS = "CITADEL_HYPOTHESIS"
    TESTED_IN_CITADEL = "TESTED_IN_CITADEL"
    VERIFIED_FOR_CITADEL = "VERIFIED_FOR_CITADEL"
    REJECTED_FOR_CITADEL = "REJECTED_FOR_CITADEL"


class StateAxis(StringEnum):
    """Name the ten independent dimensions in a system-twin state vector."""

    EVIDENCE = "evidence_state"
    SHACL = "shacl_state"
    MERKLE = "merkle_state"
    CGRF_ACTION = "cgrf_action_state"
    TEVV = "tevv_state"
    SEMANTIC_TRANSACTION = "semantic_transaction_state"
    CAUSAL = "causal_state"
    CORPUS_USE = "corpus_use_state"
    AUTHORITY = "authority_tier"
    LIFECYCLE = "lifecycle_state"


class AuthorityTier(StringEnum):
    """Bound an operation by consequence and required governance friction."""

    A0 = "A0"
    A1 = "A1"
    A2 = "A2"
    A3 = "A3"

    @property
    def display_name(self) -> str:
        """Return the specification name for this authority tier."""

        return AUTHORITY_TIER_NAMES[self]

    @property
    def default_friction(self) -> str:
        """Return the default governance friction for this tier."""

        return AUTHORITY_TIER_FRICTION[self]


AUTHORITY_TIER_NAMES: Final[Mapping[AuthorityTier, str]] = MappingProxyType(
    {
        AuthorityTier.A0: "Observe",
        AuthorityTier.A1: "Candidate/local",
        AuthorityTier.A2: "Controlled reversible",
        AuthorityTier.A3: "High-consequence/external",
    }
)

AUTHORITY_TIER_FRICTION: Final[Mapping[AuthorityTier, str]] = MappingProxyType(
    {
        AuthorityTier.A0: "minimal",
        AuthorityTier.A1: "automatic lineage required",
        AuthorityTier.A2: "CGRF contract + verifier",
        AuthorityTier.A3: (
            "explicit authority + independent verification + rollback/compensation"
        ),
    }
)


class RelationPredicate(StringEnum):
    """Name every core relation predicate from specification section 34.2."""

    CONTAINS = "contains"
    MEMBER_OF = "member_of"
    PART_OF = "part_of"
    DEPENDS_ON = "depends_on"
    IMPORTS = "imports"
    CALLS = "calls"
    INVOKES = "invokes"
    READS = "reads"
    WRITES = "writes"
    PUBLISHES = "publishes"
    CONSUMES = "consumes"
    EMITS = "emits"
    SUBSCRIBES_TO = "subscribes_to"
    ROUTES_TO = "routes_to"
    MAPS_TO = "maps_to"
    IMPLEMENTED_BY = "implemented_by"
    IMPLEMENTS = "implements"

    TESTED_BY = "tested_by"
    VERIFIED_BY = "verified_by"
    OBSERVED_BY = "observed_by"
    SUPPORTED_BY = "supported_by"
    DERIVED_FROM = "derived_from"
    EVIDENCED_BY = "evidenced_by"
    ATTESTED_BY = "attested_by"
    INCLUDED_IN_EPOCH = "included_in_epoch"
    HAS_INCLUSION_PROOF = "has_inclusion_proof"

    DOCUMENTED_BY = "documented_by"
    DEFINES = "defines"
    DESCRIBES = "describes"
    CLAIMS = "claims"
    ENTAILS = "entails"
    CONTRADICTS = "contradicts"
    SUPERSEDES = "supersedes"
    REFINES = "refines"
    REFERENCES = "references"
    ABOUT = "about"

    OWNED_BY = "owned_by"
    AUTHORIZED_BY = "authorized_by"
    EXECUTED_BY = "executed_by"
    PROPOSED_BY = "proposed_by"
    REVIEWED_BY = "reviewed_by"
    ROLLED_BACK_BY = "rolled_back_by"
    GOVERNED_BY = "governed_by"
    ALLOWED_BY = "allowed_by"
    DENIED_BY = "denied_by"

    PRECEDED_BY = "preceded_by"
    SUCCEEDED_BY = "succeeded_by"
    VALID_FROM = "valid_from"
    VALID_UNTIL = "valid_until"
    INTRODUCED_BY = "introduced_by"
    REMOVED_BY = "removed_by"
    CHANGED_BY = "changed_by"
    DEPLOYED_AS = "deployed_as"
    BUILT_FROM = "built_from"
    PROMOTED_TO = "promoted_to"

    CORRELATES_WITH = "correlates_with"
    PRECEDED = "preceded"
    CONTRIBUTED_TO = "contributed_to"
    CAUSES = "causes"
    AFFECTED = "affected"
    AFFECTS = "affects"
    ASSOCIATED_WITH = "associated_with"


RELATION_PREDICATE_GROUPS: Final[Mapping[str, frozenset[RelationPredicate]]] = (
    MappingProxyType(
        {
            "structural": frozenset(
                {
                    RelationPredicate.CONTAINS,
                    RelationPredicate.MEMBER_OF,
                    RelationPredicate.PART_OF,
                    RelationPredicate.DEPENDS_ON,
                    RelationPredicate.IMPORTS,
                    RelationPredicate.CALLS,
                    RelationPredicate.INVOKES,
                    RelationPredicate.READS,
                    RelationPredicate.WRITES,
                    RelationPredicate.PUBLISHES,
                    RelationPredicate.CONSUMES,
                    RelationPredicate.EMITS,
                    RelationPredicate.SUBSCRIBES_TO,
                    RelationPredicate.ROUTES_TO,
                    RelationPredicate.MAPS_TO,
                    RelationPredicate.IMPLEMENTED_BY,
                    RelationPredicate.IMPLEMENTS,
                }
            ),
            "verification_evidence": frozenset(
                {
                    RelationPredicate.TESTED_BY,
                    RelationPredicate.VERIFIED_BY,
                    RelationPredicate.OBSERVED_BY,
                    RelationPredicate.SUPPORTED_BY,
                    RelationPredicate.DERIVED_FROM,
                    RelationPredicate.EVIDENCED_BY,
                    RelationPredicate.ATTESTED_BY,
                    RelationPredicate.INCLUDED_IN_EPOCH,
                    RelationPredicate.HAS_INCLUSION_PROOF,
                }
            ),
            "documentation_knowledge": frozenset(
                {
                    RelationPredicate.DOCUMENTED_BY,
                    RelationPredicate.DEFINES,
                    RelationPredicate.DESCRIBES,
                    RelationPredicate.CLAIMS,
                    RelationPredicate.ENTAILS,
                    RelationPredicate.CONTRADICTS,
                    RelationPredicate.SUPERSEDES,
                    RelationPredicate.REFINES,
                    RelationPredicate.REFERENCES,
                    RelationPredicate.ABOUT,
                }
            ),
            "governance": frozenset(
                {
                    RelationPredicate.OWNED_BY,
                    RelationPredicate.AUTHORIZED_BY,
                    RelationPredicate.EXECUTED_BY,
                    RelationPredicate.PROPOSED_BY,
                    RelationPredicate.REVIEWED_BY,
                    RelationPredicate.ROLLED_BACK_BY,
                    RelationPredicate.GOVERNED_BY,
                    RelationPredicate.ALLOWED_BY,
                    RelationPredicate.DENIED_BY,
                }
            ),
            "temporal_evolution": frozenset(
                {
                    RelationPredicate.PRECEDED_BY,
                    RelationPredicate.SUCCEEDED_BY,
                    RelationPredicate.VALID_FROM,
                    RelationPredicate.VALID_UNTIL,
                    RelationPredicate.INTRODUCED_BY,
                    RelationPredicate.REMOVED_BY,
                    RelationPredicate.CHANGED_BY,
                    RelationPredicate.DEPLOYED_AS,
                    RelationPredicate.BUILT_FROM,
                    RelationPredicate.PROMOTED_TO,
                }
            ),
            "analytic_causal": frozenset(
                {
                    RelationPredicate.CORRELATES_WITH,
                    RelationPredicate.PRECEDED,
                    RelationPredicate.CONTRIBUTED_TO,
                    RelationPredicate.CAUSES,
                    RelationPredicate.AFFECTED,
                    RelationPredicate.AFFECTS,
                    RelationPredicate.ASSOCIATED_WITH,
                }
            ),
        }
    )
)


DESIGN_LAWS: Final[tuple[str, ...]] = (
    "No semantic identity without provenance.",
    "No canonical promotion from vector similarity alone.",
    "No causal promotion from chronology alone.",
    "No mutation success claim without independent observation.",
    "No SHACL conformance claim should be interpreted as factual truth.",
    "No Merkle proof should be interpreted as correctness.",
    "No CGRF authorization should be interpreted as technical success.",
    "No external repository observation should become Citadel truth without bounded validation.",
    "No memory should outrank current verified runtime state without explicit historical scope.",
    "No BuildAndDo dependency may be required to bootstrap CNI core.",
    "Any BnD capability used across products should be promoted into CNI.",
    "Every governed action should be replayable from lineage, context, policy, execution, and verification evidence.",
    "Every semantic edge should declare its evidence state.",
    "Every version-sensitive object should carry source/version validity.",
    "Every AI-development corpus item should preserve the information boundary that existed at the historical decision time.",
)
