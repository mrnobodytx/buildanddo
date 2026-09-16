#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/emit_datadog_metrics.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     state/, scripts/ci/datadog_publish.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES state/; PRODUCES datadog.metrics.citadel
# DAG Node:    buildanddo.citadel_telemetry
# Intent:      Project aggregate local Citadel assessment state into Datadog without exposing private records or making observability a build dependency.
# ───────────────────────────────────────────────────────────────
"""Emit aggregate Citadel operational state as best-effort Datadog metrics.

The public repository never owns private operational state. This collector
reads aggregate JSON projections already present on the runner, submits only
numbers and bounded provider/surface tags, and omits measurements whose source
is absent or malformed. It does not recurse through evidence or incident
records and does not send source documents to Datadog.

Conventional inputs below ``--state-dir`` are discovered automatically. Every
input also has an explicit CLI option so a private runner can bind its own
projection layout without copying state into this repository. A missing API
key, empty state, parse failure, or Datadog transport failure is a ``SKIP`` and
returns success: observability must not be able to break the build it observes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import cast

GAUGE = 3
COUNT = 1
DEFAULT_SITE = "us5.datadoghq.com"
BASE_TAGS = ("env:citadel", "service:buildanddo", "team:citadel-nexus")
PROVIDERS = ("hostinger", "cloudflare", "posthog", "discord", "elevenlabs")
SURFACES = ("wiki", "forum", "reddit", "interview")

JsonValue = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject = dict[str, JsonValue]

STATE_VALUES = {
    "PASS": 1.0,
    "OK": 1.0,
    "HEALTHY": 1.0,
    "CONNECTED": 1.0,
    "VERIFIED": 1.0,
    "READY": 1.0,
    "COMPLETE": 1.0,
    "COMPLETED": 1.0,
    "PRESENT": 1.0,
    "MEASURED": 1.0,
    "HOLD": 0.5,
    "DEGRADED": 0.5,
    "PARTIAL": 0.5,
    "PENDING": 0.5,
    "UNKNOWN": 0.5,
    "UNVERIFIED": 0.5,
    "WARN": 0.5,
    "WARNING": 0.5,
    "FAIL": 0.0,
    "FAILED": 0.0,
    "ERROR": 0.0,
    "DISCONNECTED": 0.0,
    "BLOCKED": 0.0,
    "ABSENT": 0.0,
}


@dataclass(frozen=True)
class Metric:
    """Describe one bounded-cardinality Datadog series."""

    name: str
    value: float
    metric_type: int = GAUGE
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class Sources:
    """Name the local aggregate projections used for one collection."""

    assessments: tuple[Path, ...]
    fleet: Path | None = None
    incidents: Path | None = None
    surface_proof: Path | None = None
    evidence: Path | None = None
    content: Path | None = None
    provider_state: Path | None = None


def _warn(message: str) -> None:
    print(f"SKIP: {message}", file=sys.stderr)


def _load_json(path: Path | None) -> JsonObject | None:
    if path is None:
        return None
    try:
        raw: object = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _warn(f"{path.name} is invalid JSON at line {exc.lineno}, column {exc.colno}")
        return None
    except (OSError, UnicodeError) as exc:
        _warn(f"cannot read {path.name} ({type(exc).__name__})")
        return None
    if not isinstance(raw, dict) or not all(isinstance(key, str) for key in raw):
        _warn(f"{path.name} is not a JSON object")
        return None
    return cast(JsonObject, raw)


def _mapping(value: JsonValue) -> JsonObject | None:
    return value if isinstance(value, dict) else None


def _number(value: JsonValue) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _nested_number(document: JsonObject, *paths: tuple[str, ...]) -> float | None:
    for path in paths:
        current: JsonValue = document
        for part in path:
            mapping = _mapping(current)
            if mapping is None or part not in mapping:
                break
            current = mapping[part]
        else:
            value = _number(current)
            if value is not None:
                return value
    return None


def state_value(value: JsonValue) -> float | None:
    """Map a projected operational state to its Datadog gauge value."""

    if isinstance(value, str):
        return STATE_VALUES.get(value.strip().upper())
    if isinstance(value, dict):
        for key in ("assessment_state", "state", "status"):
            if key in value:
                mapped = state_value(value[key])
                if mapped is not None:
                    return mapped
    return _number(value)


def _first_existing(explicit: str, candidates: tuple[Path, ...]) -> Path | None:
    if explicit:
        path = Path(explicit)
        if path.is_file():
            return path
        _warn(f"configured input does not exist: {path.name}")
        return None
    return next((path for path in candidates if path.is_file()), None)


def discover_sources(args: argparse.Namespace) -> Sources:
    """Resolve explicit inputs and conventional private-runner projections."""

    state_dir = Path(args.state_dir)
    if args.assessment_fragment:
        assessments = tuple(
            path for raw in args.assessment_fragment if (path := Path(raw)).is_file()
        )
        for raw in args.assessment_fragment:
            if not Path(raw).is_file():
                _warn(
                    f"configured assessment fragment does not exist: {Path(raw).name}"
                )
    else:
        preferred = (
            state_dir / "system_assessment" / "latest.json",
            state_dir / "system_assessment.latest.json",
            state_dir / "system_assessment.json",
            state_dir / "assessment" / "latest.json",
            state_dir / "assessment.latest.json",
        )
        discovered = {
            *[path for path in preferred if path.is_file()],
            *state_dir.glob("*assessment*.json"),
            *state_dir.glob("system_assessment/*.json"),
            *state_dir.glob("system_assessment/fragments/*.json"),
        }
        assessments = tuple(sorted(discovered))

    return Sources(
        assessments=assessments,
        fleet=_first_existing(
            args.fleet_manifest,
            (
                state_dir / "fleet" / "manifest.latest.json",
                state_dir / "fleet" / "manifest.json",
                state_dir / "fleet_manifest.latest.json",
                state_dir / "fleet_manifest.json",
            ),
        ),
        incidents=_first_existing(
            args.incident_index,
            (
                state_dir / "incidents" / "index.latest.json",
                state_dir / "incidents" / "index.json",
            ),
        ),
        surface_proof=_first_existing(
            args.surface_proof,
            (
                state_dir / "surface_proof" / "latest.json",
                state_dir / "surface_proof.latest.json",
                state_dir / "surface-proof.latest.json",
            ),
        ),
        evidence=_first_existing(
            args.evidence_index,
            (
                state_dir / "evidence" / "index.latest.json",
                state_dir / "evidence" / "index.json",
            ),
        ),
        content=_first_existing(
            args.content_state,
            (
                state_dir / "content" / "publish-plan.latest.json",
                state_dir / "content" / "publish_plan.latest.json",
                state_dir / "content" / "status.latest.json",
                state_dir / "failure_content" / "publish-plan.latest.json",
            ),
        ),
        provider_state=_first_existing(
            args.provider_state,
            (
                state_dir / "providers" / "status.latest.json",
                state_dir / "providers.latest.json",
            ),
        ),
    )


def _assessment_metrics(documents: list[JsonObject]) -> list[Metric]:
    metrics: list[Metric] = []
    states = [
        mapped
        for document in documents
        if (
            mapped := state_value(
                document.get("assessment_state", document.get("state"))
            )
        )
        is not None
    ]
    if states:
        metrics.append(Metric("citadel.system_assessment.state", min(states)))

    for field, name in (
        ("sessions_blocked", "citadel.governance.sessions_blocked"),
        ("sessions_completed", "citadel.governance.sessions_completed"),
    ):
        values = [
            value
            for document in documents
            if (
                value := _nested_number(
                    document,
                    ("governance", field),
                    ("agent_authorization", field),
                    (field,),
                )
            )
            is not None
        ]
        if values:
            metrics.append(Metric(name, sum(values), COUNT))
    return metrics


def _provider_metrics(documents: list[JsonObject]) -> list[Metric]:
    observed: dict[str, list[float]] = {provider: [] for provider in PROVIDERS}
    for document in documents:
        containers: list[JsonObject | list[JsonValue]] = []
        for key in ("providers", "provider_states", "integrations", "platforms"):
            value = document.get(key)
            if isinstance(value, (dict, list)):
                containers.append(value)
        for container in containers:
            if isinstance(container, dict):
                for identifier, value in container.items():
                    normalized = (
                        identifier.strip().lower().replace("_", "").replace("-", "")
                    )
                    for provider in PROVIDERS:
                        if (
                            normalized == provider
                            and (mapped := state_value(value)) is not None
                        ):
                            observed[provider].append(mapped)
            else:
                for entry in container:
                    if not isinstance(entry, dict):
                        continue
                    raw_identifier = entry.get(
                        "id", entry.get("provider", entry.get("name"))
                    )
                    if not isinstance(raw_identifier, str):
                        continue
                    provider = (
                        raw_identifier.strip().lower().replace("_", "").replace("-", "")
                    )
                    for expected in PROVIDERS:
                        if (
                            provider == expected
                            and (mapped := state_value(entry)) is not None
                        ):
                            observed[expected].append(mapped)

    return [
        Metric("citadel.provider.state", min(values), tags=(f"provider:{provider}",))
        for provider, values in observed.items()
        if values
    ]


def _fleet_metrics(document: JsonObject | None) -> list[Metric]:
    if document is None:
        return []
    metrics: list[Metric] = []
    hosts = _nested_number(
        document, ("totals", "hosts"), ("fleet_totals", "hosts"), ("hosts_count",)
    )
    running = _nested_number(
        document,
        ("totals", "containers_running"),
        ("fleet_totals", "containers_running"),
        ("containers_running",),
    )
    if hosts is None and isinstance(document.get("hosts"), list):
        hosts = float(len(cast(list[JsonValue], document["hosts"])))
    if hosts is not None:
        metrics.append(Metric("citadel.fleet.hosts", hosts))
    if running is not None:
        metrics.append(Metric("citadel.fleet.containers_running", running))
    return metrics


def _incident_metrics(document: JsonObject | None) -> list[Metric]:
    if document is None:
        return []
    total = _nested_number(
        document, ("incident_count",), ("total",), ("counts", "total")
    )
    high = _nested_number(
        document,
        ("relevance_counts", "HIGH"),
        ("relevance_counts", "high"),
        ("counts", "high_relevance"),
        ("high_relevance",),
    )
    metrics: list[Metric] = []
    if total is not None:
        metrics.append(Metric("citadel.incidents.total", total))
    if high is not None:
        metrics.append(Metric("citadel.incidents.high_relevance", high))
    return metrics


def _surface_metrics(document: JsonObject | None) -> list[Metric]:
    if document is None:
        return []
    metrics: list[Metric] = []
    state = state_value(document.get("proof_state", document.get("state")))
    writes = _nested_number(
        document,
        ("verified_writes",),
        ("verified_external_writes",),
        ("writes", "verified"),
    )
    if state is not None:
        metrics.append(
            Metric("citadel.surface_proof.state", 1.0 if state == 1.0 else 0.0)
        )
    if writes is not None:
        metrics.append(Metric("citadel.surface_proof.verified_writes", writes))
    return metrics


def _evidence_metrics(document: JsonObject | None) -> list[Metric]:
    if document is None:
        return []
    verified = _nested_number(
        document,
        ("verified_count",),
        ("counts", "verified"),
        ("summary", "verified_count"),
    )
    held = _nested_number(
        document,
        ("held_count",),
        ("counts", "held"),
        ("counts", "hold"),
        ("summary", "held_count"),
    )
    metrics: list[Metric] = []
    if verified is not None:
        metrics.append(Metric("citadel.evidence.verified_count", verified))
    if held is not None:
        metrics.append(Metric("citadel.evidence.held_count", held))
    return metrics


def _content_metrics(document: JsonObject | None) -> list[Metric]:
    if document is None or not isinstance(document.get("drafts"), dict):
        return []
    drafts = cast(JsonObject, document["drafts"])
    metrics: list[Metric] = []
    for surface in SURFACES:
        value = _number(drafts.get(surface, 0))
        if value is not None:
            metrics.append(
                Metric(
                    "citadel.content.drafts_pending",
                    value,
                    tags=(f"surface:{surface}",),
                )
            )
    return metrics


def collect_metrics(sources: Sources) -> list[Metric]:
    """Collect aggregate metrics from available source projections."""

    assessments = [
        document for path in sources.assessments if (document := _load_json(path))
    ]
    provider_documents = list(assessments)
    if (provider_state := _load_json(sources.provider_state)) is not None:
        provider_documents.append(provider_state)

    return [
        *_assessment_metrics(assessments),
        *_fleet_metrics(_load_json(sources.fleet)),
        *_incident_metrics(_load_json(sources.incidents)),
        *_surface_metrics(_load_json(sources.surface_proof)),
        *_evidence_metrics(_load_json(sources.evidence)),
        *_provider_metrics(provider_documents),
        *_content_metrics(_load_json(sources.content)),
    ]


def build_series(
    metrics: list[Metric], timestamp: int, extra_tags: tuple[str, ...] = ()
) -> list[dict[str, object]]:
    """Build a Datadog v2 series payload from collected metrics."""

    series: list[dict[str, object]] = []
    for metric in metrics:
        point: dict[str, object] = {
            "metric": metric.name,
            "type": metric.metric_type,
            "points": [{"timestamp": timestamp, "value": metric.value}],
            "tags": sorted(set((*BASE_TAGS, *extra_tags, *metric.tags))),
            "resources": [{"name": "buildanddo", "type": "service"}],
        }
        if metric.metric_type == COUNT:
            point["interval"] = 3600
        series.append(point)
    return series


def _site(value: str) -> str:
    site = value.strip()
    for prefix in ("https://", "http://"):
        if site.startswith(prefix):
            site = site[len(prefix) :]
    return site.strip("/") or DEFAULT_SITE


def submit_series(
    series: list[dict[str, object]], api_key: str, site: str, timeout: int
) -> tuple[bool, str]:
    """Submit one metrics batch without retrying inside the CI time budget."""

    request = urllib.request.Request(
        f"https://api.{_site(site)}/api/v2/series",
        data=json.dumps({"series": series}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "DD-API-KEY": api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return True, str(response.status)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        return False, f"HTTP {exc.code}: {detail}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return False, str(exc)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state-dir", default=os.environ.get("CITADEL_STATE_DIR", "state")
    )
    parser.add_argument("--assessment-fragment", action="append", default=[])
    parser.add_argument(
        "--fleet-manifest", default=os.environ.get("CITADEL_FLEET_MANIFEST", "")
    )
    parser.add_argument(
        "--incident-index", default=os.environ.get("CITADEL_INCIDENT_INDEX", "")
    )
    parser.add_argument(
        "--surface-proof", default=os.environ.get("CITADEL_SURFACE_PROOF", "")
    )
    parser.add_argument(
        "--evidence-index", default=os.environ.get("CITADEL_EVIDENCE_INDEX", "")
    )
    parser.add_argument(
        "--content-state", default=os.environ.get("CITADEL_CONTENT_STATE", "")
    )
    parser.add_argument(
        "--provider-state", default=os.environ.get("CITADEL_PROVIDER_STATE", "")
    )
    parser.add_argument("--tag", action="append", default=[])
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def run(argv: list[str] | None = None) -> int:
    """Collect and optionally submit the current aggregate projections."""

    args = _parser().parse_args(argv)
    metrics = collect_metrics(discover_sources(args))
    timestamp = int(dt.datetime.now(dt.timezone.utc).timestamp())
    series = build_series(metrics, timestamp, tuple(args.tag))

    if args.dry_run:
        print(json.dumps({"series": series}, indent=2, sort_keys=True))
        print(
            f"DRY RUN: {len(series)} metrics; no Datadog request made", file=sys.stderr
        )
        return 0
    if not series:
        print("SKIP: no aggregate Citadel state was available; no Datadog request made")
        return 0

    api_key = os.environ.get("DD_API_KEY", "").strip()
    if not api_key:
        print(
            f"SKIP: DD_API_KEY is not configured; collected {len(series)} metrics but sent none"
        )
        return 0

    ok, detail = submit_series(
        series, api_key, os.environ.get("DD_SITE", DEFAULT_SITE), args.timeout
    )
    if not ok:
        print(f"SKIP: Datadog metrics submission failed: {detail}", file=sys.stderr)
        return 0
    print(f"PASS: submitted {len(series)} Citadel metrics to Datadog ({detail})")
    return 0


def main() -> int:
    """Keep all collector failures non-fatal at the process boundary."""

    try:
        return run()
    except Exception as exc:  # pragma: no cover - final fail-safe for CI observability
        print(
            f"SKIP: Citadel metric collector failed ({type(exc).__name__})",
            file=sys.stderr,
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
