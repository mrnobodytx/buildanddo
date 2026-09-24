#!/usr/bin/env python3
"""tools/day21_closure.py -- declared-value drift audit + the Day-21 milestone, measured.

SRS NOTE: this module originally carried SRS-BUILDANDDO-DAY21-CLOSURE-001. That id is now formally
registered in .bits/srs_registry.yml to the Day-21 Submission Closure package, which owns the
submission lane. Two artifacts under one SRS id is the very defect `declared_value_audit()` exists
to catch, so this module was re-identified rather than left to collide.

SRS:         SRS-BUILDANDDO-DECLARED-VALUES-001
Created:     2026-09-20
Campaign:    citadel-21-day-2026-09

WHAT DAY 21 ACTUALLY IS. The sprint carries milestones on ODD days only (1,3,...,19,21), so there
is no Day-20 criterion to build; Day 20 is the working day and Day 21 is the final milestone. Its
three criteria are:
  D21-1  Public test suite results, not just a green checkmark
  D21-2  An honest list of what remains open
  D21-3  This roadmap updated to reflect what actually happened, not the original plan
D21-3 is BLOCKED on a staging/production deploy, which is operator-run. This module does not
attempt it and does not pretend it is closed.

THE DEFECT THIS MODULE GENERALISES. Two independent Day-21 blockers turned out to be ONE defect
wearing two faces: a canonical value declared in several places with no single reader.
  * `sprint_start` is declared in FOUR places. `scripts/ci/sprint_cycle.py` holds the canonical
    constant, and `_load_state()` reads the tracked ledger for `campaign_id` and `milestones` but
    takes `sprint_start` from the constant ALWAYS -- so the ledger's own `sprint_start` is DEAD
    DATA. It is tracked in git, it looks authoritative, and nothing consumes it. It had drifted to
    a different date and misled two separate readers into reporting the wrong sprint day.
  * The public site origin is declared in TWO places that disagree (`README.md` vs
    `apps/web/src/lib/publicPages.js`) and there is NO declared canonical reader at all.
These are not typos to be patched one at a time. A value with several homes and no owner drifts
again the moment someone edits the wrong copy, so `declared_value_audit()` checks the class.

AN UNRESOLVED VALUE IS NOT A FAILING ONE. Where a canonical source exists, divergent copies are
STALE and the module says which file to regenerate. Where NO canonical source exists -- the site
origin today -- the verdict is UNRESOLVED and the module refuses to nominate a winner. Picking one
would settle a competition-facing decision by coin flip and make the contradiction invisible.

D21-1 MEANS PUBLISHING FAILURES TOO. The criterion is explicitly "not just a green checkmark", so
this module publishes the COMPLETE result including failing tests, and a suite it could not run is
UNMEASURED with the reason -- never an absent-therefore-green.

CLI:
  py -3.13 tools/day21_closure.py                 # the Day-21 closure view
  py -3.13 tools/day21_closure.py --run-tests     # actually execute the suite (slow)
  py -3.13 tools/day21_closure.py --json
  py -3.13 tools/day21_closure.py --selftest
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]

MEASURED = "MEASURED"
UNMEASURED = "UNMEASURED"

AGREED = "CANONICAL_AGREED"
STALE = "STALE_COPIES"
UNRESOLVED = "UNRESOLVED_NO_CANONICAL"

TEST_TIMEOUT_SEC = 900

# --- the declared-value registry --------------------------------------------------------
# `canonical` names the ONE reader-of-record. `None` means no canonical source exists yet, which
# is a finding in itself, not a gap to be filled by picking a favourite.
DECLARED_VALUES: List[Dict[str, Any]] = [
    {
        "name": "sprint_start",
        "canonical": "scripts/ci/sprint_cycle.py",
        "canonical_note": ("SPRINT_START constant; `_load_state()` takes sprint_start from here "
                           "ALWAYS and never from the ledger, per roadmap_status.py's own comment"),
        "sites": [
            ("scripts/ci/sprint_cycle.py", r"SPRINT_START\s*=\s*dt\.date\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"),
            ("scripts/ci/sprint_ledger.json", r'"sprint_start"\s*:\s*"([0-9-]+)"'),
            ("apps/web/public/roadmap-status.json", r'"sprint_start"\s*:\s*"([0-9-]+)"'),
            ("dist/apps/web/roadmap-status.json", r'"sprint_start"\s*:\s*"([0-9-]+)"'),
            (".citadel-release/artifact/apps/web/roadmap-status.json", r'"sprint_start"\s*:\s*"([0-9-]+)"'),
        ],
    },
    {
        "name": "public_site_origin",
        "canonical": None,
        "canonical_note": ("NO declared canonical reader. README and the app's SITE_ORIGIN "
                           "disagree and nothing arbitrates. The competition owner must freeze one."),
        "sites": [
            ("README.md", r"https://(buildanddo\.[a-z]+)"),
            ("apps/web/src/lib/publicPages.js", r"SITE_ORIGIN\s*=\s*'https://(buildanddo\.[a-z]+)'"),
        ],
    },
]


def _norm(name: str, groups: Tuple[str, ...]) -> str:
    """Normalise a match so a date constant and a date string compare as the same value."""
    if name == "sprint_start" and len(groups) == 3:
        return "%04d-%02d-%02d" % (int(groups[0]), int(groups[1]), int(groups[2]))
    return groups[0]


def read_site(rel: str, pattern: str, name: str) -> Dict[str, Any]:
    p = ROOT / rel
    if not p.exists():
        return {"file": rel, "state": UNMEASURED, "value": None, "reason": "file absent"}
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        return {"file": rel, "state": UNMEASURED, "value": None, "reason": str(exc)[:80]}
    hits = [_norm(name, m if isinstance(m, tuple) else (m,))
            for m in re.findall(pattern, text)]
    if not hits:
        return {"file": rel, "state": UNMEASURED, "value": None,
                "reason": "declared pattern not found in this file"}
    uniq = sorted(set(hits))
    return {"file": rel, "state": MEASURED, "value": uniq[0], "all_values": uniq,
            "occurrences": len(hits),
            "internally_consistent": len(uniq) == 1}


def declared_value_audit() -> List[Dict[str, Any]]:
    """Check every value that has more than one home. This is the generalised defect."""
    out = []
    for spec in DECLARED_VALUES:
        name = spec["name"]
        sites = [read_site(rel, pat, name) for rel, pat in spec["sites"]]
        measured = [s for s in sites if s["state"] == MEASURED]
        values = sorted({s["value"] for s in measured})
        canonical_rel = spec["canonical"]
        canon = next((s for s in measured if s["file"] == canonical_rel), None) if canonical_rel else None

        if canonical_rel is None:
            verdict = UNRESOLVED if len(values) > 1 else AGREED
            stale = []
            if verdict == UNRESOLVED:
                reason = ("no canonical reader is declared for %r, so a disagreement cannot be "
                          "resolved from the repo. %s" % (name, spec["canonical_note"]))
            else:
                # AGREEMENT WITHOUT AN ARBITER IS NOT RESOLUTION. Printing the "they disagree"
                # note here contradicted the verdict the same line reported. They agree TODAY;
                # nothing prevents the next edit to either file from reopening it silently.
                reason = ("all %d copies currently read %r, but NO canonical reader is declared, so "
                          "this is agreement by coincidence rather than by arbitration. Any edit to "
                          "one copy reopens it with nothing to adjudicate."
                          % (len(measured), values[0] if values else None))
        elif canon is None:
            verdict, stale = UNMEASURED, []
            reason = "canonical source %s could not be read" % canonical_rel
        else:
            stale = [s["file"] for s in measured
                     if s["file"] != canonical_rel and s["value"] != canon["value"]]
            verdict = STALE if stale else AGREED
            reason = ("canonical %s = %r; %s"
                      % (canonical_rel, canon["value"],
                         "all other copies agree" if not stale
                         else "DIVERGENT copies: %s -- regenerate them from the canonical source, "
                              "do not hand-edit" % ", ".join(stale)))
        out.append({
            "name": name, "verdict": verdict, "canonical": canonical_rel,
            "canonical_value": canon["value"] if canon else None,
            "distinct_values": values, "stale_copies": stale,
            "reason": reason, "sites": sites,
            "canonical_note": spec["canonical_note"],
        })
    return out


# --- D21-1: complete public test results ------------------------------------------------
_ANSI = re.compile(r"\x1b\[[0-9;]*m")
_VITEST_LINE = re.compile(r"Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?"
                          r"\s*\((\d+)\)")

JUNIT_REPORT = "reports/junit/web.xml"


def parse_test_output(text: str) -> Dict[str, Any]:
    """Pull a complete result out of runner output. Absent numbers are UNMEASURED, never zero.

    ANSI IS STRIPPED FIRST. The runner colours its summary, so the literal bytes read
    `Tests \\x1b[22m \\x1b[1m\\x1b[31m34 failed` and a plain word-boundary regex finds nothing --
    which would have reported "no summary line" for a suite that printed a perfectly good one.
    """
    clean = _ANSI.sub("", text or "")
    m = _VITEST_LINE.search(clean)
    if not m:
        return {"state": UNMEASURED,
                "reason": "could not find a test summary line in the runner output"}
    failed = int(m.group(1) or 0)
    passed = int(m.group(2) or 0)
    skipped = int(m.group(3) or 0)
    total = int(m.group(4) or 0)
    failing = sorted(set(re.findall(r"(?:FAIL|×|❯)\s+(\S+\.(?:test|spec)\.[jt]sx?)", clean)))
    return {"state": MEASURED, "passed": passed, "failed": failed, "skipped": skipped,
            "total": total, "failing_files": failing, "source": "console summary",
            "green": failed == 0 and passed > 0}


def parse_junit(path: Optional[Path] = None) -> Dict[str, Any]:
    """The STRUCTURED result. D21-1 asks for complete results, and per-test XML is exactly that.

    Preferred over the console summary: it survives colouring, carries every case by name, and is
    a publishable artifact rather than a scrape.
    """
    import xml.etree.ElementTree as ET

    p = path or (ROOT / JUNIT_REPORT)
    if not p.exists():
        return {"state": UNMEASURED, "reason": "no JUnit report at %s" % JUNIT_REPORT}
    try:
        root = ET.parse(str(p)).getroot()
    except Exception as exc:  # noqa: BLE001
        return {"state": UNMEASURED, "reason": "unparseable JUnit XML: %s" % str(exc)[:110]}
    cases = list(root.iter("testcase"))
    if not cases:
        return {"state": UNMEASURED, "reason": "JUnit report contains zero testcases"}
    failing = []
    skipped = 0
    for c in cases:
        if c.find("skipped") is not None:
            skipped += 1
        bad = c.find("failure") if c.find("failure") is not None else c.find("error")
        if bad is not None:
            failing.append({"suite": c.get("classname") or "", "test": c.get("name") or "",
                            "message": (bad.get("message") or "")[:200]})
    failed = len(failing)
    total = len(cases)
    return {"state": MEASURED, "total": total, "failed": failed, "skipped": skipped,
            "passed": total - failed - skipped, "failing_tests": failing,
            "green": failed == 0, "source": JUNIT_REPORT,
            "report_path": str(p)}


def collect_test_results(run: bool = False) -> Dict[str, Any]:
    """D21-1. A suite that was not run is UNMEASURED -- never an absent-therefore-green badge.

    Reads the JUnit artifact FIRST when one exists, because per-test XML is the complete result the
    criterion asks for; the console summary is a fallback and says so in `source`.
    """
    if not run:
        j = parse_junit()
        if j["state"] == MEASURED:
            return dict(j, ran=False,
                        note=("from a previously written JUnit report, not a run in this process; "
                              "re-run with --run-tests for a result bound to right now"))
        return {"state": UNMEASURED, "ran": False,
                "reason": ("test suite not executed and %s. D21-1 requires a COMPLETE published "
                           "result, so no badge is emitted from a run that did not happen"
                           % j["reason"]),
                "command": "npm test"}
    t0 = time.time()
    try:
        proc = subprocess.run(["npm", "test"], cwd=str(ROOT), capture_output=True, text=True,
                              timeout=TEST_TIMEOUT_SEC, shell=(sys.platform == "win32"))
        out = (proc.stdout or "") + "\n" + (proc.stderr or "")
        junit = parse_junit()
        parsed = junit if junit["state"] == MEASURED else parse_test_output(out)
        parsed.update({"ran": True, "returncode": proc.returncode,
                       "elapsed_sec": round(time.time() - t0, 1), "command": "npm test"})
        return parsed
    except subprocess.TimeoutExpired:
        return {"state": UNMEASURED, "ran": True, "command": "npm test",
                "reason": "suite exceeded %ds; a timeout is not a pass" % TEST_TIMEOUT_SEC}
    except Exception as exc:  # noqa: BLE001
        return {"state": UNMEASURED, "ran": True, "command": "npm test",
                "reason": "runner failed: %s: %s" % (type(exc).__name__, str(exc)[:110])}


# --- D21-2: the honest open list --------------------------------------------------------
def open_items() -> Dict[str, Any]:
    """D21-2, compiled from the anchor rather than written by hand."""
    # Drive the anchor through its CLI, which is its actual interface. `tools/` is not an
    # importable package in this repo, so an `import tools.progression_anchor` raises
    # ModuleNotFoundError -- and catching that would have reported "no open items" for a reason
    # that has nothing to do with the sprint.
    script = ROOT / "tools" / "progression_anchor.py"
    if not script.exists():
        return {"state": UNMEASURED, "reason": "no progression_anchor.py at %s" % script}
    try:
        proc = subprocess.run([sys.executable, str(script), "--json"], cwd=str(ROOT),
                              capture_output=True, text=True, timeout=300)
    except Exception as exc:  # noqa: BLE001
        return {"state": UNMEASURED,
                "reason": "anchor CLI failed: %s: %s" % (type(exc).__name__, str(exc)[:110])}
    try:
        payload = json.loads(proc.stdout or "")
    except Exception:  # noqa: BLE001
        return {"state": UNMEASURED,
                "reason": ("anchor --json emitted no parseable payload (rc=%s); stderr: %s"
                           % (proc.returncode, (proc.stderr or "")[:140]))}
    if not isinstance(payload, dict):
        return {"state": UNMEASURED, "reason": "anchor payload was not an object"}

    rows: List[Dict[str, Any]] = []

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            if "verdict" in o and ("id" in o or "criterion" in o):
                rows.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(payload)
    # A row carries a `blocked_by`-shaped key whether or not it is blocked, so scanning the row's
    # JSON for "BLOCK" matched 27 of 27 -- a detector that fires on everything measures nothing.
    # Only a NON-EMPTY blocker field counts.
    def _is_blocked(r: Dict[str, Any]) -> bool:
        for k, v in r.items():
            if "block" in k.lower() and isinstance(v, (str, list, dict)) and v:
                return True
        return False

    blocked = [r for r in rows if _is_blocked(r)]
    unverified = [r for r in rows
                  if str(r.get("verdict", "")).startswith(("implemented", "partial", "operational"))
                  or "unverified" in str(r.get("verdict", ""))]
    absent = [r for r in rows if str(r.get("verdict", "")).startswith(("missing", "not_satisfied"))]
    return {
        "state": MEASURED, "open_total": len(rows),
        "built_but_unverified": len(unverified),
        "genuinely_absent": len(absent),
        "operator_blocked": len(blocked),
        "items": [{"id": r.get("id") or r.get("criterion"), "verdict": r.get("verdict"),
                   "next": r.get("next")} for r in rows],
        "note": ("counts are disjoint only where the verdicts are; an item can be both blocked and "
                 "unverified, so these are views over one list, not a partition"),
    }


# --- compile ----------------------------------------------------------------------------
def compile_day21(run_tests: bool = False) -> Dict[str, Any]:
    values = declared_value_audit()
    tests = collect_test_results(run_tests)
    items = open_items()
    blockers = [v for v in values if v["verdict"] in (STALE, UNRESOLVED)]
    return {
        "schema": "buildanddo.day21-closure/v1",
        "srs": "SRS-BUILDANDDO-DECLARED-VALUES-001",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sprint_day_note": ("milestones fall on ODD days only, so there is no Day-20 criterion; "
                            "Day 20 is the working day and Day 21 is the final milestone"),
        "declared_values": values,
        "D21_1_public_test_results": tests,
        "D21_2_open_items": items,
        "D21_3_roadmap_readback": {
            "state": "OPERATOR_BLOCKED",
            "reason": ("blocked on a staging/production deploy. The local artifact is correct; the "
                       "public payload must be published so it agrees. Deploys are operator-run "
                       "and this module does not attempt one."),
        },
        "blockers": [{"name": b["name"], "verdict": b["verdict"], "reason": b["reason"]}
                     for b in blockers],
        # "READY TO CLOSE" MUST MEAN ALL THREE CRITERIA CAN CLOSE, not merely that the declared
        # values agree and a test run happened. The earlier version reported True while D21-3 was
        # OPERATOR_BLOCKED and 35 tests were failing -- an overclaim in the one field a reader
        # would quote. Each criterion is now judged on its own terms.
        "criteria_closable": {
            "D21-1": tests.get("state") == MEASURED,
            "D21-2": items.get("state") == MEASURED,
            "D21-3": False,  # operator deploy; not closable from this seat at all
        },
        "ready_to_close_day21": False,
        "ready_reason": (
            "D21-3 is OPERATOR_BLOCKED on a staging/production deploy, so Day 21 cannot close from "
            "this seat regardless of the other two. Declared-value blockers: %d." % len(blockers)),
    }


def render(r: Optional[Dict[str, Any]] = None) -> str:
    r = r if r is not None else compile_day21()
    out = [
        "DAY-21 CLOSURE  (SRS-BUILDANDDO-DECLARED-VALUES-001)  %s" % r["generated_at"],
        "  %s" % r["sprint_day_note"],
        "",
        "  DECLARED VALUES (one value, several homes -- the shared defect)",
    ]
    for v in r["declared_values"]:
        out.append("    %-20s %s" % (v["name"], v["verdict"]))
        out.append("        %s" % v["reason"])
        for s in v["sites"]:
            out.append("          %-52s %s" % (s["file"], s.get("value") or s.get("reason")))
    t = r["D21_1_public_test_results"]
    out += ["", "  D21-1  public test results"]
    if t["state"] == MEASURED:
        out.append("        %d passed · %d failed · %d skipped of %d  (green=%s)"
                   % (t["passed"], t["failed"], t.get("skipped", 0), t["total"], t["green"]))
        for f in t.get("failing_files", [])[:8]:
            out.append("          FAIL %s" % f)
    else:
        out.append("        UNMEASURED - %s" % t["reason"])
    i = r["D21_2_open_items"]
    out += ["", "  D21-2  open items"]
    if i["state"] == MEASURED:
        out.append("        %d open · %d built-but-unverified · %d genuinely absent · %d blocked"
                   % (i["open_total"], i["built_but_unverified"], i["genuinely_absent"],
                      i["operator_blocked"]))
    else:
        out.append("        UNMEASURED - %s" % i["reason"])
    out += ["", "  D21-3  %s" % r["D21_3_roadmap_readback"]["state"],
            "        %s" % r["D21_3_roadmap_readback"]["reason"],
            "", "  CLOSABLE PER CRITERION: %s" % r["criteria_closable"],
            "  READY TO CLOSE DAY 21: %s" % r["ready_to_close_day21"],
            "    %s" % r["ready_reason"]]
    for b in r["blockers"]:
        out.append("    BLOCKER  %-20s %s" % (b["name"], b["verdict"]))
    return "\n".join(out)


# --- selftest ---------------------------------------------------------------------------
def _selftest() -> int:
    checks: List[Tuple[str, bool]] = []

    def ck(n: str, c: bool) -> None:
        checks.append((n, bool(c)))

    # -- the date constant really is normalised to compare with the JSON strings
    ck("a date constant normalises to an ISO string",
       _norm("sprint_start", ("2026", "9", "1")) == "2026-09-01")
    ck("a plain string value passes through", _norm("other", ("x",)) == "x")

    audit = declared_value_audit()
    by = {a["name"]: a for a in audit}
    ck("both declared values are audited", set(by) == {"sprint_start", "public_site_origin"})

    # -- sprint_start: canonical exists, so divergence is STALE and nameable
    ss = by["sprint_start"]
    ck("sprint_start names a canonical source", ss["canonical"] == "scripts/ci/sprint_cycle.py")
    ck("the canonical sprint_start was actually read", ss["canonical_value"] is not None)
    ck("the canonical value is the code constant, not the ledger",
       ss["canonical_value"] == "2026-09-01")
    # STATE-INDEPENDENT. These previously asserted the tree was BROKEN (divergent copies), so they
    # failed the moment the divergence was repaired -- a test that encodes a defect as an
    # expectation and then blocks its own fix. THIRD instance of that shape in this file.
    # Assert the RULE instead: divergence <-> STALE, agreement <-> AGREED, always with a reason.
    ck("verdict follows divergence, whichever way the tree currently sits",
       (ss["verdict"] == STALE) == (len(ss["distinct_values"]) > 1))
    ck("a STALE verdict names its divergent copies and says regenerate",
       ss["verdict"] != STALE or (ss["stale_copies"] and "regenerate" in ss["reason"]))
    ck("an AGREED verdict names the canonical value",
       ss["verdict"] != AGREED or bool(ss["canonical_value"]))
    # Assert the MECHANISM, not a snapshot of today's repo. This previously hard-coded that the
    # ledger was stale and began failing the moment the ledger was corrected -- a test that
    # encoded a defect as an expectation and would have blocked its own fix.
    ck("every stale copy is named in the reason",
       all(f in ss["reason"] for f in ss["stale_copies"]))
    ck("the ledger now AGREES with the canonical constant (it was corrected this session)",
       "scripts/ci/sprint_ledger.json" not in ss["stale_copies"])


    # -- site origin: NO canonical, so the module must refuse to pick
    so = by["public_site_origin"]
    ck("the site origin has NO canonical reader", so["canonical"] is None)
    ck("the origin verdict follows the tree, not a hard-coded expectation",
       (so["verdict"] == UNRESOLVED) == (len(so["distinct_values"]) > 1))
    ck("...and no canonical value is ever nominated without an arbiter",
       so["canonical_value"] is None)
    ck("...the reason says the owner must freeze it", "freeze" in so["canonical_note"].lower())
    # GUARD: the printed reason must not contradict the verdict it accompanies.
    if so["verdict"] == AGREED:
        ck("an AGREED verdict does not print a 'they disagree' reason",
           "disagree" not in so["reason"])
        ck("...and names it agreement by coincidence, not resolution",
           "coincidence" in so["reason"])
    else:
        ck("an UNRESOLVED verdict explains the missing arbiter", "canonical reader" in so["reason"])
        ck("...and points at the owner", "freeze" in so["reason"].lower())

    # -- a missing file is UNMEASURED, never a silent agreement
    miss = read_site("__no_such_file__.json", r'"x"\s*:\s*"([^"]+)"', "x")
    ck("a missing file is UNMEASURED", miss["state"] == UNMEASURED)
    ck("...and says the file is absent", miss["reason"] == "file absent")
    nohit = read_site("package.json", r'"__never_present__"\s*:\s*"([^"]+)"', "x")
    ck("a file without the pattern is UNMEASURED, not a match",
       nohit["state"] == UNMEASURED and nohit["value"] is None)

    # -- D21-1 must never emit a green badge from a run that did not happen.
    # Hermetic: assert the NO-ARTIFACT branch against a path that cannot exist, rather than
    # depending on whether a JUnit report happens to be on disk right now. (This assertion
    # previously read t["reason"] and died once a real report appeared -- a test that passed only
    # while the repo was in one particular state.)
    nofile = parse_junit(ROOT / "__no_such_junit__.xml")
    ck("a missing JUnit report is UNMEASURED", nofile["state"] == UNMEASURED)
    ck("...and is explicitly not green", "green" not in nofile)
    ck("...and names the missing report", "no JUnit report" in nofile["reason"])

    t = collect_test_results(run=False)
    if t["state"] == MEASURED:
        ck("an unrun collect sourced from the JUnit artifact says so",
           t.get("source") == JUNIT_REPORT and t.get("ran") is False)
        ck("...and flags that it is not bound to this run", "not a run in this process" in t["note"])
    else:
        ck("an unrun collect with no artifact is UNMEASURED", t["state"] == UNMEASURED)
        ck("...and says how to run it", "--run-tests" in t["reason"])

    # -- the output parser reports failures rather than rounding them away
    red = parse_test_output("Tests  3 failed | 40 passed | 1 skipped (44)\n FAIL src/a.test.js")
    ck("a red suite parses as MEASURED", red["state"] == MEASURED)
    ck("...with the failure count preserved", red["failed"] == 3)
    ck("...and is NOT reported green", red["green"] is False)
    ck("...and names a failing file", "src/a.test.js" in red["failing_files"])
    green = parse_test_output("Tests  44 passed (44)")
    ck("a genuinely green suite reports green", green["green"] is True)
    ck("ANSI-coloured runner output still parses",
       parse_test_output("Tests [22m [1m[31m34 failed[39m | "
                         "[32m447 passed[39m | 14 skipped (495)")["failed"] == 34)
    ck("unparseable output is UNMEASURED, not zero failures",
       parse_test_output("no summary here")["state"] == UNMEASURED)

    # -- the compiled view refuses to declare Day 21 closeable while blockers stand
    r = compile_day21(run_tests=False)
    ck("compile reports D21-3 as operator-blocked",
       r["D21_3_roadmap_readback"]["state"] == "OPERATOR_BLOCKED")
    ck("...and does not attempt a deploy", "does not attempt" in r["D21_3_roadmap_readback"]["reason"])
    # Also state-independent: blockers exist only when a declared value is STALE/UNRESOLVED.
    _expected_blockers = [v for v in r["declared_values"] if v["verdict"] in (STALE, UNRESOLVED)]
    ck("the blocker list matches the declared-value verdicts",
       len(r["blockers"]) == len(_expected_blockers))
    ck("every surfaced blocker carries its reason",
       all(b.get("reason") for b in r["blockers"]))

    # -- D21-2 must reach the anchor through its CLI, not a package import that cannot resolve
    oi = r["D21_2_open_items"]
    ck("D21-2 actually reaches the anchor", oi["state"] == MEASURED)
    ck("...and finds the open criteria", oi.get("open_total", 0) > 0)
    ck("...and separates built-but-unverified from genuinely absent",
       oi.get("built_but_unverified", 0) > 0 and "genuinely_absent" in oi)
    ck("...and does not claim its views are a partition", "partition" in oi.get("note", ""))
    ck("the blocked detector does NOT fire on every row (it did: 27 of 27)",
       oi["operator_blocked"] < oi["open_total"])
    ck("...and still finds the genuinely blocked one", oi["operator_blocked"] >= 1)
    ck("readiness is per-criterion, not one averaged flag",
       set(r["criteria_closable"]) == {"D21-1", "D21-2", "D21-3"})
    ck("D21-3 can never be closed from this seat", r["criteria_closable"]["D21-3"] is False)
    ck("overall readiness is False while D21-3 is operator-blocked",
       r["ready_to_close_day21"] is False)
    ck("...and says WHY rather than just False", "OPERATOR_BLOCKED" in r["ready_reason"])
    ck("the Day-20 structural note is carried", "no Day-20 criterion" in r["sprint_day_note"])

    passed = sum(1 for _n, ok in checks if ok)
    for n, ok in checks:
        print("  %s %s" % ("PASS" if ok else "FAIL", n))
    print("\n  selftest: %d/%d" % (passed, len(checks)))
    return 0 if passed == len(checks) else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Compile the Day-21 milestone from measured state.")
    ap.add_argument("--run-tests", action="store_true", help="execute the suite (slow)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return _selftest()
    r = compile_day21(run_tests=a.run_tests)
    print(json.dumps(r, indent=2, sort_keys=True) if a.json else render(r))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
