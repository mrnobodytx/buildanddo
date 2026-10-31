# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_guild_rota.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     libs/guildmasters/rota.py, libs/guildmasters/__main__.py, libs/guildmasters/__init__.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/guildmasters/rota.py; VALIDATES libs/guildmasters/__main__.py
# DAG Node:    none
# Intent:      Hold the Python guild class rota to the same fairness rules as the server and keep its CLI offline and strict.
# ───────────────────────────────────────────────────────────────

"""Exercise ``libs.guildmasters.rota`` and ``python -m libs.guildmasters`` without a server.

Field-for-field parity with ``apps/pocketbase/pb_hooks/guild-rota.js`` is proved by
``tests/upgrade/guild-rota.test.mjs``, which runs both for the same weeks.
"""

from __future__ import annotations

import ast
from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from contextlib import redirect_stderr, redirect_stdout
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.guildmasters import ORDER, as_json  # noqa: E402
from libs.guildmasters import __main__ as cli  # noqa: E402
from libs.guildmasters import rota  # noqa: E402

EPOCH = datetime(2026, 11, 2, tzinfo=timezone.utc)
WEEKS = [EPOCH + timedelta(weeks=offset) for offset in range(-20, 156)]


class RotaTests(unittest.TestCase):
    """Eight classes a week; hosts and auditors are permutations; nobody audits themselves."""

    def test_every_week_is_a_fair_rota(self) -> None:
        for monday in WEEKS:
            plan = rota.week(monday + timedelta(days=2, hours=7))
            self.assertEqual(plan["index"], (monday - EPOCH) // timedelta(weeks=1))
            self.assertEqual(plan["starts_at"], monday.strftime("%Y-%m-%dT00:00:00.000Z"))
            classes = plan["classes"]
            self.assertEqual([item["slot"] for item in classes], list(range(8)))
            self.assertEqual(sorted(item["host"] for item in classes), sorted(ORDER), plan["week"])
            self.assertEqual(sorted(item["auditor"] for item in classes), sorted(ORDER), plan["week"])
            starts = [datetime.fromisoformat(item["starts_at"].replace("Z", "+00:00")) for item in classes]
            self.assertEqual(starts, sorted(set(starts)))
            self.assertTrue(all(monday <= start < monday + timedelta(days=4) for start in starts))
            for item in classes:
                self.assertNotEqual(item["auditor"], item["host"])
                self.assertEqual(sorted(item["attendees"]), sorted(seat for seat in ORDER if seat != item["host"]))
                self.assertIn(item["auditor"], item["attendees"])
                self.assertEqual(item["attendees"][0], ORDER[(ORDER.index(item["host"]) + 1) % 8])

    def test_each_host_meets_every_auditor_over_seven_weeks(self) -> None:
        for start in (0, 20, 120):
            for host in ORDER:
                auditors = [next(item["auditor"] for item in rota.week(monday)["classes"] if item["host"] == host)
                            for monday in WEEKS[start:start + 7]]
                self.assertEqual(sorted(auditors), sorted(seat for seat in ORDER if seat != host), host)

    def test_opening_week_and_iso_labels_across_the_53_week_year(self) -> None:
        opening = rota.week(EPOCH)
        self.assertEqual((opening["week"], opening["index"]), ("2026-W45", 0))
        self.assertEqual(opening["classes"][7], {
            "slot": 7, "host": "director", "persona": "director-nexus", "name": "Director Nexus",
            "guild": "entertainment", "auditor": "forge", "auditor_persona": "forge",
            "attendees": list(ORDER[:7]), "starts_at": "2026-11-05T18:00:00.000Z",
        })
        labels = [rota.week(monday)["week"] for monday in WEEKS]
        self.assertEqual(labels, ["%04d-W%02d" % monday.isocalendar()[:2] for monday in WEEKS])
        at = labels.index("2026-W53")
        self.assertEqual(labels[at - 1:at + 2], ["2026-W52", "2026-W53", "2027-W01"])
        self.assertEqual(rota.week(WEEKS[19])["index"], -1)
        self.assertEqual(rota.week(WEEKS[0])["week"], "2026-W25")

    def test_parse_week_is_strict(self) -> None:
        self.assertEqual(rota.parse_week("2026-W45"), EPOCH)
        self.assertEqual(rota.parse_week("2026-W53"), datetime(2026, 12, 28, tzinfo=timezone.utc))
        self.assertEqual(rota.parse_week("2027-W01"), datetime(2027, 1, 4, tzinfo=timezone.utc))
        for bad in ("2026-W54", "2027-W53", "2026-W00", "2026-W5", "2026-w45", " 2026-W45", "2026-W45\n",
                    "26-W45", "0000-W01", "2026-W٤٥", "x", "", None, 202645, ["2026-W45"]):
            with self.assertRaises(ValueError, msg=repr(bad)):
                rota.parse_week(bad)
        for monday in WEEKS:
            self.assertEqual(rota.parse_week(rota.week_label(monday)), monday)
            for offset in (timedelta(0), timedelta(days=6, hours=23, minutes=59, seconds=59)):
                self.assertEqual(rota.monday_of(monday + offset), monday)

    def test_naive_and_non_datetime_instants_are_refused(self) -> None:
        with self.assertRaises(ValueError):
            rota.week(datetime(2026, 11, 2))
        with self.assertRaises(TypeError):
            rota.week("2026-11-02")  # type: ignore[arg-type]
        # An aware instant in another zone is the same instant in UTC.
        late = datetime(2026, 11, 1, 23, 30, tzinfo=timezone(timedelta(hours=-2)))
        self.assertEqual(rota.week(late)["week"], "2026-W45")

    def test_current_boundaries(self) -> None:
        for monday in WEEKS[18:30]:
            plan, following = rota.week(monday), rota.week(monday + timedelta(weeks=1))
            for slot, item in enumerate(plan["classes"]):
                starts = datetime.fromisoformat(item["starts_at"].replace("Z", "+00:00"))
                self.assertEqual(rota.current(starts + timedelta(minutes=119)), {"week": plan["week"], **item})
                after = (plan["classes"][slot + 1] if slot < 7 else following["classes"][0])
                week = plan["week"] if slot < 7 else following["week"]
                self.assertEqual(rota.current(starts + timedelta(minutes=120)), {"week": week, **after})

    def test_module_imports_nothing_that_reaches_outside(self) -> None:
        tree = ast.parse(Path(rota.__file__).read_text(encoding="utf-8"))
        imported = {
            (node.names[0].name if isinstance(node, ast.Import) else node.module or "").split(".")[0]
            for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
        }
        self.assertLessEqual(imported, {"__future__", "re", "datetime", "libs"})
        calls = {node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)}
        self.assertNotIn("now", calls)


