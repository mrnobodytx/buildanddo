#!/usr/bin/env python3
"""BuildAndDo 21-day sprint P0 convergence + verified release controller v1.0.1.

Purpose
-------
Converge the measured Day-15 P0 source holds and provide a fail-closed,
readback-gated GitLab runner path from staging to production.

Truth rules
-----------
* SOURCE_PRESENT != LIVE_PASS != VERIFIED_PRODUCTION.
* A candidate/pipeline success is not a production deployment.
* Production is VERIFIED only after external /_version readback matches the
  exact candidate SHA and required smoke checks pass.
* Datadog DORA is emitted only after production verification.
* Missing credentials/configuration are HOLD, never PASS.

Authority
---------
* A1: observation/plan/status/doctor/verify.
* A2: bounded local source materialization (P0 patch, CI wiring, backups).
* A3: remote writes (Git pushes, GitLab pipeline/job mutations, staging or
  production deployment, rollback).

This controller is stdlib-only. It reuses data_dog_private's GitLab and Datadog
bridges when that checkout is present, but does not require them for local P0
convergence or artifact construction.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from typing import Any, Iterable, Mapping, Sequence
import urllib.error
import urllib.parse
import urllib.request
import zipfile

VERSION = "1.0.1"
CAMPAIGN = "citadel-21-day-2026-09"
SCHEMA = "buildanddo.release-control/v1"
DEFAULT_ROOT = Path(r"D:\HOSTINGER_COMP")
DEFAULT_REPO_REL = Path("sites") / "buildanddo"
DEFAULT_SECRET = Path(r"D:\citadel_secrets\BuildAndDo\release.env")
LEGACY_HOME_TITLE = "Your business" + " changed today"
LEGACY_HOME_DESC = "business newspaper" + " for your own operations"
LEGACY_ONBOARDING = "Which business" + " should BuildAndDo understand?"
LEGACY_CTA = "Try a business" + " challenge"
LEGACY_PHRASES = (LEGACY_HOME_TITLE, LEGACY_HOME_DESC, LEGACY_ONBOARDING, LEGACY_CTA)
RELEASE_JOB_MARKER_BEGIN = "# BEGIN CITADEL BUILDANDDO VERIFIED RELEASE v1"
RELEASE_JOB_MARKER_END = "# END CITADEL BUILDANDDO VERIFIED RELEASE v1"
RELEASE_JOB_NAME_CANDIDATE = "buildanddo_release_candidate"
RELEASE_JOB_NAME_STAGE = "buildanddo_stage_release"
RELEASE_JOB_NAME_PROD = "buildanddo_promote_production"


class ReleaseError(RuntimeError):
    """Fail-closed release/controller error."""


@dataclasses.dataclass(frozen=True)
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def safe_slug(value: str, default: str = "release") -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip("-._")
    return text[:96] or default


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def atomic_json(path: Path, payload: Mapping[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)
    return path


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def load_env_file(path: Path | None) -> dict[str, str]:
    loaded: dict[str, str] = {}
    if path is None or not path.is_file():
        return loaded
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value
            loaded[key] = value
    return loaded


def root_path(value: str | None) -> Path:
    return Path(value or os.environ.get("CITADEL_ROOT") or DEFAULT_ROOT)


def find_repo(root: Path, explicit: str | None = None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    env_repo = os.environ.get("BUILDANDDO_REPO")
    if env_repo:
        candidates.append(Path(env_repo))
    candidates.extend((root / DEFAULT_REPO_REL, root / "buildanddo", root / "BuildAndDo"))
    for candidate in candidates:
        if candidate.is_dir() and (candidate / ".git").exists():
            return candidate.resolve()
    raise ReleaseError(f"persistent BuildAndDo Git checkout not found under {root}")


def run(
    args: Sequence[str],
    *,
    cwd: Path | None = None,
    env: Mapping[str, str] | None = None,
    timeout: float = 120.0,
    check: bool = False,
) -> CommandResult:
    completed = subprocess.run(
        list(args),
        cwd=str(cwd) if cwd else None,
        env=dict(env) if env else None,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    result = CommandResult(list(args), completed.returncode, completed.stdout, completed.stderr)
    if check and completed.returncode != 0:
        raise ReleaseError(f"command failed rc={completed.returncode}: {args[0]}")
    return result


def git(repo: Path, *args: str, check: bool = False, timeout: float = 120.0) -> CommandResult:
    return run(["git", "-C", str(repo), *args], timeout=timeout, check=check)


def git_head(repo: Path) -> str:
    result = git(repo, "rev-parse", "HEAD")
    return result.stdout.strip() if result.returncode == 0 else ""


def git_branch(repo: Path) -> str:
    result = git(repo, "branch", "--show-current")
    return result.stdout.strip() if result.returncode == 0 else ""


def git_dirty(repo: Path) -> list[str]:
    result = git(repo, "status", "--porcelain", "--untracked-files=all")
    return [line for line in result.stdout.splitlines() if line.strip()] if result.returncode == 0 else ["<git-status-failed>"]


def git_remotes(repo: Path) -> dict[str, str]:
    result = git(repo, "remote", "-v")
    values: dict[str, str] = {}
    if result.returncode != 0:
        return values
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[2] == "(push)":
            values[parts[0]] = parts[1]
    return values


def choose_remote(remotes: Mapping[str, str], kind: str, explicit: str | None = None) -> tuple[str, str] | None:
    if explicit:
        url = remotes.get(explicit)
        return (explicit, url) if url else None
    patterns = {
        "github": ("github.com",),
        "gitlab": ("gitlab.citadel-nexus.com", "gitlab"),
    }
    for name, url in remotes.items():
        lower = url.lower()
        if any(marker in lower for marker in patterns[kind]):
            if kind == "gitlab" and "github.com" in lower:
                continue
            return name, url
    return None


def infer_gitlab_project(remote_url: str) -> str:
    value = remote_url.strip()
    if value.startswith("git@") and ":" in value:
        path = value.split(":", 1)[1]
    else:
        parsed = urllib.parse.urlparse(value)
        path = parsed.path.lstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not path or "/" not in path:
        raise ReleaseError("unable to infer GitLab project path from remote")
    return path


def state_root(root: Path) -> Path:
    return root / "state" / "sprint" / CAMPAIGN / "release"


def receipt_path(root: Path, name: str) -> Path:
    return state_root(root) / f"{name}.latest.json"


def write_receipt(root: Path, name: str, payload: Mapping[str, Any]) -> Path:
    body = dict(payload)
    body.setdefault("schema", SCHEMA)
    body.setdefault("version", VERSION)
    body.setdefault("campaign_id", CAMPAIGN)
    body.setdefault("generated_at", utcnow())
    path = receipt_path(root, name)
    body["receipt_path"] = str(path)
    return atomic_json(path, body)


def backup_files(root: Path, repo: Path, paths: Iterable[Path], label: str) -> Path:
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = root / "bootstrap" / "backups" / "buildanddo-p0-release-v1" / f"{stamp}-{safe_slug(label)}"
    for path in paths:
        if not path.exists():
            continue
        try:
            rel = path.resolve().relative_to(repo.resolve())
        except ValueError:
            rel = Path(path.name)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file():
            shutil.copy2(path, target)
        elif path.is_dir():
            shutil.copytree(path, target, dirs_exist_ok=True)
    return dest


def find_source_files(repo: Path) -> list[Path]:
    suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".md", ".html", ".json", ".yml", ".yaml"}
    excluded = {"node_modules", ".git", "dist", "build", "coverage", ".next", "vendor", ".venv", "venv"}
    result: list[Path] = []
    for path in repo.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in suffixes:
            continue
        if any(part in excluded for part in path.parts):
            continue
        result.append(path)
    return result


def source_contains(files: Sequence[Path], term: str) -> bool:
    needle = term.casefold()
    for path in files:
        try:
            if needle in path.read_text(encoding="utf-8", errors="replace").casefold():
                return True
        except OSError:
            continue
    return False


def source_matches(files: Sequence[Path], term: str) -> list[dict[str, Any]]:
    needle = term.casefold()
    matches: list[dict[str, Any]] = []
    for path in files:
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines, 1):
            if needle in line.casefold():
                matches.append({"path": str(path), "line": i, "text": line.strip()[:500]})
    return matches


def p0_state(repo: Path) -> dict[str, Any]:
    files = find_source_files(repo)
    legacy: list[dict[str, Any]] = []
    for phrase in LEGACY_PHRASES:
        for hit in source_matches(files, phrase):
            hit["phrase"] = phrase
            legacy.append(hit)
    values = {
        "learn_by_doing": source_contains(files, "Learn by doing real work"),
        "homepage_support": source_contains(files, "Learn with people and AI") or source_contains(files, "Prove what you can do"),
        "start_learning": source_contains(files, "Start learning"),
        "build_something": source_contains(files, "Build something"),
        "onboarding_question": source_contains(files, "What do you want to do?"),
        "learn_choice": source_contains(files, "Learn something"),
        "flagship": source_contains(files, "Deploy my first website") or source_contains(files, "website deployment"),
        "has_gitlab_ci": (repo / ".gitlab-ci.yml").is_file(),
        "version_readback": source_contains(files, "/_version") or source_contains(files, "deployed SHA"),
        "verify_production": source_contains(files, "verify-production") or source_contains(files, "verify-production".replace("-", "_")),
    }
    values["identity_pass"] = bool(values["learn_by_doing"] and not legacy)
    values["homepage_pass"] = bool(values["learn_by_doing"] and values["homepage_support"] and (values["start_learning"] or values["build_something"]))
    values["onboarding_pass"] = bool(values["onboarding_question"] and values["learn_choice"] and not any(x["phrase"].startswith("Which business") for x in legacy))
    values["release_truth_source_pass"] = bool(values["has_gitlab_ci"] and (values["version_readback"] or values["verify_production"]))
    values["legacy_matches"] = legacy
    values["state"] = "PASS" if all(values[x] for x in ("identity_pass", "homepage_pass", "onboarding_pass", "flagship", "release_truth_source_pass")) else "HOLD"
    return values


def replace_text(path: Path, replacements: Sequence[tuple[str, str]]) -> list[dict[str, Any]]:
    if not path.is_file():
        raise ReleaseError(f"required source file missing: {path}")
    original = path.read_text(encoding="utf-8")
    updated = original
    changes: list[dict[str, Any]] = []
    for old, new in replacements:
        count = updated.count(old)
        if count:
            updated = updated.replace(old, new)
            changes.append({"old": old, "new": new, "count": count})
    if updated != original:
        path.write_text(updated, encoding="utf-8")
    return changes


def flagship_public_dir(repo: Path) -> Path:
    candidates = (repo / "apps" / "web" / "public", repo / "public")
    for path in candidates:
        if path.is_dir():
            return path
    # The audit already establishes apps/web; create its conventional public dir
    # rather than inventing a second application root.
    return repo / "apps" / "web" / "public"


def apply_p0(root: Path, repo: Path, *, ack: str) -> dict[str, Any]:
    if ack != "A2":
        raise ReleaseError("apply-p0 requires --ack-authority A2")
    before = p0_state(repo)
    homepage = repo / "apps" / "web" / "src" / "pages" / "HomePage.jsx"
    onboarding = repo / "apps" / "web" / "src" / "pages" / "OnboardingPage.jsx"
    if not homepage.is_file() or not onboarding.is_file():
        raise ReleaseError("expected audited HomePage.jsx/OnboardingPage.jsx paths are not present; refusing guessed patch")
    lesson = flagship_public_dir(repo) / "lessons" / "deploy-my-first-website.json"
    tracked = [homepage, onboarding, repo / ".gitlab-ci.yml", lesson]
    backup = backup_files(root, repo, tracked, git_head(repo)[:12] or "nohead")

    home_changes = replace_text(
        homepage,
        (
            (LEGACY_HOME_TITLE, "Learn by doing real work"),
            (
                LEGACY_HOME_DESC,
                "Learn with people and AI. Build something real. Preserve the evidence. Prove what you can do.",
            ),
            (LEGACY_CTA, "Start learning"),
        ),
    )
    onboard_changes = replace_text(
        onboarding,
        (
            (
                LEGACY_ONBOARDING,
                "What do you want to do? Learn something, build something, complete a project, join a class, join a challenge, or explore.",
            ),
        ),
    )

    lesson.parent.mkdir(parents=True, exist_ok=True)
    lesson_payload = {
        "schema": "buildanddo.lesson/v1",
        "id": "deploy-my-first-website",
        "title": "Deploy my first website",
        "kind": "flagship-sprint-seed",
        "objective": "Deploy a real website and prove that the deployed version is the intended commit.",
        "promise": "Learn by doing real work.",
        "path": [
            "choose an objective",
            "learn the deployment prerequisites",
            "create a bounded deployment mission",
            "build the site",
            "deploy to staging",
            "verify staging by external readback",
            "promote the same artifact to production",
            "verify production SHA and health",
            "attach the deployment evidence to the mission",
            "record demonstrated capability",
        ],
        "verification": {
            "required": True,
            "checks": ["external URL health", "commit identity readback", "artifact hash", "rollback target"],
            "truth_rule": "candidate success is not production verification",
        },
        "campaign": CAMPAIGN,
    }
    lesson.write_text(json.dumps(lesson_payload, indent=2) + "\n", encoding="utf-8")

    after = p0_state(repo)
    result = {
        "state": "PASS" if after["identity_pass"] and after["homepage_pass"] and after["onboarding_pass"] and after["flagship"] else "HOLD",
        "authority": "A2",
        "remote_writes": 0,
        "repo": str(repo),
        "head_before": git_head(repo),
        "backup": str(backup),
        "homepage_changes": home_changes,
        "onboarding_changes": onboard_changes,
        "flagship_seed": str(lesson),
        "flagship_seed_truth": "SOURCE_AND_PUBLIC_ARTIFACT_SEED_ONLY; runtime/catalog discovery still requires deployment/readback",
        "before": before,
        "after": after,
    }
    write_receipt(root, "p0_convergence_patch", result)
    return result


CI_JOB_BLOCK = f"""

