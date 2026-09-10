#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/datadog_publish.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CI-001, SRS-BUILDANDDO-EPOCH-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/telemetry_snapshot.py, scripts/ci/telemetry_delta.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES scripts/ci/telemetry_snapshot.py; CONSUMES scripts/ci/telemetry_delta.py;
#              PRODUCES datadog.metrics.buildanddo_ci; PRODUCES datadog.events; PRODUCES datadog.logs
# Intent:      Ship CI telemetry to Datadog over the public intake APIs without adding dependencies.
# ───────────────────────────────────────────────────────────────
"""Publish BuildAndDo CI telemetry to Datadog.

Submits three signal types from one invocation:

  metrics  POST https://api.<site>/api/v2/series          gauges + deltas
  events   POST https://api.<site>/api/v1/events          one run summary
  logs     POST https://http-intake.logs.<site>/api/v2/logs  structured run record

Standard library only. Without DD_API_KEY the script prints SKIP and exits 0,
so pipelines stay green before the secret exists. Transport failures warn
rather than fail unless --strict is passed: observability must not be able to
break the build it is observing.
"""
from __future__ import annotations
import argparse, datetime as dt, json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

GAUGE = 3
COUNT = 1
DEFAULT_SITE = "us5.datadoghq.com"


def load(path: str | None) -> dict | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"WARN: {path} is not valid JSON; ignoring", file=sys.stderr)
        return None


def post(url: str, payload: dict | list, api_key: str, timeout: int = 20) -> tuple[bool, str]:
    body = json.dumps(payload).encode("utf-8")
    for attempt in range(3):
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "DD-API-KEY": api_key},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return True, f"{resp.status}"
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            if exc.code < 500 and exc.code != 429:
                return False, f"HTTP {exc.code}: {detail}"
            last = f"HTTP {exc.code}: {detail}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = str(exc)
        if attempt < 2:
            time.sleep(2 ** attempt)
    return False, last


def base_tags(args, context: dict) -> list[str]:
    pipeline = args.pipeline or context.get("pipeline") or "local"
    # Branch is deliberately collapsed for pull requests: per-branch metric tags
    # are unbounded cardinality. The real branch stays on the event and the log.
    # --branch exists for callers that publish without a telemetry snapshot: with
    # no context to read, a main-branch run would otherwise be tagged
    # branch:local, which is not low cardinality, just wrong.
    branch = args.branch or context.get("branch") or ""
    branch_tag = branch if pipeline == "main" and branch else "pull-request" if pipeline == "pr" else "local"
    tags = [
        f"service:{args.service}",
        f"env:{args.env}",
        f"pipeline:{pipeline}",
        f"branch:{branch_tag}",
        "source:github-actions",
    ]
    if context.get("repository"):
        tags.append(f"repository:{context['repository']}")
    if context.get("workflow"):
        tags.append(f"workflow:{context['workflow']}")
    if context.get("job_status"):
        tags.append(f"job_status:{context['job_status']}")
    tags += list(args.tag or [])
    return sorted(set(tags))


def build_series(args, snapshot: dict | None, delta: dict | None, tags: list[str], ts: int) -> list[dict]:
    series: list[dict] = []

    def add(name: str, value: float, extra_tags: list[str] | None = None,
            metric_type: int = GAUGE) -> None:
        point = {
            "metric": name,
            "type": metric_type,
            "points": [{"timestamp": ts, "value": float(value)}],
            "tags": sorted(set(tags + (extra_tags or []))),
            "resources": [{"name": args.service, "type": "service"}],
        }
        if metric_type == COUNT:
            # A count without an interval is rate-normalised by the backend and
            # then a "how many happened" question cannot be answered from it.
            point["interval"] = 60
        series.append(point)

    if snapshot:
        for metric, value in (snapshot.get("metrics") or {}).items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                add(f"{args.metric_prefix}.{metric}", value)

    if delta and delta.get("has_baseline"):
        for metric, entry in (delta.get("comparisons") or {}).items():
            add(f"{args.metric_prefix}.{metric}.delta", entry["delta"])
        add(f"{args.metric_prefix}.regressions", len(delta.get("regressions") or []))
        add(f"{args.metric_prefix}.improvements", len(delta.get("improvements") or []))

    for raw in args.metric or []:
        name, _, value = raw.partition("=")
        try:
            add(name.strip(), float(value))
        except ValueError:
            print(f"WARN: --metric {raw} is not name=number; skipped", file=sys.stderr)

    for raw in args.count or []:
        name, _, value = raw.partition("=")
        try:
            add(name.strip(), float(value), metric_type=COUNT)
        except ValueError:
            print(f"WARN: --count {raw} is not name=number; skipped", file=sys.stderr)

    return series


def build_event(args, snapshot: dict | None, delta: dict | None, tags: list[str], summary_md: str) -> dict | None:
    context = (snapshot or {}).get("context") or {}
    regressions = (delta or {}).get("regressions") or []
    status = (context.get("job_status") or "").lower()

    title = args.event_title
    text = args.event_text
    if not title and snapshot:
        sha = (context.get("commit_sha") or "")[:12]
        state = "regressions" if regressions else (status or "completed")
        title = f"BuildAndDo CI {context.get('pipeline', 'run')} {state} ({sha})"
    if not title:
        return None
    if not text:
        text = summary_md or json.dumps((snapshot or {}).get("metrics") or {}, indent=2, sort_keys=True)

    alert = args.alert_type
    if not alert:
        alert = "error" if status in {"failure", "cancelled"} else "warning" if regressions else "success"

    event_tags = list(tags)
    if context.get("branch"):
        event_tags.append(f"git_branch:{context['branch']}")
    if context.get("commit_sha"):
        event_tags.append(f"git_sha:{context['commit_sha'][:12]}")

    return {
        "title": title[:120],
        "text": f"%%%\n{text}\n%%%"[:4000],
        "alert_type": alert,
        "source_type_name": args.source_type_name,
        "aggregation_key": f"buildanddo-ci-{context.get('pipeline', 'run')}",
        "tags": sorted(set(event_tags)),
    }


