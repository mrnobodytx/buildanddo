# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/publish/media_contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/evolution/common.py, scripts/ci/public_redaction.py, scripts/ci/verify_public_boundary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/evolution/common.py; CONSUMES scripts/ci/public_redaction.py; CONSUMES scripts/ci/verify_public_boundary.py
# Intent:      Bind media drafts to selected public observations and explicit production limits without granting provider or publication authority.
# ───────────────────────────────────────────────────────────────

"""Validate local media inputs using the existing semantic wire contracts."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath
from typing import Literal
from urllib.parse import urlsplit

from libs.evolution.common import digest, identity, unique
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId, SubjectRef
from scripts.ci.public_redaction import Rule
from scripts.ci.verify_public_boundary import SECRET_PATTERNS

PUBLIC_RULE = Rule(fleet_map="")  # Never discover or read a private fleet map.
FORMATS = (
    "article",
    "social",
    "daily_audio",
    "short_video",
    "mission_story",
    "guild_debrief",
    "build_report",
    "tutorial",
    "onboarding",
    "case_study",
)
Format = Literal[
    "article",
    "social",
    "daily_audio",
    "short_video",
    "mission_story",
    "guild_debrief",
    "build_report",
    "tutorial",
    "onboarding",
    "case_study",
]
Section = Literal["problem", "action", "outcome", "lesson", "limitation"]
Style = Literal["neutral", "curious", "energetic", "serious"]
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024


def public_text(value: str, name: str, limit: int) -> None:
    """Reject unsafe selected copy without silently rewriting a cited claim."""
    require(
        0 < len(value.strip()) <= limit and len(value) <= limit,
        f"invalid {name} length",
    )
    require(
        not any(ord(c) < 32 and c not in "\n\t" for c in value),
        f"invalid {name} control character",
    )
    require(
        not any(rx.search(value) for _, rx in SECRET_PATTERNS),
        f"{name} contains a credential pattern",
    )
    require(
        not any(PUBLIC_RULE.find_leaks(value).values()),
        f"{name} contains an address or machine name",
    )
    require(
        not re.search(
            r"(?:\b[A-Za-z]:\\|/(?:home|root|etc)/|\b(?:localhost|[\w-]+\.(?:internal|local))\b)",
            value,
        ),
        f"{name} contains a private locator",
    )


def token(value: str, name: str) -> None:
    """Require a bounded literal identifier suitable for a local index."""
    require(
        re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", value) is not None,
        f"invalid {name}",
    )


def sha256(value: str) -> None:
    """Require a full SHA-256 digest."""
    require(re.fullmatch(r"[a-f0-9]{64}", value) is not None, "invalid SHA-256")


def relative_path(value: str) -> None:
    """Allow only explicit relative public artifact paths beneath the selected root."""
    parts = value.split("/")
    require(
        0 < len(value) <= 240 and not PurePosixPath(value).is_absolute(),
        "invalid artifact path",
    )
    require(
        all(p not in ("", ".", "..") for p in parts), "invalid artifact path segment"
    )
    require(
        re.fullmatch(r"[A-Za-z0-9._/-]+", value) is not None,
        "invalid artifact path characters",
    )
    forbidden = {
        ".git",
        "_meta",
        "private",
        "golden",
        "infrastructure",
        "secrets",
        "credentials",
    }
    require(
        not any(p.lower() in forbidden or p.lower().startswith(".env") for p in parts),
        "private artifact path",
    )


def public_url(value: str) -> None:
    """Validate a supplied citation without fetching it or treating it as evidence."""
    public_text(value, "public URL", 800)
    try:
        url = urlsplit(value)
        port = url.port
    except ValueError as exc:
        raise ContractError("invalid public URL") from exc
    require(
        url.scheme == "https" and bool(url.hostname) and "." in str(url.hostname),
        "public URL must use HTTPS",
    )
    require(
        not url.username and not url.password and not url.query,
        "public URL cannot carry credentials or query data",
    )
    require(port in (None, 443) and not re.search(r"\s", value), "invalid public URL")


def language(value: str) -> None:
    """Accept an explicit language tag without claiming translation support."""
    require(
        re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}", value) is not None,
        "invalid language tag",
    )


@dataclass(frozen=True, slots=True)
class MediaArtifact(Contract):
    """Identify selected bytes; the filesystem adapter must also rehash them."""

    artifact_id: str
    path: str
    sha256: str
    size: int
    observed_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        token(self.artifact_id, "artifact ID")
        relative_path(self.path)
        sha256(self.sha256)
        require(0 < self.size <= MAX_FILE_BYTES, "invalid artifact size")


@dataclass(frozen=True, slots=True)
class MediaClaim(Contract):
    """Select an exact evidence excerpt for one part of the story."""

    claim_id: str
    section: Section
    text: str
    evidence_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        token(self.claim_id, "claim ID")
        public_text(self.text, "claim", 1200)
        require(
            "[" not in self.text and "]" not in self.text,
            "source copy cannot supply audio tags",
        )
        require(1 <= len(self.evidence_ids) <= 16, "claim needs bounded evidence")
        unique(self.evidence_ids, "claim evidence")


@dataclass(frozen=True, slots=True)
class MediaSource(Contract):
    """Retain the source, scope and limitations of one selected public story."""

    schema: Literal["buildanddo.media-source/v1"]
    event_id: str
    scope_id: str
    kind: Literal[
        "source_change", "release", "mission", "incident", "interview", "lesson"
    ]
    revision: str
    producer: SemanticId
    authors: tuple[SemanticId, ...]
    observed_at: datetime
    expires_at: datetime
    title: str
    audience: str
    language: str
    source_url: str
    disclosure_ref: str
    artifacts: tuple[MediaArtifact, ...]
    claims: tuple[MediaClaim, ...]
    visibility: Literal["public"] = "public"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        token(self.event_id, "event ID")
        token(self.scope_id, "scope ID")
        require(
            re.fullmatch(r"[a-f0-9]{40}", self.revision) is not None,
            "source needs a full Git revision",
        )
        require(self.observed_at < self.expires_at, "source freshness window is empty")
        public_text(self.title, "title", 140)
        public_text(self.audience, "audience", 300)
        language(self.language)
        public_url(self.source_url)
        token(self.disclosure_ref, "disclosure reference")
        require(
            1 <= len(self.artifacts) <= 32 and 1 <= len(self.claims) <= 64,
            "source exceeds collection bounds",
        )
        require(len(self.authors) <= 16, "too many source authors")
        unique(tuple(str(a) for a in self.authors), "source author")
        unique(tuple(a.artifact_id for a in self.artifacts), "artifact ID")
        unique(tuple(a.path for a in self.artifacts), "artifact path")
        unique(tuple(c.claim_id for c in self.claims), "claim ID")
        require(
            sum(a.size for a in self.artifacts) <= MAX_TOTAL_BYTES,
            "source evidence exceeds byte bound",
        )
        require(
            all(a.observed_at <= self.observed_at for a in self.artifacts),
            "source precedes its evidence",
        )
        ids = {a.artifact_id for a in self.artifacts}
        require(
            all(set(c.evidence_ids) <= ids for c in self.claims),
            "claim cites absent evidence",
        )
        require(
            ids == {i for c in self.claims for i in c.evidence_ids},
            "uncited source artifact",
        )
        require(
            {"problem", "action", "outcome", "limitation"}
            <= {c.section for c in self.claims},
            "story must preserve problem, action, outcome and limitations",
        )

    @property
    def subject(self) -> SubjectRef:
        """Address the complete story for existing independent review."""
        return SubjectRef(identity("document", self), digest(self))

    @property
    def required_sources(self) -> tuple[SemanticId, ...]:
        """Bind review to the story and every selected original artifact."""
        return (
            self.subject.semantic_id,
            *(identity("evidence", a) for a in self.artifacts),
        )


@dataclass(frozen=True, slots=True)
class CorpusOptions(Contract):
    """Bound the requested studio and API work without implying available credit."""

    schema: Literal["buildanddo.media-options/v1"] = "buildanddo.media-options/v1"
    formats: tuple[Format, ...] = (
        "article",
        "social",
        "daily_audio",
        "short_video",
        "mission_story",
        "guild_debrief",
    )
    languages: tuple[str, ...] = ("en",)
    styles: tuple[Style, ...] = ("neutral",)
    requested_model: str = "eleven_v4"
    chunk_characters: int = 3000
    character_budget: int = 50000
    max_assets: int = 200

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for values, name, limit in (
            (self.formats, "format", 10),
            (self.languages, "language", 12),
            (self.styles, "style", 4),
        ):
            require(1 <= len(values) <= limit, f"invalid {name} count")
            unique(values, name)
        for tag in self.languages:
            language(tag)
        token(self.requested_model, "requested model")
        require(
            256 <= self.chunk_characters <= 3500,
            "chunk bound must be 256..3500 characters",
        )
        require(
            1 <= self.character_budget <= 2_000_000,
            "invalid requested character budget",
        )
        require(1 <= self.max_assets <= 500, "invalid asset count bound")


@dataclass(frozen=True, slots=True)
class EngagementMetric(Contract):
    """Retain one reported counter and its actual measurement interval."""

    name: Literal[
        "impressions",
        "views",
        "completions",
        "clicks",
        "likes",
        "shares",
        "watch_seconds",
    ]
    value: float
    window_start: datetime
    window_end: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.value >= 0 and self.window_start < self.window_end,
            "invalid engagement observation",
        )
        require(
            self.name == "watch_seconds" or self.value.is_integer(),
            "engagement count must be an integer",
        )


@dataclass(frozen=True, slots=True)
class MediaObservation(Contract):
    """Record a supplied observation without impersonating a provider receipt."""

    schema: Literal["buildanddo.media-observation/v1"]
    observation_id: str
    asset_id: str
    request_digest: str
    attempt_id: str
    kind: Literal["generation", "publication", "engagement"]
    provider: Literal["elevencreative", "elevenlabs", "metricool", "manual", "posthog"]
    observed_at: datetime
    state: Literal["succeeded", "failed", "unknown"]
    evidence: MediaArtifact
    media: MediaArtifact | None = None
    media_sha256: str | None = None
    publication_id: str | None = None
    publication_url: str | None = None
    publication_provider: Literal["metricool", "manual", "posthog"] | None = None
    metrics: tuple[EngagementMetric, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value, name in (
            (self.observation_id, "observation ID"),
            (self.attempt_id, "attempt ID"),
        ):
            token(value, name)
        sha256(self.asset_id)
        sha256(self.request_digest)
        require(
            self.evidence.observed_at <= self.observed_at,
            "receipt evidence is from the future",
        )
        if self.media is not None:
            require(
                self.kind == "generation"
                and self.media.observed_at <= self.observed_at,
                "invalid generated artifact",
            )
        if self.media_sha256 is not None:
            sha256(self.media_sha256)
        if self.publication_id is not None:
            token(self.publication_id, "publication ID")
        if self.publication_url is not None:
            public_url(self.publication_url)
        require(len(self.metrics) <= 7, "too many engagement metrics")
        unique(tuple(m.name for m in self.metrics), "metric")
        require(
            all(m.window_end <= self.observed_at for m in self.metrics),
            "engagement window is in the future",
        )
        require(
            self.kind == "engagement" or not self.metrics,
            "metrics require an engagement observation",
        )
        require(
            self.kind == "engagement" or self.publication_provider is None,
            "publication mapping belongs to engagement only",
        )
        if self.state == "succeeded":
            if self.kind == "generation":
                require(
                    self.media is not None,
                    "generation success needs actual media bytes",
                )
            else:
                require(
                    bool(
                        self.publication_id
                        and self.publication_url
                        and self.media_sha256
                    ),
                    "published observations need publication and media bindings",
                )
            if self.kind == "engagement":
                require(
                    bool(self.metrics), "engagement success needs measured counters"
                )
