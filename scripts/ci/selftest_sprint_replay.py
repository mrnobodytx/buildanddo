#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/selftest_sprint_replay.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/sprint_replay.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/sprint_replay.py
# Intent:      Hold the replay to the one thing it exists for - refusing to call an
#              unverifiable claim verified - and to the restraint that makes it trustworthy.
# ───────────────────────────────────────────────────────────────
"""Selftest for the day-21 sprint replay.

The first test is the control that motivated the whole module: the ledger scored the same
with real evidence and with the letter "x". A replay that cannot tell those apart is worth
nothing, so that case is asserted first and directly.

The rest guard the opposite failure, which is the one that would get the gate switched off:
a replay that cries rot over things it simply cannot see. An estate receipt, a shallow
clone, a missing git, an endpoint reading taken last week - none of those are rot, and each
has a test saying so.

Stdlib only (unittest), matching the rest of scripts/ci/.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sprint_cycle  # noqa: E402
import sprint_replay as R  # noqa: E402

REAL_D1 = (
    "commit d2d5f83 (ship.py build->gate->staging sync->staging probe->promote, release manifest "
    "apps/web/public/.well-known/citadel-release.json); estate receipt state/tenant_rail/stage.latest.json "
    "(controller estate, outside this repo) state PASS observed 2026-09-11T20:18Z: gate PASS, "
    "staging probe 200, live PASS"
)
REAL_D13 = (
    "commit abc10c9 (Living Rooms overlay: RoomCanvas, UtilizationPanel, useRoomProjection, routes "
    "app/rooms, app/rooms/systems, app/rooms/live; header Rooms-live pill via useRoomsLive); staging "
    "readback 2026-09-18: /room-projections/index.json 200 and /room-projections/systems.json 200"
)


def _ctx(root: Path, **over) -> R.Context:
    """Build a Context without touching the real repository or the network."""
    ctx = R.Context.__new__(R.Context)
    ctx.root = root
    ctx.probe = over.get("probe", False)
    ctx.base_url = over.get("base_url", "")
    ctx.git_available = over.get("git_available", False)
    ctx.shallow = over.get("shallow", False)
    return ctx


def _ledger(entries: list[dict]) -> dict:
    """Build a merged state dict the way sprint_cycle would."""
    return {"campaign_id": "t", "sprint_start": "2026-09-09", "sprint_days": 21,
            "milestones": sprint_cycle._merge_state(entries), "source": "test"}


class TheControl(unittest.TestCase):
    """The failure that justified the module."""

    def test_junk_evidence_is_UNCHECKED_not_HOLDS(self):
        # sprint_cycle scores this identically to real evidence - 38% either way. The whole
        # point of the replay is that these two must not read the same.
        state = _ledger([{"day": 1, "status": "verified", "evidence": "x"}])
        report = R.replay(state, _ctx(Path(".")))
        day1 = report["milestones"][0]
        self.assertEqual(day1["verdict"], R.UNCHECKED)
        self.assertEqual(report["replayed_pct"], 0.0)
        # ...while sprint_cycle still hands it full credit, which is the gap, stated as a number.
        self.assertEqual(report["claimed_pct"], 5.0)
        self.assertEqual(report["overstatement_pct"], 5.0)

    def test_a_whole_junk_sprint_replays_to_zero(self):
        state = _ledger([{"day": m["day"], "status": "verified", "evidence": "x"}
                         for m in sprint_cycle.MILESTONES])
        report = R.replay(state, _ctx(Path(".")))
        self.assertEqual(report["claimed_pct"], 100.0)   # the old rule: sprint complete
        self.assertEqual(report["replayed_pct"], 0.0)    # the replay: nothing was shown
        self.assertEqual(report["counts"][R.UNCHECKED], 11)


class ClaimExtraction(unittest.TestCase):
    """What the parser will and will not claim to have found."""

    def test_pulls_shas_paths_receipts_and_endpoints_out_of_real_evidence(self):
        kinds = {(c["kind"], c["ref"]) for c in R.extract_claims(REAL_D1)}
        self.assertIn(("commit", "d2d5f83"), kinds)
        self.assertIn(("repo_path", "apps/web/public/.well-known/citadel-release.json"), kinds)
        self.assertIn(("estate_receipt", "state/tenant_rail/stage.latest.json"), kinds)

    def test_a_route_is_not_a_file(self):
        # "routes app/rooms, app/rooms/systems" are React routes. Treating them as paths
        # would report a rot in day 13 that does not exist - the loudest possible false
        # positive, on the most recently verified milestone.
        refs = {c["ref"] for c in R.extract_claims(REAL_D13)}
        self.assertNotIn("app/rooms", refs)
        self.assertNotIn("app/rooms/systems", refs)
        self.assertIn("abc10c9", refs)
        self.assertIn("/room-projections/index.json", refs)

    def test_a_timestamp_is_not_a_sha(self):
        # 1789100000 is ten hex-legal characters and a unix timestamp. Requiring a letter
        # a-f is what keeps migration filenames out of the commit checks.
        self.assertFalse(R._is_sha("1789100000"))
        self.assertTrue(R._is_sha("2510ac6"))
        self.assertFalse(R._is_sha("abc"))

    def test_expected_status_is_read_from_the_following_token(self):
        claims = {c["ref"]: c for c in R.extract_claims("/api/ocn/login (200) and /gone 404")}
        self.assertEqual(claims["/api/ocn/login"]["expect_status"], 200)
        self.assertEqual(claims["/gone"]["expect_status"], 404)

    def test_prose_yields_nothing(self):
        self.assertEqual(R.extract_claims("we finished the thing and it works"), [])
        self.assertEqual(R.extract_claims(""), [])

    def test_a_leading_dot_survives_tokenising(self):
        # Stripping it turned ".github/workflows/pr-governance.yml" into a path that does
        # not exist, and the replay reported a present, tracked file as rotted.
        refs = {c["ref"] for c in R.extract_claims(
            "wired in .github/workflows/pr-governance.yml and apps/web/public/.well-known/x.json.")}
        self.assertIn(".github/workflows/pr-governance.yml", refs)
        self.assertIn("apps/web/public/.well-known/x.json", refs)


class RefusesToOverclaimRot(unittest.TestCase):
    """Each of these would be a false accusation, and each has a named outcome instead."""

    def test_estate_receipt_is_external_not_rotted(self):
        result = R.check_claim({"kind": "estate_receipt", "ref": "state/x/y.json"}, _ctx(Path(".")))
        self.assertEqual(result["outcome"], R.EXTERNAL)

    def test_shallow_clone_cannot_disprove_a_commit(self):
        # CI clones shallow. Reporting ROTTED here would fire on every pipeline run.
        ctx = _ctx(Path("."), git_available=True, shallow=True)
        result = R.check_claim({"kind": "commit", "ref": "0000000"}, ctx)
        self.assertEqual(result["outcome"], R.UNMEASURABLE)

    def test_missing_git_is_unmeasurable(self):
        result = R.check_claim({"kind": "commit", "ref": "0000000"}, _ctx(Path("."), git_available=False))
        self.assertEqual(result["outcome"], R.UNMEASURABLE)

    def test_endpoints_are_not_probed_unless_asked(self):
        # A past readback is not re-provable by a request today, and a gate that needs
        # staging up is a gate that gets ignored.
        result = R.check_claim({"kind": "endpoint", "ref": "/x", "expect_status": 200}, _ctx(Path(".")))
        self.assertEqual(result["outcome"], R.UNMEASURABLE)

    def test_unmeasurable_alone_never_reads_as_holding(self):
        state = _ledger([{"day": 1, "status": "verified", "evidence": "commit deadbee"}])
        report = R.replay(state, _ctx(Path("."), git_available=True, shallow=True))
        self.assertEqual(report["milestones"][0]["verdict"], R.UNCHECKED)
        self.assertEqual(report["replayed_pct"], 0.0)


class PathsResolveAtTheirCitedCommit(unittest.TestCase):
    """The bug that made the first real run wrong, held down with a real repository."""

    @staticmethod
    def _repo(tmp: Path) -> str:
        """Build a repo where a file exists in the first commit and is deleted in the second."""
        git = ["git", "-c", "user.email=t@t", "-c", "user.name=t", "-C", str(tmp)]
        subprocess.run([*git[:1], "-C", str(tmp), "init", "-q"], check=True, capture_output=True)
        (tmp / "src").mkdir()
        (tmp / "src" / "gone.js").write_text("//", encoding="utf-8")
        subprocess.run([*git[:1], "-C", str(tmp), "add", "-A"], check=True, capture_output=True)
        subprocess.run([*git, "commit", "-qm", "add"], check=True, capture_output=True)
        sha = subprocess.run([*git[:1], "-C", str(tmp), "rev-parse", "HEAD"],
                             check=True, capture_output=True, text=True).stdout.strip()
        (tmp / "src" / "gone.js").unlink()
        subprocess.run([*git[:1], "-C", str(tmp), "add", "-A"], check=True, capture_output=True)
        subprocess.run([*git, "commit", "-qm", "remove"], check=True, capture_output=True)
        return sha

    def test_a_file_deleted_since_still_holds_at_the_commit_that_carried_it(self):
        # THE REGRESSION. The working tree no longer has gone.js, but the evidence says
        # "commit <sha>; gone.js" - and at that sha it is there. A worktree check called
        # seven such files rotted on the real ledger; every one was present in its own
        # cited commit, and the checkout was simply on another seat's branch.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            ctx = _ctx(root, git_available=True)
            state = _ledger([{"day": 1, "status": "verified", "evidence": f"commit {sha}; src/gone.js"}])
            report = R.replay(state, ctx)
            day1 = report["milestones"][0]
            self.assertEqual(day1["verdict"], R.HOLDS)
            self.assertEqual(day1["claims"][R.ROTTED], 0)
            resolved = [c for c in day1["checked"] if c["kind"] == "repo_path"][0]
            self.assertEqual(resolved["resolved_at"], sha)

    def test_a_path_absent_from_its_own_cited_commit_really_has_rotted(self):
        # The control for the test above: same machinery, a claim that is genuinely false.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            ctx = _ctx(root, git_available=True)
            state = _ledger([{"day": 1, "status": "verified",
                              "evidence": f"commit {sha}; src/never-existed.js"}])
            report = R.replay(state, ctx)
            self.assertEqual(report["milestones"][0]["verdict"], R.ROTTED_V)


class DetectsRealRot(unittest.TestCase):
    """The measurements it will make."""

    def test_a_deleted_path_rots_the_milestone(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "apps").mkdir()
            (root / "apps" / "kept.js").write_text("//", encoding="utf-8")
            state = _ledger([{"day": 1, "status": "verified",
                              "evidence": "apps/kept.js and apps/deleted.js"}])
            report = R.replay(state, _ctx(root))
            day1 = report["milestones"][0]
            self.assertEqual(day1["verdict"], R.ROTTED_V)
            self.assertEqual(day1["claims"][R.HELD], 1)
            self.assertEqual(day1["claims"][R.ROTTED], 1)
            # One rotted claim outweighs a held one: the milestone stops counting.
            self.assertEqual(report["replayed_pct"], 0.0)
            self.assertEqual(report["overstatement_pct"], 5.0)

    def test_a_present_path_holds(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "apps").mkdir()
            (root / "apps" / "kept.js").write_text("//", encoding="utf-8")
            state = _ledger([{"day": 1, "status": "verified", "evidence": "apps/kept.js"}])
            report = R.replay(state, _ctx(root))
            self.assertEqual(report["milestones"][0]["verdict"], R.HOLDS)
            self.assertEqual(report["replayed_pct"], 5.0)
            self.assertEqual(report["overstatement_pct"], 0.0)

    def test_an_unverified_milestone_is_reported_as_such_not_as_rot(self):
        report = R.replay(_ledger([]), _ctx(Path(".")))
        self.assertEqual(report["counts"][R.NOT_VERIFIED], 11)
        self.assertEqual(report["counts"][R.ROTTED_V], 0)


class ReportShape(unittest.TestCase):
    """What the pipeline and the public page consume."""

    def test_every_planned_milestone_appears_exactly_once(self):
        report = R.replay(_ledger([]), _ctx(Path(".")))
        days = [m["day"] for m in report["milestones"]]
        self.assertEqual(days, [m["day"] for m in sprint_cycle.MILESTONES])

    def test_replayed_never_exceeds_claimed(self):
        # The replay may only ever subtract. If it could add, it would be a second place to
        # assert progress - which is the thing this module exists to prevent.
        state = _ledger([{"day": d, "status": "verified", "evidence": "scripts/ci/sprint_replay.py"}
                         for d in (1, 3, 5)])
        report = R.replay(state, _ctx(R.ROOT))
        self.assertLessEqual(report["replayed_pct"], report["claimed_pct"])

    def test_renders_without_raising_for_every_verdict(self):
        state = _ledger([{"day": 1, "status": "verified", "evidence": "x"},
                         {"day": 3, "status": "verified", "evidence": "apps/nope.js"}])
        text = R.render(R.replay(state, _ctx(Path("/nonexistent"))))
        self.assertIn("SPRINT REPLAY", text)
        self.assertIn("UNCHECKED", text)
        self.assertIn("ROTTED", text)


class BuildOutputIsNotRot(unittest.TestCase):
    """The false alarm of 2026-09-20: a generated file read as a refuted claim.

    Day 1 cites the release manifest ship.py writes at deploy time. It is in no commit
    because the repo declares it build output - and the replay called that ROTTED while
    both staging and production served it 200. A red that a healthy repo also produces
    measures the probe, not the world.
    """

    @staticmethod
    def _repo(tmp: Path) -> str:
        """A repo declaring apps/web/public/gen.json as build output, like the real one."""
        git = ["git", "-C", str(tmp)]
        subprocess.run([*git, "init", "-q"], check=True, capture_output=True)
        (tmp / "apps" / "web" / "public").mkdir(parents=True)
        # Both declarations the real repo carries: the synthetic path the focused tests
        # use, and the actual release manifest, so the end-to-end test runs the real string.
        (tmp / ".gitignore").write_text(
            "apps/web/public/gen.json\n"
            "apps/web/public/.well-known/citadel-release.json\n", encoding="utf-8")
        (tmp / "src.js").write_text("//", encoding="utf-8")
        subprocess.run([*git, "add", "-A"], check=True, capture_output=True)
        subprocess.run([*git, "-c", "user.email=t@t", "-c", "user.name=t",
                        "commit", "-qm", "init"], check=True, capture_output=True)
        return subprocess.run([*git, "rev-parse", "HEAD"], check=True,
                              capture_output=True, text=True).stdout.strip()

    def _stub_probe(self, result):
        """Replace the network call for the duration of one test."""
        original = R._probe_status
        R._probe_status = lambda url, timeout=15: (result[0], result[1], url)
        self.addCleanup(setattr, R, "_probe_status", original)

    def _claim(self, root, sha, **over):
        ctx = _ctx(root, git_available=True, **over)
        claim = {"kind": "repo_path", "ref": "apps/web/public/gen.json"}
        return R.check_claim(claim, ctx, commits=(sha,))

    def test_declared_build_output_is_external_not_rotted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            checked = self._claim(root, sha)
            self.assertEqual(checked["outcome"], R.EXTERNAL)
            self.assertIn("build output", checked["reason"])

    def test_an_undeclared_missing_path_still_rots(self):
        # THE CONTROL, the other direction. Loosening the rule must not disarm the alarm:
        # a path the repo does NOT declare as build output is still refuted when absent.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            ctx = _ctx(root, git_available=True)
            claim = {"kind": "repo_path", "ref": "apps/web/public/hand-written.json"}
            checked = R.check_claim(claim, ctx, commits=(sha,))
            self.assertEqual(checked["outcome"], R.ROTTED)

    def test_build_output_is_measured_where_it_is_published(self):
        self._stub_probe((200, ""))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            checked = self._claim(root, sha, probe=True, base_url="https://example.test")
            self.assertEqual(checked["outcome"], R.HELD)
            self.assertIn("/gen.json", checked["reason"])

    def test_build_output_that_is_not_served_really_has_rotted(self):
        # The probe is a real measurement, so it must be able to come back red.
        self._stub_probe((404, ""))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            checked = self._claim(root, sha, probe=True, base_url="https://example.test")
            self.assertEqual(checked["outcome"], R.ROTTED)

    def test_an_unreachable_host_is_unmeasurable_not_rotted(self):
        self._stub_probe((None, "URLError"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            sha = self._repo(root)
            checked = self._claim(root, sha, probe=True, base_url="https://example.test")
            self.assertEqual(checked["outcome"], R.UNMEASURABLE)

    def test_day_one_no_longer_rots_on_the_real_evidence(self):
        # The end-to-end shape of the bug, on the exact string the ledger carries, against
        # the real repository - REAL_D1 names a real sha and a real .gitignore declaration,
        # neither of which a synthetic fixture can stand in for. Skipped where the history
        # is not present to check, because a shallow clone cannot settle this either way.
        ctx = R.Context(root=R.ROOT)
        if not ctx.git_available or ctx.shallow:
            self.skipTest("needs a full clone of the real repository")
        if R._git(["cat-file", "-e", "d2d5f83^{commit}"], R.ROOT)[0] != 0:
            self.skipTest("the cited commit is not reachable in this checkout")
        state = _ledger([{"day": 1, "status": "verified", "evidence": REAL_D1}])
        report = R.replay(state, ctx)
        day1 = report["milestones"][0]
        self.assertNotEqual(day1["verdict"], R.ROTTED_V)
        manifest = [c for c in day1["checked"]
                    if c["ref"].endswith("citadel-release.json")][0]
        self.assertEqual(manifest["outcome"], R.EXTERNAL)


if __name__ == "__main__":
    unittest.main(verbosity=2)
