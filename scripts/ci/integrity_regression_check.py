#!/usr/bin/env python3
"""
integrity_regression_check.py - diff/hash/regression gate for buildanddo.com's web app.

Reuses candidate_manifest.py's per-file SHA256 hashing (don't duplicate it), adds:
  - a diff against the previous manifest (added/removed/changed files)
  - a build regression gate (apps/web must actually build)
  - a lint regression gate (non-fatal: recorded, doesn't fail the whole check)

Writes state/integrity/<utc-timestamp>.json and state/integrity/latest.json.
Never claims PASS without running the real build; "regression" is measured, not assumed.
"""
from __future__ import annotations
import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
NPM = shutil.which("npm") or "npm"  # Windows: bare "npm" is npm.cmd, unresolvable without shell=True
STATE_DIR = ROOT / "state" / "integrity"


def _run(cmd: list[str], cwd: Path, timeout: int = 300) -> dict:
    try:
        p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return {"returncode": p.returncode, "stdout_tail": p.stdout[-4000:], "stderr_tail": p.stderr[-4000:]}
    except subprocess.TimeoutExpired:
        return {"returncode": None, "reason": "TIMEOUT"}
    except Exception as exc:  # noqa: BLE001
        return {"returncode": None, "reason": f"{type(exc).__name__}: {exc}"}


def _load_manifest() -> dict:
    out_path = ROOT / "BUILDANDDO_CANDIDATE_PROVENANCE.json"
    r = _run([sys.executable, str(ROOT / "scripts" / "ci" / "candidate_manifest.py"),
              "--root", str(ROOT), "--output", "BUILDANDDO_CANDIDATE_PROVENANCE.json"], cwd=ROOT)
    manifest = json.loads(out_path.read_text(encoding="utf-8")) if out_path.is_file() else {}
    return {"run": r, "manifest": manifest}


def _diff_manifests(prev: dict, curr: dict) -> dict:
    prev_files = {f["path"]: f["sha256"] for f in (prev or {}).get("tracked_files", [])}
    curr_files = {f["path"]: f["sha256"] for f in (curr or {}).get("tracked_files", [])}
    added = sorted(set(curr_files) - set(prev_files))
    removed = sorted(set(prev_files) - set(curr_files))
    changed = sorted(p for p in (set(curr_files) & set(prev_files)) if curr_files[p] != prev_files[p])
    return {"added": added, "removed": removed, "changed": changed,
            "total_prev": len(prev_files), "total_curr": len(curr_files)}


def main() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    latest_path = STATE_DIR / "latest.json"
    prev = json.loads(latest_path.read_text(encoding="utf-8"))["manifest"] if latest_path.is_file() else {}

    hash_result = _load_manifest()
    diff = _diff_manifests(prev, hash_result["manifest"])

    # `npm run build --prefix apps/web` silently no-ops in this environment (npm workspace
    # quirk - doesn't resolve node_modules/.bin the same way). Run it FROM apps/web instead;
    # that's confirmed to actually invoke vite.
    web_dir = ROOT / "apps" / "web"
    dist_dir = ROOT / "dist" / "apps" / "web"
    # Measured 2026-09-07: vite left a stale-hashed bundle in place after a source edit that
    # should have produced different output - a real dep/output cache staleness bug in this
    # project's vite config, not a hypothetical. A clean dist forces a genuinely fresh build
    # every check; anything less risks silently deploying old code.
    shutil.rmtree(dist_dir, ignore_errors=True)
    build = _run([NPM, "run", "build"], cwd=web_dir, timeout=600)
    lint = _run([NPM, "run", "lint"], cwd=web_dir, timeout=180)

    build_ok = build.get("returncode") == 0

    # Lint was run, recorded, and then left OUT of the verdict: `state` and the exit
    # code were both computed from build_ok alone, so a tree with real lint violations
    # reported PASS and shipped. Measuring something and not letting it reach the
    # verdict is worse than not measuring it - it looks like coverage.
    #
    # eslint's exit codes are not a boolean: 0 = clean, 1 = violations it actually
    # found, anything else = it CRASHED and found nothing. Collapsing that to
    # `returncode == 0` turns a crash into "not ok" (indistinguishable from real
    # violations) - and the older `state` line turned it into PASS. A crash is
    # UNMEASURED: not a pass, and not evidence of violations either.
    lint_rc = lint.get("returncode")
    if lint_rc == 0:
        lint_state = "PASS"
    elif lint_rc == 1:
        lint_state = "FAIL"        # violations eslint genuinely found - blocks
    else:
        lint_state = "UNMEASURED"  # crash, timeout, missing binary - never a pass
    lint_ok = lint_state == "PASS"

    report = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "campaign_id": "citadel-21-day-2026-09",
        "hash_manifest_sha256": hash_result["manifest"].get("manifest_sha256"),
        "tracked_files": diff["total_curr"],
        "diff": diff,
        "build": {"ok": build_ok, "returncode": build.get("returncode"),
                   "stderr_tail": build.get("stderr_tail", ""), "reason": build.get("reason")},
        "lint": {"ok": lint_ok, "state": lint_state, "returncode": lint.get("returncode"),
                  "reason": lint.get("reason")},
        # PASS only when both were measured clean. HOLD when lint could not be
        # measured: the build is good but the tree is unproven, which is a fine thing
        # to put on STAGING for review and not a fine thing to promote.
        "state": ("FAIL" if not build_ok or lint_state == "FAIL"
                  else "PASS" if lint_state == "PASS" else "HOLD"),
        "manifest": hash_result["manifest"],  # persisted so the NEXT run can diff against it
    }
    ts_path = STATE_DIR / f"{report['generated_at'].replace(':', '').replace('.', '')}.json"
    ts_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    latest_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("state", "tracked_files", "build", "lint")}, indent=2))
    # Exit non-zero only on a real failure. An unmeasured lint is surfaced as HOLD in
    # the report rather than by failing the run, so it stops a promotion without
    # blocking the staging line it needs to be reviewed on.
    return 0 if (build_ok and lint_state != "FAIL") else 1


if __name__ == "__main__":
    raise SystemExit(main())
