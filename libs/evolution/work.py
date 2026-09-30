# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/work.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/evolution/common.py; CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py
# Intent:      Preserve public work boundaries and result provenance across BuildAndDo and Citadel without transferring execution authority.
# ───────────────────────────────────────────────────────────────

"""Define portable candidate-only work using the existing strict contract codec."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath
import re
from typing import Literal

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef

from .common import digest, unique

EvidenceKind = Literal["commit", "test", "artifact", "deployment", "runtime"]
Lane = Literal["development", "experience", "research", "operations"]
Party = Literal["buildanddo", "citadel-nexus"]
MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
MAX_BUNDLE_BYTES = 64 * 1024 * 1024
PUBLIC_FORBIDDEN = (
    ".git/**",
    "golden/**",
    "infra/**",
    "private/**",
    "secrets/**",
    "ops/private/**",
    "sops/**",
    "terraform/**",
    "tofu/**",
    "ansible/**",
    "helm/**",
    "flux/**",
    "state/**",
    "evidence/private/**",
    "ci/buildanddo/**",
    "scripts/deploy/**",
    ".citadel/**",
)


def bounded_text(value: str, name: str, limit: int = 256) -> None:
    """Reject empty, oversized and control-bearing identifiers or prose."""
    text(value, name)
    require(len(value) <= limit, f"{name} exceeds its bound")
    require(value == value.strip(), f"{name} has surrounding whitespace")
    require(all(ord(c) >= 32 and ord(c) != 127 for c in value), f"invalid {name}")


def revision(value: str) -> None:
    """Require a full lowercase Git object identity rather than a mutable ref."""
    require(
        bool(re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", value)),
        "invalid full candidate revision",
    )


def relative_path(value: str, *, rule: bool = False) -> str:
    """Accept exact paths or an explicit directory/** boundary without traversal."""
    bounded_text(value, "path", 512)
    base = value[:-3] if rule and value.endswith("/**") else value
    require(bool(base) and not base.startswith("/"), "path must be relative")
    require(not any(c in base for c in "\\:*?[]%"), "unsupported path syntax")
    require(
        all(p not in ("", ".", "..") for p in base.split("/")),
        "path traversal or ambiguous separator",
    )
    require(PurePosixPath(base).as_posix() == base, "noncanonical path")
    return base


def _matches(path: str, rule: str) -> bool:
    base = relative_path(rule, rule=True)
    return path == base or (rule.endswith("/**") and path.startswith(base + "/"))


def public_path(path: str) -> None:
    """Reject private/deployment source and credential-shaped file names."""
    relative_path(path)
    require(
        not any(_matches(path, rule) for rule in PUBLIC_FORBIDDEN),
        "private or deployment-control path",
    )
    require(
        all(
            not part.startswith(".env")
            and part not in ("id_rsa", "id_ed25519", "credentials.json")
            for part in path.split("/")
        ),
        "credential file path",
    )


@dataclass(frozen=True, slots=True)
class WorkSource(Contract):
    """Name the public collaboration repository and frozen starting revision."""

    repository: str
    revision: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(
                re.fullmatch(
                    r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}",
                    self.repository,
                )
            ),
            "use a public owner/repository slug",
        )
        revision(self.revision)


@dataclass(frozen=True, slots=True)
class AcceptanceCheck(Contract):
    """Give each required observation a stable name and a measurable statement."""

    name: str
    statement: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", self.name)),
            "invalid acceptance name",
        )
        bounded_text(self.statement, "acceptance statement", 2000)


@dataclass(frozen=True, slots=True, kw_only=True)
class WorkContract(Contract):
    """Carry a bounded proposal; an SRS or dispatch label is not an approval."""

    schema: Literal["buildanddo.work/v1"]
    mission_id: str
    scope_id: str
    producer: Party
    consumer: Party
    lane: Lane
    objective: str
    srs: str
    dispatch: str
    source: WorkSource
    created_at: datetime
    allowed_paths: tuple[str, ...]
    forbidden_paths: tuple[str, ...]
    required_capabilities: tuple[str, ...]
    acceptance: tuple[AcceptanceCheck, ...]
    evidence_required: tuple[EvidenceKind, ...]
    origin: SubjectRef | None = None
    authority: Literal["candidate_only"] = "candidate_only"
    visibility: Literal["public"] = "public"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for name in ("mission_id", "scope_id"):
            bounded_text(getattr(self, name), name)
        bounded_text(self.objective, "objective", 4000)
        require(
            self.producer != self.consumer,
            "work must name distinct producing and consuming systems",
        )
        require(
            bool(re.fullmatch(r"SRS-[A-Z0-9]+(?:-[A-Z0-9]+)+", self.srs)), "invalid SRS"
        )
        require(
            bool(re.fullmatch(r"(?:VCC|USO)-[A-Z0-9]+(?:-[A-Z0-9]+)+", self.dispatch)),
            "invalid dispatch",
        )
        require(
            0 < len(self.allowed_paths) <= 100 and len(self.forbidden_paths) <= 100,
            "bound the allowed and forbidden paths",
        )
        for group in (self.allowed_paths, self.forbidden_paths):
            unique(group, "path rule")
            for path in group:
                relative_path(path, rule=True)
        for rule in self.allowed_paths:
            public_path(relative_path(rule, rule=True))
            require(
                not any(
                    _matches(relative_path(rule, rule=True), denied)
                    for denied in self.forbidden_paths
                ),
                "allowed path is forbidden",
            )
        require(
            0 < len(self.required_capabilities) <= 32,
            "declare bounded required capabilities",
        )
        unique(self.required_capabilities, "capability")
        for capability in self.required_capabilities:
            bounded_text(capability, "capability", 128)
        require(0 < len(self.acceptance) <= 32, "declare bounded acceptance checks")
        unique(tuple(c.name for c in self.acceptance), "acceptance check")
        unique(self.evidence_required, "required evidence")
        require(
            {"commit", "test", "artifact"} <= set(self.evidence_required),
            "candidate work requires commit, test and artifact evidence",
        )

    @property
    def digest(self) -> str:
        """Bind the entire proposed contract using the existing canonical codec."""
        return digest(self)

    @property
    def source_id(self) -> SemanticId:
        """Address the complete work contract for an independent review."""
        return SemanticId(f"cni://document/work/{self.digest}")

    def require_paths(self, paths: tuple[str, ...]) -> None:
        """Enforce mandatory public boundaries and deny rules before allow rules."""
        unique(paths, "changed path")
        require(len(paths) <= 1000, "too many changed paths")
        for path in paths:
            public_path(path)
            require(
                not any(_matches(path, p) for p in self.forbidden_paths),
                "changed path is forbidden",
            )
            require(
                any(_matches(path, p) for p in self.allowed_paths),
                "changed path is outside work scope",
            )


@dataclass(frozen=True, slots=True)
class CodeHostIdentity(Contract):
    """Retain a declared stable provider account ID without authenticating it."""

    provider: Literal["github", "gitlab"]
    account_id: str
    login: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(re.fullmatch(r"[1-9][0-9]{0,19}", self.account_id)),
            "use a stable numeric provider account ID",
        )
        require(
            bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", self.login)),
            "invalid provider login",
        )


@dataclass(frozen=True, slots=True)
class WorkerIdentity(Contract):
    """Keep canonical worker identity separate from provider aliases and trust."""

    actor_id: SemanticId
    actor_type: Literal["human", "agent", "mixed"]
    accounts: tuple[CodeHostIdentity, ...] = ()
    identity_status: Literal["declared"] = "declared"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.actor_id.require_namespace("person", "agent", "guildmaster", "persona")
        unique(tuple(a.provider for a in self.accounts), "provider binding")


@dataclass(frozen=True, slots=True)
class WorkEvidence(Contract):
    """Describe retained bytes and their reported author, kind and observation time."""

    evidence_id: str
    kind: EvidenceKind
    path: str
    sha256: str
    size: int
    observed_at: datetime
    author: SemanticId

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        bounded_text(self.evidence_id, "evidence ID", 128)
        public_path(self.path)
        require(
            bool(re.fullmatch(r"[0-9a-f]{64}", self.sha256)), "invalid evidence digest"
        )
        require(0 < self.size <= MAX_ARTIFACT_BYTES, "empty or oversized evidence")
        self.author.require_namespace(
            "person", "agent", "guildmaster", "persona", "service"
        )

    @property
    def source_id(self) -> SemanticId:
        """Bind author, time, kind, path and bytes as one review source."""
        return SemanticId(f"cni://artifact/work/{digest(self)}")


@dataclass(frozen=True, slots=True)
class WorkCheck(Contract):
    """Retain a producer's check outcome without treating it as independent proof."""

    name: str
    status: Literal["PASS", "FAIL", "SKIP", "MISSING"]
    evidence_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        bounded_text(self.name, "check name", 64)
        unique(self.evidence_ids, "check evidence")
        require(
            self.status != "PASS" or bool(self.evidence_ids),
            "passing check needs evidence",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class WorkResult(Contract):
    """Record one immutable attempt against a work contract and exact candidate."""

    schema: Literal["buildanddo.work-result/v1"]
    work_digest: str
    mission_id: str
    scope_id: str
    attempt_id: str
    worker: WorkerIdentity
    source: WorkSource
    candidate_revision: str
    changed_paths: tuple[str, ...]
    started_at: datetime
    completed_at: datetime
    status: Literal["PASS", "FAIL", "HOLD", "CANCELLED", "ROLLED_BACK"]
    checks: tuple[WorkCheck, ...]
    evidence: tuple[WorkEvidence, ...]
    contributors: tuple[SemanticId, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(re.fullmatch(r"[0-9a-f]{64}", self.work_digest)), "invalid work digest"
        )
        for name in ("mission_id", "scope_id", "attempt_id"):
            bounded_text(getattr(self, name), name)
        revision(self.candidate_revision)
        require(self.started_at <= self.completed_at, "result chronology is reversed")
        require(
            len(self.checks) <= 32
            and len(self.evidence) <= 128
            and len(self.contributors) <= 32,
            "result exceeds bounds",
        )
        unique(tuple(c.name for c in self.checks), "check")
        unique(tuple(e.evidence_id for e in self.evidence), "evidence ID")
        unique(tuple(e.path for e in self.evidence), "evidence path")
        unique(tuple(str(a) for a in self.contributors), "contributor")
        for actor in self.contributors:
            actor.require_namespace("person", "agent", "guildmaster", "persona")
        require(
            sum(e.size for e in self.evidence) <= MAX_BUNDLE_BYTES,
            "evidence bundle exceeds bound",
        )
        require(
            all(
                self.started_at <= e.observed_at <= self.completed_at
                for e in self.evidence
            ),
            "evidence is outside attempt time",
        )
        ids = {e.evidence_id for e in self.evidence}
        require(
            all(set(c.evidence_ids) <= ids for c in self.checks),
            "check cites unknown evidence",
        )

    @property
    def digest(self) -> str:
        """Bind attempt identity, all outcomes and exact source/evidence references."""
        return digest(self)

    @property
    def source_id(self) -> SemanticId:
        """Address the immutable result for the existing review kernel."""
        return SemanticId(f"cni://artifact/work-result/{self.digest}")


@dataclass(frozen=True, slots=True)
class WorkSubmission(Contract):
    """Bind a returned attempt to the complete work contract before review."""

    work: WorkContract
    result: WorkResult

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.result.work_digest == self.work.digest,
            "result names different work bytes",
        )
        require(
            self.result.mission_id == self.work.mission_id
            and self.result.scope_id == self.work.scope_id,
            "result crosses mission or scope",
        )
        require(
            self.result.source == self.work.source,
            "result changes repository or starting revision",
        )
        require(
            self.work.created_at <= self.result.started_at,
            "result predates work contract",
        )
        self.work.require_paths(self.result.changed_paths)
        require(
            {c.name for c in self.result.checks}
            <= {c.name for c in self.work.acceptance},
            "result adds undeclared checks",
        )

    @property
    def subject(self) -> SubjectRef:
        """Pin an independent review to the entire returned work and result."""
        value = digest(self)
        return SubjectRef(SemanticId(f"cni://evaluation/work/{value}"), value)

    @property
    def required_sources(self) -> tuple[SemanticId, ...]:
        """Require every accepted check to cover the exact contract and evidence."""
        return (
            self.work.source_id,
            self.result.source_id,
            *(e.source_id for e in self.result.evidence),
        )
