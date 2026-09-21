# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/registry.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/promotion.py, libs/evolution/compiler.py, libs/evolution/event.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/promotion.py; CONSUMES libs/evolution/compiler.py; CONSUMES libs/evolution/event.py
# Intent:      Select compiled proposals or configured fallbacks at unchanged authority and feed their actual use back into observations.
# ───────────────────────────────────────────────────────────────

"""Select proposal-only capabilities, retaining observations for the next evolution cycle."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from time import perf_counter_ns

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState, StringEnum

from .candidate import Compatibility, Rule
from .common import digest
from .compiler import ActionProposal, DecisionInput, propose
from .event import CitadelEvent, Phase, SourceKind
from .promotion import CapabilityRecord, CompetenceState
from .scorer import Resources


class InferenceMode(StringEnum):
    """Name the actual selected proposal route, including lack of a configured answer."""

    TOKENLESS = "TOKENLESS"
    LOCAL_MODEL = "LOCAL_MODEL"
    FRONTIER_MODEL = "FRONTIER_MODEL"
    UNRESOLVED = "UNRESOLVED"


@dataclass(frozen=True, slots=True)
class TokenlessProgram(Contract):
    """Serialize a finite graph program instead of generated prose or executable source."""

    capability: SubjectRef
    scope_id: str
    authority: AuthorityTier
    compatibility: Compatibility
    rule: Rule
    compiler_version: str = "citadel.graph-rule/1"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.compiler_version == "citadel.graph-rule/1", "unknown rule compiler"
        )

    @property
    def program_digest(self) -> str:
        """Hash every instruction and bound authority/context field deterministically."""
        return digest(self)


def compile_capability(record: CapabilityRecord) -> TokenlessProgram:
    """Compile only a fully gated capability; learning does not authorize execution."""
    require(
        record.state
        in (CompetenceState.VERIFIED_CAPABILITY, CompetenceState.TOKENLESS_PREFERRED),
        "compilation requires verified competence",
    )
    candidate = record.candidate
    return TokenlessProgram(
        candidate.subject,
        candidate.scope_id,
        candidate.authority,
        candidate.compatibility,
        candidate.rule,
    )


@dataclass(frozen=True, slots=True)
class ModelAttempt(Contract):
    """Accept one configured adapter's proposal and actual captured usage."""

    model: str
    model_version: str
    proposal: ActionProposal | None
    resources: Resources

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.model, "model")
        text(self.model_version, "model version")


Reasoner = Callable[[DecisionInput], ModelAttempt]


@dataclass(frozen=True, slots=True)
class Selection(Contract):
    """Return the proposed action alongside the observation feeding the next episode."""

    mode: InferenceMode
    proposal: ActionProposal | None
    event: CitadelEvent
    reasons: tuple[str, ...]
    attempts: tuple[ModelAttempt, ...] = ()


def require_bounded(proposal: ActionProposal, observation: DecisionInput) -> None:
    """Apply identical scope and authority limits to rules and model fallbacks."""
    require(
        proposal.scope_id == observation.scope_id,
        "fallback changes tenant/workspace scope",
    )
    require(proposal.authority is observation.authority, "fallback changes authority")
    require(
        proposal.source_sha == observation.graph.source_sha
        and proposal.context_root == observation.graph.root,
        "fallback changes context",
    )
    require(
        proposal.correlation_id == observation.correlation_id,
        "fallback changes correlation",
    )
    require(
        proposal.requested_at >= observation.decision_at, "fallback predates request"
    )
    require(
        set(proposal.decision.targets) <= set(observation.allowed_targets)
        and proposal.decision.operation in observation.allowed_operations,
        "fallback exceeds bounded action scope",
    )


