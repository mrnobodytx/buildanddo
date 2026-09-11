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
# Updated:     2026-09-11 (release lane v2: GitHub-bound staging, legacy line gated)
# Depends:     scripts/ci/integrity_regression_check.py, scripts/ci/evidence_epoch.py,
#              scripts/ci/datadog_publish.py, scripts/publish/activity_publish.py,
#              secrets/deploy.local.env (key names only),
#              docs/architecture/BUILDANDDO_RELEASE_LANE.md (contract)
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/integrity_regression_check.py;
#              CONSUMES scripts/ci/evidence_epoch.py;
#              CONSUMES BUILDANDDO_RELEASE_LANE_FILE (citadel.tenant-rail-lane/v1, read only);
#              PRODUCES apps/web/public/.well-known/citadel-release.json (citadel.release-manifest/v2);
#              PRODUCES state/deploy/history.jsonl; PRODUCES state/deploy/latest.json;
#              DRIVEN_BY tools/citadel_tenant_rail.py (controller estate)
# Intent:      Build, gate, stage, probe and record - with the staging build bound
#              to the GitHub sha a lane file names, and the old staging -> production
#              shortcut closed unless --direct-production-legacy is passed explicitly.
# ───────────────────────────────────────────────────────────────
"""
ship.py - the build -> gate -> staging line for buildanddo.com, lane-aware.

Release lane (v2, 2026-09-11; docs/architecture/BUILDANDDO_RELEASE_LANE.md):

  foundry (this script, --stage-only)  ->  staging, bound to a GitHub sha
  private release lane (not this script) ->  production

Staging is the only surface this script is meant to ship to. Production is
released from a private lane that re-builds and re-verifies a candidate whose
parent is the public GitHub main sha; this script never has to know how. The
old contract ("staging passes its gates and is automatically pushed to
production") is gone: the flag-less run still builds, gates, ships and probes
staging, then STOPS with stopped_at="direct_production_refused" (exit 2). The
legacy full line only runs when --direct-production-legacy is passed on the
command line, and the manifest it ships says so (lane="direct-legacy").

Flow, every run:
  0. BIND       if BUILDANDDO_RELEASE_LANE_FILE is set, read the lane receipt
                (schema citadel.tenant-rail-lane/v1). An unreadable or invalid
                file stops the run before the build (stopped_at=
                "lane_file_invalid", exit 2). A candidate_sha that is not the
                full sha of HEAD stops the run before the build (stopped_at=
                "bind_sha_mismatch", exit 2, nothing synced). A matching file
                stamps github_sha / github_ref / lane="github-staging" into the
                release manifest.
  1. MANIFEST   write apps/web/public/.well-known/citadel-release.json
                (citadel.release-manifest/v2) so the shipped dist carries its
                own identity; vite copies public/ verbatim into dist and the
                readback gates (controller estate) compare it with what they
                expect. Facts only: no hostnames, URLs, secret names or values.
  2. BUILD      apps/web locally (clean dist - see the measured Vite stale-
                bundle bug in integrity_regression_check.py; same fix here).
  3. GATE       run integrity_regression_check.py (build+lint, real subprocess,
                never assumed). FAIL stops the line before anything touches a
                server.
  4. STAGING    ssh-clear + scp the fresh dist to the staging web root, probe
                the staging URL for a real 200.
  5. STOP       --stage-only: stopped_at="stage_only", exit 0 on a staging 200.
                no flag:      stopped_at="direct_production_refused", exit 2.
  6. LEGACY     --direct-production-legacy only: scp the SAME build to the
                production web root, probe, evidence epoch, publication.
  7. RECORD     append one history.jsonl line with every stage's real outcome
                (never a "deployed" claim without the probe result behind it),
                plus executor / lane / bind / manifest / remote_writes.

Environment NAMES this script honours (values are read, never printed):
  BUILDANDDO_RELEASE_LANE_FILE  absolute path of the lane receipt (see BIND).
  BUILDANDDO_SECRETS_FILE       dotenv to read instead of secrets/deploy.local.env
                                (a detached-worktree build points back at the clone).
  BUILDANDDO_STATE_DIR          ledger dir instead of state/deploy (one ledger,
                                even when the build ran in a worktree).
  CITADEL_EXECUTOR              who is driving ("rig1" when the controller calls;
                                default "ship.py-direct").
  CITADEL_LANE_VERSION          informational; the lane file wins when both exist.
  BUILDANDDO_SSH_KEY            (from the secrets file) key PATH; a relative path
                                resolves against the clone that owns the secrets
                                file, never against a worktree.

Modes (argparse):
  --stage-only                 BIND -> MANIFEST -> BUILD -> GATE -> STAGING -> RECORD.
  --direct-production-legacy   the legacy full line; required for any production write.
  --json PATH                  also write the final deploy record to PATH.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/ (or a detached worktree of it)
LANE_VERSION_DEFAULT = "2.0.0"
MANIFEST_SCHEMA = "citadel.release-manifest/v2"
LANE_FILE_SCHEMA = "citadel.tenant-rail-lane/v1"
MANIFEST_KEYS = (
    "schema", "tenant_id", "commit", "commit_message", "commit_full", "branch",
    "package_version", "built_at", "target", "shipped_by", "github_sha", "github_ref",
    "gitlab_project_id", "gitlab_intake_sha", "gitlab_package_name", "gitlab_package_version",
    "lane", "executor", "lane_version",
)


def _env_path(name: str, default: Path) -> Path:
    raw = os.environ.get(name, "").strip()
    return Path(raw).expanduser().resolve() if raw else default


# Deploy-only local secrets (VM host, key path, PostHog project key) - never
# committed (see .gitignore). BUILDANDDO_SECRETS_FILE relocates the file so a
# worktree build reads the clone's secrets by NAME; OS env vars of the same names
# still apply when the file is absent.
LOCAL_SECRETS = _env_path("BUILDANDDO_SECRETS_FILE", ROOT / "secrets" / "deploy.local.env")
STATE_DIR = _env_path("BUILDANDDO_STATE_DIR", ROOT / "state" / "deploy")
LANE_FILE = os.environ.get("BUILDANDDO_RELEASE_LANE_FILE", "").strip() or None
EXECUTOR = os.environ.get("CITADEL_EXECUTOR", "").strip() or "ship.py-direct"
LANE_VERSION_ENV = os.environ.get("CITADEL_LANE_VERSION", "").strip() or None
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


def _secret_names_in_file() -> list[str]:
    """Key NAMES declared in the secrets file - used only to keep them out of the manifest."""
    names: list[str] = []
    if LOCAL_SECRETS.is_file():
        for line in LOCAL_SECRETS.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                names.append(line.partition("=")[0].strip())
    return names


def _resolve_ssh_key(raw: str) -> tuple[str, str]:
    """Return (path, source). A relative BUILDANDDO_SSH_KEY resolves against the clone
    that owns the secrets file (its parent dir's parent), so a worktree build and a
    clone build use the same key file. Only the path is ever recorded, never bytes."""
    if not raw:
        return "", "unset"
    p = Path(raw).expanduser()
    if p.is_absolute():
        return str(p), "absolute"
    return str((LOCAL_SECRETS.parent.parent / p).resolve()), "relative_to_clone"


_SECRETS = _load_local_secrets()
_SECRET_NAMES = _secret_names_in_file()
SSH_KEY, SSH_KEY_SOURCE = _resolve_ssh_key(_SECRETS.get("BUILDANDDO_SSH_KEY", ""))
VM_HOST = _SECRETS.get("BUILDANDDO_VM_HOST", "")
STAGING_REMOTE_DIR = "/var/www/buildanddo-staging"
PROD_REMOTE_DIR = "/var/www/buildanddo"
STAGING_URL = "https://staging.buildanddo.com/"
PROD_URL = "https://buildanddo.com/"
DIST_DIR = ROOT / "dist" / "apps" / "web"
# Substrings that must never appear in a served manifest value (public surface).
_FORBIDDEN_MANIFEST_MARKS = ("://", "http", "@", "buildanddo.com", "citadel-nexus.com", "gitlab.")
_SHA40 = re.compile(r"^[0-9a-f]{40}$")


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
            req = urllib.request.Request(url, headers={"User-Agent": "BuildAndDo-Ship-Probe (https://buildanddo.com, 2.0)",
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
        return {"ok": False, "stage": "config", "reason": "BUILDANDDO_VM_HOST not set (see the secrets file)"}
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
    the secrets file or the OS environment (see _load_local_secrets);
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


def _head_full() -> str:
    return _run(["git", "rev-parse", "HEAD"], cwd=ROOT, timeout=15).get("stdout_tail", "").strip()


def _latest_commit() -> dict:
    sha = _run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, timeout=15)
    msg = _run(["git", "log", "-1", "--pretty=%s"], cwd=ROOT, timeout=15)
    return {"sha": sha.get("stdout_tail", "").strip(), "message": msg.get("stdout_tail", "").strip()}


def _read_lane_file(path: str) -> dict:
    """Read the controller's lane receipt. Fail closed: anything short of a JSON object
    with the expected schema is 'invalid' and the caller stops before building."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"ok": False, "reason": f"{type(exc).__name__}: {exc}"}
    if not isinstance(data, dict):
        return {"ok": False, "reason": "lane file is not a JSON object"}
    if data.get("schema") != LANE_FILE_SCHEMA:
        return {"ok": False, "reason": f"lane file schema {data.get('schema')!r} != {LANE_FILE_SCHEMA!r}"}
    return {"ok": True, "lane": data}


def _bind_lane(head_full: str) -> dict:
    """Bind this build to the GitHub sha the lane file names.

    Returns {"state": "unbound"|"bound"|"mismatch"|"invalid", ...}. "mismatch" and
    "invalid" are refusals (the caller exits 2 before any build or sync). A lane file
    whose candidate_sha is null cannot bind anything, so the build stays "unbound"
    (recorded, not refused): a manifest may only say lane="github-staging" when a
    concrete GitHub sha equals HEAD."""
    binding = {"lane_file": LANE_FILE, "expected": None, "actual": head_full or None, "ok": False,
               "state": "unbound", "github_sha": None, "github_ref": None, "lane": None,
               "lane_version": LANE_VERSION_ENV, "reason": None}
    if not LANE_FILE:
        return binding
    read = _read_lane_file(LANE_FILE)
    if not read["ok"]:
        binding.update(state="invalid", reason=read["reason"])
        return binding
    lane = read["lane"]
    github = lane.get("github") if isinstance(lane.get("github"), dict) else {}
    candidate = lane.get("candidate_sha")
    binding["expected"] = candidate
    binding["lane_version"] = lane.get("lane_version") or LANE_VERSION_ENV
    if candidate is None:
        binding.update(reason="lane file candidate_sha is null; nothing to bind to")
        return binding
    if not (isinstance(candidate, str) and _SHA40.match(candidate)):
        binding.update(state="invalid", reason="lane file candidate_sha is not a full 40-hex sha")
        return binding
    if candidate != head_full:
        binding.update(state="mismatch", reason="candidate_sha != git rev-parse HEAD")
        return binding
    binding.update(ok=True, state="bound", github_sha=github.get("sha"), github_ref=github.get("ref"),
                   lane="github-staging")
    return binding


def _public_safe(value: object) -> object:
    """Manifest values are served to anyone. Any token that looks like a URL, an address
    or one of the secret NAMES is replaced by a marker instead of being published."""
    if not isinstance(value, str):
        return value
    out = []
    for token in value.split(" "):
        low = token.lower()
        hit = any(mark in low for mark in _FORBIDDEN_MANIFEST_MARKS)
        hit = hit or any(name and name in token for name in _SECRET_NAMES)
        out.append("[redacted]" if hit else token)
    return " ".join(out)


def _write_release_manifest(stage_only: bool, binding: dict | None = None,
                            direct_legacy: bool = False) -> dict:
    """Write public/.well-known/citadel-release.json (citadel.release-manifest/v2) so the
    shipped dist carries its own release identity (vite copies public/ verbatim into
    dist; nginx serves the path as JSON). The same schema is written for production by
    the private release lane's manifest writer; the gitlab_* keys are always null here.

    Facts only: commit, branch, package version, build time, target, lane, executor.
    No secrets, no hostnames, no URLs. A failure here never fails the ship
    (observability must not break the build it observes)."""
    binding = binding or _bind_lane(_head_full())
    path = ROOT / RELEASE_MANIFEST_REL
    commit = _latest_commit()
    head_full = binding.get("actual") or _head_full()
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, timeout=15).get("stdout_tail", "").strip()
    if branch == "HEAD" and binding.get("github_ref"):
        # detached worktree of the bound sha: name the ref the sha was read from
        branch = str(binding["github_ref"]).rsplit("/", 1)[-1]
    try:
        version = json.loads((ROOT / "apps" / "web" / "package.json").read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError):
        version = None
    if direct_legacy:
        lane = "direct-legacy"
    elif binding.get("ok"):
        lane = "github-staging"
    else:
        lane = "unbound"
    payload = {
        "schema": MANIFEST_SCHEMA,
        "tenant_id": "buildanddo",
        "commit": commit.get("sha"),
        "commit_message": commit.get("message"),
        "commit_full": head_full or None,
        "branch": branch or None,
        "package_version": version,
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "target": "staging+production" if direct_legacy else "staging",
        "shipped_by": "scripts/deploy/ship.py",
        "github_sha": binding.get("github_sha"),
        "github_ref": binding.get("github_ref"),
        "gitlab_project_id": None,
        "gitlab_intake_sha": None,
        "gitlab_package_name": None,
        "gitlab_package_version": None,
        "lane": lane,
        "executor": EXECUTOR,
        "lane_version": binding.get("lane_version") or LANE_VERSION_ENV,
    }
    redactions = 0
    for key in ("commit_message", "branch"):
        safe = _public_safe(payload[key])
        redactions += int(safe != payload[key])
        payload[key] = safe
    if tuple(payload) != MANIFEST_KEYS:
        raise RuntimeError("manifest key list drifted from the citadel.release-manifest/v2 contract")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "path": str(RELEASE_MANIFEST_REL), "schema": MANIFEST_SCHEMA,
                "commit": payload["commit"], "commit_full": payload["commit_full"],
                "github_sha": payload["github_sha"], "lane": lane, "redactions": redactions}
    except OSError as exc:
        print(f"WARN release manifest could not be written: {type(exc).__name__}: {exc}")
        return {"ok": False, "schema": MANIFEST_SCHEMA, "commit_full": payload["commit_full"],
                "github_sha": payload["github_sha"], "lane": lane, "reason": f"{type(exc).__name__}: {exc}"}


