# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_gitlab_plane.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-ONLY-CI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     scripts/ci/gitlab_plane.py, scripts/ci/agent_context.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/gitlab_plane.py
# Intent:      Prove GitLab pulls only trusted heads, reports honestly and never loses or forges bookkeeping.
# ───────────────────────────────────────────────────────────────
"""GitLab-only CI plane: intake planning, status reporting, review export and writeback."""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from scripts.ci import agent_context, gitlab_plane as plane

ROOT = Path(__file__).resolve().parents[2]
REPO = "mrnobodytx/buildanddo"
MAIN = "1" * 40
OLD = "0" * 40
PR_A = "a" * 40
PR_B = "b" * 40
FORK = "f" * 40


def pull(number: int, sha: str, *, head_repo: str = REPO, association: str = "NONE") -> dict:
    return {"number": number, "head": {"sha": sha, "repo": {"full_name": head_repo}},
            "author_association": association}


class FakeHttp:
    """Records requests and answers from a table of (method, url-fragment) -> (status, body)."""

    def __init__(self, routes: dict[tuple[str, str], tuple[int, object]]) -> None:
        self.routes = routes
        self.calls: list[tuple[str, str, dict, object]] = []

    def __call__(self, method: str, url: str, headers: dict, body: object = None) -> tuple[int, object]:
        self.calls.append((method, url, headers, body))
        for (verb, fragment), answer in self.routes.items():
            if verb == method and fragment in url:
                return answer
        return 404, None

    def posts(self) -> list[tuple[str, object]]:
        return [(url, body) for method, url, _, body in self.calls if method == "POST"]


def quiet(function, *args, **kwargs):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        result = function(*args, **kwargs)
    return result, out.getvalue()


class EnvironmentTests(unittest.TestCase):
    def test_mirror_branch_reports_as_public_main_with_gitlab_provenance(self) -> None:
        env = plane.github_env({"CI_COMMIT_BRANCH": plane.MAIN_MIRROR, "CI_COMMIT_SHA": MAIN,
                                "CI_JOB_NAME": "evidence_epoch", "CI_PIPELINE_ID": "77"})
        self.assertEqual(env["GITHUB_REF_NAME"], "main")
        self.assertEqual(env["GITHUB_SHA"], MAIN)
        self.assertEqual(env["GITHUB_REPOSITORY"], REPO)
        self.assertEqual(env["GITHUB_WORKFLOW"], "gitlab:evidence_epoch")
        self.assertEqual(env["GITHUB_RUN_ID"], "77")
        self.assertNotIn("GITHUB_HEAD_REF", env)

    def test_review_branch_keeps_its_name_and_number(self) -> None:
        env = plane.github_env({"CI_COMMIT_BRANCH": "review/pr-42"})
        self.assertEqual(env["GITHUB_REF_NAME"], "review/pr-42")
        self.assertEqual(env["GITHUB_HEAD_REF"], "review/pr-42")
        self.assertEqual(plane.review_number("review/pr-42"), 42)
        for branch in ("review/pr-0", "review/pr-x", "review/pr-42/x", "main", ""):
            self.assertIsNone(plane.review_number(branch), branch)

    def test_repository_must_be_owner_and_name(self) -> None:
        with self.assertRaises(plane.PlaneError):
            plane.repository({"GITHUB_REPOSITORY": "not a repo"})


