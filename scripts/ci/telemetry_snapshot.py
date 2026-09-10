#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/telemetry_snapshot.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/verify_public_boundary.py
# EnumType:    Service
# EnumEdges:   PRODUCES buildanddo.ci telemetry snapshot; CONSUMES dist/apps/web
# Intent:      Turn one pipeline run into a comparable, machine-readable telemetry snapshot.
# ───────────────────────────────────────────────────────────────
"""Collect a BuildAndDo CI telemetry snapshot.

Reads the build output, the dependency graph, the tracked source tree and any
static-analysis or test reports produced by the pipeline, and writes a single
JSON snapshot. Snapshots from two runs are directly comparable, which is what
scripts/ci/telemetry_delta.py consumes.

Standard library only, and every collector is best-effort: a missing report
degrades that metric group to absent rather than failing the pipeline.
"""
from __future__ import annotations
import argparse, datetime as dt, gzip, json, os, subprocess, sys
import xml.etree.ElementTree as ET
from pathlib import Path

CODE_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".py", ".go", ".sh", ".sql"}
COMPRESSIBLE_EXT = {".js", ".mjs", ".css", ".html", ".json", ".svg", ".txt", ".map"}
JS_EXT = {".js", ".mjs", ".cjs"}


def git(root: Path, *args: str) -> str:
    p = subprocess.run(["git", "-C", str(root), *args], text=True, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or f"git {' '.join(args)} failed")
    return p.stdout.strip()


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def bundle_metrics(dist: Path) -> dict[str, float]:
    if not dist.is_dir():
        return {}
    total = js = css = html = other = gzipped = largest = 0
    files = chunks = 0
    assets: list[tuple[int, str]] = []
    for p in sorted(dist.rglob("*")):
        if not p.is_file():
            continue
        size = p.stat().st_size
        ext = p.suffix.lower()
        files += 1
        total += size
        largest = max(largest, size)
        assets.append((size, p.relative_to(dist).as_posix()))
        if ext in JS_EXT:
            js += size
            chunks += 1
        elif ext == ".css":
            css += size
        elif ext in {".html", ".htm"}:
            html += size
        else:
            other += size
        if ext in COMPRESSIBLE_EXT and size <= 20_000_000:
            try:
                gzipped += len(gzip.compress(p.read_bytes(), 6))
            except Exception:
                pass
    metrics = {
        "bundle.total_bytes": total,
        "bundle.js_bytes": js,
        "bundle.css_bytes": css,
        "bundle.html_bytes": html,
        "bundle.other_bytes": other,
        "bundle.gzip_bytes": gzipped,
        "bundle.file_count": files,
        "bundle.js_chunk_count": chunks,
        "bundle.largest_asset_bytes": largest,
    }
    metrics["_top_assets"] = [{"path": rel, "bytes": size} for size, rel in sorted(assets, reverse=True)[:10]]
    return metrics


def dependency_metrics(root: Path) -> dict[str, float]:
    out: dict[str, float] = {}
    direct_prod = direct_dev = 0
    manifests = [root / "package.json"] + sorted(root.glob("apps/*/package.json"))
    workspaces = 0
    for manifest in manifests:
        data = load_json(manifest)
        if not isinstance(data, dict):
            continue
        if manifest != root / "package.json":
            workspaces += 1
        direct_prod += len(data.get("dependencies") or {})
        direct_dev += len(data.get("devDependencies") or {})
    lock = load_json(root / "package-lock.json")
    if isinstance(lock, dict):
        packages = lock.get("packages")
        if isinstance(packages, dict):
            out["deps.locked_packages"] = len([k for k in packages if k])
    out["deps.direct_production"] = direct_prod
    out["deps.direct_development"] = direct_dev
    out["deps.workspaces"] = workspaces
    return out


def source_metrics(root: Path) -> dict[str, float]:
    try:
        tracked = [x for x in git(root, "ls-files").splitlines() if x.strip()]
    except RuntimeError:
        return {}
    code_files = code_lines = 0
    for rel in tracked:
        p = root / rel
        if p.suffix.lower() not in CODE_EXT or not p.is_file():
            continue
        try:
            code_lines += p.read_text(encoding="utf-8", errors="replace").count("\n") + 1
        except Exception:
            continue
        code_files += 1
    return {
        "source.tracked_files": len(tracked),
        "source.code_files": code_files,
        "source.code_lines": code_lines,
    }


def change_metrics(root: Path, base_ref: str) -> dict[str, float]:
    """Size of this change against its merge base - the only inherently relative signal."""
    try:
        base = git(root, "merge-base", base_ref, "HEAD")
        numstat = git(root, "diff", "--numstat", f"{base}..HEAD")
        commits = git(root, "rev-list", "--count", f"{base}..HEAD")
    except RuntimeError:
        return {}
    added = removed = changed = 0
    for line in numstat.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        changed += 1
        if parts[0].isdigit():
            added += int(parts[0])
        if parts[1].isdigit():
            removed += int(parts[1])
    return {
        "change.files_changed": changed,
        "change.lines_added": added,
        "change.lines_removed": removed,
        "change.commits": int(commits) if commits.isdigit() else 0,
    }


