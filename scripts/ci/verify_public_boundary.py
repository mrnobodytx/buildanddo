#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, re, subprocess, sys
from pathlib import Path

SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github_pat", re.compile(r"\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b")),
    ("gitlab_pat", re.compile(r"\bglpat-[A-Za-z0-9_-]{12,}\b")),
    ("provider_sk", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
]

def git_files(root: Path) -> list[str]:
    p = subprocess.run(["git","-C",str(root),"ls-files"], text=True, capture_output=True)
    if p.returncode != 0:
        raise SystemExit(p.stderr.strip() or "git ls-files failed")
    return [x.replace("\\","/") for x in p.stdout.splitlines() if x.strip()]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--policy", default=".citadel/public/path-policy.json")
    ap.add_argument("--github-event")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    policy = json.loads((root/args.policy).read_text(encoding="utf-8"))
    files = git_files(root)
    failures = []

    forbidden = tuple(policy.get("public_forbidden_prefixes", []))
    bad_names = set(policy.get("forbidden_file_names", []))
    for rel in files:
        low = rel.lower()
        if any(low == p.rstrip("/").lower() or low.startswith(p.lower()) for p in forbidden):
            failures.append({"type":"forbidden_path","path":rel})
        if Path(rel).name in bad_names:
            failures.append({"type":"forbidden_filename","path":rel})

    text_ext = {".js",".jsx",".ts",".tsx",".mjs",".cjs",".json",".md",".txt",".yml",".yaml",".toml",".ini",".env",".py",".sh",".ps1",".html",".css"}
    for rel in files:
        p = root/rel
        if not p.is_file() or p.stat().st_size > 2_000_000 or p.suffix.lower() not in text_ext:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for fid, rx in SECRET_PATTERNS:
            if rx.search(text):
                failures.append({"type":"secret_like_literal","finding_id":fid,"path":rel})

    actor = None
    if args.github_event and Path(args.github_event).is_file():
        event = json.loads(Path(args.github_event).read_text(encoding="utf-8"))
        pr = event.get("pull_request") or {}
        labels = {x.get("name") for x in pr.get("labels",[]) if isinstance(x,dict)}
        required = set(policy.get("actor_labels",[]))
        found = sorted(labels & required)
        if pr and len(found) != 1:
            failures.append({"type":"actor_label","message":"exactly one actor:human / actor:agent / actor:mixed label is required","found":found})
        actor = {
            "github_actor": os.environ.get("GITHUB_ACTOR"),
            "labels": sorted(x for x in labels if x),
            "actor_label": found[0] if len(found)==1 else None,
        }

    report = {"state":"FAIL" if failures else "PASS","files_checked":len(files),"failures":failures,"actor":actor}
    out = root/".citadel/public/boundary-report.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
