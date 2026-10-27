#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/gitlab_plane.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-ONLY-CI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     scripts/ci/evidence_epoch.py, scripts/ci/changelog_gen.py, scripts/ci/system_growth.py,
#              scripts/ci/telemetry_snapshot.py, scripts/ci/telemetry_delta.py,
#              scripts/ci/datadog_publish.py, scripts/ci/supply_chain.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/evidence_epoch.py; CONSUMES scripts/ci/changelog_gen.py;
#              CONSUMES scripts/ci/system_growth.py; CONSUMES scripts/ci/telemetry_snapshot.py;
#              CONSUMES scripts/ci/telemetry_delta.py; CONSUMES scripts/ci/datadog_publish.py;
#              CONSUMES scripts/ci/supply_chain.py; GATES .gitlab/ci/github-plane.yml;
#              PRODUCES CHANGELOG.md; PRODUCES .bits/growth.lock.json; PRODUCES scripts/ci/epoch_chain.json
# Intent:      Let GitLab do everything GitHub Actions did: pull main and trusted pull requests,
#              report results back as commit statuses, and commit the bookkeeping to main.
# ───────────────────────────────────────────────────────────────
"""GitLab is the only CI. This module is the one place that talks to GitHub.

GitHub stays the public collaboration plane: people open pull requests and merge
there. Nothing runs there. A scheduled GitLab job pulls the public state in, every
GitLab pipeline runs against an exact GitHub commit, and the result goes back as a
commit status. Bookkeeping commits go back to `main` with `[skip ci]`.

    python scripts/ci/gitlab_plane.py intake            # main + trusted PR heads into GitLab
    python scripts/ci/gitlab_plane.py status            # GitLab pipeline state -> GitHub status
    python scripts/ci/gitlab_plane.py automerge         # merge agent PRs GitLab passed (AUTOMERGE=1)
    python scripts/ci/gitlab_plane.py review-event      # on review/pr-N: export the PR record
    python scripts/ci/gitlab_plane.py fetch-chain       # published evidence chain head
    python scripts/ci/gitlab_plane.py epoch-publish     # epoch outputs -> Datadog
    python scripts/ci/gitlab_plane.py writeback         # changelog, chain head, growth -> main
    python scripts/ci/gitlab_plane.py ci-report         # Datadog CI Visibility for this pipeline

Every credential is optional at the call site. Without the GitHub status or
writeback token those steps print `SKIP:` and succeed, like the Datadog steps.
The one exception is intake. Without the GitLab ingest token nothing reaches
GitLab, so intake prints `HOLD:` and fails the scheduled job where people see it.

Branches in GitLab:
    buildanddo-source   public `main`, protected, written only by intake
    review/pr-N         head of public pull request N, unprotected, no secrets
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]

PUBLIC_REPOSITORY = "mrnobodytx/buildanddo"
MAIN_MIRROR = "buildanddo-source"
REVIEW_PREFIX = "review/pr-"
STATUS_CONTEXT = "gitlab-ci/buildanddo"
TRUSTED_ASSOCIATIONS = frozenset({"OWNER", "MEMBER", "COLLABORATOR"})
SKIP_CI_RE = re.compile(r"\[(?:skip ci|ci skip)\]", re.I)
SHA_RE = re.compile(r"[0-9a-f]{40}")
BOT_NAME = "BuildAndDo CI Bot"
BOT_EMAIL = "buildanddo-ci@users.noreply.github.com"

# The scripts each subcommand runs, so the agent briefing can count them as
# wired into GitLab when the plane is (scripts/ci/agent_context.py).
WRAPPED: dict[str, tuple[str, ...]] = {
    "writeback": ("scripts/ci/changelog_gen.py", "scripts/ci/system_growth.py"),
    "epoch-publish": ("scripts/ci/datadog_publish.py",),
    "ci-report": (
        "scripts/ci/supply_chain.py",
        "scripts/ci/telemetry_snapshot.py",
        "scripts/ci/telemetry_delta.py",
        "scripts/ci/datadog_publish.py",
        "scripts/ci/candidate_manifest.py",
    ),
}

# GitLab pipeline status -> GitHub commit status state.
PIPELINE_STATES = {
    "success": "success",
    "failed": "failure",
    "canceled": "error",
    "skipped": "error",
}


class PlaneError(RuntimeError):
    """A step that cannot continue safely."""


# ── environment ──────────────────────────────────────────────────────────────

def github_env(environ: dict[str, str] | None = None, *, branch: str = "") -> dict[str, str]:
    """Map GitLab CI variables onto the GitHub names the evidence scripts read.

    Those scripts were written for Actions. The values describe the GitLab run,
    and `workflow` says so, so nothing claims a GitHub run that did not happen.
    """
    env = dict(os.environ if environ is None else environ)
    ref = env.get("CI_COMMIT_BRANCH") or env.get("CI_COMMIT_REF_NAME") or ""
    public_branch = branch or ("main" if ref == MAIN_MIRROR else ref)
    mapped = {
        "GITHUB_SHA": env.get("CI_COMMIT_SHA", ""),
        "GITHUB_REF_NAME": public_branch,
        "GITHUB_REPOSITORY": env.get("GITHUB_REPOSITORY") or PUBLIC_REPOSITORY,
        "GITHUB_WORKFLOW": "gitlab:" + (env.get("CI_JOB_NAME") or "local"),
        "GITHUB_RUN_ID": env.get("CI_PIPELINE_ID", ""),
        "GITHUB_RUN_ATTEMPT": "1",
        "GITHUB_ACTOR": env.get("GITLAB_USER_LOGIN", ""),
        "GITHUB_EVENT_NAME": env.get("CI_PIPELINE_SOURCE", ""),
    }
    pr = review_number(ref)
    if pr is not None:
        mapped["GITHUB_HEAD_REF"] = ref
    env.update({k: v for k, v in mapped.items() if v or k not in env})
    return env


def review_number(branch: str) -> int | None:
    match = re.fullmatch(re.escape(REVIEW_PREFIX) + r"([1-9][0-9]{0,6})", branch or "")
    return int(match.group(1)) if match else None


def repository(env: dict[str, str]) -> str:
    repo = env.get("GITHUB_REPOSITORY") or PUBLIC_REPOSITORY
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
        raise PlaneError("GITHUB_REPOSITORY is not owner/name")
    return repo


# ── HTTP and git ─────────────────────────────────────────────────────────────

Http = Callable[[str, str, dict[str, str], Any], tuple[int, Any]]


def http(method: str, url: str, headers: dict[str, str], body: Any = None) -> tuple[int, Any]:
    """One JSON request. Returns (status, parsed body or None); never raises on HTTP errors."""
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Accept": "application/json", "User-Agent": "buildanddo-gitlab-plane",
        **({"Content-Type": "application/json"} if data else {}), **headers})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw, status = error.read(), error.code
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return 0, {"error": str(error)}
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, None


@dataclass
class GitHub:
    repo: str
    token: str = ""
    request: Http = http
    api: str = "https://api.github.com"

    def headers(self) -> dict[str, str]:
        base = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        return {**base, "Authorization": f"Bearer {self.token}"} if self.token else base

    def get(self, path: str) -> Any:
        status, data = self.request("GET", f"{self.api}/repos/{self.repo}{path}", self.headers(), None)
        if status != 200:
            raise PlaneError(f"GitHub GET {path} returned {status}")
        return data

    def open_pulls(self) -> list[dict]:
        pulls: list[dict] = []
        for page in range(1, 11):
            batch = self.get(f"/pulls?state=open&per_page=100&page={page}")
            if not isinstance(batch, list):
                raise PlaneError("GitHub pull list is not a list")
            pulls.extend(batch)
            if len(batch) < 100:
                break
        return pulls

    def status_of(self, sha: str, context: str) -> dict | None:
        data = self.get(f"/commits/{sha}/status")
        for item in (data or {}).get("statuses") or []:
            if item.get("context") == context:
                return item
        return None

    def merge(self, number: int, sha: str, title: str) -> tuple[int, Any]:
        """Merge pinned to the reviewed head: GitHub refuses if the head moved."""
        return self.request("PUT", f"{self.api}/repos/{self.repo}/pulls/{number}/merge", self.headers(),
                            {"merge_method": "merge", "sha": sha, "commit_title": title})

    def post_status(self, sha: str, payload: dict) -> int:
        status, _ = self.request("POST", f"{self.api}/repos/{self.repo}/statuses/{sha}", self.headers(), payload)
        return status


@dataclass
class GitLab:
    api: str
    project: str
    token: str = ""
    job_token: str = ""
    request: Http = http

    def headers(self) -> dict[str, str]:
        if self.token:
            return {"PRIVATE-TOKEN": self.token}
        return {"JOB-TOKEN": self.job_token} if self.job_token else {}

    def url(self, path: str) -> str:
        return f"{self.api.rstrip('/')}/projects/{urllib.parse.quote(self.project, safe='')}{path}"

    def has_commit(self, sha: str) -> bool:
        status, _ = self.request("GET", self.url(f"/repository/commits/{sha}"), self.headers(), None)
        return status == 200

    def latest_pipeline(self, sha: str, ref: str) -> dict | None:
        # Push pipelines only: the scheduled intake runs on the same ref and SHA, and
        # reporting it would post intake's own "running" as the commit's result.
        query = urllib.parse.urlencode({"sha": sha, "ref": ref, "source": "push",
                                        "order_by": "id", "sort": "desc", "per_page": 1})
        status, data = self.request("GET", self.url(f"/pipelines?{query}"), self.headers(), None)
        if status != 200 or not isinstance(data, list):
            raise PlaneError(f"GitLab pipeline lookup for {ref} returned {status}")
        return data[0] if data else None


def git(*args: str, cwd: Path = ROOT, env: dict[str, str] | None = None, check: bool = True,
        timeout: int = 600) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", *args], cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode != 0:
        # Never echo the command line: a URL may carry a username.
        raise PlaneError(f"git {args[0]} failed: {result.stderr.strip()[-400:]}")
    return result


class Askpass:
    """Hand a token to git through GIT_ASKPASS so it never appears in argv or a URL."""

    def __init__(self, user: str, token: str) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="plane-askpass-"))
        script = self.dir / "askpass.sh"
        script.write_text("#!/bin/sh\ncase \"$1\" in\n  *Username*) printf '%s\\n' \"$PLANE_GIT_USER\" ;;\n"
                          "  *) printf '%s\\n' \"$PLANE_GIT_TOKEN\" ;;\nesac\n")
        script.chmod(0o700)
        # GitLab Runner can also install a credential helper that answers with the job
        # token, and git asks helpers before GIT_ASKPASS. The job token can read this project
        # but never push. An empty credential.helper at command-line scope clears the list;
        # with_user() handles the runner's insteadOf rewrite.
        self.env = {**os.environ, "GIT_ASKPASS": str(script), "GIT_TERMINAL_PROMPT": "0",
                    "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "credential.helper", "GIT_CONFIG_VALUE_0": "",
                    "PLANE_GIT_USER": user, "PLANE_GIT_TOKEN": token}

    def close(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)

    def __enter__(self) -> "Askpass":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def with_user(url: str, user: str) -> str:
    """Put a username in an https URL so the runner's insteadOf rewrite cannot match it.

    GitLab Runner rewrites `https://<gitlab host>/` to a URL carrying the job token
    (url.<...>.insteadOf in the checkout's config). That rewrite matches by prefix, so
    `https://user@host/...` is left alone, and GIT_ASKPASS supplies the password.
    """
    scheme, sep, rest = url.partition("://")
    if not sep or scheme != "https" or "@" in rest.split("/", 1)[0]:
        return url
    return f"{scheme}://{urllib.parse.quote(user, safe='')}@{rest}"


def clean_pusher(root: Path = ROOT) -> Path:
    """A bare repository that borrows this checkout's objects but none of its config.

    The runner writes job-token settings (credential helper, insteadOf rewrite, auth
    headers) into the checkout's .git/config. Pushing from a repository without that
    config means only the plane's own token is ever offered, whatever the runner did.
    """
    common = Path(git("rev-parse", "--git-common-dir", cwd=root).stdout.strip())
    objects = (common if common.is_absolute() else root / common).resolve() / "objects"
    pusher = root / "state/ci/plane.git"
    shutil.rmtree(pusher, ignore_errors=True)
    pusher.parent.mkdir(parents=True, exist_ok=True)
    git("init", "--quiet", "--bare", str(pusher), cwd=root)
    (pusher / "objects/info/alternates").write_text(str(objects) + "\n")
    return pusher


def github_url(repo: str) -> str:
    return f"https://github.com/{repo}.git"


def gitlab_url(env: dict[str, str]) -> str:
    explicit = env.get("GITLAB_INGEST_REPO_URL", "")
    if explicit:
        return explicit
    server, path = env.get("CI_SERVER_URL", ""), env.get("CI_PROJECT_PATH", "")
    if not server or not path:
        raise PlaneError("set GITLAB_INGEST_REPO_URL or run inside GitLab CI")
    return f"{server.rstrip('/')}/{path}.git"


def gitlab_client(env: dict[str, str], request: Http = http) -> GitLab:
    api = env.get("CI_API_V4_URL") or env.get("GITLAB_API_URL", "")
    project = env.get("CI_PROJECT_ID") or env.get("GITLAB_PROJECT_ID", "")
    if not api or not project:
        raise PlaneError("GitLab API location unknown (CI_API_V4_URL, CI_PROJECT_ID)")
    return GitLab(api, project, env.get("GITLAB_INGEST_TOKEN", ""), env.get("CI_JOB_TOKEN", ""), request)


# ── intake planning (pure) ───────────────────────────────────────────────────

def trusted(pull: dict, repo: str) -> bool:
    """Only code from this repository's own people reaches the shell runner unattended."""
    head_repo = ((pull.get("head") or {}).get("repo") or {}).get("full_name")
    return head_repo == repo or pull.get("author_association") in TRUSTED_ASSOCIATIONS


@dataclass
class IntakePlan:
    main_sha: str
    pushes: dict[str, str] = field(default_factory=dict)      # branch -> sha
    deletes: list[str] = field(default_factory=list)          # branch
    reviews: dict[int, str] = field(default_factory=dict)     # PR number -> head sha (mirrored)
    held: dict[int, str] = field(default_factory=dict)        # PR number -> head sha (fork, not mirrored)

    def as_json(self) -> dict:
        return {"main": self.main_sha, "reviews": {str(k): v for k, v in sorted(self.reviews.items())},
                "held": {str(k): v for k, v in sorted(self.held.items())}}


def plan_intake(main_sha: str, pulls: list[dict], remote: dict[str, str], repo: str) -> IntakePlan:
    """Decide which GitLab branches to move, given GitHub's state and GitLab's heads."""
    if not SHA_RE.fullmatch(main_sha):
        raise PlaneError("GitHub main is not a commit SHA")
    plan = IntakePlan(main_sha)
    if remote.get(MAIN_MIRROR) != main_sha:
        plan.pushes[MAIN_MIRROR] = main_sha
    for pull in pulls:
        number, sha = pull.get("number"), (pull.get("head") or {}).get("sha", "")
        if type(number) is not int or number < 1 or not SHA_RE.fullmatch(sha or ""):
            continue
        if not trusted(pull, repo):
            plan.held[number] = sha
            continue
        plan.reviews[number] = sha
        branch = f"{REVIEW_PREFIX}{number}"
        if remote.get(branch) != sha:
            plan.pushes[branch] = sha
    for branch in sorted(remote):
        number = review_number(branch)
        if number is not None and number not in plan.reviews:
            plan.deletes.append(branch)
    return plan


def remote_heads(listing: str) -> dict[str, str]:
    heads = {}
    for line in listing.splitlines():
        parts = line.split("\t")
        if len(parts) == 2 and parts[1].startswith("refs/heads/") and SHA_RE.fullmatch(parts[0]):
            heads[parts[1][len("refs/heads/"):]] = parts[0]
    return heads


def describe(pipeline: dict | None, skipped: bool) -> tuple[str, str, str]:
    """GitHub (state, description, target_url) for one GitLab pipeline."""
    if skipped:
        return "error", "Commit says [skip ci]; push a new commit to run GitLab CI", ""
    if not pipeline:
        return "pending", "Waiting for a GitLab pipeline", ""
    status = pipeline.get("status", "")
    state = PIPELINE_STATES.get(status, "pending")
    return state, f"GitLab pipeline {pipeline.get('id', '?')}: {status or 'unknown'}", pipeline.get("web_url") or ""


# ── subcommands ──────────────────────────────────────────────────────────────

def cmd_intake(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    repo = repository(env)
    token = env.get("GITLAB_INGEST_TOKEN", "")
    if not token and not args.dry_run:
        print("HOLD: GITLAB_INGEST_TOKEN is not set; GitHub main and PRs cannot reach GitLab.")
        return 1
    hub = GitHub(repo, env.get("GITHUB_STATUS_TOKEN", ""), request)
    pulls = hub.open_pulls()

    refspecs = ["+refs/heads/main:refs/github/main"]
    refspecs += [f"+refs/pull/{p['number']}/head:refs/github/pull/{p['number']}"
                 for p in pulls if type(p.get("number")) is int and trusted(p, repo)]
    git("fetch", "--no-tags", "--quiet", github_url(repo), *refspecs)
    main_sha = git("rev-parse", "refs/github/main").stdout.strip()

    user = env.get("GITLAB_INGEST_USER") or "oauth2"
    target = with_user(gitlab_url(env), user) if token else ""
    pusher = clean_pusher() if token else ROOT
    with Askpass(user, token) as auth:
        listing = git("ls-remote", "--heads", target, cwd=pusher, env=auth.env).stdout if token else ""
        plan = plan_intake(main_sha, pulls, remote_heads(listing), repo)
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(plan.as_json(), indent=2, sort_keys=True) + "\n")

        for number, sha in sorted(plan.held.items()):
            print(f"HELD: PR #{number} ({sha[:12]}) comes from a fork; a maintainer mirrors it by hand.")
        if args.dry_run:
            print(json.dumps({"push": plan.pushes, "delete": plan.deletes}, indent=2, sort_keys=True))
            return 0

        if MAIN_MIRROR in plan.pushes:
            # SAME-SHA INVARIANT, carried over from the retired mirror workflow: push
            # the exact object, then ask GitLab for it by SHA. A successful push alone
            # does not prove propagation.
            git("push", "--quiet", f"--force-with-lease=refs/heads/{MAIN_MIRROR}:"
                + remote_heads(listing).get(MAIN_MIRROR, ""), target,
                f"{main_sha}:refs/heads/{MAIN_MIRROR}", cwd=pusher, env=auth.env)
        lab = gitlab_client(env, request)
        if not lab.has_commit(main_sha):
            print(f"HOLD: GitLab has no commit object {main_sha} after intake.")
            return 1
        print(f"PROPAGATION VERIFIED: GitLab {MAIN_MIRROR} holds {main_sha}")

        # One ref per push. GitLab creates no pipelines for a push that moves more than a
        # few branches at once, so a batched push mirrored five PR heads and ran none of them.
        specs = [f"+{sha}:refs/heads/{branch}" for branch, sha in sorted(plan.pushes.items()) if branch != MAIN_MIRROR]
        specs += [f":refs/heads/{branch}" for branch in plan.deletes]
        for spec in specs:
            git("push", "--quiet", target, spec, cwd=pusher, env=auth.env)
        for branch, sha in sorted(plan.pushes.items()):
            if branch != MAIN_MIRROR:
                print(f"MIRRORED: {branch} -> {sha[:12]}")
        for branch in plan.deletes:
            print(f"PRUNED: {branch} (pull request closed)")
    return 0


def cmd_status(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    token = env.get("GITHUB_STATUS_TOKEN", "")
    if not token:
        print("SKIP: GITHUB_STATUS_TOKEN is not set; GitLab results are not posted to GitHub.")
        return 0
    state = json.loads(Path(args.intake).read_text())
    hub = GitHub(repository(env), token, request)
    lab = gitlab_client(env, request)
    targets = [(state["main"], MAIN_MIRROR)] + [(sha, f"{REVIEW_PREFIX}{n}") for n, sha in state["reviews"].items()]
    posted = 0
    for sha, ref in targets:
        message = git("log", "-1", "--format=%B", sha, check=False).stdout
        pipeline = lab.latest_pipeline(sha, ref)
        if pipeline is None and not has_plane(sha):
            # A review pipeline runs the PR's own CI file. A branch cut before GitLab became
            # the only CI has no job that matches review/*, so GitLab creates nothing and a
            # "waiting" status would wait forever. Say what unblocks it instead.
            result = ("error", "Branch predates GitLab-only CI; merge main to run GitLab checks", "")
        else:
            result = describe(pipeline, bool(SKIP_CI_RE.search(message)))
        posted += post_if_changed(hub, sha, *result)
    for number, sha in state.get("held", {}).items():
        posted += post_if_changed(hub, sha, "pending", f"Fork PR #{number}: a maintainer must mirror it to GitLab", "")
    print(f"STATUS: {posted} commit status(es) updated on GitHub.")
    return 0


AUTOMERGE_BRANCH_RE = re.compile(r"bits/SRS-[A-Z0-9]+(?:-[A-Z0-9]+)+-[a-z0-9][a-z0-9-]*")
ACTOR_LABELS = frozenset({"actor:human", "actor:agent", "actor:mixed"})


def merge_verdict(pull: dict, repo: str, gitlab_state: str | None, allowed: frozenset[str]) -> str:
    """Why a PR may or may not merge unattended. "merge" is the only yes.

    Every condition the human merge step checked by hand: one SRS branch, exactly
    one actor label from the allowed set, same-repository head, not a draft, the
    GitLab result for this exact head is success, and GitHub reports it mergeable.
    """
    if pull.get("draft"):
        return "draft"
    if (pull.get("base") or {}).get("ref") != "main":
        return "base is not main"
    head = pull.get("head") or {}
    if (head.get("repo") or {}).get("full_name") != repo:
        return "head is outside this repository"
    if not AUTOMERGE_BRANCH_RE.fullmatch(head.get("ref") or ""):
        return "branch is not bits/<SRS-CODE>-<slug>"
    labels = {item.get("name") for item in pull.get("labels") or []}
    actors = labels & ACTOR_LABELS
    if len(actors) != 1:
        return "needs exactly one actor label"
    if not actors <= allowed:
        return f"{next(iter(actors))} is not merged unattended"
    if "do-not-merge" in labels or "hold" in labels:
        return "held by label"
    if gitlab_state != "success":
        return f"GitLab result is {gitlab_state or 'missing'}"
    if pull.get("mergeable") is not True:
        return "GitHub does not report it mergeable yet"
    return "merge"


def cmd_automerge(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    if env.get("AUTOMERGE", "0") != "1":
        print("SKIP: AUTOMERGE is not 1; pull requests wait for a person.")
        return 0
    token = env.get("GITHUB_WRITEBACK_TOKEN", "")
    if not token:
        print("SKIP: GITHUB_WRITEBACK_TOKEN is not set; nothing can be merged.")
        return 0
    allowed = frozenset(x.strip() for x in env.get("AUTOMERGE_ACTORS", "actor:agent").split(",") if x.strip())
    hub = GitHub(repository(env), token, request)
    merged = 0
    for summary in hub.open_pulls():
        number = summary.get("number")
        if type(number) is not int:
            continue
        pull = hub.get(f"/pulls/{number}")  # the list omits mergeable
        sha = (pull.get("head") or {}).get("sha", "")
        status = hub.status_of(sha, STATUS_CONTEXT) if SHA_RE.fullmatch(sha or "") else None
        verdict = merge_verdict(pull, hub.repo, (status or {}).get("state"), allowed)
        if verdict != "merge":
            print(f"WAIT: PR #{number}: {verdict}")
            continue
        if args.dry_run:
            print(f"DRY RUN: would merge PR #{number} at {sha[:12]}")
            continue
        title = f"Merge pull request #{number}: {pull.get('title', '').strip()}"[:250]
        code, body = hub.merge(number, sha, title)
        if code == 200 and (body or {}).get("merged"):
            merged += 1
            print(f"MERGED: PR #{number} at {sha[:12]} -> {(body or {}).get('sha', '')[:12]}")
        else:
            # A moved head or a conflict refuses the merge; the next run re-reads it.
            print(f"WAIT: PR #{number}: GitHub refused the merge ({code})")
    print(f"AUTOMERGE: {merged} pull request(s) merged.")
    return 0


def has_plane(sha: str) -> bool:
    """True when this commit carries the GitLab-only CI include (and so has review jobs)."""
    return git("cat-file", "-e", f"{sha}:.gitlab/ci/github-plane.yml", check=False).returncode == 0


def post_if_changed(hub: GitHub, sha: str, state: str, description: str, url: str) -> int:
    current = hub.status_of(sha, STATUS_CONTEXT)
    if current and current.get("state") == state and (current.get("target_url") or "") == url \
            and current.get("description") == description[:140]:
        return 0
    payload = {"state": state, "context": STATUS_CONTEXT, "description": description[:140]}
    if url:
        payload["target_url"] = url
    code = hub.post_status(sha, payload)
    if code != 201:
        raise PlaneError(f"GitHub status post for {sha[:12]} returned {code}")
    return 1


def cmd_review_event(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    branch = env.get("CI_COMMIT_BRANCH", "")
    number = review_number(branch)
    if number is None:
        print(f"SKIP: {branch or 'this ref'} is not a review branch; no PR record is exported.")
        return 0
    pull = GitHub(repository(env), env.get("GITHUB_STATUS_TOKEN", ""), request).get(f"/pulls/{number}")
    head = git("rev-parse", "HEAD").stdout.strip()
    if (pull.get("head") or {}).get("sha") != head:
        # The PR moved after intake. The newer head gets its own pipeline; this one
        # must not attest labels for a candidate nobody is reviewing any more.
        print(f"FAIL: PR #{number} head is no longer {head[:12]}; this pipeline is superseded.")
        return 1
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"pull_request": pull}, indent=2, sort_keys=True) + "\n")
    print(f"EXPORTED: PR #{number} at {head[:12]} -> {out}")
    return 0


def cmd_fetch_chain(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    """Read the chain head from published main, not from this checkout.

    A queued pipeline can predate the previous epoch's commit. The base copy lets
    writeback refuse to overwrite a chain that moved while this epoch was built.
    """
    out, base = Path(args.output), Path(args.base)
    out.parent.mkdir(parents=True, exist_ok=True)
    fetched = git("fetch", "--no-tags", "--quiet", github_url(repository(env)),
                  "+refs/heads/main:refs/github/main", check=False)
    shown = git("show", "refs/github/main:scripts/ci/epoch_chain.json", check=False) if fetched.returncode == 0 else None
    if shown is not None and shown.returncode == 0:
        text = shown.stdout
    else:
        print("WARN: published main unreachable; linking to this checkout's chain head.")
        text = (ROOT / "scripts/ci/epoch_chain.json").read_text()
    out.write_text(text)
    base.write_text(text)
    return 0


def read_outputs(path: Path) -> dict[str, str]:
    values = {}
    if path.is_file():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep:
                values[key.strip()] = value.strip()
    return values


def cmd_epoch_publish(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    o = read_outputs(Path(args.outputs))
    if not o.get("epoch_id"):
        print("SKIP: no epoch was produced; nothing to publish.")
        return 0
    text = "\n".join([
        f"Root: {o.get('root_digest', '')}",
        f"Previous: {o.get('previous_epoch') or 'none'} ({o.get('previous_root') or 'none'})",
        f"Artifacts: {o.get('artifact_count', '')} ({o.get('artifact_bytes', '')} bytes)",
        f"Chain length: {o.get('chain_length', '')}",
        f"Commit: {o.get('git_sha', '')}",
        f"Trigger: {o.get('trigger', '')}",
        f"Self-verified: {o.get('verified', '')}",
        f"Recompute: python scripts/ci/evidence_epoch.py --verify {o['epoch_id']}.json",
        f"Run: {env.get('CI_PIPELINE_URL', '')}",
    ])
    # Every epoch is unanchored until an anchor step exists, so all carry anchor:pending.
    argv = [sys.executable, "scripts/ci/datadog_publish.py", "--service", "buildanddo-web", "--env", "production",
            "--pipeline", "main", "--branch", "main", "--source-type-name", "buildanddo",
            "--metric", f"buildanddo.epoch.artifacts={o.get('artifact_count', 0)}",
            "--metric", f"buildanddo.epoch.artifact_bytes={o.get('artifact_bytes', 0)}",
            "--metric", f"buildanddo.epoch.verified={o.get('verified', 0)}",
            "--metric", f"buildanddo.epoch.chain_length={o.get('chain_length', 0)}",
            "--count", "buildanddo.epoch.root_created=1",
            "--tag", f"epoch_id:{o['epoch_id']}", "--tag", f"git_sha:{o.get('git_sha', '')}",
            "--tag", f"trigger:{o.get('trigger', '')}", "--tag", "source:evidence_epoch", "--tag", "anchor:pending",
            "--tag", "ci_provider:gitlab",
            "--event-title", f"Evidence Epoch Created: {o['epoch_id']}", "--event-text", text,
            "--alert-type", "info",
            "--log-message", f"Evidence epoch {o['epoch_id']} root {o.get('root_digest', '')} over "
                             f"{o.get('artifact_count', '')} artifacts (verified={o.get('verified', '')})"]
    return subprocess.run(argv, cwd=ROOT, env=github_env(env)).returncode


# ── writeback ────────────────────────────────────────────────────────────────

@dataclass
class Bookkeeping:
    path: str
    subject: str
    trailers: str


def bookkeeping(sha: str) -> list[Bookkeeping]:
    """The three commit-back messages, kept as the retired workflows wrote them."""
    by = "Written by .gitlab/ci/github-plane.yml (main_writeback) from"
    return [
        Bookkeeping("CHANGELOG.md", "docs(changelog): refresh from main history [skip ci]",
                    f"{by} scripts/ci/changelog_gen.py.\n\nSRS: SRS-BUILDANDDO-CHANGELOG-001\nChangelog: skip"),
        Bookkeeping("scripts/ci/epoch_chain.json", "ci(bits): record {epoch} in the evidence chain [skip ci]",
                    f"Root {{root}}. {by} scripts/ci/evidence_epoch.py so the epoch chain is reconstructable "
                    "from git history alone.\n\nSRS: SRS-BUILDANDDO-EPOCH-001\nChangelog: skip"),
        Bookkeeping(".bits/growth.lock.json", f"chore(growth): record system growth for {sha[:7]} [skip ci]",
                    f"{by} scripts/ci/system_growth.py.\n\nSRS: SRS-BUILDANDDO-GROWTH-001\nChangelog: skip"),
    ]


def regenerate(tree: Path, chain: Path | None, chain_base: str, outputs: dict[str, str], sha: str,
               run: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> list[str]:
    """Commit each piece of bookkeeping that changed on this tree. Returns the subjects committed."""
    committed = []
    env = {**os.environ, "GIT_AUTHOR_NAME": BOT_NAME, "GIT_AUTHOR_EMAIL": BOT_EMAIL,
           "GIT_COMMITTER_NAME": BOT_NAME, "GIT_COMMITTER_EMAIL": BOT_EMAIL}
    for item in bookkeeping(sha):
        if item.path == "CHANGELOG.md":
            run([sys.executable, "scripts/ci/changelog_gen.py", "--ref", "HEAD", "--no-summary"], cwd=tree, check=True)
        elif item.path == "scripts/ci/epoch_chain.json":
            if chain is None or not chain.is_file():
                continue
            current = (tree / item.path).read_text() if (tree / item.path).is_file() else ""
            if current != chain_base:
                # Another epoch landed while this one was built. Writing ours would
                # orphan it; skipping costs one link and never an invalid root.
                print("WARN: the published chain moved during this run; this epoch stays an artifact only.")
                continue
            shutil.copyfile(chain, tree / item.path)
        else:
            # Last, so the growth point measures the tree the other two produced.
            run([sys.executable, "scripts/ci/system_growth.py", "--write"], cwd=tree, check=True)
        if git("diff", "--quiet", "--", item.path, cwd=tree, check=False).returncode == 0:
            continue
        git("add", "--", item.path, cwd=tree)
        subject = item.subject.format(epoch=outputs.get("epoch_id", "epoch"))
        body = item.trailers.format(root=outputs.get("root_digest", ""))
        git("commit", "--quiet", "-m", subject, "-m", body, cwd=tree, env=env)
        committed.append(subject)
    return committed


def cmd_writeback(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    token = env.get("GITHUB_WRITEBACK_TOKEN", "")
    if not token and not args.dry_run:
        print("SKIP: GITHUB_WRITEBACK_TOKEN is not set; changelog, growth and chain head are not committed back.")
        return 0
    repo = repository(env)
    chain = Path(args.chain) if args.chain else None
    chain_base = Path(args.chain_base).read_text() if args.chain_base and Path(args.chain_base).is_file() else ""
    outputs = read_outputs(Path(args.outputs))
    if chain is not None and (outputs.get("verified") != "1" or not Path(args.rechecked).is_file()):
        # Only a self-verified epoch may move the published chain head.
        print("SKIP: no self-verified epoch from this pipeline; the chain head is left as it is.")
        chain = None
    tree = Path(args.worktree).resolve()
    candidate = env.get("CI_COMMIT_SHA") or git("rev-parse", "HEAD").stdout.strip()
    with Askpass("x-access-token", token) as auth:
        for attempt in (1, 2, 3):
            git("fetch", "--no-tags", "--quiet", github_url(repo), "+refs/heads/main:refs/github/main")
            git("worktree", "remove", "--force", str(tree), check=False)
            shutil.rmtree(tree, ignore_errors=True)
            git("worktree", "prune", check=False)
            git("worktree", "add", "--quiet", "--detach", str(tree), "refs/github/main")
            committed = regenerate(tree, chain, chain_base, outputs, candidate)
            if not committed:
                print("Bookkeeping already matches main; nothing to commit.")
                return 0
            if args.dry_run:
                print("DRY RUN: would push " + "; ".join(committed))
                return 0
            pushed = git("push", "--quiet", with_user(github_url(repo), "x-access-token"), "HEAD:refs/heads/main",
                         cwd=tree, env=auth.env, check=False)
            if pushed.returncode == 0:
                print(f"WRITEBACK: pushed {len(committed)} commit(s) to main on attempt {attempt}.")
                return 0
            print(f"push rejected; main moved, regenerating on the new head (attempt {attempt}).")
    # A lost point is a gap in the history, never a wrong one; main must not go red over it.
    print("WARN: bookkeeping regenerated but not pushed; the next merge records the next point.")
    return 0


# ── CI report (port of the retired Datadog composite action) ─────────────────

def pipeline_kind(env: dict[str, str]) -> str:
    branch = env.get("CI_COMMIT_BRANCH", "")
    if review_number(branch) is not None:
        return "pr"
    return "main" if branch == MAIN_MIRROR else "local"


def cmd_ci_report(args: argparse.Namespace, env: dict[str, str], request: Http = http) -> int:
    kind = args.pipeline or pipeline_kind(env)
    genv = github_env(env)
    reports = ROOT / "reports"
    (reports / "telemetry").mkdir(parents=True, exist_ok=True)

    if not args.skip_static_analysis:
        if (ROOT / "node_modules").is_dir() or (ROOT / "apps/web/node_modules").is_dir():
            # Telemetry only; the lint gate is the acceptance job's own lint check.
            subprocess.run(["npx", "--no-install", "eslint", ".", "--format", "json", "--output-file",
                            str(reports / "eslint.json")], cwd=ROOT / "apps/web", timeout=300, check=False)
            with open(reports / "knip.json", "w") as handle:
                subprocess.run(["npx", "--no-install", "knip", "--reporter", "json"], cwd=ROOT, stdout=handle,
                               stderr=subprocess.DEVNULL, timeout=300, check=False)
        else:
            print("SKIP: node_modules absent; lint and dead-code telemetry not collected.")
        for name in ("eslint.json", "knip.json"):
            path = reports / name
            if path.exists() and path.stat().st_size == 0:
                path.unlink()

    baseline = reports / "telemetry" / "baseline.json"
    if not args.no_baseline:
        try:
            lab = gitlab_client(env, request)
            query = urllib.parse.urlencode({"job": "ci_report"})
            url = lab.url(f"/jobs/artifacts/{MAIN_MIRROR}/raw/reports/telemetry/snapshot.json?{query}")
            status, data = request("GET", url, lab.headers(), None)
            if status == 200 and isinstance(data, dict):
                baseline.write_text(json.dumps(data))
                print("Baseline restored from the last main ci_report artifact.")
            else:
                print(f"No main baseline available (http={status}); this run has no delta.")
        except PlaneError as error:
            print(f"No main baseline available ({error}).")

    base_ref = "HEAD~1"
    if kind == "pr":
        fetched = git("fetch", "--no-tags", "--quiet", github_url(repository(env)),
                      "+refs/heads/main:refs/github/main", check=False)
        base_ref = "refs/github/main" if fetched.returncode == 0 else ""

    def step(*argv: str, required: bool = True) -> None:
        code = subprocess.run([sys.executable, *argv], cwd=ROOT, env=genv).returncode
        if code and required:
            raise PlaneError(f"{argv[0]} exited {code}")

    step("scripts/ci/supply_chain.py", required=False)
    step("scripts/ci/telemetry_snapshot.py", "--pipeline", kind, "--base-ref", base_ref,
         "--job-status", args.job_status, "--pipeline-started-at", env.get("CI_PIPELINE_CREATED_AT", ""),
         "--output", "reports/telemetry/snapshot.json")
    step("scripts/ci/telemetry_delta.py", "--current", "reports/telemetry/snapshot.json",
         "--baseline", str(baseline) if baseline.is_file() else "",
         "--output", "reports/telemetry/delta.json", "--markdown-output", "reports/telemetry/delta.md")
    print((reports / "telemetry" / "delta.md").read_text() if (reports / "telemetry" / "delta.md").is_file() else "")
    step("scripts/ci/datadog_publish.py", "--snapshot", "reports/telemetry/snapshot.json",
         "--delta", "reports/telemetry/delta.json", "--summary-markdown", "reports/telemetry/delta.md",
         "--service", "buildanddo-web", "--env", "ci", "--pipeline", kind, required=False)
    if kind == "main" and not args.skip_provenance:
        step("scripts/ci/candidate_manifest.py", "--output", "reports/telemetry/candidate-provenance.json",
             required=False)

    if not env.get("DD_API_KEY"):
        print("SKIP: DD_API_KEY is not configured; no Datadog CI Visibility upload.")
        return 0
    ddci = ["npx", "--yes", "@datadog/datadog-ci@^2"]
    denv = {**genv, "DD_SERVICE": "buildanddo-web", "DD_ENV": "ci"}
    subprocess.run([*ddci, "git-metadata", "upload"], cwd=ROOT, env=denv, check=False)
    junit = reports / "junit"
    if junit.is_dir() and any(junit.rglob("*.xml")):
        subprocess.run([*ddci, "junit", "upload", "--service", "buildanddo-web", "--env", "ci", str(junit)],
                       cwd=ROOT, env=denv, check=False)
    else:
        print("SKIP: no JUnit XML under reports/junit; test visibility upload not attempted.")
    subprocess.run([*ddci, "tag", "--level", "pipeline", "--tags", f"buildanddo_pipeline:{kind}",
                    "--tags", "buildanddo_service:buildanddo-web"], cwd=ROOT, env=denv, check=False)
    return 0


# ── entry point ──────────────────────────────────────────────────────────────

COMMANDS = {
    "intake": cmd_intake,
    "status": cmd_status,
    "automerge": cmd_automerge,
    "review-event": cmd_review_event,
    "fetch-chain": cmd_fetch_chain,
    "epoch-publish": cmd_epoch_publish,
    "writeback": cmd_writeback,
    "ci-report": cmd_ci_report,
}


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("intake", help="mirror GitHub main and trusted PR heads into GitLab")
    p.add_argument("--output", default="state/ci/intake.json")
    p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("automerge", help="merge agent PRs whose exact head GitLab passed")
    p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("status", help="post GitLab pipeline results to GitHub commit statuses")
    p.add_argument("--intake", default="state/ci/intake.json")
    p = sub.add_parser("review-event", help="export the PR record bound to this review branch")
    p.add_argument("--output", default="state/ci/github-pr-event.json")
    p = sub.add_parser("fetch-chain", help="read the evidence chain head from published main")
    p.add_argument("--output", default="state/epochs/chain-head.json")
    p.add_argument("--base", default="state/epochs/chain-base.json")
    p = sub.add_parser("epoch-publish", help="publish the epoch outputs to Datadog")
    p.add_argument("--outputs", default="state/epochs/outputs.env")
    p = sub.add_parser("writeback", help="commit changelog, chain head and growth point to GitHub main")
    p.add_argument("--chain", default="state/epochs/chain-head.json")
    p.add_argument("--chain-base", default="state/epochs/chain-base.json")
    p.add_argument("--outputs", default="state/epochs/outputs.env")
    p.add_argument("--rechecked", default="state/epochs/rechecked",
                   help="marker the epoch job writes after re-hashing every artifact")
    p.add_argument("--worktree", default="state/ci/writeback")
    p.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("ci-report", help="Datadog CI telemetry for this pipeline")
    p.add_argument("--pipeline", choices=["main", "pr", "local"], default="")
    p.add_argument("--job-status", default="success")
    p.add_argument("--skip-static-analysis", action="store_true")
    p.add_argument("--skip-provenance", action="store_true")
    p.add_argument("--no-baseline", action="store_true")
    return ap


def main(argv: list[str] | None = None, environ: dict[str, str] | None = None, request: Http = http) -> int:
    args = parser().parse_args(argv)
    env = dict(os.environ if environ is None else environ)
    try:
        return COMMANDS[args.command](args, env, request)
    except PlaneError as error:
        print(f"FAIL: {error}")
        return 1
    except subprocess.CalledProcessError as error:
        print(f"FAIL: {Path(str(error.cmd[1] if len(error.cmd) > 1 else error.cmd[0])).name} exited {error.returncode}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
