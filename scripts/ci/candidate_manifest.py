#!/usr/bin/env python3
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
        "tracked_files":files,
    }
    body=json.dumps(manifest,sort_keys=True,separators=(",",":")).encode()
    manifest["manifest_sha256"]=hashlib.sha256(body).hexdigest()
    (root/args.output).write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps({"state":"PASS","upstream_sha":manifest["upstream_sha"],"files":len(files),"manifest_sha256":manifest["manifest_sha256"]},indent=2))
    return 0
if __name__=="__main__":
    raise SystemExit(main())
