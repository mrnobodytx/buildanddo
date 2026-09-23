#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/capability_inventory.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001, SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/web/src/App.jsx
# EnumType:    Service
# EnumEdges:   CONSUMES apps/web/src/App.jsx;
#              PRODUCES apps/web/public/capabilities.json;
#              MIRRORED_BY apps/web/src/pages/RoadmapPage.jsx (capability inventory)
# Intent:      Answer "what is built, what is verified, and what can I actually use right now"
#              from measurement rather than from a milestone's prose.
# ───────────────────────────────────────────────────────────────
"""What exists, what is tested, and what is actually live — measured, not asserted.

    scan / json

WHY. The roadmap shows a plan curve and a milestone ledger. Both answer "are we on schedule";
neither answers "what can I use today". A milestone reading "Signals pipeline MVP - verified" does
not tell a reader whether they can open Signals, and the evidence under it - "SignalsPage.jsx (483
lines) reads the signals collection" - is engineering provenance, not a capability.

WHY NOT PROBE THE ROUTES. The obvious implementation is to fetch each route and call 200 "ready".
Controlled against production 2026-09-20:

    /app/missions                        200 text/html
    /__definitely-not-a-real-route-zzz   200 text/html

A single-page app answers 200 for everything, including routes that do not exist. A readiness
column built on that would be green for capabilities nobody ever wrote, which is the same vacuous
pass this repository keeps catching elsewhere.

WHAT IS MEASURED INSTEAD. Each environment publishes the commit it is serving, so readiness is an
exact question with an exact answer: is this capability's source present in that commit? That is
`git cat-file -e <deployed-sha>:<path>` - the same commit-scoped check the sprint replay uses, and
for the same reason: the working tree answers a different question (which branch is checked out)
than the one being asked.

WHICH RECORD TO BELIEVE. An environment publishes its identity TWICE, and on 2026-09-20 both
environments disagreed with themselves - production said a5bdcad5 in `/_version` and 0b9faeb in
`/.well-known/citadel-release.json`, nine days apart. The webroot's file mtimes matched `_version`,
so the manifest was simply left behind by a deploy that never overwrote it. Trusting the manifest
produced an inventory claiming production lacked Pricing, About, Docs and eleven workspace pages,
every one of which was deployed and serving. `_version` wins - it is written by the step that
actually moves the files - and the disagreement is reported, never silently resolved.

THE ROUTE TABLE IS THE SOURCE. Capabilities are parsed out of `App.jsx`, never hand-listed, so the
inventory cannot quietly drift from what the application actually exposes. A route whose component
file is missing is DECLARED, not built - a link that leads nowhere is not a capability.

Standard library only, matching the rest of scripts/ci/.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

try:  # imported as part of the repository (the tests), or run as a script from scripts/ci (the build)
    from scripts.ci import public_redaction
except ImportError:
    import public_redaction  # type: ignore[no-redef]

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "apps" / "web" / "src" / "App.jsx"
SRC = ROOT / "apps" / "web" / "src"
OUT = ROOT / "apps" / "web" / "public" / "capabilities.json"

# A component this short is a placeholder, not a page. Chosen from the repo's own pages: the
# smallest real one is comfortably above this, and stubs sit well below.
STUB_LINES = 40

LIVE, STAGED, BUILT, DECLARED, UNMEASURABLE = "LIVE", "STAGED", "BUILT", "DECLARED", "UNMEASURABLE"

_LAZY = re.compile(r"const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['\"]([^'\"]+)['\"]")
_WORKSPACE = re.compile(r"\{\s*path:\s*'([a-z0-9-]+)',\s*label:\s*'([^']+)',\s*element:\s*(\w+)")
_PUBLIC = re.compile(r"<Route\s+path=\"([^\"]+)\"\s+element=\{<(\w+)")


def _resolve(spec: str) -> Path | None:
    """Turn an import specifier into a file under apps/web/src, or None."""
    # Both alias forms resolve under src/: '@/pages/X' and './pages/X' name the same file.
    base = SRC / spec.replace("@/", "").lstrip("./")
    for candidate in (base, base.with_suffix(".jsx"), base.with_suffix(".js"),
                      base / "index.jsx", base / "index.js"):
        if candidate.is_file():
            return candidate
    return None


def parse_routes(app_text: str) -> list[dict]:
    """Read the capability list straight out of the router.

    Args:
        app_text: Contents of App.jsx.

    Returns:
        Capability dicts with surface, path, label and component name.
    """
    lazy = dict(_LAZY.findall(app_text))
    found: list[dict] = []
    for path, label, component in _WORKSPACE.findall(app_text):
        found.append({"surface": "workspace", "path": f"/app/{path}", "label": label,
                      "component": component, "import": lazy.get(component, "")})
    for path, component in _PUBLIC.findall(app_text):
        if path == "*" or component in {"Navigate"}:
            continue
        found.append({"surface": "public", "path": path if path.startswith("/") else f"/{path}",
                      "label": re.sub(r"Page$", "", component) or component,
                      "component": component, "import": lazy.get(component, "")})
    # A component reached from two routes is one capability; keep the first sighting.
    seen: set[str] = set()
    unique = []
    for cap in found:
        if cap["component"] in seen:
            continue
        seen.add(cap["component"])
        unique.append(cap)
    return unique


def _git(args: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True,
                              text=True, timeout=30, check=False)
    except (OSError, subprocess.SubprocessError):
        return -1, ""
    return proc.returncode, (proc.stdout or "").strip()


def _in_commit(sha: str, rel: str) -> bool | None:
    """Is this file present in that commit? None when the commit cannot be read here."""
    if not sha:
        return None
    if _git(["cat-file", "-e", f"{sha}^{{commit}}"])[0] != 0:
        return None
    return _git(["cat-file", "-e", f"{sha}:{rel}"])[0] == 0


def _tests_for(component: str) -> list[str]:
    """Test files that import this component. Presence of a test is coverage, not a passing run -
    the two are reported separately so nobody reads one as the other."""
    hits: list[str] = []
    for test in SRC.rglob("__tests__/*.test.*"):
        try:
            if re.search(rf"\b{re.escape(component)}\b", test.read_text(encoding="utf-8", errors="replace")):
                hits.append(str(test.relative_to(ROOT)).replace("\\", "/"))
        except OSError:
            continue
    return sorted(hits)


def measure(cap: dict, production_sha: str, staging_sha: str) -> dict:
    """Measure one capability against the tree and the deployed commits."""
    file = _resolve(cap["import"]) if cap["import"] else None
    rel = str(file.relative_to(ROOT)).replace("\\", "/") if file else ""
    lines = len(file.read_text(encoding="utf-8", errors="replace").splitlines()) if file else 0
    tests = _tests_for(cap["component"]) if file else []

    in_prod = _in_commit(production_sha, rel) if rel else None
    in_stage = _in_commit(staging_sha, rel) if rel else None

    if not file or lines < STUB_LINES:
        state = DECLARED
    elif in_prod is True:
        state = LIVE
    elif in_stage is True:
        state = STAGED
    elif in_prod is None and in_stage is None:
        # The deployed commits are not readable here, so "not live" would be a guess.
        state = UNMEASURABLE
    else:
        state = BUILT

    return {
        **cap,
        "file": rel,
        "lines": lines,
        "tests": len(tests),
        "test_files": tests,
        "in_production": in_prod,
        "in_staging": in_stage,
        "state": state,
    }


def _deployed_shas(offline: bool) -> dict:
    """Ask each environment which commit it is serving — from BOTH records, and say when they
    disagree.

    An environment publishes its identity twice: `/_version` (written by the deploy) and
    `/.well-known/citadel-release.json` (written by the build). Measured 2026-09-20, production
    disagreed with itself:

        _version                        a5bdcad5  built 2026-09-18T14:57
        .well-known/citadel-release     0b9faeb   built 2026-09-11T22:36

    The webroot's own file mtimes were 2026-09-18T14:59, so `_version` was right and the manifest
    was nine days stale — left behind by a deploy that never overwrote it. Reading the manifest
    alone produced an inventory claiming production lacked Pricing, About, Docs and eleven
    workspace pages, all of which were in fact deployed and serving.

    So `_version` wins, because it is written by the step that actually moved the files, and the
    disagreement is REPORTED rather than resolved silently — a environment that cannot agree with
    itself about what it is running is a finding, not a detail to paper over.
    """
    result = {"production": "", "staging": "", "source": {}, "conflicts": {}, "reason": ""}
    if offline:
        result["reason"] = "offline: environments not asked"
        return result
    import urllib.request  # noqa: PLC0415

    def fetch(url):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "buildanddo-capability-inventory"})
            with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310 - fixed hosts
                return json.loads(resp.read())
        except Exception:  # noqa: BLE001
            return None

    for env, base in (("production", "https://buildanddo.com"),
                      ("staging", "https://staging.buildanddo.com")):
        version = fetch(f"{base}/_version") or {}
        manifest = fetch(f"{base}/.well-known/citadel-release.json") or {}
        deployed = str(version.get("commit_sha") or version.get("commit") or "")[:7]
        built = str(manifest.get("commit") or "")[:7]
        if deployed:
            result[env], result["source"][env] = deployed, "_version"
        elif built:
            result[env], result["source"][env] = built, "release-manifest"
        else:
            result["reason"] = (result["reason"] + f" {env}: no identity published;").strip()
            continue
        if deployed and built and deployed != built:
            result["conflicts"][env] = {
                "_version": deployed, "release_manifest": built,
                "using": "_version",
                "note": "the environment disagrees with itself; the deploy-written record wins",
            }
    return result


def build_report(offline: bool = False) -> dict:
    """Produce the whole inventory."""
    import datetime as dt  # noqa: PLC0415

    caps = parse_routes(APP.read_text(encoding="utf-8", errors="replace"))
    shas = _deployed_shas(offline)
    rows = [measure(c, shas["production"], shas["staging"]) for c in caps]
    rows.sort(key=lambda r: ({LIVE: 0, STAGED: 1, BUILT: 2, UNMEASURABLE: 3, DECLARED: 4}[r["state"]],
                             r["surface"], r["label"].lower()))
    counts = {s: sum(1 for r in rows if r["state"] == s)
              for s in (LIVE, STAGED, BUILT, UNMEASURABLE, DECLARED)}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "state": "MEASURED" if (shas["production"] or shas["staging"]) else "UNMEASURED",
        "deployed": shas,
        # Said in the artifact itself, so a reader of the JSON knows what the column means.
        "readiness_basis": "presence of the source file in the commit each environment reports "
                           "serving; route probing is vacuous because the SPA returns 200 for "
                           "any path, including ones that do not exist",
        "provenance_conflicts": shas.get("conflicts", {}),
        "counts": counts,
        "total": len(rows),
        "with_tests": sum(1 for r in rows if r["tests"] > 0),
        "capabilities": rows,
    }


def render(report: dict) -> str:
    """Human-readable inventory for a terminal or a pipeline log."""
    d = report["deployed"]
    lines = [
        f"CAPABILITY INVENTORY  {report['generated_at']}  ({report['state']})",
        f"  production={d['production'] or 'unknown'}  staging={d['staging'] or 'unknown'}"
        + (f"  [{d['reason']}]" if d.get("reason") else ""),
        f"  {report['counts'][LIVE]} live, {report['counts'][STAGED]} staged, "
        f"{report['counts'][BUILT]} built, {report['counts'][DECLARED]} declared, "
        f"{report['counts'][UNMEASURABLE]} unmeasurable   "
        f"({report['with_tests']}/{report['total']} have tests)",
        "",
    ]
    for row in report["capabilities"]:
        lines.append(f"  {row['state']:<13}{row['path']:<24}{row['label'][:26]:<28}"
                     f"{row['lines']:>5} lines  {row['tests']} tests")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--offline", action="store_true", help="do not ask the environments")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    parser.add_argument("--write", action="store_true",
                        help=f"write {OUT.relative_to(ROOT)} for the public page")
    args = parser.parse_args(argv)

    report = build_report(offline=args.offline)
    print(json.dumps(report, indent=2) if args.json else render(report))
    if args.write:
        # capabilities.json is public, so it passes the rule on the way out.
        rule = public_redaction.Rule()
        report, withheld = rule.redact_document(report)
        public_redaction.report_withheld(rule, withheld, OUT.name)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
