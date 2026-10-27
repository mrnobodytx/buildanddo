#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/bundle_telemetry_check.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TELEMETRY-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     none
# EnumType:    Gate
# EnumEdges:   VALIDATES dist/apps/web; CONSUMED_BY scripts/deploy/ship.py; CONSUMED_BY tools/buildanddo_release.py
# DAG Node:    none
# Intent:      Refuse to ship a web build that cannot report. A build without its telemetry keys
#              runs fine, errors nowhere, and sends nothing, so nothing downstream can notice it.
# ───────────────────────────────────────────────────────────────
"""Check that a built web bundle carries its telemetry keys, before it is deployed.

WHY THIS EXISTS. On 2026-09-24 production served a build without telemetry keys from 02:08 to
13:56 UTC. Nothing errored: telemetry.js returns early when its key is undefined, and Datadog RUM
does the same. Both tools simply went quiet, and a quiet dashboard reads like a quiet product. The
same held for a CI artifact built on 2026-09-18 (job 93623). Neither deploy path looked at the
bytes it shipped, and the release controller builds with whatever apps/web/.env happens to sit in
the checkout, which it never writes itself.

WHAT IT CHECKS, in the entry script(s) that index.html loads, then in every other JS asset:
  posthog_key           a PostHog project key (phc_...)
  datadog_client_token  a Datadog RUM client token (pub + 32 hex)
  posthog_init          the literal `capture_pageleave:!0`, which proves our PostHog init survived
                        minification into the shipped bytes

It reports booleans and file names only. It never prints a key, even though both are public,
client-side identifiers that ship in the bundle anyway.

Usage:  python scripts/deploy/bundle_telemetry_check.py <dist dir>     (exit 0 = PASS, 1 = FAIL)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CHECKS = {
    "posthog_key": re.compile(r"phc_[A-Za-z0-9]{20,}"),
    "datadog_client_token": re.compile(r"pub[0-9a-f]{32}"),
    "posthog_init": re.compile(re.escape("capture_pageleave:!0")),
}
_ENTRY = re.compile(r"""<script\b[^>]*\bsrc=["']([^"']+\.js)["']""", re.IGNORECASE)


def _web_root(dist: Path) -> Path | None:
    for candidate in (dist, dist / "apps" / "web"):
        if (candidate / "index.html").is_file():
            return candidate
    return None


def check_dist(dist: Path | str) -> dict:
    """Return {"ok", "checks", "entry_scripts", "files_scanned", "reason"} for one built bundle."""
    dist = Path(dist)
    web = _web_root(dist)
    if web is None:
        return {"ok": False, "checks": {}, "entry_scripts": [], "files_scanned": 0,
                "reason": f"no index.html under {dist}"}
    index = web / "index.html"
    entries = []
    for src in _ENTRY.findall(index.read_text(encoding="utf-8", errors="replace")):
        path = (web / src.lstrip("/")).resolve()
        if path.is_file() and path.is_relative_to(web.resolve()):
            entries.append(path)
    # Entry scripts first: that is where the init lives today. Every other chunk after, so a
    # future code split cannot turn this check into a false FAIL.
    rest = sorted(p.resolve() for p in (web / "assets").rglob("*.js")) if (web / "assets").is_dir() else []
    ordered = entries + [p for p in rest if p not in entries]

    found = {name: False for name in CHECKS}
    scanned = 0
    for path in ordered:
        if all(found.values()):
            break
        text = path.read_text(encoding="utf-8", errors="replace")
        scanned += 1
        for name, pattern in CHECKS.items():
            if not found[name] and pattern.search(text):
                found[name] = True

    missing = [name for name, ok in found.items() if not ok]
    return {
        "ok": not missing and bool(ordered),
        "checks": found,
        "entry_scripts": [p.relative_to(web.resolve()).as_posix() for p in entries],
        "files_scanned": scanned,
        "reason": "" if not missing else
                  "built without telemetry: missing " + ", ".join(missing)
                  + " (is apps/web/.env present? scripts/deploy/ship.py writes it from workspace.env)",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    result = check_dist(argv[1])
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
