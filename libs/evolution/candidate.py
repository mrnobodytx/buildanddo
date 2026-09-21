# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/candidate.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/episode.py, libs/semantic_twin/merkle.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/episode.py; CONSUMES libs/semantic_twin/merkle.py; CONSUMES libs/semantic_twin/vocabulary.py
# Intent:      Discover repeatable response hypotheses with exact corpus and authority boundaries.
# ───────────────────────────────────────────────────────────────

"""Discover structured hypotheses while separating repeated success from verification."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, ContextRoot, SourceRevision
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    EvidenceState,
    RelationPredicate,
    TevvState,
)

from .common import digest, identity, mapping, unique
from .episode import Episode
from .event import Phase


@dataclass(frozen=True, slots=True)
class Compatibility(Contract):
    """Freeze the source, graph schema and supply-chain context a rule was evaluated on."""

    source_sha: str
    context_root: ContextRoot
    sbom_digest: ContentDigest | None
    graph_schema: str = "2"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        SourceRevision(self.source_sha)
        require(self.graph_schema == "2", "unsupported semantic graph schema")


@dataclass(frozen=True, slots=True)
class GraphCondition(Contract):
    """Require an existing typed graph edge, with optional feature-bound endpoints."""

    source: str
    predicate: RelationPredicate
    target: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.source, "condition source")
        text(self.target, "condition target")


@dataclass(frozen=True, slots=True)
class GraphLookup(Contract):
    """Resolve one exact scalar graph claim instead of generating a replacement."""

    name: str
    node: str
    field: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.name, self.node, self.field):
            text(value, "graph lookup")
        require(not self.name.startswith("$"), "lookup name excludes binding marker")


@dataclass(frozen=True, slots=True, kw_only=True)
class Decision(Contract):
    """Describe an inspectable action selection without performing an effect."""

    diagnosis: str
    operation: str
    targets: tuple[SemanticId, ...]
    parameters: Mapping[str, str] = field(default_factory=dict)
    tests: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.diagnosis, "diagnosis")
        text(self.operation, "operation")
        require(
            bool(self.targets) and len(set(self.targets)) == len(self.targets),
            "decision requires unique explicit targets",
        )
        unique(self.tests, "test")
        for key, value in self.parameters.items():
            text(key, "parameter")
            text(value, "parameter value")

    @property
    def action_key(self) -> str:
        """Compare structured actions independently of diagnosis prose and test selection."""
        return digest(
            {
                "operation": self.operation,
                "targets": self.targets,
                "parameters": self.parameters,
            }
        )

    @property
    def requested_action(self) -> str:
        """Bind exact action parameters into the existing change contract."""
        return self.to_json()


@dataclass(frozen=True, slots=True, kw_only=True)
class ResponseTemplate(Contract):
    """Limit compilation to literal values and named feature/graph substitutions."""

    diagnosis: str
    operation: str
    targets: tuple[str, ...]
    parameters: Mapping[str, str] = field(default_factory=dict)
    tests: tuple[str, ...] = ()
    reverse_tests_for: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.diagnosis, "diagnosis")
        text(self.operation, "operation")
        require(bool(self.targets), "response requires bounded targets")
        for name in ("targets", "tests", "reverse_tests_for"):
            unique(getattr(self, name), name)
        for key, value in self.parameters.items():
            text(key, "parameter key")
            text(value, "parameter template")


@dataclass(frozen=True, slots=True)
class Rule(Contract):
    """Represent an exact-match predicate and a finite deterministic response."""

    features: Mapping[str, str]
    response: ResponseTemplate
    relations: tuple[GraphCondition, ...] = ()
    lookups: tuple[GraphLookup, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.features), "rule requires at least one observed trigger")
        require(
            len({v.name for v in self.lookups}) == len(self.lookups), "duplicate lookup"
        )
        require(
            not set(self.features) & {v.name for v in self.lookups},
            "lookup cannot replace a trigger feature",
        )
        for key, value in self.features.items():
            text(key, "trigger key")
            text(value, "trigger value")


@dataclass(frozen=True, slots=True)
class TrainingIdentity(Contract):
    """Retain discovery identities for episode, correlation and source leakage checks."""

    episode_id: str
    correlation_id: str
    source_shas: tuple[str, ...]
    ended_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.episode_id, "training episode")
        text(self.correlation_id, "training correlation")
        for sha in self.source_shas:
            SourceRevision(sha)


@dataclass(frozen=True, slots=True, kw_only=True)
class Candidate(Contract):
    """Keep a learned pattern at HYPOTHESIS until the separate promotion gates pass."""

    scope_id: str
    actor_id: SemanticId
    authority: AuthorityTier
    risk: str
    rule: Rule
    compatibility: Compatibility
    training: tuple[TrainingIdentity, ...]
    observations: int
    successful_repairs: int
    discovery_cutoff: datetime
    discovered_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "candidate scope")
        text(self.risk, "candidate risk")
        require(bool(self.training), "candidate requires discovery episodes")
        require(
            len({e.episode_id for e in self.training}) == len(self.training),
            "duplicate discovery episode",
        )
        require(
            len({e.correlation_id for e in self.training}) == len(self.training),
            "multiple revisions of one discovery correlation",
        )
        require(
            self.observations >= len(self.training)
            and 0 < self.successful_repairs <= self.observations,
            "invalid candidate observation/success counts",
        )
        require(
            all(e.ended_at <= self.discovery_cutoff for e in self.training),
            "discovery contains future training data",
        )
        require(
            self.discovered_at >= self.training_end, "discovery predates observations"
        )

    @property
    def candidate_id(self) -> str:
        """Keep the pattern identity stable while evidence revisions remain distinct."""
        return str(
            identity(
                "capability",
                {
                    "scope": self.scope_id,
                    "rule": self.rule,
                    "authority": self.authority,
                },
            )
        )

    @property
    def subject(self) -> SubjectRef:
        """Bind promotion receipts to the full pattern and discovery-evidence revision."""
        return SubjectRef(SemanticId(self.candidate_id), "sha256:" + digest(self))

    @property
    def training_end(self) -> datetime:
        """Return the latest source observation used to learn the candidate."""
        return self.discovery_cutoff

    @property
    def evidence_state(self) -> EvidenceState:
        """Expose discovery standing without manufacturing a verified flag."""
        return EvidenceState.HYPOTHESIS


def discover_candidates(
    episodes: tuple[Episode, ...],
    *,
    before: datetime,
    discovered_at: datetime,
    compatibility: Compatibility,
    actor_id: SemanticId,
    min_observations: int = 2,
) -> tuple[Candidate, ...]:
    """Group observed trigger/response patterns only within the declared discovery window."""
    require(min_observations >= 2, "discovery requires repeated observations")
    groups: dict[str, list[tuple[Episode, Rule, bool]]] = defaultdict(list)
    for episode in episodes:
        if episode.ended_at > before:
            continue
        problems = [
            e for e in episode.events if e.phase is Phase.PROBLEM and e.features
        ]
        if not problems:
            continue
        problem = problems[0]
        for attempt in episode.attempts:
            if attempt.action.observed_at < problem.observed_at:
                continue
            raw = attempt.action.data.get("rule")
            if raw is not None:
                rule = Rule.from_dict(mapping(raw))
                require(
                    all(problem.features.get(k) == v for k, v in rule.features.items()),
                    "discovery rule does not match the captured trigger",
                )
            else:
                response = attempt.action.data.get("response")
                if response is None:
                    continue
                rule = Rule(
                    problem.features, ResponseTemplate.from_dict(mapping(response))
                )
            key = digest((problem.scope_id, problem.authority, problem.risk, rule))
            groups[key].append(
                (
                    episode,
                    rule,
                    episode.status == "VERIFIED" and attempt.verdict is TevvState.PASS,
                )
            )
    candidates = []
    for key in sorted(groups):
        rows = groups[key]
        training = {
            e.episode_id: TrainingIdentity(
                e.episode_id, e.events[0].correlation_id, e.source_shas, e.ended_at
            )
            for e, _, _ in rows
        }
        successes = sum(success for _, _, success in rows)
        if len(training) < min_observations or not successes:
            continue
        first, rule, _ = rows[0]
        require(
            all(e.ingested_at <= discovered_at for ep, _, _ in rows for e in ep.events),
            "discovery predates local ingestion",
        )
        event = first.events[0]
        candidates.append(
            Candidate(
                scope_id=event.scope_id,
                actor_id=actor_id,
                authority=event.authority,
                risk=event.risk,
                rule=rule,
                compatibility=compatibility,
                training=tuple(training[k] for k in sorted(training)),
                observations=len(rows),
                successful_repairs=successes,
                discovery_cutoff=before,
                discovered_at=discovered_at,
            )
        )
    return tuple(candidates)
