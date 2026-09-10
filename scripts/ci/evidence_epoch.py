#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/evidence_epoch.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-EPOCH-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/candidate_manifest.py, scripts/ci/verify_public_boundary.py,
#              scripts/ci/telemetry_snapshot.py, scripts/ci/epoch_chain.json
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/verify_public_boundary.py;
#              CONSUMES scripts/ci/candidate_manifest.py;
#              CONSUMES scripts/ci/telemetry_snapshot.py;
#              PRODUCES scripts/ci/epoch_chain.json;
#              PRODUCES state/epochs;
#              VERIFIED_BY scripts/ci/evidence_epoch.py --verify
# Intent:      Fingerprint one run's whole evidence set into a chained root a third
#              party can recompute, so retention expiry stops looking like tampering.
# ───────────────────────────────────────────────────────────────
"""Build one BuildAndDo evidence epoch: a chained Merkle root over a run's evidence.

    python scripts/ci/evidence_epoch.py --trigger merge
    python scripts/ci/evidence_epoch.py --verify state/epochs/latest.json
    python scripts/ci/evidence_epoch.py --dry-run --json

The problem this solves is narrow. Every pipeline run already produces a build
output, two provenance manifests, a lockfile and a boundary verdict, uploads
them as an artifact with a 14- or 30-day retention window, and then loses them.
Six months later nobody can show that the artifact set attributed to a commit is
the set that actually existed at merge time, because expiry and tampering both
look like absence. An epoch is the missing fingerprint: one digest over the
whole set, linked to the previous run's digest.

The epoch is evidence, never authority. Nothing in the pipeline gates on it, and
a publication failure never fails a build (SRS-BUILDANDDO-EPOCH-001, and the
same rule the rest of this directory follows: observability must not be able to
break the thing it observes).

HASH CONSTRUCTION (`sha256-merkle-v1`)

A root nobody else can recompute is not evidence, so the construction is fixed
and stated here rather than left implicit in the code:

  content digest   sha256 of the file's bytes, lowercase hex.
  leaf digest      sha256(b"buildanddo-leaf\\x00" + path + b"\\x00" + content_hex)
                   Paths use forward slashes. The domain-separating prefix and
                   the NUL delimiter stop a path/digest boundary from being
                   ambiguous, so no two different artifact lists can collide by
                   rearranging characters between the two fields.
  ordering         leaf digests sorted ascending as lowercase hex. Discovery
                   order is a property of the runner, not of the evidence, so it
                   must not reach the root.
  pairing          sha256(b"buildanddo-node\\x00" + left || right) over the raw
                   32-byte digests, left to right.
  odd node         carried to the next level unchanged. It is deliberately not
                   duplicated: duplicating the last node lets two different leaf
                   sets produce one root.
  empty set        sha256(b"buildanddo-empty"). An epoch over nothing still has
                   a defined root, and that root is not zero.

Two synthetic leaves are hashed alongside the files so the root binds more than
file contents:

  git://commit       digest over the canonical JSON of sha, branch, author,
                     committer and commit timestamp. Without it a root would say
                     nothing about which commit it belongs to.
  chain://previous   digest of the previous epoch's root, present only from the
                     second epoch onward. This is what makes the sequence a
                     chain rather than a pile: rewriting any earlier root
                     invalidates every root after it.

`created_at` is recorded in the manifest but is *not* an input to the root. A
fingerprint that changes when nothing changed proves nothing.

Standard library only, matching the rest of scripts/ci. Epochs are written to
`state/epochs/`, which is gitignored and boundary-forbidden; only the chain head
in `scripts/ci/epoch_chain.json` is committed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

SCHEMA = "buildanddo.public-anchor/v1"
CHAIN_SCHEMA = "buildanddo.epoch-chain/v1"
ROOT_ALGORITHM = "sha256-merkle-v1"

LEAF_PREFIX = b"buildanddo-leaf\x00"
NODE_PREFIX = b"buildanddo-node\x00"
EMPTY_TREE = hashlib.sha256(b"buildanddo-empty").hexdigest()

DEFAULT_EPOCH_DIR = "state/epochs"
DEFAULT_CHAIN = "scripts/ci/epoch_chain.json"
CHAIN_HISTORY_LIMIT = 50

# What an epoch covers. Directories contribute one leaf per file; single files
# contribute one leaf. Everything is optional: a source that is absent is
# recorded as absent rather than failing the run, because an epoch built from a
# partial evidence set is still worth more than no epoch, and the manifest says
# exactly which sources were present.
BUILD_OUTPUT = "dist/apps/web"
EVIDENCE_SOURCES: list[tuple[str, str, str]] = [
    # (kind, path, note)
    ("build_output", BUILD_OUTPUT, "web build output"),
    ("provenance", "BUILDANDDO_SOURCE_PROVENANCE.json", "import provenance"),
    ("provenance", "BUILDANDDO_CANDIDATE_PROVENANCE.json", "candidate provenance"),
    ("lockfile", "package-lock.json", "dependency lockfile"),
    ("boundary", ".buildanddo/public/boundary-report.json", "public boundary scan"),
    ("governance", ".bits/context.lock.json", "measured repository context"),
    ("telemetry", "reports/telemetry/snapshot.json", "CI telemetry snapshot"),
    ("telemetry", "reports/telemetry/delta.json", "CI telemetry delta"),
    ("tests", "reports/junit", "JUnit test results"),
    ("dora", "reports/dora/deployment.json", "DORA deployment record"),
]


# ── hashing ──────────────────────────────────────────────────────────────────

def sha256_file(path: Path) -> str:
    """Digest a file in chunks so a large bundle does not have to fit in memory."""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha256_json(payload: object) -> str:
    """Digest a canonical JSON encoding: sorted keys, no insignificant whitespace."""
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def leaf_digest(path: str, content_digest: str) -> str:
    h = hashlib.sha256()
    h.update(LEAF_PREFIX)
    h.update(path.encode("utf-8"))
    h.update(b"\x00")
    h.update(content_digest.encode("ascii"))
    return h.hexdigest()


def merkle_root(leaf_digests: list[str]) -> str:
    """Fold sorted leaf digests into one root. See the module docstring for the rules."""
    if not leaf_digests:
        return EMPTY_TREE
    level = [bytes.fromhex(d) for d in sorted(leaf_digests)]
    while len(level) > 1:
        nxt: list[bytes] = []
        for i in range(0, len(level) - 1, 2):
            nxt.append(hashlib.sha256(NODE_PREFIX + level[i] + level[i + 1]).digest())
        if len(level) % 2:
            nxt.append(level[-1])  # carried, never duplicated
        level = nxt
    return level[0].hex()


def root_of(artifacts: list[dict]) -> str:
    """Recompute a root from a manifest's artifact list alone.

    Verification deliberately needs only the manifest: the leaf digest is a
    function of `path` and `digest`, so a third party can check the tree without
    holding the artifacts, and check the artifacts separately when they do.
    """
    return merkle_root([leaf_digest(a["path"], a["digest"]) for a in artifacts])


# ── collection ───────────────────────────────────────────────────────────────

def git(root: Path, *args: str) -> str:
    try:
        p = subprocess.run(["git", "-C", str(root), *args], text=True,
                           capture_output=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return ""
    return p.stdout.strip() if p.returncode == 0 else ""


def git_facts(root: Path) -> dict:
    """Identity of the commit this epoch describes.

    GitHub Actions values win when present: on a `push` the checked-out ref is
    what `GITHUB_SHA` names, but on `workflow_run` the workspace can be a
    detached checkout whose symbolic branch name is useless.
    """
    sha = os.environ.get("GITHUB_SHA") or git(root, "rev-parse", "HEAD")
    branch = os.environ.get("GITHUB_REF_NAME") or git(root, "rev-parse", "--abbrev-ref", "HEAD")
    return {
        "sha": sha,
        "branch": branch,
        "author": git(root, "log", "-1", "--pretty=%an <%ae>"),
        "committer": git(root, "log", "-1", "--pretty=%cn <%ce>"),
        "subject": git(root, "log", "-1", "--pretty=%s"),
        "committed_at": git(root, "log", "-1", "--pretty=%cI"),
    }


def iter_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    if path.is_dir():
        return sorted(p for p in path.rglob("*") if p.is_file())
    return []


def collect_artifacts(root: Path, git_meta: dict, previous_root: str | None) -> tuple[list[dict], list[dict]]:
    """Hash every present evidence source into leaves; report what was missing."""
    artifacts: list[dict] = []
    sources: list[dict] = []

    for kind, rel, note in EVIDENCE_SOURCES:
        target = root / rel
        files = iter_files(target)
        for f in files:
            try:
                digest = sha256_file(f)
            except OSError as exc:
                print(f"WARN: cannot hash {rel}: {exc}", file=sys.stderr)
                continue
            artifacts.append({
                "path": f.relative_to(root).as_posix(),
                "digest": digest,
                "size": f.stat().st_size,
                "kind": kind,
            })
        sources.append({
            "kind": kind,
            "path": rel,
            "note": note,
            "present": bool(files),
            "files": len(files),
        })

    # Synthetic leaves. These are what make the root say something about *which*
    # commit and *which* predecessor, not merely about file bytes.
    artifacts.append({
        "path": "git://commit",
        "digest": sha256_json(git_meta),
        "size": 0,
        "kind": "git",
    })
    if previous_root:
        artifacts.append({
            "path": "chain://previous",
            "digest": previous_root,
            "size": 0,
            "kind": "chain",
        })

    artifacts.sort(key=lambda a: a["path"])
    return artifacts, sources


# ── chain ────────────────────────────────────────────────────────────────────

def read_chain(path: Path) -> dict:
    if not path.is_file():
        return {"schema": CHAIN_SCHEMA, "length": 0, "latest": None, "history": []}
    try:
        chain = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        # A corrupt chain head must not silently restart the chain: that would
        # erase the link it exists to prove.
        raise SystemExit(f"FAIL: {path} is present but unreadable ({exc}). "
                         "Restore it from git history rather than regenerating it.")
    chain.setdefault("history", [])
    chain.setdefault("length", len(chain["history"]))
    chain.setdefault("latest", chain["history"][-1] if chain["history"] else None)
    return chain


def next_epoch_id(chain: dict, day: str) -> str:
    """EPOCH-<YYYYMMDD>-<NN>, sequential within the day across the whole chain."""
    used = 0
    for entry in list(chain.get("history") or []) + ([chain["latest"]] if chain.get("latest") else []):
        eid = (entry or {}).get("epoch_id", "")
        parts = eid.split("-")
        if len(parts) == 3 and parts[1] == day:
            try:
                used = max(used, int(parts[2]))
            except ValueError:
                continue
    return f"EPOCH-{day}-{used + 1:02d}"


def append_chain(chain: dict, manifest: dict) -> dict:
    entry = {
        "epoch_id": manifest["epoch_id"],
        "root_digest": manifest["root_digest"],
        "previous_root": manifest["previous_root"],
        "git_sha": manifest["git_sha"],
        "trigger": manifest["trigger"],
        "artifact_count": manifest["artifact_count"],
        "created_at": manifest["created_at"],
    }
    history = [h for h in (chain.get("history") or []) if h.get("epoch_id") != entry["epoch_id"]]
    history.append(entry)
    return {
        "schema": CHAIN_SCHEMA,
        "root_algorithm": ROOT_ALGORITHM,
        "updated_at": manifest["created_at"],
        "length": chain.get("length", 0) + 1,
        "latest": entry,
        # Bounded on purpose: the committed head only has to carry the recent
        # window, because every earlier entry is recoverable from git history of
        # this file. An unbounded list would grow into a merge-conflict magnet.
        "history": history[-CHAIN_HISTORY_LIMIT:],
        "history_note": (
            f"last {CHAIN_HISTORY_LIMIT} epochs; earlier entries are in this file's git history"
        ),
    }


# ── manifest ─────────────────────────────────────────────────────────────────

def build_manifest(root: Path, trigger: str, chain: dict, now: dt.datetime) -> dict:
    previous = chain.get("latest") or {}
    previous_root = previous.get("root_digest") or None
    git_meta = git_facts(root)
    artifacts, sources = collect_artifacts(root, git_meta, previous_root)

    manifest = {
        "schema": SCHEMA,
        "epoch_id": next_epoch_id(chain, now.strftime("%Y%m%d")),
        "root_algorithm": ROOT_ALGORITHM,
        "root_digest": root_of(artifacts),
        "previous_epoch": previous.get("epoch_id") or None,
        "previous_root": previous_root,
        "chain_length": chain.get("length", 0) + 1,
        "artifact_count": len(artifacts),
        "artifact_bytes": sum(a["size"] for a in artifacts),
        "artifacts": artifacts,
        "sources": sources,
        "sources_present": sum(1 for s in sources if s["present"]),
        "sources_expected": len(sources),
        "git_sha": git_meta["sha"],
        "git_branch": git_meta["branch"],
        "git_author": git_meta["author"],
        "git_committed_at": git_meta["committed_at"],
        "git_subject": git_meta["subject"],
        "trigger": trigger,
        "created_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "run": {
            "repository": os.environ.get("GITHUB_REPOSITORY") or "",
            "workflow": os.environ.get("GITHUB_WORKFLOW") or "",
            "run_id": os.environ.get("GITHUB_RUN_ID") or "",
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT") or "",
            "actor": os.environ.get("GITHUB_ACTOR") or "",
        },
        # Public anchoring is deliberately out of scope here: it needs a funded
        # key, which is deployment authority and lives on the private mirror.
        # The field exists so a later anchor step has somewhere to write without
        # changing the schema. See SRS-BUILDANDDO-EPOCH-001.
        "anchor": {"state": "pending", "witness": None, "receipt": None},
    }
    manifest["manifest_digest"] = sha256_json(
        {k: v for k, v in manifest.items() if k != "manifest_digest"}
    )
    return manifest


def verify_manifest(manifest: dict, root: Path | None = None, recheck_files: bool = False) -> dict:
    """Recompute a manifest's root, and optionally re-hash the artifacts on disk."""
    problems: list[str] = []

    if manifest.get("root_algorithm") != ROOT_ALGORITHM:
        problems.append(f"unknown root_algorithm {manifest.get('root_algorithm')!r}")
    artifacts = manifest.get("artifacts") or []
    if len(artifacts) != manifest.get("artifact_count"):
        problems.append(f"artifact_count {manifest.get('artifact_count')} != {len(artifacts)} entries")

    recomputed = root_of(artifacts)
    if recomputed != manifest.get("root_digest"):
        problems.append(f"root mismatch: manifest {manifest.get('root_digest')} != recomputed {recomputed}")

    expected_digest = sha256_json({k: v for k, v in manifest.items() if k != "manifest_digest"})
    if manifest.get("manifest_digest") and manifest["manifest_digest"] != expected_digest:
        problems.append("manifest_digest does not cover the manifest as written")

    rechecked = 0
    if recheck_files and root is not None:
        for a in artifacts:
            if "://" in a["path"]:
                continue  # synthetic leaf, nothing on disk to compare
            f = root / a["path"]
            if not f.is_file():
                problems.append(f"missing artifact {a['path']}")
                continue
            if sha256_file(f) != a["digest"]:
                problems.append(f"content changed since epoch: {a['path']}")
            rechecked += 1

    return {
        "state": "PASS" if not problems else "FAIL",
        "epoch_id": manifest.get("epoch_id"),
        "root_digest": manifest.get("root_digest"),
        "recomputed_root": recomputed,
        "artifacts_verified": len(artifacts),
        "files_rechecked": rechecked,
        "problems": problems,
    }


