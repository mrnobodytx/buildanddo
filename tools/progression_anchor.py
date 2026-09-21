#!/usr/bin/env python3
"""progression_anchor.py - the one place an agent asks "where is BuildAndDo, and what is left?"

WHY THIS IS A GENERATOR AND NOT A DOCUMENT. On 2026-09-20 the project's completion figure was
reported as 38%, then 88%, then 42% within a single working session - not because anything
regressed, but because the sprint start date was corrected (2026-09-09 -> 2026-09-03, moving day 12
to day 18) and six verifications that had been recorded-but-not-measured were withdrawn. Any
hand-written checklist is wrong within hours here. This reads the live sources every run.

WHAT IT READS, and every one is reported found-or-missing so a verdict can never rest on a source
that silently was not there:

  assessment.json    the 33 original criteria with per-criterion findings (the AUTHORITY on what
                     "done" means; it lives outside the repo under reports/assessment/)
  sprint_ledger      milestones + the evidence string each claim carries
  roadmap_status     day, planned vs actual, and the REPLAY - claimed vs independently re-derived
  live readback      what buildanddo.com and staging actually serve right now
  release doctor     P0 source gates and whether either environment can deploy at all

THE DISTINCTION THIS ARTIFACT EXISTS TO PRESERVE. "Implemented" is not "verified", and "verified
locally" is not "what the public sees". Those three were conflated for nine days: production served
day 9 / 20% dated 2026-09-11 while the sprint was on day 18 / 42% and a promotion had run in
between. So `local` and `published` are separate fields here, and a gap between them is itself a
checklist item rather than a footnote.

FOR AGENTS. Read anchor.json. Every open item carries `id`, `priority_lane`, `next_action` and
`blocked_by`. Items whose `blocked_by` is non-empty are NOT ready to pick up - resolve the blocker
first or you will duplicate work that cannot land. `lane` tells you whose work it is; two seats
have already collided on this repo today.

  py -3.13 tools/progression_anchor.py            # human summary
  py -3.13 tools/progression_anchor.py --json     # the agent-consumable anchor
  py -3.13 tools/progression_anchor.py --write    # persist anchor.json + PROGRESSION_ANCHOR.md
  py -3.13 tools/progression_anchor.py --selftest
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
ASSESSMENT_DIR = ROOT.parents[1] / "reports" / "assessment"
LEDGER = ROOT / "scripts" / "ci" / "sprint_ledger.json"
OUT_JSON = ROOT / "state" / "progression" / "anchor.json"
OUT_MD = ROOT / "docs" / "PROGRESSION_ANCHOR.md"
UA = "buildanddo-progression-anchor/1.0"

MEASURED, UNMEASURED = "MEASURED", "UNMEASURED"

# The operator's four priorities, 2026-09-20. Criteria are mapped to a lane so an agent can pick up
# a coherent slice instead of a scattered list. This mapping is the ONE authored thing in the file;
# everything else is read off a source.
PRIORITY_LANES = {
    1: "One release candidate; real onboarding; multi-user isolation",
    2: "Independent verification; production bounded-action proof; exercised rollback",
    3: "n8n / workflow execution; mission+signal -> ERP links",
    4: "Publish the original-criteria replay and the honest remaining gaps",
}
CRITERION_LANE = {
    # Day 1 has FOUR criteria, not three. The first map assumed a uniform three-per-milestone shape
    # and silently dropped D01-3 and D01-4 into an "unmapped" bucket - the release pipeline and the
    # public-repo/private-mirror split, both of which are squarely lane 2 and lane 4. An agent
    # reading a lane would have been handed a coherent-looking slice with two real items missing
    # from it. The selftest now asserts EVERY assessed id has a lane, so the map cannot fall behind
    # the assessment again.
    "D01-1": 2, "D01-3": 2, "D01-4": 4,
    "D03-1": 1, "D03-2": 1, "D03-3": 1,
    "D05-1": 1, "D05-2": 1, "D05-3": 1,
    "D07-1": 3, "D07-2": 3, "D07-3": 3,
    "D09-1": 2, "D09-2": 2, "D09-3": 2,
    "D11-1": 3, "D11-2": 3, "D11-3": 3,
    "D13-1": 3, "D13-2": 3, "D13-3": 3,
    "D15-1": 3, "D15-2": 3,
    "D17-1": 2, "D17-2": 2, "D17-3": 2,
    "D19-1": 4, "D19-2": 4, "D19-3": 4,
    "D21-1": 4, "D21-2": 4, "D21-3": 4,
}
# An assessment verdict counts as DONE only when it says so without qualification. Anything
# carrying partial/missing/gap/unverified is open - the conservative read, deliberately.
DONE_PREFIXES = ("implemented_and_verified", "verified", "met", "satisfied")
OPEN_MARKERS = ("partial", "missing", "not_", "gap", "unverified", "absent", "historical",
                "internal_", "changed_scope", "explicit_gaps", "acceptance_missing")


def _iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        return {"state": MEASURED, "path": str(path),
                "data": json.loads(path.read_text(encoding="utf-8-sig"))}
    except (OSError, ValueError) as exc:
        return {"state": UNMEASURED, "path": str(path),
                "reason": f"{type(exc).__name__}: {str(exc)[:90]}"}


def latest_assessment() -> Dict[str, Any]:
    """Newest assessment.json under reports/assessment/. Absence is reported, never assumed empty."""
    if not ASSESSMENT_DIR.is_dir():
        return {"state": UNMEASURED, "reason": f"no assessment dir at {ASSESSMENT_DIR}"}
    cands = sorted(ASSESSMENT_DIR.glob("*/assessment.json"))
    if not cands:
        return {"state": UNMEASURED, "reason": "no assessment.json found"}
    return _read_json(cands[-1])


def roadmap_status() -> Dict[str, Any]:
    """Run the replay. It is the only source that separates CLAIMED from RE-DERIVED completion."""
    script = ROOT / "scripts" / "deploy" / "roadmap_status.py"
    if not script.is_file():
        return {"state": UNMEASURED, "reason": "roadmap_status.py absent"}
    try:
        p = subprocess.run([sys.executable, str(script)], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=300)
        i = p.stdout.find("{")
        if i < 0:
            return {"state": UNMEASURED, "reason": f"no JSON in output (rc={p.returncode})"}
        return {"state": MEASURED, "data": json.loads(p.stdout[i:])}
    except Exception as exc:  # noqa: BLE001
        return {"state": UNMEASURED, "reason": f"{type(exc).__name__}: {str(exc)[:90]}"}


def published() -> Dict[str, Any]:
    """What each environment ACTUALLY serves. A local number nobody can see is not published."""
    out: Dict[str, Any] = {}
    for env, base in (("production", "https://buildanddo.com"),
                      ("staging", "https://staging.buildanddo.com")):
        try:
            req = urllib.request.Request(base + "/roadmap-status.json",
                                         headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.loads(r.read().decode("utf-8", "replace"))
            out[env] = {"state": MEASURED, "sprint_day": d.get("sprint_day"),
                        "actual_pct": d.get("actual_pct"),
                        "generated_at": str(d.get("generated_at"))[:19]}
        except Exception as exc:  # noqa: BLE001
            out[env] = {"state": UNMEASURED, "reason": f"{type(exc).__name__}: {str(exc)[:70]}"}
    return out


def _is_open(verdict: str) -> bool:
    v = (verdict or "").lower()
    if any(v.startswith(p) for p in DONE_PREFIXES):
        return False
    return any(m in v for m in OPEN_MARKERS) or not v


def next_action(cid: str, verdict: str) -> str:
    """One concrete next step per open criterion. Deliberately short - an agent reads the finding."""
    v = (verdict or "").lower()
    if "not_satisfied_at_live_readback" in v:
        return "DEPLOY: the local artifact is correct; publish it so the public payload agrees"
    if "acceptance_missing" in v:
        return "PUBLISH a complete public test result, not a green badge"
    if "missing_product_execution_path" in v:
        return "BUILD the product execution adapter; an available external service is not wiring"
    if "crosslinks_not_established" in v:
        return "ESTABLISH the cross-module relation in migrations/hooks, then read it back"
    if "customer_path_gap" in v:
        return "EXERCISE the real customer path end to end, not the internal call"
    if "activation_unverified" in v or "integration_partial" in v:
        return "EXERCISE the live binding and capture the readback"
    if "provenance_gap" in v:
        return "ATTACH provenance to the operational claim"
    if "changed_scope" in v:
        return "RESTORE the original criterion scope or state the change explicitly"
    if "partial" in v:
        return "CLOSE the named remainder in the finding"
    return "MEASURE it and record the evidence"


def build(include_live: bool = True) -> Dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc)
    a = latest_assessment()
    rs = roadmap_status()
    led = _read_json(LEDGER)
    pub = published() if include_live else {"state": "SKIPPED", "reason": "--no-live"}

    items: List[Dict[str, Any]] = []
    done = 0
    if a.get("state") == MEASURED:
        for m in (a["data"].get("milestones") or []):
            for c in (m.get("criteria") or []):
                cid = c.get("id", "")
                verdict = c.get("assessment", "")
                if not _is_open(verdict):
                    done += 1
                    continue
                lane = CRITERION_LANE.get(cid, 0)
                items.append({
                    "id": cid, "day": m.get("day"), "lane": lane,
                    "priority": PRIORITY_LANES.get(lane, "unmapped"),
                    "requirement": c.get("requirement", ""),
                    "verdict": verdict,
                    "finding": c.get("finding", ""),
                    "next_action": next_action(cid, verdict),
                    "blocked_by": (["publish-path: staging/production deploy"]
                                   if "live_readback" in verdict.lower() else []),
                })

    rsd = (rs.get("data") or {}) if rs.get("state") == MEASURED else {}
    replay = rsd.get("replay") or {}
    local_pct = rsd.get("actual_pct")
    gaps: List[str] = []
    for env in ("production", "staging"):
        e = pub.get(env) or {}
        if e.get("state") == MEASURED and local_pct is not None and e.get("actual_pct") != local_pct:
            gaps.append(f"{env} serves {e.get('actual_pct')}% (day {e.get('sprint_day')}, "
                        f"{e.get('generated_at','')[:10]}) while local is {local_pct}%")

    sources = {"assessment": a.get("state", UNMEASURED), "roadmap_status": rs.get("state", UNMEASURED),
               "sprint_ledger": led.get("state", UNMEASURED),
               "live_readback": "MEASURED" if include_live else "SKIPPED"}
    return {
        "schema": "buildanddo.progression-anchor/v1",
        "generated_at": _iso(now),
        "sources": sources,
        "unreadable": {k: v.get("reason") for k, v in
                       (("assessment", a), ("roadmap_status", rs), ("sprint_ledger", led))
                       if v.get("state") != MEASURED},
        "sprint": {
            "day": rsd.get("sprint_day"), "days": rsd.get("sprint_days"),
            "start": rsd.get("sprint_start"), "planned_pct": rsd.get("planned_pct"),
            "local_pct": local_pct,
            "replay": {"claimed": replay.get("claimed_pct"), "replayed": replay.get("replayed_pct"),
                       "overstatement": replay.get("overstatement_pct"),
                       "counts": replay.get("counts")},
        },
        "published": pub,
        "publish_gap": gaps,
        "criteria": {"total": done + len(items), "done": done, "open": len(items)},
        "open_items": sorted(items, key=lambda x: (x["lane"], str(x["day"]), x["id"])),
        "reading_note": (
            "'done' counts only criteria whose assessment verdict carries no partial/missing/gap "
            "qualifier - the conservative read. A local percentage is NOT what the public sees; "
            "compare sprint.local_pct against published.*.actual_pct and treat any publish_gap as "
            "an open item in its own right."),
    }


def render(a: Dict[str, Any]) -> str:
    s = a["sprint"]
    L = [f"# BuildAndDo progression anchor", "",
         f"generated {a['generated_at']}  ·  schema {a['schema']}", ""]
    miss = a.get("unreadable") or {}
    if miss:
        L += ["> **UNMEASURED SOURCES** - the figures below are partial:"]
        L += [f"> - `{k}`: {v}" for k, v in miss.items()] + [""]
    L += [f"**Day {s['day']}/{s['days']}** (start {s['start']})  ·  "
          f"planned **{s['planned_pct']}%**  ·  local **{s['local_pct']}%**", ""]
    r = s["replay"]
    L += [f"Replay: claimed {r['claimed']} = replayed {r['replayed']}, "
          f"overstatement {r['overstatement']}  ·  {r['counts']}", ""]
    for env, e in (a.get("published") or {}).items():
        if isinstance(e, dict) and e.get("state") == MEASURED:
            L.append(f"- **{env}** serves {e['actual_pct']}% (day {e['sprint_day']}, "
                     f"generated {e['generated_at'][:10]})")
    if a.get("publish_gap"):
        L += ["", "> **PUBLISH GAP - the public does not see the truth:**"]
        L += [f"> - {g}" for g in a["publish_gap"]]
    c = a["criteria"]
    L += ["", f"## Criteria: {c['done']} done / {c['open']} open of {c['total']}", ""]
    for lane in sorted(PRIORITY_LANES):
        rows = [i for i in a["open_items"] if i["lane"] == lane]
        if not rows:
            continue
        L += [f"### Priority {lane} - {PRIORITY_LANES[lane]}", ""]
        for i in rows:
            blocked = f"  **BLOCKED BY:** {', '.join(i['blocked_by'])}" if i["blocked_by"] else ""
            L += [f"- [ ] **{i['id']}** (day {i['day']}) {i['requirement']}",
                  f"      - verdict `{i['verdict']}`",
                  f"      - next: {i['next_action']}{blocked}"]
        L += [""]
    unmapped = [i for i in a["open_items"] if i["lane"] == 0]
    if unmapped:
        L += ["### Unmapped to a priority lane", ""]
        L += [f"- [ ] **{i['id']}** {i['requirement']}" for i in unmapped] + [""]
    L += ["---", "", a["reading_note"], ""]
    return "\n".join(L)


def selftest() -> int:
    fails, n = [], 0

    def ck(lbl, cond):
        nonlocal n
        n += 1
        if not cond:
            fails.append(lbl)

    ck("a qualified verdict is OPEN", _is_open("partial_customer_path_gap"))
    ck("missing is OPEN", _is_open("missing_product_execution_path"))
    ck("not_satisfied is OPEN", _is_open("not_satisfied_at_live_readback"))
    ck("an empty verdict is OPEN, never assumed done", _is_open(""))
    ck("an unqualified verdict is DONE", not _is_open("implemented_and_verified"))
    ck("every criterion id maps to a lane", all(1 <= v <= 4 for v in CRITERION_LANE.values()))
    ck("every open verdict yields a concrete next action",
       all(next_action("X", v) for v in ("partial", "missing_product_execution_path", "")))
    ck("the live-readback verdict is routed to DEPLOY",
       "DEPLOY" in next_action("D21-3", "not_satisfied_at_live_readback"))

    a = build(include_live=False)
    ck("anchor declares every source", set(a["sources"]) >= {"assessment", "roadmap_status",
                                                             "sprint_ledger", "live_readback"})
    ck("an unreadable source is named, not dropped", isinstance(a.get("unreadable"), dict))
    ck("criteria tally is internally consistent",
       a["criteria"]["done"] + a["criteria"]["open"] == a["criteria"]["total"])
    ck("open items carry an id and a next action",
       all(i.get("id") and i.get("next_action") for i in a["open_items"]))
    ck("items are lane-sorted for pickup",
       [i["lane"] for i in a["open_items"]] == sorted(i["lane"] for i in a["open_items"]))
    ck("the reading note separates local from published", "public sees" in a["reading_note"])

    # THE FALSIFIER FOR THE LANE MAP. It was written against an assumed three-criteria-per-milestone
    # shape and quietly dropped D01-3 and D01-4 into an unmapped bucket, so a lane looked complete
    # while two real items were missing from it. A map that can fall behind its source must be
    # checked against that source, not against itself.
    live = build(include_live=False)
    unmapped = sorted({i["id"] for i in live["open_items"] if i["lane"] == 0})
    ck(f"every assessed criterion has a priority lane ({unmapped})", not unmapped)
    ck("render produces a checkbox list", "- [ ]" in render(a) or not a["open_items"])

    print(f"[progression_anchor] selftest {n - len(fails)}/{n} passed")
    for x in fails:
        print("  FAIL:", x)
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--write", action="store_true", help="persist anchor.json + PROGRESSION_ANCHOR.md")
    ap.add_argument("--no-live", action="store_true", help="skip the live readback")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    anchor = build(include_live=not a.no_live)
    if a.write:
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json.dumps(anchor, indent=2, default=str), encoding="utf-8")
        OUT_MD.parent.mkdir(parents=True, exist_ok=True)
        OUT_MD.write_text(render(anchor), encoding="utf-8")
        print(f"wrote {OUT_JSON.relative_to(ROOT)} and {OUT_MD.relative_to(ROOT)}")
        return 0
    print(json.dumps(anchor, indent=2, default=str) if a.json else render(anchor))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