def _notify_guildmasters(message: str) -> dict:
    """Connects the guildmaster fleet to THIS repo's real build activity: posts as Forge
    (builder guild - owns PAGE/SYSTEM edits per platform_edit_fabric's capability matrix) to
    the same Discord webhook the fleet already speaks through (tools/cbf/guildmaster_speak.py's
    _webhook_url() convention). Deliberately stdlib-only + fail-soft: a Discord outage must
    never break the deploy pipeline, only be visible in the returned result.
    Imported by scripts/publish/activity_publish.py (not called from this module)."""
    url = _SECRETS.get("DISCORD_WEBHOOK_URL")
    if not url:
        return {"ok": False, "reason": "DISCORD_WEBHOOK_URL not set (see the secrets file)"}
    import urllib.error
    payload = json.dumps({"username": "Forge", "content": message[:1900]}).encode("utf-8")
    req = urllib.request.Request(url + "?wait=true", data=payload, method="POST",
                                  headers={"Content-Type": "application/json",
                                            "User-Agent": "BuildAndDo-Ship (https://buildanddo.com, 2.0)"})
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


def _build() -> dict:
    """npm run build after the public/ projections. The release manifest is written by
    main() before this runs (it depends on the lane binding, which is decided first)."""
    web_dir = ROOT / "apps" / "web"
    shutil.rmtree(DIST_DIR, ignore_errors=True)  # see integrity_regression_check.py - measured stale-cache bug
    _write_web_env()
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
            "build_ok": report.get("build", {}).get("ok"), "lint_ok": report.get("lint", {}).get("ok"),
            "returncode": r.get("returncode")}


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        prog="ship.py",
        description="BuildAndDo build -> gate -> staging line (lane-aware). Staging builds are "
                    "bound to the GitHub sha named by BUILDANDDO_RELEASE_LANE_FILE; production "
                    "is released from a private lane, not from this script. The flag-less run "
                    "ships staging and then stops (direct_production_refused, exit 2).")
    ap.add_argument("--stage-only", action="store_true",
                    help="stop after the staging probe (stopped_at=stage_only); exit 0 on a "
                         "staging 200, 1 otherwise; production is never touched")
    ap.add_argument("--direct-production-legacy", action="store_true",
                    help="run the legacy staging -> production line (scp the same build to "
                         "production, probe, epoch, publish); manifest lane=direct-legacy. "
                         "Without this flag no run of ship.py can write to production.")
    ap.add_argument("--json", dest="json_path", metavar="PATH", default=None,
                    help="also write the final deploy record to PATH (same JSON as "
                         "state/deploy/latest.json)")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    direct_legacy = bool(args.direct_production_legacy)
    stage_only = bool(args.stage_only)
    record: dict = {"started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "stages": {},
                    "executor": EXECUTOR, "lane_file": LANE_FILE, "direct_production_legacy": direct_legacy,
                    "remote_writes": 0, "secret_values_persisted": 0,
                    "ssh_key": {"path": SSH_KEY or None, "source": SSH_KEY_SOURCE}}
    if stage_only:
        record["stage_only"] = True

    # 0. BIND - decided before anything is built, so a wrong sha never even compiles.
    binding = _bind_lane(_head_full())
    record["bind"] = {"expected": binding["expected"], "actual": binding["actual"], "ok": binding["ok"],
                      "state": binding["state"], "reason": binding["reason"]}
    record["lane_version"] = binding.get("lane_version")
    record["lane"] = "direct-legacy" if direct_legacy else (binding["lane"] or "unbound")
    record["manifest"] = {"schema": MANIFEST_SCHEMA, "commit_full": binding["actual"],
                          "github_sha": binding["github_sha"]}
    if binding["state"] == "invalid":
        record["stopped_at"] = "lane_file_invalid"
        _finish(record, args.json_path)
        return 2
    if binding["state"] == "mismatch":
        record["stopped_at"] = "bind_sha_mismatch"
        _finish(record, args.json_path)
        return 2

    # 1. MANIFEST - the identity the readback gates verify on the served surface.
    manifest = _write_release_manifest(stage_only, binding, direct_legacy)
    record["stages"]["release_manifest"] = manifest
    record["manifest"] = {"schema": manifest.get("schema"), "commit_full": manifest.get("commit_full"),
                          "github_sha": manifest.get("github_sha")}

    build = _build()
    record["stages"]["build"] = {"ok": build["ok"]}
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
    record["remote_writes"] += 1

    staging_probe = _probe(STAGING_URL)
    record["stages"]["staging_probe"] = staging_probe
    if not staging_probe["ok"]:
        record["stopped_at"] = "staging_probe"
        _finish(record, args.json_path)
        return 1

    if stage_only:
        # Staging is serving the gated build; the controller's lane decides what
        # happens next. Nothing below this line runs in this mode.
        record["stopped_at"] = "stage_only"
        _finish(record, args.json_path)
        return 0

    if not direct_legacy:
        # The rig -> production shortcut is closed at the script level. Staging was
        # shipped and probed; production is released from the private lane.
        record["stopped_at"] = "direct_production_refused"
        record["refusal"] = "pass --direct-production-legacy to run the legacy line; production is not written"
        _finish(record, args.json_path)
        return 2

    # LEGACY (explicit flag only): promote the SAME build to production.
    prod_sync = _rsync(DIST_DIR, PROD_REMOTE_DIR)
    record["stages"]["prod_sync"] = prod_sync
    if not prod_sync["ok"]:
        record["stopped_at"] = "prod_sync"
        _finish(record, args.json_path)
        return 1
    record["remote_writes"] += 1

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
    record["promoted_to_production"] = record.get("stopped_at") is None
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