def build_logs(args, snapshot: dict | None, delta: dict | None, tags: list[str]) -> list[dict]:
    if not snapshot and not args.log_message:
        return []
    context = (snapshot or {}).get("context") or {}
    regressions = (delta or {}).get("regressions") or []
    status = (context.get("job_status") or "").lower()
    level = "error" if status in {"failure", "cancelled"} else "warn" if regressions else "info"
    ddtags = ",".join(tags)

    record = {
        "ddsource": "github-actions",
        "ddtags": ddtags,
        "service": args.service,
        "hostname": "github-actions",
        "status": level,
        "message": args.log_message or (
            f"BuildAndDo CI {context.get('pipeline', 'run')} {status or 'completed'} "
            f"with {len(regressions)} regression(s)"
        ),
        "ci": context,
        "metrics": (snapshot or {}).get("metrics") or {},
        "top_assets": (snapshot or {}).get("top_assets") or [],
    }
    if delta:
        record["delta"] = {
            "has_baseline": delta.get("has_baseline"),
            "baseline_commit": (delta.get("baseline_context") or {}).get("commit_sha"),
            "metrics_compared": delta.get("metrics_compared"),
            "regressions": regressions,
            "improvements": delta.get("improvements") or [],
        }
    logs = [record]
    for r in regressions:
        logs.append({
            "ddsource": "github-actions",
            "ddtags": f"{ddtags},regression:{r['metric']}",
            "service": args.service,
            "hostname": "github-actions",
            "status": "warn",
            "message": f"CI telemetry regression: {r['metric']} {r['baseline']} -> {r['current']}",
            "ci": context,
            "regression": r,
        })
    return logs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshot", default="")
    ap.add_argument("--delta", default="")
    ap.add_argument("--summary-markdown", default="")
    ap.add_argument("--service", default="buildanddo-web")
    ap.add_argument("--env", default="ci")
    ap.add_argument("--pipeline", default="")
    ap.add_argument("--metric-prefix", default="buildanddo.ci")
    ap.add_argument("--metric", action="append", help="extra gauge as name=value, repeatable")
    ap.add_argument("--count", action="append",
                    help="extra count as name=value, repeatable (sums over time; use for occurrences)")
    ap.add_argument("--tag", action="append", help="extra tag as key:value, repeatable")
    ap.add_argument("--branch", default="",
                    help="branch tag override for callers publishing without a snapshot")
    ap.add_argument("--source-type-name", default="github",
                    help="Datadog event source (default github; use buildanddo for first-party events)")
    ap.add_argument("--event-title", default="")
    ap.add_argument("--event-text", default="")
    ap.add_argument("--alert-type", default="", choices=["", "info", "success", "warning", "error"])
    ap.add_argument("--log-message", default="")
    ap.add_argument("--no-events", action="store_true")
    ap.add_argument("--no-logs", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="print payloads instead of sending")
    ap.add_argument("--strict", action="store_true", help="exit non-zero when a submission fails")
    args = ap.parse_args()

    api_key = os.environ.get("DD_API_KEY", "").strip()
    site = (os.environ.get("DD_SITE") or DEFAULT_SITE).strip()
    for prefix in ("https://", "http://"):
        if site.startswith(prefix):
            site = site[len(prefix):]
    site = site.strip("/") or DEFAULT_SITE
    if not api_key and not args.dry_run:
        print("SKIP: DD_API_KEY is not configured; no telemetry published.")
        return 0

    snapshot = load(args.snapshot)
    delta = load(args.delta)
    summary_md = ""
    if args.summary_markdown and Path(args.summary_markdown).is_file():
        summary_md = Path(args.summary_markdown).read_text(encoding="utf-8")

    context = (snapshot or {}).get("context") or {}
    tags = base_tags(args, context)
    ts = int(dt.datetime.now(dt.timezone.utc).timestamp())

    series = build_series(args, snapshot, delta, tags, ts)
    event = None if args.no_events else build_event(args, snapshot, delta, tags, summary_md)
    logs = [] if args.no_logs else build_logs(args, snapshot, delta, tags)

    if args.dry_run:
        print(json.dumps({"site": site, "series": series, "event": event, "logs": logs}, indent=2, sort_keys=True))
        print(f"DRY RUN: {len(series)} metrics, {1 if event else 0} events, {len(logs)} logs", file=sys.stderr)
        return 0

    failures: list[str] = []
    if series:
        ok, detail = post(f"https://api.{site}/api/v2/series", {"series": series}, api_key)
        print(f"metrics: {len(series)} submitted -> {'ok' if ok else detail}")
        if not ok:
            failures.append(f"metrics: {detail}")
    if event:
        ok, detail = post(f"https://api.{site}/api/v1/events", event, api_key)
        print(f"event: {event['title']} -> {'ok' if ok else detail}")
        if not ok:
            failures.append(f"events: {detail}")
    if logs:
        ok, detail = post(f"https://http-intake.logs.{site}/api/v2/logs", logs, api_key)
        print(f"logs: {len(logs)} submitted -> {'ok' if ok else detail}")
        if not ok:
            failures.append(f"logs: {detail}")

    if failures:
        for f in failures:
            print(f"::warning title=Datadog submission failed::{f}")
        return 1 if args.strict else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
