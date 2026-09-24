# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_grading.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/discordbot/grading.py, apps/research/transport.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/grading.py; CONSUMES apps/research/transport.py
# DAG Node:    none
# Intent:      Prove the bot sends quiz answers to the server with its bearer token and reports every refusal without inventing a grade.
# ───────────────────────────────────────────────────────────────

"""Exercise server grading over real loopback HTTP with a stand-in for the PocketBase route."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import unittest

from scripts.discordbot.contracts import Caller, Quiz
from scripts.discordbot.grading import MINIMUM_TOKEN, ROUTE, UNAVAILABLE, Grader, configured_grader

# Synthetic test credential; never a deployed value.
TOKEN = "synthetic-community-bot-token-" + "0" * 16
QUIZ = Quiz("evidence-lesson", ("A", "B", "C"))
CALLER = Caller(123456789012345678, 20, 30)


class GradingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.requests: list[tuple[str, str, dict[str, object]]] = []
        self.reply: tuple[int, object] = (200, {"correct": False})
        test = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                size = int(self.headers.get("Content-Length", "0"))
                test.requests.append((self.path, self.headers.get("Authorization", ""), json.loads(self.rfile.read(size))))
                status, body = test.reply
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def log_message(self, format: str, *args: object) -> None:
                return None

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.env = {"BUILDANDDO_POCKETBASE_URL": f"http://127.0.0.1:{self.server.server_port}", "BUILDANDDO_COMMUNITY_BOT_TOKEN": TOKEN}

    async def test_answers_go_to_the_route_with_the_bearer_token_and_the_discord_user(self) -> None:
        grader = configured_grader(self.env)
        self.addAsyncCleanup(grader.close)
        page, graded = await grader.grade(QUIZ, 2, CALLER)
        self.assertTrue(graded)
        self.assertIn("Not the expected answer", page.body)
        for hidden in ("A", "B", "C"):
            self.assertNotIn("Answer: " + hidden, page.body)
        self.assertEqual(self.requests, [(ROUTE, "Bearer " + TOKEN,
                                          {"slug": "evidence-lesson", "choice": 2, "discord_user_id": "123456789012345678"})])
        self.reply = (200, {"correct": True, "explanation": "Evidence must be recorded."})
        page, graded = await grader.grade(QUIZ, 1, CALLER)
        self.assertTrue(graded)
        self.assertTrue(page.body.startswith("Correct.\n\nEvidence must be recorded."))
        self.assertNotIn(TOKEN, page.body)

    async def test_refusals_and_malformed_replies_are_reported_as_ungraded(self) -> None:
        grader = configured_grader(self.env)
        self.addAsyncCleanup(grader.close)
        for status, body, title in [
            (403, {"message": "members"}, "Graded on the website"),
            (404, {"message": "missing"}, "Lesson not gradable"),
            (429, {"message": "wait"}, "Please wait"),
            (503, {"message": "not configured"}, UNAVAILABLE.title),
            (401, {"message": "credential"}, UNAVAILABLE.title),
            (200, {"correct": True}, UNAVAILABLE.title),
            (200, {"correct": "yes"}, UNAVAILABLE.title),
            (200, {"correct": True, "explanation": "x" * 1501}, UNAVAILABLE.title),
            (200, ["not", "an", "object"], UNAVAILABLE.title),
        ]:
            with self.subTest(status=status, body=body):
                self.reply = (status, body)
                page, graded = await grader.grade(QUIZ, 0, CALLER)
                self.assertFalse(graded)
                self.assertEqual(page.title, title)
                self.assertNotIn(TOKEN, page.body)

    async def test_missing_short_or_invalid_configuration_never_contacts_a_server(self) -> None:
        for env in [{}, {**self.env, "BUILDANDDO_COMMUNITY_BOT_TOKEN": "x" * (MINIMUM_TOKEN - 1)},
                    {**self.env, "BUILDANDDO_POCKETBASE_URL": ""}, {**self.env, "BUILDANDDO_POCKETBASE_URL": "http://public.example.com"}]:
            with self.subTest(keys=sorted(env)):
                grader = configured_grader(env)
                self.assertIsNone(grader.client)
                self.assertEqual(await grader.grade(QUIZ, 0, CALLER), (UNAVAILABLE, False))
                await grader.close()
        self.assertEqual(self.requests, [])

    async def test_an_unreachable_server_is_unavailable_not_an_error(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        grader = configured_grader(self.env)
        self.addAsyncCleanup(grader.close)
        self.assertEqual(await grader.grade(QUIZ, 0, CALLER), (UNAVAILABLE, False))
        self.assertIsInstance(Grader(None), Grader)


if __name__ == "__main__":
    unittest.main()
