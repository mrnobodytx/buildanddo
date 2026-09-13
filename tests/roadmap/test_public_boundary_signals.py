#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/roadmap/test_public_boundary_signals.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-13
# Intent:      Guard the WHOLE published document, not one function of it.
# ───────────────────────────────────────────────────────────────
"""The public boundary, asserted over the document that is actually published.

WHY THIS FILE EXISTS. roadmap_status.py's module docstring promises that "file paths,
bars, hostnames and secret names never cross" into roadmap-status.json. _progression()
honoured that; _signals() did not - it assigned the estate collector's `sources` dict
verbatim. The result was live on staging AND production: the public document named
twelve credentials by their exact environment-variable names, among them
BUILDANDDO_REDDIT_CLIENT_SECRET, DD_API_KEY, GITHUB_TOKEN and POSTHOG_API_KEY.

The existing leak guard in test_roadmap_status_progression.py asserts over
roadmap_status._progression(...) alone. It passed the entire time, because it was
looking at the one function that was already correct. A guard scoped to a function
cannot see a leak in its neighbour, so this one asserts over build_report() - the whole
thing that reaches the browser.

These tests must keep passing with an ABSENT estate (UNMEASURED everywhere) and with a
present one; neither is allowed to be a reason to skip. A test that quietly does nothing
when the input is missing is the same failure in a different costume.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "deploy"))
sys.path.insert(0, str(ROOT / "scripts" / "ci"))

import roadmap_status  # noqa: E402

# An env-var-shaped name ending in a credential word. Deliberately shape-based rather
# than a fixed list: the estate collector is not owned by this repo, so tomorrow's key
# name is unknown today and a fixed list would only ever catch yesterday's leak.
CREDENTIAL_RX = re.compile(
    r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:TOKEN|SECRET|PASSWORD|PAT|CREDENTIAL|APIKEY)\b"
    r"|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_API_KEY\b"
    r"|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_APP_KEY\b"
)
WINDOWS_PATH_RX = re.compile(r"[A-Za-z]:\\\\")
POSIX_PATH_RX = re.compile(r'"/(?:home|var|etc|root|opt|Users)/')


def _report_text() -> str:
    return json.dumps(roadmap_status.build_report())


class PublicBoundary(unittest.TestCase):
    def test_no_credential_names_in_the_published_document(self):
        hits = sorted(set(CREDENTIAL_RX.findall(_report_text())))
        self.assertEqual(
            hits, [],
            "roadmap-status.json is world-readable. These credential NAMES would be "
            "published, telling a reader exactly which secrets exist and what they are "
            "called: %s" % ", ".join(hits),
        )

    def test_no_absolute_paths_in_the_published_document(self):
        text = _report_text()
        self.assertEqual(WINDOWS_PATH_RX.findall(text), [], "a Windows path reached the public document")
        self.assertEqual(POSIX_PATH_RX.findall(text), [], "a POSIX path reached the public document")

    def test_the_regex_actually_catches_the_names_that_leaked(self):
        """Negative control. Without this, a broken pattern makes every assertion above
        pass by matching nothing - which is exactly how the original leak survived a
        green suite."""
        for name in ("BUILDANDDO_REDDIT_CLIENT_SECRET", "DD_API_KEY", "DD_APP_KEY",
                     "GITHUB_TOKEN", "POSTHOG_API_KEY", "BUILDANDDO_FORUM_API_KEY"):
            self.assertTrue(CREDENTIAL_RX.search(name), "pattern fails to catch %s" % name)
        for benign in ("MEASURED", "CENSUS_DEGRADED", "SIGNALS_NOT_RESULTS", "FORUM_LIVE_BUT_EMPTY"):
            self.assertIsNone(CREDENTIAL_RX.search(benign), "pattern is too greedy: %s" % benign)

    def test_sanitiser_strips_names_and_keeps_information(self):
        """Both halves asserted against a FIXTURE, so this runs everywhere.

        The previous version of this test read the LIVE estate and called skipTest when
        no measured signals were present. A peer pointed out what that means in CI: a
        bare container has no measured signals either, so the one assertion proving the
        sanitiser does not simply publish nothing would never have executed anywhere
        automated. Green, guarding nothing - the exact shape this file was written to
        catch. Feeding a fixture removes the environment from the question.

        Both directions matter. A sanitiser that returns {} passes every leak assertion
        ever written; a sanitiser that returns its input passes every information
        assertion. Only asserting both at once pins it.
        """
        source = {
            "state": "DEGRADED",
            "reason": "CENSUS_DEGRADED",
            "freshness": "STALE",
            "basis": "FLARUM_PUBLIC_API+LOCAL_VERIFICATION_RECORD",
            "metrics": {"monitors": 72, "alerting": 15},
            # every shape that really leaked, reproduced from the live bundle
            "secret_names": ["DD_API_KEY", "DD_APP_KEY"],
            "token_name": "GITHUB_TOKEN",
            "key_name": "BAD_PERSONAL_PH_KEY",
            "project_id_name": "POSTHOG_PROJECT_ID",
            "host": "eu.posthog.com",
            "repo": "mrnobodytx/buildanddo",
            "source_file": "/d/HOSTINGER_COMP/state/roadmap_signals/latest.json",
        }
        out = roadmap_status._public_signals({  # noqa: SLF001 - the boundary IS the unit
            "schema": "buildanddo.roadmap-signals/v1",
            "generated_at": "2026-09-13T00:00:00+00:00",
            "state": "DEGRADED",
            "sources": {"datadog": source},
            "failures": [],
            "truth_boundary": {},
        })
        blob = json.dumps(out)

        # 1. nothing sensitive survives
        for leaked in ("DD_API_KEY", "DD_APP_KEY", "GITHUB_TOKEN", "BAD_PERSONAL_PH_KEY",
                       "POSTHOG_PROJECT_ID", "eu.posthog.com", "mrnobodytx/buildanddo",
                       "HOSTINGER_COMP", "secret_names", "token_name", "key_name"):
            self.assertNotIn(leaked, blob, "%r survived the sanitiser" % leaked)

        # 2. and the tile is still worth publishing
        row = out["sources"]["datadog"]
        self.assertEqual(row["state"], "DEGRADED")
        self.assertEqual(row["reason"], "CENSUS_DEGRADED")
        self.assertEqual(row["freshness"], "STALE")
        self.assertEqual(row["metrics"], {"monitors": 72.0, "alerting": 15.0})

    def test_a_bare_credential_name_cannot_ride_through_reason(self):
        """reason and a credential name are the same shape; only one may pass."""
        def reason_for(value):
            out = roadmap_status._public_signals(  # noqa: SLF001
                {"schema": "s", "generated_at": "t", "state": "MEASURED",
                 "sources": {"x": {"state": "MEASURED", "reason": value}},
                 "failures": [], "truth_boundary": {}})
            return out["sources"]["x"]["reason"]

        for credential in ("DD_API_KEY", "GITHUB_TOKEN", "BUILDANDDO_FORUM_API_KEY", "R_SECRET"):
            self.assertIsNone(reason_for(credential), "%s rode through reason" % credential)
        for real in ("CENSUS_DEGRADED", "FORUM_LIVE_BUT_EMPTY", "DEVVIT_PROJECT_UNMEASURED"):
            self.assertEqual(reason_for(real), real, "%s was wrongly dropped" % real)


if __name__ == "__main__":
    unittest.main()
