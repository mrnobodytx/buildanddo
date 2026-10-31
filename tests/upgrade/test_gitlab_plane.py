# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_gitlab_plane.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-ONLY-CI-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     scripts/ci/gitlab_plane.py, scripts/ci/agent_context.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/gitlab_plane.py
# Intent:      Prove GitLab pulls only trusted heads, reports honestly and never loses or forges bookkeeping,
#              and that automerge leaves the keyed CI surface to a person while the keyed lane is on.
# ───────────────────────────────────────────────────────────────
"""GitLab-only CI plane: intake planning, status reporting, review export and writeback."""

from __future__ import annotations

import argparse
from collections.abc import Mapping
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import MappingProxyType
import unittest
from unittest import mock
import urllib.parse

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


class IntakePushTests(unittest.TestCase):
    def test_each_review_branch_is_its_own_push_so_gitlab_runs_a_pipeline_for_it(self) -> None:
        calls: list[tuple[str, ...]] = []

        def fake_git(*args: str, **_: object) -> subprocess.CompletedProcess:
            calls.append(args)
            out = ""
            if args[0] == "rev-parse":
                out = MAIN + "\n"
            elif args[0] == "ls-remote":
                out = f"{MAIN}\trefs/heads/{plane.MAIN_MIRROR}\n{OLD}\trefs/heads/review/pr-9\n"
            return subprocess.CompletedProcess(args, 0, out, "")

        http = FakeHttp({("GET", "/pulls?"): (200, [pull(1, PR_A), pull(2, PR_B)]),
                         ("GET", f"/repository/commits/{MAIN}"): (200, {})})
        env = {"GITLAB_INGEST_TOKEN": "g", "GITLAB_INGEST_REPO_URL": "https://lab.example.test/root/b.git",
               "CI_API_V4_URL": "https://lab.example.test/api/v4", "CI_PROJECT_ID": "104"}
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(plane, "git", side_effect=fake_git), \
                mock.patch.object(plane, "clean_pusher", return_value=Path(tmp)):
            code, out = quiet(plane.cmd_intake, argparse.Namespace(dry_run=False, output=f"{tmp}/i.json"), env, http)
        self.assertEqual(code, 0, out)
        pushes = [c for c in calls if c[0] == "push"]
        self.assertEqual([c[-1] for c in pushes],
                         [f"+{PR_A}:refs/heads/review/pr-1", f"+{PR_B}:refs/heads/review/pr-2", ":refs/heads/review/pr-9"])
        self.assertTrue(all(c[2].startswith("https://oauth2@") for c in pushes))


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
        lookups = [url for method, url, _, _ in http.calls if method == "GET" and "/pipelines?" in url]
        self.assertTrue(lookups and all("source=push" in url for url in lookups))
        self.assertEqual(posted[MAIN]["state"], "success")
        self.assertEqual(posted[MAIN]["target_url"], "https://lab/1")
        self.assertEqual(posted[PR_A]["state"], "failure")
        self.assertEqual(posted[FORK]["state"], "pending")
        self.assertTrue(all(body["context"] == plane.STATUS_CONTEXT for body in posted.values()))

    def test_a_branch_from_before_gitlab_only_ci_is_told_to_merge_main(self) -> None:
        def fake_git(*args: str, **_: object) -> subprocess.CompletedProcess:
            missing = args[0] == "cat-file" and args[2].startswith(PR_A)
            return subprocess.CompletedProcess(args, 1 if missing else 0, "merge\n", "")

        http = FakeHttp({
            ("GET", f"sha={MAIN}"): (200, [{"id": 1, "status": "success", "web_url": "u"}]),
            ("GET", f"sha={PR_A}"): (200, []),
            ("GET", "/status"): (200, {"statuses": []}),
            ("POST", "/statuses/"): (201, {}),
        })
        with mock.patch.object(plane, "git", side_effect=fake_git):
            quiet(plane.cmd_status, argparse.Namespace(intake=str(self.intake)), self.env, http)
        posted = {url.rsplit("/", 1)[1]: body for url, body in http.posts()}
        self.assertEqual(posted[PR_A]["state"], "error")
        self.assertIn("merge main", posted[PR_A]["description"])

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


