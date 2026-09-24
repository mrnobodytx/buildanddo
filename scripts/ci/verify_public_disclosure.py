#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-UPGRADE-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/verify_public_disclosure.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/verify_public_boundary.py
# EnumType:    Service
# EnumEdges:   EXTENDS scripts/ci/verify_public_boundary.py;
#              CONSUMES apps/web/public, dist/apps/web;
#              PRODUCES state/public_disclosure/latest.json
# Intent:      Scan what the site ACTUALLY SERVES for private-estate disclosure, because the
#              existing gate scans tracked source and the leak was in a generated file.
# ───────────────────────────────────────────────────────────────
"""Infrastructure disclosure scan for the public web surface.

    scan [--root .] [--json] [--strict]

WHY THIS EXISTS, MEASURED 2026-09-20 AGAINST LIVE PRODUCTION. `https://buildanddo.com/roadmap-status.json`
was serving, to anyone:

    state/ocn_login/audit.latest.json
    state/staging_backend/kvm1_install.latest.json
    state/tenant_rail/stage.latest.json
    kvm1

Those are CONTROLLER ESTATE paths and an internal host name. They are not in the public repo, and
they are not credentials - they are structure. Knowing a private control plane has a `tenant_rail`,
an `ocn_login` audit and a box called `kvm1` is reconnaissance, and it was published by the sprint
ledger's own evidence strings, which `sprint_cycle.py` documents as "public: it is rendered on
/roadmap".

WHY THE EXISTING GATE DID NOT CATCH IT. `verify_public_boundary.py` is sound and this does not
replace it. It has two blind spots that this covers:

  1. It enumerates `git ls-files` - TRACKED files only. `roadmap-status.json` and
     `capabilities.json` are GENERATED at build time and untracked, so the very artifacts that
     ship to the webroot were never examined. A gate that cannot see the output cannot guard it.
  2. Its patterns are credential-shaped: private keys, GitHub/GitLab PATs, provider `sk-` keys.
     Structural disclosure has no signature like that, so nothing was looking for it.

SEVERITY IS NOT UNIFORM, and collapsing it would make this unusable. A leaked private key is an
incident; a repo-relative source path on a public repository is nothing. So:

  * BLOCK   - credentials and private key material. Never acceptable, at any time.
  * WARN    - private-estate structure: internal hostnames, controller `state/` paths, RFC1918
              addresses, infrastructure public IPs, seat mailboxes. Publishing these is a
              decision someone may legitimately make; making it SILENTLY is the defect.
  * IGNORED - `apps/web/...` and other public-repo paths. The repository is public by design;
              flagging them trains people to ignore the report.

Standard library only, matching the rest of scripts/ci/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

BLOCK, WARN = "BLOCK", "WARN"

# Each rule is (id, severity, pattern, why it matters).
RULES: list[tuple[str, str, re.Pattern, str]] = [
    ("private_key", BLOCK, re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
     "private key material"),
    ("github_pat", BLOCK, re.compile(r"(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}"), "GitHub token"),
    ("gitlab_pat", BLOCK, re.compile(r"glpat-[A-Za-z0-9_-]{12,}"), "GitLab token"),
    ("provider_sk", BLOCK, re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), "provider secret key"),
    # Captures the VALUE only, so CODE_REFERENCE below can tell a credential from a property access.
    ("bearer_literal", BLOCK, re.compile(r"(?i)\b(?:authorization|bearer)\b\s*[\"':=]\s*([A-Za-z0-9_\-.]{20,})"),
     "literal bearer credential"),

    # Structure. The leading (?i) and the absence of a trailing \b are deliberate: the first
    # version of this scan used \bkvm\d\b and missed "kvm1_install" outright, because "_" is a
    # word character. A boundary that fails on the real data is worse than no boundary.
    ("private_ipv4", WARN,
     re.compile(r"(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}"
                r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})"),
     "RFC1918 address - reveals internal mesh addressing"),
    ("internal_host", WARN,
     re.compile(r"(?i)kvm\d|\brig[12]\b|mesh-(?:control|memory|dev)|ray-tor1-\d|srv\d{6,}"
                r"|hstgr\.cloud|CNI-SERVICE-BOX"),
     "internal host name"),
    # Added 2026-09-22. The rule above lists BOX names and had no opinion about SERVICE
    # hostnames, so `apps/web/public/activity-status.json` was serving
    # the private GitLab host (x3) and the memory-substrate host to anyone who fetched
    # https://buildanddo.com/activity-status.json - a 200, in the built public surface this
    # scan already covers. The private GitLab and the MCP substrate are the two endpoints an
    # attacker would most want named, and they were named on the product's own status file.
    # buildanddo.com itself is deliberately excluded: it is the public product.
    # NAMED INTERNAL SUBDOMAINS ONLY. The first version of this matched any
    # *.citadel-nexus.com and immediately flagged ten footer, contact and policy links plus
    # workshop.citadel-nexus.com - the company's own PUBLIC surface, which the product is
    # supposed to link to. That is the "cries wolf" failure the IGNORED comment below warns
    # about, so the rule names the control-plane subdomains instead of guessing from shape.
    ("citadel_service_host", WARN,
     re.compile(r"(?i)\b(?:gitlab|mcp|memory|nats|vault|panel|ops|forge|hub|runner|registry)"
                r"\.citadel-nexus\.com\b"),
     "private Citadel control-plane hostname"),
    # Public addresses. Added 2026-09-22 after SEVEN fleet IPs were found sitting in tracked
    # files - docs/RBAC_ACCEPTANCE_2026-09-20.md carried a full box-name-to-address-to-role
    # table, submissions/hostinger/submission.json cited five of them as evidence, and
    # scripts/deploy/ship.py hardcoded the production VM as a fallback. Every one was a PUBLIC
    # DigitalOcean or Hostinger address, so `private_ipv4` above could never have matched them.
    #
    # The estate's own addresses are deliberately NOT enumerated here: writing them into a file
    # that ships to the public mirror would publish exactly what the rule exists to keep out.
    # So the rule flags EVERY public IPv4 literal and BENIGN_IPV4 subtracts the known-harmless
    # ones - which means a NEW fleet address is caught by default, rather than by somebody
    # remembering to add it to a list.
    ("public_ipv4", WARN, re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
     "public IPv4 literal - an operational address for anyone who reads the mirror"),
    ("estate_state_path", WARN, re.compile(r"state/[a-z0-9_]+/[A-Za-z0-9_.-]+"),
     "controller-estate path - reveals private control-plane structure"),
    ("windows_path", WARN, re.compile(r"[A-Z]:\\[A-Za-z0-9_\\/.-]{4,}"),
     "operator workstation path"),
    ("loopback_port", WARN, re.compile(r"127\.0\.0\.1:\d+"), "internal service port"),
    ("seat_mailbox", WARN, re.compile(r"[A-Za-z0-9._%+-]+@(?:citadel-nexus\.com|ocn\.buildanddo\.invalid)"),
     "seat mailbox"),
]

# The repository is public, so its own paths are not a disclosure. Listed explicitly rather than
# left to a narrow regex, because a scan that cries wolf gets muted and then catches nothing.
IGNORED = re.compile(r"^(?:apps/|src/|public/|docs/|scripts/ci/|scripts/deploy/|tests/)")

# A dotted identifier chain - `this.authStore.token`, `client.authStore.token` - is a property
# access, not a secret. Measured 2026-09-20: without this guard the minified PocketBase SDK raised
# two BLOCK findings and this gate would have failed every build on correct source. A gate that
# cries wolf on working code is a gate somebody switches off, which is worse than no gate.
CODE_REFERENCE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$")

# Subtracted from `public_ipv4`: public resolvers, the RFC 5737 documentation ranges, the
# obvious placeholder, and the RFC1918/loopback/link-local space that `private_ipv4` already
# reports (listing them here stops one address raising two findings). Anything NOT on this
# list is treated as a real operational address until a person decides otherwise.
BENIGN_IPV4 = re.compile(
    r"^(?:0\.0\.0\.0|255\.255\.255\.255"
    r"|1\.1\.1\.1|1\.0\.0\.1|8\.8\.8\.8|8\.8\.4\.4|9\.9\.9\.9"           # public resolvers
    r"|1\.2\.3\.4|192\.0\.2\.\d{1,3}|198\.51\.100\.\d{1,3}|203\.0\.113\.\d{1,3}"  # docs/placeholder
    r"|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}"        # loopback, link-local
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}"         # covered by private_ipv4
    r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$"
)

SCAN_DIRS = ("apps/web/public", "dist/apps/web")
TEXT_EXT = {".json", ".txt", ".html", ".js", ".css", ".xml", ".md", ".svg", ".webmanifest"}
MAX_BYTES = 4_000_000


def scan_text(rel: str, text: str) -> list[dict]:
    """Apply every rule to one file's text.

    Args:
        rel: Path shown in the report.
        text: File contents.

    Returns:
        Finding dicts, deduplicated per (rule, match).
    """
    out: list[dict] = []
    seen: set[tuple] = set()
    for rule_id, sev, rx, why in RULES:
        for m in rx.findall(text):
            hit = m if isinstance(m, str) else str(m)
            if IGNORED.match(hit) or CODE_REFERENCE.match(hit):
                continue
            if rule_id == "public_ipv4" and BENIGN_IPV4.match(hit):
                continue
            key = (rule_id, hit)
            if key in seen:
                continue
            seen.add(key)
            out.append({"file": rel, "rule": rule_id, "severity": sev, "match": hit[:120], "why": why})
    return out


def _targets(root: Path, tracked: bool, missing: list[str]):
    """Yield repo-relative paths to scan, for whichever surface was asked for.

    TWO SURFACES, and conflating them is what let seven fleet addresses through. The built
    web surface (SCAN_DIRS) is what a visitor to buildanddo.com can fetch. The TRACKED files
    are what a reader of the public GitHub mirror can clone - a different, larger set that
    nothing was checking, even though the operator's rule is that GitHub is public-facing and
    must be scrubbed before release. `docs/`, `submissions/` and `scripts/deploy/` are not
    served to the web at all, which is exactly why they went unexamined.
    """
    if tracked:
        result = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True)
        if result.returncode != 0:
            missing.append("git ls-files (not a repository?)")
            return
        for rel in result.stdout.split("\n"):
            rel = rel.strip()
            if rel and Path(rel).suffix.lower() in TEXT_EXT and (root / rel).is_file():
                yield rel
        return
    for rel_dir in SCAN_DIRS:
        base = root / rel_dir
        if not base.is_dir():
            missing.append(rel_dir)
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix.lower() in TEXT_EXT:
                yield str(path.relative_to(root)).replace("\\", "/")


def scan(root: Path = ROOT, tracked: bool = False) -> dict:
    """Scan the built public surface, or (with tracked=True) every tracked file.

    Returns:
        A report dict. `state` is FAIL only on BLOCK findings; WARN findings are reported
        without failing, because structural disclosure is a decision, not an accident.
    """
    findings: list[dict] = []
    scanned = 0
    missing: list[str] = []
    for rel in _targets(root, tracked, missing):
        path = root / rel
        try:
            if path.stat().st_size > MAX_BYTES:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        scanned += 1
        findings.extend(scan_text(rel, text))

    blocks = [f for f in findings if f["severity"] == BLOCK]
    warns = [f for f in findings if f["severity"] == WARN]
    return {
        "schema": "buildanddo.public-disclosure/v1",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        # UNMEASURED when there was nothing to look at: an empty scan is not a clean scan.
        "state": "FAIL" if blocks else ("UNMEASURED" if scanned == 0 else "PASS"),
        "files_scanned": scanned,
        "dirs_missing": missing,
        "blocks": len(blocks),
        "warnings": len(warns),
        "findings": blocks + warns,
        "rule": "BLOCK fails the gate; WARN is published structure that a person must decide to "
                "keep or remove. Scanning nothing is UNMEASURED, never PASS.",
    }


def render(report: dict) -> str:
    lines = [f"PUBLIC DISCLOSURE SCAN  {report['generated_at']}  [{report['state']}]",
             f"  {report['files_scanned']} files scanned  "
             f"{report['blocks']} block  {report['warnings']} warn"
             + (f"  (missing: {', '.join(report['dirs_missing'])})" if report["dirs_missing"] else ""),
             ""]
    by_file: dict[str, list[dict]] = {}
    for f in report["findings"]:
        by_file.setdefault(f["file"], []).append(f)
    for rel, fs in sorted(by_file.items()):
        lines.append(f"  {rel}")
        for f in fs:
            lines.append(f"     [{f['severity']:<5}] {f['rule']:<20} {f['match'][:60]}")
            lines.append(f"              {f['why']}")
    if not report["findings"]:
        lines.append("  no disclosure found")
    return "\n".join(lines)


def _selftest() -> int:
    """Controls for the rules that matter, including the boundary bug this scan was born from."""
    fails = []

    def check(name, got, want):
        if got != want:
            fails.append(f"{name}: want {want!r} got {got!r}")
        print(f"  {'OK  ' if got == want else 'FAIL'} {name}")

    ids = lambda t: sorted({f["rule"] for f in scan_text("x.json", t)})  # noqa: E731

    # THE ORIGINAL MISS: \bkvm\d\b cannot match kvm1_install because "_" is a word character.
    check("kvm1_install is caught", "internal_host" in ids("state/staging_backend/kvm1_install.latest.json"), True)
    check("estate state path is caught",
          "estate_state_path" in ids("state/tenant_rail/stage.latest.json"), True)
    check("RFC1918 is caught", "private_ipv4" in ids("connect 10.100.0.11 now"), True)
    check("loopback port is caught", "loopback_port" in ids("sidecar at 127.0.0.1:8092"), True)
    check("seat mailbox is caught", "seat_mailbox" in ids("forge@ocn.buildanddo.invalid"), True)
    # Fixtures are ASSEMBLED, never written literally: a scanner whose own source trips its own
    # BLOCK rules fails every repo-wide run on itself, which is how a gate gets excluded and then
    # stops guarding anything. Measured 2026-09-20 - the literal versions did exactly that.
    fake_key = "-----BEGIN " + "OPENSSH PRIVATE KEY" + "-----"
    fake_jwt = "ey" + "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + "abcdef"
    check("private key is BLOCK", [f["severity"] for f in scan_text("k", fake_key)], ["BLOCK"])

    # The public repo's own paths must NOT be flagged, or the report gets muted.
    check("public repo path is ignored", ids("apps/web/src/pages/RoadmapPage.jsx"), [])
    check("clean text is clean", ids("Every milestone is replayed against its evidence."), [])
    # THE FALSE POSITIVE that would have failed every build: minified SDK property access.
    check("SDK property access is not a credential",
          ids("headers.Authorization=this.client.authStore.token"), [])
    check("a real bearer literal IS still caught",
          "bearer_literal" in ids("Authorization: " + fake_jwt), True)
    # A scan that looked at nothing must not read as PASS.
    empty = {"state": "UNMEASURED"}
    check("empty scan is UNMEASURED, not PASS", empty["state"] != "PASS", True)

    print()
    if fails:
        print(f"SELFTEST FAILED ({len(fails)})")
        for f in fails:
            print("   ", f)
        return 1
    print("SELFTEST PASSED")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--strict", action="store_true", help="exit 1 on WARN as well as BLOCK")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--write", action="store_true", help="write state/public_disclosure/latest.json")
    ap.add_argument("--repo", action="store_true",
                    help="scan every TRACKED file (what the public mirror publishes) instead of "
                         "the built web surface (what buildanddo.com serves)")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()

    root = Path(args.root).resolve()
    report = scan(root, tracked=args.repo)
    print(json.dumps(report, indent=2) if args.json else render(report))
    if args.write:
        out = root / "state" / "public_disclosure" / "latest.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out.relative_to(root)}")
    if report["blocks"]:
        return 1
    if args.strict and report["warnings"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
