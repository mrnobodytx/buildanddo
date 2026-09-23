# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/composition.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/registry.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/merkle.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Compose measured capabilities without implicit authority joins or privacy downgrades.
# ───────────────────────────────────────────────────────────────

"""Compose certified contracts into a typed plan without executing constituent actions."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from libs.evolution.common import digest, unique
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import AuthorityTier

from .models import TokenPin
from .registry import Registry
from .verification import ReviewPolicy


@dataclass(frozen=True, slots=True)
class PortBinding(Contract):
    """Connect one required output to one input without changing its privacy class."""

    source_step: str
    output: str
    input: str


@dataclass(frozen=True, slots=True)
class CompositionStep(Contract):
    """Pin an implementation and distinguish caller variables from upstream results."""

    name: str
    token: TokenPin
    implementation: str
    bindings: tuple[PortBinding, ...]
    external_inputs: tuple[str, ...]
    constants: Mapping[str, object]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.name, "step name")
        unique(self.external_inputs, "external input")
        names = (
            [b.input for b in self.bindings]
            + list(self.external_inputs)
            + list(self.constants)
        )
        require(
            len(names) == len(set(names)), "composition input has multiple producers"
        )


@dataclass(frozen=True, slots=True)
class CompositionPlan(Contract):
    """Retain a topological, same-authority plan for a receiving governed executor."""

    scope_id: str
    authority: AuthorityTier
    planned_at: datetime
    steps: tuple[CompositionStep, ...]
    registry_root: ContentDigest

    @property
    def plan_digest(self) -> ContentDigest:
        """Bind every implementation, variable edge and registry revision."""
        return ContentDigest(digest(self))


def compose(
    registry: Registry,
    steps: tuple[CompositionStep, ...],
    policy: ReviewPolicy,
    *,
    authority: AuthorityTier,
    at: datetime,
) -> CompositionPlan:
    """Require current certificates, exact port schemas, isolation and an acyclic dependency plan."""
    require(bool(steps) and len(steps) <= 64, "composition needs bounded steps")
    require(len({s.name for s in steps}) == len(steps), "duplicate step name")
    by_name = {s.name: s for s in steps}
    tokens = {
        s.name: registry.require_ready(s.token, s.implementation, policy, at=at).token
        for s in steps
    }
    classes = {"public": 0, "tenant_private": 1, "secret": 2}
    for step in steps:
        token = tokens[step.name]
        require(
            token.authority.tier is authority,
            "composition cannot raise or collapse authority",
        )
        require(
            len(steps) <= token.max_composition_steps,
            "composition exceeds a token boundary",
        )
        props = token.inputs.document["properties"]
        assert isinstance(props, Mapping)
        supplied = (
            {b.input for b in step.bindings}
            | set(step.constants)
            | set(step.external_inputs)
        )
        required = token.inputs.document["required"]
        assert isinstance(required, tuple)
        require(
            set(required) <= supplied <= set(props),
            "composition inputs are incomplete or unknown",
        )
        for key, value in step.constants.items():
            token.inputs.field(key).validate(value)
        for binding in step.bindings:
            require(binding.source_step in by_name, "unknown producer step")
            source = tokens[binding.source_step].outputs.field(
                binding.output, required=True
            )
            target = token.inputs.field(binding.input)
            require(target.accepts(source), "incompatible composition port types")
            require(
                classes[source.classification] <= classes[target.classification],
                "composition cannot downgrade private data",
            )
    ordered: list[CompositionStep] = []
    visiting: set[str] = set()
    done: set[str] = set()

    def visit(name: str) -> None:
        require(name not in visiting, "composition cycle")
        if name in done:
            return
        visiting.add(name)
        for binding in by_name[name].bindings:
            visit(binding.source_step)
        visiting.remove(name)
        done.add(name)
        ordered.append(by_name[name])

    for name in by_name:
        visit(name)
    root = registry.state().root
    assert root is not None
    return CompositionPlan(registry.scope_id, authority, at, tuple(ordered), root)
