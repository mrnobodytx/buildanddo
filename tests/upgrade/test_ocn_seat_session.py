# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_ocn_seat_session.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     scripts/ci/ocn_seat_session.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/ocn_seat_session.py
# DAG Node:    none
# Intent:      Prove the seat learns its guildmaster from its own box, refuses before any network call
#              when it cannot, and that the public script names no fleet machine.
# ───────────────────────────────────────────────────────────────

"""Exercise ocn_seat_session.py identity resolution without a fleet box or a network.

Seat ids here are invented (seat-alpha, seat-beta) and the only addresses are from the RFC 5737
documentation ranges. A real machine name or address in this public test would be the disclosure
the change exists to remove.
"""
from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "ci" / "ocn_seat_session.py"


def load():
    spec = importlib.util.spec_from_file_location("ocn_seat_session", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    # Registered before exec so anything that resolves the module by name (dataclasses, pickling,
    # patch targets) finds this instance rather than nothing.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


seat_session = load()

# What the removed persona-to-machine table resolved to, per guild. Measured 2026-09-22 on the six
# boxes that table named: each box's node.json and CBF FLEET_PLACEMENT.json agree on the guild, and
# the resolver returns these exact personas and lenses - so the behaviour did not change.
REMOVED_TABLE = {
    "intelligence": ("Oracle", "pattern-first, forecast-minded"),
    "commerce": ("Alex", "customer-first, offer-minded"),
    "finance": ("Sterling", "cost-aware, conservative, risk-first"),
    "creator": ("Muse", "playful, vivid, image-rich"),
    "research": ("Scholar", "academic, thorough, evidence-first"),
    "builder": ("Forge", "operational, safety-first"),
}
# The dispatch's own pattern for a fleet machine name, plus IPv4 literals.
MACHINE_NAME = re.compile(r"\b(ray-[a-z]{3}\d+-\d+|mesh-[a-z]+|kvm\d+|rig\d+)\b", re.I)
IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="buildanddo-seat-")
        self.addCleanup(self.temp.cleanup)
        self.node = Path(self.temp.name) / "node.json"
        self.placement = Path(self.temp.name) / "FLEET_PLACEMENT.json"

    def write(self, node=None, boxes=None, raw_node=None):
        if raw_node is not None:
            self.node.write_text(raw_node, encoding="utf-8")
        elif node is not None:
            self.node.write_text(json.dumps(node), encoding="utf-8")
        if boxes is not None:
            self.placement.write_text(json.dumps({"boxes": boxes}), encoding="utf-8")

    def resolve(self, seat=None):
        return seat_session.resolve_identity(seat, str(self.node), str(self.placement))

    def refused(self, seat=None):
        with self.assertRaises(seat_session.IdentityRefused) as caught:
            self.resolve(seat)
        return caught.exception

    def test_both_sources_agree(self):
        # The box's node.json persona NAME is a seat-label vocabulary and must not be used.
        self.write({"seat_id": "seat-alpha", "persona": {"name": "Warden", "guild": "builder"}},
                   {"seat-alpha": {"persona": "Forge", "guild": "builder"}})
        meta = self.resolve()
        self.assertEqual((meta["seat"], meta["persona"], meta["guild"]), ("seat-alpha", "Forge", "builder"))
        self.assertEqual(meta["lens"], "operational, safety-first")
        self.assertEqual(meta["identity"], {"state": "RESOLVED", "guild_from": ["FLEET_PLACEMENT.json", "node.json"],
                                            "sources": {"node.json": "read", "FLEET_PLACEMENT.json": "read"}})

    def test_a_seat_label_that_is_another_guildmasters_name_is_still_ignored(self):
        # Measured on a real box: node.json says name "Scholar" with guild intelligence, while the
        # placement says Oracle. The guild decides; the seat label does not.
        self.write({"seat_id": "seat-alpha", "persona": {"name": "Scholar", "guild": "intelligence"}},
                   {"seat-alpha": {"persona": "Oracle", "guild": "intelligence"}})
        self.assertEqual(self.resolve()["persona"], "Oracle")

    def test_node_json_alone_is_enough(self):
        self.write({"node_id": "seat-alpha", "guild": "Research"})
        meta = self.resolve("seat-alpha")
        self.assertEqual((meta["persona"], meta["guild"]), ("Scholar", "research"))
        self.assertEqual(meta["identity"]["sources"]["FLEET_PLACEMENT.json"], "absent")

    def test_every_guild_the_removed_table_covered_resolves_as_before(self):
        for guild, (persona, lens) in REMOVED_TABLE.items():
            with self.subTest(guild=guild):
                self.write({"seat_id": "seat-beta", "persona": {"guild": guild}},
                           {"seat-beta": {"persona": persona, "guild": guild}})
                meta = self.resolve()
                self.assertEqual((meta["persona"], meta["lens"]), (persona, lens))

    def test_refuses_without_a_readable_identity(self):
        self.assertEqual(self.refused().code, "IDENTITY_UNREADABLE")
        self.write(raw_node="{not json")
        refusal = self.refused()
        self.assertEqual(refusal.code, "IDENTITY_UNREADABLE")
        self.assertEqual(refusal.sources, {"node.json": "JSONDecodeError"})
        self.write(raw_node="[1, 2]")
        self.assertEqual(self.refused().code, "IDENTITY_UNREADABLE")

    def test_refuses_without_a_seat(self):
        self.write({"persona": {"guild": "builder"}})
        self.assertEqual(self.refused().code, "IDENTITY_NO_SEAT")

    def test_refuses_to_run_as_another_seat(self):
        self.write({"seat_id": "seat-alpha", "persona": {"guild": "builder"}})
        self.assertEqual(self.refused("seat-beta").code, "IDENTITY_MISMATCH")

    def test_refuses_without_a_guild(self):
        self.write({"seat_id": "seat-alpha", "persona": {"name": "Warden"}}, {"seat-other": {"guild": "builder"}})
        self.assertEqual(self.refused().code, "IDENTITY_NO_GUILD")

    def test_refuses_when_the_sources_disagree(self):
        self.write({"seat_id": "seat-alpha", "persona": {"guild": "research"}},
                   {"seat-alpha": {"persona": "Oracle", "guild": "intelligence"}})
        self.assertEqual(self.refused().code, "IDENTITY_CONFLICT")

    def test_refuses_a_guild_with_no_guildmaster(self):
        self.write({"seat_id": "seat-alpha", "persona": {"guild": "operations"}})
        self.assertEqual(self.refused().code, "NO_GUILDMASTER")

    def test_refuses_a_box_placed_as_someone_else(self):
        self.write({"seat_id": "seat-alpha", "persona": {"guild": "builder"}},
                   {"seat-alpha": {"persona": "Atlas", "guild": "builder"}})
        self.assertEqual(self.refused().code, "PERSONA_CONFLICT")


class MainTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="buildanddo-seat-main-")
        self.addCleanup(self.temp.cleanup)
        self.node = Path(self.temp.name) / "node.json"
        self.placement = Path(self.temp.name) / "FLEET_PLACEMENT.json"

    def run_main(self, argv):
        buffer = io.StringIO()
        with patch.object(sys, "argv", ["ocn_seat_session.py", *argv]), \
                patch.object(seat_session, "NODE_JSON", str(self.node)), \
                patch.object(seat_session, "PLACEMENT", str(self.placement)), \
                redirect_stdout(buffer):
            code = seat_session.main()
        return code, json.loads(buffer.getvalue().strip().splitlines()[-1])

    def test_a_refusal_touches_nothing_on_the_network(self):
        with patch.object(seat_session, "http", side_effect=AssertionError("network call")) as network, \
                patch.object(seat_session, "login", side_effect=AssertionError("login")) as login:
            code, out = self.run_main(["seat-alpha", "--no-capture"])
        self.assertEqual(code, 2)
        self.assertEqual(out["identity"]["state"], "REFUSED")
        self.assertEqual(out["identity"]["code"], "IDENTITY_UNREADABLE")
        self.assertEqual(out["login"], "NOT_ATTEMPTED")
        network.assert_not_called()
        login.assert_not_called()

    def test_a_resolved_seat_signs_in_as_itself_under_its_persona(self):
        self.node.write_text(json.dumps({"seat_id": "seat-alpha", "persona": {"guild": "finance"}}), encoding="utf-8")
        egress = {"status": 200, "body": b"198.51.100.7", "ms": 1, "ctype": "text/plain"}
        with patch.object(seat_session, "http", return_value=egress), \
                patch.object(seat_session, "login", return_value=(None, None, "LOGIN_401")) as login:
            code, out = self.run_main(["--no-capture"])
        self.assertEqual(code, 1)
        login.assert_called_once_with("seat-alpha", seat_session.ENVS["staging"])
        self.assertEqual((out["seat"], out["persona"], out["guild"]), ("seat-alpha", "Sterling", "finance"))
        self.assertEqual(out["identity"]["state"], "RESOLVED")
        self.assertEqual(out["login"], "LOGIN_401")


class PublicSourceTests(unittest.TestCase):
    def test_the_script_names_no_fleet_machine_and_no_address(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIsNone(MACHINE_NAME.search(source))
        self.assertIsNone(IPV4.search(source))
        self.assertFalse(hasattr(seat_session, "SEATS"))

    def test_the_check_is_not_vacuous(self):
        self.assertIsNotNone(MACHINE_NAME.search('SEATS = {"ray-xyz0-0": "Forge"}'))
        self.assertIsNotNone(IPV4.search("egress 192.0.2.10"))

    def test_every_guildmaster_has_a_lens_and_a_vocabulary(self):
        personas = {entry["persona"] for entry in seat_session.GUILDMASTERS.values()}
        self.assertEqual(len(personas), 8)
        self.assertEqual(personas, set(seat_session.LEXICON))


if __name__ == "__main__":
    unittest.main()
