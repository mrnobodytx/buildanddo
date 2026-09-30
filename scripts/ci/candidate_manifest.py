#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/candidate_manifest.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/work_exchange.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/work.py; CONSUMES libs/evolution/work_exchange.py
# Intent:      Bind optional public work scope to the actual candidate without attributing checkout evidence to another revision.
# ───────────────────────────────────────────────────────────────
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def git(root: Path, *args: str) -> str:
    p = subprocess.run(
        ["git", "-C", str(root), *args], text=True, capture_output=True, check=True
    )
    return p.stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--output", default="BUILDANDDO_CANDIDATE_PROVENANCE.json")
    ap.add_argument("--repository", help="expected public owner/repository")
    ap.add_argument("--work", type=Path, help="explicit candidate-only work contract")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    sha = git(root, "rev-parse", "HEAD")
    if os.environ.get("GITHUB_SHA") and os.environ["GITHUB_SHA"] != sha:
        print("FAIL: CI candidate revision differs from the actual checkout")
        return 1
    repository = args.repository or os.environ.get("GITHUB_REPOSITORY")
    if (
        args.repository
        and os.environ.get("GITHUB_REPOSITORY")
        and args.repository != os.environ["GITHUB_REPOSITORY"]
    ):
        print("FAIL: CI repository differs from the selected repository")
        return 1
    work_binding = None
    if args.work:
        try:
            from libs.evolution.work import WorkContract
            from libs.evolution.work_exchange import candidate_paths, load_contract
            from libs.semantic_twin.contracts import ContractError

            if not repository:
                raise ContractError("work provenance needs an expected repository")
            work = load_contract(args.work, WorkContract)
            paths = candidate_paths(root, work, sha, repository)
            if git(root, "diff", "--name-only", "HEAD", "--"):
                raise ContractError(
                    "work provenance requires unchanged candidate source"
                )
            work_binding = {
                "schema": work.schema,
                "mission_id": work.mission_id,
                "scope_id": work.scope_id,
                "work_digest": work.digest,
                "base_revision": work.source.revision,
                "changed_paths": list(paths),
            }
        except (ValueError, ImportError) as exc:
            print(f"FAIL: {exc}")
            return 1
    tracked = git(root, "ls-files").splitlines()
    files = []
    for rel in tracked:
        p = root / rel
        if p.is_file():
            files.append(
                {
                    "path": rel.replace("\\", "/"),
                    "sha256": sha_file(p),
                    "bytes": p.stat().st_size,
                }
            )
    manifest = {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "upstream": "github",
        "upstream_repository": repository,
        "upstream_sha": sha,
        "mirror_commit_before_provenance": sha,
        "github_actor": os.environ.get("GITHUB_ACTOR"),
        "github_actor_id": os.environ.get("GITHUB_ACTOR_ID"),
        "github_run_id": os.environ.get("GITHUB_RUN_ID"),
        "github_run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "github_ref": os.environ.get("GITHUB_REF"),
        "authority": "candidate_only",
        "production_authority": False,
        "tracked_files": files,
    }
    if work_binding is not None:
        manifest["work_contract"] = work_binding
    body = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    manifest["manifest_sha256"] = hashlib.sha256(body).hexdigest()
    (root / args.output).write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "state": "PASS",
                "upstream_sha": manifest["upstream_sha"],
                "files": len(files),
                "manifest_sha256": manifest["manifest_sha256"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