def select(
    records: tuple[CapabilityRecord, ...],
    observation: DecisionInput,
    *,
    actor_id: SemanticId,
    observed_at: datetime,
    mission_id: str | None = None,
    local_model: Reasoner | None = None,
    frontier_model: Reasoner | None = None,
) -> Selection:
    """Try compatible preferred rules, then explicitly configured proposal-only fallbacks."""
    require(observed_at >= observation.decision_at, "selection predates decision input")
    started = perf_counter_ns()
    matches: list[tuple[ActionProposal, CapabilityRecord]] = []
    reasons = []
    for record in sorted(records, key=lambda r: r.candidate.candidate_id):
        candidate = record.candidate
        if candidate.scope_id != observation.scope_id:
            continue
        if record.state is not CompetenceState.TOKENLESS_PREFERRED:
            continue
        if record.history[-1].occurred_at > observation.decision_at:
            reasons.append("capability was not preferred at decision time")
            continue
        if (
            candidate.authority is not observation.authority
            or candidate.risk != observation.risk
        ):
            reasons.append("capability authority/risk does not match request")
            continue
        if candidate.compatibility != observation.graph.compatibility:
            reasons.append("capability source/schema/SBOM/context is incompatible")
            continue
        proposed = propose(candidate, observation)
        if proposed is not None:
            matches.append((proposed, record))
    proposal: ActionProposal | None = None
    chosen: CapabilityRecord | None = None
    mode = InferenceMode.UNRESOLVED
    attempts: list[ModelAttempt] = []
    if len(matches) == 1:
        proposal, chosen = matches[0]
        mode = InferenceMode.TOKENLESS
    else:
        reasons.append(
            "ambiguous rule matches" if matches else "no eligible rule matched"
        )
        for route, reasoner in (
            (InferenceMode.LOCAL_MODEL, local_model),
            (InferenceMode.FRONTIER_MODEL, frontier_model),
        ):
            if reasoner is None:
                reasons.append(route.value.lower() + " is not configured")
                continue
            attempt = reasoner(observation)
            attempts.append(attempt)
            if attempt.proposal is not None:
                require_bounded(attempt.proposal, observation)
                proposal, mode = attempt.proposal, route
                break
    if proposal is not None:
        require_bounded(proposal, observation)
        require(proposal.requested_at <= observed_at, "proposal is in the future")
    elapsed = (perf_counter_ns() - started) / 1_000_000
    resource_values: dict[str, object] = {"latency_ms": elapsed}
    for name in ("model_calls", "tokens", "cost_usd"):
        values = [getattr(attempt.resources, name) for attempt in attempts]
        resource_values[name] = (
            sum(values) if all(v is not None for v in values) else None
        )
    output = proposal.to_dict() if proposal is not None else None
    data: dict[str, object] = {
        "route": mode.value,
        "proposal": output,
        "resources": resource_values,
        "effects_executed": 0,
    }
    if proposal is not None:
        data["attempt_id"] = proposal.proposal_id
        if chosen is not None:
            data["rule"] = compile_capability(chosen).rule.to_dict()
            data["registry_revision"] = chosen.revision
        else:
            data["response"] = {
                "diagnosis": proposal.decision.diagnosis,
                "operation": proposal.decision.operation,
                "targets": [str(target) for target in proposal.decision.targets],
                "parameters": dict(proposal.decision.parameters),
                "tests": proposal.decision.tests,
            }
    emitted = CitadelEvent(
        scope_id=observation.scope_id,
        occurred_at=observed_at,
        observed_at=observed_at,
        ingested_at=observed_at,
        mission_id=mission_id,
        correlation_id=observation.correlation_id,
        actor_id=actor_id,
        event_type="evolution.proposal_observed",
        subject_id=SemanticId(proposal.proposal_id)
        if proposal
        else SemanticId(observation.input_id),
        subject_version=digest(output if output is not None else observation),
        source_sha=observation.graph.source_sha,
        source_kind=SourceKind.EVOLUTION,
        source_ref=observation.input_id,
        source_digest=ContentDigest(digest(observation)),
        evidence_state=EvidenceState.OBSERVED,
        authority=observation.authority,
        risk=observation.risk,
        phase=Phase.ACTION if proposal else Phase.CONTEXT,
        inputs=(observation.input_id,),
        outputs=(proposal.proposal_id,) if proposal else (),
        features=observation.features,
        data=data,
    )
    return Selection(mode, proposal, emitted, tuple(reasons), tuple(attempts))
