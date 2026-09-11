# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/roadmap/test_roadmap_status_progression.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     scripts/deploy/roadmap_status.py, scripts/ci/sprint_cycle.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/roadmap_status.py;
#              VALIDATES scripts/ci/sprint_cycle.py
# Intent:      Pin the honesty invariants of the progression consumer against
#              a fake estate in a temp dir - never the real one. PLAN !=
#              REALITY; UNKNOWN != ZERO; MEASUREMENT-CONTRACT-CHANGE !=
#              PROGRESSION; VERIFIED requires evidence.
# ───────────────────────────────────────────────────────────────
"""Run: py -3.13 -m unittest tests.roadmap.test_roadmap_status_progression"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "deploy"))
sys.path.insert(0, str(REPO / "scripts" / "ci"))
import roadmap_status  # noqa: E402
import sprint_cycle  # noqa: E402

BUILD_DATE = dt.date(2026, 9, 11)
RULE = "Percentage is verified acceptance criteria / explicit configured denominator."
DAY_RULE = "Operator-declared sprint index. Day 8 is anchored to 2026-09-08 and increments by local calendar day."


def fake_projection(**overrides: object) -> dict:
    """A projection shaped like the estate file, salted with things that must never leak."""
    data = {
        "schema_version": 1,
        "campaign_id": "citadel-21-day-2026-09",
        "title": "Fake campaign",
        "state": "DEGRADED",
        "sprint_day": 11,
        "current_date": BUILD_DATE.isoformat(),
        "generated_at": "2026-09-11T06:00:00+00:00",
        "total_days": 21,
        "day_index_rule": DAY_RULE,
        "rule": RULE,
        "bars": {"calendar": "[####----]", "to_date": "[##------]"},
        "source": {
            "title": "Fake strategy",
            "reference": "D:\\HOSTINGER_COMP\\secret_strategy.pdf",
            "strategy_window_start": "2026-09-03",
            "strategy_window_end": "2026-09-30",
            "hostinger_deadline": "2026-09-24",
        },
        "summary": {
            "schedule_elapsed_percent": 42.9,
            "verified_to_date_percent": 56.8,
            "full_campaign_percent": 32.1,
            "pace_state": "AT_RISK",
            "criteria_to_date": 37,
            "criteria_total": 78,
            "verified_to_date": 21,
            "verified_total": 25,
            "due_holds": 0,
        },
        "next_hard_milestone": {"id": "X", "title": "Fake deadline", "date": "2026-09-12", "days_until": 1,
                                "hard": True, "kind": "DEADLINE", "past": False},
        "current_focus": {"day": 11, "title": "Fake focus", "state": "UNMEASURED",
                          "criteria": [{"id": "X", "evidence_refs": ["state/private/receipt.json"]}]},
        "days": [{"criteria": [{"evidence_refs": ["state/development_continuity/x.json"]}]}],
        "leak": "D:\\HOSTINGER_COMP\\state\\bridge\\progression.json",
    }
    data.update(overrides)
    return data


def fake_campaign() -> dict:
    return {
        "schema_version": 1,
        "campaign_id": "citadel-21-day-2026-09",
        "source": {"strategy_window_start": "2026-09-03", "strategy_window_end": "2026-09-30",
                   "hostinger_deadline": "2026-09-24", "reference": "D:\\HOSTINGER_COMP\\x.pdf"},
        "day_index": {"total_days": 21, "anchor_date": "2026-09-08", "anchor_day": 8, "rule": DAY_RULE},
        "secret_name": "WIKIJS_API_TOKEN",
    }


class ProgressionConsumerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.projection = self.dir / "latest.json"
        self.campaign = self.dir / "campaign.yaml"
        self.campaign.write_text(json.dumps(fake_campaign()), encoding="utf-8")
        self._env = {k: os.environ.get(k) for k in (roadmap_status.PROGRESSION_ENV, roadmap_status.CAMPAIGN_ENV)}
        os.environ[roadmap_status.PROGRESSION_ENV] = str(self.projection)
        os.environ[roadmap_status.CAMPAIGN_ENV] = str(self.campaign)

    def tearDown(self) -> None:
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.tmp.cleanup()

    def write(self, data: dict) -> None:
        self.projection.write_text(json.dumps(data), encoding="utf-8")

    # ── plan clock ────────────────────────────────────────────────────────
    def test_sprint_start_is_the_strategy_window_start(self) -> None:
        start = sprint_cycle.SPRINT_START
        self.assertIsInstance(start, dt.date)
        self.assertEqual(start.isoformat(), "2026-09-03")
        self.assertNotEqual(start, dt.date(2026, 9, 9), "the old plan-only start must be gone")

    def test_2026_09_11_is_plan_day_9(self) -> None:
        plan_day = sprint_cycle.sprint_day(BUILD_DATE)
        self.assertEqual(plan_day, 9)
        self.assertEqual(sprint_cycle.sprint_day(dt.date(2026, 9, 3)), 1)
        self.assertEqual(sprint_cycle.sprint_day(dt.date(2026, 12, 1)), sprint_cycle.SPRINT_DAYS, "clamped")

    def test_projection_field_is_named_plan_verified_pct(self) -> None:
        proj = sprint_cycle._projection(sprint_cycle._load_state(), 9)  # noqa: SLF001
        self.assertIn("plan_verified_pct", proj)
        self.assertNotIn("actual_pct", proj)

    # ── UNKNOWN != ZERO ───────────────────────────────────────────────────
    def test_absent_file_is_unmeasured_not_zero(self) -> None:
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "UNMEASURED")
        self.assertEqual(block["reason"], "PROGRESSION_FILE_ABSENT")
        self.assertNotIn("measured_pct", block)
        self.assertIsNone(block["day"])
        self.assertEqual(block["plan_day"], 9)
        self.assertEqual(block["planned_pct"], 40.0)

    def test_schema_mismatch_is_unmeasured(self) -> None:
        self.write(fake_projection(summary={"verified_to_date_percent": "56.8"}))
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "UNMEASURED")
        self.assertEqual(block["reason"], "PROGRESSION_SCHEMA_MISMATCH")

    def test_unreadable_file_is_unmeasured(self) -> None:
        self.projection.write_text("{not json", encoding="utf-8")
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "UNMEASURED")

    # ── canonical day comes from the file, never the calendar ─────────────
    def test_canonical_day_is_read_from_the_projection(self) -> None:
        self.write(fake_projection(sprint_day=11))
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "MEASURED")
        self.assertEqual(block["day"], 11)
        self.assertEqual(block["plan_day"], 9)
        self.assertTrue(block["day_disagreement"])
        self.assertEqual(block["day_source"], "canonical")
        self.assertEqual(block["planned_pct"], 50.0)  # plan curve read at the canonical day
        self.assertEqual(block["measured_pct"], 56.8)
        self.assertEqual(block["calendar_pct"], 42.9)
        anchor = block["day_anchor"]
        self.assertEqual(anchor["canonical_anchor_day"], 8)
        self.assertEqual(anchor["canonical_anchor_date"], "2026-09-08")
        self.assertEqual(anchor["plan_window_start"], "2026-09-03")
        self.assertEqual(anchor["anchor_rule_day"], 11)

    def test_axes_are_independent_never_averaged(self) -> None:
        self.write(fake_projection())
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        axes = {block["calendar_pct"], block["planned_pct"], block["measured_pct"], block["full_pct"]}
        self.assertEqual(len(axes), 4)
        mean = sum(axes) / len(axes)
        self.assertNotIn(round(mean, 1), axes)

    # ── STALE != FRESH ────────────────────────────────────────────────────
    def test_fresh_when_current_date_is_build_date(self) -> None:
        self.write(fake_projection())
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["freshness"], "FRESH")
        self.assertEqual(block["stale_days"], 0)

    def test_stale_when_current_date_is_older_than_build_date(self) -> None:
        self.write(fake_projection(current_date="2026-09-09", sprint_day=9))
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "MEASURED")  # numbers still shown, labelled
        self.assertEqual(block["freshness"], "STALE")
        self.assertEqual(block["stale_days"], 2)
        self.assertEqual(block["day"], 9)  # still the file's day, not recomputed
        self.assertEqual(block["day_source"], "calendar")
        self.assertEqual(block["measured_pct"], 56.8)

    # ── MEASUREMENT-CONTRACT-CHANGE != PROGRESSION ────────────────────────
    def test_contract_hash_changes_when_rule_text_changes(self) -> None:
        self.write(fake_projection())
        before = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.write(fake_projection(rule=RULE + " Future-day criteria are excluded."))
        after = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(len(before["measurement_contract"]), 64)
        self.assertNotEqual(before["measurement_contract"], after["measurement_contract"])
        self.assertEqual(before["measured_pct"], after["measured_pct"])
        self.assertEqual(before["baseline_epoch"], "2026-09-11T06:00:00+00:00")

    def test_contract_hash_is_stable_when_only_numbers_change(self) -> None:
        self.write(fake_projection())
        before = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        summary = {**fake_projection()["summary"], "verified_to_date_percent": 60.0}
        self.write(fake_projection(summary=summary))
        after = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(before["measurement_contract"], after["measurement_contract"])

    # ── VERIFIED requires evidence (existing rule) ────────────────────────
    def test_verified_requires_evidence(self) -> None:
        state = {"milestones": sprint_cycle._merge_state([{"day": 1, "status": "verified", "evidence": ""}])}  # noqa: SLF001
        self.assertEqual(sprint_cycle._actual_pct(state), 0.0)  # noqa: SLF001
        state = {"milestones": sprint_cycle._merge_state([{"day": 1, "status": "verified", "evidence": "commit abc"}])}  # noqa: SLF001
        self.assertEqual(sprint_cycle._actual_pct(state), 5.0)  # noqa: SLF001

    # ── leak guard ────────────────────────────────────────────────────────
    def test_output_carries_no_paths_bars_or_secret_names(self) -> None:
        self.write(fake_projection(day_index_rule=DAY_RULE + " see D:\\HOSTINGER_COMP\\state/x.json"))
        text = json.dumps(roadmap_status._progression(BUILD_DATE))  # noqa: SLF001
        for forbidden in ("D:\\\\", "D:\\", "state/", "HOSTINGER_COMP", "[#", "bars", ".pdf", ".json",
                          "evidence_refs", "WIKIJS_API_TOKEN", "secret_name", "leak"):
            self.assertNotIn(forbidden, text, forbidden)

    def test_campaign_config_absent_keeps_progression_measured(self) -> None:
        os.environ[roadmap_status.CAMPAIGN_ENV] = str(self.dir / "missing.yaml")
        self.write(fake_projection())
        block = roadmap_status._progression(BUILD_DATE)  # noqa: SLF001
        self.assertEqual(block["state"], "MEASURED")
        self.assertEqual(block["day_anchor"]["state"], "UNMEASURED")
        self.assertEqual(block["day_anchor"]["reason"], "CAMPAIGN_CONFIG_ABSENT")
        self.assertIsNone(block["day_anchor"]["canonical_anchor_day"])


if __name__ == "__main__":
    unittest.main()