class InsteadOfTests(unittest.TestCase):
    """The runner rewrites its own host to a job-token URL; the plane's URLs must escape that."""

    def resolved(self, repo: Path, url: str) -> str:
        return subprocess.run(["git", "ls-remote", "--get-url", url], cwd=repo, text=True,
                              capture_output=True, check=True).stdout.strip()

    def test_userinfo_keeps_the_runner_rewrite_from_matching(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "url.https://gitlab-ci-token:job@lab.example.test/.insteadOf",
                            "https://lab.example.test/"], cwd=repo, check=True)
            bare = "https://lab.example.test/root/buildanddo.git"
            # Control: the runner's rewrite captures the bare URL and its job token wins.
            self.assertIn("gitlab-ci-token:job@", self.resolved(repo, bare))
            mine = plane.with_user(bare, "oauth2")
            self.assertEqual(mine, "https://oauth2@lab.example.test/root/buildanddo.git")
            self.assertEqual(self.resolved(repo, mine), mine)

    def test_with_user_leaves_existing_userinfo_and_other_schemes(self) -> None:
        self.assertEqual(plane.with_user("https://a@h/x.git", "b"), "https://a@h/x.git")
        self.assertEqual(plane.with_user("ssh://git@h/x.git", "b"), "ssh://git@h/x.git")
        self.assertEqual(plane.with_user("https://h/x.git", "x-access-token"), "https://x-access-token@h/x.git")


class CleanPusherTests(unittest.TestCase):
    def test_pusher_sends_checkout_objects_without_checkout_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            work, remote = base / "work", base / "remote.git"
            env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@x",
                   "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@x"}
            subprocess.run(["git", "init", "-q", str(work)], check=True)
            subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
            (work / "f").write_text("x")
            for argv in (["add", "f"], ["commit", "-q", "-m", "c"]):
                subprocess.run(["git", *argv], cwd=work, env=env, check=True)
            # What the runner leaves behind: a rewrite that would capture the target.
            subprocess.run(["git", "config", f"url.file:///nonexistent/.insteadOf", f"file://{remote}"],
                           cwd=work, check=True)
            sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=work, text=True,
                                 capture_output=True, check=True).stdout.strip()
            pusher = plane.clean_pusher(work)
            self.assertNotIn("insteadOf", (pusher / "config").read_text())
            plane.git("push", "--quiet", f"file://{remote}", f"{sha}:refs/heads/buildanddo-source", cwd=pusher)
            got = subprocess.run(["git", "rev-parse", "refs/heads/buildanddo-source"], cwd=remote, text=True,
                                 capture_output=True, check=True).stdout.strip()
            self.assertEqual(got, sha)
            # Control: the same push from the checkout is captured by its rewrite and fails.
            with self.assertRaises(plane.PlaneError):
                plane.git("push", "--quiet", f"file://{remote}", f"{sha}:refs/heads/control", cwd=work)


def agent_pull(number: int, sha: str, **changes: object) -> dict:
    pull = {"number": number, "title": f"fix(x): change {number} [SRS-BUILDANDDO-X-001]", "draft": False,
            "base": {"ref": "main"}, "mergeable": True,
            "head": {"sha": sha, "ref": f"bits/SRS-BUILDANDDO-X-001-change-{number}", "repo": {"full_name": REPO}},
            "labels": [{"name": "actor:agent"}]}
    pull.update(changes)
    return pull


