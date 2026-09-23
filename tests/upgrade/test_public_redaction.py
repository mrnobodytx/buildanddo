# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_public_redaction.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PUBLIC-REDACTION-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/public_redaction.py, scripts/ci/fleet_report.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/public_redaction.py; VALIDATES scripts/ci/fleet_report.py;
#              VALIDATES apps/web/src/lib/operatorPlane.js
# Intent:      Prove that nothing the build publishes names a fleet machine or carries an IP address,
#              with controls that plant each kind of leak and show it is caught.
# ───────────────────────────────────────────────────────────────
"""Nothing this repository publishes may carry an IP address or a fleet machine name.

Measured 2026-09-23 on the live site: platform-health.json named the host the GitLab runner is on,
and the Operator page's bundle carried another fleet machine as a system id. These tests build
platform-health.json the way the build does and scan it, the web source that can ship, and the built
site in dist/apps/web.

Every name and address below is made up or from a documentation range. This repository is public, so
a real machine name in a fixture would itself be the leak. Exact fleet names reach the rule only
through the private map named by CITADEL_FLEET_MAP; without it the exact-name test is skipped, and
says so, rather than passing.
"""
from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.ci import fleet_report
from scripts.ci import public_redaction as redaction

ROOT = Path(__file__).resolve().parents[2]
WEB_SRC = ROOT / "apps" / "web" / "src"
WEB_PUBLIC = ROOT / "apps" / "web" / "public"
DIST = ROOT / "dist" / "apps" / "web"
FAMILY_NAME = "ray-xyz0-0"          # follows a machine family; no machine carries it
DOC_IP = "203.0.113.9"              # documentation range (RFC 5737)
UNSPECIFIED_IP = "0.0.0.0"          # the unspecified address (RFC 1122): it names no machine


def build_platform_health(env: dict[str, str] | None = None) -> dict:
    """Run fleet_report as the build does, into a temporary directory, and return what it wrote."""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        out = io.StringIO()
        with mock.patch.dict(os.environ, env or {}), \
                mock.patch.object(fleet_report, "ROOT", root), \
                mock.patch.object(fleet_report, "PLATFORM_OUT", root / "platform-health.json"), \
                mock.patch.object(fleet_report, "FLEET_OUT", root / "fleet-status.json"), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            status = fleet_report.main([])
        if status != 0:
            raise AssertionError(f"fleet_report exited {status}: {out.getvalue()[-400:]}")
        return json.loads((root / "platform-health.json").read_text(encoding="utf-8"))


def families_only() -> dict[str, str]:
    return {redaction.FLEET_MAP_ENV: ""}


def ships(path: Path) -> bool:
    """Web source that can end up in the bundle: not tests, not test helpers."""
    text = path.as_posix()
    return (path.suffix in {".js", ".jsx", ".ts", ".tsx"} and "/__tests__/" not in text
            and "/src/test/" not in text and not re.search(r"\.(test|spec)\.[jt]sx?$", text))


class PublishedFilesTests(unittest.TestCase):
    """What the build writes and ships."""

    def test_platform_health_carries_no_family_name_or_address(self):
        document = build_platform_health(families_only())
        self.assertEqual(redaction.Rule("").find_leaks(json.dumps(document)), {"ips": [], "machines": []})

    @unittest.skipUnless(os.environ.get(redaction.FLEET_MAP_ENV),
                         "exact fleet names need the private map named by CITADEL_FLEET_MAP")
    def test_platform_health_carries_no_exact_fleet_name(self):
        rule = redaction.Rule()
        self.assertTrue(rule.names, rule.source)  # the map was read: a zero below is not vacuous
        document = build_platform_health()
        leaks = rule.find_leaks(json.dumps(document))
        self.assertEqual((len(leaks["ips"]), len(leaks["machines"])), (0, 0), "platform-health.json leaks")

    def test_web_source_that_can_ship_names_no_machine(self):
        rule = redaction.Rule()
        found = {}
        for path in sorted(p for p in WEB_SRC.rglob("*") if p.is_file() and ships(p)):
            text = redaction.strip_svg_geometry(path.read_text(encoding="utf-8", errors="replace"))
            leaks = rule.find_leaks(text, allow_loopback=True)
            if leaks["ips"] or leaks["machines"]:
                found[path.relative_to(ROOT).as_posix()] = {k: len(v) for k, v in leaks.items()}
        for relative, counts in redaction.scan_tree(WEB_PUBLIC, rule).items():
            found[f"apps/web/public/{relative}"] = counts
        self.assertEqual(found, {}, f"counts only, never the values ({rule.source})")

    def test_built_site_carries_no_machine_name_or_address(self):
        if not DIST.is_dir():
            self.skipTest("no build at dist/apps/web: run `npm run build`, then this test")
        rule = redaction.Rule()
        self.assertEqual(redaction.scan_tree(DIST, rule), {}, f"counts only, never the values ({rule.source})")


