# --- CGRF Header --------------------------------------------------
# File:        apps/world_twin/capture.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, libs/evolution/common.py, libs/evolution/event.py, apps/pocketbase/pb_hooks/workspace-replay.js
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-replay.js; CONSUMES libs/evolution/common.py; CONSUMES libs/evolution/event.py; PRODUCES apps/world_twin/events.py
# Intent:      Bind complete native snapshots to private world observations without inventing identity, telemetry or verification.
# ------------------------------------------------------------------

"""Import local mission captures without fetching sources or authenticating claims."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from libs.evolution.common import decode_json, mapping, timestamp
from libs.evolution.event import CitadelEvent, Phase, SourceKind
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.receipts import ActorType
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

from .events import Outcome, TraceReference, WorldEvent

_GROUPS = ("mission", "runs", "jobs", "evidence", "tasks")
_FIELDS = {
    "mission": "id workspace owner title description status created updated mission_approved_by mission_approved_at mission_reviewed_by mission_reviewed_at mission_plan mission_review",
    "runs": "id workspace owner workflow mission request_key start_request snapshot events revision next_step status started_at finished_at created updated",
    "jobs": "id workspace owner mission run step_id provider binding effect_key status worker lease_until failure approval_at result_sha256 evidence input result revision attempt integration_revision run_revision protocol_version release_context started_at finished_at created updated",
    "evidence": "id workspace mission owner type category title source content url created updated",
    "tasks": "id workspace owner mission execution evidence objective contact title description status due_date created updated",
}
_NUMBERS = frozenset("revision next_step attempt integration_revision run_revision protocol_version".split())
_JSON = frozenset("mission_plan mission_review start_request snapshot events input result release_context".split())
_STATUSES = {
    "mission": {"proposed", "approved", "running", "needs_attention", "verified", "failed"},
    "runs": {"running", "awaiting_approval", "completed", "failed", "cancelled"},
    "jobs": {"queued", "claimed", "dispatched", "hold", "succeeded", "failed", "cancelled"},
    "tasks": {"todo", "in_progress", "done"},
}
_COLLECTIONS = {"mission": "missions", "runs": "workflow_runs", "jobs": "business_jobs", "evidence": "evidence", "tasks": "erp_tasks"}
_NAMESPACES = {"mission": "mission", "runs": "workflow", "jobs": "resource", "evidence": "evidence", "tasks": "resource"}
_LIMIT = 2_000_000


@dataclass(frozen=True, slots=True)
class ActorBinding(Contract):
    """Supply a receiving-authenticated identity, never a capture's self-mapping."""

    semantic_id: SemanticId
    kind: ActorType


@dataclass(frozen=True, slots=True)
class MissionImport(Contract):
    """Retain snapshot observations and capture provenance separately from identity."""

    events: tuple[WorldEvent, ...]
    captured_at: datetime
    content_sha256: str
    gaps: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        ContentDigest(self.content_sha256)


def _exact(value: object, fields: str) -> dict[str, object]:
    result = mapping(value)
    require(set(result) == set(fields.split()), "missing or unknown native capture fields")
    return result


def _id(value: object, *, optional: bool = False) -> str:
    require(type(value) is str, "native identity must be text")
    assert isinstance(value, str)
    require(bool(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value)) or optional and value == "", "invalid native identity")
    return value


def _number(value: object, minimum: int = 0) -> int:
    require(type(value) is int and minimum <= value <= 2**53 - 1, "native counter must be a safe integer")
    assert isinstance(value, int)
    return value


def _same_json(left: object, right: object, depth: int = 0) -> bool:
    # Python's ordinary equality conflates true/1. Numeric spelling is otherwise
    # deliberately left to the original producer, not re-created in Python.
    require(depth <= 32, "native capture exceeds nesting limit")
    if isinstance(left, Mapping) and isinstance(right, Mapping):
        return left.keys() == right.keys() and all(type(key) is str and _same_json(left[key], right[key], depth + 1) for key in left)
    if type(left) is list and type(right) is list:
        return len(left) == len(right) and all(_same_json(a, b, depth + 1) for a, b in zip(left, right))
    if type(left) in (int, float) and type(right) in (int, float):
        assert isinstance(left, (int, float)) and isinstance(right, (int, float))
        try:
            return math.isfinite(left) and math.isfinite(right) and left == right
        except OverflowError:
            return False
    return type(left) is type(right) and type(left) in (str, bool, type(None)) and left == right


