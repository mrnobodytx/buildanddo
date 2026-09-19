# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/relations.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/identity.py, libs/semantic_twin/receipts.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/receipts.py
# DAG Node:    semantic-twin.phase-0.relations
# Intent:      Make every frozen predicate declare admissible endpoints and bind promotion to its evidence discipline.
# ───────────────────────────────────────────────────────────────

"""Define section 35 evidence disciplines and explicit P0 endpoint defaults."""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Final, Mapping

from .contracts import Contract, require, text
from .identity import EntityType as E, SemanticId, SubjectRef, ValidTime
from .receipts import (
    CausalSupport,
    EvidenceKind as K,
    EvidenceReference,
    ExecutionReceipt,
    PolicyDecisionReceipt,
    ShaclValidationResult,
    VerificationReceipt,
    validate_evidence,
)
from .vocabulary import CausalState, EvidenceState, RelationPredicate as P, ShaclState


@dataclass(frozen=True, slots=True)
class RelationContract(Contract):
    """Declare domains, ranges and conjunctions of acceptable evidence kinds."""

    predicate: P
    domain: tuple[E, ...]
    range: tuple[E, ...]
    evidence_requirements: tuple[tuple[K, ...], ...] = ()
    basis: str = "P0 endpoint default; section 34.2 names the predicate"


ALL = tuple(E)
CODE = (
    E.SERVICE,
    E.MODULE,
    E.PACKAGE,
    E.LIBRARY,
    E.FILE,
    E.CODE_SYMBOL,
    E.FUNCTION,
    E.CLASS,
    E.METHOD,
    E.API_ENDPOINT,
    E.COMPONENT,
)
SYSTEM = (E.SYSTEM, E.PRODUCT, E.SERVICE, E.MODULE, E.CAPABILITY)
RESOURCE = (
    E.RESOURCE,
    E.DATABASE,
    E.TABLE,
    E.COLUMN,
    E.QUEUE,
    E.TOPIC,
    E.CONFIGURATION_KEY,
    E.SECRET_REFERENCE,
    E.HOST,
    E.CONTAINER,
    E.FILE,
)
EVENT = (E.EVENT_TYPE, E.EVENT_INSTANCE, E.TOPIC, E.QUEUE, E.NATS_SUBJECT)
ACTION = (
    E.SEMANTIC_TRANSACTION,
    E.CHANGE_CONTRACT,
    E.TOOL_CALL,
    E.WORKFLOW,
    E.N8N_WORKFLOW,
    E.PLAN,
    E.MISSION,
    E.DEPLOYMENT,
)
ACTOR = (
    E.PERSON,
    E.AGENT,
    E.GUILDMASTER,
    E.PERSONA,
    E.VERIFIER,
    E.ORGANIZATION,
    E.SERVICE,
)
DOC = (
    E.DOCUMENT,
    E.DOCUMENT_SECTION,
    E.RUNBOOK,
    E.INCIDENT_REPORT,
    E.ARCHITECTURE_DIAGRAM,
    E.SBOM,
)
KNOWLEDGE = (
    E.CLAIM,
    E.HYPOTHESIS,
    E.OBSERVATION,
    E.INFERENCE,
    E.REQUIREMENT,
    E.DEFINITION,
    E.MEMORY,
    E.EVIDENCE,
)
TELEMETRY = (E.TRACE, E.METRIC, E.LOG_EVENT, E.OBSERVATION)
ARTIFACT = (E.RELEASE_ARTIFACT, E.CONTAINER, E.COMPONENT, E.SBOM)

