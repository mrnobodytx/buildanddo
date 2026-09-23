# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_changelog_feed.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/changelog_feed.py, scripts/ci/public_redaction.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/changelog_feed.py
# Intent:      Prove the public changelog feed carries what shipped, from the build's own history, and
#              nothing it must not: no housekeeping, no merge, no machine name, no clock.
# ───────────────────────────────────────────────────────────────
"""The changelog feed, built from a history planted in a temporary repository.

Every name and address below is made up or from a documentation range, as in
tests/upgrade/test_public_redaction.py: this repository is public.
"""
from __future__ import annotations

import email.utils
import json
import os
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from scripts.ci import changelog_feed as feed
from scripts.ci import public_redaction as redaction

FAMILY_NAME = "ray-xyz0-0"          # follows a machine family; no machine carries it
DOC_IP = "203.0.113.9"              # documentation range (RFC 5737)
ATOM = "{http://www.w3.org/2005/Atom}"


def run(repo: Path, *args: str, when: str = "2026-09-20T10:00:00+00:00") -> None:
    env = dict(os.environ, GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE=when, GIT_AUTHOR_NAME="Tester",
               GIT_AUTHOR_EMAIL="tester@example.com", GIT_COMMITTER_NAME="Tester",
               GIT_COMMITTER_EMAIL="tester@example.com")
    subprocess.run(["git", "-c", "core.autocrlf=false", *args], cwd=repo, check=True, capture_output=True, env=env)


def commit(repo: Path, message: str, when: str) -> None:
    (repo / "change.txt").write_text(message + when, encoding="utf-8")
    run(repo, "add", "change.txt", when=when)
    run(repo, "commit", "-q", "-m", message, when=when)


class ChangelogFeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        self.out = Path(self.tmp.name) / "public"
        run(self.repo, "init", "-q", "-b", "main")
        commit(self.repo, "feat(classrooms): broadcast live classes\n\nSRS: SRS-BUILDANDDO-UPGRADE-001",
               "2026-09-20T10:00:00+00:00")
        commit(self.repo, "chore(bits): rebind the readiness lock", "2026-09-21T10:00:00+00:00")
        commit(self.repo, "fix(web): the status link opens the status page", "2026-09-22T10:00:00+00:00")
        commit(self.repo, f"feat(deploy): ship from {FAMILY_NAME} at {DOC_IP}", "2026-09-23T10:00:00+00:00")
        run(self.repo, "checkout", "-q", "-b", "side", when="2026-09-23T10:30:00+00:00")
        commit(self.repo, "fix(side): a fix that arrives through a merge", "2026-09-23T11:00:00+00:00")
        run(self.repo, "checkout", "-q", "main", when="2026-09-23T11:30:00+00:00")
        run(self.repo, "merge", "-q", "--no-ff", "side", "-m", "Merge branch 'side'", when="2026-09-23T12:00:00+00:00")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def build(self, **options) -> dict:
        return feed.write_feed(self.repo, "HEAD", self.out, rule=redaction.Rule(""), **options)

    def document(self) -> dict:
        return json.loads((self.out / "changelog.json").read_text(encoding="utf-8"))

    def test_only_reader_facing_commits_newest_first_and_no_merge(self):
        self.build()
        items = self.document()["items"]
        self.assertEqual([item["section"] for item in items], ["Fixed", "Added", "Fixed", "Added"])
        self.assertEqual(items[0]["title"], "side: a fix that arrives through a merge")
        self.assertEqual(items[-1]["srs"], ["SRS-BUILDANDDO-UPGRADE-001"])
        titles = " ".join(item["title"] for item in items)
        self.assertNotIn("rebind the readiness lock", titles)       # housekeeping stays in CHANGELOG.md
        self.assertNotIn("Merge branch", titles)                     # a merge is not a change
        for item in items:
            self.assertTrue(item["url"].startswith("https://github.com/mrnobodytx/buildanddo/commit/"))

    def test_a_planted_machine_name_and_address_are_withheld(self):
        summary = self.build()
        text = (self.out / "changelog.json").read_text(encoding="utf-8") + (self.out / "changelog.xml").read_text(encoding="utf-8")
        self.assertNotIn(FAMILY_NAME, text)
        self.assertNotIn(DOC_IP, text)
        self.assertIn(f"deploy: ship from {redaction.BAR} at {redaction.BAR}", text)
        self.assertEqual(summary["withheld"], 1)
        # The control: the planted subject really carries both, so withholding is what keeps them out.
        self.assertEqual(redaction.Rule("").find_leaks(f"ship from {FAMILY_NAME} at {DOC_IP}"),
                         {"ips": [DOC_IP], "machines": [FAMILY_NAME]})

    def test_the_rss_parses_and_matches_the_json(self):
        self.build()
        channel = ET.fromstring((self.out / "changelog.xml").read_bytes()).find("channel")
        self.assertEqual(channel.findtext("title"), "BuildAndDo changelog")
        self.assertEqual(channel.find(f"{ATOM}link").get("href"), "https://buildanddo.com/changelog.xml")
        rss_items = channel.findall("item")
        json_items = self.document()["items"]
        self.assertEqual(len(rss_items), len(json_items))
        self.assertEqual(len({item.findtext("guid") for item in rss_items}), len(rss_items))
        for rss, entry in zip(rss_items, json_items):
            self.assertEqual(rss.findtext("title"), f"{entry['section']}: {entry['title']}")
            self.assertEqual(rss.findtext("link"), entry["url"])
            self.assertEqual(email.utils.parsedate_to_datetime(rss.findtext("pubDate")).isoformat(), entry["published"])
        self.assertIn("SRS-BUILDANDDO-UPGRADE-001", [c.text for c in rss_items[-1].findall("category")])
        self.assertEqual(channel.findtext("lastBuildDate"), rss_items[0].findtext("pubDate"))

    def test_the_same_ref_writes_the_same_bytes(self):
        self.build()
        first = [(self.out / name).read_bytes() for name in ("changelog.json", "changelog.xml")]
        self.build()
        self.assertEqual([(self.out / name).read_bytes() for name in ("changelog.json", "changelog.xml")], first)

    def test_the_limit_keeps_the_newest(self):
        self.build(limit=2)
        self.assertEqual([item["title"] for item in self.document()["items"]],
                         ["side: a fix that arrives through a merge", f"deploy: ship from {redaction.BAR} at {redaction.BAR}"])

    def test_no_history_writes_no_feed_and_clears_a_stale_one(self):
        self.out.mkdir()
        (self.out / "changelog.json").write_text("{}", encoding="utf-8")
        not_a_repo = Path(self.tmp.name) / "no-git"
        not_a_repo.mkdir()
        status = feed.main(["--root", str(not_a_repo), "--out", str(self.out)])
        self.assertEqual(status, 1)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
