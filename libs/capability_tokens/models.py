# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/models.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/schema.py, libs/evolution/common.py, libs/evolution/promotion.py, libs/evolution/registry.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/capability_tokens/schema.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/promotion.py; DEPENDS_ON libs/evolution/registry.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Bind portable capabilities to immutable implementation bytes, compatibility, authority and economic contracts.
# ───────────────────────────────────────────────────────────────

"""Freeze the portable capability-token specification and exact artifact bindings."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Literal

from libs.evolution.common import digest, unique
from libs.evolution.promotion import PromotionPolicy
from libs.evolution.registry import TokenlessProgram
from libs.semantic_twin.contracts import Contract, ContractError, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.vocabulary import AuthorityTier

from .schema import ValueSchema

CHECKS = (
    "schema",
    "positive",
    "negative",
    "replay",
    "security",
    "rollback",
    "compatibility",
    "tevv",
)
MAX_BYTES = 8_000_000


def content_hash(content: str | bytes) -> ContentDigest:
    """Hash exact UTF-8 artifact bytes, independently of semantic serialization."""
    return ContentDigest(
        hashlib.sha256(
            content.encode() if isinstance(content, str) else content
        ).hexdigest()
    )


def version_key(version: str) -> tuple[int, ...]:
    """Parse stable semantic versions without aliases, ranges or prerelease ambiguity."""
    require(
        re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version) is not None,
        "expected stable semantic version",
    )
    return tuple(int(part) for part in version.split("."))


def safe_path(path: str) -> None:
    """Reject traversal, credential filenames and ambiguous portable paths."""
    require(
        bool(path) and len(path) <= 240 and "\\" not in path and ":" not in path,
        "unsafe artifact path",
    )
    parsed = PurePosixPath(path)
    require(
        bool(parsed.parts)
        and not parsed.is_absolute()
        and parsed.as_posix() == path
        and all(part not in (".", "..", "") for part in parsed.parts),
        "unsafe artifact path",
    )
    require(
        all(
            not part.startswith(".env")
            and part not in ("credentials.json", "id_rsa", "id_ed25519", ".git")
            for part in parsed.parts
        ),
        "credential or internal path is not portable",
    )


@dataclass(frozen=True, slots=True)
class TokenPin(Contract):
    """Resolve a version to one exact manifest rather than to a mutable tag."""

    capability_id: SemanticId
    version: str
    manifest_digest: ContentDigest

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.capability_id.require_namespace("capability")
        version_key(self.version)

    @property
    def key(self) -> str:
        """Name a public immutable version independent of its advertised digest."""
        return f"{self.capability_id}@{self.version}"


@dataclass(frozen=True, slots=True)
class Asset(Contract):
    """Describe an inert UTF-8 resource by path, byte length and SHA-256."""

    path: str
    sha256: ContentDigest
    size: int

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        safe_path(self.path)
        require(0 < self.size <= 1_000_000, "invalid resource size")


@dataclass(frozen=True, slots=True, kw_only=True)
class Implementation(Contract):
    """Pin an alternative implementation and its independently certifiable boundary."""

    implementation_id: str
    kind: Literal["graph_rule", "agent_skill", "mcp_tool"]
    source_sha: str
    entrypoint: str
    assets: tuple[Asset, ...]
    environments: tuple[str, ...]
    sbom_digest: ContentDigest | None = None
    rollback_entrypoint: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", self.implementation_id) is not None,
            "invalid implementation ID",
        )
        SourceRevision(self.source_sha)
        require(
            bool(self.assets)
            and len({a.path for a in self.assets}) == len(self.assets),
            "implementation needs unique assets",
        )
        require(
            self.entrypoint in {a.path for a in self.assets}, "entrypoint is not bound"
        )
        require(bool(self.environments), "implementation needs explicit environments")
        unique(self.environments, "environment")
        if self.rollback_entrypoint is not None:
            require(
                self.rollback_entrypoint in {a.path for a in self.assets}
                and self.rollback_entrypoint != self.entrypoint,
                "rollback is not separately bound",
            )

    @property
    def digest(self) -> ContentDigest:
        """Identify code, resources, runtime compatibility and rollback together."""
        return ContentDigest(digest(self))


@dataclass(frozen=True, slots=True)
class AuthorityRequirements(Contract):
    """Declare required authority without granting it to the caller."""

    tier: AuthorityTier
    operations: tuple[str, ...]
    tools: tuple[str, ...]
    forbidden_side_effects: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for name, values in (
            ("operation", self.operations),
            ("tool", self.tools),
            ("forbidden side effect", self.forbidden_side_effects),
        ):
            require(bool(values), "authority boundaries must be explicit")
            unique(values, name)


@dataclass(frozen=True, slots=True)
class EvidenceRequirements(Contract):
    """Bind certification to an explicit verifier policy and bounded freshness."""

    policy_id: SemanticId
    policy_version: str
    max_age_seconds: int = 604800
    replay_policy: PromotionPolicy = PromotionPolicy()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.policy_id.require_namespace("policy")
        text(self.policy_version, "evidence policy version")
        require(
            1 <= self.max_age_seconds <= 31_536_000, "invalid certification lifetime"
        )


@dataclass(frozen=True, slots=True)
class Rollback(Contract):
    """Declare the independently tested compensation contract."""

    operation: str
    postconditions: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.operation, "rollback operation")
        require(bool(self.postconditions), "rollback needs postconditions")
        unique(self.postconditions, "rollback postcondition")


@dataclass(frozen=True, slots=True)
class Attribution(Contract):
    """Reserve a bounded royalty share for an identified creator."""

    creator_id: SemanticId
    basis_points: int

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(0 <= self.basis_points <= 10000, "invalid royalty share")


@dataclass(frozen=True, slots=True)
class Pricing(Contract):
    """Quote integer minor currency units per independently verified result."""

    currency: str
    price_minor: int
    attributions: tuple[Attribution, ...]
    unit: Literal["verified_result"] = "verified_result"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            re.fullmatch(r"[A-Z]{3}", self.currency) is not None, "invalid currency"
        )
        require(0 <= self.price_minor <= 10**12, "invalid price")
        require(
            bool(self.attributions)
            and len({a.creator_id for a in self.attributions})
            == len(self.attributions),
            "pricing needs unique creators",
        )
        require(
            sum(a.basis_points for a in self.attributions) <= 10000,
            "royalties exceed gross amount",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class CapabilityToken(Contract):
    """Represent a portable measured-capability contract, never an access credential."""

    capability_id: SemanticId
    publisher: str
    version: str
    name: str
    description: str
    category: str
    risk: str
    skills: tuple[str, ...]
    inputs: ValueSchema
    outputs: ValueSchema
    authority: AuthorityRequirements
    evidence: EvidenceRequirements
    implementations: tuple[Implementation, ...]
    applicability: tuple[str, ...]
    rollback: Rollback
    pricing: Pricing
    license: str
    dependencies: tuple[TokenPin, ...] = ()
    lineage: tuple[SubjectRef, ...] = ()
    max_composition_steps: int = 16
    schema_version: Literal["cnwb.capability-token/v1"] = "cnwb.capability-token/v1"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        version_key(self.version)
        require(
            re.fullmatch(r"[a-z][a-z0-9-]{0,62}", self.publisher) is not None,
            "invalid publisher",
        )
        require(
            str(self.capability_id).startswith(f"cni://capability/{self.publisher}/"),
            "capability is outside publisher namespace",
        )
        for value in (
            self.name,
            self.description,
            self.category,
            self.risk,
            self.license,
        ):
            text(value, "capability metadata")
        for values in (self.skills, self.applicability):
            require(bool(values), "skills and applicability must be explicit")
            unique(values, "capability metadata")
        require(
            self.inputs.document["type"] == self.outputs.document["type"] == "object",
            "token inputs and outputs must be closed objects",
        )
        require(
            bool(self.implementations)
            and len({i.implementation_id for i in self.implementations})
            == len(self.implementations),
            "implementations must be unique",
        )
        require(
            len({d.capability_id for d in self.dependencies}) == len(self.dependencies),
            "duplicate dependency",
        )
        require(
            all(d.capability_id != self.capability_id for d in self.dependencies),
            "self dependency",
        )
        require(
            self.rollback.operation in self.authority.operations,
            "rollback operation is outside scope",
        )
        require(1 <= self.max_composition_steps <= 64, "invalid composition limit")

    @property
    def pin(self) -> TokenPin:
        """Address this exact contract and every implementation descriptor."""
        return TokenPin(self.capability_id, self.version, ContentDigest(digest(self)))

    def implementation(self, name: str) -> Implementation:
        """Select an explicit alternative without a mutable default."""
        for item in self.implementations:
            if item.implementation_id == name:
                return item
        raise ContractError("unknown implementation")

    def binding(self, name: str) -> ImplementationBinding:
        """Bind certification and metering to an exact implementation under this contract."""
        return ImplementationBinding(self.pin, name, self.implementation(name).digest)


@dataclass(frozen=True, slots=True)
class ImplementationBinding(Contract):
    """Prevent certification or performance inheritance across implementation changes."""

    token: TokenPin
    implementation_id: str
    implementation_digest: ContentDigest

    @property
    def subject(self) -> SubjectRef:
        """Name the semantic-kernel subject of this precise portable implementation."""
        return SubjectRef(self.token.capability_id, digest(self))


@dataclass(frozen=True, slots=True)
class TokenBundle(Contract):
    """Carry exact inert text assets while keeping private execution evidence separate."""

    token: CapabilityToken
    files: Mapping[str, str]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            len(self.files) <= 128
            and sum(len(c.encode()) for c in self.files.values()) <= MAX_BYTES,
            "bundle exceeds size limits",
        )
        assets: dict[str, Asset] = {}
        for impl in self.token.implementations:
            for asset in impl.assets:
                require(
                    asset.path not in assets or asset == assets[asset.path],
                    "conflicting shared resource",
                )
                assets[asset.path] = asset
        require(
            set(assets) == set(self.files),
            "bundle contains missing or undeclared resources",
        )
        for path, content in self.files.items():
            asset = assets[path]
            require(
                content_hash(content) == asset.sha256
                and len(content.encode()) == asset.size,
                "resource content does not match manifest",
            )
        for impl in self.token.implementations:
            if impl.kind != "graph_rule":
                continue
            for program_path in (impl.entrypoint, impl.rollback_entrypoint):
                if program_path is None:
                    continue
                program = TokenlessProgram.from_json(self.files[program_path])
                require(
                    program.authority is self.token.authority.tier,
                    "program changes required authority",
                )
                require(
                    program.compatibility.source_sha == impl.source_sha
                    and program.compatibility.sbom_digest == impl.sbom_digest,
                    "program source or supply context mismatch",
                )
                require(
                    program.rule.response.operation in self.token.authority.operations,
                    "program operation outside declared scope",
                )
                require(
                    program.capability in self.token.lineage,
                    "program lacks learning lineage",
                )
                if program_path == impl.rollback_entrypoint:
                    require(
                        program.rule.response.operation
                        == self.token.rollback.operation,
                        "rollback program differs from compensation contract",
                    )

    def program(self, name: str, *, rollback: bool = False) -> TokenlessProgram:
        """Load the existing finite graph program without importing or executing code."""
        impl = self.token.implementation(name)
        require(
            impl.kind == "graph_rule", "opaque skills/tools require a receiving adapter"
        )
        path = impl.rollback_entrypoint if rollback else impl.entrypoint
        require(path is not None, "rollback program is unavailable")
        assert path is not None
        return TokenlessProgram.from_json(self.files[path])
