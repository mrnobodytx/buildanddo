# ─── CGRF Header ──────────────────────────────
# File:        apps/career/missions.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/taxonomy.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/taxonomy.py; CONSUMES missions; CONSUMES evidence; CONSUMES suite_runs; PRODUCES apps/career/passport.py
# DAG Node:    none
# Intent:      Admit BuildAndDo mission work into the passport, reaching VERIFIED only where a different person reviewed the run.
# ─────────────────────────────────────────────────────────────

"""Read an exported BuildAndDo mission snapshot and classify it for one person.

The export holds PocketBase records from ``missions``, ``evidence`` and
``suite_runs``. Rules:

- An evidence record the person wrote about their own mission is
  PERSONALLY_OPERATED and DECLARED. Its ``type`` may say ``verified``, but the
  person set that value, so it is not independent verification.
- An attached suite run the person requested is PERSONALLY_OPERATED. It is
  VERIFIED only when ``reviewed_by`` names someone else and a result digest
  exists; a self-reviewed run is DECLARED.
- An attached suite run someone else requested and the person reviewed is
  REVIEWED and OBSERVED.
- A mission ``status`` of ``verified`` is owner-set and is never used.
- Suite review evidence records duplicate their run and are skipped.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from apps.career.evidence import CareerError, ClaimState, EvidenceRef, Participation
from apps.career.taxonomy import capabilities_for_text


@dataclass(slots=True)
class MissionAttribution:
    """Collect mission evidence and the counts of records that earned no credit."""

    evidence: list[EvidenceRef] = field(default_factory=list)
    missions: int = 0
    evidence_records: int = 0
    suite_runs: int = 0
    self_reported: int = 0
    independently_reviewed: int = 0
    reviewed_for_others: int = 0
    self_reviewed: int = 0
    excluded: int = 0
    unmapped: int = 0

    def source(self) -> dict[str, Any]:
        """Return the passport source summary for this snapshot."""
        return {
            "kind": "buildanddo_missions",
            "missions": self.missions,
            "evidence_records": self.evidence_records,
            "suite_runs": self.suite_runs,
            "self_reported": self.self_reported,
            "independently_reviewed": self.independently_reviewed,
            "reviewed_for_others": self.reviewed_for_others,
            "self_reviewed": self.self_reviewed,
            "excluded": self.excluded,
            "unmapped": self.unmapped,
        }


def _records(raw: Mapping[str, Any], key: str) -> list[dict[str, Any]]:
    value = raw.get(key, [])
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise CareerError(f"mission export field {key!r} must be a list of records")
    for item in value:
        if not isinstance(item.get("id"), str) or not item["id"]:
            raise CareerError(f"every {key} record needs an id")
    return value


def _text(record: Mapping[str, Any], *keys: str) -> str:
    return " ".join(str(record.get(key) or "") for key in keys).strip()


def attribute_missions(raw: Mapping[str, Any], person_user_ids: Iterable[str]) -> MissionAttribution:
    """Classify an exported mission snapshot for the person's PocketBase user ids."""
    if not isinstance(raw, Mapping):
        raise CareerError("mission export must be an object")
    people = frozenset(item for item in person_user_ids if item)
    if not people:
        raise CareerError("mission attribution needs at least one person user id")
    missions = {item["id"]: item for item in _records(raw, "missions")}
    evidence = _records(raw, "evidence")
    runs = _records(raw, "suite_runs")
    result = MissionAttribution(missions=len(missions), evidence_records=len(evidence), suite_runs=len(runs))

    def add(ref: str, text: str, participation: Participation, state: ClaimState, at: str, detail: str) -> None:
        capabilities = capabilities_for_text(text)
        if not capabilities:
            result.unmapped += 1
            return
        for capability in capabilities:
            result.evidence.append(EvidenceRef("mission", ref, capability, participation, state, at, detail))

    for record in evidence:
        mission = missions.get(str(record.get("mission") or ""))
        if record.get("owner") not in people or mission is None:
            result.excluded += 1
            continue
        if str(record.get("source") or "").startswith("Suite run "):
            continue
        result.self_reported += 1
        text = _text(mission, "title", "description") + " " + _text(record, "title", "content")
        add(
            f"evidence:{record['id']}", text, Participation.PERSONALLY_OPERATED, ClaimState.DECLARED,
            str(record.get("created") or ""),
            f"self-reported {record.get('type', 'evidence')} evidence on mission {mission['id']}",
        )
    for run in runs:
        mission = missions.get(str(run.get("mission") or ""))
        reviewer = str(run.get("reviewed_by") or "")
        if run.get("status") != "attached" or mission is None or not reviewer:
            result.excluded += 1
            continue
        text = _text(mission, "title", "description") + " " + _text(run, "suite")
        at = str(run.get("reviewed_at") or run.get("created") or "")
        if run.get("owner") in people:
            if reviewer not in people and run.get("result_sha256"):
                result.independently_reviewed += 1
                state, detail = ClaimState.VERIFIED, f"suite run reviewed by {reviewer}; result {run['result_sha256']}"
            else:
                result.self_reviewed += 1
                state, detail = ClaimState.DECLARED, "suite run reviewed by its own requester"
            add(f"suite_run:{run['id']}", text, Participation.PERSONALLY_OPERATED, state, at, detail)
        elif reviewer in people:
            result.reviewed_for_others += 1
            add(f"suite_run:{run['id']}", text, Participation.REVIEWED, ClaimState.OBSERVED, at,
                "reviewed another requester's suite run")
        else:
            result.excluded += 1
    return result
