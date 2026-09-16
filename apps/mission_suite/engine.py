# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/mission_suite/engine.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     scripts/ci/evidence_epoch.py, apps/research/contracts.py, apps/mission_suite/bundle.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/evidence_epoch.py; DEPENDS_ON apps/research/contracts.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Compute reproducible mission analysis and submission evidence gaps without acquiring cue or submission authority.
# ───────────────────────────────────────────────────────────────

"""Compute bounded maritime candidates and government-submission readiness."""

from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import datetime, timezone
from typing import NoReturn, cast
from urllib.parse import urlsplit

from apps.research.contracts import ResearchError
from apps.mission_suite.bundle import source_fingerprint
from scripts.ci.evidence_epoch import ROOT_ALGORITHM, root_of, sha256_json

VERSION = "mission-suite/1.0.0"
INPUT_VERSION = "mission-suite.input/v1"
RESULT_VERSION = "mission-suite.result/v1"
MAX_OBSERVATIONS = 256


class SuiteError(ResearchError):
    """Carry an application failure without disclosing input or credentials."""


def reject(reason: str = "invalid_data") -> NoReturn:
    """Reject a malformed or disallowed operation."""
    raise SuiteError(reason)


def obj(value: object, keys: set[str] | None = None) -> dict[str, object]:
    """Require a string-keyed object with the declared fields."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        reject()
    result = cast(dict[str, object], value)
    if keys is not None and set(result) != keys:
        reject()
    return result


def rows(value: object, maximum: int, minimum: int = 0) -> list[object]:
    """Require a bounded list."""
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        reject()
    return cast(list[object], value)


def text(value: object, maximum: int = 1200, empty: bool = False) -> str:
    """Require bounded printable text without stripping its identity."""
    if (
        not isinstance(value, str)
        or len(value) > maximum
        or (not empty and not value.strip())
        or any(
            (ord(char) < 32 and char not in "\n\r\t") or 0xD800 <= ord(char) <= 0xDFFF
            for char in value
        )
    ):
        reject()
    return value


def identity(value: object) -> str:
    """Require a safe opaque identifier."""
    result = text(value, 80)
    if not re.fullmatch(r"[A-Za-z0-9_:.\-]+", result):
        reject()
    return result


def instant(value: object) -> datetime:
    """Require an explicit UTC timestamp."""
    source = text(value, 40)
    if not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)", source
    ):
        reject()
    try:
        result = datetime.fromisoformat(source.replace("Z", "+00:00"))
    except ValueError:
        reject()
    if result.tzinfo is None or result.utcoffset() != timezone.utc.utcoffset(result):
        reject()
    return result


def number(value: object, low: float, high: float) -> float:
    """Require a finite real number, excluding booleans."""
    if type(value) not in (int, float):
        reject()
    try:
        result = float(cast(float, value))
    except OverflowError:
        reject()
    if not math.isfinite(result) or not low <= result <= high:
        reject()
    return result


def digest(value: object) -> str:
    """Require a complete SHA-256 fingerprint."""
    result = text(value, 64)
    if not re.fullmatch(r"[a-f0-9]{64}", result):
        reject()
    return result


def decode(raw: str) -> dict[str, object]:
    """Parse bounded strict JSON without duplicate keys or non-finite values."""
    try:
        if len(raw.encode("utf-8")) > 300000:
            reject("too_large")
    except UnicodeError:
        reject()

    def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in items:
            if key in result:
                reject()
            result[key] = value
        return result

    def constant(_value: str) -> None:
        reject()

    try:
        return obj(json.loads(raw, object_pairs_hook=pairs, parse_constant=constant))
    except (ValueError, RecursionError, UnicodeError):
        reject()


def distance(a: dict[str, object], b: dict[str, object]) -> float:
    """Measure great-circle distance in metres, including date-line crossings."""
    lat1, lat2 = (math.radians(number(row["latitude"], -90, 90)) for row in (a, b))
    delta = math.radians(
        number(b["longitude"], -180, 180) - number(a["longitude"], -180, 180)
    )
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta / 2) ** 2
    )
    return 12742000 * math.asin(math.sqrt(min(1, max(0, h))))


def maritime(document: dict[str, object]) -> dict[str, object]:
    """Normalize permitted observations and retain ordered, non-destructive state."""
    at = instant(document["evaluated_at"])
    rights: dict[str, dict[str, object]] = {}
    for value in rows(document["rights"], 32, 1):
        right = obj(
            value,
            {
                "source_id",
                "rights_id",
                "license_ref",
                "classification",
                "processing_allowed",
                "export_allowed",
                "expires_at",
                "independence_group",
            },
        )
        source = identity(right["source_id"])
        if source in rights:
            reject()
        identity(right["rights_id"])
        identity(right["independence_group"])
        text(right["license_ref"], 2048)
        if (
            right["classification"] not in ("PUBLIC", "COMMERCIAL")
            or right["processing_allowed"] is not True
            or (
                type(right["export_allowed"]) is not bool
                or instant(right["expires_at"]) <= at
            )
        ):
            reject("rights_denied")
        rights[source] = right
    parameters = obj(
        document["parameters"],
        {"gap_seconds", "max_speed_knots", "position_tolerance_m", "stale_seconds"},
    )
    gap = number(parameters["gap_seconds"], 60, 86400)
    speed = number(parameters["max_speed_knots"], 1, 100)
    tolerance = number(parameters["position_tolerance_m"], 10, 100000)
    stale = number(parameters["stale_seconds"], 60, 604800)
    payload = obj(document["payload"], {"observations"})
    seen: dict[str, dict[str, object]] = {}
    source_records: dict[tuple[str, str], str] = {}
    for value in rows(payload["observations"], MAX_OBSERVATIONS, 1):
        item = obj(
            value,
            {
                "observation_id",
                "source_id",
                "source_record_id",
                "entity_id",
                "event_time",
                "ingest_time",
                "latitude",
                "longitude",
            },
        )
        key = identity(item["observation_id"])
        source = identity(item["source_id"])
        source_record = identity(item["source_record_id"])
        identity(item["entity_id"])
        if source not in rights:
            reject("rights_denied")
        event, ingest = instant(item["event_time"]), instant(item["ingest_time"])
        if event > ingest or ingest > at:
            reject("clock_invalid")
        number(item["latitude"], -90, 90)
        number(item["longitude"], -180, 180)
        if (
            key in seen
            and seen[key] != item
            or (source, source_record) in source_records
            and source_records[source, source_record] != key
        ):
            reject("identity_conflict")
        seen[key] = item
        source_records[source, source_record] = key
    observations = []
    grouped: dict[str, list[dict[str, object]]] = {}
    for key in sorted(seen):
        item = seen[key]
        right = rights[text(item["source_id"])]
        normalized = {
            **item,
            "tenant_id": document["tenant_id"],
            "mission_id": document["mission_id"],
            "classification": right["classification"],
            "rights_id": right["rights_id"],
            "raw_hash": sha256_json(item),
            "state_class": "OBSERVED",
        }
        observations.append(normalized)
        grouped.setdefault(text(item["entity_id"]), []).append(normalized)
    entities: list[dict[str, object]] = []
    candidates: list[dict[str, object]] = []
    features: list[dict[str, object]] = []
    geo: list[dict[str, object]] = []
    for entity, track in sorted(grouped.items()):
        track.sort(
            key=lambda row: (instant(row["event_time"]), text(row["observation_id"]))
        )
        conflicts: set[str] = set()
        for i, first in enumerate(track):
            for second in track[i + 1 :]:
                delta = (
                    instant(second["event_time"]) - instant(first["event_time"])
                ).total_seconds()
                if delta > 60:
                    break
                if distance(first, second) > tolerance:
                    conflicts.update(
                        (text(first["observation_id"]), text(second["observation_id"]))
                    )
        feature_rows: list[tuple[str, list[str], int, str]] = []
        if conflicts:
            feature_rows.append(
                (
                    "source_disagreement",
                    sorted(conflicts),
                    len(conflicts),
                    "Resolve conflicting source positions.",
                )
            )
        for first, second in zip(track, track[1:]):
            delta = (
                instant(second["event_time"]) - instant(first["event_time"])
            ).total_seconds()
            refs = [text(first["observation_id"]), text(second["observation_id"])]
            if delta > gap:
                feature_rows.append(
                    (
                        "observation_gap",
                        refs,
                        round(delta),
                        "Check receiver coverage before interpreting a gap as AIS silence.",
                    )
                )
            if delta > 0:
                knots = distance(first, second) / delta / 0.514444
                if knots > speed:
                    feature_rows.append(
                        (
                            "track_discontinuity",
                            refs,
                            round(knots),
                            "Check identity and position quality; apparent speed may reflect a wrong association.",
                        )
                    )
        for kind, refs, value, explanation in feature_rows:
            feature_id = sha256_json(
                {
                    "kind": kind,
                    "evidence": refs,
                    "parameters": parameters,
                    "version": VERSION,
                }
            )
            features.append(
                {
                    "feature_id": feature_id,
                    "entity_id": entity,
                    "kind": kind,
                    "value": value,
                    "evidence": refs,
                    "explanation": explanation,
                }
            )
            independent = sorted(
                {
                    text(rights[text(seen[ref]["source_id"])]["independence_group"])
                    for ref in refs
                }
            )
            candidates.append(
                {
                    "candidate_id": feature_id,
                    "subject_entity": entity,
                    "cue_type": kind,
                    "supporting_evidence": refs,
                    "contradicting_evidence": sorted(conflicts),
                    "independent_source_groups": independent,
                    "confidence": None,
                    "uncertainty": [
                        "uncalibrated",
                        "exact_identifier_association_only",
                    ],
                    "priority": "LOW" if kind == "observation_gap" else "MEDIUM",
                    "admission_verdict": "HOLD",
                    "admission_reason": [
                        "NNC admission is not bound",
                        "Operational release context is not bound",
                    ],
                    "recommended_collection": explanation,
                }
            )
        last = track[-1]
        latest = [
            row
            for row in track
            if instant(row["event_time"]) == instant(last["event_time"])
        ]
        latest_conflict = any(
            text(row["observation_id"]) in conflicts for row in latest
        )
        state_class = (
            "CONTRADICTED"
            if latest_conflict
            else "STALE"
            if (at - instant(last["event_time"])).total_seconds() > stale
            else "OBSERVED"
        )
        # A deterministic tie-break orders evidence; it must not select truth
        # from conflicting same-time positions.
        position = (
            None
            if latest_conflict
            else {"latitude": last["latitude"], "longitude": last["longitude"]}
        )
        entities.append(
            {
                "entity_id": entity,
                "association": "supplied_exact_identifier_claim",
                "state_class": state_class,
                "valid_at": last["event_time"],
                "position": position,
                "observation_ids": [row["observation_id"] for row in track],
                "contradicting_evidence": sorted(conflicts),
                "track": [
                    {
                        "time": row["event_time"],
                        "latitude": row["latitude"],
                        "longitude": row["longitude"],
                        "observation_id": row["observation_id"],
                    }
                    for row in track
                ],
            }
        )
        if position is not None:
            geo.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [position["longitude"], position["latitude"]],
                    },
                    "properties": {
                        "entity_id": entity,
                        "time": last["event_time"],
                        "state_class": state_class,
                        "tenant_id": document["tenant_id"],
                        "mission_id": document["mission_id"],
                    },
                }
            )
    return {
        "observations": observations,
        "entities": entities,
        "features": features,
        "candidates": candidates,
        "geojson": {"type": "FeatureCollection", "features": geo},
        "admitted_cues": [],
        "summary": {
            "observations": len(observations),
            "entities": len(entities),
            "candidates": len(candidates),
            "admitted": 0,
        },
        "limits": [
            "No live feed acquisition",
            "Identity associations are supplied claims",
            "No NNC verdict or government handoff",
        ],
    }


def official_url(value: object) -> str:
    """Accept an official-domain reference without asserting it was fetched."""
    result = text(value, 2048, empty=True)
    if not result:
        return ""
    try:
        parsed = urlsplit(result)
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https"
            or parsed.username
            or parsed.password
            or parsed.port not in (443, None)
            or (not host.endswith((".gov", ".mil")) or any(c.isspace() for c in result))
        ):
            reject()
    except ValueError:
        reject()
    return result


def submission(document: dict[str, object]) -> dict[str, object]:
    """Find submission evidence gaps without certifying eligibility or filing."""
    at = instant(document["evaluated_at"])
    payload = obj(document["payload"], {"requirements", "document", "evidence"})
    evidence: dict[str, dict[str, object]] = {}
    for value in rows(payload["evidence"], 100):
        row = obj(value, {"id", "sha256", "type"})
        key = identity(row["id"])
        digest(row["sha256"])
        if key in evidence or row["type"] not in (
            "observed",
            "decided",
            "attempted",
            "verified",
        ):
            reject()
        evidence[key] = row
    checks = []
    seen: set[str] = set()
    for value in rows(payload["requirements"], 50, 1):
        row = obj(
            value,
            {
                "id",
                "criterion",
                "source_url",
                "source_revision",
                "evidence_ids",
                "status",
                "justification",
            },
        )
        key = identity(row["id"])
        text(row["criterion"])
        text(row["justification"], empty=True)
        if key in seen or row["status"] not in ("open", "satisfied", "not_applicable"):
            reject()
        seen.add(key)
        source = official_url(row["source_url"])
        revision = text(row["source_revision"], 200, empty=True)
        refs = [identity(ref) for ref in rows(row["evidence_ids"], 20)]
        issues = []
        if not source or not revision:
            issues.append("Missing official requirement reference or revision")
        if row["status"] == "open":
            issues.append("Requirement is still open")
        if row["status"] == "not_applicable" and not row["justification"]:
            issues.append("Explain non-applicability for the reviewer")
        if row["status"] == "satisfied" and not refs:
            issues.append("No mission evidence linked")
        if len(set(refs)) != len(refs) or any(ref not in evidence for ref in refs):
            issues.append(
                "Evidence reference does not resolve uniquely in this mission"
            )
        if any(evidence.get(ref, {}).get("type") != "verified" for ref in refs):
            issues.append("Referenced evidence has not been verified")
        checks.append(
            {
                "id": key,
                "state": "NEEDS_EVIDENCE" if issues else "REFERENCED",
                "issues": issues,
                "evidence_ids": refs,
            }
        )
    artifact = obj(
        payload["document"],
        {
            "name",
            "sha256",
            "format",
            "pages",
            "max_pages",
            "rule_url",
            "rule_revision",
            "deadline",
        },
    )
    text(artifact["name"], 160)
    digest(artifact["sha256"])
    pages, maximum = (
        number(artifact["pages"], 1, 1000),
        number(artifact["max_pages"], 1, 1000),
    )
    if (
        not pages.is_integer()
        or not maximum.is_integer()
        or artifact["format"] not in ("deck", "paper")
    ):
        reject()
    issues = []
    if pages > maximum:
        issues.append("Declared page count exceeds the cited limit")
    if not official_url(artifact["rule_url"]) or not text(
        artifact["rule_revision"], 200, empty=True
    ):
        issues.append("Submission format rule is not referenced")
    if instant(artifact["deadline"]) <= at:
        issues.append("The recorded submission deadline has passed")
    gaps = sum(bool(row["issues"]) for row in checks) + bool(issues)
    return {
        "checks": checks,
        "document_issues": issues,
        "state": "NEEDS_EVIDENCE" if gaps else "READY_FOR_HUMAN_REVIEW",
        "summary": {
            "requirements": len(checks),
            "referenced": sum(row["state"] == "REFERENCED" for row in checks),
            "gaps": gaps,
        },
        "submission_receipt": None,
        "limits": [
            "Official pages were not fetched",
            "Document bytes and pagination need human verification",
            "Metadata checks do not establish legal eligibility, approval, compliance or portal submission",
        ],
    }


def run_suite(raw: str) -> dict[str, object]:
    """Execute one immutable input using a frozen evaluation clock."""
    document = obj(
        decode(raw),
        {
            "schema_version",
            "suite",
            "tenant_id",
            "mission_id",
            "evaluated_at",
            "rights",
            "parameters",
            "payload",
        },
    )
    if document["schema_version"] != INPUT_VERSION or document["suite"] not in (
        "maritime",
        "submission",
    ):
        reject("unsupported")
    identity(document["tenant_id"])
    identity(document["mission_id"])
    instant(document["evaluated_at"])
    analysis = (
        maritime(document) if document["suite"] == "maritime" else submission(document)
    )
    input_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    source_hash = source_fingerprint()
    leaves = [
        {"path": "input.json", "digest": input_hash},
        {"path": "analysis.json", "digest": sha256_json(analysis)},
        {"path": "engine-version", "digest": sha256_json(VERSION)},
        {"path": "source-manifest", "digest": source_hash},
    ]
    proof = {
        "root_algorithm": ROOT_ALGORITHM,
        "artifacts": leaves,
        "artifact_count": len(leaves),
        "root_digest": root_of(leaves),
        "authority": "evidence_only",
        "release_root": None,
    }
    return {
        "schema_version": RESULT_VERSION,
        "suite": document["suite"],
        "tenant_id": document["tenant_id"],
        "mission_id": document["mission_id"],
        "engine_version": VERSION,
        "evaluated_at": document["evaluated_at"],
        "input_sha256": input_hash,
        "source_sha256": source_hash,
        "analysis": analysis,
        "proof": proof,
        "release_state": "HOLD",
    }


def replay(raw: str, expected: dict[str, object]) -> dict[str, object]:
    """Compare the entire frozen result and report divergence without new authority."""
    actual = run_suite(raw)
    same = sha256_json(actual) == sha256_json(expected)
    return {
        "state": "MATCH" if same else "DIVERGED",
        "release_state": "HOLD",
        "input_sha256": actual["input_sha256"],
        "expected_sha256": sha256_json(expected),
        "actual_sha256": sha256_json(actual),
    }