class AutomergeTests(unittest.TestCase):
    ALLOWED = frozenset({"actor:agent"})

    def test_only_a_fully_qualified_green_agent_pr_merges(self) -> None:
        self.assertEqual(plane.merge_verdict(agent_pull(1, PR_A), REPO, "success", self.ALLOWED), "merge")
        refusals = {
            "draft": agent_pull(1, PR_A, draft=True),
            "base": agent_pull(1, PR_A, base={"ref": "release"}),
            "fork": agent_pull(1, PR_A, head={"sha": PR_A, "ref": "bits/SRS-BUILDANDDO-X-001-a",
                                             "repo": {"full_name": "someone/fork"}}),
            "branch": agent_pull(1, PR_A, head={"sha": PR_A, "ref": "feature/x", "repo": {"full_name": REPO}}),
            "no actor": agent_pull(1, PR_A, labels=[]),
            "two actors": agent_pull(1, PR_A, labels=[{"name": "actor:agent"}, {"name": "actor:human"}]),
            "human": agent_pull(1, PR_A, labels=[{"name": "actor:human"}]),
            "hold": agent_pull(1, PR_A, labels=[{"name": "actor:agent"}, {"name": "hold"}]),
            "unknown mergeable": agent_pull(1, PR_A, mergeable=None),
        }
        for case, pull in refusals.items():
            with self.subTest(case=case):
                self.assertNotEqual(plane.merge_verdict(pull, REPO, "success", self.ALLOWED), "merge")
        for state in ("pending", "failure", "error", None):
            with self.subTest(state=state):
                self.assertNotEqual(plane.merge_verdict(agent_pull(1, PR_A), REPO, state, self.ALLOWED), "merge")

    def routes(self, pulls: dict[int, dict], states: dict[str, str]) -> FakeHttp:
        routes: dict[tuple[str, str], tuple[int, object]] = {
            ("GET", "/pulls?state=open"): (200, [{"number": n} for n in pulls]),
            ("PUT", "/merge"): (200, {"merged": True, "sha": "c" * 40}),
        }
        for number, pull in pulls.items():
            sha = pull["head"]["sha"]
            routes[("GET", f"/pulls/{number}")] = (200, pull)
            routes[("GET", f"/commits/{sha}/status")] = (
                200, {"statuses": [{"context": plane.STATUS_CONTEXT, "state": states[sha]}]})
        return FakeHttp(routes)

    def test_merges_green_heads_pinned_to_the_reviewed_sha_and_skips_the_rest(self) -> None:
        http = self.routes({1: agent_pull(1, PR_A), 2: agent_pull(2, PR_B)}, {PR_A: "success", PR_B: "pending"})
        env = {"AUTOMERGE": "1", "GITHUB_WRITEBACK_TOKEN": "w"}
        code, out = quiet(plane.cmd_automerge, argparse.Namespace(dry_run=False), env, http)
        self.assertEqual(code, 0)
        merges = [(url, body) for method, url, _, body in http.calls if method == "PUT"]
        self.assertEqual(len(merges), 1)
        self.assertTrue(merges[0][0].endswith("/pulls/1/merge"))
        self.assertEqual(merges[0][1]["sha"], PR_A)
        self.assertTrue(merges[0][1]["commit_title"].startswith("Merge pull request #1: "))
        self.assertIn("WAIT: PR #2: GitLab result is pending", out)

    def test_switched_off_or_tokenless_merges_nothing(self) -> None:
        http = self.routes({1: agent_pull(1, PR_A)}, {PR_A: "success"})
        for env in ({}, {"AUTOMERGE": "0", "GITHUB_WRITEBACK_TOKEN": "w"}, {"AUTOMERGE": "1"}):
            with self.subTest(env=env):
                code, out = quiet(plane.cmd_automerge, argparse.Namespace(dry_run=False), env, http)
                self.assertEqual(code, 0)
                self.assertIn("SKIP:", out)
        self.assertFalse([c for c in http.calls if c[0] == "PUT"])

    def test_epoch_bookkeeping_stays_out_of_the_changelog(self) -> None:
        items = {item.path: item for item in plane.bookkeeping(MAIN)}
        self.assertTrue(all("Changelog: skip" in item.trailers for item in items.values()))


def changed(path: str, previous: str | None = None) -> dict:
    entry = {"filename": path, "status": "renamed" if previous else "modified"}
    if previous:
        entry["previous_filename"] = previous
    return entry


