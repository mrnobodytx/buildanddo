#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/ship.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TENANT-RAIL-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-07
# Depends:     scripts/ci/integrity_regression_check.py, scripts/ci/evidence_epoch.py,
#              scripts/ci/datadog_publish.py, scripts/publish/activity_publish.py,
#              secrets/deploy.local.env (key names only)
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/integrity_regression_check.py;
#              CONSUMES scripts/ci/evidence_epoch.py;
#              PRODUCES state/deploy/history.jsonl; PRODUCES state/deploy/latest.json;
#              DRIVEN_BY tools/citadel_tenant_rail.py (controller estate)
# Intent:      One command that builds, gates, stages, probes, promotes and records -
#              and, with --stage-only, stops at staging so the controller can stage at A2.
# ───────────────────────────────────────────────────────────────
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
  5. EPOCH      only after a passing production probe: fingerprint the exact
                artifact set that is now serving production into one chained
                Merkle root and publish it to Datadog (evidence_epoch.py,
                SRS-BUILDANDDO-EPOCH-001). A deploy is the one moment where
                "these bytes are live" is a checkable claim; an epoch is what
                makes it still checkable after the artifacts are gone.
  6. RECORD     append one state/deploy/history.jsonl line with every stage's
                real outcome - never a "deployed" claim without the probe result
                that backs it.

