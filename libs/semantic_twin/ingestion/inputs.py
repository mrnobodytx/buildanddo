# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/ingestion/inputs.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/models.py, libs/semantic_twin/receipts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/receipts.py
# DAG Node:    semantic-twin.phase-0.integration.inputs
# Intent:      Bind local extraction to the exact captured bytes and observation time without inventing source revisions or verification.
# ───────────────────────────────────────────────────────────────

"""Capture versioned local input independently of the facts it may describe."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..contracts import require
from ..identity import SemanticId, SubjectRef
from ..models import Source
from ..receipts import EvidenceKind, EvidenceReference


@dataclass(frozen=True, slots=True)
class SourceSnapshot:
    """Retain the exact input bytes, source location and actual capture time.

    The digest versions the captured bytes, including uncommitted files. A Git
    revision supplied by a caller is context, never a substitute for this digest.
    Observation time is an input to deterministic replay, not a file's mtime.
    """

    source_path: str
    content: bytes
    observed_at: datetime

    def __post_init__(self) -> None:
        require(
            isinstance(self.source_path, str) and bool(self.source_path.strip()),
            "snapshot requires source path",
        )
        require(type(self.content) is bytes, "snapshot requires immutable bytes")
        require(isinstance(self.observed_at, datetime), "snapshot requires datetime")
        require(
            self.observed_at.tzinfo is not None
            and self.observed_at.utcoffset() is not None,
            "snapshot requires an aware capture timestamp",
        )
        object.__setattr__(
            self, "observed_at", self.observed_at.astimezone(timezone.utc)
        )

    @classmethod
    def capture(cls, path: Path, *, source_path: str | None = None) -> SourceSnapshot:
        """Read one local input once and record when its bytes were captured."""
        content = path.read_bytes()
        return cls(source_path or path.as_posix(), content, datetime.now(timezone.utc))

    @classmethod
    def derived(
        cls, source_path: str, value: object, *, observed_at: datetime
    ) -> SourceSnapshot:
        """Version a derived record using the capture time of its input evidence."""
        raw = json.dumps(
            value,
            sort_keys=True,
            ensure_ascii=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        return cls(source_path, raw, observed_at)

    @property
    def version(self) -> str:
        """Return the content revision rather than a contract schema version."""
        return "sha256:" + hashlib.sha256(self.content).hexdigest()

    @property
    def source(self) -> Source:
        """Describe captured content without claiming it matches a supplied commit."""
        return Source(
            system="buildanddo-local-ingestion",
            uri_or_path=self.source_path,
            document_version=self.version,
        )

    def reference(self, selector: str = "content") -> SemanticId:
        """Identify an exact captured document and section, retaining URI safety."""
        document = hashlib.sha256(self.source_path.encode("utf-8")).hexdigest()
        suffix = selector.removeprefix(self.source_path + ":")
        if selector in ("content", self.source_path):
            section = "content"
        elif suffix.isdecimal():
            section = f"line-{suffix}"
        elif re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", selector):
            section = selector
        else:
            section = "selector-" + hashlib.sha256(selector.encode("utf-8")).hexdigest()
        return SemanticId(f"doc://{document}/{self.version}/{section}")

    def evidence(
        self, subject: SubjectRef, kind: EvidenceKind, selector: str = "content"
    ) -> EvidenceReference:
        """Bind a source observation to precisely one object and content revision."""
        source = self.reference(selector)
        key = json.dumps(
            [
                str(subject.semantic_id),
                subject.version,
                str(source),
                kind.value,
                self.observed_at.isoformat(),
            ],
            separators=(",", ":"),
        )
        identity = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return EvidenceReference(
            evidence_id=SemanticId(f"cni://evidence/buildanddo/{identity}"),
            subject=subject,
            kind=kind,
            source=source,
            observed_at=self.observed_at,
        )