# Section 35 constrains 21 predicates. Remaining endpoint choices are explicitly
# frozen P0 defaults, not an assertion that the specification supplied new rules.
_ENDPOINTS = {
    P.CONTAINS: (ALL, ALL),
    P.MEMBER_OF: (ALL, ALL),
    P.PART_OF: (ALL, ALL),
    P.DEPENDS_ON: (SYSTEM + CODE, SYSTEM + CODE + RESOURCE),
    P.IMPORTS: (CODE, CODE),
    P.CALLS: (CODE, CODE),
    P.INVOKES: (CODE + ACTION, CODE + ACTION),
    P.READS: (CODE + ACTION, RESOURCE),
    P.WRITES: (CODE + ACTION, RESOURCE),
    P.PUBLISHES: (CODE + ACTION, EVENT),
    P.CONSUMES: (CODE + ACTION, EVENT),
    P.EMITS: (CODE + ACTION, EVENT),
    P.SUBSCRIBES_TO: (CODE + ACTION, EVENT),
    P.ROUTES_TO: (CODE + RESOURCE, CODE + RESOURCE),
    P.MAPS_TO: (ALL, ALL),
    P.IMPLEMENTS: (CODE + (E.CAPABILITY,), (E.REQUIREMENT, E.CAPABILITY)),
    P.IMPLEMENTED_BY: ((E.REQUIREMENT, E.CAPABILITY), CODE + (E.CAPABILITY,)),
    P.TESTED_BY: (ALL, (E.TEST, E.TEST_RUN)),
    P.VERIFIED_BY: (KNOWLEDGE + ACTION, (E.VERIFIER, E.TEST_RUN)),
    P.OBSERVED_BY: (ALL, TELEMETRY),
    P.SUPPORTED_BY: (ALL, KNOWLEDGE + TELEMETRY + (E.RECEIPT, E.TEST_RUN)),
    P.DERIVED_FROM: (ALL, ALL),
    P.EVIDENCED_BY: (ALL, (E.EVIDENCE, E.RECEIPT, E.TEST_RUN) + TELEMETRY),
    P.ATTESTED_BY: (ALL, (E.ATTESTATION,)),
    P.INCLUDED_IN_EPOCH: (ALL, (E.MERKLE_EPOCH,)),
    P.HAS_INCLUSION_PROOF: (ALL, (E.INCLUSION_PROOF,)),
    P.DOCUMENTED_BY: (ALL, (E.DOCUMENT_SECTION,)),
    P.DEFINES: (DOC + KNOWLEDGE, ALL),
    P.DESCRIBES: (DOC + KNOWLEDGE, ALL),
    P.CLAIMS: (DOC + ACTOR, (E.CLAIM,)),
    P.ENTAILS: (KNOWLEDGE + CODE, (E.CLAIM,)),
    P.CONTRADICTS: (ALL, ALL),
    P.SUPERSEDES: (ALL, ALL),
    P.REFINES: (ALL, ALL),
    P.REFERENCES: (ALL, ALL),
    P.ABOUT: (ALL, ALL),
    P.OWNED_BY: (ALL, ACTOR + (E.OWNER, E.GUILD, E.TENANT)),
    P.AUTHORIZED_BY: (ACTION, (E.AUTHORITY_GRANT, E.POLICY)),
    P.EXECUTED_BY: (ACTION, ACTOR),
    P.PROPOSED_BY: (ACTION + KNOWLEDGE, ACTOR),
    P.REVIEWED_BY: (ALL, ACTOR),
    P.ROLLED_BACK_BY: (ACTION, (E.ROLLBACK,) + ACTOR),
    P.GOVERNED_BY: (ALL, (E.POLICY, E.CHANGE_CONTRACT)),
    P.ALLOWED_BY: (ACTION, (E.POLICY, E.AUTHORITY_GRANT)),
    P.DENIED_BY: (ACTION, (E.POLICY, E.AUTHORITY_GRANT)),
    P.PRECEDED_BY: (ALL, ALL),
    P.SUCCEEDED_BY: (ALL, ALL),
    P.VALID_FROM: (ALL, (E.EVENT_INSTANCE, E.COMMIT, E.DEPLOYMENT, E.MERKLE_EPOCH)),
    P.VALID_UNTIL: (ALL, (E.EVENT_INSTANCE, E.COMMIT, E.DEPLOYMENT, E.MERKLE_EPOCH)),
    P.INTRODUCED_BY: (ALL, ACTION + (E.COMMIT, E.MERGE_REQUEST)),
    P.REMOVED_BY: (ALL, ACTION + (E.COMMIT, E.MERGE_REQUEST)),
    P.CHANGED_BY: (ALL, ACTION + (E.COMMIT, E.MERGE_REQUEST)),
    P.DEPLOYED_AS: (ARTIFACT, (E.DEPLOYMENT,)),
    P.BUILT_FROM: (ARTIFACT, CODE + (E.REPOSITORY, E.COMMIT)),
    P.PROMOTED_TO: (ARTIFACT + (E.DEPLOYMENT,), (E.ENVIRONMENT,)),
    P.CORRELATES_WITH: ((E.OBSERVATION,), (E.OBSERVATION,)),
    P.PRECEDED: (ALL, ALL),
    P.CONTRIBUTED_TO: (ACTION + EVENT, (E.OBSERVATION, E.INCIDENT_REPORT, E.CLAIM)),
    P.CAUSES: (ACTION + EVENT, (E.OBSERVATION, E.INCIDENT_REPORT, E.CLAIM)),
    P.AFFECTED: (ALL, ALL),
    P.AFFECTS: (ALL, ALL),
    P.ASSOCIATED_WITH: (ALL, ALL),
}
_REQUIREMENTS: dict[P, tuple[tuple[K, ...], ...]] = {
    P.IMPLEMENTS: ((K.SOURCE,), (K.IMPLEMENTATION,)),
    P.DEPENDS_ON: ((K.STATIC_ANALYSIS, K.RUNTIME_TRACE),),
    P.CALLS: ((K.STATIC_ANALYSIS, K.RUNTIME_TRACE),),
    P.READS: ((K.STATIC_ANALYSIS, K.SOURCE, K.RUNTIME_TRACE),),
    P.WRITES: ((K.STATIC_ANALYSIS, K.SOURCE, K.RUNTIME_TRACE),),
    P.PUBLISHES: ((K.SOURCE, K.RUNTIME_TRACE),),
    P.CONSUMES: ((K.SOURCE, K.RUNTIME_TRACE),),
    P.TESTED_BY: ((K.SOURCE, K.TEST),),
    P.VERIFIED_BY: ((K.TEST, K.DETERMINISTIC_PROOF, K.EXPERIMENT),),
    P.OBSERVED_BY: ((K.OBSERVATION, K.RUNTIME_TRACE, K.MEASUREMENT),),
    P.DOCUMENTED_BY: ((K.SOURCE,),),
    P.SUPERSEDES: ((K.SOURCE, K.OBSERVATION),),
    P.CONTRADICTS: ((K.NLI_PROOF, K.DETERMINISTIC_PROOF),),
    P.ENTAILS: ((K.NLI_PROOF, K.DETERMINISTIC_PROOF),),
    P.CORRELATES_WITH: ((K.STATISTICAL, K.OBSERVATION),),
    P.CAUSES: ((K.EXPERIMENT, K.OBSERVATION),),
    P.AUTHORIZED_BY: ((K.AUTHORIZATION,),),
    P.EXECUTED_BY: ((K.EXECUTION,),),
    P.BUILT_FROM: ((K.SOURCE,), (K.BUILD,)),
    P.DEPLOYED_AS: ((K.DEPLOYMENT,),),
    P.PROMOTED_TO: ((K.STAGING,), (K.RELEASE_CONTINUITY,)),
}
RELATION_CONTRACTS: Final[Mapping[P, RelationContract]] = MappingProxyType(
    {
        p: RelationContract(
            p,
            tuple(dict.fromkeys(d)),
            tuple(dict.fromkeys(r)),
            _REQUIREMENTS.get(p, ()),
            "specification section 35"
            if p in _REQUIREMENTS
            else "P0 endpoint default; section 34.2 names the predicate",
        )
        for p, (d, r) in _ENDPOINTS.items()
    }
)


