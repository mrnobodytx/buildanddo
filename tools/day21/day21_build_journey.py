#!/usr/bin/env python3
# # --- CGRF Header ------------------------------------------------
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Compile the BuildAndDo challenge-period Git history into evidence artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

START = "2026-09-03T00:00:00Z"
END = "2026-09-25T00:00:00Z"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout


def compile_journey(repo: Path, output: Path) -> dict[str, object]:
    raw = git(repo, "log", f"--since={START}", f"--until={END}", "--reverse", "--format=%H%x1f%aI%x1f%an%x1f%s")
    commits = []
    authors: Counter[str] = Counter()
    active_days: set[str] = set()
    for line in raw.splitlines():
        if not line.strip():
            continue
        parts = line.split("\x1f", 3)
        if len(parts) != 4:
            raise RuntimeError("unexpected git log record")
        commit = {"sha": parts[0], "authored_at": parts[1], "author": parts[2], "subject": parts[3]}
        commits.append(commit)
        authors[parts[2]] += 1
        active_days.add(parts[1][:10])
    if not commits:
        raise RuntimeError("no challenge-period commits found")

    paths_raw = git(repo, "log", f"--since={START}", f"--until={END}", "--name-only", "--format=")
    paths = Counter(line.strip() for line in paths_raw.splitlines() if line.strip())
    observed_at = datetime.now(timezone.utc).isoformat()
    data = {
        "schema": "buildanddo.day21-git-journey/v1",
        "window": {"start": START, "end_exclusive": END},
        "observed_at": observed_at,
        "head_sha": git(repo, "rev-parse", "HEAD").strip(),
        "commit_count": len(commits),
        "active_days": len(active_days),
        "first_commit": commits[0],
        "last_commit": commits[-1],
        "authors": [{"name": name, "commits": count} for name, count in authors.most_common()],
        "most_changed_paths": [{"path": name, "touches": count} for name, count in paths.most_common(30)],
        "commits": commits,
        "epistemic_state": "OBSERVED_FROM_GIT",
        "note": "Git history proves repository chronology, not runtime deployment or product acceptance.",
    }
    output.mkdir(parents=True, exist_ok=True)
    data_path = output / "build-journey-data.json"
    data_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# BuildAndDo 21-day build journey",
        "",
        f"Observed from Git for `{START}` through `{END}` (end exclusive).",
        "",
        f"- Commits: **{len(commits)}**",
        f"- Active commit days: **{len(active_days)}**",
        f"- First challenge-period commit: `{commits[0]['sha'][:12]}` — {commits[0]['authored_at']} — {commits[0]['subject']}",
        f"- Current HEAD at capture: `{data['head_sha']}`",
        "",
        "## Contributors / commit identities",
        "",
    ]
    lines.extend(f"- {row['name']}: {row['commits']} commits" for row in data["authors"])
    lines += ["", "## Most-touched paths", ""]
    lines.extend(f"- `{row['path']}` — {row['touches']} commit touches" for row in data["most_changed_paths"][:20])
    lines += ["", "## Evidence boundary", "", "This is repository chronology only. Deployment, browser behavior, Hostinger-product use, and verified outcomes require their own receipts.", ""]
    md_path = output / "build-journey.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")
    wrapper = {
        "schema": "buildanddo.day21-build-journey/v1",
        "title": "BuildAndDo 21-day repository build journey",
        "evidence": [
            {"path": "artifacts/build-journey-data.json", "sha256": sha(data_path), "observed_at": observed_at},
            {"path": "artifacts/build-journey.md", "sha256": sha(md_path), "observed_at": observed_at},
        ],
    }
    return {"data": data, "wrapper": wrapper}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path.cwd())
    p.add_argument("--evidence", type=Path, default=Path("state/day21/evidence"))
    args = p.parse_args(argv)
    root = args.repo.resolve()
    evidence = args.evidence if args.evidence.is_absolute() else root / args.evidence
    try:
        artifact_dir = evidence / "artifacts"
        result = compile_journey(root, artifact_dir)
        (evidence / "build-journey.json").write_text(json.dumps(result["wrapper"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"PASS build journey: commits={result['data']['commit_count']} head={result['data']['head_sha']}")
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