def test_metrics(junit_dir: Path) -> dict[str, float]:
    if not junit_dir.is_dir():
        return {}
    reports = sorted(junit_dir.rglob("*.xml"))
    if not reports:
        return {}
    total = failed = skipped = 0
    duration = 0.0
    for report in reports:
        try:
            tree = ET.parse(report)
        except Exception:
            continue
        for case in tree.iter("testcase"):
            total += 1
            try:
                duration += float(case.get("time") or 0.0)
            except ValueError:
                pass
            if case.find("failure") is not None or case.find("error") is not None:
                failed += 1
            elif case.find("skipped") is not None:
                skipped += 1
    return {
        "tests.total": total,
        "tests.failed": failed,
        "tests.skipped": skipped,
        "tests.passed": total - failed - skipped,
        "tests.duration_seconds": round(duration, 3),
        "tests.report_files": len(reports),
    }


def eslint_metrics(report: Path) -> dict[str, float]:
    data = load_json(report)
    if not isinstance(data, list):
        return {}
    errors = warnings = files_with_findings = 0
    for entry in data:
        if not isinstance(entry, dict):
            continue
        e = int(entry.get("errorCount") or 0)
        w = int(entry.get("warningCount") or 0)
        errors += e
        warnings += w
        if e or w:
            files_with_findings += 1
    return {
        "lint.errors": errors,
        "lint.warnings": warnings,
        "lint.files_with_findings": files_with_findings,
        "lint.files_scanned": len(data),
    }


def knip_metrics(report: Path) -> dict[str, float]:
    """knip's JSON shape varies by version, so count defensively rather than assume."""
    data = load_json(report)
    if data is None:
        return {}
    unused_files = 0
    buckets = {"dependencies": 0, "devDependencies": 0, "exports": 0, "types": 0, "unlisted": 0}
    issues = data.get("issues") if isinstance(data, dict) else data
    if isinstance(data, dict) and isinstance(data.get("files"), list):
        unused_files = len(data["files"])
    if isinstance(issues, list):
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            if issue.get("files") is True:
                unused_files += 1
            for key in buckets:
                value = issue.get(key)
                if isinstance(value, list):
                    buckets[key] += len(value)
                elif isinstance(value, dict):
                    buckets[key] += len(value)
    return {
        "knip.unused_files": unused_files,
        "knip.unused_dependencies": buckets["dependencies"] + buckets["devDependencies"],
        "knip.unused_exports": buckets["exports"] + buckets["types"],
        "knip.unlisted_dependencies": buckets["unlisted"],
    }


def boundary_metrics(report: Path) -> dict[str, float]:
    data = load_json(report)
    if not isinstance(data, dict):
        return {}
    return {
        "boundary.files_checked": int(data.get("files_checked") or 0),
        "boundary.failures": len(data.get("failures") or []),
        "boundary.passed": 1 if data.get("state") == "PASS" else 0,
    }


def pipeline_metrics(started_at: str | None, status: str | None, now: dt.datetime) -> dict[str, float]:
    out: dict[str, float] = {"pipeline.runs": 1}
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT")
    if attempt and attempt.isdigit():
        out["pipeline.attempt"] = int(attempt)
    if started_at:
        try:
            start = dt.datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            out["pipeline.duration_seconds"] = max(0.0, round((now - start).total_seconds(), 3))
        except ValueError:
            pass
    if status:
        out["pipeline.succeeded"] = 1 if status.lower() == "success" else 0
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument("--dist", default="dist/apps/web")
    ap.add_argument("--junit-dir", default="reports/junit")
    ap.add_argument("--eslint-report", default="reports/eslint.json")
    ap.add_argument("--knip-report", default="reports/knip.json")
    ap.add_argument("--boundary-report", default=".buildanddo/public/boundary-report.json")
    ap.add_argument("--base-ref", default="", help="ref to diff against for change-size metrics")
    ap.add_argument("--pipeline", default="local", help="pr | main | local")
    ap.add_argument("--pipeline-started-at", default="", help="ISO-8601 workflow run start")
    ap.add_argument("--job-status", default="")
    ap.add_argument("--output", default="reports/telemetry/snapshot.json")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    now = dt.datetime.now(dt.timezone.utc)

    metrics: dict[str, float] = {}
    metrics.update(bundle_metrics(root / args.dist))
    metrics.update(dependency_metrics(root))
    metrics.update(source_metrics(root))
    metrics.update(test_metrics(root / args.junit_dir))
    metrics.update(eslint_metrics(root / args.eslint_report))
    metrics.update(knip_metrics(root / args.knip_report))
    metrics.update(boundary_metrics(root / args.boundary_report))
    metrics.update(pipeline_metrics(args.pipeline_started_at or None, args.job_status or None, now))
    if args.base_ref:
        metrics.update(change_metrics(root, args.base_ref))

    top_assets = metrics.pop("_top_assets", [])

    try:
        sha = git(root, "rev-parse", "HEAD")
    except RuntimeError:
        sha = ""

    snapshot = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "context": {
            "pipeline": args.pipeline,
            "commit_sha": os.environ.get("GITHUB_SHA") or sha,
            "branch": os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME") or "",
            "repository": os.environ.get("GITHUB_REPOSITORY") or "",
            "workflow": os.environ.get("GITHUB_WORKFLOW") or "",
            "run_id": os.environ.get("GITHUB_RUN_ID") or "",
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT") or "",
            "event": os.environ.get("GITHUB_EVENT_NAME") or "",
            "actor": os.environ.get("GITHUB_ACTOR") or "",
            "job_status": args.job_status,
        },
        "metrics": {k: v for k, v in sorted(metrics.items())},
        "top_assets": top_assets,
    }

    out = root / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"telemetry snapshot: {len(snapshot['metrics'])} metrics -> {args.output}", file=sys.stderr)
    print(json.dumps(snapshot["metrics"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