class IntakePlanTests(unittest.TestCase):
    def test_trusted_heads_are_mirrored_and_forks_are_held(self) -> None:
        pulls = [pull(1, PR_A), pull(2, FORK, head_repo="someone/fork"),
                 pull(3, PR_B, head_repo="member/fork", association="MEMBER")]
        plan = plane.plan_intake(MAIN, pulls, {plane.MAIN_MIRROR: OLD}, REPO)
        self.assertEqual(plan.pushes, {plane.MAIN_MIRROR: MAIN, "review/pr-1": PR_A, "review/pr-3": PR_B})
        self.assertEqual(plan.held, {2: FORK})
        self.assertEqual(plan.reviews, {1: PR_A, 3: PR_B})
        self.assertNotIn("review/pr-2", plan.pushes)

    def test_unchanged_heads_are_not_pushed_and_closed_reviews_are_pruned(self) -> None:
        remote = {plane.MAIN_MIRROR: MAIN, "review/pr-1": PR_A, "review/pr-9": PR_B, "feature": PR_B}
        plan = plane.plan_intake(MAIN, [pull(1, PR_A)], remote, REPO)
        self.assertEqual(plan.pushes, {})
        self.assertEqual(plan.deletes, ["review/pr-9"])

    def test_control_a_fork_head_is_never_pushed_even_when_gitlab_has_a_stale_branch(self) -> None:
        plan = plane.plan_intake(MAIN, [pull(5, FORK, head_repo="x/y")], {"review/pr-5": OLD}, REPO)
        self.assertNotIn("review/pr-5", plan.pushes)
        self.assertEqual(plan.deletes, ["review/pr-5"])

    def test_malformed_input_is_ignored_or_refused(self) -> None:
        with self.assertRaises(plane.PlaneError):
            plane.plan_intake("main", [], {}, REPO)
        plan = plane.plan_intake(MAIN, [{"number": "1", "head": {"sha": PR_A}}, pull(2, "short")], {}, REPO)
        self.assertEqual(plan.reviews, {})

    def test_ls_remote_listing_is_parsed_to_branch_heads(self) -> None:
        listing = f"{MAIN}\trefs/heads/{plane.MAIN_MIRROR}\n{PR_A}\trefs/heads/review/pr-1\n{PR_B}\trefs/tags/v1\njunk\n"
        self.assertEqual(plane.remote_heads(listing), {plane.MAIN_MIRROR: MAIN, "review/pr-1": PR_A})

    def test_intake_holds_without_the_gitlab_token(self) -> None:
        args = argparse.Namespace(dry_run=False, output="unused")
        code, out = quiet(plane.cmd_intake, args, {}, FakeHttp({}))
        self.assertEqual(code, 1)
        self.assertIn("HOLD: GITLAB_INGEST_TOKEN", out)


class StatusTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.intake = Path(directory.name) / "intake.json"
        self.intake.write_text(json.dumps({"main": MAIN, "reviews": {"1": PR_A}, "held": {"2": FORK}}))
        self.env = {"GITHUB_STATUS_TOKEN": "t", "GITLAB_INGEST_TOKEN": "g",
                    "CI_API_V4_URL": "https://lab.example/api/v4", "CI_PROJECT_ID": "104"}
        self.enterContext(mock.patch.object(plane, "git", return_value=subprocess.CompletedProcess([], 0, "merge\n", "")))

    def test_describe_maps_gitlab_states_honestly(self) -> None:
        self.assertEqual(plane.describe({"id": 9, "status": "success", "web_url": "u"}, False)[:1], ("success",))
        self.assertEqual(plane.describe({"id": 9, "status": "failed"}, False)[0], "failure")
        self.assertEqual(plane.describe({"id": 9, "status": "running"}, False)[0], "pending")
        self.assertEqual(plane.describe(None, False)[0], "pending")
        self.assertEqual(plane.describe(None, True)[0], "error")

    def test_without_a_token_nothing_is_posted(self) -> None:
        http = FakeHttp({})
        code, out = quiet(plane.cmd_status, argparse.Namespace(intake=str(self.intake)), {}, http)
        self.assertEqual(code, 0)
        self.assertIn("SKIP:", out)
        self.assertEqual(http.calls, [])

    def test_results_are_posted_once_and_forks_are_marked_pending(self) -> None:
        http = FakeHttp({
            ("GET", f"sha={MAIN}"): (200, [{"id": 1, "status": "success", "web_url": "https://lab/1"}]),
            ("GET", f"sha={PR_A}"): (200, [{"id": 2, "status": "failed", "web_url": "https://lab/2"}]),
            ("GET", "/status"): (200, {"statuses": []}),
            ("POST", "/statuses/"): (201, {}),
        })
        code, _ = quiet(plane.cmd_status, argparse.Namespace(intake=str(self.intake)), self.env, http)
        self.assertEqual(code, 0)
        posted = {url.rsplit("/", 1)[1]: body for url, body in http.posts()}
        self.assertEqual(posted[MAIN]["state"], "success")
        self.assertEqual(posted[MAIN]["target_url"], "https://lab/1")
        self.assertEqual(posted[PR_A]["state"], "failure")
        self.assertEqual(posted[FORK]["state"], "pending")
        self.assertTrue(all(body["context"] == plane.STATUS_CONTEXT for body in posted.values()))

    def test_an_unchanged_status_is_not_posted_again(self) -> None:
        hub = plane.GitHub(REPO, "t", FakeHttp({
            ("GET", "/status"): (200, {"statuses": [{"context": plane.STATUS_CONTEXT, "state": "success",
                                                     "target_url": "u", "description": "d"}]}),
        }))
        self.assertEqual(plane.post_if_changed(hub, MAIN, "success", "d", "u"), 0)
        hub.request = FakeHttp({("GET", "/status"): (200, {"statuses": []}), ("POST", "/statuses/"): (422, {})})
        with self.assertRaises(plane.PlaneError):
            plane.post_if_changed(hub, MAIN, "success", "d", "u")


class ReviewEventTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.out = Path(directory.name) / "event.json"
        self.args = argparse.Namespace(output=str(self.out))
        self.enterContext(mock.patch.object(plane, "git", return_value=subprocess.CompletedProcess([], 0, PR_A + "\n", "")))

    def test_other_refs_are_a_no_op(self) -> None:
        code, out = quiet(plane.cmd_review_event, self.args, {"CI_COMMIT_BRANCH": plane.MAIN_MIRROR}, FakeHttp({}))
        self.assertEqual(code, 0)
        self.assertIn("SKIP:", out)
        self.assertFalse(self.out.exists())

    def test_export_is_bound_to_the_checked_out_head(self) -> None:
        record = {"number": 7, "head": {"sha": PR_A}, "labels": [{"name": "actor:agent"}]}
        http = FakeHttp({("GET", "/pulls/7"): (200, record)})
        code, _ = quiet(plane.cmd_review_event, self.args, {"CI_COMMIT_BRANCH": "review/pr-7"}, http)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(self.out.read_text()), {"pull_request": record})

    def test_a_moved_pull_request_fails_the_superseded_pipeline(self) -> None:
        http = FakeHttp({("GET", "/pulls/7"): (200, {"number": 7, "head": {"sha": PR_B}})})
        code, out = quiet(plane.cmd_review_event, self.args, {"CI_COMMIT_BRANCH": "review/pr-7"}, http)
        self.assertEqual(code, 1)
        self.assertIn("superseded", out)
        self.assertFalse(self.out.exists())


class WritebackTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.tree = Path(directory.name) / "tree"
        (self.tree / "scripts/ci").mkdir(parents=True)
        (self.tree / ".bits").mkdir()
        (self.tree / "CHANGELOG.md").write_text("old\n")
        (self.tree / "scripts/ci/epoch_chain.json").write_text('{"length": 1}\n')
        (self.tree / ".bits/growth.lock.json").write_text("{}\n")
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@x", "GIT_COMMITTER_NAME": "t",
               "GIT_COMMITTER_EMAIL": "t@x"}
        for argv in (["init", "-q"], ["add", "-A"], ["commit", "-q", "-m", "base"]):
            subprocess.run(["git", *argv], cwd=self.tree, env=env, check=True)
        self.chain = Path(directory.name) / "chain-head.json"
        self.chain.write_text('{"length": 2}\n')
        self.order: list[str] = []

    def fake_run(self, argv: list[str], cwd: Path, check: bool) -> subprocess.CompletedProcess:
        script = Path(argv[1]).name
        self.order.append(script)
        if script == "changelog_gen.py":
            (cwd / "CHANGELOG.md").write_text("new\n")
        else:
            # The growth point must see the chain head already written.
            (cwd / ".bits/growth.lock.json").write_text((cwd / "scripts/ci/epoch_chain.json").read_text())
        return subprocess.CompletedProcess(argv, 0)

    def log(self) -> list[str]:
        out = subprocess.run(["git", "log", "--format=%an|%s", "-4"], cwd=self.tree, text=True,
                             capture_output=True, check=True).stdout
        return out.splitlines()

    def test_three_commits_in_order_with_skip_ci_and_bot_identity(self) -> None:
        committed, _ = quiet(plane.regenerate, self.tree, self.chain, '{"length": 1}\n',
                             {"epoch_id": "ep-1", "root_digest": "r"}, MAIN, self.fake_run)
        self.assertEqual(self.order, ["changelog_gen.py", "system_growth.py"])
        self.assertEqual(len(committed), 3)
        log = self.log()
        self.assertTrue(log[0].startswith(plane.BOT_NAME + "|chore(growth)"))
        self.assertIn("record ep-1 in the evidence chain", log[1])
        self.assertTrue(log[2].endswith("docs(changelog): refresh from main history [skip ci]"))
        self.assertTrue(all("[skip ci]" in line for line in log[:3]))
        self.assertEqual((self.tree / ".bits/growth.lock.json").read_text(), '{"length": 2}\n')

    def test_a_chain_that_moved_during_the_run_is_left_alone(self) -> None:
        committed, out = quiet(plane.regenerate, self.tree, self.chain, '{"length": 0}\n', {}, MAIN, self.fake_run)
        self.assertEqual((self.tree / "scripts/ci/epoch_chain.json").read_text(), '{"length": 1}\n')
        self.assertIn("published chain moved", out)
        self.assertEqual(len(committed), 2)

    def test_nothing_to_commit_makes_no_commit(self) -> None:
        committed, _ = quiet(plane.regenerate, self.tree, None, "", {}, MAIN,
                             lambda argv, cwd, check: subprocess.CompletedProcess(argv, 0))
        self.assertEqual(committed, [])
        self.assertEqual(len(self.log()), 1)

    def test_writeback_skips_without_its_token(self) -> None:
        args = argparse.Namespace(dry_run=False, chain="", chain_base="", outputs="x", rechecked="x", worktree="x")
        code, out = quiet(plane.cmd_writeback, args, {}, FakeHttp({}))
        self.assertEqual(code, 0)
        self.assertIn("SKIP: GITHUB_WRITEBACK_TOKEN", out)

    def test_bookkeeping_messages_keep_their_srs_trailers(self) -> None:
        items = {item.path: item for item in plane.bookkeeping(MAIN)}
        self.assertIn("SRS: SRS-BUILDANDDO-CHANGELOG-001\nChangelog: skip", items["CHANGELOG.md"].trailers)
        self.assertIn("SRS: SRS-BUILDANDDO-GROWTH-001\nChangelog: skip", items[".bits/growth.lock.json"].trailers)
        self.assertIn("SRS: SRS-BUILDANDDO-EPOCH-001", items["scripts/ci/epoch_chain.json"].trailers)


