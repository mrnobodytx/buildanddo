#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/public_redaction.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PUBLIC-REDACTION-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     none
# EnumType:    Service
# EnumEdges:   CONSUMED_BY scripts/ci/fleet_report.py; CONSUMED_BY scripts/ci/capability_inventory.py;
#              CONSUMED_BY scripts/deploy/roadmap_status.py; VERIFIED_BY tests/upgrade/test_public_redaction.py
# Intent:      Apply the estate's rule - no IP address and no fleet machine name in public text - from
#              inside this repository, without this repository ever holding a real machine name.
# ───────────────────────────────────────────────────────────────
"""public_redaction.py - no IP address and no fleet machine name in anything this repository publishes.

The operator's rule of 2026-09-22: no public BuildAndDo surface may carry any IP address - not only
the fleet's, not only private ranges - or any name a fleet machine goes by. The estate applies it
with a module that lives outside this repository, so until now nothing in this repository's build
checked what the build publishes (measured 2026-09-23: platform-health.json named a fleet machine,
and the site bundle shipped another).

Machine names come in two kinds:

* families - the patterns fleet machines follow. They are the only names this file carries. This
  repository is public, so a real machine name written here would itself be the leak.
* the exact fleet list - read at run time from the private fleet map named by CITADEL_FLEET_MAP
  (every box id, its "aka" names, its Datadog host, provider name and hostname, and retired ids).
  When it is unset, only the families apply, and ``Rule.source`` says so.

In published text an address becomes a solid bar, loopback becomes "localhost", and a machine name
becomes the bar, so a reader sees that something was withheld. A scan does not count loopback or the
unspecified address, since neither identifies a machine.

    python scripts/ci/public_redaction.py scan <file or directory>...
        report counts per file (never the values found) and exit 1 when anything matched
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

BAR = "█" * 8
FLEET_MAP_ENV = "CITADEL_FLEET_MAP"
FLEET_NAME_FIELDS = ("aka", "datadog_host", "provider_name", "hostname")
TEXT_SUFFIXES = {".html", ".js", ".mjs", ".css", ".json", ".txt", ".xml", ".svg", ".webmanifest", ".md",
                 ".yaml", ".yml", ".map"}

# ── IP addresses (the estate's boundaries) ───────────────────────────────────────────────────
# Bounded by "not part of a longer dotted number", not by "no dot at all", so an address that ends a
# sentence ("from 198.51.100.4.") is still found, and a version like 1.2.3.4.5 is not.
IPV4 = re.compile(r"(?<!\d)(?<!\d\.)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\d)(?!\.\d)")
IPV6 = re.compile(
    r"(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}(?![\w:])"
    r"|(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5})?(?![\w:])"
    r"|(?<![\w:])::[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6}(?![\w:])"
)
LOOPBACK_V4 = re.compile(r"(?<!\d)(?<!\d\.)127\.0\.0\.1(?!\d)(?!\.\d)")
LOOPBACK = {"127.0.0.1", "::1"}
# The unspecified address means "no particular address". A WebRTC offer names it before any candidate is
# known, so the voice SDK's chunk carries it (measured 2026-09-23, SRS-BUILDANDDO-BUDDI-003). Like loopback,
# it identifies no machine, so a scan lets it through. The IPv6 form "::" is never matched in the first place.
UNSPECIFIED = {"0.0.0.0"}


def real_v6(candidate: str) -> bool:
    """``a::b`` is IPv6-shaped, and in text it is code; a real address is loopback or has 4+ hex digits."""
    return candidate == "::1" or sum(c != ":" for c in candidate) >= 4


# ── machine names ────────────────────────────────────────────────────────────────────────────
# Families only. The estate's own list spells two machines out in full; this public copy keeps only
# their family, so the exact names reach a check solely through the private fleet map.
FAMILIES = (
    r"ray-[a-z]{3}\d+-\d+",
    r"mesh-[a-z]+",
    r"kvm\d+",
    r"rig\d+",
    r"CNI-SERVICE-BOX-[A-Z]+",
    r"srv\d{6,}",                      # hosting-provider server ids
    r"DESKTOP-[A-Z0-9]{7}",            # Windows machine names
)


def fleet_names(path: Path) -> set[str]:
    """Every name a machine goes by in the private fleet map; empty when the map cannot be read."""
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    names: set[str] = set()
    for key, box in (doc.get("boxes") or {}).items():
        names.add(key)
        for field in FLEET_NAME_FIELDS:
            value = box.get(field) if isinstance(box, dict) else None
            for item in [value] if isinstance(value, str) else (value or []):
                if isinstance(item, str) and item and not IPV4.search(item):
                    names.add(item)
    for key in doc.get("retired") or {}:
        if isinstance(key, str) and not IPV4.search(key):
            names.add(key)
    return {name for name in names if len(name) >= 4}


# Families broad enough to occur inside ordinary compound words ("capability-mesh-fallback"). For these a
# hyphen still counts as part of the word.
WORD_BOUND_FAMILIES = (r"mesh-[a-z]+",)


def _machine_pattern(names: set[str]) -> re.Pattern[str]:
    # Bounded by letters and digits only. "_" is a boundary: a name glued into a file name
    # ("<machine>_install.sh") slipped past the first version of the estate's rule. So is "-": a name joined
    # into a slug ("codegen-<machine>-broadcast") slipped past the next one. Only the broad families above keep
    # "-" as part of the word.
    exact = sorted((re.escape(name) for name in names), key=len, reverse=True)
    specific = exact + [family for family in FAMILIES if family not in WORD_BOUND_FAMILIES]
    return re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(specific) + r")(?![A-Za-z0-9])"
                      r"|(?<![A-Za-z0-9-])(?:" + "|".join(WORD_BOUND_FAMILIES) + r")(?![A-Za-z0-9-])",
                      re.IGNORECASE)


class Rule:
    """The rule, bound to one fleet map (or to none).

    Args:
        fleet_map: Path of the private fleet map. None reads CITADEL_FLEET_MAP; "" means families only.
    """

    def __init__(self, fleet_map: str | Path | None = None) -> None:
        path = os.environ.get(FLEET_MAP_ENV, "") if fleet_map is None else str(fleet_map)
        self.names = fleet_names(Path(path)) if path else set()
        if self.names:
            self.source = "families and the private fleet map"
        elif path:
            self.source = "families only: the fleet map named by CITADEL_FLEET_MAP could not be read"
        else:
            self.source = "families only: CITADEL_FLEET_MAP is not set"
        self.machine = _machine_pattern(self.names)

    def find_ips(self, text: str | None, allow_loopback: bool = False) -> list[str]:
        """Addresses in the text. A scan allows loopback, which code compares a hostname against, and the
        unspecified address, which a WebRTC offer names; neither identifies a machine."""
        text = text or ""
        found = set(IPV4.findall(text)) | {m for m in IPV6.findall(text) if real_v6(m)}
        return sorted(found - LOOPBACK - UNSPECIFIED if allow_loopback else found)

    def find_machines(self, text: str | None) -> list[str]:
        return sorted({m.group(0) for m in self.machine.finditer(text or "")})

    def find_leaks(self, text: str | None, allow_loopback: bool = False) -> dict[str, list[str]]:
        return {"ips": self.find_ips(text, allow_loopback), "machines": self.find_machines(text)}

    def redact(self, text: str | None) -> str:
        text = LOOPBACK_V4.sub("localhost", text or "")
        text = IPV4.sub(BAR, text)
        text = IPV6.sub(lambda m: BAR if real_v6(m.group(0)) else m.group(0), text)
        return self.machine.sub(BAR, text)

    def redact_document(self, document: Any) -> tuple[Any, int]:
        """Redact every string (keys and values) of a JSON-shaped document; return it and the count changed."""
        withheld = 0

        def walk(value: Any) -> Any:
            nonlocal withheld
            if isinstance(value, str):
                clean = self.redact(value)
                withheld += clean != value
                return clean
            if isinstance(value, dict):
                return {walk(key): walk(item) for key, item in value.items()}
            if isinstance(value, list):
                return [walk(item) for item in value]
            return value

        return walk(document), withheld


def report_withheld(rule: Rule, withheld: int, target: str) -> None:
    """One line on stderr per published file: how many values were withheld, never which."""
    print(f"public_redaction: {withheld} value(s) withheld from {target} ({rule.source})", file=sys.stderr)


# SVG geometry in a bundle is runs of numbers, and a run of four can read as an address. Only path data
# and point lists are removed before a scan; everything else in the file is still read.
_SVG_GEOMETRY = re.compile(r"""\b(?:d|points)\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`)""")


def strip_svg_geometry(text: str) -> str:
    return _SVG_GEOMETRY.sub('d:""', text)


def scan_tree(root: Path, rule: Rule, allow_loopback: bool = True) -> dict[str, dict[str, int]]:
    """Scan every text file under root (or root itself); return {relative path: counts} for files that match."""
    root = Path(root)
    files = [root] if root.is_file() else sorted(p for p in root.rglob("*") if p.is_file())
    found: dict[str, dict[str, int]] = {}
    for path in files:
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        text = strip_svg_geometry(path.read_text(encoding="utf-8", errors="replace"))
        leaks = rule.find_leaks(text, allow_loopback=allow_loopback)
        if leaks["ips"] or leaks["machines"]:
            relative = path.name if root.is_file() else path.relative_to(root).as_posix()
            found[relative] = {"ips": len(leaks["ips"]), "machines": len(leaks["machines"])}
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    scan = sub.add_parser("scan", help="scan files or directories; counts only, never the values")
    scan.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args(argv)
    rule = Rule()
    total = 0
    for path in args.paths:
        for relative, counts in scan_tree(path, rule).items():
            total += 1
            print(f"LEAK {path}/{relative}: {counts['ips']} address(es), {counts['machines']} machine name(s)")
    print(f"{'FAIL' if total else 'PASS'}: {total} file(s) carry an address or a machine name ({rule.source})")
    return 1 if total else 0


if __name__ == "__main__":
    raise SystemExit(main())
