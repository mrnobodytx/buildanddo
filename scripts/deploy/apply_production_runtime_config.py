#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/apply_production_runtime_config.py
# Stage:       06_IMPLEMENT
# SRS:         SRS-BUILDANDDO-PRODCONFIG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PRODCONFIG-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/deploy/ship.py, scripts/ci/ocn_feature_sweep.py
# EnumType:    Tool
# EnumEdges:   REPAIRS buildanddo-pocketbase.service; VERIFIED-BY scripts/ci/ocn_feature_sweep.py
# Intent:      Give the production backend the runtime configuration only the staging unit ever
#              received, without any secret value leaving the box it already lives on.
# ───────────────────────────────────────────────────────────────
"""Give production the runtime configuration only staging ever got.

WHAT WAS MEASURED, 2026-09-23
    Both backends run on the same VM. `buildanddo-pocketbase-staging.service` has six systemd
    drop-ins. `buildanddo-pocketbase.service` has NO drop-in directory at all. Read from the two
    running processes' own environments (names only, never values):

        staging pid sees  CLOUDFLARE_REALTIME_APP_ID, CLOUDFLARE_REALTIME_APP_SECRET,
                          BUILDANDDO_DOSSIER_KEYS
        production  sees  PB_ENCRYPTION_KEY and nothing else

    That is the whole cause of every production-only failure the OCN sweep reports:
    classroom.session 503 realtime_not_configured, classroom.tracks 503, dossier.read 503.
    Production was never misconfigured - it was never configured.

WHY THIS COPIES ON THE BOX AND NOT THROUGH HERE
    The values are secrets. They already exist on the VM at 0600 root:root. This tool never reads
    one, never prints one and never carries one over the wire: it tells the box to copy its own
    files, and reports names and booleans. Nothing in this file's output can leak a value.

WHAT IS DELIBERATELY NOT COPIED, AND WHY
    Two of staging's six drop-ins are NOT portable, and copying all six because four are safe is
    exactly the mistake that makes a config change unreviewable.

    90-classroom-publishers.conf  BUILDANDDO_CLASSROOM_PUBLISHERS is the classroom online switch.
                                  An empty allowlist is a DELIBERATE fail-closed default, not an
                                  omission. Turning publishing on in production is a product
                                  decision an operator makes, not a side effect of a config repair.

    ocn-sidecar.conf              Points at http://<loopback>:8092, which is served by
                                  buildanddo-rooms-staging.service. There is no production rooms
                                  unit on the box at all. Copying this would silently point the
                                  production backend at a STAGING service. The missing production
                                  rooms sidecar is a real gap and gets its own repair, not a
                                  pointer to someone else's.

THE RISK THIS CARRIES
    Applying means restarting the production backend. PocketBase applies migrations by set
    difference on filename and one bad migration aborts startup - the whole backend, not one
    feature. The deployed tree is not changed here, so the restart should find no new migration,
    but "should" is not evidence: --apply verifies the service is active AND that the backend
    answers before it reports success, and rolls the drop-ins back and restarts again if it does
    not. A rollback that also fails is reported as such rather than smoothed over.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve()
ROOT = HERE.parents[2]
SCHEMA = "buildanddo.production-runtime-config/v1"
PROD_UNIT = "buildanddo-pocketbase.service"
STAGE_UNIT = "buildanddo-pocketbase-staging.service"

# Each portable drop-in, with the reason it is portable. A file not named here is not copied.
PORTABLE = {
    "10-classroom-realtime.conf":
        "two opaque Cloudflare Realtime app identifiers; neither is coupled to an environment",
    "10-dossier.conf":
        "an EnvironmentFile whose values contain no environment reference (measured: 0 matches)",
    "20-seat-personas.conf":
        "an EnvironmentFile whose values contain no environment reference (measured: 0 matches)",
    "20-suite-bindings.conf":
        "an EnvironmentFile whose values contain no environment reference (measured: 0 matches)",
}
WITHHELD = {
    "90-classroom-publishers.conf":
        "the classroom online switch; an empty allowlist is a deliberate fail-closed default and "
        "turning publishing on in production is an operator's product decision",
    "ocn-sidecar.conf":
        "points at a loopback port served by the STAGING rooms unit; no production rooms unit "
        "exists on this box, so copying it would aim production at a staging service",
}


def ship():
    spec = importlib.util.spec_from_file_location("ship", HERE.parent / "ship.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def on_box(script: str, timeout: int = 420) -> tuple[int, str, str]:
    module = ship()
    host = module.VM_HOST
    if not host:
        return 2, "", "BUILDANDDO_VM_HOST not set; nothing to talk to"
    done = subprocess.run(
        ["ssh", *module._ssh_identity_args(), "-o", "StrictHostKeyChecking=no",
         "-o", "ConnectTimeout=20", host, "tr -d '\\r' | bash -s"],
        input=script, capture_output=True, text=True, timeout=timeout)
    return done.returncode, done.stdout, done.stderr


# Reports what each unit HAS. Prints file names and variable names; never a value.
PLAN_SCRIPT = r"""
echo "PROD_DROPIN_DIR_EXISTS $([ -d /etc/systemd/system/%(prod)s.d ] && echo yes || echo no)"
for U in %(prod)s %(stage)s; do
  D=/etc/systemd/system/$U.d
  [ -d "$D" ] || continue
  for F in "$D"/*.conf; do [ -f "$F" ] && echo "HAS $U $(basename "$F")"; done
done
for U in %(prod)s %(stage)s; do
  P=$(systemctl show -p MainPID --value "$U" 2>/dev/null)
  echo "ACTIVE $U $(systemctl is-active "$U" 2>/dev/null)"
  [ -n "$P" ] && [ "$P" != "0" ] && tr '\0' '\n' < /proc/$P/environ 2>/dev/null \
    | grep -oE '^[A-Z_]+' | grep -E 'REALTIME|DOSSIER|PERSONAS|SUITE|PUBLISHERS|SIDECAR' \
    | sort -u | sed "s/^/SEES $U /"
done
"""

# Copies only the named files. Rewrites EnvironmentFile paths to production-owned copies so the
# two environments never share a mutable file. Verifies, and rolls back if verification fails.
APPLY_SCRIPT = r"""
set -u
SD=/etc/systemd/system/%(stage)s.d
PD=/etc/systemd/system/%(prod)s.d
BK=/root/.buildanddo-prodconfig-rollback
rm -rf "$BK"; mkdir -p "$BK"
if [ -d "$PD" ]; then cp -a "$PD"/. "$BK"/ 2>/dev/null || true; fi
echo "ROLLBACK_SAVED $BK"
mkdir -p "$PD"
for NAME in %(files)s; do
  S="$SD/$NAME"
  if [ ! -f "$S" ]; then echo "SKIP_MISSING $NAME"; continue; fi
  install -m 600 -o root -g root "$S" "$PD/$NAME"
  # An EnvironmentFile under a staging-named path is copied to a production-named twin, so the
  # two units never share one mutable file and a later edit to one cannot move the other.
  EF=$(grep -hoE '^[[:space:]]*EnvironmentFile=.*' "$S" | head -1 | sed 's/^[[:space:]]*EnvironmentFile=//' | sed 's/^-//' | tr -d '"')
  if [ -n "${EF:-}" ] && [ -f "$EF" ]; then
    NEW=$(printf '%%s' "$EF" | sed 's/staging/production/g; s/-stg/-prod/g')
    if [ "$NEW" = "$EF" ]; then NEW="${EF%%.env}.production.env"; fi
    install -m 600 -o root -g root "$EF" "$NEW"
    sed -i "s#^\([[:space:]]*EnvironmentFile=-\?\)\"\?$(printf '%%s' "$EF" | sed 's/[#&]/\\\\&/g')\"\?#\1$NEW#" "$PD/$NAME"
    echo "ENVFILE_FORKED $NAME"
  fi
  echo "INSTALLED $NAME"
done
systemctl daemon-reload
systemctl restart %(prod)s
sleep 6
STATE=$(systemctl is-active %(prod)s)
echo "AFTER_RESTART $STATE"
# Active is not answering. Ask the backend something only a working backend can answer.
CODE=$(curl -s -o /dev/null -w "%%{http_code}" -m 20 -A "Mozilla/5.0" https://buildanddo.com/hcgi/platform/api/ocn/health)
echo "HEALTH_HTTP $CODE"
if [ "$STATE" != "active" ] || [ "$CODE" != "200" ]; then
  echo "VERIFY_FAILED rolling back"
  rm -rf "$PD"; if [ -n "$(ls -A "$BK" 2>/dev/null)" ]; then mkdir -p "$PD"; cp -a "$BK"/. "$PD"/; fi
  systemctl daemon-reload; systemctl restart %(prod)s; sleep 6
  echo "ROLLBACK_STATE $(systemctl is-active %(prod)s)"
  echo "ROLLBACK_HEALTH $(curl -s -o /dev/null -w "%%{http_code}" -m 20 -A "Mozilla/5.0" https://buildanddo.com/hcgi/platform/api/ocn/health)"
  exit 1
fi
P=$(systemctl show -p MainPID --value %(prod)s)
tr '\0' '\n' < /proc/$P/environ 2>/dev/null | grep -oE '^[A-Z_]+' \
  | grep -E 'REALTIME|DOSSIER|PERSONAS|SUITE' | sort -u | sed 's/^/NOW_SEES /'
"""


def parse(text: str) -> dict:
    out: dict = {"has": {}, "sees": {}, "active": {}, "lines": []}
    for raw in text.splitlines():
        parts = raw.strip().split()
        if not parts:
            continue
        out["lines"].append(raw.strip())
        if parts[0] == "HAS" and len(parts) >= 3:
            out["has"].setdefault(parts[1], []).append(parts[2])
        elif parts[0] == "SEES" and len(parts) >= 3:
            out["sees"].setdefault(parts[1], []).append(parts[2])
        elif parts[0] == "ACTIVE" and len(parts) >= 3:
            out["active"][parts[1]] = parts[2]
        elif parts[0] == "PROD_DROPIN_DIR_EXISTS" and len(parts) >= 2:
            out["prod_dropin_dir"] = parts[1] == "yes"
    return out


def plan() -> dict:
    code, stdout, stderr = on_box(PLAN_SCRIPT % {"prod": PROD_UNIT, "stage": STAGE_UNIT})
    if code != 0 and not stdout.strip():
        return {"schema": SCHEMA, "state": "UNMEASURED", "reason": (stderr or "ssh failed")[:200]}
    seen = parse(stdout)
    have = set(seen["has"].get(PROD_UNIT, []))
    staging_has = set(seen["has"].get(STAGE_UNIT, []))
    missing = [n for n in PORTABLE if n in staging_has and n not in have]
    return {
        "schema": SCHEMA, "state": "PLAN", "production_dropin_dir": seen.get("prod_dropin_dir"),
        "production_has": sorted(have), "staging_has": sorted(staging_has),
        "would_install": [{"file": n, "because": PORTABLE[n]} for n in missing],
        "withheld": [{"file": n, "because": why} for n, why in WITHHELD.items()
                     if n in staging_has],
        "production_sees_now": sorted(seen["sees"].get(PROD_UNIT, [])),
        "staging_sees_now": sorted(seen["sees"].get(STAGE_UNIT, [])),
        "active": seen["active"],
    }


def apply(files: list[str]) -> dict:
    script = APPLY_SCRIPT % {"prod": PROD_UNIT, "stage": STAGE_UNIT, "files": " ".join(files)}
    code, stdout, stderr = on_box(script, timeout=600)
    seen = [line.strip() for line in stdout.splitlines() if line.strip()]
    rolled = any(line.startswith("VERIFY_FAILED") for line in seen)
    now = sorted(line.split(" ", 1)[1] for line in seen if line.startswith("NOW_SEES "))
    return {"schema": SCHEMA, "state": "ROLLED_BACK" if rolled else ("APPLIED" if code == 0 else "FAILED"),
            "installed": [line.split(" ", 1)[1] for line in seen if line.startswith("INSTALLED ")],
            "env_files_forked": [line.split(" ", 1)[1] for line in seen if line.startswith("ENVFILE_FORKED ")],
            "production_now_sees": now, "transcript": seen,
            "stderr": (stderr or "").strip()[:300]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true",
                        help="A3: write the drop-ins and restart the production backend")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = plan()
    if args.apply:
        if result.get("state") != "PLAN":
            print(json.dumps(result, indent=2))
            return 1
        wanted = [row["file"] for row in result["would_install"]]
        if not wanted:
            result["note"] = "production already has every portable drop-in; nothing to do"
        else:
            result["apply"] = apply(wanted)

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print("production runtime config  unit=%s  %s" % (PROD_UNIT, result.get("state")))
    if result.get("reason"):
        print("  " + result["reason"])
        return 1
    print("  production drop-in directory exists: %s" % result.get("production_dropin_dir"))
    print("  production sees now: %s" % (", ".join(result["production_sees_now"]) or "nothing"))
    print("  staging sees now:    %s" % (", ".join(result["staging_sees_now"]) or "nothing"))
    for row in result["would_install"]:
        print("  WOULD INSTALL %s\n      because %s" % (row["file"], row["because"]))
    for row in result["withheld"]:
        print("  WITHHELD      %s\n      because %s" % (row["file"], row["because"]))
    applied = result.get("apply")
    if applied:
        print("  apply: %s" % applied["state"])
        for line in applied["transcript"]:
            print("      " + line)
        return 0 if applied["state"] == "APPLIED" else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
