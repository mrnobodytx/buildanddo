#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, re, subprocess, sys
from pathlib import Path

# This tree mirrors to a PUBLIC GitHub repo, so a shape this table does not know is a
# credential published to the world. The four original entries cover private keys and
# the two PAT families that matter most here; the eight below widen it to the shapes a
# JS/Python product repo most plausibly grows next.
#
# Widening a secret table normally trades leak coverage for false positives on test
# fixtures. It does not here, and that is MEASURED rather than hoped: all eight return
# zero hits across the 490 tracked files. That holds because the convention for a
# secret-shaped fixture in this repo is to SPLIT the literal, as in
# 'sk-' + 'live-NEVER-RENDER-ME', so nothing is contiguous at rest. The split
# convention scales with this table; an allowlist would not, because an allowlisted
# file accepts a REAL credential later and says nothing.
#
# Each entry is asserted in BOTH directions by selftest(): it must catch its own shape,
# and it must not fire on benign repo strings such as "mask-user-input" or "task-based".
# A pattern that matches nothing passes every leak scan silently, which is precisely the
# failure this table exists to prevent.
SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github_pat", re.compile(r"\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b")),
    ("gitlab_pat", re.compile(r"\bglpat-[A-Za-z0-9_-]{12,}\b")),
    ("provider_sk", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
    ("openai_project", re.compile(r"\bsk-proj-[A-Za-z0-9_-]{16,}\b")),
    ("aws_access_key_id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("slack_token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    # Stripe's real webhook shape is whsec_ with an UNDERSCORE. The fixture in
    # missionChain.test.js spells it whsec- with a hyphen, so it was never actually
    # Stripe-shaped and this entry would not have caught it either way. It is split
    # anyway, for the convention rather than for this pattern.
    ("stripe_webhook", re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b")),
    ("stripe_live", re.compile(r"\b[sr]k_live_[A-Za-z0-9]{16,}\b")),
    ("npm_token", re.compile(r"\bnpm_[A-Za-z0-9]{36}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
]

# (shape it must catch, benign string it must NOT catch) per pattern id.
#
# Every probe is ASSEMBLED, never written contiguously. The first draft spelled the
# private-key header and the provider-key fixture out in full, and the widened gate
# failed on this very file. The second draft fixed the probes but explained the mistake
# by quoting both literals in a comment - and failed again, on the comment. That is the
# gate working twice, and the rule it teaches is stronger than "split your fixtures":
# a scanner does not read intent, so PROSE ABOUT a secret shape is a secret shape.
# Describe them; never transcribe them.
SECRET_PATTERN_PROBES = {
    "private_key": ("-----" + "BEGIN PRIVATE KEY" + "-----", "BEGIN PRIVATELY"),
    "github_pat": ("ghp_" + "A" * 24, "ghp_short"),
    "gitlab_pat": ("glpat-" + "A" * 20, "glpat-x"),
    "provider_sk": ("sk-" + "A" * 20, "sk-" + "live-NEV"),
    "openai_project": ("sk-proj-" + "A" * 20, "sk-proj-x"),
    "aws_access_key_id": ("AKIA" + "IOSFODNN7EXAMPLE", "AKIAshort"),
    "slack_token": ("xoxb-" + "1234567890-abcdef", "xoxb-x"),
    "google_api_key": ("AIza" + "S" * 35, "AIzaShort"),
    "stripe_webhook": ("whsec_" + "a" * 24, "whsec-NEVER-RENDER-ME"),
    "stripe_live": ("sk_live_" + "b" * 24, "sk_live_x"),
    "npm_token": ("npm_" + "d" * 36, "npm_install"),
    "jwt": ("eyJ" + "a" * 12 + "." + "b" * 12 + "." + "c" * 12, "eyJust-a-word"),
}


def selftest() -> int:
    """Prove every pattern discriminates, in both directions.

    A leak scanner reports 'clean' both when a tree is clean and when its patterns are
    broken, and the two are indistinguishable from the outside. Without this, adding a
    pattern that silently matches nothing would look exactly like adding a working one.
    """
    failures = []
    ids = {fid for fid, _ in SECRET_PATTERNS}
    missing = ids - set(SECRET_PATTERN_PROBES)
    if missing:
        failures.append("pattern(s) with no probe: %s" % ", ".join(sorted(missing)))
    for fid, rx in SECRET_PATTERNS:
        probe = SECRET_PATTERN_PROBES.get(fid)
        if not probe:
            continue
        catches, benign = probe
        if not rx.search(catches):
            failures.append("%s does not catch its own shape" % fid)
        if rx.search(benign):
            failures.append("%s fires on a benign string (%s)" % (fid, benign))
    print(json.dumps({"selftest": "verify_public_boundary", "patterns": len(SECRET_PATTERNS),
                      "failures": failures, "ok": not failures}, indent=2))
    return 0 if not failures else 1

def git_files(root: Path) -> list[str]:
    p = subprocess.run(["git","-C",str(root),"ls-files"], text=True, capture_output=True)
    if p.returncode != 0:
        raise SystemExit(p.stderr.strip() or "git ls-files failed")
    return [x.replace("\\","/") for x in p.stdout.splitlines() if x.strip()]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--selftest", action="store_true",
                    help="prove every secret pattern catches its own shape and no benign one")
    ap.add_argument("--policy", default=".buildanddo/public/path-policy.json")
    ap.add_argument("--github-event")
    args = ap.parse_args()
    if args.selftest:
        return selftest()

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
    out = root/".buildanddo/public/boundary-report.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
