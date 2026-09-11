# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        services/buildanddo_visual_substrate/leakcheck.py
# Stage:       09_RUNTIME
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     (stdlib only)
# EnumType:    Service
# EnumEdges:   VALIDATES projection bodies before they reach the browser;
#              VERIFIED_BY services/buildanddo_visual_substrate/__main__.py --selftest
# Intent:      Second, independent leak gate on this side of the platform boundary:
#              Citadel Nexus cleanses before sending, BuildAndDo re-checks before
#              rendering, and a violation returns a reason, never the body.
# ───────────────────────────────────────────────────────────────
"""Leak check for projection bodies about to be handed to a browser.

The upstream bridge already cleanses and verifies. This gate exists because a
boundary that is only checked on one side is checked on no side: a regression in
the upstream cleanser, a mis-routed response, or a mocked upstream in development
must all still fail closed here.

Findings are reported as ``kind:excerpt`` where the excerpt is the matched token
only (never surrounding context), so a finding can be logged without re-leaking.
"""
from __future__ import annotations

import re

#: RFC1918 mesh ranges. Anchored on non-digit boundaries so "110.0.0.5" does not match.
_MESH_IP = re.compile(
    r"(?<![\d.])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3})(?![\d.])")

_NATS_URL = re.compile(r"nats://", re.IGNORECASE)

#: Small, explicit denylist of internal host names / suffixes. Kept short on purpose:
#: a broad list produces false positives on ordinary words, and every entry here is a
#: name that has no business in a public projection at all.
INTERNAL_HOST_TOKENS: tuple[str, ...] = (
    "mesh-memory", "mesh-hub", "vps-hub", "kvm1", "kvm8", "wg0", "wireguard",
    ".internal", ".local", ".lan", ".mesh",
)
_INTERNAL_HOST = re.compile(
    "|".join(re.escape(tok) for tok in INTERNAL_HOST_TOKENS), re.IGNORECASE)

#: Absolute filesystem paths. URL paths such as "/api/rooms" are NOT matched: only
#: well-known filesystem roots and Windows drive prefixes count.
_ABS_PATH = re.compile(
    r"(?<![\w/])(?:/(?:opt|etc|var|home|root|srv|usr|tmp|mnt|data)/[\w.\-/]+"
    r"|[A-Za-z]:\\[\w.\-\\]+)")

_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("mesh_ip", _MESH_IP),
    ("nats_url", _NATS_URL),
    ("internal_host", _INTERNAL_HOST),
    ("absolute_path", _ABS_PATH),
)


def find_leaks(text: str, limit: int = 8) -> list[str]:
    """Return up to ``limit`` findings as ``kind:token``; empty means clean."""
    findings: list[str] = []
    for kind, rx in _RULES:
        for match in rx.finditer(text):
            findings.append(f"{kind}:{match.group(0)[:48]}")
            if len(findings) >= limit:
                return findings
    return findings


def is_clean(text: str) -> bool:
    return not find_leaks(text, limit=1)
