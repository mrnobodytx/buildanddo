# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/history.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/identity.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/phase1/common.py, libs/semantic_twin/phase1/compat.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/phase1/common.py; CONSUMES libs/semantic_twin/phase1/compat.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.git-history
# Intent:      Compile bounded local Git evolution into commit and file-change semantics without remote access or repository mutation.
# ───────────────────────────────────────────────────────

"""Ingest a bounded read-only view of local Git history."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
import subprocess

from ..ingestion.graph import SemanticGraph
from ..ingestion.builder import ObjectDraft
from ..ingestion.inputs import SourceSnapshot
from ..identity import ValidTime
from ..vocabulary import EvidenceState, RelationPredicate
from .common import named_id, relation, stable_id
from .compat import make_object


_RECORD = "\x1e"
_FIELD = "\x1f"


class GitHistoryError(RuntimeError):
    """Report a failed local read-only Git history query."""


@dataclass(frozen=True, slots=True)
class FileChange:
    """Describe one path change introduced by a commit."""

    status: str
    path: str
    old_path: str | None = None


@dataclass(frozen=True, slots=True)
class CommitObservation:
    """Retain one locally observed commit and its bounded changed paths."""

    commit: str
    parents: tuple[str, ...]
    authored_at: str
    subject: str
    changes: tuple[FileChange, ...]
    observed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def _parse_change(line: str) -> FileChange | None:
    """Parse one `git --name-status` record."""

    parts = line.split("\t")
    if len(parts) < 2:
        return None
    status = parts[0]
    if status.startswith(("R", "C")) and len(parts) >= 3:
        return FileChange(status=status[0], path=parts[2], old_path=parts[1])
    return FileChange(status=status[0], path=parts[1])


def parse_git_log(value: str) -> tuple[CommitObservation, ...]:
    """Parse the stable record/field format emitted by `read_git_history`."""

    observations: list[CommitObservation] = []
    for raw_record in value.split(_RECORD):
        record = raw_record.strip("\n")
        if not record:
            continue
        lines = record.splitlines()
        header = lines[0].split(_FIELD)
        if len(header) != 4:
            raise GitHistoryError("unexpected local Git history record")
        changes = tuple(
            change for line in lines[1:] if (change := _parse_change(line)) is not None
        )
        observations.append(
            CommitObservation(
                commit=header[0],
                parents=tuple(parent for parent in header[1].split() if parent),
                authored_at=header[2],
                subject=header[3],
                changes=changes,
            )
        )
    return tuple(observations)


def read_git_history(
    repository_root: Path,
    *,
    max_count: int = 100,
    paths: tuple[str, ...] = (),
) -> tuple[CommitObservation, ...]:
    """Read bounded local history through fixed, non-mutating Git arguments."""

    if max_count < 1:
        raise ValueError("max_count must be positive")
    command = [
        "git",
        "-C",
        str(repository_root),
        "log",
        f"--max-count={max_count}",
        "--date=iso-strict",
        f"--format={_RECORD}%H{_FIELD}%P{_FIELD}%aI{_FIELD}%s",
        "--name-status",
        "--find-renames",
    ]
    if paths:
        command.extend(("--", *paths))
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise GitHistoryError(result.stderr.strip() or "local Git history query failed")
    return parse_git_log(result.stdout)


def _with_valid_time(
    item: ObjectDraft,
    valid_from: str,
    valid_until: str | None,
) -> ObjectDraft:
    """Bind an observed history object to its bounded commit-time interval."""

    start = datetime.fromisoformat(valid_from)
    end = datetime.fromisoformat(valid_until) if valid_until is not None else None
    if end is not None and end < start:
        end = None
    return replace(
        item,
        envelope=replace(
            item.envelope, valid_time=ValidTime(valid_from=start, valid_until=end)
        ),
    )


def history_graph(
    observations: tuple[CommitObservation, ...],
    *,
    anchor_id: str,
) -> SemanticGraph:
    """Convert commit and path evolution into one anchor-connected graph."""

    objects = []
    included = {item.commit for item in observations}
    for index, item in enumerate(observations):
        snapshot = SourceSnapshot.derived(
            f"git:{item.commit}",
            {
                "commit": item.commit,
                "parents": item.parents,
                "authored_at": item.authored_at,
                "subject": item.subject,
                "changes": [
                    (change.status, change.path, change.old_path)
                    for change in item.changes
                ],
            },
            observed_at=item.observed_at,
        )
        commit_id = named_id("git-commit", item.commit)
        valid_until = observations[index - 1].authored_at if index > 0 else None
        relations = [
            relation(
                RelationPredicate.REFINES if index == 0 else RelationPredicate.ABOUT,
                anchor_id,
                f"git:{item.commit}",
            )
        ]
        relations.extend(
            relation(
                RelationPredicate.PRECEDED_BY,
                named_id("git-commit", parent),
                f"git:{item.commit}",
            )
            for parent in item.parents
            if parent in included
        )
        objects.append(
            _with_valid_time(
                make_object(
                    commit_id,
                    "GitCommit",
                    f"git:{item.commit}",
                    snapshot=snapshot,
                    claims=(
                        {
                            "commit": item.commit,
                            "parents": list(item.parents),
                            "authored_at": item.authored_at,
                            "subject": item.subject,
                            "changed_paths": [change.path for change in item.changes],
                        },
                    ),
                    relations=tuple(relations),
                    evidence_state=EvidenceState.OBSERVED,
                    lifecycle_state="OBSERVED_LOCAL_HISTORY",
                    commit=item.commit,
                ),
                item.authored_at,
                valid_until,
            )
        )
        for change in item.changes:
            predicate = {
                "A": RelationPredicate.INTRODUCED_BY,
                "D": RelationPredicate.REMOVED_BY,
            }.get(change.status, RelationPredicate.CHANGED_BY)
            change_id = stable_id(
                "git-change",
                item.commit,
                change.status,
                change.old_path,
                change.path,
            )
            objects.append(
                _with_valid_time(
                    make_object(
                        change_id,
                        "GitFileChange",
                        snapshot.source_path,
                        snapshot=snapshot,
                        claims=(
                            {
                                "status": change.status,
                                "path": change.path,
                                "old_path": change.old_path,
                                "commit": item.commit,
                            },
                        ),
                        relations=(
                            relation(predicate, commit_id, f"git:{item.commit}"),
                        ),
                        evidence_state=EvidenceState.OBSERVED,
                        lifecycle_state="OBSERVED_LOCAL_HISTORY",
                        commit=item.commit,
                    ),
                    item.authored_at,
                    valid_until,
                )
            )
    return SemanticGraph(tuple(objects))