# ── outputs ──────────────────────────────────────────────────────────────────

def emit_github_outputs(values: dict) -> None:
    """Expose the epoch to later workflow steps. No-op outside GitHub Actions."""
    target = os.environ.get("GITHUB_OUTPUT")
    if not target:
        return
    try:
        with open(target, "a", encoding="utf-8") as fh:
            for key, value in values.items():
                fh.write(f"{key}={value}\n")
    except OSError as exc:
        print(f"WARN: cannot write GITHUB_OUTPUT: {exc}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="repository root")
    ap.add_argument("--trigger", default="manual",
                    choices=["merge", "production_deploy", "manual", "scheduled", "local"],
                    help="what caused this epoch")
    ap.add_argument("--epoch-dir", default=DEFAULT_EPOCH_DIR,
                    help=f"where manifests are written (default {DEFAULT_EPOCH_DIR}, gitignored)")
    ap.add_argument("--chain", default=DEFAULT_CHAIN, help=f"chain head file (default {DEFAULT_CHAIN})")
    ap.add_argument("--no-chain-update", action="store_true",
                    help="read the chain for linking but leave the head file untouched")
    ap.add_argument("--verify", metavar="MANIFEST",
                    help="recompute the root of an existing manifest and exit")
    ap.add_argument("--recheck-files", action="store_true",
                    help="with --verify, also re-hash every artifact still on disk")
    ap.add_argument("--json", action="store_true", help="print the manifest instead of a summary")
    ap.add_argument("--dry-run", action="store_true", help="compute everything, write nothing")
    args = ap.parse_args()

    root = Path(args.root).resolve()

    if args.verify:
        path = Path(args.verify)
        if not path.is_absolute():
            path = root / path
        if not path.is_file():
            print(f"FAIL: {args.verify} does not exist")
            return 1
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"FAIL: {args.verify} is not readable JSON ({exc})")
            return 1
        result = verify_manifest(manifest, root, args.recheck_files)
        print(json.dumps(result, indent=2))
        return 0 if result["state"] == "PASS" else 1

    chain_path = root / args.chain
    chain = read_chain(chain_path)
    manifest = build_manifest(root, args.trigger, chain, dt.datetime.now(dt.timezone.utc))

    # Self-verification is not ceremony. It is the difference between publishing
    # "a root was produced" and publishing "a root was produced and recomputes",
    # and it is what buildanddo.epoch.verified reports.
    check = verify_manifest(manifest)

    manifest_path = root / args.epoch_dir / f"{manifest['epoch_id']}.json"
    if not args.dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        body = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
        manifest_path.write_text(body, encoding="utf-8")
        (manifest_path.parent / "latest.json").write_text(body, encoding="utf-8")
        if not args.no_chain_update:
            chain_path.parent.mkdir(parents=True, exist_ok=True)
            chain_path.write_text(
                json.dumps(append_chain(chain, manifest), indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )

    emit_github_outputs({
        "epoch_id": manifest["epoch_id"],
        "root_digest": manifest["root_digest"],
        "previous_epoch": manifest["previous_epoch"] or "",
        "previous_root": manifest["previous_root"] or "",
        "artifact_count": manifest["artifact_count"],
        "artifact_bytes": manifest["artifact_bytes"],
        "chain_length": manifest["chain_length"],
        "git_sha": manifest["git_sha"],
        "trigger": manifest["trigger"],
        "verified": "1" if check["state"] == "PASS" else "0",
        "manifest_path": manifest_path.relative_to(root).as_posix(),
    })

    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
    else:
        print(json.dumps({
            "state": check["state"],
            "epoch_id": manifest["epoch_id"],
            "root_digest": manifest["root_digest"],
            "previous_epoch": manifest["previous_epoch"],
            "previous_root": manifest["previous_root"],
            "chain_length": manifest["chain_length"],
            "artifact_count": manifest["artifact_count"],
            "artifact_bytes": manifest["artifact_bytes"],
            "sources_present": f"{manifest['sources_present']}/{manifest['sources_expected']}",
            "missing_sources": [s["path"] for s in manifest["sources"] if not s["present"]],
            "trigger": manifest["trigger"],
            "git_sha": manifest["git_sha"],
            "manifest": manifest_path.relative_to(root).as_posix() if not args.dry_run else None,
            "dry_run": args.dry_run,
            "problems": check["problems"],
        }, indent=2))

    # A root that does not recompute is a bug in this script, not a build
    # failure, but it must not be published as if it were sound.
    return 0 if check["state"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
