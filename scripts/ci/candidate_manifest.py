#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-TENANT-RAIL-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/candidate_manifest.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TENANT-RAIL-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Updated:     2026-09-11 (release lane v2: executor / github_readback / lane_version, additive)
# Depends:     git (tracked file list + HEAD), GITHUB_* env names, CITADEL_* env names
# EnumType:    Service
# EnumEdges:   PRODUCES BUILDANDDO_CANDIDATE_PROVENANCE.json;
#              DRIVEN_BY tools/citadel_tenant_rail.py (mirror step, detached worktree)
# Intent:      Stamp a candidate's provenance (which upstream sha, which executor read it
#              back, every tracked file's hash) into the intake commit. Candidate only:
#              this file never grants production authority.
# ───────────────────────────────────────────────────────────────
"""Write BUILDANDDO_CANDIDATE_PROVENANCE.json for the current checkout.

Additive v2 fields (2026-09-11), all read from environment NAMES, never from
network calls:
  executor         CITADEL_EXECUTOR, else "github-actions" when GITHUB_ACTIONS is set,
                   else "local".
  github_readback  {"sha": CITADEL_GITHUB_READBACK_SHA, "observed_at":
                   CITADEL_GITHUB_READBACK_AT} - what the executor read back from the
                   public control plane before stamping; both null when unset.
  lane_version     CITADEL_LANE_VERSION or null.
authority stays "candidate_only" and production_authority stays False; the file
hashing and every existing key are unchanged.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, subprocess
from pathlib import Path

def sha_file(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""):
            h.update(b)
    return h.hexdigest()

def git(root: Path,*args: str) -> str:
    p=subprocess.run(["git","-C",str(root),*args],text=True,capture_output=True,check=True)
    return p.stdout.strip()

def _env(name: str) -> str | None:
    value=os.environ.get(name,"").strip()
    return value or None

def executor_name() -> str:
    return _env("CITADEL_EXECUTOR") or ("github-actions" if _env("GITHUB_ACTIONS") else "local")

def github_readback() -> dict:
    return {"sha":_env("CITADEL_GITHUB_READBACK_SHA"),"observed_at":_env("CITADEL_GITHUB_READBACK_AT")}

def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument("--root",default=".")
    ap.add_argument("--output",default="BUILDANDDO_CANDIDATE_PROVENANCE.json")
    args=ap.parse_args()
    root=Path(args.root).resolve()
    sha=git(root,"rev-parse","HEAD")
    tracked=git(root,"ls-files").splitlines()
    files=[]
    for rel in tracked:
        p=root/rel
        if p.is_file():
            files.append({"path":rel.replace("\\","/"),"sha256":sha_file(p),"bytes":p.stat().st_size})
    manifest={
        "schema_version":1,
        "generated_at":dt.datetime.now(dt.timezone.utc).isoformat(),
        "upstream":"github",
        "upstream_repository":os.environ.get("GITHUB_REPOSITORY"),
        "upstream_sha":os.environ.get("GITHUB_SHA") or sha,
        "mirror_commit_before_provenance":sha,
        "github_actor":os.environ.get("GITHUB_ACTOR"),
        "github_actor_id":os.environ.get("GITHUB_ACTOR_ID"),
        "github_run_id":os.environ.get("GITHUB_RUN_ID"),
        "github_run_attempt":os.environ.get("GITHUB_RUN_ATTEMPT"),
        "github_ref":os.environ.get("GITHUB_REF"),
        "authority":"candidate_only",
        "production_authority":False,
        "executor":executor_name(),
        "github_readback":github_readback(),
        "lane_version":_env("CITADEL_LANE_VERSION"),
        "tracked_files":files,
    }
    body=json.dumps(manifest,sort_keys=True,separators=(",",":")).encode()
    manifest["manifest_sha256"]=hashlib.sha256(body).hexdigest()
    (root/args.output).write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps({"state":"PASS","upstream_sha":manifest["upstream_sha"],"executor":manifest["executor"],"files":len(files),"manifest_sha256":manifest["manifest_sha256"]},indent=2))
    return 0
if __name__=="__main__":
    raise SystemExit(main())
