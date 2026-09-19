# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/ingestion/drafts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/models.py, libs/semantic_twin/relations.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/relations.py; PRODUCES libs/semantic_twin/ingestion/graph.py; SUPERSEDES libs/semantic_twin/phase1/compat.py
# Intent:      Resolve extracted facts in two passes so canonical edges bind real endpoint types, revisions and source evidence.
# ───────────────────────────────────────────────────────────────

"""Resolve extraction records into the current Phase 0 contracts."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..contracts import ContractError
from ..identity import ENTITY_NAMESPACES, EntityType, SemanticId, SubjectRef, ValidTime
from ..merkle import MerkleBinding
from ..models import (
    Authority,
    CanonicalObjectEnvelope,
    Documentation,
    ObjectState,
    Ownership,
    Provenance,
    Runtime,
    Source,
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

if TYPE_CHECKING:
    from .graph import SemanticGraph


EXTRACTOR_VERSION = "buildanddo-semantic-twin/2"
_KINDS: Mapping[str, EntityType] = {
    "CodeModule": EntityType.MODULE,
    "ExternalDependency": EntityType.SERVICE,
    "PublishedEvent": EntityType.EVENT_TYPE,
    "ReceiptFile": EntityType.FILE,
    "ReleaseStage": EntityType.CAPABILITY,
    "DocumentationClaim": EntityType.CLAIM,
    "DocumentationClaimAssessment": EntityType.INFERENCE,
    "DeploymentReceipt": EntityType.DOCUMENT,
    "ReleaseStateReceipt": EntityType.RECEIPT,
    "GitCommit": EntityType.COMMIT,
    "GitFileChange": EntityType.FILE,
    "SoftwareBillOfMaterials": EntityType.SBOM,
    "SoftwarePackage": EntityType.PACKAGE,
    "GitLabExport": EntityType.DOCUMENT,
    "GitLabPipeline": EntityType.OBSERVATION,
    "GitLabJob": EntityType.OBSERVATION,
    "GitLabArtifact": EntityType.RELEASE_ARTIFACT,
    "DatadogExport": EntityType.DOCUMENT,
    "DatadogDoraDeployment": EntityType.OBSERVATION,
    "DatadogTrace": EntityType.TRACE,
    "DatadogEvent": EntityType.LOG_EVENT,
    "RuntimeVerification": EntityType.OBSERVATION,
    "MemoryPayload": EntityType.DOCUMENT,
    "MemoryFileVector": EntityType.MEMORY,
    "MemoryEdgeVector": EntityType.CLAIM,
    "MemoryEventVector": EntityType.MEMORY,
    "MemoryVector": EntityType.MEMORY,
    "MemoryReference": EntityType.RESOURCE,
    "UnmeasuredInput": EntityType.REQUIREMENT,
    "ReleaseTruthMatrix": EntityType.INFERENCE,
}


def canonical_json(value: object) -> bytes:
    """Encode JSON with the Phase 0 sorted-key, ASCII-escape profile."""
    return json.dumps(
        value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def entity_type(kind: str) -> EntityType:
    """Map extraction categories onto the frozen entity vocabulary."""
    return _KINDS[kind] if kind in _KINDS else EntityType(kind)


def semantic_id(kind: str, key: str) -> SemanticId:
    """Mint a stable typed identity from an extraction key, not a v1 payload."""
    namespace = ENTITY_NAMESPACES[entity_type(kind)]
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return SemanticId(f"cni://{namespace}/buildanddo/{digest}")


@dataclass(frozen=True, slots=True)
class RelationDraft:
    """Retain an unresolved static edge until both endpoints are available."""

    predicate: RelationPredicate
    target: str
    evidence: tuple[str, ...]
    confidence: float | None
    state: EvidenceState
    evidence_kinds: tuple[EvidenceKind, ...] = (
        EvidenceKind.SOURCE,
        EvidenceKind.STATIC_ANALYSIS,
    )


@dataclass(frozen=True, slots=True)
class ObjectDraft:
    """Hold extracted facts separately from validated canonical envelopes."""

    semantic_id: str
    object_type: str
    source_path: str
    claims: tuple[Mapping[str, Any], ...]
    relations: tuple[RelationDraft, ...] = ()
    evidence_state: EvidenceState = EvidenceState.OBSERVED
    lifecycle_state: str = "INGESTED"
    commit: str | None = None
    documentation: tuple[str, ...] = ()
    runtime_status: str | None = None
    valid_time: ValidTime = ValidTime()
    input_digest: str | None = None
    supporting_digests: tuple[tuple[str, str], ...] = ()


def make_object(
    semantic_id: str,
    object_type: str,
    source_path: str,
    *,
    claims: Sequence[Mapping[str, Any]],
    relations: Sequence[RelationDraft] = (),
    evidence_state: EvidenceState = EvidenceState.OBSERVED,
    lifecycle_state: str = "INGESTED",
    commit: str | None = None,
    documentation: Sequence[str] = (),
    runtime_status: str | None = None,
    input_digest: str | None = None,
    supporting_digests: Sequence[tuple[str, str]] = (),
) -> ObjectDraft:
    """Stage extracted facts for explicit graph resolution and v2 validation."""
    entity_type(object_type)
    return ObjectDraft(
        semantic_id,
        object_type,
        source_path,
        tuple(claims),
        tuple(relations),
        evidence_state,
        lifecycle_state,
        commit,
        tuple(documentation),
        runtime_status,
        input_digest=input_digest,
        supporting_digests=tuple(supporting_digests),
    )


def add_relations(item: ObjectDraft, relations: Iterable[RelationDraft]) -> ObjectDraft:
    """Append stable de-duplicated edge intents to an extraction record."""
    unique = {
        canonical_json(
            {
                "predicate": r.predicate.value,
                "target": r.target,
                "evidence": r.evidence,
                "confidence": r.confidence,
                "state": r.state.value,
                "kinds": [k.value for k in r.evidence_kinds],
            }
        ): r
        for r in (*item.relations, *relations)
    }
    return replace(item, relations=tuple(unique[key] for key in sorted(unique)))


@dataclass(frozen=True, slots=True)
class GraphDraft:
    """Collect graph fragments with forward references before canonicalization."""

    objects: tuple[ObjectDraft, ...]

    def by_id(self) -> dict[str, ObjectDraft]:
        """Index extraction keys, rejecting collisions before resolution."""
        result = {item.semantic_id: item for item in self.objects}
        if len(result) != len(self.objects):
            raise ContractError("duplicate extraction identity")
        return result

    def relations(self) -> tuple[RelationDraft, ...]:
        """Return unresolved links for static extraction inspection."""
        return tuple(r for item in self.objects for r in item.relations)

    def resolve(
        self,
        *,
        repository_root: Path | None = None,
        observed_at: datetime | None = None,
    ) -> SemanticGraph:
        """Bind exact source bytes and all endpoints, then validate v2 objects."""
        from .graph import SemanticGraph

        captured = observed_at or datetime.now(timezone.utc)
        if captured.tzinfo is None or captured.utcoffset() is None:
            raise ContractError("capture time must be timezone-aware")
        captured = captured.astimezone(timezone.utc)
        indexed = self.by_id()
        identifiers = {
            key: semantic_id(item.object_type, key) for key, item in indexed.items()
        }
        unresolved = {r.target for r in self.relations()} - indexed.keys()
        if unresolved:
            raise ContractError(f"unresolved extraction targets: {sorted(unresolved)}")
        snapshots: dict[str, str] = {}
        for item in self.objects:
            path = Path(item.source_path)
            if not path.is_absolute() and repository_root is not None:
                path = repository_root / path
            digest = item.input_digest
            if digest is None and path.is_file():
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest is not None:
                old = snapshots.setdefault(item.source_path, digest)
                if old != digest:
                    raise ContractError("source changed within a compilation")
            for source_path, supporting_digest in item.supporting_digests:
                old = snapshots.setdefault(source_path, supporting_digest)
                if old != supporting_digest:
                    raise ContractError("source changed within a compilation")

        # Generated analyses are versioned by their actual input snapshot and facts.
        # A repository HEAD is context, never a substitute for the bytes parsed.
        sources: dict[str, Source] = {}
        for key, item in indexed.items():
            digest = snapshots.get(item.source_path)
            if digest is None:
                if not item.source_path.startswith(("semantic-twin:", "git:")):
                    raise ContractError(f"missing source snapshot: {item.source_path}")
                digest = hashlib.sha256(
                    canonical_json(
                        {
                            "path": item.source_path,
                            "claims": item.claims,
                            "inputs": snapshots,
                            "extractor": EXTRACTOR_VERSION,
                        }
                    )
                ).hexdigest()
            sources[key] = Source(
                system="buildanddo",
                uri_or_path=item.source_path,
                document_version=f"sha256:{digest}",
            )

        def source_ref(key: str, locator: str) -> SemanticId:
            candidates = [
                path
                for path in snapshots
                if locator == path or locator.startswith(path + ":")
            ]
            path = max(candidates, key=len) if candidates else indexed[key].source_path
            digest = snapshots.get(path, sources[key].version.removeprefix("sha256:"))
            document = hashlib.sha256(path.encode("utf-8")).hexdigest()[:24]
            line = re.search(r":(\d+)$", locator)
            section = "line-" + line[1] if line else "document"
            return SemanticId(f"doc://buildanddo-{document}/{digest}/{section}")

        def evidence(key: str, kind: EvidenceKind, locator: str) -> EvidenceReference:
            subject = SubjectRef(identifiers[key], sources[key].version)
            ref = source_ref(key, locator)
            digest = hashlib.sha256(
                canonical_json(
                    [str(subject.semantic_id), subject.version, kind.value, str(ref)]
                )
            ).hexdigest()
            return EvidenceReference(
                SemanticId(f"cni://evidence/{digest}"), subject, kind, ref, captured
            )

        def translate(value: Any) -> Any:
            if isinstance(value, str):
                return str(identifiers.get(value, value))
            if isinstance(value, Mapping):
                return {k: translate(v) for k, v in value.items()}
            if isinstance(value, (tuple, list)):
                return [translate(v) for v in value]
            return value

        objects: list[CanonicalObjectEnvelope] = []
        for key, item in indexed.items():
            subject = SubjectRef(identifiers[key], sources[key].version)
            kind = entity_type(item.object_type)
            relations = []
            for draft in add_relations(item, ()).relations:
                target = indexed[draft.target]
                refs = tuple(
                    dict.fromkeys(
                        evidence(key, k, locator)
                        for locator in draft.evidence
                        for k in draft.evidence_kinds
                    )
                )
                relations.append(
                    Relation(
                        predicate=draft.predicate,
                        source=subject,
                        source_type=kind,
                        target=identifiers[draft.target],
                        target_type=entity_type(target.object_type),
                        target_version=sources[draft.target].version,
                        evidence=refs,
                        confidence=draft.confidence,
                        state=draft.state,
                    )
                )
            record_kind = (
                EvidenceKind.STATIC_ANALYSIS
                if item.source_path.startswith("semantic-twin:")
                else EvidenceKind.SOURCE
            )
            ref = evidence(key, record_kind, item.source_path)
            facts = tuple(translate(claim) for claim in item.claims)
            metadata: dict[str, object] = {
                "ingestion_kind": item.object_type,
                "ingestion_key": item.semantic_id,
                "source_commit": item.commit,
                "evidence_locations": sorted(
                    {
                        item.source_path,
                        *(loc for r in item.relations for loc in r.evidence),
                    }
                ),
            }
            if item.runtime_status is not None:
                metadata["reported_status"] = item.runtime_status
            objects.append(
                CanonicalObjectEnvelope(
                    semantic_id=identifiers[key],
                    object_type=kind,
                    schema_version="2",
                    source=sources[key],
                    valid_time=item.valid_time,
                    observed_time=captured,
                    state=ObjectState(
                        evidence_state=item.evidence_state,
                        shacl_state=ShaclState.NOT_EVALUATED,
                        merkle_state=MerkleState.UNHASHED,
                        cgrf_action_state=CgrfActionState.OBSERVED,
                        tevv_state=TevvState.NOT_TESTED,
                        semantic_transaction_state=SemanticTransactionState.DRAFT,
                        causal_state=CausalState.TEMPORAL_ONLY,
                        corpus_use_state=CorpusUseState.DISCOVERY_ONLY,
                        authority_tier=AuthorityTier.A0,
                        lifecycle_state=item.lifecycle_state,
                    ),
                    claims=(*facts, metadata),
                    relations=tuple(relations),
                    provenance=Provenance(
                        derived_from=(ref.source,),
                        parser_version="python-stdlib",
                        extractor_version=EXTRACTOR_VERSION,
                    ),
                    merkle=MerkleBinding(),
                    ownership=Ownership(
                        SemanticId("cni://organization/citadel-nexus-inc"),
                        SemanticId("cni://guild/buildanddo"),
                    ),
                    authority=Authority(AuthorityTier.A0, "immutable"),
                    runtime=Runtime(),
                    documentation=Documentation(
                        tuple(source_ref(key, r) for r in item.documentation)
                    ),
                    evidence=(ref,),
                )
            )
        return SemanticGraph(tuple(objects))


def combine_drafts(*graphs: GraphDraft) -> GraphDraft:
    """Join extraction fragments before binding references to canonical endpoints."""
    combined = GraphDraft(tuple(item for graph in graphs for item in graph.objects))
    combined.by_id()
    return combined
