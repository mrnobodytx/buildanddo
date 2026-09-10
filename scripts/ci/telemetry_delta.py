#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/telemetry_delta.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/telemetry_snapshot.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/telemetry_snapshot.py; PRODUCES buildanddo.ci delta report
# Intent:      Say what a change did to the build, not just what the build measured.
# ───────────────────────────────────────────────────────────────
"""Compare a telemetry snapshot against a baseline snapshot.

Emits a delta report (JSON) plus a Markdown table suitable for a GitHub job
summary. Regressions are classified against per-metric thresholds so a two-byte
bundle drift is not treated like a 400 KB one. Gating is opt-in via
--fail-on-regression; the pipelines run it in report-only mode.
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path

# metric -> (absolute tolerance, relative tolerance, direction that is bad)
THRESHOLDS: dict[str, tuple[float, float, str]] = {
    "bundle.total_bytes": (100_000, 0.05, "up"),
    "bundle.gzip_bytes": (25_000, 0.02, "up"),
    "bundle.js_bytes": (75_000, 0.05, "up"),
    "bundle.largest_asset_bytes": (75_000, 0.05, "up"),
    "deps.direct_production": (0, 0.0, "up"),
    "deps.locked_packages": (25, 0.05, "up"),
    "lint.errors": (0, 0.0, "up"),
    "lint.warnings": (10, 0.10, "up"),
    "knip.unused_files": (0, 0.0, "up"),
    "knip.unused_dependencies": (0, 0.0, "up"),
    "tests.failed": (0, 0.0, "up"),
    "tests.total": (0, 0.0, "down"),
    "boundary.failures": (0, 0.0, "up"),
    "governance.findings_high": (0, 0.0, "up"),
    "governance.unwired_gates": (0, 0.0, "up"),
}

# Metrics that describe a single run rather than the state of the codebase.
NON_COMPARABLE = {
    "pipeline.runs",
    "pipeline.attempt",
    "pipeline.duration_seconds",
    "pipeline.succeeded",
    "change.files_changed",
    "change.lines_added",
    "change.lines_removed",
    "change.commits",
}

SUMMARY_ORDER = [
    "bundle.gzip_bytes",
    "bundle.total_bytes",
    "bundle.js_bytes",
    "bundle.css_bytes",
    "bundle.largest_asset_bytes",
    "bundle.file_count",
    "deps.direct_production",
    "deps.direct_development",
    "deps.locked_packages",
    "source.code_files",
    "source.code_lines",
    "lint.errors",
    "lint.warnings",
    "knip.unused_files",
    "knip.unused_dependencies",
    "tests.total",
    "tests.failed",
    "tests.duration_seconds",
    "governance.findings",
    "governance.findings_high",
    "governance.unwired_gates",
    "governance.srs_open",
]

BYTE_METRICS = {m for m in SUMMARY_ORDER if m.endswith("_bytes")}


def human(metric: str, value: float | None) -> str:
    if value is None:
        return "-"
    if metric in BYTE_METRICS or metric.endswith("_bytes"):
        step = float(value)
        for unit in ("B", "KB", "MB", "GB"):
            if abs(step) < 1024 or unit == "GB":
                return f"{step:.1f} {unit}" if unit != "B" else f"{int(step)} B"
            step /= 1024
    if float(value).is_integer():
        return str(int(value))
    return f"{float(value):.3f}"


def signed(metric: str, value: float) -> str:
    return ("+" if value > 0 else "") + human(metric, value)


def exceeds_tolerance(metric: str, delta: float, baseline: float) -> bool:
    """Both tolerances must be cleared, so tiny drift on a big number stays quiet."""
    abs_tol, rel_tol, _ = THRESHOLDS[metric]
    magnitude = abs(delta)
    if magnitude <= abs_tol:
        return False
    if rel_tol and baseline and magnitude / abs(baseline) <= rel_tol:
        return False
    return True


def classify(metric: str, delta: float, baseline: float) -> str | None:
    """Return 'regression', 'improvement', or None for movement below tolerance."""
    if metric not in THRESHOLDS or delta == 0:
        return None
    if not exceeds_tolerance(metric, delta, baseline):
        return None
    bad_direction = THRESHOLDS[metric][2]
    moved_up = delta > 0
    is_bad = moved_up if bad_direction == "up" else not moved_up
    return "regression" if is_bad else "improvement"


def compare(current: dict, baseline: dict | None) -> dict:
    cur_metrics = current.get("metrics") or {}
    base_metrics = (baseline or {}).get("metrics") or {}
    comparisons: dict[str, dict] = {}
    regressions: list[dict] = []
    improvements: list[dict] = []

    for metric in sorted(set(cur_metrics) | set(base_metrics)):
        if metric in NON_COMPARABLE:
            continue
        cur = cur_metrics.get(metric)
        base = base_metrics.get(metric)
        if not isinstance(cur, (int, float)) or not isinstance(base, (int, float)):
            continue
        delta = round(float(cur) - float(base), 6)
        pct = round((delta / float(base)) * 100.0, 3) if base else None
        entry = {"current": cur, "baseline": base, "delta": delta, "delta_pct": pct}
        comparisons[metric] = entry
        if delta == 0:
            continue
        record = {"metric": metric, **entry}
        verdict = classify(metric, delta, float(base))
        if verdict == "regression":
            regressions.append(record)
        elif verdict == "improvement":
            improvements.append(record)

    return {
        "schema_version": 1,
        "has_baseline": baseline is not None,
        "current_context": current.get("context") or {},
        "baseline_context": (baseline or {}).get("context") or {},
        "baseline_generated_at": (baseline or {}).get("generated_at"),
        "comparisons": comparisons,
        "regressions": regressions,
        "improvements": improvements,
        "metrics_compared": len(comparisons),
    }


def markdown(current: dict, report: dict) -> str:
    ctx = current.get("context") or {}
    metrics = current.get("metrics") or {}
    lines = ["## BuildAndDo CI telemetry", ""]
    lines.append(f"Pipeline `{ctx.get('pipeline','local')}` on `{ctx.get('branch') or 'unknown'}` at commit `{(ctx.get('commit_sha') or '')[:12]}`.")
    lines.append("")

    if not report["has_baseline"]:
        lines.append("No main-branch baseline was available, so absolute values are reported without deltas.")
        lines.append("")
    else:
        base_ctx = report.get("baseline_context") or {}
        lines.append(f"Baseline: commit `{(base_ctx.get('commit_sha') or '')[:12]}` from run `{base_ctx.get('run_id') or 'unknown'}`.")
        lines.append("")

    lines += ["| Metric | Current | Baseline | Delta | Change |", "| --- | ---: | ---: | ---: | ---: |"]
    for metric in SUMMARY_ORDER:
        if metric not in metrics and metric not in report["comparisons"]:
            continue
        cmp_entry = report["comparisons"].get(metric)
        current_value = metrics.get(metric, cmp_entry["current"] if cmp_entry else None)
        if cmp_entry:
            pct = cmp_entry["delta_pct"]
            pct_text = "-" if pct is None else f"{pct:+.2f}%"
            lines.append(
                f"| `{metric}` | {human(metric, current_value)} | {human(metric, cmp_entry['baseline'])} "
                f"| {signed(metric, cmp_entry['delta'])} | {pct_text} |"
            )
        else:
            lines.append(f"| `{metric}` | {human(metric, current_value)} | - | - | - |")

    change_keys = [k for k in ("change.files_changed", "change.lines_added", "change.lines_removed", "change.commits") if k in metrics]
    if change_keys:
        lines += ["", "Change size: " + ", ".join(f"{k.split('.')[1].replace('_', ' ')} {int(metrics[k])}" for k in change_keys) + "."]

    if report["regressions"]:
        lines += ["", "### Regressions against baseline", ""]
        for r in report["regressions"]:
            pct = "" if r["delta_pct"] is None else f" ({r['delta_pct']:+.2f}%)"
            lines.append(f"- `{r['metric']}` {human(r['metric'], r['baseline'])} -> {human(r['metric'], r['current'])}{pct}")
    elif report["has_baseline"]:
        lines += ["", "No threshold regressions against the main baseline."]

    if report["improvements"]:
        lines += ["", "### Improvements", ""]
        for i in report["improvements"]:
            lines.append(f"- `{i['metric']}` {human(i['metric'], i['baseline'])} -> {human(i['metric'], i['current'])}")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--current", required=True)
    ap.add_argument("--baseline", default="")
    ap.add_argument("--output", default="reports/telemetry/delta.json")
    ap.add_argument("--markdown-output", default="reports/telemetry/delta.md")
    ap.add_argument("--fail-on-regression", action="store_true")
    args = ap.parse_args()

    current = json.loads(Path(args.current).read_text(encoding="utf-8"))
    baseline = None
    if args.baseline:
        baseline_path = Path(args.baseline)
        if baseline_path.is_file():
            try:
                baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                print(f"WARN: baseline {args.baseline} is not valid JSON; comparing without it", file=sys.stderr)

    report = compare(current, baseline)
    summary = markdown(current, report)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    Path(args.markdown_output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.markdown_output).write_text(summary + "\n", encoding="utf-8")

    print(summary)
    for r in report["regressions"]:
        print(f"::warning title=CI telemetry regression::{r['metric']} {r['baseline']} -> {r['current']} ({r['delta']:+})")

    if report["regressions"] and args.fail_on_regression:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
