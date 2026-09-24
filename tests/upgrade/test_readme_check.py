# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_readme_check.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CHANGELOG-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/readme_check.py, scripts/ci/changelog_gen.py, README.md
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/readme_check.py; VALIDATES scripts/ci/changelog_gen.py;
#              VALIDATES README.md
# Intent:      Prove the README gate catches each kind of drift it claims to, with a control
#              that plants the drift and shows the check going red.
# ───────────────────────────────────────────────────────────────
"""README regression check, and the changelog's skip trailer and redaction.

Each rule gets a planted failure in a throwaway tree: a missing app, a dead
link, a dead anchor, a hand-edited roadmap row. A check that passed all of
those would be passing by not looking. The live README is checked last, so
this suite also fails whenever the real file drifts.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

from scripts.ci import changelog_gen
from scripts.ci import readme_check

ROOT = Path(__file__).resolve().parents[2]

SPRINT_CYCLE = textwrap.dedent(
    """
    MILESTONES = [
        {"day": 1, "title": "Kickoff", "planned_value": 5},
        {"day": 21, "title": "Review", "planned_value": 100},
    ]
    """
)


class ReadmeFixture:
    """A minimal repository: two apps, one service, one workflow, a doc."""

    def __init__(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="readme-check-"))
        for path in ("apps/web", "apps/pocketbase", "services/praxis_evidence", "docs", "scripts/ci", ".github/workflows"):
            (self.dir / path).mkdir(parents=True)
        (self.dir / "docs/guide.md").write_text("# Guide\n", encoding="utf-8")
        (self.dir / ".github/workflows/ci.yml").write_text("name: ci\n", encoding="utf-8")
        (self.dir / "scripts/ci/sprint_cycle.py").write_text(SPRINT_CYCLE, encoding="utf-8")
        milestones = readme_check.load_milestones(self.dir)
        # Dedent before substituting: the multi-line roadmap has no indent of its
        # own, so interpolating first would leave dedent nothing common to strip.
        template = textwrap.dedent(
            """\
            # Demo

            See [the guide](docs/guide.md) and [setup](#quick-start).

            ## Quick start

            | Path | What |
            |---|---|
            | `apps/web` | site |
            | `apps/pocketbase` | backend |
            | `services/praxis_evidence` | evidence |
            | `.github/workflows/ci.yml` | ci |

            ```
            apps/not-a-real-app/  <- inside a fence, never counted as a link or a name
            [fenced](missing.md)
            ```

            @ROADMAP@
            """
        )
        block = f"{readme_check.ROADMAP_BEGIN}\n{readme_check.render_roadmap(milestones)}\n{readme_check.ROADMAP_END}"
        self.readme = template.replace("@ROADMAP@", block)
        self.write(self.readme)

    def write(self, text: str) -> None:
        (self.dir / "README.md").write_text(text, encoding="utf-8")

    def result(self) -> dict:
        return readme_check.check(self.dir)

    def close(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)


class ReadmeCheckTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = ReadmeFixture()
        self.addCleanup(self.repo.close)

    def assertFailsWith(self, fragment: str) -> None:
        result = self.repo.result()
        self.assertEqual(result["status"], "FAIL", result)
        self.assertTrue(any(fragment in p for p in result["problems"]), result["problems"])

    def test_consistent_fixture_passes(self) -> None:
        result = self.repo.result()
        self.assertEqual(result["status"], "PASS", result["problems"])
        self.assertEqual(result["names_required"], 4)

    def test_control_an_undocumented_app_fails_coverage(self) -> None:
        (self.repo.dir / "apps/billing").mkdir()
        self.assertFailsWith("coverage: apps/billing exists")

    def test_control_an_undocumented_workflow_fails_coverage(self) -> None:
        (self.repo.dir / ".github/workflows/deploy.yml").write_text("name: d\n", encoding="utf-8")
        self.assertFailsWith("coverage: .github/workflows/deploy.yml")

    def test_a_prefix_is_not_a_mention(self) -> None:
        # `apps/web` is named; `apps/we` must not be satisfied by it.
        (self.repo.dir / "apps/we").mkdir()
        self.assertFailsWith("coverage: apps/we exists")

    def test_control_a_dead_relative_link_fails(self) -> None:
        self.repo.write(self.repo.readme.replace("docs/guide.md", "docs/renamed.md"))
        self.assertFailsWith("links: docs/renamed.md does not exist")

    def test_control_a_dead_anchor_fails(self) -> None:
        self.repo.write(self.repo.readme.replace("#quick-start", "#quickstart"))
        self.assertFailsWith("links: #quickstart names no heading")

    def test_a_link_cannot_escape_the_repository(self) -> None:
        self.repo.write(self.repo.readme.replace("docs/guide.md", "../../etc/hostname"))
        self.assertFailsWith("points outside the repository")

    def test_absolute_urls_are_not_fetched(self) -> None:
        self.repo.write(self.repo.readme + "\n[site](https://example.invalid/nowhere)\n")
        self.assertEqual(self.repo.result()["status"], "PASS")

    def test_control_a_hand_edited_roadmap_row_fails_and_write_repairs_it(self) -> None:
        self.repo.write(self.repo.readme.replace("| 1 | Kickoff |", "| 1 | Kickoff, renamed |"))
        self.assertFailsWith("roadmap: the generated block does not match")
        self.assertTrue(readme_check.write(self.repo.dir))
        self.assertEqual(self.repo.result()["status"], "PASS")
        self.assertFalse(readme_check.write(self.repo.dir), "a second write must be a no-op")

    def test_missing_markers_fail(self) -> None:
        self.repo.write(self.repo.readme.replace(readme_check.ROADMAP_END, ""))
        self.assertFailsWith("markers:")

    def test_github_heading_slugs(self) -> None:
        self.assertEqual(readme_check.slugify("Public/private boundary"), "publicprivate-boundary")
        self.assertEqual(readme_check.slugify("Provenance & verification"), "provenance--verification")
        self.assertEqual(readme_check.slugify("`apps/web` — the site"), "appsweb--the-site")

    def test_repeated_headings_get_numbered_anchors(self) -> None:
        found = readme_check.anchors("## Notes\n\n## Notes\n")
        self.assertEqual(found, {"notes", "notes-1"})

    def test_the_live_readme_passes(self) -> None:
        result = readme_check.check(ROOT)
        self.assertEqual(result["status"], "PASS", result["problems"])


class ChangelogGenTests(unittest.TestCase):
    """The refresh commit stays out of the changelog, and no subject republishes a machine or address."""

    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="changelog-skip-"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=self.dir, check=True, capture_output=True, text=True
        ).stdout

    def commit(self, *messages: str) -> None:
        args = ["commit", "-q", "--allow-empty"]
        for message in messages:
            args += ["-m", message]
        self.git(*args)

    def test_trailer_excludes_only_the_marked_commit(self) -> None:
        self.commit("feat(web): real change", "SRS: SRS-BUILDANDDO-CHANGELOG-001")
        self.commit(
            "docs(changelog): refresh from main history [skip ci]",
            "SRS: SRS-BUILDANDDO-CHANGELOG-001\nChangelog: skip",
        )
        self.commit("fix(web): mentions Changelog: skip mid-sentence, which is not a trailer")
        subjects = [c["subject"] for c in changelog_gen.read_commits(self.dir, "main", "", "")]
        self.assertEqual(
            subjects,
            ["fix(web): mentions Changelog: skip mid-sentence, which is not a trailer", "feat(web): real change"],
        )

    def test_control_a_machine_name_or_address_in_a_subject_is_redacted(self) -> None:
        # Made-up fixture name and a documentation-range address (RFC 5737), never a real one.
        self.commit("fix(ops): restart the worker on kvm0 at 192.0.2.10")
        (commit,) = changelog_gen.read_commits(self.dir, "main", "", "")
        self.assertNotIn("kvm0", commit["subject"])
        self.assertNotIn("192.0.2.10", commit["subject"])
        self.assertTrue(commit["subject"].startswith("fix(ops): restart the worker on "))


if __name__ == "__main__":
    unittest.main()