class ControlTests(unittest.TestCase):
    """Each kind of leak, planted, is caught; what is not a leak is left alone."""

    def test_the_generator_withholds_a_name_planted_in_its_platforms(self):
        planted = copy.deepcopy(fleet_report.PLATFORMS)
        planted[0]["detail"] = f"{planted[0]['detail']} Runs on {FAMILY_NAME}, reachable at {DOC_IP}."
        with mock.patch.object(fleet_report, "PLATFORMS", planted):
            document = build_platform_health(families_only())
        self.assertEqual(redaction.Rule("").find_leaks(json.dumps(document)), {"ips": [], "machines": []})
        self.assertIn(redaction.BAR, document["platforms"][0]["detail"])

    def test_a_planted_family_name_and_address_are_caught_and_withheld(self):
        rule = redaction.Rule("")
        document = {"platforms": [{"detail": f"Runs on {FAMILY_NAME}, reachable at {DOC_IP}."}]}
        self.assertEqual(rule.find_leaks(json.dumps(document)), {"ips": [DOC_IP], "machines": [FAMILY_NAME]})
        clean, withheld = rule.redact_document(document)
        self.assertEqual(withheld, 1)
        self.assertEqual(clean["platforms"][0]["detail"], f"Runs on {redaction.BAR}, reachable at {redaction.BAR}.")

    def test_an_exact_name_reaches_the_rule_only_through_the_fleet_map(self):
        with tempfile.TemporaryDirectory() as tmp:
            fleet = Path(tmp) / "fleet.json"
            boxes = {"box-quartz-7": {"aka": ["Quartz-Seven"], "hostname": "quartz-host-7"}}
            fleet.write_text(json.dumps({"boxes": boxes, "retired": {"box-onyx-2": {}}}), encoding="utf-8")
            text = "runner on box-quartz-7 and quartz-host-7, once Quartz-Seven and box-onyx-2"
            self.assertEqual(redaction.Rule("").find_machines(text), [])
            self.assertEqual(redaction.Rule(fleet).find_machines(text),
                             ["Quartz-Seven", "box-onyx-2", "box-quartz-7", "quartz-host-7"])
            with mock.patch.dict(os.environ, {redaction.FLEET_MAP_ENV: str(fleet)}):
                self.assertEqual(redaction.Rule().source, "families and the private fleet map")
        with mock.patch.dict(os.environ, {redaction.FLEET_MAP_ENV: str(Path(tmp) / "gone.json")}):
            self.assertIn("could not be read", redaction.Rule().source)

    def test_a_name_joined_into_a_slug_or_a_file_name_is_caught(self):
        # A machine joined to other words by hyphens is still that machine. The first version of this rule
        # counted "-" as part of a name, and a handoff file named after the release machine passed it.
        rig = "rig0"                     # follows a machine family; no machine carries it
        rule = redaction.Rule("")
        for text in (f"2026-09-23-bits-codegen-{rig}-broadcast-classroom.md", f"handoff-to-{rig}",
                     f"{rig}-release", f"codegen-{FAMILY_NAME}-broadcast", f"seat-{FAMILY_NAME}"):
            self.assertTrue(rule.find_machines(text), text)
        with tempfile.TemporaryDirectory() as tmp:
            fleet = Path(tmp) / "fleet.json"
            fleet.write_text(json.dumps({"boxes": {"box-quartz-7": {}}}), encoding="utf-8")
            self.assertEqual(redaction.Rule(fleet).find_machines("deploy-box-quartz-7-now"), ["box-quartz-7"])
        # The broad mesh family keeps its word boundary: a compound word that merely contains it is no machine.
        self.assertEqual(rule.find_machines("capability-mesh-fallback, service-mesh-sidecar"), [])

    def test_addresses_are_caught_and_loopback_becomes_localhost(self):
        rule = redaction.Rule("")
        self.assertEqual(rule.find_ips(f"Served from {DOC_IP}."), [DOC_IP])
        self.assertEqual(rule.find_ips("v6 2001:db8::1 and ::1"), ["2001:db8::1", "::1"])
        self.assertEqual(rule.redact(f"from {DOC_IP} via http://127.0.0.1:8090"),
                         f"from {redaction.BAR} via http://localhost:8090")
        # Code that compares the page's hostname with loopback names no machine.
        self.assertEqual(rule.find_ips('h==="localhost"||h==="127.0.0.1"||h==="::1"', allow_loopback=True), [])

    def test_a_scan_passes_the_unspecified_address_and_still_fails_a_documentation_address(self):
        # A WebRTC offer names the unspecified address before any candidate is known, and the voice SDK's
        # chunk carries that text (SRS-BUILDANDDO-BUDDI-003). Like loopback, it identifies no machine.
        rule = redaction.Rule("")
        offer = f"o=- 4611 2 IN IP4 {UNSPECIFIED_IP} c=IN IP4 {UNSPECIFIED_IP} a=rtcp:9 IN IP4 {UNSPECIFIED_IP}"
        self.assertEqual(rule.find_ips(offer, allow_loopback=True), [])
        with tempfile.TemporaryDirectory() as tmp:
            chunk = Path(tmp) / "VoiceSession-x.js"
            chunk.write_text(f'const offer="{offer}";', encoding="utf-8")
            self.assertEqual(redaction.scan_tree(chunk, rule), {})
            # The control: a documentation address in the same place still fails the scan.
            chunk.write_text(f'const offer="{offer.replace(UNSPECIFIED_IP, DOC_IP)}";', encoding="utf-8")
            self.assertEqual(redaction.scan_tree(chunk, rule), {"VoiceSession-x.js": {"ips": 1, "machines": 0}})
        # Outside a scan the address is still reported, as loopback is, and published text still withholds it.
        self.assertEqual(rule.find_ips(offer), [UNSPECIFIED_IP])
        self.assertNotIn(UNSPECIFIED_IP, rule.redact(offer))

    def test_svg_geometry_versions_and_near_names_are_not_flagged(self):
        rule = redaction.Rule("")
        # Path data whose run of numbers reads as an address (a documentation-range one, so this public
        # fixture carries no real address).
        bundle = ('["path",{d:"M6 8c0 1 .2 198.51.100.7 1.3 1.5",key:"k1"}] '
                  "PocketBase 0.39.8, v1.2.3, 1.2.3.4.5, trig1, kvm8x, capability-mesh-fallback, a::b")
        self.assertEqual(rule.find_leaks(redaction.strip_svg_geometry(bundle), allow_loopback=True),
                         {"ips": [], "machines": []})
        # The control: the geometry really is address-shaped, so stripping it is what keeps it out.
        self.assertTrue(rule.find_ips(bundle))

    def test_the_bundle_scan_catches_what_is_planted(self):
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp)
            (site / "assets").mkdir()
            chunk = 'const S={datadog:"Datadog",rig9:"Rig9 / fleet"};'
            (site / "assets" / "OperatorPage-x.js").write_text(chunk, encoding="utf-8")
            (site / "platform-health.json").write_text(json.dumps({"detail": f"reachable at {DOC_IP}"}),
                                                       encoding="utf-8")
            (site / "index.html").write_text('<svg><path d="M1 203.0.113.5 2"/></svg>', encoding="utf-8")
            self.assertEqual(redaction.scan_tree(site, redaction.Rule("")),
                             {"assets/OperatorPage-x.js": {"ips": 0, "machines": 2},
                              "platform-health.json": {"ips": 1, "machines": 0}})


if __name__ == "__main__":
    unittest.main()
