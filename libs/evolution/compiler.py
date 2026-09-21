# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/compiler.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/candidate.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/transactions.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/candidate.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/transactions.py
# Intent:      Compile exact graph rules into bounded proposals that enter the existing change-contract boundary.
# ───────────────────────────────────────────────────────────────

"""Compile bounded graph rules into proposals for the existing transaction boundary."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import EntityType, SemanticId, SubjectRef
from libs.semantic_twin.ingestion.graph import SemanticGraph
from libs.semantic_twin.merkle import ContentDigest, ContextRoot, SourceRevision
from libs.semantic_twin.models import CanonicalObjectEnvelope
from libs.semantic_twin.transactions import (
    Actor,
    ChangeContract,
    ChangeProposal,
    SemanticTransaction,
    StateRoots,
    TransactionIntent,
)
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    EvidenceState,
    RelationPredicate,
    SemanticTransactionState,
)

from .candidate import Candidate, Compatibility, Decision, Rule
from .common import digest, identity, unique


def _require_as_of(value: object, as_of: datetime) -> None:
    """Reject late receipts anywhere in a typed object, including relation evidence."""
    if isinstance(value, Contract) and is_dataclass(value):
        for field in fields(value):
            item = getattr(value, field.name)
            if isinstance(item, datetime) and field.name in {
                "observed_at",
                "observed_time",
                "evaluated_at",
                "occurred_at",
                "created_at",
                "issued_at",
                "requested_at",
                "valid_from",
            }:
                require(item <= as_of, "graph contains future typed evidence")
            if field.name == "valid_until" and isinstance(item, datetime):
                require(as_of < item, "graph contains expired validity")
            _require_as_of(item, as_of)
    elif isinstance(value, (tuple, list)):
        for item in value:
            _require_as_of(item, as_of)
    elif isinstance(value, Mapping):
        for item in value.values():
            _require_as_of(item, as_of)


@dataclass(frozen=True, slots=True, kw_only=True)
class GraphSnapshot(Contract):
    """Freeze only graph objects observable at the declared decision boundary."""

    scope_id: str
    source_sha: str
    as_of: datetime
    objects: tuple[CanonicalObjectEnvelope, ...]
    sbom_digest: ContentDigest | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "graph scope")
        SourceRevision(self.source_sha)
        SemanticGraph(self.objects).require_resolved()
        _require_as_of(self.objects, self.as_of)
        require(
            all(
                obj.observed_time is not None and obj.observed_time <= self.as_of
                for obj in self.objects
            ),
            "graph contains future or undated objects",
        )
        require(
            all(
                ref.observed_at <= self.as_of
                for obj in self.objects
                for ref in obj.evidence
            ),
            "graph contains future evidence",
        )
        object.__setattr__(
            self,
            "objects",
            tuple(sorted(self.objects, key=lambda obj: obj.semantic_id)),
        )

    @property
    def root(self) -> ContextRoot:
        """Hash source, supply context and every exact object revision."""
        return ContextRoot(
            digest(
                {
                    "schema": "2",
                    "scope": self.scope_id,
                    "source_sha": self.source_sha,
                    "sbom": self.sbom_digest,
                    "objects": self.objects,
                }
            )
        )

    @property
    def compatibility(self) -> Compatibility:
        """Expose the exact supported input boundary for live registry selection."""
        return Compatibility(self.source_sha, self.root, self.sbom_digest)

    def resolve(self, name: str) -> CanonicalObjectEnvelope | None:
        """Resolve a unique identity or declared name; ambiguous aliases abstain."""
        matches = [
            obj
            for obj in self.objects
            if name == str(obj.semantic_id)
            or any(
                claim.get(key) == name
                for claim in obj.claims
                for key in ("name", "module", "path", "qualified_name")
            )
        ]
        return matches[0] if len(matches) == 1 else None

    def reverse_tests(self, targets: tuple[SemanticId, ...]) -> tuple[str, ...]:
        """Select explicit tests through reverse dependencies and tested_by edges."""
        impacted = set(targets)
        changed = True
        while changed:
            changed = False
            for obj in self.objects:
                if obj.semantic_id in impacted:
                    continue
                if any(
                    edge.predicate
                    in (RelationPredicate.DEPENDS_ON, RelationPredicate.CALLS)
                    and edge.target in impacted
                    and usable(edge.state)
                    for edge in obj.relations
                ):
                    impacted.add(obj.semantic_id)
                    changed = True
        tests = {
            str(obj.semantic_id)
            for obj in self.objects
            if obj.semantic_id in impacted and obj.object_type is EntityType.TEST
        }
        for obj in self.objects:
            if obj.semantic_id in impacted:
                tests.update(
                    str(edge.target)
                    for edge in obj.relations
                    if edge.predicate is RelationPredicate.TESTED_BY
                    and usable(edge.state)
                )
        return tuple(sorted(tests))


def usable(state: EvidenceState) -> bool:
    """Exclude absent, contradicted or quarantined edges from deterministic matching."""
    return state in (
        EvidenceState.OBSERVED,
        EvidenceState.INFERRED,
        EvidenceState.VERIFIED,
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class DecisionInput(Contract):
    """Separate decision-time features and allowed proposal scope from later outcomes."""

    scope_id: str
    correlation_id: str
    authority: AuthorityTier
    risk: str
    decision_at: datetime
    features_observed_at: datetime
    features: Mapping[str, str]
    graph: GraphSnapshot
    allowed_targets: tuple[SemanticId, ...]
    allowed_operations: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.correlation_id, "decision correlation")
        text(self.risk, "decision risk")
        require(self.scope_id == self.graph.scope_id, "decision graph scope mismatch")
        require(
            self.features_observed_at <= self.decision_at
            and self.graph.as_of <= self.decision_at,
            "future decision context",
        )
        require(
            bool(self.allowed_targets)
            and len(set(self.allowed_targets)) == len(self.allowed_targets),
            "decision requires explicit unique allowed targets",
        )
        require(bool(self.allowed_operations), "decision requires bounded operations")
        unique(self.allowed_operations, "allowed operation")
        require(
            set(self.allowed_targets)
            <= {obj.semantic_id for obj in self.graph.objects},
            "allowed target absent from decision graph",
        )

    @property
    def input_id(self) -> str:
        """Bind teacher and student to the same features, time and graph."""
        return str(identity("context", self))


def _bind(value: str, variables: Mapping[str, str]) -> str | None:
    return variables.get(value[1:]) if value.startswith("$") else value


def evaluate_rule(rule: Rule, observation: DecisionInput) -> Decision | None:
    """Run finite exact matching and graph lookups without models, code generation or effects."""
    if not all(
        observation.features.get(key) == value for key, value in rule.features.items()
    ):
        return None
    variables = dict(observation.features)
    graph = observation.graph
    for lookup in rule.lookups:
        selector = _bind(lookup.node, variables)
        node = graph.resolve(selector) if selector is not None else None
        if node is None or not usable(node.state.evidence_state):
            return None
        values = {
            claim[lookup.field]
            for claim in node.claims
            if type(claim.get(lookup.field)) is str
        }
        if len(values) != 1 or lookup.name in variables:
            return None
        variables[lookup.name] = str(next(iter(values)))
    for condition in rule.relations:
        left, right = (
            _bind(condition.source, variables),
            _bind(condition.target, variables),
        )
        source = graph.resolve(left) if left is not None else None
        target = graph.resolve(right) if right is not None else None
        if (
            source is None
            or target is None
            or not any(
                edge.predicate is condition.predicate
                and edge.target == target.semantic_id
                and usable(edge.state)
                for edge in source.relations
            )
        ):
            return None
    response = rule.response
    targets: list[SemanticId] = []
    for target_name in response.targets:
        value = _bind(target_name, variables)
        node = graph.resolve(value) if value is not None else None
        if node is None:
            return None
        targets.append(node.semantic_id)
    parameters = {
        key: _bind(value, variables) for key, value in response.parameters.items()
    }
    if any(value is None for value in parameters.values()):
        return None
    reverse_targets: list[SemanticId] = []
    for target_name in response.reverse_tests_for:
        value = _bind(target_name, variables)
        node = graph.resolve(value) if value is not None else None
        if node is None:
            return None
        reverse_targets.append(node.semantic_id)
    if response.operation not in observation.allowed_operations or not set(
        targets
    ) <= set(observation.allowed_targets):
        return None
    return Decision(
        diagnosis=response.diagnosis,
        operation=response.operation,
        targets=tuple(targets),
        parameters={key: str(value) for key, value in parameters.items()},
        tests=tuple(
            sorted(
                set(response.tests) | set(graph.reverse_tests(tuple(reverse_targets)))
            )
        ),
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class ActionProposal(Contract):
    """Carry an action suggestion that cannot authorize or execute itself."""

    capability: SubjectRef
    scope_id: str
    authority: AuthorityTier
    source_sha: str
    context_root: ContextRoot
    decision: Decision
    requested_at: datetime
    correlation_id: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.capability.semantic_id.require_namespace("capability")
        SourceRevision(self.source_sha)
        text(self.scope_id, "proposal scope")
        text(self.correlation_id, "proposal correlation")

    @property
    def proposal_id(self) -> str:
        """Address the exact suggestion for the receiving AAXP adapter."""
        return str(identity("plan", self))

    def require_contract(self, contract: ChangeContract) -> None:
        """Bind the proposal to a caller-supplied change contract without granting authority."""
        require(contract.authority_tier is self.authority, "proposal authority changed")
        require(
            contract.source_sha == self.source_sha
            and contract.context_root == self.context_root,
            "proposal source/context changed",
        )
        require(
            contract.correlation_id == self.correlation_id,
            "proposal correlation changed",
        )
        require(
            contract.requested_at >= self.requested_at, "contract predates proposal"
        )
        require(
            contract.requested_action == self.decision.requested_action,
            "contract action differs from exact proposal",
        )
        require(
            set(contract.target_ids) == set(self.decision.targets),
            "contract target expansion",
        )

    def draft_transaction(
        self,
        *,
        contract: ChangeContract,
        before: StateRoots,
        targets: tuple[SubjectRef, ...],
        graph_change: ChangeProposal,
    ) -> SemanticTransaction:
        """Enter the existing DRAFT boundary; external policy and execution remain required."""
        self.require_contract(contract)
        return SemanticTransaction(
            schema_version="2",
            transaction_id=contract.semantic_transaction_id,
            revision=self.proposal_id.rsplit("/", 1)[-1],
            actor=Actor(contract.actor_id, contract.actor_type),
            intent=TransactionIntent(
                contract.requested_action,
                targets,
                contract.objective_id,
                contract.mission_id,
            ),
            before=before,
            proposal=graph_change,
            state=SemanticTransactionState.DRAFT,
            authority=contract,
            evidence=contract.input_evidence,
        )


def propose(candidate: Candidate, observation: DecisionInput) -> ActionProposal | None:
    """Compile a compatible candidate at unchanged authority into a bounded suggestion."""
    require(candidate.scope_id == observation.scope_id, "candidate scope mismatch")
    require(
        candidate.authority is observation.authority,
        "competence cannot change authority",
    )
    require(candidate.risk == observation.risk, "candidate risk scope mismatch")
    require(
        candidate.compatibility == observation.graph.compatibility,
        "candidate source/schema/SBOM/context is incompatible",
    )
    require(
        observation.decision_at >= candidate.discovered_at,
        "candidate not yet discovered",
    )
    decision = evaluate_rule(candidate.rule, observation)
    if decision is None:
        return None
    return ActionProposal(
        capability=candidate.subject,
        scope_id=candidate.scope_id,
        authority=candidate.authority,
        source_sha=observation.graph.source_sha,
        context_root=observation.graph.root,
        decision=decision,
        requested_at=observation.decision_at,
        correlation_id=observation.correlation_id,
    )