class FilesHttp(FakeHttp):
    """FakeHttp that also serves /pulls/{n}/files pages: a list of entries, or a callable(page)."""

    def __init__(self, routes: dict[tuple[str, str], tuple[int, object]], files: dict[int, object]) -> None:
        super().__init__(routes)
        self.files = files

    def __call__(self, method: str, url: str, headers: dict, body: object = None) -> tuple[int, object]:
        parts = urllib.parse.urlsplit(url)
        prefix = f"/repos/{REPO}/pulls/"
        if method == "GET" and parts.path.startswith(prefix) and parts.path.endswith("/files"):
            self.calls.append((method, url, headers, body))
            query = urllib.parse.parse_qs(parts.query, strict_parsing=True)
            number, page = int(parts.path[len(prefix):-len("/files")]), int(query["page"][0])
            if query["per_page"] != ["100"] or set(query) != {"per_page", "page"}:
                return 400, None
            answer = self.files[number]
            if callable(answer):
                return answer(page)
            return 200, answer[(page - 1) * 100:page * 100]
        return super().__call__(method, url, headers, body)

    def file_pages(self, number: int) -> list[int]:
        return [int(urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["page"][0])
                for method, url, _, _ in self.calls if method == "GET" and f"/pulls/{number}/files?" in url]

    def merged(self) -> list[int]:
        return [int(url.rsplit("/", 2)[-2]) for method, url, _, _ in self.calls if method == "PUT"]