@dataclass(frozen=True, slots=True, kw_only=True)
class Relation(Contract):
    """Carry a typed, versioned semantic edge with its evidence discipline."""

    predicate: P
    source: SubjectRef
    source_type: E
    target: SemanticId
    target_type: E
    target_version: str
    evidence: tuple[EvidenceReference, ...]
    confidence: float | None
    state: EvidenceState
    causal: CausalSupport | None = None
    shacl: ShaclValidationResult | None = None
    verification: VerificationReceipt | None = None
    policy: PolicyDecisionReceipt | None = None
    execution: ExecutionReceipt | None = None
    valid_time: ValidTime | None = None
    documentation_ref: SemanticId | None = None
    environment: SemanticId | None = None
    live: bool = False

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.source.semantic_id.require_entity_type(self.source_type)
        self.target.require_entity_type(self.target_type)
        text(self.target_version, "relation.target_version")
        rule = RELATION_CONTRACTS[self.predicate]
        require(
            self.source_type in rule.domain and self.target_type in rule.range,
            f"{self.predicate}: invalid domain/range",
        )
        require(
            self.source.semantic_id != self.target
            or self.predicate in (P.CALLS, P.INVOKES),
            "illegal relation self-reference",
        )
        require(
            self.confidence is None or 0 <= self.confidence <= 1,
            "relation.confidence must be between 0 and 1",
        )
        measured = self.state not in (
            EvidenceState.UNMEASURED,
            EvidenceState.QUARANTINED,
            EvidenceState.RETIRED,
            EvidenceState.SUPERSEDED,
        )
        validate_evidence(self.evidence, self.source, required=measured)
        if measured:
            kinds = {e.kind for e in self.evidence}
            require(
                all(
                    kinds.intersection(alternatives)
                    for alternatives in rule.evidence_requirements
                ),
                f"{self.predicate}: required evidence discipline missing",
            )
        if self.state is EvidenceState.VERIFIED:
            require(
                self.verification is not None, "VERIFIED relation requires verification"
            )
            assert self.verification is not None
            self.verification.require_pass(self.source)
            require(
                all(e in self.verification.result.evidence for e in self.evidence),
                "relation verification omits supporting evidence",
            )
        if self.verification is not None:
            require(
                self.verification.subject == self.source,
                "relation verification subject/version mismatch",
            )
        if self.shacl is not None:
            require(
                self.shacl.subject == self.source,
                "relation SHACL subject/version mismatch",
            )
        if self.predicate is P.IMPLEMENTS and self.state is EvidenceState.VERIFIED:
            require(
                self.shacl is not None and self.shacl.state is ShaclState.CONFORMS,
                "canonical implements requires SHACL pass",
            )
        if self.predicate is P.DEPENDS_ON and self.state is EvidenceState.OBSERVED:
            require(
                any(e.kind is K.RUNTIME_TRACE for e in self.evidence),
                "static dependency remains INFERRED until confirmed",
            )
        if self.predicate in (P.CAUSES, P.CONTRIBUTED_TO):
            require(
                self.causal is not None,
                "causal relation requires causal state and evidence",
            )
            assert self.causal is not None
            require(
                self.causal.subject == self.source,
                "causal evidence subject/version mismatch",
            )
            require(
                self.causal.state
                not in (CausalState.TEMPORAL_ONLY, CausalState.CORRELATED),
                "chronology/correlation is not causation",
            )
            if self.state is EvidenceState.VERIFIED:
                require(
                    self.causal.state is CausalState.VERIFIED_CAUSE,
                    "verified causal edge requires VERIFIED_CAUSE",
                )
                require(
                    self.verification == self.causal.verification,
                    "causal edge and support use different verification",
                )
        if (
            self.predicate in (P.CORRELATES_WITH, P.PRECEDED)
            and self.causal is not None
        ):
            require(
                self.causal.state
                in (CausalState.TEMPORAL_ONLY, CausalState.CORRELATED),
                "observational predicate cannot assert causation",
            )
        if self.predicate is P.ENTAILS:
            require(self.confidence is not None, "entails requires confidence")
        if self.predicate is P.DOCUMENTED_BY and measured:
            require(
                self.documentation_ref is not None
                and self.documentation_ref.scheme == "doc",
                "documented_by requires document/version/section",
            )
        if self.predicate is P.SUPERSEDES:
            require(
                self.valid_time is not None and self.valid_time.valid_from is not None,
                "supersedes requires valid-time",
            )
        if self.predicate in (P.AUTHORIZED_BY, P.ALLOWED_BY, P.DENIED_BY) or (
            self.predicate is P.WRITES and self.live
        ):
            require(
                self.policy is not None and self.policy.subject == self.source,
                "authority relation requires scoped policy receipt",
            )
            assert self.policy is not None
            require(
                self.policy.allowed is (self.predicate is not P.DENIED_BY),
                "policy verdict contradicts relation",
            )
            if self.predicate is P.WRITES:
                require(
                    self.target in self.policy.target_ids,
                    "live write target outside policy scope",
                )
            elif self.target_type is E.POLICY:
                require(
                    self.target == self.policy.policy_id
                    and self.target_version == self.policy.policy_version,
                    "authority edge names a different policy/version",
                )
            else:
                require(
                    self.policy.grant is not None
                    and self.target == self.policy.grant.grant_id,
                    "authority edge names a different grant",
                )
        if self.predicate is P.VERIFIED_BY and measured:
            require(
                self.verification is not None,
                "verified_by requires an independent verification receipt",
            )
            assert self.verification is not None
            expected = (
                self.verification.result.verifier_id
                if self.target_type is E.VERIFIER
                else self.verification.result.result_id
            )
            require(
                self.target == expected,
                "verified_by names a different verifier or test run",
            )
        if self.predicate is P.EXECUTED_BY:
            require(
                self.execution is not None
                and self.execution.subject == self.source
                and self.execution.executor_id == self.target,
                "executed_by requires a matching execution receipt",
            )
        if self.predicate in (P.DEPLOYED_AS, P.PROMOTED_TO):
            require(
                self.environment is not None, "deployment relation requires environment"
            )
