#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/verify_public_boundary.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-GITLAB-ONLY-CI-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .buildanddo/public/path-policy.json
# EnumType:    Service
# EnumEdges:   CONSUMES .buildanddo/public/path-policy.json; GATES .gitlab/ci/day21-submission.yml; GATES .gitlab/ci/github-plane.yml;
#              GATES apps/pocketbase/pb_migrations/data/*.json
# Intent:      Enforce the public boundary and one review actor on the executing CI provider without accepting missing or foreign review metadata,
#              and keep knowledge-check answer keys and private lesson key files out of the tracked tree.
# ───────────────────────────────────────────────────────────────

"""Check tracked public files and review attribution without contacting providers."""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
from pathlib import Path
from typing import cast

# GitLab branch holding public main; see scripts/ci/gitlab_plane.py MAIN_MIRROR.
PUBLIC_MAIN_MIRROR = "buildanddo-source"

# Knowledge checks keep their question and choices in public. The answer and explanation
# live only in the private key file PocketBase reads at runtime, whose schema marker is
# below (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001). These apply when the policy omits them.
CURRICULUM_DATA_GLOBS = ("apps/pocketbase/pb_migrations/data/*.json",)
PRIVATE_KEY_SCHEMA = "buildanddo.lesson-keys/1"
KEY_MEMBERS = ("answer", "explanation")
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github_pat", re.compile(r"\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b")),
    ("gitlab_pat", re.compile(r"\bglpat-[A-Za-z0-9_-]{12,}\b")),
    ("provider_sk", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
]


class BoundaryError(ValueError):
    """Reject incomplete review evidence without disclosing its contents."""


def object_value(value: object) -> dict[str, object]:
    """Require a review object before inspecting its fields."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise BoundaryError("Review metadata must contain objects with named fields.")
    return cast(dict[str, object], value)


def string_list(value: object) -> list[str]:
    """Require a list of literal strings for policy entries."""
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise BoundaryError("Expected a list of strings in the boundary policy.")
    return cast(list[str], value)


def review_actor(
    root: Path, allowed: set[str], github_event: Path | None, gitlab_ci: bool
) -> dict[str, object] | None:
    """Bind one actor label to GitLab review context or the exact GitHub candidate."""
    source = os.environ.get("CI_PIPELINE_SOURCE", "")
    if (
        gitlab_ci
        and github_event is None
        and os.environ.get("BUILDANDDO_GITHUB_PR_EVENT")
    ):
        github_event = Path(os.environ["BUILDANDDO_GITHUB_PR_EVENT"])
    if gitlab_ci and source == "merge_request_event":
        if github_event is not None:
            raise BoundaryError(
                "A GitHub export cannot replace GitLab merge-request metadata."
            )
        number = os.environ.get("CI_MERGE_REQUEST_IID", "")
        if not re.fullmatch(r"[1-9][0-9]*", number):
            raise BoundaryError("GitLab merge-request identity is missing or invalid.")
        labels = {
            label.strip()
            for label in os.environ.get("CI_MERGE_REQUEST_LABELS", "").split(",")
            if label.strip()
        }
        provider = "gitlab"
    elif github_event is not None:
        if not github_event.is_absolute():
            github_event = root / github_event
        if github_event.is_symlink() or not github_event.is_file():
            raise BoundaryError(
                "The requested GitHub review export is missing or unsafe."
            )
        document = object_value(json.loads(github_event.read_text()))
        review = object_value(document.get("pull_request"))
        head = object_value(review.get("head"))
        base = object_value(review.get("base"))
        repository = object_value(base.get("repo"))
        if repository.get("full_name") != "mrnobodytx/buildanddo":
            raise BoundaryError("The review belongs to another repository.")
        number_value = review.get("number")
        if type(number_value) is not int or number_value < 1:
            raise BoundaryError("The review number is missing or invalid.")
        number = str(number_value)
        expected_number = (
            os.environ.get("CI_EXTERNAL_PULL_REQUEST_IID", "") if gitlab_ci else ""
        )
        if (
            gitlab_ci
            and source == "external_pull_request_event"
            and not re.fullmatch(r"[1-9][0-9]*", expected_number)
        ):
            raise BoundaryError(
                "GitLab external pull-request identity is missing or invalid."
            )
        if expected_number and expected_number != number:
            raise BoundaryError(
                "The exported review differs from this GitLab external pull request."
            )
        revision = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True, timeout=10
        ).strip()
        if not re.fullmatch(r"[a-f0-9]{40}", revision) or head.get("sha") != revision:
            raise BoundaryError(
                "The review export does not identify the exact checked-out candidate."
            )
        label_data = review.get("labels")
        if not isinstance(label_data, list):
            raise BoundaryError("The review labels are missing or invalid.")
        labels = set()
        for item in label_data:
            name = object_value(item).get("name")
            if not isinstance(name, str):
                raise BoundaryError("A review label has no valid name.")
            labels.add(name)
        provider = "github"
    elif gitlab_ci:
        if source == "external_pull_request_event" or os.environ.get(
            "CI_EXTERNAL_PULL_REQUEST_IID"
        ):
            raise BoundaryError(
                "GitLab external pull requests require a candidate-bound BUILDANDDO_GITHUB_PR_EVENT export."
            )
        branch = os.environ.get("CI_COMMIT_BRANCH", "")
        # The public-main mirror is written only by intake, from GitHub main, so like
        # the default branch it has no review of its own (SRS-BUILDANDDO-GITLAB-ONLY-CI-001).
        if branch and branch in {os.environ.get("CI_DEFAULT_BRANCH"), PUBLIC_MAIN_MIRROR}:
            return {
                "provider": "gitlab",
                "status": "NOT_APPLICABLE",
                "actor_label": None,
                "reason": "Default-branch execution has no review context; it does not attest an actor label.",
            }
        raise BoundaryError(
            "Candidate pipelines require GitLab merge-request metadata or a candidate-bound GitHub review export."
        )
    else:
        return None
    found = sorted(labels & allowed)
    return {
        "provider": provider,
        "review_number": number,
        "labels": sorted(labels),
        "actor_label": found[0] if len(found) == 1 else None,
        "status": "PASS" if len(found) == 1 else "FAIL",
        "found": found,
    }


def _unique_members(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Refuse a repeated member name, which could hide a key behind a later duplicate."""
    result: dict[str, object] = {}
    for name, value in pairs:
        if name in result:
            raise ValueError("A JSON object repeats a member name.")
        result[name] = value
    return result