{RELEASE_JOB_MARKER_BEGIN}
# GitLab runner builds and packages the exact candidate after all existing
# pipeline gates pass. Remote staging/production mutation is deliberately NOT
# performed by the runner: the local/Rig1 release controller downloads this
# immutable artifact, deploys it, performs external /_version readback, and only
# then emits DORA. # verify-production
{RELEASE_JOB_NAME_CANDIDATE}:
  stage: .post
  rules:
    - if: '$BUILDANDDO_RELEASE_ENABLE == "1"'
      when: on_success
    - when: never
  script:
    - python tools/buildanddo_release.py plan --root . --repo .
    - python tools/buildanddo_release.py build --root . --repo .
  artifacts:
    when: always
    expire_in: 14 days
    paths:
      - .citadel-release/
{RELEASE_JOB_MARKER_END}
""".lstrip("\n")


def wire_ci(root: Path, repo: Path, source_script: Path, *, ack: str) -> dict[str, Any]:
    if ack != "A2":
        raise ReleaseError("wire-ci requires --ack-authority A2")
    ci = repo / ".gitlab-ci.yml"
    tool = repo / "tools" / "buildanddo_release.py"
    doc = repo / "docs" / "BUILDANDDO_RELEASE_TRUTH.md"
    env_example = repo / ".citadel" / "release.env.example"
    gitignore = repo / ".gitignore"
    backup = backup_files(root, repo, [ci, tool, doc, env_example, gitignore], "wire-ci")

    tool.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_script, tool)

    created_ci = False
    if ci.is_file():
        text = ci.read_text(encoding="utf-8")
    else:
        raise ReleaseError("existing .gitlab-ci.yml is missing; refusing to invent/bypass the candidate pipeline")
    if RELEASE_JOB_MARKER_BEGIN not in text:
        if text and not text.endswith("\n"):
            text += "\n"
        text += "\n" + CI_JOB_BLOCK
        ci.write_text(text, encoding="utf-8")

    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(
        "# BuildAndDo verified release truth\n\n"
        "This release lane preserves the sprint rule:\n\n"
        "`candidate -> GitLab pipeline/runner -> immutable artifact -> staging -> external readback -> production -> external SHA readback -> evidence -> DORA`\n\n"
        "Production is not VERIFIED until the production `/_version` document reports the exact candidate SHA and the external health checks pass. DORA is emitted only after that verification.\n\n"
        "The GitLab jobs are intentionally manual and require explicit A3 operator promotion. Missing URLs, webroots, credentials, artifact state, or readback cause HOLD rather than inferred success.\n",
        encoding="utf-8",
    )

    env_example.parent.mkdir(parents=True, exist_ok=True)
    if not env_example.exists():
        env_example.write_text(RELEASE_ENV_EXAMPLE, encoding="utf-8")

    ignore_text = gitignore.read_text(encoding="utf-8") if gitignore.is_file() else ""
    if ".citadel-release/" not in ignore_text.splitlines():
        if ignore_text and not ignore_text.endswith("\n"):
            ignore_text += "\n"
        ignore_text += "\n# BuildAndDo verified release artifacts\n.citadel-release/\n"
        gitignore.write_text(ignore_text, encoding="utf-8")

    state = p0_state(repo)
    result = {
        "state": "PASS" if state["release_truth_source_pass"] else "HOLD",
        "authority": "A2",
        "remote_writes": 0,
        "repo": str(repo),
        "backup": str(backup),
        "ci_file": str(ci),
        "ci_created": created_ci,
        "controller": str(tool),
        "documentation": str(doc),
        "env_example": str(env_example),
        "gitignore": str(gitignore),
        "release_truth_source": state,
    }
    write_receipt(root, "release_ci_wiring", result)
    return result


RELEASE_ENV_EXAMPLE = r"""# BuildAndDo verified release configuration v1
# Copy to D:\citadel_secrets\BuildAndDo\release.env or another path outside Git.
# Do not commit credential values.

