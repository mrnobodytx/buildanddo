# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/store.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/event.py, libs/evolution/promotion.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/event.py; CONSUMES libs/evolution/promotion.py
# Intent:      Retain scoped local evidence and irreversible audit history while rejecting concurrent or rewritten registry updates.
# ───────────────────────────────────────────────────────────────

"""Keep a scoped, append-only local journal with checked registry head updates."""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Mapping
from pathlib import Path
from types import TracebackType

from libs.semantic_twin.contracts import Contract, ContractError, require, text

from .common import digest, mapping
from .event import CitadelEvent
from .promotion import CapabilityRecord, CompetenceState


class Journal:
    """Persist only explicit local captures and artifacts; never contact a remote store."""

    def __init__(self, path: Path, *, scope_id: str) -> None:
        """Open one scope in a private local file without following a database symlink."""
        text(scope_id, "journal scope")
        require(not path.is_symlink(), "journal must not be a symlink")
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            os.close(descriptor)
        self.scope_id = scope_id
        self.connection = sqlite3.connect(path, timeout=10)
        version = self.connection.execute("pragma user_version").fetchone()[0]
        if version not in (0, 1):
            self.connection.close()
            raise ContractError("unsupported evolution journal version")
        self.connection.executescript("""
            create table if not exists artifacts (
                sequence integer primary key autoincrement,
                scope text not null,
                kind text not null,
                artifact_id text not null,
                payload text not null,
                sha256 text not null,
                unique (scope, kind, artifact_id)
            );
            create table if not exists registry_heads (
                scope text not null,
                candidate_id text not null,
                revision text not null,
                primary key (scope, candidate_id)
            );
            create table if not exists registry_updates (
                sequence integer primary key autoincrement,
                scope text not null,
                candidate_id text not null,
                previous_revision text,
                revision text not null
            );
            pragma user_version = 1;
        """)

    def __enter__(self) -> Journal:
        """Use the journal with deterministic connection cleanup."""
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """Close the local handle without suppressing a failed operation."""
        self.connection.close()

    def _insert(
        self, kind: str, artifact_id: str, payload: Mapping[str, object]
    ) -> bool:
        serialized = json.dumps(
            payload, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
        fingerprint = digest(payload)
        old = self.connection.execute(
            "select payload, sha256 from artifacts where scope=? and kind=? and artifact_id=?",
            (self.scope_id, kind, artifact_id),
        ).fetchone()
        if old is not None:
            require(
                digest(json.loads(old[0])) == old[1], "journal artifact digest mismatch"
            )
            require(old[1] == fingerprint, "append-only artifact identity conflict")
            return False
        self.connection.execute(
            "insert into artifacts (scope, kind, artifact_id, payload, sha256) values (?, ?, ?, ?, ?)",
            (self.scope_id, kind, artifact_id, serialized, fingerprint),
        )
        return True

    def put_events(self, events: tuple[CitadelEvent, ...]) -> int:
        """Atomically ingest a batch, preserving the first capture on an identical retry."""
        require(
            all(event.scope_id == self.scope_id for event in events),
            "event scope mismatch",
        )
        inserted = 0
        with self.connection:
            for event in events:
                old = self.get("event", event.event_id)
                if old is not None:
                    previous = CitadelEvent.from_dict(old)
                    require(
                        previous.stable_payload == event.stable_payload,
                        "event retry conflict",
                    )
                    continue
                inserted += self._insert("event", event.event_id, event.to_dict())
        return inserted

    def events(self) -> tuple[CitadelEvent, ...]:
        """Read this scope's events and revalidate their content identities."""
        events = tuple(
            CitadelEvent.from_dict(value) for value in self.artifacts("event")
        )
        require(
            all(event.scope_id == self.scope_id for event in events),
            "stored event scope mismatch",
        )
        return events

    def save(self, kind: str, artifact: Contract) -> str:
        """Retain a content-addressed derived artifact in this journal's scope."""
        require(
            kind
            in (
                "episode",
                "candidate",
                "evaluation",
                "benchmark",
                "selection",
                "epoch",
            ),
            "unsupported derived artifact kind",
        )
        payload = artifact.to_dict()
        # Every allowed artifact either carries a scope or derives it from these fields.
        scoped: Mapping[str, object] = payload
        if kind == "episode":
            values = payload.get("events")
            require(isinstance(values, list) and bool(values), "empty episode artifact")
            assert isinstance(values, list)
            scoped = mapping(values[0])
        elif kind == "evaluation":
            scoped = mapping(payload.get("candidate"))
        elif kind == "selection":
            scoped = mapping(payload.get("event"))
        require(
            scoped.get("scope_id") == self.scope_id, "derived artifact scope mismatch"
        )
        artifact_id = digest(artifact)
        with self.connection:
            self._insert(kind, artifact_id, payload)
        return artifact_id

    def get(self, kind: str, artifact_id: str) -> dict[str, object] | None:
        """Read one scoped artifact and fail closed on byte tampering."""
        row = self.connection.execute(
            "select payload, sha256 from artifacts where scope=? and kind=? and artifact_id=?",
            (self.scope_id, kind, artifact_id),
        ).fetchone()
        if row is None:
            return None
        payload = mapping(json.loads(row[0]))
        require(digest(payload) == row[1], "journal artifact digest mismatch")
        return payload

    def artifacts(self, kind: str) -> tuple[dict[str, object], ...]:
        """Read retained artifacts in insertion order for chronological reporting."""
        rows = self.connection.execute(
            "select artifact_id from artifacts where scope=? and kind=? order by sequence",
            (self.scope_id, kind),
        ).fetchall()
        result = []
        for row in rows:
            value = self.get(kind, row[0])
            assert value is not None
            result.append(value)
        return tuple(result)

    def registry(self, candidate_id: str) -> CapabilityRecord | None:
        """Read and revalidate one current record under its full competence history."""
        row = self.connection.execute(
            "select revision from registry_heads where scope=? and candidate_id=?",
            (self.scope_id, candidate_id),
        ).fetchone()
        if row is None:
            return None
        payload = self.get("registry", row[0])
        require(payload is not None, "registry head references a missing revision")
        assert payload is not None
        record = CapabilityRecord.from_dict(payload)
        require(
            record.revision == row[0]
            and record.candidate.scope_id == self.scope_id
            and record.candidate.candidate_id == candidate_id,
            "registry head mismatch",
        )
        return record

    def records(self) -> tuple[CapabilityRecord, ...]:
        """Read all current capability versions in this scope."""
        rows = self.connection.execute(
            "select candidate_id from registry_heads where scope=? order by candidate_id",
            (self.scope_id,),
        ).fetchall()
        result = []
        for row in rows:
            record = self.registry(row[0])
            assert record is not None
            result.append(record)
        return tuple(result)

    def save_registry(
        self, record: CapabilityRecord, *, expected_revision: str | None
    ) -> None:
        """Serialize head changes and reject stale, rewritten or policy-changing updates."""
        require(record.candidate.scope_id == self.scope_id, "registry scope mismatch")
        self.connection.execute("begin immediate")
        try:
            current = self.registry(record.candidate.candidate_id)
            if current is not None and current == record:
                self.connection.rollback()
                return
            require(
                (current.revision if current else None) == expected_revision,
                "registry changed since it was read",
            )
            if current is None:
                require(
                    record.state is CompetenceState.HYPOTHESIS
                    and len(record.history) == 2,
                    "new registry entries must begin at hypothesis",
                )
            elif current.candidate == record.candidate:
                require(
                    current.policy == record.policy,
                    "learning cannot weaken promotion policy",
                )
                require(
                    record.history[:-1] == current.history,
                    "registry history must append one step",
                )
                require(
                    all(item in record.evaluations for item in current.evaluations)
                    and all(item in record.proofs for item in current.proofs),
                    "registry update deletes retained evidence",
                )
            else:
                require(
                    current.candidate.authority is record.candidate.authority,
                    "candidate revision cannot expand authority",
                )
                require(
                    current.policy == record.policy,
                    "candidate revision cannot weaken policy",
                )
                require(
                    record.state is CompetenceState.HYPOTHESIS
                    and len(record.history) == 2
                    and record.candidate.discovered_at
                    > current.candidate.discovered_at,
                    "new candidate revision must restart from a later hypothesis",
                )
            self._insert("registry", record.revision, record.to_dict())
            self.connection.execute(
                "insert into registry_updates (scope, candidate_id, previous_revision, revision) "
                "values (?, ?, ?, ?)",
                (
                    self.scope_id,
                    record.candidate.candidate_id,
                    expected_revision,
                    record.revision,
                ),
            )
            self.connection.execute(
                "insert into registry_heads (scope, candidate_id, revision) values (?, ?, ?) "
                "on conflict(scope, candidate_id) do update set revision=excluded.revision",
                (self.scope_id, record.candidate.candidate_id, record.revision),
            )
            self.connection.commit()
        except BaseException:
            self.connection.rollback()
            raise
