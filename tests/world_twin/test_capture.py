# --- CGRF Header --------------------------------------------------
# File:        tests/world_twin/test_capture.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/capture.py, tests/upgrade/sprint-journey.test.mjs
# EnumType:    Test
# EnumEdges:   VALIDATES apps/world_twin/capture.py; CONSUMES tests/upgrade/sprint-journey.test.mjs
# Intent:      Reject ambiguous native captures and exercise synthetic production exports without claiming runtime acceptance.
# ------------------------------------------------------------------

"""Check synthetic native snapshots; these tests do not authenticate a live feed."""

from __future__ import annotations

import copy
import hashlib
import json
import unittest
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta
from typing import cast

from apps.world_twin.capture import ActorBinding, MissionImport, import_mission_capture
from apps.world_twin.events import WorldEvent, world_events
from apps.world_twin.projection import ProjectionScope, compile_projection
from libs.evolution.common import mapping, timestamp
from libs.evolution.event import SourceKind
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.receipts import ActorType
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

CREATED = "2026-09-21T10:00:00Z"
UPDATED = "2026-09-21T12:00:00Z"
CAPTURED = "2026-09-21T14:00:00Z"
INGESTED = timestamp("2026-09-21T15:00:00Z")
ACTORS = {
    "owner": ActorBinding(SemanticId("cni://person/synthetic/owner"), ActorType.HUMAN),
    "admin": ActorBinding(SemanticId("cni://person/synthetic/admin"), ActorType.HUMAN),
    "viewer": ActorBinding(SemanticId("cni://person/synthetic/viewer"), ActorType.HUMAN),
    "worker": ActorBinding(SemanticId("cni://agent/synthetic/worker"), ActorType.AGENT),
}


