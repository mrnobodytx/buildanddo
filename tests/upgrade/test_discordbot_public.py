# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_public.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/public_data.py, scripts/discordbot/contracts.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/public_data.py; VALIDATES scripts/discordbot/contracts.py
# DAG Node:    none
# Intent:      Prove bounded public HTTP, cancellation, scope limits and private learning controls without contacting Discord.
# ───────────────────────────────────────────────────────────────

"""Exercise real loopback HTTP and asynchronous public-reader boundaries."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch

from scripts.discordbot.contracts import (
    Caller, ConfigurationError, DataFault, DataUnavailable, InteractionDenied,
    Limiter, Page, PersonalSession, Quiz, Reply, Settings, paginate,
)
from scripts.discordbot.public_data import Observation, PublicClient, Resource, read_resource


class HTTPTests(unittest.TestCase):
    def setUp(self) -> None:
        self.requests: list[str] = []
        requests = self.requests

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                requests.append(self.path)
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/should-not-be-read")
                    self.end_headers()
                    return
                status = 503 if self.path == "/failure" else 200
                self.send_response(status)
                self.send_header(
                    "Content-Type", "text/html" if self.path == "/html" else "application/json",
                )
                if self.path == "/encoded":
                    self.send_header("Content-Encoding", "gzip")
                self.end_headers()
                body = {
                    "/bad": b"{", "/nonfinite": b'{"value": NaN}',
                    "/utf8": bytes([255]), "/large": b"[" + b"0," * 4000 + b"0]",
                }.get(self.path, b'{"state": "MEASURED"}')
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.thread.join)
        self.addCleanup(self.server.shutdown)
        origin = f"http://127.0.0.1:{self.server.server_port}"
        patcher = patch("scripts.discordbot.public_data.SITE_ORIGIN", origin)
        patcher.start()
        self.addCleanup(patcher.stop)

    def read(self, path: str, limit: int = 512) -> Observation:
        return read_resource(Resource(path, 5, limit))

    def test_reads_real_json_with_observed_source_time(self) -> None:
        observed = self.read("/valid")
        self.assertEqual(observed.data, {"state": "MEASURED"})
        self.assertEqual(observed.status, 200)
        self.assertEqual(observed.observed_at.tzinfo, timezone.utc)
        self.assertFalse(observed.cached)

    def test_redirect_is_not_followed(self) -> None:
        with self.assertRaises(DataUnavailable) as error:
            self.read("/redirect")
        self.assertEqual(error.exception.reason, DataFault.REDIRECT)
        self.assertEqual(self.requests, ["/redirect"])

    def test_error_html_malformed_json_encoding_and_size_remain_unknown(self) -> None:
        for path, reason in [
            ("/failure", DataFault.HTTP), ("/html", DataFault.INVALID),
            ("/bad", DataFault.INVALID), ("/nonfinite", DataFault.INVALID),
            ("/utf8", DataFault.INVALID), ("/encoded", DataFault.INVALID),
            ("/large", DataFault.TOO_LARGE),
        ]:
            with self.subTest(path=path), self.assertRaises(DataUnavailable) as error:
                self.read(path)
            self.assertEqual(error.exception.reason, reason)
            self.assertNotIn("MEASURED", str(error.exception))

    def test_site_probe_does_not_read_an_unbounded_page(self) -> None:
        observed = read_resource(Resource("/large", 5, 0, False))
        self.assertEqual(observed.status, 200)
        self.assertIsNone(observed.data)

    def test_socket_failure_and_timeout_are_typed(self) -> None:
        for failure, reason in [
            (OSError("private network detail"), DataFault.UNAVAILABLE),
            (TimeoutError("private network detail"), DataFault.TIMEOUT),
        ]:
            with patch("scripts.discordbot.public_data.build_opener") as factory:
                factory.return_value.open.side_effect = failure
                with self.assertRaises(DataUnavailable) as error:
                    self.read("/valid")
                self.assertEqual(error.exception.reason, reason)
                self.assertNotIn("private", str(error.exception))


class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_single_flight_cache_and_cancellation_preserve_other_callers(self) -> None:
        entered, release = threading.Event(), threading.Event()
        calls: list[str] = []
        now = [10.0]

        def reader(resource: Resource) -> Observation:
            calls.append(resource.path)
            entered.set()
            if not release.wait(2):
                raise RuntimeError("The test did not release its worker.")
            return Observation({}, 200, datetime.now(timezone.utc), 1)

        client = PublicClient(reader, lambda: now[0])
        self.addAsyncCleanup(client.close)
        self.addCleanup(release.set)
        first = asyncio.create_task(client.get("release"))
        second = asyncio.create_task(client.get("release"))
        self.assertTrue(await asyncio.to_thread(entered.wait, 1))
        # This loop can progress while the worker is still blocked on I/O.
        pulse: list[str] = []
        await asyncio.sleep(0)
        pulse.append("event loop progressed")
        first.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await first
        release.set()
        observed = await second
        self.assertEqual(len(calls), 1)
        self.assertTrue(pulse)
        self.assertFalse(observed.cached)
        self.assertTrue((await client.get("release")).cached)
        now[0] += 31
        await client.get("release")
        self.assertEqual(len(calls), 2)

    async def test_failure_is_short_cached_then_recovers(self) -> None:
        now = [1.0]
        calls: list[str] = []

        def reader(resource: Resource) -> Observation:
            calls.append(resource.path)
            if len(calls) == 1:
                raise DataUnavailable(DataFault.HTTP)
            return Observation({"version": "42+abcdef0"}, 200, datetime.now(timezone.utc), 0)

        client = PublicClient(reader, lambda: now[0])
        self.addAsyncCleanup(client.close)
        for _ in range(2):
            with self.assertRaises(DataUnavailable):
                await client.get("release")
        self.assertEqual(len(calls), 1)
        now[0] += 6
        self.assertEqual((await client.get("release")).status, 200)
        self.assertEqual(len(calls), 2)

    async def test_fixed_resources_and_closed_client_cannot_make_requests(self) -> None:
        def no_read(resource: Resource) -> Observation:
            raise AssertionError("No network read is permitted here.")

        client = PublicClient(no_read)
        with self.assertRaises(DataUnavailable):
            await client.get("https://untrusted.invalid/")
        await client.close()
        with self.assertRaises(DataUnavailable) as error:
            await client.get("site")
        self.assertEqual(error.exception.reason, DataFault.CLOSED)

    async def test_shutdown_drains_bounded_workers(self) -> None:
        entered, release = threading.Event(), threading.Event()

        def reader(resource: Resource) -> Observation:
            entered.set()
            if not release.wait(2):
                raise RuntimeError("Worker release was not signalled.")
            return Observation({}, 200, datetime.now(timezone.utc), 0)

        client = PublicClient(reader)
        self.addCleanup(release.set)
        request = asyncio.create_task(client.get("site"))
        self.assertTrue(await asyncio.to_thread(entered.wait, 1))
        closing = asyncio.create_task(client.close())
        await asyncio.sleep(0)
        self.assertFalse(closing.done())
        release.set()
        await request
        await closing
        self.assertFalse(client._flights)

    async def test_response_deadline_does_not_spawn_replacement_workers(self) -> None:
        release = threading.Event()
        calls: list[str] = []

        def reader(resource: Resource) -> Observation:
            calls.append(resource.path)
            if not release.wait(2):
                raise RuntimeError("Worker release was not signalled.")
            return Observation({}, 200, datetime.now(timezone.utc), 0)

        client = PublicClient(reader, response_timeout=0.02)
        self.addAsyncCleanup(client.close)
        self.addCleanup(release.set)
        for _ in range(2):
            with self.assertRaises(DataUnavailable) as error:
                await client.get("site")
            self.assertEqual(error.exception.reason, DataFault.TIMEOUT)
        self.assertEqual(len(calls), 1)
        release.set()
        await client.close()


class InteractionTests(unittest.TestCase):
    def test_configuration_defaults_need_no_privileged_intent_or_sync(self) -> None:
        self.assertEqual(Settings.from_env({}), Settings())
        settings = Settings.from_env({
            "BUILDANDDO_DISCORD_GUILD_IDS": "12345678901234567",
            "BUILDANDDO_DISCORD_CHANNEL_IDS": "22345678901234567",
            "BUILDANDDO_DISCORD_LEGACY_PREFIX": "1",
            "BUILDANDDO_DISCORD_SYNC": "guild",
        })
        self.assertTrue(settings.legacy_prefix)
        self.assertEqual(settings.sync, "guild")
        self.assertEqual(settings.channel_ids, frozenset({22345678901234567}))

    def test_malformed_or_ambiguous_scope_fails_closed(self) -> None:
        for env in [
            {"BUILDANDDO_DISCORD_SYNC": "automatic"},
            {"BUILDANDDO_DISCORD_SYNC": "guild"},
            {"BUILDANDDO_DISCORD_LEGACY_PREFIX": "maybe"},
            {"BUILDANDDO_DISCORD_GUILD_IDS": "0"},
            {"BUILDANDDO_DISCORD_GUILD_IDS": "18446744073709551616"},
            {"BUILDANDDO_DISCORD_CHANNEL_IDS": "22345678901234567"},
        ]:
            with self.subTest(env=env), self.assertRaises(ConfigurationError):
                Settings.from_env(env)

    def test_reply_budget_and_complete_pagination(self) -> None:
        content = "A complete lesson.\n" * 500
        pages = paginate("Lesson", content, "https://buildanddo.com/docs")
        self.assertGreater(len(pages), 1)
        self.assertTrue(all(len(page.body) <= 1800 for page in pages))
        self.assertEqual(
            "".join(page.body.replace("\n", "") for page in pages),
            content.strip().replace("\n", ""),
        )
        with self.assertRaises(ValueError):
            Page("Title", "x" * 1901)
        with self.assertRaises(ValueError):
            Page("Title", "Text", "https://untrusted.invalid/")
        with self.assertRaises(ValueError):
            Reply(())
        self.assertEqual(len(paginate("Empty", "", "https://buildanddo.com/docs")), 1)

    def test_sessions_reject_foreign_expired_and_repeated_answers(self) -> None:
        reply = Reply(
            (Page("Question", "Choose an answer."), Page("Next", "More.")),
            quiz=Quiz(("A", "B")),
        )
        session = PersonalSession(10, reply, now=0)
        self.assertEqual(session.move(10, 10, 1).title, "Next")
        self.assertEqual(session.move(10, -10, 1).title, "Question")
        with self.assertRaises(InteractionDenied):
            session.move(11, 1, 1)
        with self.assertRaises(InteractionDenied):
            session.answer(10, -1, 1)
        result = session.answer(10, 0, 1)
        self.assertIn("You chose 1:\n\"A\"", result.body)
        self.assertIn("Practice only", result.body)
        # The public feed carries no graded answer, so no choice may come back a verdict.
        self.assertNotIn("Correct", result.body)
        with self.assertRaises(InteractionDenied):
            session.answer(10, 1, 1)
        with self.assertRaises(InteractionDenied):
            PersonalSession(10, reply, now=0).answer(10, 1, 600)
        other = PersonalSession(10, reply, now=0).answer(10, 1, 1)
        self.assertIn("You chose 2:\n\"B\"", other.body)
        self.assertNotIn("Correct", other.body)
        self.assertEqual(session.answer(10, 0, 2), result)

    def test_user_and_global_limits_expire_without_unbounded_identity_storage(self) -> None:
        limit = Limiter(per_user=2, total=3, window=10)
        first, second = Caller(1, 1, 1), Caller(2, 1, 1)
        self.assertEqual(limit.admit(first, 0), 0)
        self.assertEqual(limit.admit(first, 1), 0)
        self.assertEqual(limit.admit(first, 2), 8)
        self.assertEqual(limit.admit(second, 2), 0)
        self.assertEqual(limit.admit(Caller(3, 1, 1), 3), 7)
        self.assertEqual(limit.admit(first, 12), 0)
        self.assertEqual(len(limit._users), 1)
