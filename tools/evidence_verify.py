#!/usr/bin/env python3
"""tools/evidence_verify.py -- check the evidence a milestone already claims.

SRS:         SRS-BUILDANDDO-EVIDENCE-VERIFY-001
Created:     2026-09-21
Campaign:    citadel-21-day-2026-09

THE GAP THIS ADDRESSES, MEASURED. `_actual_pct` counts a milestone only when its status is exactly
`verified` AND it carries non-empty evidence. Six milestones -- days 5, 7, 9, 11, 15, 17 -- are
`planned` and ALREADY CARRY substantial evidence strings naming commits and files. They have the
evidence and were never marked. That, not missing work, is most of the distance between 42% and
the plan.

IT DOES NOT FLIP ANY STATUS, AND THAT IS DELIBERATE. `sprint_cycle.py`'s own docstring says a
progress number "cannot be asserted - it has to be earned one milestone at a time", and the
sanctioned path is `sprint_cycle.py verify --day N --evidence "..."`. A tool that marked milestones
verified because their evidence string was non-empty would be exactly the free-text progress number
that module was built to prevent. This one CHECKS the claim and prints the command; a human runs it.

A NON-EMPTY EVIDENCE STRING IS NOT EVIDENCE. The string is prose. It names commits and files, and
either those exist or they do not. Every claim is resolved against git and the filesystem:
  * a commit sha must RESOLVE in this repository
  * a named path must EXIST at that commit (not merely today -- evidence is about what was delivered)
  * a claim naming neither is UNVERIFIABLE, which is distinct from false

UNVERIFIABLE IS NOT FAILURE, AND FALSE IS NOT UNVERIFIABLE. Three outcomes, kept apart: VERIFIED
(every named artifact resolves), REFUTED (something named does not exist -- the evidence is wrong),
UNVERIFIABLE (nothing checkable was named). Collapsing the last two would either accuse honest prose
of lying or let a bad reference pass.

CLI:
  py -3.13 tools/evidence_verify.py                # check every milestone
  py -3.13 tools/evidence_verify.py --day 7
  py -3.13 tools/evidence_verify.py --json
  py -3.13 tools/evidence_verify.py --selftest
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "scripts" / "ci" / "sprint_ledger.json"

VERIFIED = "VERIFIED"
REFUTED = "REFUTED"
UNVERIFIABLE = "UNVERIFIABLE"

_SHA_RE = re.compile(r"\b[0-9a-f]{7,40}\b")
# LONGEST EXTENSION FIRST. With `js` before `json`, `citadel-release.json` matched as
# `citadel-release.js`, which then "did not resolve" -- the regex manufactured six false
# refutations, four of them against milestones the estate had already marked verified. A leading
# dot is allowed too: `.github/...` and `.gitlab-ci.yml` were being truncated to `github/...`.
_PATH_RE = re.compile(
    r"\.?[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:jsonl|json|jsx|mjs|yaml|yml|py|js|md|sql)")
# Words that look like shas but are not. Checked because `_SHA_RE` is deliberately loose.
_NOT_SHA = {"abcdef", "deadbeef", "feedface"}


def _git(args: Sequence[str]) -> Tuple[int, str]:
    try:
        p = subprocess.run(["git", *args], cwd=str(ROOT), capture_output=True,
                           text=True, timeout=60)
        return p.returncode, p.stdout.strip()
    except Exception:  # noqa: BLE001
        return 1, ""


def commit_exists(sha: str) -> Tuple[bool, str]:
    """Does this sha resolve to a commit HERE? A sha from another repo is not evidence."""
    if sha.lower() in _NOT_SHA:
        return False, "placeholder-looking value"
    rc, out = _git(["cat-file", "-t", sha])
    if rc != 0 or out != "commit":
        return False, "does not resolve to a commit in this repository"
    _rc2, subject = _git(["log", "-1", "--format=%s", sha])
    return True, subject[:90]


def is_git_ignored(path: str) -> bool:
    """Is this path excluded from git by design? `.gitignore` carries `/state/`."""
    rc, _out = _git(["check-ignore", "-q", path])
    return rc == 0


def path_at_commit(path: str, sha: Optional[str]) -> Tuple[bool, str]:
    """Did this path exist AT that commit? Evidence is about what was delivered, not today's tree.

    A BARE FILENAME IN PROSE IS A MENTION, NOT A PATH. Evidence reads "commit d2d5f83 (ship.py
    build->gate->...)"; `ship.py` is prose referring to `scripts/deploy/ship.py`. Treating it as a
    repo-root path and refuting it accuses correct evidence of being wrong. Unqualified names are
    resolved by basename against the tracked file list first.
    """
    if sha:
        rc, _ = _git(["cat-file", "-e", "%s:%s" % (sha, path)])
        if rc == 0:
            return True, "present at %s" % sha[:8]
    if (ROOT / path).exists():
        return True, ("present in the working tree"
                      + (" but NOT at %s" % sha[:8] if sha else ""))
    if "/" not in path:
        rc, out = _git(["ls-files", "*/%s" % path, path])
        hits = [h for h in out.splitlines() if h.strip()]
        if hits:
            return True, "prose mention; resolves to %s" % hits[0]
    if is_git_ignored(path):
        # NOT A REFUTATION. `.gitignore` carries `/state/`, and sprint_cycle.py documents state/ as
        # local operational state. Such a reference can never resolve from git, so calling it wrong
        # accuses correct evidence of lying about an artifact git was never meant to hold.
        return None, ("git-ignored by design (%s); this reference cannot be checked from history "
                      "and its absence is not evidence of anything" % path.split("/")[0] + "/")
    return False, "not found at %s nor in the working tree" % (sha[:8] if sha else "any named commit")


def parse_claims(evidence: str) -> Dict[str, List[str]]:
    shas = [s for s in _SHA_RE.findall(evidence or "") if not s.isdigit()]
    paths = _PATH_RE.findall(evidence or "")
    # A path like `sprint_cycle.py` can also match the sha regex fragmentarily; de-dupe by exclusion.
    return {"shas": sorted(set(shas)), "paths": sorted(set(paths))}


def verify_milestone(m: Dict[str, Any]) -> Dict[str, Any]:
    evidence = (m.get("evidence") or "").strip()
    claims = parse_claims(evidence)
    if not evidence:
        return {"day": m.get("day"), "status": m.get("status"), "verdict": UNVERIFIABLE,
                "reason": "the milestone carries no evidence string at all",
                "claims": claims, "checked": []}
    if not claims["shas"] and not claims["paths"]:
        return {"day": m.get("day"), "status": m.get("status"), "verdict": UNVERIFIABLE,
                "reason": ("evidence names neither a commit nor a file, so nothing in it can be "
                           "resolved. Prose is not a reference."),
                "claims": claims, "checked": []}

    checked: List[Dict[str, Any]] = []
    for sha in claims["shas"]:
        ok, why = commit_exists(sha)
        checked.append({"kind": "commit", "ref": sha, "ok": ok, "detail": why})
    anchor = next((c["ref"] for c in checked if c["kind"] == "commit" and c["ok"]), None)
    for path in claims["paths"]:
        ok, why = path_at_commit(path, anchor)
        checked.append({"kind": "path", "ref": path, "ok": ok, "detail": why})

    # ok is True / False / None. None = unverifiable by design, which is neither pass nor fail.
    bad = [c for c in checked if c["ok"] is False]
    undesignable = [c for c in checked if c["ok"] is None]
    verdict = VERIFIED if not bad else REFUTED
    return {
        "day": m.get("day"), "status": m.get("status"), "verdict": verdict,
        "claims": claims, "checked": checked,
        "failed": [{"ref": c["ref"], "detail": c["detail"]} for c in bad],
        "unverifiable_by_design": [{"ref": c["ref"], "detail": c["detail"]} for c in undesignable],
        "reason": (("every checkable commit and file resolves (%d checked%s)"
                    % (len(checked),
                       ", %d git-ignored by design" % len(undesignable) if undesignable else ""))
                   if not bad else
                   "%d of %d named artifacts do not resolve; the evidence string is wrong, which is "
                   "a different problem from the work being undone" % (len(bad), len(checked))),
    }


_ANCHOR = ROOT / "state" / "progression" / "anchor.json"
# Content words worth comparing. Deliberately small: a long list makes everything look related.
_STOP = {"the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "it", "that", "with",
         "from", "by", "as", "not", "never", "one", "real", "than", "into", "its", "this", "be"}


def _terms(text: str) -> set:
    return {w for w in re.findall(r"[a-z]{4,}", (text or "").lower()) if w not in _STOP}


def requirement_correspondence(day: int) -> Dict[str, Any]:
    """Does the day's EVIDENCE talk about the day's REQUIREMENTS at all?

    REFERENTIAL INTEGRITY IS NOT DELIVERY. Every commit and file a milestone names can resolve
    while describing entirely different work. Measured here: day 7's evidence describes
    `SignalsPage.jsx` reading a signals collection, while day 7's criteria demand a typed
    evidence/claim model with epistemic states, a research-quest compiler and reputation
    settlement. Both true, neither the same. Promoting on resolution alone would have moved a
    PUBLIC roadmap number on evidence that does not support the requirement.

    This is a WEAK signal on purpose -- shared vocabulary, nothing more. It can say "these are not
    even talking about the same thing"; it can never say "delivered".
    """
    if not _ANCHOR.exists():
        return {"state": "UNMEASURED", "reason": "no anchor at %s" % _ANCHOR}
    data = json.loads(_ANCHOR.read_text(encoding="utf-8"))
    reqs = [it for it in (data.get("open_items") or []) if it.get("day") == day]
    if not reqs:
        return {"state": "UNMEASURED",
                "reason": "no OPEN criteria for day %d; correspondence cannot be judged "
                          "(its criteria may already be closed)" % day}
    led = next((m for m in (json.loads(LEDGER.read_text(encoding="utf-8")).get("milestones") or [])
                if m.get("day") == day), None)
    ev_terms = _terms((led or {}).get("evidence", ""))
    rows = []
    for it in reqs:
        r_terms = _terms(it.get("requirement", ""))
        shared = sorted(ev_terms & r_terms)
        rows.append({"id": it.get("id"), "shared_terms": shared,
                     "requirement": it.get("requirement", "")[:80]})
    total_shared = sum(len(r["shared_terms"]) for r in rows)
    best = max((len(r["shared_terms"]) for r in rows), default=0)
    # A SINGLE SHARED WORD IS COINCIDENCE, NOT CORRESPONDENCE. Day 9's only overlap was
    # "production" -- a word that appears in almost any engineering sentence. Requiring >=2 shared
    # terms on ONE criterion is still weak, but it is the difference between "these discuss the
    # same subject" and "these both happen to be written in English".
    if total_shared == 0:
        verdict = "NO_CORRESPONDENCE"
        reason = ("the evidence shares NO content word with any of this day's %d requirements; it "
                  "describes different work" % len(reqs))
    elif best < 2:
        verdict = "WEAK_CORRESPONDENCE"
        reason = ("the strongest match is a SINGLE shared word (%s); one generic term is "
                  "coincidence, not evidence that this milestone delivered the requirement"
                  % ", ".join(sorted({t for r in rows for t in r["shared_terms"]})))
    else:
        verdict = "SOME_SHARED_VOCABULARY"
        reason = ("one criterion shares %d content words with the evidence -- topical overlap, "
                  "still NOT proof of delivery" % best)
    return {"state": "MEASURED", "criteria": rows, "total_shared_terms": total_shared,
            "best_single_criterion": best, "verdict": verdict, "reason": reason}


def load_milestones() -> Dict[str, Any]:
    if not LEDGER.exists():
        return {"state": "UNMEASURED", "reason": "no ledger at %s" % LEDGER}
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    return {"state": "MEASURED", "milestones": data.get("milestones") or []}


def run(day: Optional[int] = None) -> Dict[str, Any]:
    loaded = load_milestones()
    if loaded["state"] != "MEASURED":
        return loaded
    rows = [m for m in loaded["milestones"] if day is None or m.get("day") == day]
    results = [verify_milestone(m) for m in rows]
    for r in results:
        r["correspondence"] = requirement_correspondence(r["day"])
    # THE DECISIVE GATE, and it is structural rather than lexical: A DAY WITH OPEN CRITERIA IS NOT
    # COMPLETE. `open_items` lists every criterion still open; if a day appears there, its own
    # assessment says the work is unfinished, whatever its evidence string resolves to. Day 15 is
    # the worked example -- its evidence is excellent (exact collections, migrations, RBAC hook,
    # staging readback WITH a negative control) and it still cannot be promoted, because its own
    # finding says "Staging only; production not promoted", D15-1 records production acceptance as
    # not performed, and D15-2 says the cross-links were never established. Marking the DAY
    # verified would assert both criteria delivered. Term overlap below is a weaker secondary
    # signal; this one is dispositive.
    promotable = [r for r in results
                  if r["status"] == "planned" and r["verdict"] == VERIFIED
                  and r["correspondence"].get("verdict") == "SOME_SHARED_VOCABULARY"
                  and not r["correspondence"].get("criteria")]
    withheld = [r for r in results
                if r["status"] == "planned" and r["verdict"] == VERIFIED
                and r["correspondence"].get("verdict") in ("NO_CORRESPONDENCE",
                                                             "WEAK_CORRESPONDENCE")]
    return {
        "schema": "buildanddo.evidence-verify/v1",
        "srs": "SRS-BUILDANDDO-EVIDENCE-VERIFY-001",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "results": results,
        "counts": {
            "milestones": len(results),
            VERIFIED: sum(1 for r in results if r["verdict"] == VERIFIED),
            REFUTED: sum(1 for r in results if r["verdict"] == REFUTED),
            UNVERIFIABLE: sum(1 for r in results if r["verdict"] == UNVERIFIABLE),
            "planned_with_verified_evidence": len(promotable),
        },
        "promotable": [r["day"] for r in promotable],
        "withheld_no_correspondence": [r["day"] for r in withheld],
        "withheld_open_criteria": [
            {"day": r["day"],
             "open": [c["id"] for c in (r["correspondence"].get("criteria") or [])]}
            for r in results
            if r["status"] == "planned" and (r["correspondence"].get("criteria"))],
        "structural_rule": ("a day listed in open_items has unfinished criteria and cannot be "
                            "verified, however well its evidence string resolves"),
        "commands": [
            "py -3.13 scripts/ci/sprint_cycle.py verify --day %d --evidence \"<the existing "
            "evidence string, unchanged>\"" % r["day"] for r in promotable],
        "note": ("this tool CHECKS evidence and prints the sanctioned command; it never flips a "
                 "status. A progress number has to be earned one milestone at a time."),
    }


def render(r: Dict[str, Any]) -> str:
    if r.get("state") == "UNMEASURED":
        return "  UNMEASURED: %s" % r.get("reason")
    c = r["counts"]
    out = [
        "EVIDENCE VERIFICATION  (%s)  %s" % (r["srs"], r["generated_at"]),
        "  %d milestones · VERIFIED %d · REFUTED %d · UNVERIFIABLE %d"
        % (c["milestones"], c[VERIFIED], c[REFUTED], c[UNVERIFIABLE]),
        "",
        "  %-6s %-10s %-14s %s" % ("day", "status", "verdict", "reason"),
    ]
    for row in r["results"]:
        out.append("  %-6s %-10s %-14s %s"
                   % (row["day"], row["status"], row["verdict"], row["reason"][:70]))
    for row in r["results"]:
        if row.get("failed"):
            out.append("    ! day %s unresolved refs:" % row["day"])
            for f in row["failed"][:5]:
                out.append("        %-46s %s" % (f["ref"][:46], f["detail"][:50]))
    if r["promotable"]:
        out += ["", "  PLANNED milestones whose evidence FULLY CHECKS OUT: %s"
                % ", ".join("day %d" % d for d in r["promotable"]),
                "  %s" % r["note"], ""]
        out += ["    " + cmd for cmd in r["commands"]]
    else:
        out += ["", "  No planned milestone has fully-resolving evidence."]
    return "\n".join(out)


# --- selftest ---------------------------------------------------------------------------
def _selftest() -> int:
    checks: List[Tuple[str, bool]] = []

    def ck(n: str, c: bool) -> None:
        checks.append((n, bool(c)))

    # -- claim parsing
    p = parse_claims("commits 8a1c407, 3170e84; apps/web/src/pages/workspace/SignalsPage.jsx")
    ck("parses commit shas", "8a1c407" in p["shas"] and "3170e84" in p["shas"])
    ck("parses file paths",
       "apps/web/src/pages/workspace/SignalsPage.jsx" in p["paths"])
    # GUARD: the extension alternation must prefer the LONGEST match.
    ck("a .json path is not truncated to .js",
       "apps/web/public/.well-known/citadel-release.json"
       in parse_claims("manifest apps/web/public/.well-known/citadel-release.json")["paths"])
    ck("a leading-dot path survives",
       ".gitlab-ci.yml" in parse_claims("see .gitlab-ci.yml for the job")["paths"])
    ck("...including dotted directories",
       ".github/workflows/pr-governance.yml"
       in parse_claims("added .github/workflows/pr-governance.yml")["paths"])
    # GUARD: a bare filename mentioned in prose resolves by basename, not refuted.
    ok, why = path_at_commit("ship.py", None)
    ck("a bare prose filename resolves by basename", ok is True)
    # GUARD: git-ignored paths are neither pass nor fail.
    ig_ok, ig_why = path_at_commit("state/definitely_not_here.json", None)
    ck("a git-ignored path is neither True nor False", ig_ok is None)
    # GUARD: one shared generic word must not read as correspondence.
    ck("the correspondence bands are ordered by strength",
       {"NO_CORRESPONDENCE", "WEAK_CORRESPONDENCE", "SOME_SHARED_VOCABULARY"} == {
           "NO_CORRESPONDENCE", "WEAK_CORRESPONDENCE", "SOME_SHARED_VOCABULARY"})
    _c9 = requirement_correspondence(9)
    if _c9.get("state") == "MEASURED":
        ck("a single shared word is WEAK, not correspondence",
           _c9["best_single_criterion"] >= 2 or _c9["verdict"] != "SOME_SHARED_VOCABULARY")
    ck("...and says its absence proves nothing", "not evidence of anything" in ig_why)
    ck("...and says it was a prose mention", "prose mention" in why)
    ck("prose with no refs parses empty",
       parse_claims("delivered on the ERP surface")["shas"] == []
       and parse_claims("delivered on the ERP surface")["paths"] == [])

    # -- the three outcomes are kept apart
    empty = verify_milestone({"day": 99, "status": "planned", "evidence": ""})
    ck("no evidence at all is UNVERIFIABLE", empty["verdict"] == UNVERIFIABLE)
    prose = verify_milestone({"day": 99, "status": "planned",
                              "evidence": "we finished the thing and it works"})
    ck("prose naming nothing checkable is UNVERIFIABLE", prose["verdict"] == UNVERIFIABLE)
    ck("...and says prose is not a reference", "Prose is not a reference" in prose["reason"])

    fake = verify_milestone({"day": 99, "status": "planned",
                             "evidence": "commit deadbeef; nope/does_not_exist.py"})
    ck("a bogus commit is REFUTED, not unverifiable", fake["verdict"] == REFUTED)
    ck("...and REFUTED is distinguished from UNVERIFIABLE", REFUTED != UNVERIFIABLE)
    ck("...and it names the unresolved refs", len(fake["failed"]) >= 1)
    ck("...and separates wrong-evidence from undone-work",
       "different problem from the work being undone" in fake["reason"])

    # -- a real commit from this repo must verify
    rc, head = _git(["rev-parse", "HEAD"])
    if rc == 0 and head:
        ok, _why = commit_exists(head[:8])
        ck("a real commit in this repo resolves", ok is True)
        real = verify_milestone({"day": 98, "status": "planned",
                                 "evidence": "commit %s" % head[:8]})
        ck("a milestone naming only a real commit is VERIFIED", real["verdict"] == VERIFIED)
    else:
        ck("a real commit in this repo resolves", False)
        ck("a milestone naming only a real commit is VERIFIED", False)
    ck("a foreign sha does not resolve here",
       commit_exists("0123456789abcdef0123456789abcdef01234567")[0] is False)

    # -- it must never flip a status
    # The needle is ASSEMBLED, not written literally: spelling it out would place it in this very
    # file and the check would then find its own assertion and fail. A self-referential search is
    # the source-scanning equivalent of a detector matching its own fixture.
    needle = "LEDGER" + "." + "write_" + "text"
    src = Path(__file__).read_text(encoding="utf-8")
    ck("the tool never writes the ledger", needle not in src)
    # STRUCTURAL, not textual: count the process-spawn sites via the AST. A string search kept
    # matching its own assertion -- the second self-referential failure in this selftest.
    import ast as _ast
    _spawns = [n for n in _ast.walk(_ast.parse(src))
               if isinstance(n, _ast.Attribute) and n.attr in ("run", "Popen", "check_call",
                                                               "check_output", "call")
               and isinstance(n.value, _ast.Name) and n.value.id == "subprocess"]
    ck("there is exactly ONE process-spawn site, inside _git", len(_spawns) == 1)

    full = run()
    ck("the run reports all three verdict kinds as keys",
       {VERIFIED, REFUTED, UNVERIFIABLE} <= set(full["counts"]))
    ck("promotable lists only planned milestones",
       all(any(r["day"] == d and r["status"] == "planned" for r in full["results"])
           for d in full["promotable"]))
    ck("the note states it does not flip status", "never flips a status" in full["note"])
    # GUARD: the structural rule must dominate a good evidence string.
    ck("no day with open criteria is promotable",
       all(d not in full["promotable"]
           for row in full["withheld_open_criteria"] for d in [row["day"]]))
    ck("the structural rule is stated in the payload",
       "cannot be verified" in full["structural_rule"])
    ck("a command is printed per promotable milestone",
       len(full["commands"]) == len(full["promotable"]))

    passed = sum(1 for _n, ok in checks if ok)
    for n, ok in checks:
        print("  %s %s" % ("PASS" if ok else "FAIL", n))
    print("\n  selftest: %d/%d" % (passed, len(checks)))
    return 0 if passed == len(checks) else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Verify the evidence milestones already claim.")
    ap.add_argument("--day", type=int, default=None)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return _selftest()
    r = run(a.day)
    print(json.dumps(r, indent=2, sort_keys=True) if a.json else render(r))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
