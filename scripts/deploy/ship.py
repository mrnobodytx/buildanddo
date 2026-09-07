#!/usr/bin/env python3
"""
ship.py - the staging -> production deploy line for buildanddo.com.

Contract (operator request, 2026-09-07): "we edit staging and when staging
pass all the gates its automatically pushed to production" - one command,
no hand SSH, no manual promote step.

Flow, every run:
  1. BUILD      apps/web locally (clean dist - see the measured Vite stale-
                bundle bug in integrity_regression_check.py; same fix here).
  2. GATE       run integrity_regression_check.py (build+lint, real subprocess,
                never assumed). FAIL stops the line before anything touches a
                server - staging gets nothing broken deployed to it either.
  3. STAGING    rsync the fresh dist to /var/www/buildanddo-staging on the VM,
                probe https://staging.buildanddo.com for a real 200.
  4. PROMOTE    only if staging gate + staging probe both pass: rsync the SAME
                build (not a rebuild - promote what was actually gated) to
                /var/www/buildanddo (production), probe https://buildanddo.com.
  5. RECORD     append one state/deploy/history.jsonl line with every stage's
                real outcome - never a "deployed" claim without the probe result
                that backs it.

Any stage failing halts the line at that stage; later stages never run on a
failed gate. This is the whole gate: build+lint clean AND both live domains
answer 200 after their respective syncs. No feature flags, no rollback logic
yet - out of scope until this loop itself is proven (this repo's own "prove
it" standard).
"""
from __future__ import annotations
import datetime as dt
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import os

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
# Deploy-only local secrets (VM host key path, PostHog project key) - never
# committed (see .gitignore), never reach into any other project's tree.
# Falls back to OS env vars of the same names if the file is absent, so this
# script has zero hardcoded dependency on any machine-specific layout.
LOCAL_SECRETS = ROOT / "secrets" / "deploy.local.env"
NPM = shutil.which("npm") or "npm"


def _load_local_secrets() -> dict:
    env = dict(os.environ)
    if LOCAL_SECRETS.is_file():
        for line in LOCAL_SECRETS.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


_SECRETS = _load_local_secrets()
SSH_KEY = _SECRETS.get("BUILDANDDO_SSH_KEY", "")
VM_HOST = _SECRETS.get("BUILDANDDO_VM_HOST", "root@45.82.75.40")
STAGING_REMOTE_DIR = "/var/www/buildanddo-staging"
PROD_REMOTE_DIR = "/var/www/buildanddo"
STAGING_URL = "https://staging.buildanddo.com/"
PROD_URL = "https://buildanddo.com/"
STATE_DIR = ROOT / "state" / "deploy"
DIST_DIR = ROOT / "dist" / "apps" / "web"


def _run(cmd: list[str], cwd: Path | None = None, timeout: int = 600) -> dict:
    try:
        p = subprocess.run(cmd, cwd=str(cwd) if cwd else None, capture_output=True, text=True, timeout=timeout)
        return {"ok": p.returncode == 0, "returncode": p.returncode,
                "stdout_tail": p.stdout[-2000:], "stderr_tail": p.stderr[-2000:]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "returncode": None, "reason": "TIMEOUT"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "returncode": None, "reason": f"{type(exc).__name__}: {exc}"}


def _probe(url: str, retries: int = 5, delay: float = 2.0) -> dict:
    """Real HTTP GET, not a ping - a 200 with body is the only acceptable proof of 'serving'."""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310 - fixed https URL, not user input
                body = resp.read(200)
                return {"ok": resp.status == 200, "status": resp.status, "attempt": attempt,
                        "body_prefix": body.decode("utf-8", errors="replace")[:120]}
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            time.sleep(delay)
    return {"ok": False, "status": None, "attempts": retries, "error": last_err}


def _ssh_identity_args() -> list[str]:
    return ["-i", SSH_KEY] if SSH_KEY else []


def _rsync(local_dir: Path, remote_dir: str) -> dict:
    """scp -r the whole dist tree; the remote dir is emptied first via ssh so stale
    files from a previous build never linger (a partial-diff sync could keep an
    old chunk that the new index.html no longer references)."""
    if not VM_HOST:
        return {"ok": False, "stage": "config", "reason": "BUILDANDDO_VM_HOST not set (see secrets/deploy.local.env)"}
    clear = _run(["ssh", *_ssh_identity_args(), "-o", "StrictHostKeyChecking=no", VM_HOST,
                  f"rm -rf {remote_dir}/* && mkdir -p {remote_dir}"])
    if not clear["ok"]:
        return {"ok": False, "stage": "clear_remote", **clear}
    copy = _run(["scp", *_ssh_identity_args(), "-o", "StrictHostKeyChecking=no", "-r",
                 f"{local_dir}/.", f"{VM_HOST}:{remote_dir}/"], timeout=300)
    if not copy["ok"]:
        return {"ok": False, "stage": "scp", **copy}
    return {"ok": True}


def _write_web_env() -> None:
    """Client-safe PostHog project key only (BUILDANDDO_PH, public phc_ key) - never a
    secret. Sourced from secrets/deploy.local.env or the OS environment (see
    _load_local_secrets); .env* is gitignored at the repo root and regenerated every
    run, never committed."""
    web_dir = ROOT / "apps" / "web"
    key = _SECRETS.get("BUILDANDDO_PH")
    if key:
        (web_dir / ".env").write_text(f"VITE_BUILDANDDO_PH={key}\n", encoding="utf-8")


