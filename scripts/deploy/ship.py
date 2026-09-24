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
  3. STAGING    copy the fresh dist beside /var/www/buildanddo-staging on the VM,
                verify it, swap it into place (see _rsync), then
                probe https://staging.buildanddo.com for a real 200.
  4. PROMOTE    only if staging gate + staging probe both pass: rsync the SAME
                build (not a rebuild - promote what was actually gated) to
                /var/www/buildanddo (production) the same way, probe https://buildanddo.com.
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
answer 200 after their respective syncs. No feature flags and no automatic
rollback: each sync keeps the replaced release at `<dir>.previous` so an
operator can move it back by hand.
"""
from __future__ import annotations
import datetime as dt
import json
import shlex
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

# THE ESTATE CREDENTIAL STORE, which is where these belong.
# Deploy credentials used to live ONLY in secrets/deploy.local.env - a per-repo file that does not
# exist on this machine, so ship.py has been falling through to its hardcoded default host while
# the release controller reported the credentials missing. One fact, two stores, neither canonical.
# workspace.env is the estate's credential store and is now a source here. First readable path
# wins; CITADEL_WORKSPACE_ENV overrides for a machine that keeps it elsewhere.
def _workspace_env_candidates() -> tuple[Path, ...]:
    """Where the estate credential store might be — without naming it in a public file.

    THE PATH IS NO LONGER HARDCODED. This repository is published to a public mirror that
    code agents read and act on, and the absolute path of the credential store is the single
    most useful thing to know before trying to read it: it turns any filesystem access into
    credential theft. Measured 2026-09-22, that path was sitting in five tracked files.

    Resolution order: CITADEL_WORKSPACE_ENV in the environment, then the same name inside the
    gitignored secrets/deploy.local.env. A machine supplying neither gets the caller's clear
    "not set" refusal instead of silently falling through to somebody else's disk layout.
    """
    explicit = os.environ.get("CITADEL_WORKSPACE_ENV", "").strip()
    if not explicit:
        try:
            text = (ROOT / "secrets" / "deploy.local.env").read_text(
                encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        for line in text.splitlines():
            name, sep, value = line.strip().partition("=")
            if sep and name.strip() == "CITADEL_WORKSPACE_ENV":
                explicit = value.strip().strip('"').strip("'")
                break
    return (Path(explicit),) if explicit else ()


WORKSPACE_ENV_CANDIDATES = _workspace_env_candidates()

# Only these names are taken from the shared store. workspace.env holds 500+ credentials for the
# whole estate; pulling all of them into a deploy script's environment would hand every subprocess
# it spawns the keys to everything. A deploy needs two secrets, so it reads two.
#
# The frontend identifiers below are NOT a third and fourth secret, and adding them does not widen
# that blast radius by one credential: every one of them is published inside the browser bundle on
# purpose. _write_web_env already says so - the PostHog `phc_` value is "a public, client-safe
# PostHog project key, never a secret", and the Datadog RUM pair is "intake-scoped, no read access".
# A name that anyone can read off the wire is not what the narrow list exists to protect.
#
# WHY THEY ARE HERE AT ALL. Measured 2026-09-22: buildanddo.com has never recorded a single real
# user. posthog-js ships in the bundle (762 KB) with NO `phc_` key in it, and the only events in
# PostHog project 597897 come from our own OCN probes (library `bnd-ocn-seat`). The cause is this
# tuple. BUILDANDDO_PH was in workspace.env the whole time, but workspace.env is only consulted for
# names listed HERE, so _SECRETS never held it, _write_web_env omits any name it lacks, and
# telemetry.js returns early when its key is undefined. Three correct-looking behaviours compose
# into silence: nothing errors, nothing warns, and the dashboard just looks like a quiet product.
#
# The same omission disabled Datadog RUM, which is why the generated apps/web/.env contained only
# VITE_DD_VERSION. Those four names are not in workspace.env yet; listing them now means they bind
# on the next ship rather than needing this file edited again.
SHARED_KEYS = (
    "BUILDANDDO_VM_HOST",
    "BUILDANDDO_SSH_KEY",
    "BUILDANDDO_PH",
    "BUILDANDDO_DD_APPLICATION_ID",
    "BUILDANDDO_DD_CLIENT_TOKEN",
    "BUILDANDDO_DD_SESSION_SAMPLE_RATE",
    "BUILDANDDO_DD_REPLAY_SAMPLE_RATE",
    "BUILDANDDO_DD_TRACE_SAMPLE_RATE",
)


def _parse_env_file(path: Path) -> dict:
    out = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                v = v[1:-1]
            out[k.strip()] = v
    return out


def _load_local_secrets() -> tuple[dict, dict]:
    """Resolve deploy secrets, and record WHICH store answered for each name.

    Precedence, least to most specific: OS environment, then workspace.env (the estate store),
    then secrets/deploy.local.env (a deliberate per-machine override). Inserting the shared store
    BELOW the local file means nothing that works today changes behaviour - the local file still
    wins where it exists - while a name placed in workspace.env now binds.

    The provenance map records the SOURCE of each name and never its value, so a deploy can print
    where its credentials came from without printing what they are."""
    env = dict(os.environ)
    src = {k: ("environment" if env.get(k) else None) for k in SHARED_KEYS}

    for cand in WORKSPACE_ENV_CANDIDATES:
        if cand is None or not cand.is_file():
            continue
        shared = _parse_env_file(cand)
        for k in SHARED_KEYS:
            if shared.get(k):
                env[k] = shared[k]
                src[k] = f"workspace.env ({cand.name})"
        break                                   # first readable store wins

    if LOCAL_SECRETS.is_file():
        for k, v in _parse_env_file(LOCAL_SECRETS).items():
            env[k] = v
            if k in src:
                src[k] = "secrets/deploy.local.env"
    return env, src


_SECRETS, SECRET_SOURCES = _load_local_secrets()
SSH_KEY = _SECRETS.get("BUILDANDDO_SSH_KEY", "")
# NO HARDCODED HOST. This file is published to the public GitHub mirror, and a production
# address is exactly what has to be scrubbed before release - it was one of seven fleet
# addresses still sitting in this repo's tracked sources on 2026-09-22.
#
# Removing the literal also revives a guard that had been dead the whole time. _sync_remote
# already refuses with "BUILDANDDO_VM_HOST not set" when VM_HOST is empty, but the old
# `or "<hardcoded host>"` meant VM_HOST could never BE empty, so that branch was
# unreachable. The previous comment said a silent fallback should at least be visible in the
# receipt, which was the right instinct - not guessing a production target at all is
# stronger, and it is what the surrounding code already expected to happen.
#
# The address lives in workspace.env as BUILDANDDO_VM_HOST and resolves from there today.
VM_HOST = _SECRETS.get("BUILDANDDO_VM_HOST", "")
if not SECRET_SOURCES.get("BUILDANDDO_VM_HOST"):
    SECRET_SOURCES["BUILDANDDO_VM_HOST"] = "ABSENT (no store supplied it; deploy stages refuse)"
if not SECRET_SOURCES.get("BUILDANDDO_SSH_KEY"):
    SECRET_SOURCES["BUILDANDDO_SSH_KEY"] = "ABSENT (ssh will use the agent/default identity)"


def secret_provenance() -> dict:
    """Which store supplied each deploy credential. Names and sources only, never values."""
    return dict(SECRET_SOURCES)
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


# Cloudflare fronts both environments and its WAF bans urllib's default User-Agent
# ("Python-urllib/3.x") outright, answering 403 with error 1010 before the request ever reaches the
# origin. Measured 2026-09-20 against staging: default UA -> 403/1010, browser UA -> 200 with the
# real body, same URL, same second. The readback gate therefore FAILED ON EVERY RUN no matter how
# healthy the deploy was, and because the gate is fail-closed the rail could never promote - which
# is why production sat 33 commits behind staging. A blocked probe is not a failed deploy.
_PROBE_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; buildanddo-ship/1.0)"}


def _probe(url: str, retries: int = 5, delay: float = 2.0) -> dict:
    """Real HTTP GET, not a ping - a 200 with body is the only acceptable proof of 'serving'."""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers=_PROBE_HEADERS)
            with urllib.request.urlopen(request, timeout=10) as resp:  # noqa: S310 - fixed https URL, not user input
                body = resp.read(200)
                return {"ok": resp.status == 200, "status": resp.status, "attempt": attempt,
                        "body_prefix": body.decode("utf-8", errors="replace")[:120]}
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            time.sleep(delay)
    return {"ok": False, "status": None, "attempts": retries, "error": last_err}


def _ssh_identity_args() -> list[str]:
    return ["-i", SSH_KEY] if SSH_KEY else []


# Trust a host key on first contact, refuse a changed one. `=no` accepted any key, so a
# redirected connection would have received the build and the identity it runs under.
SSH_HOST_KEY_ARGS = ["-o", "StrictHostKeyChecking=accept-new"]


def _release_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"


def _file_count(local_dir: Path) -> int:
    return sum(len(files) for _root, _dirs, files in os.walk(local_dir))


def _swap_script(incoming: str, live: str, previous: str, expected_files: int) -> str:
    """One remote shell: verify the staged copy, keep the live tree as `previous`, rename
    the staged copy into place. Exit 3 = verify failed (live untouched); exit 4 = swap
    failed (previous release moved back when possible)."""
    inc, cur, prev = shlex.quote(incoming), shlex.quote(live), shlex.quote(previous)
    return (
        f"set -u; "
        f"test -f {inc}/index.html || {{ echo 'VERIFY_FAILED: index.html missing' >&2; exit 3; }}; "
        f"n=$(find {inc} -type f | wc -l); "
        f"[ \"$n\" -eq {int(expected_files)} ] || "
        f"{{ echo \"VERIFY_FAILED: expected {int(expected_files)} files, found $n\" >&2; exit 3; }}; "
        f"rm -rf {prev} || {{ echo 'SWAP_FAILED: could not clear previous release' >&2; exit 4; }}; "
        f"if [ -e {cur} ]; then mv {cur} {prev} || {{ echo 'SWAP_FAILED: could not retire live release' >&2; exit 4; }}; fi; "
        f"mv {inc} {cur} || {{ [ -e {prev} ] && mv {prev} {cur}; echo 'SWAP_FAILED: could not promote staged copy' >&2; exit 4; }}"
    )


def _rsync(local_dir: Path, remote_dir: str) -> dict:
    """Copy the dist tree to a sibling staging dir, verify it, then swap it into place.

    The live directory is never emptied before a complete copy exists. The old flow ran
    `find live -delete` then scp, so a failed or interrupted copy left the site serving a
    partial tree or nothing. The previous release is kept at `<remote_dir>.previous` for
    rollback. The swap is two renames in one remote shell, not a single atomic operation:
    the live path is absent for the instant between them, never half-written.

    A fresh directory also keeps the dotfile lesson: `rm -rf dir/*` never matched
    `.well-known/`, so a stale citadel-release.json outlived three deploys (2026-09-20)."""
    if not VM_HOST:
        return {"ok": False, "stage": "config", "reason": "BUILDANDDO_VM_HOST not set (see secrets/deploy.local.env)"}
    expected = _file_count(local_dir)
    if not (local_dir / "index.html").is_file() or expected == 0:
        return {"ok": False, "stage": "local_verify", "reason": "local build has no index.html"}
    stamp = _release_stamp()
    incoming = f"{remote_dir}.incoming-{stamp}"
    previous = f"{remote_dir}.previous"
    ssh = ["ssh", *_ssh_identity_args(), *SSH_HOST_KEY_ARGS, VM_HOST]

    prepare = _run([*ssh, f"rm -rf {shlex.quote(incoming)} && mkdir -p {shlex.quote(incoming)}"])
    if not prepare["ok"]:
        return {"ok": False, "stage": "prepare_remote", **prepare}
    copy = _run(["scp", *_ssh_identity_args(), *SSH_HOST_KEY_ARGS, "-r",
                 f"{local_dir}/.", f"{VM_HOST}:{incoming}/"], timeout=300)
    if not copy["ok"]:
        _run([*ssh, f"rm -rf {shlex.quote(incoming)}"], timeout=60)  # best effort; live untouched
        return {"ok": False, "stage": "scp", **copy}
    swap = _run([*ssh, _swap_script(incoming, remote_dir, previous, expected)], timeout=120)
    if not swap["ok"]:
        stage = "verify_remote" if swap.get("returncode") == 3 else "swap"
        if stage == "verify_remote":
            _run([*ssh, f"rm -rf {shlex.quote(incoming)}"], timeout=60)
        return {"ok": False, "stage": stage, **swap}
    return {"ok": True, "files": expected, "previous": previous}


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


def _refresh_capability_inventory() -> dict:
    """Re-measure the capability inventory AFTER the deploy, and push just that file.

    The inventory answers "what can I use", by checking each capability's source against the
    commit each environment reports serving. Built before the sync, it therefore describes the
    environments as they were BEFORE the deploy that carries it - measured 2026-09-20, production
    shipped an inventory reading 18 live / 18 staged when the post-deploy truth was 36 / 2.

    Re-running it here closes that by one deploy: the published file describes the environments as
    they are once the files have actually moved. Non-fatal - a stale inventory is a worse page, not
    a worse release, and the release has already been promoted and probed by this point.
    """
    built = _run([sys.executable, str(ROOT / "scripts" / "ci" / "capability_inventory.py"), "--write"],
                 cwd=ROOT, timeout=180)
    if not built["ok"]:
        return {"ok": False, "stage": "measure", **built}
    local = ROOT / "apps" / "web" / "public" / "capabilities.json"
    if not local.is_file():
        return {"ok": False, "stage": "measure", "reason": "capabilities.json not produced"}
    # Upload beside the live file, then rename over it: a reader never sees a half-written file.
    stamp = _release_stamp()
    for remote in (STAGING_REMOTE_DIR, PROD_REMOTE_DIR):
        target = f"{remote}/capabilities.json"
        staged = f"{target}.incoming-{stamp}"
        copy = _run(["scp", *_ssh_identity_args(), *SSH_HOST_KEY_ARGS,
                     str(local), f"{VM_HOST}:{staged}"], timeout=60)
        if not copy["ok"]:
            return {"ok": False, "stage": "scp", "remote": remote, **copy}
        swap = _run(["ssh", *_ssh_identity_args(), *SSH_HOST_KEY_ARGS, VM_HOST,
                     f"mv -f {shlex.quote(staged)} {shlex.quote(target)}"], timeout=60)
        if not swap["ok"]:
            return {"ok": False, "stage": "swap", "remote": remote, **swap}
    return {"ok": True}


def _write_deployed_version() -> None:
    """Write dist/_version: what this build actually is, for external readback.

    The schema matches what the release controller has always published
    (buildanddo.deployed-version/v1), so tools reading /_version keep working. It is written
    here because THIS is the step that moves the files - a record of the deploy written by
    anything else can, and did, drift nine days out of date.
    """
    def _git(*args: str) -> str:
        try:
            out = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True,
                                 text=True, timeout=20, check=False)
            return (out.stdout or "").strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    sha = _git("rev-parse", "HEAD")
    payload = {
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "campaign_id": "citadel-21-day-2026-09",
        "candidate_sha": sha,
        "commit_sha": sha,
        "gitlab_job_id": os.environ.get("CI_JOB_ID"),
        "gitlab_pipeline_id": os.environ.get("CI_PIPELINE_ID"),
        "schema": "buildanddo.deployed-version/v1",
        "source_branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
    }
    try:
        (DIST_DIR / "_version").write_text(json.dumps(payload), encoding="utf-8")
    except OSError as exc:
        print(f"WARN could not write dist/_version: {type(exc).__name__}: {exc}")

    # The release manifest is written HERE, from the same payload, so the two provenance sources
    # cannot disagree - which is the only thing that makes capability_inventory's conflict check
    # meaningful. Measured 2026-09-20: it had never existed. apps/web/public/.well-known/ is absent
    # from the tree and `git ls-files` matches nothing, yet the published roadmap evidence claimed
    # "/.well-known/citadel-release.json 200 on buildanddo.com and on staging.buildanddo.com".
    # Staging honestly answered 404; production answered 200 with the SPA's index.html, because the
    # SPA serves 200 for ANY unmatched path. A probe that only checked the status code read the
    # fallback as the manifest, and a milestone's evidence rested on it.
    try:
        wk = DIST_DIR / ".well-known"
        wk.mkdir(parents=True, exist_ok=True)
        (wk / "citadel-release.json").write_text(json.dumps(payload), encoding="utf-8")
    except OSError as exc:
        print(f"WARN could not write dist/.well-known/citadel-release.json: {type(exc).__name__}: {exc}")


def _write_capability_inventory() -> dict:
    return _run([sys.executable, str(ROOT / "scripts" / "ci" / "capability_inventory.py"), "--write"],
                cwd=ROOT, timeout=120)


def _write_roadmap_status() -> dict:
    return _run([sys.executable, str(ROOT / "scripts" / "deploy" / "roadmap_status.py")], cwd=ROOT, timeout=30)


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


def _build() -> dict:
    web_dir = ROOT / "apps" / "web"
    shutil.rmtree(DIST_DIR, ignore_errors=True)  # see integrity_regression_check.py - measured stale-cache bug
    _write_web_env()
    # public/roadmap-status.json - vite copies public/ verbatim into dist.
    roadmap = _write_roadmap_status()
    if not roadmap["ok"]:
        print(f"WARN roadmap projection failed (rc={roadmap.get('returncode')}); "
              "shipping an UNMEASURED status file instead of stale data")
        _write_unmeasured_roadmap_status(roadmap)
    # public/capabilities.json - what each environment can actually serve, measured against the
    # commit it reports running. Non-fatal: the page renders the section only when the file says
    # MEASURED, so a failure here costs a section rather than a release.
    caps = _write_capability_inventory()
    if not caps["ok"]:
        print(f"WARN capability inventory failed (rc={caps.get('returncode')}); "
              "the roadmap will omit the 'what you can use' section rather than guess")
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

    # LAST thing before the files move, and deliberately not earlier: _gate() runs
    # integrity_regression_check.py, which runs its own `npm run build` and cleans dist - so a
    # _version written during _build is deleted before it can ship. Measured 2026-09-20: the
    # promote landed with no _version at all and /_version fell through to the SPA's 200 HTML.
    _write_deployed_version()

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

    # Both environments are now serving the new build, so the inventory can finally measure what
    # it claims to describe. Deliberately after the probes: re-measuring earlier would just
    # re-record the pre-deploy state with a newer timestamp on it.
    if prod_probe["ok"]:
        refresh = _refresh_capability_inventory()
        record["stages"]["inventory_refresh"] = refresh
        if not refresh["ok"]:
            print(f"WARN capability inventory refresh failed at {refresh.get('stage')}; "
                  "the published inventory describes the PREVIOUS deploy")
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