def _canonical(value: object, source: object, digest: object) -> str:
    require(type(source) is str and 0 < len(source) <= _LIMIT, "exact canonical source string is required and bounded")
    assert isinstance(source, str)
    try:
        encoded = source.encode("utf-8")
        require(len(source.encode("utf-16-le")) // 2 <= _LIMIT, "canonical source exceeds native size limit")
        parsed = decode_json(encoded)
    except (UnicodeError, RecursionError, ValueError) as exc:
        raise ContractError("invalid canonical source JSON") from exc
    require(type(digest) is str, "source digest must be text")
    assert isinstance(digest, str)
    ContentDigest(digest)
    require(hashlib.sha256(encoded).hexdigest() == digest, "canonical source digest mismatch")
    require(_same_json(parsed, value), "canonical source differs from captured content")
    return source


def _member(source: str, path: tuple[str, ...]) -> str:
    """Select exact nested JSON bytes only after the complete source was checked."""
    if not path:
        return source
    decoder = json.JSONDecoder()
    position = source.index("{") + 1
    while position < len(source):
        while source[position] in " \t\r\n,":
            position += 1
        if source[position] == "}":
            break
        key, end = decoder.raw_decode(source, position)
        position = end
        while source[position] in " \t\r\n:":
            position += 1
        _, end = decoder.raw_decode(source, position)
        if key == path[0]:
            return _member(source[position:end], path[1:])
        position = end
    raise ContractError("missing canonical source member")


def import_mission_capture(
    raw: object,
    *,
    tenant_id: str,
    mission_id: str,
    actors: Mapping[str, ActorBinding],
    ingested_at: datetime,
) -> MissionImport:
    """Validate a complete native export and emit one private observation per row.

    The receiver must authorize the workspace and supply its actor bindings.
    Digests establish byte consistency, not capture permission or authenticity.
    Canonical strings are mandatory here; older browser exports need recapture.
    Raw payloads remain in the caller's local export, never in derived events.
    Snapshots do not reconstruct missing attempts, vendor spans or review trust.
    """
    _id(tenant_id)
    _id(mission_id)
    require(isinstance(ingested_at, datetime) and ingested_at.tzinfo is not None and ingested_at.utcoffset() is not None,
            "ingestion requires an aware timestamp")
    capture = _exact(raw, "schema_version workspace captured_by captured_at capture_complete evidence_state independent_verification integrity integrity_issues content content_sha256 content_canonical leaves")
    require(capture["schema_version"] == "buildanddo.mission-replay/v1" and capture["workspace"] == tenant_id, "unsupported or foreign mission capture")
    require(capture["capture_complete"] is True and capture["evidence_state"] == "recorded" and capture["independent_verification"] == "not_conferred_by_export",
            "capture must be complete recorded observations without conferred verification")
    captured_at = timestamp(capture["captured_at"])
    require(captured_at <= ingested_at, "capture timestamp is in the future")
    issues = capture["integrity_issues"]
    require(type(issues) is list and len(issues) <= 2000, "invalid native integrity issues")
    assert isinstance(issues, list)
    require(all(type(issue) is str and 0 < len(issue) <= 512 for issue in issues), "invalid native integrity issue")
    require(capture["integrity"] in ("consistent", "HOLD") and bool(issues) == (capture["integrity"] == "HOLD"), "inconsistent native integrity metadata")
    held = capture["integrity"] == "HOLD"
    gaps = {"Capture digests do not authenticate the source or confer independent verification.",
            "Native row snapshots do not provide vendor traces or complete attempt history."}
    if held:
        gaps.add("Native capture integrity is HOLD; inspect the retained source issues.")
    require(isinstance(actors, Mapping), "receiving actor bindings are required")
    bindings: dict[str, ActorBinding] = {}
    for native, binding in actors.items():
        require(type(binding) is ActorBinding, "receiving actors require typed ActorBinding values")
        bindings[_id(native)] = binding

    def actor(value: object) -> ActorBinding:
        native = _id(value)
        require(native in bindings, "native actor has no receiving identity binding")
        return bindings[native]

    def gap(condition: bool, name: str) -> None:
        if condition:
            require(held, "capture conceals a native integrity gap")
            gaps.add(name)

    actor(capture["captured_by"])
    content = _exact(capture["content"], "mission runs jobs evidence tasks")
    whole = _canonical(content, capture["content_canonical"], capture["content_sha256"])
    groups: dict[str, list[dict[str, object]]] = {"mission": [mapping(content["mission"])]}
    for kind in _GROUPS[1:]:
        values = content[kind]
        require(type(values) is list and len(values) <= 200, "invalid or excessive native record group")
        assert isinstance(values, list)
        groups[kind] = [mapping(value) for value in values]
    inventory: dict[tuple[str, str], dict[str, object]] = {}
    for kind, rows in groups.items():
        for value in rows:
            key = (kind, _id(value.get("id")))
            require(key not in inventory, "duplicate native row identity")
            require(value.get("workspace") == tenant_id and (value.get("id") if kind == "mission" else value.get("mission")) == mission_id,
                    "foreign native row scope")
            inventory[key] = value
    leaf_values = capture["leaves"]
    require(type(leaf_values) is list and len(leaf_values) == len(inventory), "incomplete native leaf inventory")
    assert isinstance(leaf_values, list)
    sources: dict[tuple[str, str], tuple[str, str]] = {}
    leaf_size = 0
    for raw_leaf in leaf_values:
        leaf = _exact(raw_leaf, "kind id sha256 canonical")
        require(type(leaf["kind"]) is str and leaf["kind"] in _GROUPS, "unknown native leaf group")
        key = (str(leaf["kind"]), _id(leaf["id"]))
        require(key in inventory and key not in sources, "foreign or duplicate native leaf")
        canonical = leaf["canonical"]
        require(type(canonical) is str, "exact leaf source string is required")
        assert isinstance(canonical, str)
        leaf_size += len(canonical)
        require(leaf_size <= len(whole), "leaf source strings exceed whole capture size")
        source = _canonical(inventory[key], canonical, leaf["sha256"])
        sources[key] = (source, str(leaf["sha256"]))
    # Assemble the aggregate from the exact leaf strings. This detects different
    # leaf/aggregate bytes without inventing JavaScript numeric serialization.
    parts = []
    for kind in sorted(_GROUPS):
        strings = [sources[(kind, _id(value["id"]))][0] for value in groups[kind]]
        parts.append('"' + kind + '":' + (strings[0] if kind == "mission" else "[" + ",".join(strings) + "]"))
    require(whole == "{" + ",".join(parts) + "}", "whole content and leaf source bytes disagree")

    events = []
    for (kind, native_id), value in inventory.items():
        row = _exact(value, _FIELDS[kind])
        for name, field in row.items():
            if name in _NUMBERS:
                _number(field, 1 if name in ("revision", "protocol_version") else 0)
            elif name in _JSON:
                require(field is None or isinstance(field, Mapping) or name == "events" and type(field) is list, "invalid native structured field")
            else:
                require(type(field) is str, "native text field has the wrong type")
        created, updated = timestamp(row["created"]), timestamp(row["updated"])
        require(created <= updated <= captured_at, "native source timestamps are reversed or in the future")
        for name in ("mission_approved_at", "mission_reviewed_at", "started_at", "finished_at", "approval_at"):
            if row.get(name):
                require(timestamp(row[name]) <= updated, "native observation timestamp is in the future")
        owner = actor(row["owner"])
        selected, role, phase = owner, "owner", Phase.CONTEXT
        outcome: Outcome = "NONE"
        release_sha = None
        data: dict[str, object] = {"record_kind": kind, "record_id": native_id, "owner_id": str(owner.semantic_id),
                                  "source_created_at": created.isoformat(), "source_updated_at": updated.isoformat()}
        status = row.get("status", row.get("type"))
        require(type(status) is str and status in (_STATUSES[kind] if kind in _STATUSES else {"observed", "decided", "attempted", "verified"}), "unknown native status")
        data["recorded_status"] = status
        for name in _NUMBERS & row.keys():
            data[name] = row[name]
        for name in ("workflow", "run", "step_id", "evidence", "execution", "objective", "contact"):
            if name in row:
                _id(row[name], optional=True)
        for name, target in (("run", "runs"), ("execution", "jobs"), ("evidence", "evidence")):
            if row.get(name):
                gap((target, str(row[name])) not in inventory, f"Missing {target} link for {kind}/{native_id}.")
        if kind == "mission":
            plan = mapping(row["mission_plan"]) if row["mission_plan"] is not None else {}
            if "independent_review" in plan:
                require(type(plan["independent_review"]) is bool, "native review preference must be boolean")
            for name in ("mission_approved_by", "mission_reviewed_by"):
                native = _id(row[name], optional=True)
                require(bool(native) == bool(row[name.replace("_by", "_at")]), "native actor/time pair is incomplete")
                if native:
                    data[name] = str(actor(native).semantic_id)
            review = mapping(row["mission_review"]) if row["mission_review"] is not None else {}
            snapshots = review.get("evidence_snapshot", [])
            require(type(snapshots) is list and len(snapshots) <= 200, "invalid retained evidence snapshots")
            assert isinstance(snapshots, list)
            gap(status == "verified" and not snapshots, "Recorded mission verification has no retained evidence snapshot.")
            for snapshot_value in snapshots:
                snapshot = mapping(snapshot_value)
                require(snapshot.keys() <= set(_FIELDS["evidence"].split()) and snapshot.get("workspace") == tenant_id and snapshot.get("mission") == mission_id,
                        "foreign or unknown review snapshot fields")
                require(all(type(item) is str for item in snapshot.values()), "retained evidence snapshot fields must be text")
                for name in ("created", "updated"):
                    if name in snapshot:
                        require(timestamp(snapshot[name]) <= updated, "retained evidence snapshot timestamp is in the future")
                current = inventory.get(("evidence", _id(snapshot.get("id"))))
                gap(current is None or any(not _same_json(item, current.get(name)) for name, item in snapshot.items()), "Reviewed evidence differs from the current native snapshot.")
        elif kind == "runs":
            role = "requester"
            start = _exact(row["start_request"], "workspace workflow mission request_key")
            require(all(start[name] == row[name] for name in start), "run start request disagrees with its row")
            snapshot = _exact(row["snapshot"], "version name description steps workflow_updated mission_id mission_title mission_approved_at")
            require(_number(snapshot["version"]) == 1 and snapshot["mission_id"] == mission_id, "foreign or unsupported workflow snapshot")
            require(all(type(snapshot[name]) is str for name in ("name", "description", "mission_title")), "invalid workflow snapshot text")
            steps = snapshot["steps"]
            require(type(steps) is list and len(steps) <= 20, "invalid workflow snapshot steps")
            assert isinstance(steps, list)
            step_ids = set()
            for raw_step in steps:
                step = mapping(raw_step)
                require(set(step) == set(("id name kind detail action" if step.get("kind") == "execute" else "id name kind detail").split()), "unknown workflow step fields")
                step_id = _id(step["id"])
                require(step_id not in step_ids and step["kind"] in ("read", "transform", "approval", "notify", "record", "execute"), "invalid or duplicate workflow step")
                require(type(step["name"]) is str and type(step["detail"]) is str, "invalid workflow step text")
                step_ids.add(step_id)
                if "action" in step:
                    action = _exact(step["action"], "provider binding parameters max_seconds")
                    require(5 <= _number(action["max_seconds"]) <= 60, "invalid workflow action timeout")
            require(_number(row["next_step"]) <= len(steps), "workflow step index exceeds snapshot")
            for name in ("workflow_updated", "mission_approved_at"):
                require(timestamp(snapshot[name]) <= updated, "workflow snapshot timestamp is in the future")
            history = row["events"]
            require(type(history) is list and len(history) <= 21, "invalid run event history")
            assert isinstance(history, list)
            for event_value in history:
                entry = mapping(event_value)
                require(set(entry) in ({"command", "actor", "at", "evidence"}, {"command", "actor", "at", "evidence", "execution", "result_sha256"}), "unknown workflow history fields")
                actor(entry["actor"])
                require(timestamp(entry["at"]) <= updated, "workflow history timestamp is in the future")
                command = _exact(entry["command"], "workspace request_key revision action step_id outcome observation source")
                require(command["workspace"] == tenant_id and 1 <= _number(command["revision"]) < _number(row["revision"]), "workflow history scope/revision mismatch")
                require(all(type(item) is str for name, item in command.items() if name != "revision"), "invalid workflow command text")
                _id(command["step_id"], optional=True)
                require(command["action"] in ("step", "execute", "cancel") and command["outcome"] in ("", "passed", "failed", "approved", "rejected"), "invalid workflow history decision")
                gap(("evidence", _id(entry["evidence"])) not in inventory, "Workflow history cites missing evidence.")
                if "execution" in entry:
                    gap(("jobs", _id(entry["execution"])) not in inventory, "Workflow history cites a missing action.")
                    ContentDigest(str(entry["result_sha256"]))
        elif kind == "jobs":
            role = "requester"
            require(_number(row["protocol_version"]) == 1 and _number(row["attempt"]) <= 3, "unsupported native action protocol or attempts")
            require(row["provider"] in ("erp", "firecrawl", "n8n"), "unsupported native action provider")
            action = _exact(row["input"], "provider binding parameters max_seconds")
            require(action["provider"] == row["provider"] and action["binding"] == row["binding"] and 5 <= _number(action["max_seconds"]) <= 60,
                    "native action input disagrees with its row")
            mapping(action["parameters"])
            worker = _id(row["worker"], optional=True)
            if worker:
                selected = actor(worker)
                role = "executor" if row["started_at"] else "assigned_worker"
                data["executor_id" if row["started_at"] else "worker_id"] = str(selected.semantic_id)
            else:
                gaps.add(f"Executor is not recorded for jobs/{native_id}.")
            if status in ("succeeded", "failed"):
                require(bool(worker) and bool(row["started_at"]) and bool(row["finished_at"]), "result has no persisted execution identity or times")
                result = _exact(row["result"], "reported records run_advanced")
                report = _exact(result["reported"], "status observed_at receipt_ref output")
                require(type(result["run_advanced"]) is bool and report["status"] == status, "native result status/type mismatch")
                require(type(report["receipt_ref"]) is str and 0 < len(report["receipt_ref"]) <= 200, "invalid native result reference")
                require(timestamp(row["started_at"]) <= timestamp(report["observed_at"]) <= timestamp(row["finished_at"]), "native result chronology is inconsistent")
                mapping(report["output"])
                records = mapping(result["records"])
                require(records.keys() <= {"evidence", "signal"} and records.get("evidence") == row["evidence"], "native result record links disagree")
                for linked_id in records.values():
                    _id(linked_id)
                source = _member(sources[(kind, native_id)][0], ("result", "reported"))
                require(hashlib.sha256(source.encode("utf-8")).hexdigest() == row["result_sha256"], "native action result digest does not match")
                phase, outcome = Phase.RESULT, "SUCCESS" if status == "succeeded" else "FAILURE"
            else:
                require(row["result"] is None and row["result_sha256"] == "", "unfinished action carries a completed result")
                if status in ("dispatched", "hold"):
                    require(bool(worker) and bool(row["started_at"]), "dispatched action has no persisted executor or start")
                    outcome = "UNCERTAIN"
                    gaps.add(f"Native action outcome is uncertain for jobs/{native_id}.")
            if row["release_context"] is not None:
                release = _exact(row["release_context"], "candidate_sha source_sha256 artifact_tree_sha256 dispatch environment")
                require(type(release["candidate_sha"]) is str and len(str(release["candidate_sha"])) == 40, "invalid native release revision")
                release_sha = SourceRevision(str(release["candidate_sha"])).source_sha
                ContentDigest(str(release["source_sha256"]))
                ContentDigest(str(release["artifact_tree_sha256"]))
                require(type(release["dispatch"]) is str and 0 < len(release["dispatch"]) <= 120 and release["environment"] in ("fixture", "staging", "production"), "invalid native release context")
            else:
                gaps.add(f"Release context is not recorded for jobs/{native_id}.")
        elif kind == "evidence":
            role, phase = "author", Phase.RESULT
        data["actor_role"] = role
        source_digest = ContentDigest(sources[(kind, native_id)][1])
        reference = f"pocketbase/{tenant_id}/{_COLLECTIONS[kind]}/{native_id}/{source_digest.value}"
        observation = CitadelEvent(
            scope_id=tenant_id, occurred_at=updated, observed_at=updated, ingested_at=ingested_at,
            mission_id=mission_id, correlation_id=f"mission:{mission_id}", actor_id=selected.semantic_id,
            event_type=f"NATIVE_{_COLLECTIONS[kind].upper()}_SNAPSHOT",
            subject_id=SemanticId(f"cni://{_NAMESPACES[kind]}/pocketbase/{tenant_id}/{_COLLECTIONS[kind]}/{native_id}"),
            subject_version=source_digest.value, source_sha=release_sha, source_kind=SourceKind.POCKETBASE,
            source_ref=reference, source_digest=source_digest, evidence_state=EvidenceState.OBSERVED,
            authority=AuthorityTier.A0, risk="observation-only", phase=phase, data=data,
        )
        events.append(WorldEvent(schema_version="buildanddo.world-event/v1", tenant_id=tenant_id, observation=observation, actor_kind=selected.kind,
                                  context_id=f"mission:{mission_id}", outcome=outcome, release_sha=release_sha,
                                  project_id=SemanticId(f"cni://mission/pocketbase/{tenant_id}/missions/{mission_id}"),
                                  traces=(TraceReference("application", "pocketbase", reference, content_digest=source_digest),)))
    return MissionImport(tuple(sorted(events, key=lambda event: (event.observation.observed_at, event.event_id))),
                         captured_at, str(capture["content_sha256"]), tuple(sorted(gaps)))