def _no_constant(_name: str) -> object:
    raise ValueError("JSON holds NaN or Infinity.")


def printable_slug(value: object) -> str | None:
    """The lesson slug when it is one; never echo other text from a data file."""
    if value is None:
        return None
    if isinstance(value, str) and len(value) <= 80 and SLUG.fullmatch(value):
        return value
    return "<invalid slug>"


def curriculum_key_failures(root: Path, rel: str) -> list[dict[str, object]]:
    """Name each knowledge check in a tracked curriculum file that still carries a key.

    A check is any object with a ``choices`` member, or the value of a ``check``
    member. Failures carry the path and the nearest lesson slug, never a value.
    A file that cannot be read or parsed strictly fails closed.
    """
    path = root / rel
    if path.is_symlink() or not path.is_file():
        return [{"type": "curriculum_answer_key", "path": rel, "slug": None, "reason": "unreadable"}]
    try:
        document = json.loads(
            path.read_bytes().decode("utf-8"),
            object_pairs_hook=_unique_members,
            parse_constant=_no_constant,
        )
    except OSError:
        return [{"type": "curriculum_answer_key", "path": rel, "slug": None, "reason": "unreadable"}]
    except (UnicodeDecodeError, ValueError, RecursionError):
        return [{"type": "curriculum_answer_key", "path": rel, "slug": None, "reason": "unparseable"}]
    failures: list[dict[str, object]] = []
    # Iterative walk in document order: (value, member name holding it, nearest slug).
    stack: list[tuple[object, str | None, object]] = [(document, None, None)]
    while stack:
        value, member, slug = stack.pop()
        if isinstance(value, dict):
            if "slug" in value:
                slug = value["slug"]
            if any(name in value for name in KEY_MEMBERS) and (
                "choices" in value or member == "check"
            ):
                failures.append(
                    {"type": "curriculum_answer_key", "path": rel, "slug": printable_slug(slug)}
                )
            stack.extend((item, name, slug) for name, item in reversed(list(value.items())))
        elif isinstance(value, list):
            stack.extend((item, None, slug) for item in reversed(value))
    return failures


class _Members(dict):
    """A parsed JSON object that also keeps every member, repeated names included."""

    pairs: list[tuple[str, object]]


def _members(pairs: list[tuple[str, object]]) -> _Members:
    result = _Members(pairs)
    result.pairs = pairs
    return result


