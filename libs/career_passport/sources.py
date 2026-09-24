# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/sources.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/models.py, libs/semantic_twin/phase1/history.py, libs/evolution/common.py, apps/pocketbase/pb_hooks/workspace-operator.js
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/career_passport/models.py; CONSUMES libs/semantic_twin/phase1/history.py; CONSUMES libs/evolution/common.py; CONSUMES apps/pocketbase/pb_hooks/workspace-operator.js
# Intent:      Generate bounded BuildAndDo work observations while preserving agent attribution and missing personal identity or review evidence.
# ───────────────────────────────────────────────────────────────

"""Adapt the existing development history and native workspace read models."""

from __future__ import annotations

import hashlib
import os
import subprocess
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from libs.evolution.common import decode_json, mapping, timestamp
from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.phase1.history import (
    CommitObservation,
    GitHistoryError,
    parse_git_log,
)

from .application import json_bytes
from .models import (
    MAX_ARTIFACT_BYTES,
    Artifact,
    Contribution,
    Participation,
    WorkBundle,
)

COLLECTOR = SemanticId("cni://module/buildanddo/career-capture")
BITS = SemanticId("cni://agent/bits-codegen")


def _git(root: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(
            ("git", "-C", str(root), *args),
            check=False,
            capture_output=True,
            timeout=30,
            env={**os.environ, "GIT_NO_LAZY_FETCH": "1"},
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ContractError("local repository capture unavailable") from error
    require(result.returncode == 0, "local repository capture failed")
    require(len(result.stdout) <= 24_000_000, "local source response exceeds bound")
    return result.stdout


def _artifact(
    locator: str,
    raw: bytes,
    revision: str,
    at: datetime,
    producer: SemanticId = COLLECTOR,
) -> Artifact:
    try:
        content = raw.decode("utf-8")
    except UnicodeError as error:
        raise ContractError("career source must be UTF-8 text") from error
    return Artifact(
        locator,
        revision,
        at,
        producer,
        content,
        ContentDigest(hashlib.sha256(raw).hexdigest()),
    )


def _history(
    root: Path, head: str, limit: int, *, changes: bool
) -> tuple[CommitObservation, ...]:
    # Reuse Phase 1's observation parser while enforcing a timeout and no lazy
    # fetch on every Git subprocess, including partial checkouts.
    args = [
        "log",
        f"--max-count={limit}",
        "--date=iso-strict",
        "--format=%x1e%H%x1f%P%x1f%aI%x1f%s",
    ]
    if changes:
        args.extend(("--name-status", "--find-renames"))
    args.append(head)
    if changes:
        args.extend(("--", "libs", "apps", "tools/buildanddo_release.py", ".bits/out"))
    return parse_git_log(_git(root, *args).decode("utf-8"))


def capture_repository(
    root: Path, *, workspace: str, at: datetime, history_limit: int = 30
) -> WorkBundle:
    """Capture committed public work without converting repository control into skill."""
    require(
        type(history_limit) is int and 1 <= history_limit <= 100,
        "invalid development history bound",
    )
    head = _git(root, "rev-parse", "HEAD").decode().strip()
    SourceRevision(head)
    recorded = timestamp(_git(root, "log", "-1", "--format=%cI", head).decode().strip())
    require(recorded <= at, "repository commit is future relative to capture")
    history_scope = "selected_work_paths"
    history_gaps = []
    try:
        history = _history(root, head, history_limit, changes=True)
    except (GitHistoryError, ContractError):
        history_scope = "repository_commit_metadata"
        try:
            history = _history(root, head, history_limit, changes=False)
        except (GitHistoryError, ContractError) as error:
            raise ContractError("development history unavailable") from error
        history_gaps.append(
            "Per-file commit diffs are unavailable in this checkout; only repository commit metadata was retained. No missing objects were fetched."
        )
    # Reuse Phase 1's observations. Its commits deliberately contain no claimed
    # human authorship; an email, account or git committer is not participation.
    history_raw = json_bytes(
        {
            "source_head": head,
            "history_limit": history_limit,
            "history_scope": history_scope,
            "observations": [asdict(row) for row in history],
            "authorship_is_personal_evidence": False,
        }
    )
    artifacts = [
        _artifact("git:" + head + ":development-history", history_raw, head, recorded)
    ]
    listing = (
        _git(root, "ls-tree", "-r", "--name-only", head, "--", ".bits/out")
        .decode()
        .splitlines()
    )
    paths = sorted(path for path in listing if path.endswith("report.md"))[-20:]
    gaps = [
        "Commit metadata and repository ownership do not establish personal participation.",
        "Repository reports are attributed observations, not independent career verification.",
        f"Capture is bounded to {history_limit} commits and at most 20 public reports; private Citadel history is not attached.",
        *history_gaps,
    ]
    contributions = []
    for path in paths:
        raw = _git(root, "show", head + ":" + path)
        if len(raw) > MAX_ARTIFACT_BYTES:
            gaps.append(path + ": source exceeds capture bound")
            continue
        artifact = _artifact("git:" + head + ":" + path, raw, head, recorded)
        artifacts.append(artifact)
        if "# Seat:        BITS-CODEGEN" in artifact.content[:1600]:
            # This is still an UNREVIEWED agent-attributed report, never a human
            # accomplishment. The source statement remains available to review.
            contributions.append(
                Contribution(
                    BITS,
                    COLLECTOR,
                    workspace,
                    "BuildAndDo",
                    Participation.AGENT_EXECUTED,
                    True,
                    "source work reported in " + path,
                    ("software_delivery",),
                    ("source_report",),
                    recorded,
                    (artifact.source,),
                )
            )
    memories = sorted(path for path in listing if path.endswith("/memory.json"))
    if memories:
        # Preserve the bounded event slice plus its complete original-file hash.
        path = ".bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json"
        if path not in memories:
            path = memories[-1]
        raw = _git(root, "show", head + ":" + path)
        payload = mapping(decode_json(raw))
        vectors = payload.get("vectors", [])
        require(isinstance(vectors, list), "invalid memory event source")
        assert isinstance(vectors, list)
        events = [
            row for row in vectors if isinstance(row, dict) and row.get("type") == "C"
        ]
        selected = json_bytes(
            {
                "source_file_sha256": hashlib.sha256(raw).hexdigest(),
                "source_path": path,
                "total_events": len(events),
                "events": events[-100:],
                "slice_is_complete": len(events) <= 100,
            }
        )
        artifacts.append(
            _artifact("git:" + head + ":" + path + "#type-C", selected, head, recorded)
        )
        if len(events) > 100:
            gaps.append(
                "Development memory includes only the last 100 events; earlier history remains at its source."
            )
    else:
        gaps.append("Development memory is unavailable in this repository capture.")
    require(
        _git(root, "rev-parse", "HEAD").decode().strip() == head,
        "repository changed during capture",
    )
    return WorkBundle(
        workspace, at, tuple(artifacts), tuple(contributions), gaps=tuple(gaps)
    )


def capture_workspace(
    raw: bytes, *, workspace: str, account_id: str, at: datetime
) -> WorkBundle:
    """Project a native operator export into candidates requiring pinned career review.

    Captured JSON does not authenticate itself. The native owner remains the
    authority for access and mission review. A receiving verifier must check
    identity, exact evidence and participation before these become career facts.
    """
    require(0 < len(raw) <= MAX_ARTIFACT_BYTES, "workspace export exceeds bound")
    payload = mapping(decode_json(raw))
    require(
        set(payload) == {"schema_version", "person", "workspace", "snapshot"},
        "invalid workspace export fields",
    )
    person = SemanticId("cni://person/pocketbase/" + account_id)
    require(
        payload.get("schema_version") == "buildanddo.career-workspace/v1"
        and payload.get("workspace") == workspace
        and payload.get("person") == person,
        "workspace identity mismatch",
    )
    snapshot = mapping(payload["snapshot"])
    require(
        snapshot.get("schema_version") == "buildanddo.operator-snapshot/v1"
        and snapshot.get("workspace") == workspace,
        "operator scope mismatch",
    )
    observed = timestamp(snapshot.get("observed_at"))
    require(
        0 <= (at - observed).total_seconds() <= 900,
        "workspace snapshot is stale or future",
    )
    artifact = _artifact(
        "pocketbase:" + workspace + ":operator",
        raw,
        "sha256:" + hashlib.sha256(raw).hexdigest(),
        observed,
    )
    sources = mapping(snapshot.get("sources"))
    missions = mapping(sources.get("missions"))
    require(
        missions.get("state") in ("available", "unavailable"),
        "invalid mission source state",
    )
    rows = missions.get("items")
    require(
        isinstance(rows, list) and len(rows) <= 20,
        "workspace mission page exceeds bound",
    )
    assert isinstance(rows, list)
    require(
        missions.get("state") != "unavailable" or not rows,
        "unavailable source has records",
    )
    contributions = []
    for value in rows:
        row = mapping(value)
        require(row.get("workspace") == workspace, "mission crossed workspace")
        outcome = mapping(row.get("value", {}))
        if (
            row.get("status") == "verified"
            and outcome.get("state") == "VERIFIED"
            and outcome.get("independent") is True
            and outcome.get("reviewer") == account_id
        ):
            reviewed = timestamp(outcome.get("reviewed_at"))
            require(reviewed <= observed, "mission review is future")
            contributions.append(
                Contribution(
                    person,
                    COLLECTOR,
                    workspace,
                    "BuildAndDo",
                    Participation.VERIFIED,
                    None,
                    "the recorded mission " + str(row.get("title") or row.get("id")),
                    ("testing",),
                    ("mission_review",),
                    reviewed,
                    (artifact.source,),
                )
            )
    gaps = [
        "Native mission verification is retained as source evidence; personal participation and capability still need authenticated career review.",
        "Mission ownership, evidence authorship and seat completion do not prove personal implementation.",
        "Agent assistance is not established by this summary; review the underlying work before approving a personal claim.",
    ]
    if missions.get("state") != "available" or missions.get("has_more") is not False:
        gaps.append(
            "Mission history is unavailable or truncated; this is not a complete career history."
        )
    return WorkBundle(
        workspace, at, (artifact,), tuple(contributions), gaps=tuple(gaps)
    )