def serialized(value: object) -> str:
    """Encode unit fixtures only, not a replacement JavaScript canonicalizer."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def content(raw: dict[str, object]) -> dict[str, object]:
    return cast(dict[str, object], raw["content"])


def row(raw: dict[str, object], kind: str = "mission") -> dict[str, object]:
    value = content(raw)[kind]
    return cast(dict[str, object], value if kind == "mission" else cast(list[object], value)[0])


def leaves(raw: dict[str, object]) -> list[dict[str, object]]:
    return cast(list[dict[str, object]], raw["leaves"])


def seal(raw: dict[str, object]) -> dict[str, object]:
    """Bind exact synthetic source strings, including their original number spelling."""
    value = content(raw)
    raw["content_canonical"] = serialized(value)
    raw["content_sha256"] = sha(str(raw["content_canonical"]))
    raw["leaves"] = [
        {"kind": kind, "id": item["id"], "canonical": serialized(item), "sha256": sha(serialized(item))}
        for kind in ("mission", "runs", "jobs", "evidence", "tasks")
        for item in ([cast(dict[str, object], value[kind])] if kind == "mission" else cast(list[dict[str, object]], value[kind]))
    ]
    return raw


def synthetic_capture() -> dict[str, object]:
    """Supply negative-control rows; the connected Node test uses the real producer."""
    common = {"workspace": "ws1", "owner": "owner", "created": CREATED, "updated": UPDATED}
    report = {"status": "succeeded", "observed_at": "2026-09-21T11:30:00Z", "receipt_ref": "synthetic/receipt",
              "output": {"effect_key": "a" * 64, "execution_id": "execution1", "summary": "PRIVATE RESULT", "score": 1e-7}}
    value: dict[str, object] = {
        "mission": {**common, "id": "mission1", "title": "PRIVATE TITLE", "description": "PRIVATE DESCRIPTION", "status": "running",
                    "mission_approved_by": "owner", "mission_approved_at": "2026-09-21T10:30:00Z",
                    "mission_reviewed_by": "", "mission_reviewed_at": "", "mission_review": None,
                    "mission_plan": {"independent_review": True, "answer": "PRIVATE ANSWER", "unicode": "caf\u00e9 \U0001f680", "float": 1e20}},
        "runs": [{**common, "id": "run1", "mission": "mission1", "workflow": "workflow1", "request_key": "synthetic-start-key",
                  "start_request": {"workspace": "ws1", "workflow": "workflow1", "mission": "mission1", "request_key": "synthetic-start-key"},
                  "snapshot": {"version": 1, "name": "PRIVATE WORKFLOW", "description": "PRIVATE STEPS", "steps": [],
                               "workflow_updated": CREATED, "mission_id": "mission1", "mission_title": "PRIVATE TITLE", "mission_approved_at": "2026-09-21T10:30:00Z"},
                  "events": [], "revision": 3, "next_step": 0, "status": "completed", "started_at": "2026-09-21T11:00:00Z", "finished_at": "2026-09-21T11:30:00Z"}],
        "jobs": [{**common, "id": "job1", "mission": "mission1", "run": "run1", "step_id": "execute", "provider": "n8n", "binding": "synthetic-operation",
                  "effect_key": "a" * 64, "status": "succeeded", "worker": "worker", "lease_until": "2026-09-21T11:02:00Z", "failure": "",
                  "approval_at": "2026-09-21T10:30:00Z", "result_sha256": sha(serialized(report)), "evidence": "evidence1",
                  "input": {"provider": "n8n", "binding": "synthetic-operation", "parameters": {"operation": "synthetic", "input": {"private": "PRIVATE INPUT"}}, "max_seconds": 30},
                  "result": {"reported": report, "records": {"evidence": "evidence1"}, "run_advanced": True},
                  "revision": 3, "attempt": 1, "integration_revision": 1, "run_revision": 2, "protocol_version": 1, "release_context": None,
                  "started_at": "2026-09-21T11:00:00Z", "finished_at": "2026-09-21T11:30:00Z"}],
        "evidence": [{**common, "id": "evidence1", "mission": "mission1", "owner": "worker", "type": "observed", "category": "workflow_run",
                      "title": "PRIVATE EVIDENCE", "source": "PRIVATE SOURCE", "content": "PRIVATE BODY", "url": "https://example.org/source?private=QUERY"}],
        "tasks": [{**common, "id": "task1", "mission": "mission1", "execution": "job1", "evidence": "evidence1", "objective": "", "contact": "",
                   "title": "PRIVATE TASK", "description": "PRIVATE TASK BODY", "status": "done", "due_date": "2026-10-01 12:00:00.000Z"}],
    }
    return seal({"schema_version": "buildanddo.mission-replay/v1", "workspace": "ws1", "captured_by": "viewer", "captured_at": CAPTURED,
                 "capture_complete": True, "evidence_state": "recorded", "independent_verification": "not_conferred_by_export",
                 "integrity": "consistent", "integrity_issues": [], "content": value})


def assert_native_capture(raw: object) -> None:
    """Exercise actual JSVM producer bytes sent by the connected synthetic ERP test."""
    capture = mapping(raw)
    at = timestamp(capture["captured_at"]) + timedelta(seconds=1)
    result = import_mission_capture(capture, tenant_id="ws1", mission_id="mission1", actors=ACTORS, ingested_at=at)
    assert result.content_sha256 == sha(cast(str, capture["content_canonical"]))
    assert len(result.events) == len(cast(list[object], capture["leaves"]))
    for event in result.events:
        assert type(event) is WorldEvent
        assert event == WorldEvent.from_json(event.to_json())
        assert event.observation.evidence_state is EvidenceState.OBSERVED
        assert event.observation.authority is AuthorityTier.A0
        assert event.visibility == "PRIVATE" and event.capabilities == ()
        assert event.observation.verification is None
        assert all(ref.trace_id is None and ref.span_id is None and ref.provider == "pocketbase" for ref in event.traces)
        assert "PRIVATE" not in serialized(dict(event.observation.data))
    later = {**capture, "captured_by": "viewer", "captured_at": (at + timedelta(seconds=1)).isoformat()}
    repeated = import_mission_capture(later, tenant_id="ws1", mission_id="mission1", actors=ACTORS, ingested_at=at + timedelta(seconds=2))
    assert [e.event_id for e in result.events] == [e.event_id for e in repeated.events]
    assert len(world_events(result.events + repeated.events, "ws1", at + timedelta(seconds=2))) == len(result.events)
    assert any(e.outcome == "SUCCESS" for e in result.events)
    scope = ProjectionScope(tenant_id="ws1", subject_id=SemanticId("cni://tenant/pocketbase/ws1"), view="community",
                            as_of=at, allowed_event_ids=tuple(SemanticId(event.event_id) for event in result.events))
    projection = compile_projection(result.events, scope)
    assert projection == compile_projection(tuple(reversed(repeated.events)), scope)
    assert "PRIVATE" not in serialized(projection)
    measures = mapping(projection["measures"])
    assert mapping(measures["activity"])["value"] == len(result.events)
    assert mapping(measures["reviewed_observations"])["value"] == 0
    graph = mapping(projection["graph"])
    assert graph["schema_version"] == "semantic-twin.graph/v2"
    assert int(cast(int, graph["object_count"])) > len(result.events)
    assert projection["authority_granted"] is False


class CaptureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw = synthetic_capture()

    def imported(self, raw: object | None = None) -> MissionImport:
        return import_mission_capture(self.raw if raw is None else raw, tenant_id="ws1", mission_id="mission1", actors=ACTORS, ingested_at=INGESTED)

    def test_native_mission_project_view_keeps_all_related_records(self) -> None:
        result = self.imported()
        selection = ProjectionScope(tenant_id="ws1", view="project",
            subject_id=SemanticId("cni://mission/pocketbase/ws1/missions/mission1"), as_of=INGESTED,
            allowed_event_ids=tuple(SemanticId(event.event_id) for event in result.events))
        visible = compile_projection(result.events, selection)["events"]
        assert isinstance(visible, list)
        self.assertEqual(len(visible), len(result.events))

    def test_exact_bytes_and_contract_round_trip(self) -> None:
        result = self.imported()
        self.assertEqual(len(result.events), 5)
        self.assertEqual(result.content_sha256, self.raw["content_sha256"])
        self.assertEqual(result.captured_at, timestamp(CAPTURED))
        self.assertEqual(MissionImport.from_json(result.to_json()), result)
        leaf_hashes = {str(leaf["sha256"]) for leaf in leaves(self.raw)}
        for event in result.events:
            self.assertIn(event.observation.source_digest.value, leaf_hashes)
            self.assertIn(event.observation.source_digest.value, event.observation.source_ref)
            self.assertEqual(event.observation.source_kind, SourceKind.POCKETBASE)

    def test_repeat_capture_and_later_ingestion_deduplicate(self) -> None:
        before = self.imported()
        self.raw.update(captured_at="2026-09-21T14:30:00Z", captured_by="owner")
        later = self.imported()
        self.assertEqual([e.event_id for e in before.events], [e.event_id for e in later.events])
        retry = import_mission_capture(self.raw, tenant_id="ws1", mission_id="mission1", actors=ACTORS, ingested_at=INGESTED + timedelta(days=1))
        self.assertEqual(len(world_events(before.events + retry.events, "ws1", INGESTED)), 5)

    def test_source_times_are_not_the_capture_clock(self) -> None:
        for event in self.imported().events:
            self.assertEqual(event.observation.occurred_at, timestamp(UPDATED))
            self.assertEqual(event.observation.observed_at, timestamp(UPDATED))
            self.assertEqual(event.observation.ingested_at, INGESTED)

    def test_privacy_attribution_and_no_verification_promotion(self) -> None:
        row(self.raw)["status"] = "verified"
        row(self.raw).update(mission_reviewed_by="admin", mission_reviewed_at=UPDATED,
                             mission_review={"evidence_snapshot": copy.deepcopy(content(self.raw)["evidence"])})
        seal(self.raw)
        events = self.imported().events
        mission = next(e for e in events if e.observation.data["record_kind"] == "mission")
        job = next(e for e in events if e.observation.data["record_kind"] == "jobs")
        self.assertEqual(mission.outcome, "NONE")
        self.assertEqual(job.observation.actor_id, ACTORS["worker"].semantic_id)
        self.assertEqual(job.actor_kind, ActorType.AGENT)
        self.assertEqual(job.observation.data["owner_id"], ACTORS["owner"].semantic_id)
        self.assertEqual(job.observation.data["actor_role"], "executor")
        for event in events:
            self.assertEqual(event.visibility, "PRIVATE")
            self.assertEqual(event.observation.evidence_state, EvidenceState.OBSERVED)
            self.assertIsNone(event.observation.verification)
            self.assertFalse(event.capabilities)
            self.assertNotIn("PRIVATE", serialized(dict(event.observation.data)))
            self.assertNotIn("private=QUERY", event.to_json())
            self.assertTrue(all(ref.trace_id is None and ref.span_id is None for ref in event.traces))

    def test_failed_and_uncertain_actions_are_not_success(self) -> None:
        for status, expected in (("failed", "FAILURE"), ("hold", "UNCERTAIN"), ("dispatched", "UNCERTAIN"), ("cancelled", "NONE"), ("queued", "NONE")):
            with self.subTest(status=status):
                raw = synthetic_capture()
                job = row(raw, "jobs")
                job["status"] = status
                if status == "failed":
                    report = cast(dict[str, object], cast(dict[str, object], job["result"])["reported"])
                    report["status"] = status
                    job["result_sha256"] = sha(serialized(report))
                else:
                    job.update(result=None, result_sha256="", evidence="", finished_at="")
                if status == "queued":
                    job.update(worker="", started_at="")
                seal(raw)
                event = next(e for e in self.imported(raw).events if e.observation.data["record_kind"] == "jobs")
                self.assertEqual(event.outcome, expected)
                if status == "queued":
                    self.assertEqual(event.observation.data["actor_role"], "requester")

    def test_hold_is_a_gap_not_an_independent_receipt(self) -> None:
        before = self.imported()
        self.raw.update(integrity="HOLD", integrity_issues=["Synthetic retained snapshot differs."])
        result = self.imported()
        self.assertTrue(any("HOLD" in gap for gap in result.gaps))
        self.assertEqual(result.events, before.events)
        self.assertTrue(all(event.observation.verification is None for event in result.events))

    def test_changed_source_revision_changes_only_its_event(self) -> None:
        before = {str(e.observation.data["record_kind"]): e for e in self.imported().events}
        row(self.raw, "evidence")["content"] = "OTHER PRIVATE BODY"
        seal(self.raw)
        after = {str(e.observation.data["record_kind"]): e for e in self.imported().events}
        self.assertNotEqual(before["evidence"].event_id, after["evidence"].event_id)
        self.assertEqual(before["mission"].event_id, after["mission"].event_id)

    def test_missing_or_capture_supplied_actor_bindings_are_rejected(self) -> None:
        for actors in ({}, {**ACTORS, "worker": {"semantic_id": str(ACTORS["worker"].semantic_id), "kind": "agent"}}):
            with self.subTest(actors=bool(actors)), self.assertRaises(ContractError):
                import_mission_capture(self.raw, tenant_id="ws1", mission_id="mission1", actors=cast(dict[str, ActorBinding], actors), ingested_at=INGESTED)
        self.raw["actors"] = {"owner": "trusted"}
        with self.assertRaises(ContractError):
            self.imported()
        with self.assertRaises(FrozenInstanceError):
            ACTORS["owner"].kind = ActorType.AGENT  # type: ignore[misc]

    def test_exact_envelope_and_group_names(self) -> None:
        for key in ("roles", "visibility", "authority", "verified", "actors"):
            with self.subTest(key=key), self.assertRaises(ContractError):
                self.imported({**self.raw, key: True})
        for kind in ("extra", "missing"):
            raw = synthetic_capture()
            if kind == "extra":
                content(raw)["permissions"] = []
            else:
                del content(raw)["tasks"]
            with self.subTest(kind=kind), self.assertRaises(ContractError):
                self.imported(raw)

    def test_incomplete_unrecorded_or_promoted_capture_fails(self) -> None:
        for key, value in (("capture_complete", 1), ("capture_complete", False), ("evidence_state", "VERIFIED"),
                           ("independent_verification", "verified"), ("schema_version", "buildanddo.mission-replay/v2"),
                           ("integrity", "PASS"), ("integrity_issues", "none"), ("integrity_issues", [1])):
            with self.subTest(key=key, value=value), self.assertRaises(ContractError):
                self.imported({**self.raw, key: value})
        with self.assertRaises(ContractError):
            self.imported({**self.raw, "integrity": "HOLD"})
        with self.assertRaises(ContractError):
            self.imported({**self.raw, "integrity_issues": ["unacknowledged"]})

    def test_wrong_workspace_mission_or_native_id_fails(self) -> None:
        for kind, key, value in (("mission", "workspace", "ws2"), ("mission", "id", "mission2"), ("jobs", "mission", "mission2"),
                                 ("evidence", "id", "private?id=other"), ("tasks", "owner", True)):
            raw = synthetic_capture()
            row(raw, kind)[key] = value
            seal(raw)
            with self.subTest(kind=kind, key=key), self.assertRaises(ContractError):
                self.imported(raw)
        with self.assertRaises(ContractError):
            self.imported({**self.raw, "workspace": "ws2"})

    def test_changed_content_or_exact_string_digest_fails(self) -> None:
        for key, value in (("content_canonical", None), ("content_canonical", "{}"), ("content_sha256", "0" * 64), ("content_sha256", True)):
            with self.subTest(key=key), self.assertRaises(ContractError):
                self.imported({**self.raw, key: value})
        row(self.raw)["title"] = "ALTERED"
        with self.assertRaises(ContractError):
            self.imported()

    def test_duplicate_missing_foreign_or_extra_leaf_fails(self) -> None:
        for mode in ("duplicate", "missing", "foreign", "extra", "digest", "bytes", "permission"):
            raw = synthetic_capture()
            values = leaves(raw)
            if mode == "duplicate":
                values[1] = values[0]
            elif mode == "missing":
                values.pop()
            elif mode == "extra":
                values.append(copy.deepcopy(values[0]))
            elif mode == "foreign":
                values[0]["kind"] = "foreign"
            elif mode == "digest":
                values[0]["sha256"] = "0" * 64
            elif mode == "bytes":
                values[0]["canonical"] = "{}"
            else:
                values[0]["authority"] = "A3"
            with self.subTest(mode=mode), self.assertRaises(ContractError):
                self.imported(raw)

    def test_leaf_bytes_must_agree_with_whole_content_bytes(self) -> None:
        leaf = leaves(self.raw)[0]
        leaf["canonical"] = " " + str(leaf["canonical"])
        leaf["sha256"] = sha(str(leaf["canonical"]))
        with self.assertRaises(ContractError):
            self.imported()

    def test_duplicate_rows_oversized_groups_and_unknown_row_metadata_fail(self) -> None:
        for size in (2, 201):
            raw = synthetic_capture()
            content(raw)["evidence"] = [copy.deepcopy(row(raw, "evidence")) for _ in range(size)]
            seal(raw)
            with self.subTest(size=size), self.assertRaises(ContractError):
                self.imported(raw)
        row(self.raw)["visibility"] = "PUBLIC"
        seal(self.raw)
        with self.assertRaises(ContractError):
            self.imported()

    def test_boolean_and_nonnumeric_revisions_fail(self) -> None:
        for key in ("revision", "attempt", "protocol_version", "integration_revision", "run_revision"):
            for value in (True, "1", -1, 1.5, 2**53):
                raw = synthetic_capture()
                row(raw, "jobs")[key] = value
                seal(raw)
                with self.subTest(key=key, value=value), self.assertRaises(ContractError):
                    self.imported(raw)

    def test_bool_number_parse_equality_cannot_hide_changed_bytes(self) -> None:
        self.raw["content_canonical"] = str(self.raw["content_canonical"]).replace('"independent_review":true', '"independent_review":1')
        self.raw["content_sha256"] = sha(str(self.raw["content_canonical"]))
        with self.assertRaises(ContractError):
            self.imported()

    def test_naive_future_and_reversed_source_timestamps_fail(self) -> None:
        for key, value in (("created", "2026-09-21T13:00:00Z"), ("updated", "2026-09-21T16:00:00Z"),
                           ("updated", "2026-09-21T12:00:00"), ("updated", True), ("updated", "not-a-time")):
            raw = synthetic_capture()
            row(raw)[key] = value
            seal(raw)
            with self.subTest(key=key, value=value), self.assertRaises(ContractError):
                self.imported(raw)
        for captured_value in ("2026-09-21T14:00:00", "2026-09-21T16:00:00Z", 1):
            with self.subTest(captured_at=captured_value), self.assertRaises(ContractError):
                self.imported({**self.raw, "captured_at": captured_value})
        with self.assertRaises(ContractError):
            import_mission_capture(self.raw, tenant_id="ws1", mission_id="mission1", actors=ACTORS, ingested_at=datetime(2026, 9, 22))

    def test_release_is_only_the_explicit_recorded_context(self) -> None:
        job = row(self.raw, "jobs")
        job["release_context"] = {"candidate_sha": "a" * 40, "source_sha256": "b" * 64, "artifact_tree_sha256": "c" * 64,
                                  "dispatch": "synthetic-dispatch", "environment": "fixture"}
        seal(self.raw)
        result = self.imported()
        self.assertEqual([e.release_sha for e in result.events if e.observation.data["record_kind"] == "jobs"], ["a" * 40])
        self.assertTrue(all(e.release_sha is None for e in result.events if e.observation.data["record_kind"] != "jobs"))
        cast(dict[str, object], job["release_context"])["authority"] = "A3"
        seal(self.raw)
        with self.assertRaises(ContractError):
            self.imported()

    def test_import_does_not_mutate_source_or_retain_raw_bodies(self) -> None:
        original = copy.deepcopy(self.raw)
        result = self.imported()
        self.assertEqual(self.raw, original)
        row(self.raw)["title"] = "changed later"
        for secret in ("PRIVATE TITLE", "PRIVATE INPUT", "PRIVATE ANSWER", "PRIVATE BODY", "PRIVATE RESULT", "private=QUERY"):
            self.assertNotIn(secret, result.to_json())
        self.assertNotIn("changed later", result.to_json())

    def test_empty_mission_only_capture_is_valid_but_not_complete_activity(self) -> None:
        for kind in ("runs", "jobs", "evidence", "tasks"):
            content(self.raw)[kind] = []
        seal(self.raw)
        result = self.imported()
        self.assertEqual(len(result.events), 1)
        self.assertEqual(result.events[0].outcome, "NONE")
        self.assertTrue(result.gaps)

    def test_non_json_deep_oversized_or_duplicate_key_canonical_fails(self) -> None:
        for source in ('{"mission":{},"mission":{}}', '{"n":NaN}', '{"n":1e999}', '[' * 34 + '0' + ']' * 34, ' ' * 2_000_001):
            raw = {**self.raw, "content_canonical": source, "content_sha256": sha(source)}
            with self.subTest(source=source[:30]), self.assertRaises(ContractError):
                self.imported(raw)

    def test_hold_does_not_mask_invalid_result_bytes_or_foreign_review(self) -> None:
        self.raw.update(integrity="HOLD", integrity_issues=["Synthetic source inconsistency."])
        row(self.raw, "jobs")["result_sha256"] = "0" * 64
        seal(self.raw)
        with self.assertRaisesRegex(ContractError, "result digest"):
            self.imported()
        raw = synthetic_capture()
        raw.update(integrity="HOLD", integrity_issues=["Synthetic source inconsistency."])
        row(raw)["mission_review"] = {"evidence_snapshot": [{"id": "other", "workspace": "ws2", "mission": "mission1"}]}
        seal(raw)
        with self.assertRaisesRegex(ContractError, "foreign"):
            self.imported(raw)

    def test_missing_source_link_requires_an_explicit_hold(self) -> None:
        row(self.raw, "tasks")["execution"] = "missingjob"
        seal(self.raw)
        with self.assertRaisesRegex(ContractError, "integrity gap"):
            self.imported()
        self.raw.update(integrity="HOLD", integrity_issues=["Task task1 has no captured action."])
        self.assertIn("Missing jobs link for tasks/task1.", self.imported().gaps)

    def test_claimed_worker_is_not_called_an_executor(self) -> None:
        row(self.raw, "jobs").update(status="claimed", result=None, result_sha256="", evidence="", started_at="", finished_at="")
        seal(self.raw)
        event = next(event for event in self.imported().events if event.observation.data["record_kind"] == "jobs")
        self.assertEqual(event.observation.data["actor_role"], "assigned_worker")
        self.assertNotIn("executor_id", event.observation.data)
        self.assertEqual(event.outcome, "NONE")

    def test_leaf_order_and_capture_observer_do_not_change_event_ids(self) -> None:
        first = self.imported()
        leaves(self.raw).reverse()
        self.raw["captured_by"] = "owner"
        self.assertEqual(self.imported().events, first.events)

    def test_nested_numeric_and_time_metadata_is_checked(self) -> None:
        for value in (True, "30", 1.5, 61):
            raw = synthetic_capture()
            cast(dict[str, object], row(raw, "jobs")["input"])["max_seconds"] = value
            seal(raw)
            with self.subTest(timeout=value), self.assertRaises(ContractError):
                self.imported(raw)
        for key, metadata in (("version", True), ("steps", {}), ("workflow_updated", "2027-01-01T00:00:00Z")):
            raw = synthetic_capture()
            cast(dict[str, object], row(raw, "runs")["snapshot"])[key] = metadata
            seal(raw)
            with self.subTest(key=key), self.assertRaises(ContractError):
                self.imported(raw)

    def test_overflow_nonfinite_and_excessively_deep_body_fail_closed(self) -> None:
        for value in (10**400, float("inf"), float("nan")):
            raw = synthetic_capture()
            cast(dict[str, object], row(raw)["mission_plan"])["float"] = value
            with self.subTest(value=type(value)), self.assertRaises(ContractError):
                self.imported(raw)
        nested: object = 0
        for _ in range(33):
            nested = {"nested": nested}
        row(self.raw)["mission_plan"] = nested
        seal(self.raw)
        with self.assertRaisesRegex(ContractError, "nesting"):
            self.imported()


if __name__ == "__main__":
    unittest.main()
