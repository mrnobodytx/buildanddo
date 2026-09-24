# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_estate_private_routes.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WORKSPACE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/pocketbase/pb_hooks/estate.pb.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/estate.pb.js
# Intent:      Hold every estate report route to one gate - master seat or 404 - by comparing the
#              handlers to each other rather than trusting each to be written correctly again.
# ───────────────────────────────────────────────────────────────
"""The estate routes serve the operator's own reports, and they are gated by hand.

There is no PocketBase binary on a developer box by default (BUILDANDDO_TEST_POCKETBASE names one
when there is), so these tests read the hook source instead of calling the routes. That is weaker
than a live request and is stated plainly here rather than dressed up: what it CAN prove is that the
second gate is the first gate, character for character, once the subject noun and the file name are
taken out. A gate re-typed from memory is how one of two sibling routes ends up without its check.

The last test is the control for the comparison itself: it removes the master-seat check from one
handler and asserts the comparison then reports a difference. Without it, a comparator that silently
matched everything would read as a pass.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOK = ROOT / "apps" / "pocketbase" / "pb_hooks" / "estate.pb.js"

FLEET_ROUTE = "/api/buildanddo/estate/fleet-status"
PLATFORM_ROUTE = "/api/buildanddo/estate/platform-health"

# The words that are ALLOWED to differ between the two handlers: what the report is called, and what
# file it is read from. Everything else - the gate, the 404, the env var, the UNMEASURED answer - is
# the contract and must be identical.
SUBJECTS = ("fleet snapshot", "platform assessment")
FILES = ("fleet-status.json", "platform-health.json")


def source() -> str:
    return HOOK.read_text(encoding="utf-8")


def handler(text: str, route: str) -> str:
    """Return the body of the routerAdd handler registered for `route`.

    Args:
        text: The hook source.
        route: The route path as written in the source.

    Returns:
        The handler body, from the opening brace to its match.
    """
    opening = re.search(rf"routerAdd\('GET', '{re.escape(route)}', \(e\) => \{{", text)
    if not opening:
        raise AssertionError(f"no GET handler registered for {route} in {HOOK.name}")
    start = opening.end() - 1
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    raise AssertionError(f"unbalanced braces in the {route} handler")


def normalised(body: str) -> str:
    """Take the report's name and file out, so what is left is only the gate and the answer shape."""
    for subject in SUBJECTS:
        body = body.replace(subject, "<SUBJECT>")
    for name in FILES:
        body = body.replace(name, "<FILE>")
    return body


class EstateRouteTests(unittest.TestCase):
    """Both estate reports, one gate."""

    def test_the_platform_health_route_is_registered(self):
        self.assertIn(f"routerAdd('GET', '{PLATFORM_ROUTE}'", source())

    def test_the_platform_handler_mirrors_the_fleet_handler(self):
        text = source()
        self.assertEqual(
            normalised(handler(text, PLATFORM_ROUTE)),
            normalised(handler(text, FLEET_ROUTE)),
            "the two estate handlers differ by more than the report's name and file",
        )

    def test_the_gate_and_the_unmeasured_answer_are_what_the_contract_says(self):
        # Asserted positively as well as by comparison: if BOTH handlers were rewritten wrongly the
        # test above would still pass.
        body = handler(source(), PLATFORM_ROUTE)
        self.assertIn("if (level !== MASTER) {", body)
        self.assertIn("return e.json(404, { error: 'not found' });", body)
        self.assertIn("$os.getenv('BUILDANDDO_ESTATE_DIR')", body)
        self.assertIn("`${__hooks}/../pb_data/estate`", body)
        self.assertIn("${dir}/platform-health.json", body)
        # 200 with no measurement, not 404: PlatformHealthPage has a branch for this and a 404 would
        # read to it as "you are not a master seat".
        self.assertIn("return e.json(200, {", body)
        self.assertIn("state: 'UNMEASURED',", body)
        self.assertIn("served_to: 'master seat',", body)

    def test_an_anonymous_caller_is_not_answered_differently_from_a_signed_in_one(self):
        # No requireAuth middleware on this route, on purpose: middleware would answer 401, which
        # tells an anonymous caller the route exists. The handler's own check answers 404 to both.
        text = source()
        registration = text[text.index(f"routerAdd('GET', '{PLATFORM_ROUTE}'"):]
        self.assertNotIn("requireAuth", registration[:registration.index("});") + 3])
        self.assertIn("e.auth ?", handler(text, PLATFORM_ROUTE))

    def test_removing_the_master_check_is_caught(self):
        # The control for the comparison. If this passes while the mirror test also passes, the
        # mirror test is measuring something.
        text = source()
        weakened = normalised(handler(text, PLATFORM_ROUTE)).replace(
            "if (level !== MASTER) {", "if (false) {")
        self.assertNotEqual(weakened, normalised(handler(text, FLEET_ROUTE)))


if __name__ == "__main__":
    unittest.main()
