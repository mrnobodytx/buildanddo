# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_commands.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/service.py, scripts/discordbot/catalogue.py, apps/web/tools/generate-community.mjs
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/service.py; VALIDATES scripts/discordbot/catalogue.py; CONSUMES apps/web/tools/generate-community.mjs
# DAG Node:    none
# Intent:      Verify real generated learning content, scope enforcement, dated evidence and useful bot command outcomes without private access.
# ───────────────────────────────────────────────────────────────

"""Run commands against the real generated curriculum and controlled public observations."""
from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess
import unittest

from scripts.discordbot.catalogue import Catalogue, reference_url
from scripts.discordbot.contracts import Caller, DataFault, DataUnavailable, PersonalSession, Settings, SITE_ORIGIN
from scripts.discordbot.public_data import Observation, PublicClient, Resource
from scripts.discordbot.service import COMMANDS, CommandService, WORKSPACE_AREAS

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 9, 15, 20, 0, tzinfo=timezone.utc)
CALLER = Caller(10, 20, 30)


def generated_catalogue() -> dict[str, object]:
    result = subprocess.check_output(
        [
            "node", "--input-type=module", "-e",
            "import { buildCommunityCatalogue } from './apps/web/tools/generate-community.mjs';"
            "import { resolveBuildRelease } from './scripts/ci/release.mjs';"
            "process.stdout.write(JSON.stringify(buildCommunityCatalogue(resolveBuildRelease())));",
        ], cwd=ROOT, text=True,
    )
    return json.loads(result)


class CommandTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = generated_catalogue()

    async def asyncSetUp(self) -> None:
        self.reads: list[str] = []
        self.feeds: dict[str, object] = {
            "/": None,
            "/community-catalog.json": copy.deepcopy(self.source),
            "/version.json": {"version": "38+abc1234", "commit_sha": "abc1234" + "0" * 33},
            "/roadmap-status.json": {
                "state": "MEASURED", "generated_at": NOW.isoformat(), "sprint_day": 12,
                "planned_pct": 60.5, "actual_pct": 20, "gate_state": "PASS",
            },
        }

        def reader(resource: Resource) -> Observation:
            self.reads.append(resource.path)
            value = self.feeds[resource.path]
            if isinstance(value, DataUnavailable):
                raise value
            return Observation(copy.deepcopy(value), 200, NOW, 12)

        self.client = PublicClient(reader)
        self.addAsyncCleanup(self.client.close)
        self.service = CommandService(Settings(), self.client, utcnow=lambda: NOW)

    async def test_help_start_ping_support_and_workspace_need_no_http(self) -> None:
        for name in ["help", "start", "ping", "support", "workspace"]:
            reply = await self.service.execute(name, "", CALLER)
            self.assertEqual(reply.outcome, "success")
            self.assertTrue(reply.pages)
        self.assertEqual(self.reads, [])
        self.assertEqual(len(COMMANDS), 13)

    async def test_denied_scope_bots_and_direct_messages_make_no_source_read(self) -> None:
        self.service = CommandService(Settings(frozenset({20}), frozenset({30})), self.client)
        for caller in [Caller(10, None, None), Caller(10, 21, 30), Caller(10, 20, 31), Caller(10, 20, 30, True)]:
            reply = await self.service.execute("learn", "", caller)
            self.assertEqual(reply.outcome, "denied")
            self.assertEqual(self.service.suggestions("", caller), ())
        self.assertEqual(self.reads, [])

    async def test_diagnostics_requires_current_manage_server_permission(self) -> None:
        denied = await self.service.execute("diagnostics", "", CALLER)
        self.assertEqual(denied.outcome, "denied")
        allowed = await self.service.execute("diagnostics", "", Caller(10, 20, 30, manage_guild=True))
        self.assertEqual(allowed.outcome, "success")
        self.assertIn("Legacy prefix: disabled", allowed.pages[0].body)
        self.assertNotIn("user_id", allowed.pages[0].body)

    async def test_workspace_links_are_real_routed_desks_without_role_grants(self) -> None:
        app = (ROOT / "apps/web/src/App.jsx").read_text()
        for index, (area, (_, path)) in enumerate(WORKSPACE_AREAS.items()):
            reply = await self.service.execute("workspace", area, Caller(index, 20, 30))
            self.assertEqual(reply.pages[0].url, SITE_ORIGIN + path)
            if path != "/app":
                self.assertIn("path: '" + path.rsplit("/", 1)[1] + "'", app)
            self.assertIn("role control access", reply.pages[0].body)
        reply = await self.service.execute("workspace", "does-not-exist", CALLER)
        self.assertIn("Choose", reply.pages[0].title)
        self.assertFalse(self.reads)

    async def test_site_status_and_release_keep_source_scope_and_observation_time(self) -> None:
        status = await self.service.execute("status", "", CALLER)
        self.assertIn(SITE_ORIGIN, status.pages[0].body)
        self.assertIn("HTTP 200", status.pages[0].body)
        self.assertIn("2026-09-15T20:00:00+00:00", status.pages[0].note)
        release = await self.service.execute("release", "", CALLER)
        self.assertIn("38+abc1234", release.pages[0].body)
        self.assertIn("0" * 33, release.pages[0].body)
        self.assertIn("/version.json", release.pages[0].body)

    async def test_all_authored_lessons_and_quizzes_are_available_without_private_reads(self) -> None:
        catalogue = Catalogue.parse(self.source)
        self.assertEqual(len(catalogue.lessons), 25)
        self.assertEqual(self.source["site_origin"], SITE_ORIGIN)
        for index, lesson in enumerate(catalogue.lessons):
            caller = Caller(index + 100, 20, 30)
            with self.subTest(slug=lesson.slug):
                reader = await self.service.execute("lesson", lesson.slug, caller)
                self.assertEqual(reader.outcome, "success")
                self.assertIn(lesson.summary, reader.pages[0].body)
                rendered = "\n".join(page.body for page in reader.pages)
                for _, part in lesson.parts:
                    self.assertIn(part.strip(), rendered)
                quiz = await self.service.execute("quiz", lesson.slug, caller)
                self.assertEqual(quiz.pages[0].body.split("\n\n")[0], lesson.question)
                self.assertIsNotNone(quiz.quiz)
                answered = PersonalSession(caller.user_id, quiz, now=0).answer(caller.user_id, lesson.quiz.answer, 1)
                self.assertIn("Correct.", answered.body)
                self.assertIn(lesson.quiz.explanation, answered.body)
        self.assertEqual(self.reads, ["/community-catalog.json"])

    async def test_search_selection_and_autocomplete_reuse_the_loaded_catalogue(self) -> None:
        self.assertEqual(self.service.suggestions("mission", CALLER), ())
        found = await self.service.execute("learn", "mission", CALLER)
        self.assertTrue(found.options)
        self.assertEqual(found.selection, "lesson")
        self.assertTrue(self.service.suggestions("mission", CALLER))
        self.assertEqual(self.service.suggestions("x" * 81, CALLER), ())
        for option in found.options:
            lesson = await self.service.execute("lesson", option.value, Caller(hash(option.value), 20, 30))
            self.assertGreater(len(lesson.pages), 4)
        quizzes = await self.service.execute("quiz", "", CALLER)
        self.assertEqual(quizzes.selection, "quiz")
        self.assertEqual(len(quizzes.options), 25)
        self.assertEqual(len(self.reads), 1)

    async def test_docs_search_and_no_result_are_explicit(self) -> None:
        docs = await self.service.execute("docs", "pricing", CALLER)
        self.assertEqual(docs.pages[0].url, SITE_ORIGIN + "/pricing")
        for name in ["docs", "learn"]:
            missing = await self.service.execute(name, "unmatched-sequence", CALLER)
            self.assertIn("No matching", missing.pages[0].title)

    async def test_fresh_roadmap_uses_real_percentages_including_zero(self) -> None:
        self.feeds["/roadmap-status.json"]["actual_pct"] = 0
        reply = await self.service.execute("roadmap", "", CALLER)
        self.assertEqual(reply.outcome, "success")
        self.assertIn("Actual: 0%", reply.pages[0].body)
        self.assertIn("Planned: 60.5%", reply.pages[0].body)

    async def test_stale_roadmap_is_labelled_with_its_generation_time(self) -> None:
        self.feeds["/roadmap-status.json"]["generated_at"] = (NOW - timedelta(days=3)).isoformat()
        reply = await self.service.execute("roadmap", "", CALLER)
        self.assertEqual(reply.outcome, "stale")
        self.assertIn("(stale)", reply.pages[0].title)
        self.assertIn("48 hours", reply.pages[0].body)

    async def test_unmeasured_roadmap_does_not_fabricate_zero_progress(self) -> None:
        self.feeds["/roadmap-status.json"] = {"state": "UNMEASURED"}
        reply = await self.service.execute("roadmap", "", CALLER)
        self.assertEqual(reply.outcome, "unmeasured")
        self.assertNotIn("Actual:", reply.pages[0].body)
        self.assertNotIn("0%", reply.pages[0].body)

    async def test_future_or_invalid_roadmap_numbers_fail_without_claiming_success(self) -> None:
        for values in [
            {"generated_at": (NOW + timedelta(seconds=1)).isoformat()},
            {"generated_at": "2026-09-15"},
            {"generated_at": "not-a-date"},
            {"sprint_day": True},
            {"sprint_day": 0},
            {"actual_pct": -1},
            {"actual_pct": True},
            {"actual_pct": float("nan")},
            {"planned_pct": 101},
        ]:
            with self.subTest(values=values):
                self.client._cache.clear()
                original = copy.deepcopy(self.feeds["/roadmap-status.json"])
                self.feeds["/roadmap-status.json"].update(values)
                reply = await self.service.execute("roadmap", "", Caller(hash(str(values)), 20, 30))
                self.assertEqual(reply.outcome, "unavailable")
                self.feeds["/roadmap-status.json"] = original

    async def test_mismatched_release_and_failed_http_are_unavailable(self) -> None:
        self.feeds["/version.json"]["version"] = "38+deadbee"
        self.assertEqual((await self.service.execute("release", "", CALLER)).outcome, "unavailable")
        self.feeds["/"] = DataUnavailable(DataFault.TIMEOUT)
        reply = await self.service.execute("status", "", CALLER)
        self.assertEqual(reply.outcome, "unavailable")
        self.assertIn("timeout", reply.pages[0].body)

    async def test_overlong_unknown_and_rate_limited_commands_cannot_fetch(self) -> None:
        self.assertEqual((await self.service.execute("learn", "x" * 81, CALLER)).outcome, "invalid")
        self.assertEqual((await self.service.execute("unknown", "", CALLER)).outcome, "invalid")
        for _ in range(4):
            await self.service.execute("ping", "", CALLER)
        self.assertEqual((await self.service.execute("learn", "", CALLER)).outcome, "rate_limited")
        self.assertEqual(self.reads, [])

    async def test_telemetry_omits_arguments_identifiers_and_provider_payloads(self) -> None:
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await self.service.execute("docs", "personal-search-phrase", Caller(12345678901234567, 20, 30))
        record = captured.records[0]
        self.assertEqual(record.command, "docs")
        self.assertEqual(record.outcome, "success")
        self.assertGreaterEqual(record.duration_ms, 0)
        self.assertNotIn("personal-search-phrase", str(record.__dict__))
        self.assertNotIn("12345678901234567", str(record.__dict__))


class CatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = generated_catalogue()

    def test_public_feed_rejects_private_routes_bad_versions_and_duplicate_slugs(self) -> None:
        for mutate in [
            lambda data: data.update(site_origin="https://untrusted.invalid"),
            lambda data: data.update(schema_version=True),
            lambda data: data.update(lessons=[]),
            lambda data: data["pages"][0].update(path="/app/wiki"),
            lambda data: data["lessons"].append(data["lessons"][0]),
            lambda data: data["lessons"][0].update(effort_minutes=True),
            lambda data: data["lessons"][0].update(slug="../private"),
            lambda data: data["lessons"][0]["lesson"]["check"].update(answer=True),
            lambda data: data["lessons"][0]["lesson"]["check"].update(answer=99),
            lambda data: data["lessons"][0]["lesson"]["check"].update(choices=["Only one"]),
            lambda data: data["lessons"][0]["lesson"]["sections"][0].update(paragraphs=[]),
            lambda data: data["lessons"][0]["lesson"].update(schema_version=2),
        ]:
            with self.subTest(mutate=mutate):
                source = copy.deepcopy(self.source)
                mutate(source)
                with self.assertRaises(DataUnavailable):
                    Catalogue.parse(source)

    def test_non_objects_and_unsafe_reference_schemes_are_rejected(self) -> None:
        for data in [None, [], "text", 1, {2: "non-string key"}]:
            with self.assertRaises(DataUnavailable):
                Catalogue.parse(data)
        for url in ["javascript:alert(1)", "//untrusted.invalid", "https://name:password@untrusted.invalid", "/\\private", "https://["]:
            with self.assertRaises(DataUnavailable):
                reference_url(url)
        self.assertEqual(reference_url("/app"), SITE_ORIGIN + "/app")
        self.assertEqual(reference_url("https://www.w3.org/"), "https://www.w3.org/")