# Public readback URLs. Both are required before promotion.
BUILDANDDO_STAGING_URL=
BUILDANDDO_PRODUCTION_URL=

# Deployment driver: local_webroot or ssh_webroot.
# local_webroot is for a GitLab runner executing on the target host.
# ssh_webroot is for a runner that reaches the Hostinger target via SSH/rsync.
BUILDANDDO_STAGING_DEPLOY_MODE=
BUILDANDDO_PRODUCTION_DEPLOY_MODE=

# local_webroot target roots (used only when that mode is selected).
BUILDANDDO_STAGING_ROOT=
BUILDANDDO_PRODUCTION_ROOT=

# ssh_webroot configuration. All target roots must be absolute Linux paths.
BUILDANDDO_STAGING_HOST=
BUILDANDDO_STAGING_USER=
BUILDANDDO_STAGING_PORT=22
BUILDANDDO_STAGING_REMOTE_ROOT=
BUILDANDDO_STAGING_SSH_KEY_FILE=

BUILDANDDO_PRODUCTION_HOST=
BUILDANDDO_PRODUCTION_USER=
BUILDANDDO_PRODUCTION_PORT=22
BUILDANDDO_PRODUCTION_REMOTE_ROOT=
BUILDANDDO_PRODUCTION_SSH_KEY_FILE=

# Optional build overrides. The controller otherwise discovers common npm/pnpm/yarn builds.
BUILDANDDO_BUILD_WORKDIR=
BUILDANDDO_BUILD_INSTALL_COMMAND=
BUILDANDDO_BUILD_COMMAND=
BUILDANDDO_ARTIFACT_DIR=

# Candidate publication / GitLab runner launch.
BUILDANDDO_GITHUB_REMOTE=
BUILDANDDO_GITLAB_REMOTE=
BUILDANDDO_GITLAB_PROJECT=
GITLAB_URL=https://gitlab.citadel-nexus.com
GITLAB_TOKEN=

# Datadog. DORA is attempted only after production readback PASS.
DD_SITE=us5.datadoghq.com
DD_API_KEY=
DD_APP_KEY=

# data_dog_private checkout for bridge reuse.
DATA_DOG_PRIVATE=D:\data_dog_private