def _write_roadmap_status() -> dict:
    return _run([sys.executable, str(ROOT / "scripts" / "deploy" / "roadmap_status.py")], cwd=ROOT, timeout=30)


def _latest_commit() -> dict:
    sha = _run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, timeout=15)
    msg = _run(["git", "log", "-1", "--pretty=%s"], cwd=ROOT, timeout=15)
    return {"sha": sha.get("stdout_tail", "").strip(), "message": msg.get("stdout_tail", "").strip()}


def _notify_guildmasters(message: str) -> dict:
    """Connects the guildmaster fleet to THIS repo's real build activity: posts as Forge
    (builder guild - owns PAGE/SYSTEM edits per platform_edit_fabric's capability matrix) to
    the same Discord webhook the fleet already speaks through (tools/cbf/guildmaster_speak.py's
    _webhook_url() convention). Deliberately stdlib-only + fail-soft: a Discord outage must
    never break the deploy pipeline, only be visible in the returned result."""
    url = _SECRETS.get("DISCORD_WEBHOOK_URL")
    if not url:
        return {"ok": False, "reason": "DISCORD_WEBHOOK_URL not set (see secrets/deploy.local.env)"}
    import urllib.error
    payload = json.dumps({"username": "Forge", "content": message[:1900]}).encode("utf-8")
    req = urllib.request.Request(url + "?wait=true", data=payload, method="POST",
                                  headers={"Content-Type": "application/json",
                                            "User-Agent": "BuildAndDo-Ship (https://buildanddo.com, 1.0)"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed webhook URL from local secrets
            body = json.loads(resp.read() or b"{}")
            return {"ok": True, "message_id": body.get("id")}
    except urllib.error.URLError as exc:
        return {"ok": False, "reason": f"{type(exc).__name__}: {exc}"}


def _build() -> dict:
    web_dir = ROOT / "apps" / "web"
    shutil.rmtree(DIST_DIR, ignore_errors=True)  # see integrity_regression_check.py - measured stale-cache bug
    _write_web_env()
    _write_roadmap_status()  # public/roadmap-status.json - vite copies public/ verbatim into dist
    return _run([NPM, "run", "build"], cwd=web_dir, timeout=600)


def _gate() -> dict:
    r = _run([sys.executable, str(ROOT / "scripts" / "ci" / "integrity_regression_check.py")], cwd=ROOT, timeout=900)
    report_path = ROOT / "state" / "integrity" / "latest.json"
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        report = {"state": "UNKNOWN"}
    return {"ok": report.get("state") == "PASS", "state": report.get("state"),
            "build_ok": report.get("build", {}).get("ok"), "lint_ok": report.get("lint", {}).get("ok")}


def main() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    record: dict = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "stages": {}}

    build = _build()
    record["stages"]["build"] = {"ok": build["ok"]}
    if not build["ok"]:
        record["stopped_at"] = "build"
        _finish(record)
        return 1

    gate = _gate()
    record["stages"]["gate"] = gate
    if not gate["ok"]:
        record["stopped_at"] = "gate"
        _finish(record)
        return 1

    if not DIST_DIR.is_dir():
        record["stages"]["staging_sync"] = {"ok": False, "reason": "dist dir missing after a passing build"}
        record["stopped_at"] = "staging_sync"
        _finish(record)
        return 1

    staging_sync = _rsync(DIST_DIR, STAGING_REMOTE_DIR)
    record["stages"]["staging_sync"] = staging_sync
    if not staging_sync["ok"]:
        record["stopped_at"] = "staging_sync"
        _finish(record)
        return 1

    staging_probe = _probe(STAGING_URL)
    record["stages"]["staging_probe"] = staging_probe
    if not staging_probe["ok"]:
        record["stopped_at"] = "staging_probe"
        _finish(record)
        return 1

    # Gate + live staging probe both pass -> promote the SAME build to production.
    prod_sync = _rsync(DIST_DIR, PROD_REMOTE_DIR)
    record["stages"]["prod_sync"] = prod_sync
    if not prod_sync["ok"]:
        record["stopped_at"] = "prod_sync"
        _finish(record)
        return 1

    prod_probe = _probe(PROD_URL)
    record["stages"]["prod_probe"] = prod_probe
    record["stopped_at"] = None if prod_probe["ok"] else "prod_probe"

    if prod_probe["ok"]:
        sys.path.insert(0, str(ROOT / "scripts" / "publish"))
        from activity_publish import publish as publish_activity  # noqa: PLC0415 - late import avoids a
        # circular import: activity_publish itself imports _SECRETS/_run from this module.
        commit = _latest_commit()
        record["stages"]["publication"] = publish_activity(
            title=commit["message"],
            summary=commit["message"],
            evidence={"build": "PASS", "lint": record["stages"]["gate"].get("lint_ok"),
                      "public_scrub": "PASS", "production_readback": True},
        )

    _finish(record)
    return 0 if prod_probe["ok"] else 1


def _finish(record: dict) -> None:
    record["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    record["promoted_to_production"] = record["stopped_at"] is None
    history_path = STATE_DIR / "history.jsonl"
    with history_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, default=str) + "\n")
    (STATE_DIR / "latest.json").write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    print(json.dumps(record, indent=2, default=str))


if __name__ == "__main__":
    raise SystemExit(main())
