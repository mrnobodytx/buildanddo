# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/ingestion/builder.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/merkle.py, libs/semantic_twin/models.py, libs/semantic_twin/receipts.py, libs/semantic_twin/relations.py, libs/semantic_twin/vocabulary.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/merkle.py; CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/receipts.py; CONSUMES libs/semantic_twin/relations.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.integration.builder
# Intent:      Compile explicitly typed extraction records into strict v2 envelopes and defer edge binding until both revisions exist.
# ───────────────────────────────────────────────────────────────

"""Build strict contracts from local extraction records, never from v1 wire data."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType

from ..contracts import require
from ..identity import ENTITY_NAMESPACES, EntityType, SemanticId, SubjectRef, ValidTime
from ..merkle import MerkleBinding, SourceRevision
from ..models import (
    Authority,
    CanonicalObjectEnvelope,
    Documentation,
    ObjectState,
    Ownership,
    Provenance,
    Runtime,
)
from ..receipts import EvidenceKind, EvidenceReference
from ..relations import Relation
from ..vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    RelationPredicate,
    SemanticTransactionState,
    ShaclState,
    TevvState,
)
from .inputs import SourceSnapshot


# Extractor categories are metadata, not additions to the frozen entity vocabulary.
SOURCE_KINDS: Mapping[str, EntityType] = MappingProxyType(
    {
        "CodeModule": EntityType.MODULE,
        "ExternalDependency": EntityType.SERVICE,
        "PublishedEvent": EntityType.EVENT_TYPE,
        "SourceCommit": EntityType.COMMIT,
        "BuildArtifact": EntityType.RELEASE_ARTIFACT,
        "Verification": EntityType.VERIFIER,
        "EvidenceReceipt": EntityType.RECEIPT,
        "DocumentationClaim": EntityType.CLAIM,
        "DeploymentReceipt": EntityType.RECEIPT,
        "UnmeasuredInput": EntityType.OBSERVATION,
        "GitCommit": EntityType.COMMIT,
        "GitFileChange": EntityType.FILE,
        "SoftwareBillOfMaterials": EntityType.SBOM,
        "SoftwarePackage": EntityType.PACKAGE,
        "GitLabExport": EntityType.DOCUMENT,
        "GitLabPipeline": EntityType.WORKFLOW,
        "GitLabJob": EntityType.TOOL_CALL,
        "GitLabArtifact": EntityType.RELEASE_ARTIFACT,
        "DatadogExport": EntityType.DOCUMENT,
        "DatadogDoraDeployment": EntityType.OBSERVATION,
        "DatadogTrace": EntityType.TRACE,
        "DatadogEvent": EntityType.EVENT_INSTANCE,
        "RuntimeVerification": EntityType.OBSERVATION,
        "MemoryPayload": EntityType.DOCUMENT,
        "MemoryReference": EntityType.RESOURCE,
        "MemoryFileVector": EntityType.MEMORY,
        "MemoryEdgeVector": EntityType.MEMORY,
        "MemoryEventVector": EntityType.MEMORY,
        "MemoryVector": EntityType.MEMORY,
        "ReleaseStateReceipt": EntityType.RECEIPT,
        "ReleaseTruthMatrix": EntityType.EVALUATION,
        "DocumentationClaimAssessment": EntityType.INFERENCE,
    }
)


def entity_type(kind: str) -> EntityType:
    """Resolve a declared extractor category against the frozen entity types."""
    return SOURCE_KINDS[kind] if kind in SOURCE_KINDS else EntityType(kind)


def canonical_id(kind: str, local_key: str) -> SemanticId:
    """Give a stable extractor-local key a type-qualified canonical identity.

    Local keys are opaque handles, not serialized semantic IDs. Only already
    typed SemanticId values bypass this derivation, and their type is checked.
    """
    selected = entity_type(kind)
    if isinstance(local_key, SemanticId):
        local_key.require_entity_type(selected)
        return local_key
    require(bool(local_key.strip()), "empty local extraction key")
    digest = hashlib.sha256(local_key.encode("utf-8")).hexdigest()
    return SemanticId(f"cni://{ENTITY_NAMESPACES[selected]}/buildanddo/{digest}")


def object_kind(item: CanonicalObjectEnvelope) -> str:
    """Read the original extractor category without extending EntityType."""
    for claim in reversed(item.claims):
        if isinstance(kind := claim.get("ingestion_kind"), str):
            return kind
        metadata = claim.get("ingestion")
        if isinstance(metadata, Mapping) and isinstance(metadata.get("kind"), str):
            return str(metadata["kind"])
    return item.object_type.value


@dataclass(frozen=True, slots=True)
class RelationDraft:
    """Retain an extraction assertion until its endpoint revisions are available."""

    predicate: RelationPredicate
    target: str
    evidence: tuple[str, ...]
    confidence: float | None = 1.0
    state: EvidenceState = EvidenceState.OBSERVED
    kinds: tuple[EvidenceKind, ...] = (EvidenceKind.SOURCE,)
    environment: SemanticId | None = None


@dataclass(frozen=True, slots=True)
class PendingRelation:
    """Keep a scoped assertion separate from canonical edges until resolution."""

    source: SubjectRef
    draft: RelationDraft
    evidence: tuple[EvidenceReference, ...]

    def bind(
        self, source: CanonicalObjectEnvelope, target: CanonicalObjectEnvelope
    ) -> Relation:
        """Use actual endpoint types and revisions and invoke all P0 edge rules."""
        require(
            source.subject == self.source, "pending relation source revision changed"
        )
        return Relation(
            predicate=self.draft.predicate,
            source=source.subject,
            source_type=source.object_type,
            target=target.semantic_id,
            target_type=target.object_type,
            target_version=target.source.version,
            evidence=self.evidence,
            confidence=self.draft.confidence,
            state=self.draft.state,
            environment=self.draft.environment,
        )


@dataclass(frozen=True, slots=True)
class ObjectDraft:
    """Carry a valid envelope plus explicit, as-yet unbound extraction edges."""

    local_key: str
    envelope: CanonicalObjectEnvelope
    pending: tuple[PendingRelation, ...]

    @property
    def semantic_id(self) -> SemanticId:
        """Return the identity available before edge resolution."""
        return self.envelope.semantic_id

    @property
    def claims(self) -> tuple[Mapping[str, object], ...]:
        """Expose immutable extracted claims before graph assembly."""
        return self.envelope.claims


def pending_relation(
    item: CanonicalObjectEnvelope, draft: RelationDraft, snapshot: SourceSnapshot
) -> PendingRelation:
    """Bind only real captured evidence, leaving candidate edges unmeasured."""
    unmeasured = draft.state in {
        EvidenceState.UNMEASURED,
        EvidenceState.QUARANTINED,
        EvidenceState.SUPERSEDED,
        EvidenceState.RETIRED,
    }
    evidence = (
        ()
        if unmeasured
        else tuple(
            snapshot.evidence(item.subject, kind, selector)
            for selector in dict.fromkeys(draft.evidence)
            for kind in dict.fromkeys(draft.kinds)
        )
    )
    return PendingRelation(item.subject, draft, evidence)


def make_object(
    semantic_id: str,
    object_type: str,
    source_path: str,
    *,
    snapshot: SourceSnapshot,
    claims: Sequence[Mapping[str, object]],
    relations: Sequence[RelationDraft] = (),
    evidence_state: EvidenceState = EvidenceState.OBSERVED,
    lifecycle_state: str = "INGESTED",
    commit: str | None = None,
    documentation: Sequence[str] = (),
    runtime_status: str | None = None,
) -> ObjectDraft:
    """Build a read-only observation with all ten axes and captured source evidence."""
    require(source_path == snapshot.source_path, "snapshot source path mismatch")
    if commit is not None:
        SourceRevision(commit)
    identity = canonical_id(object_type, semantic_id)
    subject = SubjectRef(identity, snapshot.version)
    measured = evidence_state not in {
        EvidenceState.UNMEASURED,
        EvidenceState.QUARANTINED,
        EvidenceState.SUPERSEDED,
        EvidenceState.RETIRED,
    }
    metadata: dict[str, object] = {"kind": object_type, "local_key": str(semantic_id)}
    selectors = dict.fromkeys(
        (
            "content",
            *documentation,
            *(ref for edge in relations for ref in edge.evidence),
        )
    )
    metadata["source_selectors"] = [
        {"reference": str(snapshot.reference(selector)), "selector": selector}
        for selector in selectors
    ]
    if commit is not None:
        metadata["repository_commit_context"] = commit
    if runtime_status is not None:
        # A field in a captured report is not a live telemetry observation.
        metadata["reported_status"] = runtime_status
    item = CanonicalObjectEnvelope(
        semantic_id=identity,
        object_type=entity_type(object_type),
        schema_version="2",
        source=snapshot.source,
        valid_time=ValidTime(),
        observed_time=snapshot.observed_at,
        state=ObjectState(
            evidence_state=evidence_state,
            shacl_state=ShaclState.NOT_EVALUATED,
            merkle_state=MerkleState.UNHASHED,
            cgrf_action_state=CgrfActionState.OBSERVED,
            tevv_state=TevvState.NOT_TESTED,
            semantic_transaction_state=SemanticTransactionState.DRAFT,
            causal_state=CausalState.TEMPORAL_ONLY,
            corpus_use_state=CorpusUseState.DISCOVERY_ONLY,
            authority_tier=AuthorityTier.A0,
            lifecycle_state=lifecycle_state,
        ),
        claims=(*claims, {"ingestion": metadata}),
        relations=(),
        provenance=Provenance(
            derived_from=(snapshot.reference(),),
            parser_version="python-stdlib",
            extractor_version="buildanddo-local-ingestion/2",
        ),
        merkle=MerkleBinding(),
        ownership=Ownership(
            owner=SemanticId("cni://organization/citadel-nexus-inc"),
            guild=SemanticId("cni://guild/buildanddo"),
        ),
        authority=Authority(required_tier=AuthorityTier.A0, mutability="immutable"),
        runtime=Runtime(),
        documentation=Documentation(
            references=tuple(
                snapshot.reference(ref) for ref in dict.fromkeys(documentation)
            ),
        ),
        evidence=(snapshot.evidence(subject, EvidenceKind.SOURCE),) if measured else (),
    )
    return ObjectDraft(
        semantic_id,
        item,
        tuple(pending_relation(item, edge, snapshot) for edge in relations),
    )
