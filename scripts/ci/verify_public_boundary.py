#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/verify_public_boundary.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .buildanddo/public/path-policy.json
# EnumType:    Service
# EnumEdges:   CONSUMES .buildanddo/public/path-policy.json; GATES .gitlab/ci/day21-submission.yml; GATES .github/workflows/pr-governance.yml
# Intent:      Enforce the public boundary and one review actor on the executing CI provider without accepting missing or foreign review metadata.
# ───────────────────────────────────────────────────────────────

"""Check tracked public files and review attribution without contacting providers."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from typing import cast

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
        if branch and branch == os.environ.get("CI_DEFAULT_BRANCH"):
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