Any stage failing halts the line at that stage; later stages never run on a
failed gate. This is the whole gate: build+lint clean AND both live domains
answer 200 after their respective syncs. No feature flags, no rollback logic
yet - out of scope until this loop itself is proven (this repo's own "prove
it" standard).

Modes (argparse, added 2026-09-11 for the Citadel tenant rail,
SRS-BUILDANDDO-TENANT-RAIL-001). The flag-less run is the line above, unchanged:
  (no flags)     BUILD -> GATE -> STAGING -> PROMOTE -> EPOCH -> RECORD.
  --stage-only   BUILD -> GATE -> STAGING -> RECORD. Stops after the staging
                 probe with stopped_at="stage_only"; exits 0 on a staging 200
                 and 1 otherwise. Production, the epoch and the publication
                 never run. This is the A2 (local, reversible) half that the
                 controller's `citadel_tenant_rail.py stage` drives; `promote`
                 runs the flag-less line under an explicit A3 acknowledgement.
  --json PATH    also write the final deploy record to PATH (the same JSON as
                 state/deploy/latest.json) so a caller has a receipt without
                 parsing stdout. Never changes what is deployed or recorded.
"""
from __future__ import annotations
import argparse
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
            # Cloudflare's bot rule returns 403 to Python's default user agent (measured 2026-09-11 on
            # staging); a named UA is required or every probe fails while the site is actually serving.
            req = urllib.request.Request(url, headers={"User-Agent": "BuildAndDo-Ship-Probe (https://buildanddo.com, 1.0)",
                                                       "Accept": "text/html,application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed https URL, not user input
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
    """Client-safe frontend identifiers only - the PostHog project key
    (BUILDANDDO_PH, public phc_ key) and the Datadog RUM application id and
    client token (intake-scoped, no read access) - never a secret. Sourced from
    secrets/deploy.local.env or the OS environment (see _load_local_secrets);
    .env* is gitignored at the repo root and regenerated every run, never
    committed. Missing values are simply omitted, which disables that
    integration at runtime rather than failing the ship.

    VITE_DD_VERSION is derived from the commit being shipped, not configured:
    it is what makes a Datadog release comparison (and the browser-side delta
    baselines, which reset per release) line up with an actual deploy."""
    web_dir = ROOT / "apps" / "web"
    names = {
        "BUILDANDDO_PH": "VITE_BUILDANDDO_PH",
        "BUILDANDDO_DD_APPLICATION_ID": "VITE_DD_APPLICATION_ID",
        "BUILDANDDO_DD_CLIENT_TOKEN": "VITE_DD_CLIENT_TOKEN",
        "BUILDANDDO_DD_SESSION_SAMPLE_RATE": "VITE_DD_SESSION_SAMPLE_RATE",
        "BUILDANDDO_DD_REPLAY_SAMPLE_RATE": "VITE_DD_REPLAY_SAMPLE_RATE",
        "BUILDANDDO_DD_TRACE_SAMPLE_RATE": "VITE_DD_TRACE_SAMPLE_RATE",
    }
    lines = [f"{var}={_SECRETS[key]}\n" for key, var in names.items() if _SECRETS.get(key)]

    sha = _run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, timeout=15).get("stdout_tail", "").strip()
    if sha:
        lines.append(f"VITE_DD_VERSION={sha}\n")

    if lines:
        (web_dir / ".env").write_text("".join(lines), encoding="utf-8")


def _write_roadmap_status() -> dict:
    return _run([sys.executable, str(ROOT / "scripts" / "deploy" / "roadmap_status.py")], cwd=ROOT, timeout=30)


def _write_integrations_status() -> dict:
    return _run([sys.executable, str(ROOT / "scripts" / "deploy" / "integrations_status.py")], cwd=ROOT, timeout=30)


def _write_unmeasured_integrations_status(result: dict) -> None:
    """Same contract as _write_unmeasured_roadmap_status for the public-record
    projection: a failed (or leak-guard-refused) projection must never leave a
    previous build's file in place, and must never fail the ship."""
    status_path = ROOT / "apps" / "web" / "public" / "integrations-status.json"
    payload = {
        "schema": "buildanddo.integrations-status/v1",
        "state": "UNMEASURED",
        "error": "projection_failed",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "detail": result.get("reason") or (result.get("stderr_tail") or result.get("stdout_tail") or "")[-500:],
        "sections": {}, "channels": {}, "tutorials": [], "validity": [],
    }
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_unmeasured_roadmap_status(result: dict) -> None:
    """Replace roadmap-status.json with an explicit UNMEASURED marker.

    A failed projection previously left the previous build's file in place, so
    the public page kept drawing a stale ACTUAL marker as if it were current.
    Overwriting with UNMEASURED makes the page say it does not know, which is
    the honest answer and the one the page is written to handle.

    The projection failing never fails the ship: observability must not be able
    to break the build it observes (.bits/context.md invariant).
    """
    status_path = ROOT / "apps" / "web" / "public" / "roadmap-status.json"
    payload = {
        "state": "UNMEASURED",
        "error": "projection_failed",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "detail": result.get("reason") or (result.get("stderr_tail") or "")[-500:],
    }
    try:
        status_path.parent.mkdir(parents=True, exist_ok=True)
        status_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError as exc:
        print(f"WARN roadmap-status.json could not be written: {type(exc).__name__}: {exc}")


RELEASE_MANIFEST_REL = Path("apps") / "web" / "public" / ".well-known" / "citadel-release.json"


def _write_release_manifest(stage_only: bool) -> dict:
    """Write public/.well-known/citadel-release.json so the shipped dist carries its own
    release identity (vite copies public/ verbatim into dist; nginx serves the path as JSON).

    Measured 2026-09-11: the staging readback gate (tools/citadel_staging_error_corpus.py,
    class RELEASE_MANIFEST_MISSING) expected this file "published by ship.py", but nothing
    wrote it, so every stage ended HOLD on a contract no build could satisfy. Facts only:
    commit, branch, package version, build time, target. No secrets, no hostnames.
    A failure here never fails the ship (observability must not break the build it observes).
    """
    path = ROOT / RELEASE_MANIFEST_REL
    commit = _latest_commit()
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, timeout=15).get("stdout_tail", "").strip()
    try:
        version = json.loads((ROOT / "apps" / "web" / "package.json").read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        version = None
    payload = {
        "schema": "citadel.release-manifest/v1",
        "tenant_id": "buildanddo",
        "commit": commit.get("sha"),
        "commit_message": commit.get("message"),
        "branch": branch,
        "package_version": version,
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "target": "staging" if stage_only else "staging+production",
        "shipped_by": "scripts/deploy/ship.py",
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "path": str(RELEASE_MANIFEST_REL), "commit": payload["commit"]}
    except OSError as exc:
        print(f"WARN release manifest could not be written: {type(exc).__name__}: {exc}")
        return {"ok": False, "reason": f"{type(exc).__name__}: {exc}"}


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


def _evidence_epoch() -> dict:
    """Fingerprint the shipped artifact set and publish the root to Datadog.

    Deliberately fail-soft in both halves. The epoch describes a deploy that has
    already happened and been probed; failing the ship because a fingerprint or a
    metric submission failed would discard a good deploy over bookkeeping, and
    would also let observability break the thing it observes (this repo's own
    invariant). Every outcome lands in the deploy record either way.
    """
    epoch_script = ROOT / "scripts" / "ci" / "evidence_epoch.py"
    if not epoch_script.is_file():
        return {"ok": False, "reason": "scripts/ci/evidence_epoch.py is missing"}

    created = _run([sys.executable, str(epoch_script), "--trigger", "production_deploy"],
                   cwd=ROOT, timeout=300)
    if not created["ok"]:
        return {"ok": False, "stage": "create", "stderr_tail": created.get("stderr_tail", "")}

    try:
        epoch = json.loads(created.get("stdout_tail") or "{}")
    except ValueError:
        epoch = {}
    epoch_id = epoch.get("epoch_id", "")
    root_digest = epoch.get("root_digest", "")
    artifact_count = epoch.get("artifact_count", 0)
    verified = 1 if epoch.get("state") == "PASS" else 0

    result = {"ok": True, "stage": "create", "epoch_id": epoch_id,
              "root_digest": root_digest, "artifact_count": artifact_count,
              "verified": bool(verified)}

    if not epoch_id:
        result.update(ok=False, reason="epoch script produced no epoch_id")
        return result

    # datadog_publish.py already prints SKIP and exits 0 without DD_API_KEY, so
    # a machine with no Datadog key ships normally and simply records no publish.
    published = _run([
        sys.executable, str(ROOT / "scripts" / "ci" / "datadog_publish.py"),
        "--service", "buildanddo-web",
        "--env", "production",
        "--pipeline", "deploy",
        "--branch", "main",
        "--source-type-name", "buildanddo",
        "--metric", f"buildanddo.epoch.artifacts={artifact_count}",
        "--metric", f"buildanddo.epoch.verified={verified}",
        "--metric", f"buildanddo.epoch.chain_length={epoch.get('chain_length', 0)}",
        "--count", "buildanddo.epoch.root_created=1",
        "--tag", f"epoch_id:{epoch_id}",
        "--tag", f"git_sha:{epoch.get('git_sha', '')}",
        "--tag", "trigger:production_deploy",
        "--tag", "source:evidence_epoch",
        "--tag", "deploy:production",
        "--tag", "anchor:pending",
        "--event-title", f"Evidence Epoch Created: {epoch_id}",
        "--event-text", (
            f"Root: {root_digest}\n"
            f"Previous: {epoch.get('previous_epoch') or 'none'} ({epoch.get('previous_root') or 'none'})\n"
            f"Artifacts: {artifact_count}\n"
            f"Commit: {epoch.get('git_sha', '')}\n"
            f"Trigger: production_deploy\n"
            f"Self-verified: {verified}\n"
            f"Production readback: 200 from {PROD_URL}"
        ),
        "--alert-type", "info",
        "--log-message", (
            f"Evidence epoch {epoch_id} root {root_digest} over {artifact_count} "
            f"artifacts after a production deploy (verified={verified})"
        ),
    ], cwd=ROOT, timeout=120)
    result["published"] = published["ok"]
    if not published["ok"]:
        result["publish_error"] = published.get("stderr_tail", "")
    return result


def _build(stage_only: bool = False) -> dict:
    web_dir = ROOT / "apps" / "web"
    shutil.rmtree(DIST_DIR, ignore_errors=True)  # see integrity_regression_check.py - measured stale-cache bug
    _write_web_env()
    # public/.well-known/citadel-release.json - the release identity the readback gates verify.
    _write_release_manifest(stage_only)
    # public/roadmap-status.json - vite copies public/ verbatim into dist.
    roadmap = _write_roadmap_status()
    if not roadmap["ok"]:
        print(f"WARN roadmap projection failed (rc={roadmap.get('returncode')}); "
              "shipping an UNMEASURED status file instead of stale data")
        _write_unmeasured_roadmap_status(roadmap)
    # public/integrations-status.json - the public-record bridge, same contract.
    integrations = _write_integrations_status()
    if not integrations["ok"]:
        print(f"WARN integrations projection failed (rc={integrations.get('returncode')}); "
              "shipping an UNMEASURED integrations-status file instead of stale data")
        _write_unmeasured_integrations_status(integrations)
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


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        prog="ship.py",
        description="BuildAndDo staging -> production deploy line (build, gate, stage, "
                    "promote, epoch, record). No flags = the full line.")
    ap.add_argument("--stage-only", action="store_true",
                    help="stop after the staging probe (stopped_at=stage_only); exit 0 on a "
                         "staging 200, 1 otherwise; production is never touched")
    ap.add_argument("--json", dest="json_path", metavar="PATH", default=None,
                    help="also write the final deploy record to PATH (same JSON as "
                         "state/deploy/latest.json)")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    record: dict = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "stages": {}}
    if args.stage_only:
        record["stage_only"] = True

    build = _build(stage_only=bool(args.stage_only))
    record["stages"]["build"] = {"ok": build["ok"]}
    manifest_path = ROOT / RELEASE_MANIFEST_REL
    record["stages"]["release_manifest"] = {"ok": manifest_path.is_file(), "path": str(RELEASE_MANIFEST_REL)}
    if not build["ok"]:
        record["stopped_at"] = "build"
        _finish(record, args.json_path)
        return 1

    gate = _gate()
    record["stages"]["gate"] = gate
    if not gate["ok"]:
        record["stopped_at"] = "gate"
        _finish(record, args.json_path)
        return 1

    if not DIST_DIR.is_dir():
        record["stages"]["staging_sync"] = {"ok": False, "reason": "dist dir missing after a passing build"}
        record["stopped_at"] = "staging_sync"
        _finish(record, args.json_path)
        return 1

    staging_sync = _rsync(DIST_DIR, STAGING_REMOTE_DIR)
    record["stages"]["staging_sync"] = staging_sync
    if not staging_sync["ok"]:
        record["stopped_at"] = "staging_sync"
        _finish(record, args.json_path)
        return 1

    staging_probe = _probe(STAGING_URL)
    record["stages"]["staging_probe"] = staging_probe
    if not staging_probe["ok"]:
        record["stopped_at"] = "staging_probe"
        _finish(record, args.json_path)
        return 1

    if args.stage_only:
        # Staging is serving the gated build; the controller decides (A3) whether
        # it is promoted. Nothing below this line runs in this mode.
        record["stopped_at"] = "stage_only"
        _finish(record, args.json_path)
        return 0

    # Gate + live staging probe both pass -> promote the SAME build to production.
    prod_sync = _rsync(DIST_DIR, PROD_REMOTE_DIR)
    record["stages"]["prod_sync"] = prod_sync
    if not prod_sync["ok"]:
        record["stopped_at"] = "prod_sync"
        _finish(record, args.json_path)
        return 1

    prod_probe = _probe(PROD_URL)
    record["stages"]["prod_probe"] = prod_probe
    record["stopped_at"] = None if prod_probe["ok"] else "prod_probe"

    if prod_probe["ok"]:
        # The artifact set that just answered 200 is the one worth fingerprinting.
        record["stages"]["evidence_epoch"] = _evidence_epoch()

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

    _finish(record, args.json_path)
    return 0 if prod_probe["ok"] else 1


def _finish(record: dict, json_path: str | None = None) -> None:
    record["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    record["promoted_to_production"] = record["stopped_at"] is None
    history_path = STATE_DIR / "history.jsonl"
    with history_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, default=str) + "\n")
    latest = json.dumps(record, indent=2, default=str)
    (STATE_DIR / "latest.json").write_text(latest, encoding="utf-8")
    if json_path:
        # --json receipt: the identical record, at the caller's path. Written after
        # history so a receipt never exists for a run the ledger does not know about.
        out = Path(json_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(latest, encoding="utf-8")
    print(latest)


if __name__ == "__main__":
    raise SystemExit(main())