def is_private_key_file(path: Path, schema: str) -> bool:
    """A tracked JSON document marked with the key schema and not labelled ``synthetic: true``.

    Parsing is lenient so that a file any JSON reader accepts is covered: a byte
    order mark, invalid UTF-8 and repeated member names do not hide it. A repeated
    ``schema_version`` counts if any copy carries the marker, and every
    ``synthetic`` copy must be ``true``. A symbolic link publishes no content.
    """
    if path.is_symlink() or not path.is_file():
        return False
    try:
        document = json.loads(
            path.read_bytes().decode("utf-8-sig", errors="replace"),
            object_pairs_hook=_members,
        )
    except (OSError, ValueError, RecursionError):
        return False
    if not isinstance(document, _Members):
        return False
    schemas = [value for name, value in document.pairs if name == "schema_version"]
    synthetic = [value for name, value in document.pairs if name == "synthetic"]
    marked = any(isinstance(value, str) and value == schema for value in schemas)
    return marked and not (synthetic and all(value is True for value in synthetic))


def git_files(root: Path) -> list[str]:
    p = subprocess.run(
        ["git", "-C", str(root), "ls-files"], text=True, capture_output=True
    )
    if p.returncode != 0:
        raise SystemExit(p.stderr.strip() or "git ls-files failed")
    return [x.replace("\\", "/") for x in p.stdout.splitlines() if x.strip()]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--policy", default=".buildanddo/public/path-policy.json")
    ap.add_argument("--github-event", type=Path)
    ap.add_argument(
        "--gitlab-ci",
        action="store_true",
        help="require review attribution from GitLab CI metadata or a bound GitHub export",
    )
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    policy = object_value(json.loads((root / args.policy).read_text(encoding="utf-8")))
    files = git_files(root)
    failures: list[dict[str, object]] = []

    forbidden = tuple(string_list(policy.get("public_forbidden_prefixes", [])))
    bad_names = set(string_list(policy.get("forbidden_file_names", [])))
    for rel in files:
        low = rel.lower()
        if any(
            low == p.rstrip("/").lower() or low.startswith(p.lower()) for p in forbidden
        ):
            failures.append({"type": "forbidden_path", "path": rel})
        if Path(rel).name in bad_names:
            failures.append({"type": "forbidden_filename", "path": rel})

    text_ext = {
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs",
        ".json",
        ".md",
        ".txt",
        ".yml",
        ".yaml",
        ".toml",
        ".ini",
        ".env",
        ".py",
        ".sh",
        ".ps1",
        ".html",
        ".css",
    }
    for rel in files:
        p = root / rel
        if (
            not p.is_file()
            or p.stat().st_size > 2_000_000
            or p.suffix.lower() not in text_ext
        ):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for fid, rx in SECRET_PATTERNS:
            if rx.search(text):
                failures.append(
                    {"type": "secret_like_literal", "finding_id": fid, "path": rel}
                )

    # Answer keys belong to the private key file only: report path and slug, never a value.
    curriculum_globs = [
        pattern.lower()
        for pattern in string_list(
            policy.get("curriculum_data_globs", list(CURRICULUM_DATA_GLOBS))
        )
    ]
    key_schema = policy.get("private_key_schema", PRIVATE_KEY_SCHEMA)
    if not isinstance(key_schema, str) or not key_schema:
        raise BoundaryError("The boundary policy names no private key schema.")
    for rel in files:
        low = rel.lower()
        if any(fnmatch.fnmatchcase(low, pattern) for pattern in curriculum_globs):
            failures.extend(curriculum_key_failures(root, rel))
        if low.endswith(".json") and is_private_key_file(root / rel, key_schema):
            failures.append({"type": "private_lesson_keys", "path": rel})

    actor = None
    try:
        actor = review_actor(
            root,
            set(string_list(policy.get("actor_labels", []))),
            args.github_event,
            args.gitlab_ci,
        )
        if actor is not None and actor["status"] == "FAIL":
            failures.append(
                {
                    "type": "actor_label",
                    "message": "Exactly one actor:human / actor:agent / actor:mixed label is required.",
                    "found": actor["found"],
                }
            )
    except BoundaryError as error:
        failures.append({"type": "actor_evidence", "message": str(error)})
    except (OSError, ValueError, subprocess.SubprocessError):
        failures.append(
            {
                "type": "actor_evidence",
                "message": "The requested review metadata could not be read or validated.",
            }
        )

    report = {
        "state": "FAIL" if failures else "PASS",
        "files_checked": len(files),
        "failures": failures,
        "actor": actor,
    }
    out = root / ".buildanddo/public/boundary-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