class KeyedSurfaceGuardTests(unittest.TestCase):
    """SRS-BUILDANDDO-CURRICULUM-PRIVATE-001 A11: the automerge guard for the keyed CI surface."""

    ALLOWED = frozenset({"actor:agent"})
    ON = MappingProxyType({"AUTOMERGE": "1", "GITHUB_WRITEBACK_TOKEN": "w", "BUILDANDDO_LESSON_KEYS_ENABLED": "1"})

    def http(self, pulls: dict[int, dict], files: dict[int, object], states: dict[str, str] | None = None) -> FilesHttp:
        routes: dict[tuple[str, str], tuple[int, object]] = {
            ("GET", "/pulls?state=open"): (200, [{"number": n} for n in pulls]),
            ("PUT", "/merge"): (200, {"merged": True, "sha": "c" * 40}),
        }
        for number, pull in pulls.items():
            sha = pull["head"]["sha"]
            routes[("GET", f"/pulls/{number}")] = (200, pull)
            routes[("GET", f"/commits/{sha}/status")] = (
                200, {"statuses": [{"context": plane.STATUS_CONTEXT, "state": (states or {}).get(sha, "success")}]})
        return FilesHttp(routes, files)

    def run_automerge(self, env: Mapping[str, str], http: FilesHttp) -> str:
        code, out = quiet(plane.cmd_automerge, argparse.Namespace(dry_run=False), dict(env), http)
        self.assertEqual(code, 0, out)
        return out

    def test_the_keyed_surface_is_exactly_the_planned_set(self) -> None:
        self.assertEqual(plane.KEYED_SURFACE, (".gitlab-ci.yml", ".gitlab/", "scripts/ci/lesson_keys.py",
                                               "apps/web/tools/check-public-lessons.mjs", "scripts/ci/gitlab_plane.py"))
        self.assertEqual(plane.KEYED_LANE_SWITCH, "BUILDANDDO_LESSON_KEYS_ENABLED")
        self.assertEqual((plane.FILES_PER_PAGE, plane.FILES_MAX_PAGES), (100, 30))
        for path in (".gitlab-ci.yml", ".gitlab/ci/github-plane.yml", ".gitlab/ci/new/job.yml", ".gitlab/x",
                     "scripts/ci/lesson_keys.py", "apps/web/tools/check-public-lessons.mjs", "scripts/ci/gitlab_plane.py"):
            with self.subTest(path=path):
                self.assertTrue(plane.keyed_path(path))
        for path in (".gitlab-ci.yml.bak", ".gitlab", ".gitlabx/ci.yml", "docs/.gitlab/ci.yml", "x/.gitlab-ci.yml",
                     "scripts/ci/lesson_keys.pyc", "scripts/ci/lesson_keys_test.py", "tests/upgrade/test_gitlab_plane.py",
                     "apps/web/tools/build.mjs", "apps/web/tools/check-public-lessons.mjs.map", "README.md", ""):
            with self.subTest(path=path):
                self.assertFalse(plane.keyed_path(path))

    def test_verdict_names_the_keyed_surface_and_refuses_an_unlisted_pull(self) -> None:
        green = agent_pull(1, PR_A)
        self.assertEqual(plane.merge_verdict(green, REPO, "success", self.ALLOWED), "merge")
        self.assertEqual(plane.merge_verdict(green, REPO, "success", self.ALLOWED, ()), "merge")
        self.assertEqual(plane.merge_verdict(green, REPO, "success", self.ALLOWED, ("README.md", "apps/web/x.js")),
                         "merge")
        for keyed in (".gitlab-ci.yml", ".gitlab/ci/day21-submission.yml", "scripts/ci/gitlab_plane.py"):
            with self.subTest(path=keyed):
                self.assertEqual(plane.merge_verdict(green, REPO, "success", self.ALLOWED, ("README.md", keyed)),
                                 "touches the keyed CI surface; a person merges it")
        self.assertEqual(plane.merge_verdict(green, REPO, "success", self.ALLOWED, None), "cannot list changed files")
        # The guard adds refusals only: an unqualified PR keeps its own reason.
        self.assertEqual(plane.merge_verdict(agent_pull(1, PR_A, draft=True), REPO, "success", self.ALLOWED,
                                             (".gitlab-ci.yml",)), "draft")

    def test_without_the_switch_nothing_is_listed_and_verdicts_are_unchanged(self) -> None:
        for value in (None, "", "0", "true", "yes", " 1", "1 "):
            with self.subTest(value=value):
                env = {k: v for k, v in self.ON.items() if k != "BUILDANDDO_LESSON_KEYS_ENABLED"}
                if value is not None:
                    env["BUILDANDDO_LESSON_KEYS_ENABLED"] = value
                http = self.http({1: agent_pull(1, PR_A, changed_files=1)}, {1: [changed(".gitlab-ci.yml")]})
                out = self.run_automerge(env, http)
                self.assertEqual(http.merged(), [1])
                self.assertEqual(http.file_pages(1), [])
                self.assertNotIn("keyed", out)

    def test_with_the_switch_a_keyed_pull_waits_and_the_rest_merge(self) -> None:
        pulls = {1: agent_pull(1, PR_A, changed_files=2), 2: agent_pull(2, PR_B, changed_files=1)}
        http = self.http(pulls, {1: [changed("README.md"), changed("scripts/ci/lesson_keys.py")],
                                 2: [changed("apps/web/src/x.js")]})
        out = self.run_automerge(self.ON, http)
        self.assertEqual(http.merged(), [2])
        self.assertIn("WAIT: PR #1: touches the keyed CI surface; a person merges it", out)
        self.assertIn("BUILDANDDO_LESSON_KEYS_ENABLED=1", out)
        self.assertEqual((http.file_pages(1), http.file_pages(2)), ([1], [1]))

    def test_moving_a_keyed_file_away_is_a_keyed_change(self) -> None:
        pulls = {1: agent_pull(1, PR_A, changed_files=1)}
        http = self.http(pulls, {1: [changed("scripts/lesson_keys.py", previous="scripts/ci/lesson_keys.py")]})
        out = self.run_automerge(self.ON, http)
        self.assertEqual(http.merged(), [])
        self.assertIn("WAIT: PR #1: touches the keyed CI surface; a person merges it", out)

    def test_only_a_pull_that_would_otherwise_merge_is_listed(self) -> None:
        pulls = {1: agent_pull(1, PR_A, changed_files=1), 2: agent_pull(2, PR_B, changed_files=1, draft=True)}
        http = self.http(pulls, {1: [changed("README.md")], 2: [changed("README.md")]}, {PR_A: "pending"})
        out = self.run_automerge(self.ON, http)
        self.assertEqual(http.merged(), [])
        self.assertEqual((http.file_pages(1), http.file_pages(2)), ([], []))
        self.assertIn("WAIT: PR #1: GitLab result is pending", out)
        self.assertIn("WAIT: PR #2: draft", out)

    def test_every_page_is_read_up_to_the_github_limit(self) -> None:
        many = [changed(f"docs/page-{index}.md") for index in range(250)]
        http = self.http({1: agent_pull(1, PR_A, changed_files=250)}, {1: many})
        self.run_automerge(self.ON, http)
        self.assertEqual((http.merged(), http.file_pages(1)), ([1], [1, 2, 3]))

        keyed_last = many[:249] + [changed(".gitlab/ci/github-plane.yml")]
        http = self.http({1: agent_pull(1, PR_A, changed_files=250)}, {1: keyed_last})
        out = self.run_automerge(self.ON, http)
        self.assertEqual(http.merged(), [])
        self.assertIn("touches the keyed CI surface", out)

        exactly = [changed(f"docs/page-{index}.md") for index in range(3000)]
        http = self.http({1: agent_pull(1, PR_A, changed_files=3000)}, {1: exactly})
        self.run_automerge(self.ON, http)
        self.assertEqual((http.merged(), http.file_pages(1)), ([1], list(range(1, 31))))

        # GitHub stops at 3000 files; past that the list cannot be complete.
        http = self.http({1: agent_pull(1, PR_A, changed_files=3001)}, {1: exactly + [changed("docs/x.md")]})
        out = self.run_automerge(self.ON, http)
        self.assertEqual((http.merged(), http.file_pages(1)), ([], list(range(1, 31))))
        self.assertIn("WAIT: PR #1: cannot list changed files", out)

    def test_an_incomplete_or_failed_listing_refuses_the_merge(self) -> None:
        ok = [changed("README.md")]
        cases: dict[str, tuple[dict, object]] = {
            "server error": ({"changed_files": 1}, lambda page: (502, None)),
            "rate limited": ({"changed_files": 1}, lambda page: (403, {"message": "rate limit"})),
            "unreachable": ({"changed_files": 1}, lambda page: (0, {"error": "timeout"})),
            "second page fails": ({"changed_files": 101},
                                  lambda page: (200, [changed(f"d/{i}") for i in range(100)]) if page == 1 else (500, None)),
            "not a list": ({"changed_files": 1}, lambda page: (200, {"files": ok})),
            "not a list for an empty pull": ({"changed_files": 0}, lambda page: (200, {"files": []})),
            "entry not an object": ({"changed_files": 1}, lambda page: (200, ["README.md"])),
            "no filename": ({"changed_files": 1}, lambda page: (200, [{"status": "modified"}])),
            "empty filename": ({"changed_files": 1}, lambda page: (200, [{"filename": ""}])),
            "filename not text": ({"changed_files": 1}, lambda page: (200, [{"filename": 7}])),
            "bad previous name": ({"changed_files": 1},
                                  lambda page: (200, [{"filename": "README.md", "previous_filename": ["x"]}])),
            "fewer than reported": ({"changed_files": 2}, ok),
            "more than reported": ({"changed_files": 0}, ok),
            "count missing": ({}, ok),
            "count not a number": ({"changed_files": "1"}, ok),
            "count is a bool": ({"changed_files": True}, ok),
            "count negative": ({"changed_files": -1}, []),
        }
        for case, (changes, files) in cases.items():
            with self.subTest(case=case):
                http = self.http({1: agent_pull(1, PR_A, **changes)}, {1: files})
                out = self.run_automerge(self.ON, http)
                self.assertEqual(http.merged(), [])
                self.assertIn("WAIT: PR #1: cannot list changed files", out)

    def test_a_null_previous_name_is_no_rename(self) -> None:
        hub = plane.GitHub(REPO, "t", self.http({}, {1: [{"filename": "README.md", "previous_filename": None}]}))
        self.assertEqual(plane.changed_files(hub, agent_pull(1, PR_A, changed_files=1)), ("README.md",))
        hub.request = self.http({}, {1: [changed("b.md", previous="a.md")]})
        self.assertEqual(plane.changed_files(hub, agent_pull(1, PR_A, changed_files=1)), ("b.md", "a.md"))


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