class AskpassTests(unittest.TestCase):
    """The plane's token must win over the runner's job-token credential helper."""

    def fill(self, env: dict[str, str], cwd: Path) -> dict[str, str]:
        out = subprocess.run(["git", "credential", "fill"], cwd=cwd, env=env, text=True, capture_output=True,
                             input="protocol=https\nhost=gitlab.example.test\n\n", check=True).stdout
        return dict(line.split("=", 1) for line in out.splitlines() if "=" in line)

    def test_runner_credential_helper_is_bypassed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            helper = "!f() { echo username=gitlab-ci-token; echo password=job-token; }; f"
            subprocess.run(["git", "config", "credential.helper", helper], cwd=repo, check=True)
            # Control: without the plane's environment the runner helper answers.
            self.assertEqual(self.fill({**os.environ, "GIT_TERMINAL_PROMPT": "0"}, repo)["password"], "job-token")
            with plane.Askpass("oauth2", "plane-token") as auth:
                creds = self.fill(auth.env, repo)
            self.assertEqual((creds["username"], creds["password"]), ("oauth2", "plane-token"))


class WiringTests(unittest.TestCase):
    def test_pipeline_kind_follows_the_branch(self) -> None:
        self.assertEqual(plane.pipeline_kind({"CI_COMMIT_BRANCH": plane.MAIN_MIRROR}), "main")
        self.assertEqual(plane.pipeline_kind({"CI_COMMIT_BRANCH": "review/pr-3"}), "pr")
        self.assertEqual(plane.pipeline_kind({"CI_COMMIT_BRANCH": "sprint/x"}), "local")

    def test_wrapped_scripts_exist_and_count_as_gitlab_wiring(self) -> None:
        wrapped = {script for scripts in plane.WRAPPED.values() for script in scripts}
        for script in wrapped:
            self.assertTrue((ROOT / script).is_file(), script)
        gitlab = {s for p in agent_context.collect_pipelines(ROOT) if p["provider"] == "gitlab"
                  for s in p["required_scripts"]}
        self.assertIn("scripts/ci/gitlab_plane.py", gitlab)
        self.assertTrue({"scripts/ci/changelog_gen.py", "scripts/ci/datadog_publish.py"} <= gitlab)

    def test_epoch_publish_without_an_epoch_is_a_clean_skip(self) -> None:
        code, out = quiet(plane.cmd_epoch_publish, argparse.Namespace(outputs="/nonexistent"), {}, FakeHttp({}))
        self.assertEqual(code, 0)
        self.assertIn("SKIP:", out)

    def test_outputs_file_is_read_as_key_value_lines(self) -> None:
        with tempfile.NamedTemporaryFile("w", delete=False) as handle:
            handle.write("epoch_id=ep-1\nroot_digest=abc=def\njunk\n")
        self.addCleanup(os.unlink, handle.name)
        self.assertEqual(plane.read_outputs(Path(handle.name)), {"epoch_id": "ep-1", "root_digest": "abc=def"})


if __name__ == "__main__":
    unittest.main()
