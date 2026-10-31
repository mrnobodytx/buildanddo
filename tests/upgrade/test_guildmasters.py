# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_guildmasters.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     libs/guildmasters/__init__.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/guildmasters/__init__.py
# DAG Node:    none
# Intent:      Hold the Python guildmaster mirror to the server's resolve rules, immutability and JSON shape.
# ───────────────────────────────────────────────────────────────

"""Exercise ``libs.guildmasters`` without a server, a network or the environment.

Parity with the server registry itself is proved by ``guildmaster-registry.test.mjs``, which
compares ``as_json()`` and ``resolve`` against ``apps/pocketbase/pb_hooks/guildmasters.js``.
"""

from __future__ import annotations

import ast
import dataclasses
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs import guildmasters  # noqa: E402
from libs.guildmasters import (  # noqa: E402
    GUILDMASTERS,
    ORDER,
    SEAT_DOMAIN,
    Guildmaster,
    as_json,
    by_seat,
    by_slug,
    persona_id,
    resolve,
    seat_email,
)

ROTA = ("forge", "scholar", "oracle", "alex", "sterling", "muse", "quill", "director")


class RosterTests(unittest.TestCase):
    """The eight, in rota order, and nothing else."""

    def test_eight_unique_guildmasters_in_rota_order(self) -> None:
        self.assertEqual(ORDER, ROTA)
        self.assertEqual(tuple(entry.seat for entry in GUILDMASTERS), ROTA)
        self.assertEqual(len({entry.slug for entry in GUILDMASTERS}), 8)
        self.assertEqual(len({entry.guild for entry in GUILDMASTERS}), 8)
        self.assertEqual(SEAT_DOMAIN, "@ocn.buildanddo.invalid")

    def test_director_nexus_is_seat_director_with_its_alias(self) -> None:
        director = by_seat("director")
        self.assertEqual(
            director,
            Guildmaster("director", "director-nexus", "Director Nexus", "entertainment", ("director",)),
        )
        self.assertIs(by_slug("director-nexus"), director)
        for entry in GUILDMASTERS:
            if entry is not director:
                self.assertEqual(entry.aliases, ())
                self.assertEqual(entry.seat, entry.slug)

    def test_lookups_are_exact(self) -> None:
        self.assertIsNone(by_seat("Forge"))
        self.assertIsNone(by_seat("director-nexus"))
        self.assertIsNone(by_slug("director"))
        self.assertIsNone(by_seat(None))
        self.assertIsNone(by_slug(42))


class ResolveTests(unittest.TestCase):
    """Every spelling a seat, persona or presence row uses, and the ones it must not match."""

    def test_spellings_resolve_to_their_guildmaster(self) -> None:
        cases = {
            "forge": "forge",
            "FORGE": "forge",
            "gm:forge": "forge",
            "gm-forge": "forge",
            "gm_forge": "forge",
            "gm-builder-forge": "forge",
            "gm-ent-director": "director",
            "director": "director",
            "director-nexus": "director",
            "Director Nexus": "director",
            "  Director   Nexus ": "director",
            "gm-director-nexus": "director",
            "gm-writers-quill": "quill",
            "Sterling": "sterling",
        }
        for value, seat in cases.items():
            with self.subTest(value=value):
                entry = resolve(value)
                self.assertIsNotNone(entry)
                assert entry is not None
                self.assertEqual(entry.seat, seat)

    def test_non_guildmasters_resolve_to_none(self) -> None:
        for value in ("nobody", "", "gm-", "gm", "forger", "forge-x", "nexus", "c-one", "seat-alpha", "---"):
            with self.subTest(value=value):
                self.assertIsNone(resolve(value))
        for value in (None, 42, ["forge"], {"seat": "forge"}):
            with self.subTest(value=value):
                self.assertIsNone(resolve(value))

    def test_resolve_returns_the_registry_entry(self) -> None:
        self.assertIs(resolve("gm:forge"), by_seat("forge"))
        self.assertEqual(tuple(resolve(persona_id(entry)) for entry in GUILDMASTERS), GUILDMASTERS)

    def test_persona_id_and_seat_email(self) -> None:
        self.assertEqual(persona_id(by_seat("forge")), "gm-forge")
        self.assertEqual(persona_id(by_seat("director")), "gm-director-nexus")
        self.assertEqual(seat_email("forge"), "forge@ocn.buildanddo.invalid")
        self.assertEqual(seat_email("director"), "director@ocn.buildanddo.invalid")
        for value in ("c-one", "Forge", "director-nexus", ""):
            with self.subTest(value=value):
                self.assertIsNone(seat_email(value))


class ImmutabilityTests(unittest.TestCase):
    """A caller cannot edit the roster another caller then reads."""

    def test_entries_and_aliases_are_frozen(self) -> None:
        entry = by_seat("director")
        assert entry is not None
        with self.assertRaises(dataclasses.FrozenInstanceError):
            entry.slug = "director"  # type: ignore[misc]
        self.assertIsInstance(entry.aliases, tuple)
        self.assertIsInstance(GUILDMASTERS, tuple)
        self.assertIsInstance(ORDER, tuple)

    def test_as_json_is_detached_from_the_registry(self) -> None:
        rows = as_json()
        rows[7]["aliases"].append("nexus")
        rows[0]["name"] = "Changed"
        self.assertEqual(by_seat("director").aliases, ("director",))  # type: ignore[union-attr]
        self.assertEqual(as_json()[0]["name"], "Forge")


class JsonShapeTests(unittest.TestCase):
    """``as_json`` is the server entry shape, serialisable as is."""

    def test_as_json_round_trips(self) -> None:
        rows = as_json()
        self.assertEqual(json.loads(json.dumps(rows)), rows)
        self.assertEqual(len(rows), 8)
        for row in rows:
            self.assertEqual(list(row), ["seat", "slug", "name", "guild", "aliases"])
            self.assertIsInstance(row["aliases"], list)
        self.assertEqual(rows[7], {
            "seat": "director",
            "slug": "director-nexus",
            "name": "Director Nexus",
            "guild": "entertainment",
            "aliases": ["director"],
        })


class NoIoTests(unittest.TestCase):
    """The mirror performs no I/O and reads no environment or box identity."""

    def test_module_imports_nothing_that_reaches_outside(self) -> None:
        tree = ast.parse(Path(guildmasters.__file__).read_text(encoding="utf-8"))
        imported = {
            alias.name.split(".")[0]
            for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
            for alias in (node.names if isinstance(node, ast.Import) else [ast.alias(node.module or "")])
        }
        self.assertLessEqual(imported, {"__future__", "re", "dataclasses"})
        names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
        self.assertFalse({"open", "getenv", "environ"} & names)


if __name__ == "__main__":
    unittest.main()