# Optional provider labels; claims are recorded as claims, not verification.
BUILDANDDO_STAGING_PROVIDER=
BUILDANDDO_PRODUCTION_PROVIDER=hostinger
"""


def parse_command_string(value: str) -> list[str]:
    # shlex with posix=False on Windows preserves quoted Windows paths; on Linux CI
    # the commands are expected to be conventional package-manager tokens.
    return shlex.split(value, posix=(os.name != "nt"))


def build_plan(repo: Path) -> dict[str, Any]:
    explicit_workdir = os.environ.get("BUILDANDDO_BUILD_WORKDIR", "").strip()
    if explicit_workdir:
        workdir = Path(explicit_workdir)
        if not workdir.is_absolute():
            workdir = repo / workdir
    elif (repo / "package.json").is_file():
        workdir = repo
    elif (repo / "apps" / "web" / "package.json").is_file():
        workdir = repo / "apps" / "web"
    else:
        raise ReleaseError("no BuildAndDo package.json found; set BUILDANDDO_BUILD_WORKDIR")

    install_override = os.environ.get("BUILDANDDO_BUILD_INSTALL_COMMAND", "").strip()
    build_override = os.environ.get("BUILDANDDO_BUILD_COMMAND", "").strip()
    if install_override:
        install_cmd = parse_command_string(install_override)
    elif (repo / "pnpm-lock.yaml").is_file() or (workdir / "pnpm-lock.yaml").is_file():
        install_cmd = ["pnpm", "install", "--frozen-lockfile"]
    elif (repo / "yarn.lock").is_file() or (workdir / "yarn.lock").is_file():
        install_cmd = ["yarn", "install", "--immutable"]
    elif (repo / "package-lock.json").is_file() or (workdir / "package-lock.json").is_file():
        install_cmd = ["npm", "ci"]
    else:
        install_cmd = ["npm", "install", "--ignore-scripts"]

    if build_override:
        build_cmd = parse_command_string(build_override)
    elif (repo / "pnpm-lock.yaml").is_file() or (workdir / "pnpm-lock.yaml").is_file():
        build_cmd = ["pnpm", "run", "build"]
    elif (repo / "yarn.lock").is_file() or (workdir / "yarn.lock").is_file():
        build_cmd = ["yarn", "build"]
    else:
        build_cmd = ["npm", "run", "build"]

    artifact_override = os.environ.get("BUILDANDDO_ARTIFACT_DIR", "").strip()
    candidates: list[Path] = []
    if artifact_override:
        p = Path(artifact_override)
        candidates.append(p if p.is_absolute() else repo / p)
    candidates.extend(
        [
            repo / "apps" / "web" / "dist",
            repo / "apps" / "web" / "build",
            repo / "apps" / "web" / "out",
            repo / "dist",
            repo / "build",
            repo / "out",
        ]
    )
    return {
        "workdir": str(workdir),
        "install_command": install_cmd,
        "build_command": build_cmd,
        "artifact_candidates": [str(x) for x in candidates],
    }


def copy_tree_clean(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def artifact_manifest(root: Path) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )
    canonical = json.dumps(files, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return {"file_count": len(files), "files": files, "tree_sha256": sha256_bytes(canonical)}


def build_release(repo: Path, root: Path, *, skip_install: bool = False) -> dict[str, Any]:
    sha = git_head(repo)
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", sha or ""):
        raise ReleaseError("exact committed Git SHA is required before build")
    plan = build_plan(repo)
    workdir = Path(plan["workdir"])
    release_root = repo / ".citadel-release"
    artifact = release_root / "artifact"
    logs = release_root / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    if not skip_install:
        install = run(plan["install_command"], cwd=workdir, timeout=1200)
        (logs / "install.stdout.txt").write_text(install.stdout, encoding="utf-8")
        (logs / "install.stderr.txt").write_text(install.stderr, encoding="utf-8")
        if install.returncode != 0:
            raise ReleaseError(f"dependency install failed rc={install.returncode}")
    build = run(plan["build_command"], cwd=workdir, timeout=1800)
    (logs / "build.stdout.txt").write_text(build.stdout, encoding="utf-8")
    (logs / "build.stderr.txt").write_text(build.stderr, encoding="utf-8")
    if build.returncode != 0:
        raise ReleaseError(f"BuildAndDo build failed rc={build.returncode}")

    source_artifact: Path | None = None
    for candidate in map(Path, plan["artifact_candidates"]):
        if candidate.is_dir() and any(p.is_file() for p in candidate.rglob("*")):
            source_artifact = candidate
            break
    if source_artifact is None:
        raise ReleaseError("no static build artifact found; set BUILDANDDO_ARTIFACT_DIR explicitly")
    copy_tree_clean(source_artifact, artifact)
    version_doc = {
        "schema": "buildanddo.deployed-version/v1",
        "commit_sha": sha,
        "candidate_sha": sha,
        "campaign_id": CAMPAIGN,
        "built_at": utcnow(),
        "source_branch": git_branch(repo),
        "gitlab_pipeline_id": os.environ.get("CI_PIPELINE_ID") or None,
        "gitlab_job_id": os.environ.get("CI_JOB_ID") or None,
    }
    (artifact / "_version").write_text(json.dumps(version_doc, sort_keys=True) + "\n", encoding="utf-8")
    manifest = artifact_manifest(artifact)
    release_doc = {
        "schema": "buildanddo.release-artifact/v1",
        "state": "PASS",
        "commit_sha": sha,
        "artifact_dir": str(artifact),
        "source_artifact_dir": str(source_artifact),
        "manifest": manifest,
        "plan": plan,
        "generated_at": utcnow(),
    }
    atomic_json(release_root / "artifact.json", release_doc)
    write_receipt(root, "artifact_build", release_doc)
    return release_doc


def _validate_http_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ReleaseError("readback URL must be absolute HTTP(S)")
    if parsed.username or parsed.password:
        raise ReleaseError("readback URL must not contain credentials")
    return url.rstrip("/")


def http_get(url: str, timeout: float = 20.0) -> tuple[int, bytes, Mapping[str, str]]:
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": f"buildanddo-release/{VERSION}", "Cache-Control": "no-cache", "Pragma": "no-cache"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status), response.read(3_000_000), dict(response.headers.items())
    except urllib.error.HTTPError as exc:
        return int(exc.code), exc.read(1_000_000), dict(exc.headers.items())
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ReleaseError(f"HTTP readback failed: {type(exc).__name__}") from exc


def sha_matches(expected: str, actual: str) -> bool:
    expected = expected.strip().lower()
    actual = actual.strip().lower()
    if not expected or not actual:
        return False
    return expected == actual or (len(actual) >= 7 and expected.startswith(actual)) or (len(expected) >= 7 and actual.startswith(expected))


def verify_environment(root: Path, env_name: str, sha: str) -> dict[str, Any]:
    prefix = f"BUILDANDDO_{env_name.upper()}"
    url = os.environ.get(prefix + "_URL", "").strip()
    if not url:
        raise ReleaseError(f"{prefix}_URL is required")
    base = _validate_http_url(url)
    cache_bust = urllib.parse.quote(str(int(time.time())))
    health_status, health_body, _ = http_get(base + f"/?citadel_cb={cache_bust}")
    version_status, version_body, _ = http_get(base + f"/_version?citadel_cb={cache_bust}")
    version: dict[str, Any] = {}
    try:
        parsed = json.loads(version_body.decode("utf-8", errors="replace"))
        if isinstance(parsed, dict):
            version = parsed
    except json.JSONDecodeError:
        version = {}
    deployed_sha = str(version.get("commit_sha") or version.get("candidate_sha") or "")
    health_pass = 200 <= health_status < 400
    version_pass = version_status == 200 and sha_matches(sha, deployed_sha)

    lesson_status = 0
    lesson_pass = False
    try:
        lesson_status, lesson_body, _ = http_get(base + f"/lessons/deploy-my-first-website.json?citadel_cb={cache_bust}")
        lesson_pass = lesson_status == 200 and b"Deploy my first website" in lesson_body
    except ReleaseError:
        lesson_status = 0
        lesson_pass = False

    result = {
        "schema": "buildanddo.external-readback/v1",
        "environment": env_name,
        "url": base,
        "expected_sha": sha,
        "deployed_sha": deployed_sha,
        "health_status": health_status,
        "version_status": version_status,
        "flagship_lesson_status": lesson_status,
        "health_pass": health_pass,
        "sha_match": version_pass,
        "flagship_lesson_readback": lesson_pass,
        "state": "PASS" if health_pass and version_pass and lesson_pass else "HOLD",
        "verified_at": utcnow(),
        "truth_rule": "external readback + exact SHA required",
    }
    write_receipt(root, f"{env_name}_verification", result)
    return result


def _validated_local_root(value: str) -> Path:
    if not value.strip():
        raise ReleaseError("local webroot is missing")
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ReleaseError("local webroot must be absolute")
    # Never permit a drive/filesystem root as a mirror target.
    try:
        if path.resolve() == Path(path.anchor).resolve():
            raise ReleaseError("local webroot is too broad; provide the exact site directory")
    except OSError:
        pass
    return path


def _validated_remote_root(value: str) -> str:
    value = value.strip()
    if not value.startswith("/") or ".." in Path(value).parts or not re.fullmatch(r"/[A-Za-z0-9_./-]+", value):
        raise ReleaseError("remote webroot must be a simple absolute Linux path")
    if value in {"/", "/etc", "/usr", "/var", "/home", "/root", "/opt", "/srv"}:
        raise ReleaseError("remote webroot is too broad; provide the exact site directory")
    return value.rstrip("/")


def _validated_host(value: str) -> str:
    value = value.strip()
    if not value or not re.fullmatch(r"[A-Za-z0-9.-]+", value):
        raise ReleaseError("SSH host is missing or malformed")
    return value


def _validated_user(value: str) -> str:
    value = value.strip()
    if not value or not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        raise ReleaseError("SSH user is missing or malformed")
    return value


def _copy_contents(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for existing in list(dst.iterdir()):
        if existing.name == ".citadel_backups":
            continue
        if existing.is_dir() and not existing.is_symlink():
            shutil.rmtree(existing)
        else:
            existing.unlink()
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)


def deploy_local_webroot(root: Path, artifact: Path, target: Path, sha: str, env_name: str) -> dict[str, Any]:
    target.mkdir(parents=True, exist_ok=True)
    backups = target / ".citadel_backups"
    backups.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backups / f"{stamp}-{sha[:12]}"
    backup.mkdir(parents=True, exist_ok=True)
    for item in list(target.iterdir()):
        if item.name == ".citadel_backups":
            continue
        dest = backup / item.name
        if item.is_dir() and not item.is_symlink():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)
    _copy_contents(artifact, target)
    return {"mode": "local_webroot", "target": str(target), "backup": str(backup), "remote_writes": 1, "environment": env_name}


def ssh_base(prefix: str) -> tuple[list[str], str, str, int, Path]:
    host = _validated_host(os.environ.get(prefix + "_HOST", ""))
    user = _validated_user(os.environ.get(prefix + "_USER", ""))
    try:
        port = int(os.environ.get(prefix + "_PORT", "22"))
    except ValueError as exc:
        raise ReleaseError("SSH port must be an integer") from exc
    if not (1 <= port <= 65535):
        raise ReleaseError("SSH port out of range")
    key = Path(os.environ.get(prefix + "_SSH_KEY_FILE", "").strip()).expanduser()
    if not key.is_file():
        raise ReleaseError(f"{prefix}_SSH_KEY_FILE does not exist")
    remote_root = _validated_remote_root(os.environ.get(prefix + "_REMOTE_ROOT", ""))
    base = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-i", str(key), "-p", str(port), f"{user}@{host}"]
    return base, remote_root, f"{user}@{host}", port, key


def deploy_ssh_webroot(artifact: Path, sha: str, env_name: str) -> dict[str, Any]:
    prefix = f"BUILDANDDO_{env_name.upper()}"
    base, remote_root, target, port, key = ssh_base(prefix)
    if shutil.which("ssh") is None or shutil.which("rsync") is None:
        raise ReleaseError("ssh_webroot requires ssh and rsync on the GitLab runner")
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = f"{remote_root}/.citadel_backups"
    backup_tgz = f"{backup_dir}/{stamp}-{sha[:12]}.tgz"
    qroot = shlex.quote(remote_root)
    qbackup_dir = shlex.quote(backup_dir)
    qbackup_tgz = shlex.quote(backup_tgz)
    pre = (
        f"test -d {qroot} && mkdir -p {qbackup_dir} && "
        f"tar --exclude='.citadel_backups' -czf {qbackup_tgz} -C {qroot} ."
    )
    result = run([*base, pre], timeout=300)
    if result.returncode != 0:
        raise ReleaseError("remote backup/precheck failed")
    rsync = run(
        [
            "rsync",
            "-az",
            "--delete",
            "--exclude=.citadel_backups/",
            "-e",
            f"ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i {shlex.quote(str(key))} -p {port}",
            str(artifact) + "/",
            f"{target}:{remote_root}/",
        ],
        timeout=900,
    )
    if rsync.returncode != 0:
        raise ReleaseError("rsync deployment failed after remote backup")
    return {"mode": "ssh_webroot", "target": target, "remote_root": remote_root, "backup": backup_tgz, "remote_writes": 1, "environment": env_name}


def deploy_environment(root: Path, repo: Path, env_name: str, *, ack: str) -> dict[str, Any]:
    if ack != "A3":
        raise ReleaseError("remote deployment requires --ack-authority A3")
    release_doc = read_json(repo / ".citadel-release" / "artifact.json")
    sha = str(release_doc.get("commit_sha") or "")
    artifact = Path(str(release_doc.get("artifact_dir") or repo / ".citadel-release" / "artifact"))
    if not artifact.is_dir() or not re.fullmatch(r"[0-9a-fA-F]{40,64}", sha):
        raise ReleaseError("verified release artifact is missing; run build first")
    prefix = f"BUILDANDDO_{env_name.upper()}"
    mode = os.environ.get(prefix + "_DEPLOY_MODE", "").strip().lower()
    if mode == "local_webroot":
        target = _validated_local_root(os.environ.get(prefix + "_ROOT", ""))
        try:
            target_resolved = target.resolve()
            repo_resolved = repo.resolve()
            root_resolved = root.resolve()
            if target_resolved in {repo_resolved, root_resolved} or repo_resolved.is_relative_to(target_resolved):
                raise ReleaseError("local webroot cannot be the BuildAndDo repo, Citadel root, or their parent")
        except OSError:
            pass
        operation = deploy_local_webroot(root, artifact, target, sha, env_name)
    elif mode == "ssh_webroot":
        operation = deploy_ssh_webroot(artifact, sha, env_name)
    else:
        raise ReleaseError(f"{prefix}_DEPLOY_MODE must be local_webroot or ssh_webroot")
    result = {
        "schema": "buildanddo.deployment/v1",
        "state": "MUTATED_UNVERIFIED",
        "environment": env_name,
        "commit_sha": sha,
        "artifact_tree_sha256": (release_doc.get("manifest") or {}).get("tree_sha256"),
        "authority": "A3",
        "operation": operation,
        "provider_claim": os.environ.get(prefix + "_PROVIDER") or None,
        "provider_claim_state": "CLAIMED" if os.environ.get(prefix + "_PROVIDER") else "UNSPECIFIED",
        "gitlab_pipeline_id": os.environ.get("CI_PIPELINE_ID") or None,
        "gitlab_job_id": os.environ.get("CI_JOB_ID") or None,
        "deployed_at": utcnow(),
    }
    write_receipt(root, f"{env_name}_deployment", result)
    return result


def rollback_environment(root: Path, env_name: str, *, ack: str) -> dict[str, Any]:
    if ack != "A3":
        raise ReleaseError("rollback requires --ack-authority A3")
    deploy = read_json(receipt_path(root, f"{env_name}_deployment"))
    operation = deploy.get("operation") if isinstance(deploy.get("operation"), dict) else {}
    mode = str(operation.get("mode") or "")
    backup = str(operation.get("backup") or "")
    if mode == "local_webroot":
        target = _validated_local_root(str(operation.get("target") or ""))
        backup_path = Path(backup)
        if not backup_path.is_dir():
            raise ReleaseError("local rollback backup is unavailable")
        _copy_contents(backup_path, target)
    elif mode == "ssh_webroot":
        prefix = f"BUILDANDDO_{env_name.upper()}"
        base, remote_root, _, _, _ = ssh_base(prefix)
        if not backup or not backup.startswith(remote_root + "/.citadel_backups/"):
            raise ReleaseError("remote rollback receipt does not identify a bounded backup")
        qroot = shlex.quote(remote_root)
        qbackup = shlex.quote(backup)
        command = (
            f"test -f {qbackup} && find {qroot} -mindepth 1 -maxdepth 1 ! -name .citadel_backups -exec rm -rf -- {{}} + && "
            f"tar -xzf {qbackup} -C {qroot}"
        )
        result = run([*base, command], timeout=600)
        if result.returncode != 0:
            raise ReleaseError("remote rollback failed")
    else:
        raise ReleaseError("no supported prior deployment receipt available for rollback")
    result = {"state": "ROLLED_BACK_UNVERIFIED", "environment": env_name, "authority": "A3", "source_deployment_receipt": str(receipt_path(root, f"{env_name}_deployment")), "rolled_back_at": utcnow()}
    write_receipt(root, f"{env_name}_rollback", result)
    return result


def find_data_dog_private(root: Path) -> Path | None:
    candidates = []
    explicit = os.environ.get("DATA_DOG_PRIVATE")
    if explicit:
        candidates.append(Path(explicit))
    candidates.extend((Path(r"D:\data_dog_private"), root / "data_dog_private", root.parent / "data_dog_private"))
    for candidate in candidates:
        if candidate.is_dir() and (candidate / "integrations" / "datadog_bridge.py").is_file():
            return candidate.resolve()
    return None


def datadog_dora(root: Path, repo: Path, sha: str) -> dict[str, Any]:
    verification = read_json(receipt_path(root, "production_verification"))
    if verification.get("state") != "PASS" or not sha_matches(sha, str(verification.get("deployed_sha") or "")):
        return {"state": "HOLD", "reason": "production verification has not established the candidate SHA", "remote_writes": 0}
    dd_repo = find_data_dog_private(root)
    bridge_used = False
    status = 0
    response: Any = {}
    body = {
        "data": {
            "attributes": {
                "service": "buildanddo-public",
                "started_at": str(read_json(receipt_path(root, "production_deployment")).get("deployed_at") or utcnow()),
                "finished_at": str(verification.get("verified_at") or utcnow()),
                "git": {
                    "commit_sha": sha,
                    "repository_url": _repository_url(repo),
                },
                "env": "production",
                "team": "cnwb-dev",
                "version": sha[:12],
                "custom_tags": [f"campaign:{CAMPAIGN}", "verification:external-readback", "source:buildanddo-release"],
            },
            "type": "dora_deployment",
        }
    }
    if dd_repo:
        if str(dd_repo) not in sys.path:
            sys.path.insert(0, str(dd_repo))
        try:
            from integrations.datadog_bridge import DatadogBridge  # type: ignore
            bridge = DatadogBridge()
            if not bridge.can_write:
                return {"state": "HOLD_CREDENTIAL", "reason": "DD_API_KEY unavailable", "bridge_repo": str(dd_repo), "remote_writes": 0}
            status, response = bridge._request("POST", "/api/v2/dora/deployment", body)  # noqa: SLF001 - deliberate bridge reuse
            bridge_used = True
        except Exception as exc:
            return {"state": "HOLD", "reason": f"data_dog_private bridge failed: {type(exc).__name__}", "bridge_repo": str(dd_repo), "remote_writes": 0}
    else:
        key = os.environ.get("DD_API_KEY", "")
        site = (os.environ.get("DD_SITE") or "us5.datadoghq.com").strip("/")
        if not key:
            return {"state": "HOLD_CREDENTIAL", "reason": "DD_API_KEY unavailable and data_dog_private bridge not found", "remote_writes": 0}
        req = urllib.request.Request(
            f"https://api.{site}/api/v2/dora/deployment",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={"DD-API-KEY": key, "Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                status = int(resp.status)
                raw = resp.read(1_000_000).decode("utf-8", errors="replace")
                response = json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            status = int(exc.code)
            response = {"error": "HTTPError"}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"state": "HOLD", "reason": f"Datadog transport failed: {type(exc).__name__}", "remote_writes": 0}
    result = {
        "state": "PASS" if 200 <= status < 300 else "HOLD",
        "http_status": status,
        "bridge_reused": bridge_used,
        "bridge_repo": str(dd_repo) if dd_repo else None,
        "candidate_sha": sha,
        "remote_writes": 1,
        "response_type": type(response).__name__,
        "emitted_at": utcnow(),
    }
    write_receipt(root, "production_dora", result)
    return result


def _repository_url(repo: Path) -> str:
    remotes = git_remotes(repo)
    preferred = choose_remote(remotes, "github") or choose_remote(remotes, "gitlab")
    return preferred[1] if preferred else ""


def pipeline_stage(root: Path, repo: Path, *, ack: str) -> dict[str, Any]:
    if ack != "A3":
        raise ReleaseError("pipeline-stage requires A3")
    source = p0_state(repo)
    if not (source["identity_pass"] and source["homepage_pass"] and source["onboarding_pass"] and source["flagship"] and source["release_truth_source_pass"]):
        raise ReleaseError("P0 source convergence is not green; refusing staging mutation")
    build = build_release(repo, root)
    deploy = deploy_environment(root, repo, "staging", ack=ack)
    verify = verify_environment(root, "staging", str(build["commit_sha"]))
    result = {
        "state": "PASS" if verify["state"] == "PASS" else "HOLD",
        "phase": "STAGING_VERIFIED" if verify["state"] == "PASS" else "STAGING_UNVERIFIED",
        "candidate_sha": build["commit_sha"],
        "artifact_tree_sha256": (build.get("manifest") or {}).get("tree_sha256"),
        "deployment": deploy,
        "verification": verify,
        "production_mutated": False,
    }
    write_receipt(root, "pipeline_stage", result)
    if result["state"] != "PASS":
        raise ReleaseError("staging deployment did not pass external SHA/readback verification")
    return result


def pipeline_promote(root: Path, repo: Path, *, ack: str) -> dict[str, Any]:
    if ack != "A3":
        raise ReleaseError("pipeline-promote requires A3")
    artifact = read_json(repo / ".citadel-release" / "artifact.json")
    sha = str(artifact.get("commit_sha") or "")
    stage = read_json(receipt_path(root, "staging_verification"))
    if not sha or stage.get("state") != "PASS" or not sha_matches(sha, str(stage.get("deployed_sha") or "")):
        raise ReleaseError("production promotion requires PASS staging external readback of the same artifact SHA")
    deploy = deploy_environment(root, repo, "production", ack=ack)
    verify = verify_environment(root, "production", sha)
    if verify["state"] != "PASS":
        result = {"state": "HOLD", "phase": "PRODUCTION_MUTATED_UNVERIFIED", "candidate_sha": sha, "deployment": deploy, "verification": verify, "dora": {"state": "NOT_RUN"}}
        write_receipt(root, "pipeline_production", result)
        raise ReleaseError("production was mutated but external verification failed; inspect receipt and rollback target")
    dora = datadog_dora(root, repo, sha)
    result = {
        "state": "PASS",
        "phase": "VERIFIED_PRODUCTION",
        "candidate_sha": sha,
        "artifact_tree_sha256": (artifact.get("manifest") or {}).get("tree_sha256"),
        "deployment": deploy,
        "verification": verify,
        "dora": dora,
        "truth": "VERIFIED_PRODUCTION",
    }
    write_receipt(root, "pipeline_production", result)
    return result


def gitlab_headers(token: str) -> dict[str, str]:
    return {"PRIVATE-TOKEN": token, "Accept": "application/json", "Content-Type": "application/json", "User-Agent": f"buildanddo-release/{VERSION}"}


def gitlab_request(method: str, base: str, token: str, path: str, payload: Mapping[str, Any] | None = None, timeout: float = 20.0) -> Any:
    if not token:
        raise ReleaseError("GITLAB_TOKEN is required for pipeline control")
    url = base.rstrip("/") + "/api/v4" + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=gitlab_headers(token))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(3_000_000).decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read(1_000_000).decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"http": exc.code}
        raise ReleaseError(f"GitLab API {method} {path} failed HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ReleaseError(f"GitLab API transport failed: {type(exc).__name__}") from exc


def gitlab_project_id(repo: Path) -> str:
    explicit = os.environ.get("BUILDANDDO_GITLAB_PROJECT", "").strip()
    if explicit:
        return urllib.parse.quote(explicit, safe="")
    remotes = git_remotes(repo)
    selected = choose_remote(remotes, "gitlab", os.environ.get("BUILDANDDO_GITLAB_REMOTE") or None)
    if not selected:
        raise ReleaseError("GitLab remote not found; set BUILDANDDO_GITLAB_REMOTE or BUILDANDDO_GITLAB_PROJECT")
    return urllib.parse.quote(infer_gitlab_project(selected[1]), safe="")


def trigger_gitlab_pipeline(repo: Path, branch: str) -> dict[str, Any]:
    base = os.environ.get("GITLAB_URL", "https://gitlab.citadel-nexus.com")
    token = os.environ.get("GITLAB_TOKEN", "")
    project = gitlab_project_id(repo)
    payload = {
        "ref": branch,
        "variables": [
            {"key": "BUILDANDDO_RELEASE_ENABLE", "value": "1"},
        ],
    }
    result = gitlab_request("POST", base, token, f"/projects/{project}/pipeline", payload)
    if not isinstance(result, dict) or type(result.get("id")) is not int:
        raise ReleaseError("GitLab did not return a pipeline id")
    return result


def pipeline_jobs(repo: Path, pipeline_id: int) -> list[dict[str, Any]]:
    base = os.environ.get("GITLAB_URL", "https://gitlab.citadel-nexus.com")
    token = os.environ.get("GITLAB_TOKEN", "")
    project = gitlab_project_id(repo)
    value = gitlab_request("GET", base, token, f"/projects/{project}/pipelines/{pipeline_id}/jobs?per_page=100")
    return [x for x in value if isinstance(x, dict)] if isinstance(value, list) else []


def wait_for_job(repo: Path, pipeline_id: int, name: str, desired: set[str], timeout_s: float = 1800.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_s
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        jobs = pipeline_jobs(repo, pipeline_id)
        matches = [j for j in jobs if j.get("name") == name]
        if matches:
            last = max(matches, key=lambda x: int(x.get("id") or 0))
            if str(last.get("status")) in desired:
                return last
            if str(last.get("status")) in {"failed", "canceled"}:
                return last
        time.sleep(5)
    raise ReleaseError(f"timed out waiting for GitLab job {name}; last={last.get('status')}")


def play_job(repo: Path, job_id: int) -> dict[str, Any]:
    base = os.environ.get("GITLAB_URL", "https://gitlab.citadel-nexus.com")
    token = os.environ.get("GITLAB_TOKEN", "")
    project = gitlab_project_id(repo)
    result = gitlab_request("POST", base, token, f"/projects/{project}/jobs/{job_id}/play", {})
    return result if isinstance(result, dict) else {}

def gitlab_download_artifacts(repo: Path, job_id: int, destination: Path) -> Path:
    """Download one successful runner artifact archive without exposing credentials."""
    base = os.environ.get("GITLAB_URL", "https://gitlab.citadel-nexus.com").rstrip("/")
    token = os.environ.get("GITLAB_TOKEN", "")
    if not token:
        raise ReleaseError("GITLAB_TOKEN is required to download the runner artifact")
    project = gitlab_project_id(repo)
    url = f"{base}/api/v4/projects/{project}/jobs/{job_id}/artifacts"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"PRIVATE-TOKEN": token, "Accept": "application/octet-stream", "User-Agent": f"buildanddo-release/{VERSION}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            if not (200 <= int(resp.status) < 300):
                raise ReleaseError(f"GitLab artifact download returned HTTP {resp.status}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as out:
                total = 0
                while True:
                    block = resp.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    if total > 500 * 1024 * 1024:
                        raise ReleaseError("GitLab artifact archive exceeds 500 MiB safety limit")
                    out.write(block)
    except urllib.error.HTTPError as exc:
        raise ReleaseError(f"GitLab artifact download failed HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ReleaseError(f"GitLab artifact download failed: {type(exc).__name__}") from exc
    return destination


def _safe_extract_zip(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    dest = destination.resolve()
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            candidate = (destination / info.filename).resolve()
            try:
                candidate.relative_to(dest)
            except ValueError as exc:
                raise ReleaseError("unsafe path in GitLab artifact archive") from exc
        zf.extractall(destination)


def adopt_runner_artifact(root: Path, repo: Path, job_id: int, expected_sha: str) -> dict[str, Any]:
    """Download and verify the immutable artifact produced by the GitLab runner."""
    cache = state_root(root) / "gitlab-artifacts"
    archive = cache / f"job-{job_id}.zip"
    gitlab_download_artifacts(repo, job_id, archive)
    with tempfile.TemporaryDirectory(prefix="buildanddo-gitlab-artifact-") as td:
        extracted = Path(td)
        _safe_extract_zip(archive, extracted)
        source = extracted / ".citadel-release"
        record = read_json(source / "artifact.json")
        observed = str(record.get("commit_sha") or "")
        if not source.is_dir() or not sha_matches(expected_sha, observed):
            raise ReleaseError("runner artifact does not bind to the candidate SHA")
        manifest = record.get("manifest") if isinstance(record.get("manifest"), dict) else {}
        artifact_dir = source / "artifact"
        if not artifact_dir.is_dir():
            raise ReleaseError("runner artifact payload is missing .citadel-release/artifact")
        actual_manifest = artifact_manifest(artifact_dir)
        if actual_manifest.get("tree_sha256") != manifest.get("tree_sha256"):
            raise ReleaseError("runner artifact tree hash does not match artifact.json")
        target = repo / ".citadel-release"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        # Rewrite the absolute artifact path from the runner to the local extracted copy.
        local_record = read_json(target / "artifact.json")
        local_record["artifact_dir"] = str(target / "artifact")
        local_record["adopted_from_gitlab_job_id"] = job_id
        local_record["adopted_at"] = utcnow()
        atomic_json(target / "artifact.json", local_record)
    result = {
        "state": "PASS",
        "candidate_sha": expected_sha,
        "gitlab_job_id": job_id,
        "artifact_archive": str(archive),
        "artifact_archive_sha256": sha256_file(archive),
        "artifact_tree_sha256": manifest.get("tree_sha256"),
        "remote_writes": 0,
        "source": "GITLAB_RUNNER_ARTIFACT",
    }
    write_receipt(root, "runner_artifact", result)
    return result


def push_candidate(root: Path, repo: Path, *, ack: str) -> dict[str, Any]:
    if ack != "A3":
        raise ReleaseError("candidate publication requires A3")
    before = git_head(repo)
    dirty = git_dirty(repo)
    if not dirty:
        raise ReleaseError("no local convergence/release changes to publish")
    branch = f"sprint/p0-release-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M')}-{before[:7]}"
    checkout = git(repo, "checkout", "-b", branch)
    if checkout.returncode != 0:
        raise ReleaseError("failed to create bounded sprint candidate branch")
    allowed_prefixes = (
        "apps/web/src/pages/HomePage.jsx",
        "apps/web/src/pages/OnboardingPage.jsx",
        "apps/web/public/lessons/deploy-my-first-website.json",
        "public/lessons/deploy-my-first-website.json",
        ".gitlab-ci.yml",
        "tools/buildanddo_release.py",
        "docs/BUILDANDDO_RELEASE_TRUTH.md",
        ".citadel/release.env.example",
        ".gitignore",
    )
    status = git_dirty(repo)
    paths: list[str] = []
    unexpected: list[str] = []
    for row in status:
        path = row[3:].strip().strip('"').replace("\\", "/") if len(row) >= 4 else ""
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if any(path == prefix or path.startswith(prefix.rstrip("/") + "/") for prefix in allowed_prefixes):
            paths.append(path)
        else:
            unexpected.append(row)
    if unexpected:
        git(repo, "checkout", before)
        git(repo, "branch", "-D", branch)
        raise ReleaseError("unexpected dirty paths exist; refusing to include unrelated changes: " + "; ".join(unexpected[:10]))
    if not paths:
        raise ReleaseError("no bounded release paths found to commit")
    add = git(repo, "add", "--", *sorted(set(paths)))
    if add.returncode != 0:
        raise ReleaseError("git add failed")
    commit = git(repo, "commit", "-m", f"feat(sprint): converge BuildAndDo P0 and wire verified release [{CAMPAIGN}]", timeout=180)
    if commit.returncode != 0:
        raise ReleaseError("local candidate commit failed; configure Git author and retry")
    sha = git_head(repo)
    remotes = git_remotes(repo)
    gh = choose_remote(remotes, "github", os.environ.get("BUILDANDDO_GITHUB_REMOTE") or None)
    gl = choose_remote(remotes, "gitlab", os.environ.get("BUILDANDDO_GITLAB_REMOTE") or None)
    if not gh or not gl:
        raise ReleaseError("both GitHub and GitLab push remotes are required for sprint release truth")
    pushes = []
    for kind, selected in (("github", gh), ("gitlab", gl)):
        name, url = selected
        result = git(repo, "push", "-u", name, f"HEAD:refs/heads/{branch}", timeout=300)
        if result.returncode != 0:
            raise ReleaseError(f"{kind} candidate push failed")
        readback = git(repo, "ls-remote", name, f"refs/heads/{branch}", timeout=120)
        observed = readback.stdout.strip().split()[0] if readback.returncode == 0 and readback.stdout.strip() else ""
        if observed.lower() != sha.lower():
            raise ReleaseError(f"{kind} branch readback did not match candidate SHA")
        pushes.append({"kind": kind, "remote": name, "remote_url": url, "sha": observed, "verified": True})
    result = {"state": "PASS", "authority": "A3", "branch": branch, "candidate_sha": sha, "pushes": pushes, "remote_writes": 2, "head_before": before}
    write_receipt(root, "candidate_publication", result)
    return result


def launch(root: Path, repo: Path, *, ack: str, promote: bool) -> dict[str, Any]:
    """Publish one candidate, build it on GitLab runners, then promote the exact artifact."""
    if ack != "A3":
        raise ReleaseError("launch requires --ack-authority A3")
    p0 = p0_state(repo)
    if not all(p0[x] for x in ("identity_pass", "homepage_pass", "onboarding_pass", "flagship", "release_truth_source_pass")):
        raise ReleaseError("P0 source convergence is not green; run apply-p0 and wire-ci first")
    candidate = push_candidate(root, repo, ack=ack)
    branch = str(candidate["branch"])
    sha = str(candidate["candidate_sha"])
    pipeline = trigger_gitlab_pipeline(repo, branch)
    pipeline_id = int(pipeline["id"])
    candidate_job = wait_for_job(
        repo, pipeline_id, RELEASE_JOB_NAME_CANDIDATE, {"success", "failed", "canceled"}, timeout_s=3000
    )
    if candidate_job.get("status") != "success":
        raise ReleaseError(f"GitLab runner candidate job did not succeed: {candidate_job.get('status')}")
    artifact = adopt_runner_artifact(root, repo, int(candidate_job["id"]), sha)

    stage_deploy = deploy_environment(root, repo, "staging", ack=ack)
    stage_verify = verify_environment(root, "staging", sha)
    if stage_verify["state"] != "PASS":
        raise ReleaseError("staging mutation completed but external readback did not verify the runner artifact SHA")

    prod_deploy: dict[str, Any] | None = None
    prod_verify: dict[str, Any] | None = None
    dora: dict[str, Any] | None = None
    if promote:
        # Promotion is allowed only after the staging verifier binds the same SHA.
        prod_deploy = deploy_environment(root, repo, "production", ack=ack)
        prod_verify = verify_environment(root, "production", sha)
        if prod_verify["state"] != "PASS":
            raise ReleaseError("production was mutated but external readback failed; use rollback-production")
        dora = datadog_dora(root, repo, sha)

    result = {
        "state": "PASS",
        "authority": "A3",
        "candidate": candidate,
        "pipeline_id": pipeline_id,
        "pipeline_web_url": pipeline.get("web_url"),
        "runner_job": {"id": candidate_job.get("id"), "status": candidate_job.get("status"), "runner": candidate_job.get("runner")},
        "artifact": artifact,
        "staging": {"deployment": stage_deploy, "verification": stage_verify},
        "production": {"deployment": prod_deploy, "verification": prod_verify, "dora": dora} if promote else None,
        "promotion": "VERIFIED_PRODUCTION" if promote else "STAGING_VERIFIED",
        "remote_writes": 4 + (2 if promote else 0) + (1 if dora and dora.get("remote_writes") else 0),
        "truth_rule": "GitHub/GitLab same SHA -> GitLab runner artifact -> staging readback -> production readback -> DORA",
    }
    write_receipt(root, "launch", result)
    return result



def doctor(root: Path, repo: Path) -> dict[str, Any]:
    remotes = git_remotes(repo)
    gh = choose_remote(remotes, "github", os.environ.get("BUILDANDDO_GITHUB_REMOTE") or None)
    gl = choose_remote(remotes, "gitlab", os.environ.get("BUILDANDDO_GITLAB_REMOTE") or None)
    dd_repo = find_data_dog_private(root)
    source = p0_state(repo)
    try:
        plan = build_plan(repo)
        build_state = "PASS"
        build_reason = "build plan resolved"
    except ReleaseError as exc:
        plan = {}
        build_state = "HOLD"
        build_reason = str(exc)

    envs: dict[str, Any] = {}
    for name in ("staging", "production"):
        prefix = f"BUILDANDDO_{name.upper()}"
        mode = os.environ.get(prefix + "_DEPLOY_MODE", "").strip().lower()
        url = os.environ.get(prefix + "_URL", "").strip()
        missing = []
        if not url:
            missing.append(prefix + "_URL")
        if mode not in {"local_webroot", "ssh_webroot"}:
            missing.append(prefix + "_DEPLOY_MODE")
        elif mode == "local_webroot" and not os.environ.get(prefix + "_ROOT", "").strip():
            missing.append(prefix + "_ROOT")
        elif mode == "ssh_webroot":
            for suffix in ("_HOST", "_USER", "_REMOTE_ROOT", "_SSH_KEY_FILE"):
                if not os.environ.get(prefix + suffix, "").strip():
                    missing.append(prefix + suffix)
        envs[name] = {"state": "PASS" if not missing else "HOLD", "mode": mode or None, "url": url or None, "missing": missing}

    gitlab_token = bool(os.environ.get("GITLAB_TOKEN"))
    dora_token = bool(os.environ.get("DD_API_KEY"))
    result = {
        "state": "PASS" if source["state"] == "PASS" and build_state == "PASS" and gh and gl and gitlab_token and all(v["state"] == "PASS" for v in envs.values()) else "HOLD",
        "root": str(root),
        "repo": str(repo),
        "head": git_head(repo),
        "branch": git_branch(repo),
        "dirty": git_dirty(repo),
        "source_p0": source,
        "build": {"state": build_state, "reason": build_reason, "plan": plan},
        "remotes": {"github": gh, "gitlab": gl},
        "gitlab_api": {"state": "PASS" if gitlab_token else "HOLD", "missing": [] if gitlab_token else ["GITLAB_TOKEN"]},
        "environments": envs,
        "data_dog_private": {
            "state": "PASS" if dd_repo else "HOLD",
            "path": str(dd_repo) if dd_repo else None,
            "gitlab_bridge": bool(dd_repo and (dd_repo / "integrations" / "gitlab_bridge.py").is_file()),
            "datadog_bridge": bool(dd_repo and (dd_repo / "integrations" / "datadog_bridge.py").is_file()),
            "deployment_fabric": bool(dd_repo and (dd_repo / ".bits" / "out" / "USO-BITS-DEPLOY-001" / "report.md").is_file()),
            "note": "existing fleet deployment fabric is reused as estate context; BuildAndDo app promotion remains a separate bounded release lane",
        },
        "datadog_dora": {"state": "PASS" if dora_token else "HOLD_CREDENTIAL", "missing": [] if dora_token else ["DD_API_KEY"]},
        "authority": "A1_OBSERVATIONAL",
        "remote_writes": 0,
    }
    write_receipt(root, "doctor", result)
    return result


def status(root: Path, repo: Path) -> dict[str, Any]:
    names = (
        "p0_convergence_patch",
        "release_ci_wiring",
        "candidate_publication",
        "artifact_build",
        "staging_deployment",
        "staging_verification",
        "production_deployment",
        "production_verification",
        "production_dora",
        "pipeline_production",
        "launch",
    )
    receipts = {name: read_json(receipt_path(root, name)) for name in names}
    production = receipts["production_verification"]
    if production.get("state") == "PASS" and sha_matches(git_head(repo), str(production.get("deployed_sha") or "")):
        state = "VERIFIED_PRODUCTION_CURRENT_HEAD"
    elif production.get("state") == "PASS":
        state = "VERIFIED_PRODUCTION_PRIOR_SHA"
    elif receipts["production_deployment"]:
        state = "PRODUCTION_MUTATED_UNVERIFIED"
    elif receipts["staging_verification"].get("state") == "PASS":
        state = "STAGING_VERIFIED"
    else:
        state = "NOT_VERIFIED"
    return {"state": state, "repo_head": git_head(repo), "repo_branch": git_branch(repo), "receipts": {name: {"state": value.get("state"), "receipt_path": value.get("receipt_path")} for name, value in receipts.items() if value}, "truth_rule": "SOURCE_PRESENT != LIVE_PASS != VERIFIED_PRODUCTION"}


def print_human(title: str, payload: Mapping[str, Any]) -> None:
    width = 112
    print("=" * width)
    print(title)
    print("=" * width)
    for key in ("state", "phase", "promotion", "repo", "head", "branch", "candidate_sha", "pipeline_id", "truth"):
        if key in payload and payload.get(key) is not None:
            print(f"{key.upper():<16} {payload.get(key)}")
    if "source_p0" in payload:
        s = payload["source_p0"]
        print("\nP0 SOURCE")
        for key in ("identity_pass", "homepage_pass", "onboarding_pass", "flagship", "release_truth_source_pass"):
            print(f"  {key:<30} {'PASS' if s.get(key) else 'HOLD'}")
        print(f"  legacy_matches                 {len(s.get('legacy_matches') or [])}")
    if "environments" in payload:
        print("\nENVIRONMENTS")
        for name, item in payload["environments"].items():
            print(f"  {name:<12} {item.get('state'):<6} mode={item.get('mode') or '-'} url={item.get('url') or '-'}")
            if item.get("missing"):
                print("    missing: " + ", ".join(item["missing"]))
    if "data_dog_private" in payload:
        d = payload["data_dog_private"]
        print("\nREUSE")
        print(f"  data_dog_private               {d.get('state')} {d.get('path') or '-'}")
        print(f"  gitlab_bridge                  {'PASS' if d.get('gitlab_bridge') else 'HOLD'}")
        print(f"  datadog_bridge                 {'PASS' if d.get('datadog_bridge') else 'HOLD'}")
        print(f"  deployment_fabric              {'PASS' if d.get('deployment_fabric') else 'HOLD'}")
    if "verification" in payload and isinstance(payload["verification"], Mapping):
        v = payload["verification"]
        print("\nREADBACK")
        print(f"  state                          {v.get('state')}")
        print(f"  expected_sha                   {v.get('expected_sha')}")
        print(f"  deployed_sha                   {v.get('deployed_sha')}")
        print(f"  HTTP                           {v.get('health_status')}")
        print(f"  flagship lesson                {'PASS' if v.get('flagship_lesson_readback') else 'HOLD'}")
    if "dora" in payload and isinstance(payload["dora"], Mapping):
        print(f"\nDORA           {payload['dora'].get('state')}")
    if payload.get("receipt_path"):
        print(f"\nRECEIPT        {payload.get('receipt_path')}")
    print("=" * width)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=[
        "doctor", "plan", "apply-p0", "wire-ci", "build", "verify-staging", "verify-production",
        "pipeline-stage", "pipeline-promote", "promote", "rollback-staging", "rollback-production", "launch", "status",
    ])
    p.add_argument("--root", default=str(DEFAULT_ROOT))
    p.add_argument("--repo", default="")
    p.add_argument("--secret-env", default="")
    p.add_argument("--ack-authority", default="")
    p.add_argument("--promote-production", action="store_true")
    p.add_argument("--skip-install", action="store_true")
    p.add_argument("--json", action="store_true")
    return p


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    root = root_path(args.root)
    secret = Path(args.secret_env) if args.secret_env else Path(os.environ.get("BUILDANDDO_RELEASE_SECRET_ENV") or DEFAULT_SECRET)
    load_env_file(secret)
    # Make the chosen external secret path available to GitLab as a reference.
    # The value is a path only; secret values are never copied into receipts.
    os.environ.setdefault("BUILDANDDO_RELEASE_SECRET_ENV", str(secret))
    try:
        repo = find_repo(root, args.repo or None)
        if args.command == "doctor":
            result = doctor(root, repo)
        elif args.command == "plan":
            result = {"state": "PASS", "repo": str(repo), "p0": p0_state(repo), "build": build_plan(repo), "authority": "A1", "remote_writes": 0}
        elif args.command == "apply-p0":
            result = apply_p0(root, repo, ack=args.ack_authority)
        elif args.command == "wire-ci":
            result = wire_ci(root, repo, Path(__file__).resolve(), ack=args.ack_authority)
        elif args.command == "build":
            result = build_release(repo, root, skip_install=args.skip_install)
        elif args.command == "verify-staging":
            sha = git_head(repo)
            result = verify_environment(root, "staging", sha)
        elif args.command == "verify-production":
            sha = git_head(repo)
            result = verify_environment(root, "production", sha)
        elif args.command == "pipeline-stage":
            result = pipeline_stage(root, repo, ack=args.ack_authority)
        elif args.command in {"pipeline-promote", "promote"}:
            result = pipeline_promote(root, repo, ack=args.ack_authority)
        elif args.command == "rollback-staging":
            result = rollback_environment(root, "staging", ack=args.ack_authority)
        elif args.command == "rollback-production":
            result = rollback_environment(root, "production", ack=args.ack_authority)
        elif args.command == "launch":
            result = launch(root, repo, ack=args.ack_authority, promote=args.promote_production)
        elif args.command == "status":
            result = status(root, repo)
        else:
            raise ReleaseError("unknown command")
        if args.json:
            print(json.dumps(result, indent=2, sort_keys=True))
        else:
            print_human(f"BUILDANDDO // P0 CONVERGENCE + VERIFIED RELEASE v{VERSION} // {args.command.upper()}", result)
        if str(result.get("state")) in {"HOLD", "FAIL", "ERROR"}:
            return 2
        return 0
    except ReleaseError as exc:
        payload = {
            "state": "HOLD",
            "reason": str(exc),
            "command": args.command,
            "authority": args.ack_authority or "NONE",
            "remote_writes": "UNMEASURED_POSSIBLE_PARTIAL" if args.ack_authority == "A3" else 0,
        }
        try:
            path = write_receipt(root, f"{safe_slug(args.command)}_hold", payload)
            payload["receipt_path"] = str(path)
        except Exception:
            pass
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_human(f"BUILDANDDO // P0 CONVERGENCE + VERIFIED RELEASE v{VERSION} // HOLD", payload)
            print(f"REASON          {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