class CliTests(unittest.TestCase):
    """``python -m libs.guildmasters`` prints the same rota, reads no environment and refuses bad input."""

    def run_cli(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = cli.main(list(argv))
            except SystemExit as stop:
                code = int(stop.code or 0)
        return code, out.getvalue(), err.getvalue()

    def test_json_output_matches_the_library(self) -> None:
        code, out, _ = self.run_cli("week", "--week", "2026-W45", "--json")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), rota.week(EPOCH))
        code, out, _ = self.run_cli("week", "--date", "2026-12-31", "--json")
        self.assertEqual((code, json.loads(out)["week"]), (0, "2026-W53"))
        code, out, _ = self.run_cli("current", "--at", "2026-11-02T16:59:00Z", "--json")
        self.assertEqual(json.loads(out), {"week": "2026-W45", **rota.week(EPOCH)["classes"][0]})
        code, out, _ = self.run_cli("current", "--at", "2026-11-02T17:00:00+00:00", "--json")
        self.assertEqual(json.loads(out)["slot"], 1)
        code, out, _ = self.run_cli("list", "--json")
        self.assertEqual(json.loads(out), as_json())

    def test_text_output_names_host_and_auditor(self) -> None:
        code, out, _ = self.run_cli("week", "--week", "2026-W45")
        self.assertEqual(code, 0)
        self.assertIn("2026-W45 (week 0 of the rota, from 2026-11-02T00:00:00.000Z)", out)
        self.assertIn("Director Nexus hosts the entertainment guild class; Forge audits", out)
        self.assertNotIn("@", out)

    def test_bad_input_exits_2_with_a_reason(self) -> None:
        for argv, reason in (
            (("week", "--week", "2026-W54"), "exists in that year"),
            (("week", "--week", "x"), "YYYY-Www"),
            (("week", "--date", "2026-W45-1"), "YYYY-MM-DD"),
            (("week", "--week", "2026-W45", "--date", "2026-11-02"), "not allowed"),
            (("current", "--at", "2026-11-02T15:00:00"), "zone"),
            ((), "required"),
        ):
            code, out, err = self.run_cli(*argv)
            self.assertEqual((code, out), (2, ""), argv)
            self.assertIn(reason, err, argv)

    def test_module_entry_point_runs_offline_without_the_environment(self) -> None:
        result = subprocess.run(
            [sys.executable, "-E", "-s", "-m", "libs.guildmasters", "week", "--week", "2026-W45", "--json"],
            cwd=ROOT, env={"PATH": os.environ.get("PATH", "")}, capture_output=True, text=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), rota.week(EPOCH))
        tree = ast.parse(Path(cli.__file__).read_text(encoding="utf-8"))
        imported = {
            (node.names[0].name if isinstance(node, ast.Import) else node.module or "").split(".")[0]
            for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
        }
        self.assertLessEqual(imported, {"__future__", "argparse", "datetime", "json", "re", "sys", "libs"})
        names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
        self.assertNotIn("open", names)


if __name__ == "__main__":
    unittest.main()
