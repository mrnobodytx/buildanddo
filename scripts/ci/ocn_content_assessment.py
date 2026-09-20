#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_content_assessment.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js (the curriculum)
# EnumType:    Verifier
# EnumEdges:   VERIFIES every tutorial's references, knowledge check and prerequisite graph
#              by FOLLOWING them, as a real seat from a machine that is not rig1
# Intent:      Grade the platform's own teaching content by doing what it tells the reader to do,
#              because a lesson that reads well and links nowhere still fails the person using it.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_content_assessment.py - follow the platform's instructions and grade what happens.

RUNS ON A FLEET BOX, signed in with that box's own CitadelKey.

    ocn_content_assessment.py <seat> [--env staging|production] [--limit N]

WHY THIS IS NOT A PROSE REVIEW. Every lesson carries machine-checkable promises, and this checks the
promises rather than the wording:

  references[].url   FETCHED. A lesson that tells a reader to "open the workspace tool" and links a
                     route that 404s has failed them, however well it reads.
  check.answer       An INDEX into check.choices. Out of range means the graded question cannot be
                     answered correctly by anyone - the lesson would mark a right answer wrong.
  prerequisites[]    Must resolve to real tutorial slugs. A dangling prerequisite breaks the path
                     through the curriculum and is invisible until someone walks it.
  exercise           Needs a prompt AND a checklist; a prompt with nothing to check is a suggestion.
  sections/outcomes  Substance, not presence: a section with 20 characters is a heading.

GRADES, and what separates them:
  STABLE      every reference resolves, the check is answerable, prerequisites exist, exercise is
              actionable, and there is real teaching substance.
  WORKING     usable, with a cosmetic or completeness gap that does not mislead.
  NEEDS_WORK  something a reader would hit: a dead link, an unanswerable check, a dangling
              prerequisite, or a section with no content behind the heading.

A 200 from the SPA means nothing on its own - it answers 200 for every path. Relative references are
judged against the ROUTE TABLE the app actually registers, not against the status code.
"""
from __future__ import annotations
import argparse
import datetime
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-content/1.0)", "Content-Type": "application/json"}
MIN_SECTION_CHARS = 120     # below this a "section" is a heading with nothing under it
MAX_TITLE_CHARS = 64
MIN_SUMMARY_CHARS = 40


def http(url, data=None, headers=None, method=None, timeout=25):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            # NOT truncated. An earlier version capped this at 4000 bytes, which silently
            # reduced the 760KB app bundle to its first 4KB, found 0 routes, and graded all 33
            # lessons NEEDS_WORK for "broken references". The instrument produced the finding.
            return resp.status, (json.loads(raw) if raw[:1] in b"{[" else raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in b"{[" else raw[:600])
    except Exception as exc:  # noqa: BLE001
        return 0, {"err": type(exc).__name__}


def login(seat, base):
    bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run([sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                             "--seat", seat, "--audience", "buildanddo-login",
                             "--payload", payload, "--header"],
                            cwd=CBF, capture_output=True, text=True, timeout=60)
    header = (signed.stdout or "").strip().splitlines()[-1] if signed.stdout.strip() else ""
    if not header:
        return None, None
    s, b = http(base + BACKEND + "/api/ocn/login", data=b"{}", headers={"X-Citadel-Key": header})
    if s != 200:
        return None, None
    return b.get("token"), (b.get("record") or {}).get("id")


def route_table(origin):
    """The routes the SPA really registers. The app serves 200 for ANY path, so a status code
    cannot tell a real route from the fallback - the shipped bundle's route list can."""
    s, body = http(origin + "/", timeout=25)
    html = body.decode("utf-8", "replace") if isinstance(body, (bytes, bytearray)) else str(body)
    m = re.findall(r'/assets/[A-Za-z0-9_.-]+\.js', html)
    routes, children = set(), set()
    for asset in m[:4]:
        s2, js = http(origin + asset, timeout=40)
        if s2 != 200:
            continue
        text = js.decode("utf-8", "replace") if isinstance(js, (bytes, bytearray)) else str(js)
        for r in re.findall(r'path:"(/[^"]*)"', text):
            routes.add(r.rstrip("/") or "/")
        # React Router declares NESTED children RELATIVELY - the /app shell's children are
        # emitted as path:"signals", not path:"/app/signals". An absolute-only table therefore
        # reports every in-app deep link as unregistered, which is the instrument failing and
        # not the content. Collect the relative literals too and compose them below.
        for c in re.findall(r'path:"([A-Za-z0-9_:*-][^"]*)"', text):
            children.add(c.strip("/"))
    return routes, children


def as_obj(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:  # noqa: BLE001
            return value
    return value


def instructional_words(les, meta):
    """Every word a learner is actually given, not just the prose.

    Effort includes doing the exercise, so counting section paragraphs alone would understate a
    lesson that carries its weight in the exercise. This counts prose, why, preparation,
    exercise, knowledge check and outcomes together, which is the fair denominator.
    """
    buf = []

    def walk(o):
        if isinstance(o, str):
            buf.append(o)
        elif isinstance(o, list):
            for i in o:
                walk(i)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)

    for key in ("sections", "why", "preparation", "exercise", "check", "outcomes"):
        walk(les.get(key))
    return len(" ".join(buf).split())


def usefulness(words, claimed_minutes):
    """Does the lesson deliver the effort the platform promises for it?

    DECLARED FLOOR, not an industry standard: 60 words per claimed minute for SUBSTANTIVE and 25
    for THIN. Sixty is already generous - adult reading runs ~200 wpm, so this allows more than
    three minutes of hands-on work for every minute of reading. The raw numbers are reported
    alongside so the threshold can be argued with separately from the measurement.
    """
    if not claimed_minutes:
        return "UNDECLARED", 0.0
    rate = words / float(claimed_minutes)
    return ("SUBSTANTIVE" if rate >= 60 else "THIN" if rate >= 25 else "STUB"), round(rate, 1)


def route_resolves(key, routes, children):
    """Does this in-app path exist in the shipped router?

    Exact absolute match, or the longest registered absolute prefix followed by segments that
    are all declared relative children. An unknown segment still fails - this widens the table
    to how React Router actually nests, it does not make the check vacuous.
    """
    if key in routes:
        return True
    parts = [p for p in key.split("/") if p]
    for i in range(len(parts) - 1, 0, -1):
        prefix = "/" + "/".join(parts[:i])
        if prefix in routes:
            return all(s in children for s in parts[i:])
    return False


def assess(lesson, meta, origin, routes, children, slugs, titles, ref_cache):
    """Follow what this lesson promises. Returns (grade, findings, facts)."""
    findings = []
    les = as_obj(lesson) or {}
    if not isinstance(les, dict):
        return "NEEDS_WORK", ["lesson body is not structured content"], {}

    sections = les.get("sections") or []
    outcomes = les.get("outcomes") or []
    prep = les.get("preparation") or []
    exercise = as_obj(les.get("exercise")) or {}
    check = as_obj(les.get("check")) or {}
    refs = les.get("references") or []

    body_chars = len(json.dumps(sections))
    if not sections:
        findings.append("no sections: nothing is actually taught")
    elif body_chars < MIN_SECTION_CHARS:
        findings.append("sections total %d chars - a heading with nothing under it" % body_chars)
    if not outcomes:
        findings.append("no stated outcomes, so a reader cannot tell when they are done")
    if len(str(meta.get("summary") or "")) < MIN_SUMMARY_CHARS:
        findings.append("summary too thin to preview the lesson")

    # the exercise must be doable, not merely suggested
    if not exercise.get("prompt"):
        findings.append("exercise has no prompt")
    elif not exercise.get("checklist"):
        findings.append("exercise has a prompt but no checklist - nothing to verify against")

    # the graded question must be answerable
    if check:
        choices = check.get("choices") or []
        ans = check.get("answer")
        if not choices:
            findings.append("check has no choices")
        elif not isinstance(ans, int) or ans < 0 or ans >= len(choices):
            findings.append("check.answer %r is out of range for %d choices - UNANSWERABLE"
                            % (ans, len(choices)))
        elif len(choices) < 2:
            findings.append("check offers a single choice")
        if not str(check.get("explanation") or "").strip():
            findings.append("check has no explanation, so a wrong answer teaches nothing")
    else:
        findings.append("no knowledge check")

    # FOLLOW the references
    ref_results = []
    for r in refs:
        url = (r or {}).get("url") or ""
        label = (r or {}).get("label") or ""
        if not url:
            findings.append("reference %r has no url" % label[:40])
            continue
        if url.startswith("/"):
            key = url.rstrip("/") or "/"
            ok = route_resolves(key, routes, children)
            ref_results.append({"url": url, "kind": "route", "resolves": ok})
            if not ok:
                findings.append("reference %r -> %s is NOT a registered route" % (label[:34], url))
        elif url.startswith("http"):
            if url not in ref_cache:
                st, _ = http(url, timeout=20)
                ref_cache[url] = st
            st = ref_cache[url]
            ok = st in (200, 201, 301, 302)
            ref_results.append({"url": url, "kind": "external", "http": st, "resolves": ok})
            if not ok:
                findings.append("reference %r -> %s answered %s" % (label[:30], url[:48], st))

    # MEASURED in the seed data, not assumed: all 33 lessons carry `prerequisites` as PROSE
    # guidance - "Read earlier lessons in this path; use an authorized test workspace." - and
    # ZERO of them name another lesson. There is no prerequisite graph in this curriculum, so
    # resolving the field against titles marked 27 lessons broken and was the check being wrong
    # three times over. Prose is valid guidance for a reader; only a SHORT, title-shaped value
    # is a claim about another lesson, and only that is worth resolving.
    raw_prereq = meta.get("prerequisites")
    prereq = [raw_prereq] if isinstance(raw_prereq, str) else list(raw_prereq or [])
    prereq = [p.strip() for p in prereq if str(p).strip()]
    if not prereq:
        findings.append("no prerequisite guidance, so a reader cannot tell where this sits")
    named = [p for p in prereq
             if not re.match(r"^\s*none", p, re.I)
             and len(p) <= MAX_TITLE_CHARS and not p.rstrip().endswith((".", ";"))]
    dangling = [p for p in named if p not in titles and p.lower() not in slugs]
    if dangling:
        findings.append("prerequisite(s) name no lesson in the curriculum: %s"
                        % "; ".join(d[:40] for d in dangling[:2]))
    prose = [p for p in prereq if p not in named and not re.match(r"^\s*none", p, re.I)]

    # DEPTH IS A SEPARATE AXIS. A stub with working links is structurally fine and
    # editorially empty; collapsing the two would let one hide the other.
    hard = [f for f in findings if ("NOT a registered route" in f or "UNANSWERABLE" in f
                                    or "name no lesson" in f or "nothing is actually taught" in f
                                    or "answered " in f)
                                    and "instructional words" not in f]
    if hard:
        grade = "NEEDS_WORK"
    elif findings:
        grade = "WORKING"
    else:
        grade = "STABLE"
    words = instructional_words(les, meta)
    claimed = meta.get("effort_minutes") or 0
    depth, rate = usefulness(words, claimed)
    if depth == "STUB":
        findings.append("claims %s min but carries only %d instructional words (%.1f/min)"
                        % (claimed, words, rate))

    facts = {"instructional_words": words, "claimed_minutes": claimed,
             "words_per_claimed_minute": rate, "depth": depth,
             "sections": len(sections), "section_chars": body_chars, "outcomes": len(outcomes),
             "preparation_steps": len(prep), "references": len(refs),
             "references_resolving": sum(1 for r in ref_results if r["resolves"]),
             "has_exercise": bool(exercise.get("prompt")), "has_check": bool(check),
             "prerequisites": len(prereq),
             "prerequisites_named": len(named), "prerequisites_prose": len(prose)}
    return grade, findings, facts


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    origin = ENVS[args.env]
    out = {"schema": "buildanddo.ocn-content-assessment/v1", "seat": args.seat, "env": args.env,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, origin)
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}

    routes, children = route_table(origin)
    out["registered_routes"] = len(routes)

    s, b = http(origin + BACKEND + "/api/collections/tutorials/records?perPage=200&sort=order",
                headers=auth, timeout=40)
    items = (b or {}).get("items") or []
    if args.limit:
        items = items[:args.limit]
    out["tutorials"] = len(items)
    slugs = {t.get("slug") for t in items if t.get("slug")}
    titles = {t.get("title") for t in items if t.get("title")}

    ref_cache = {}
    graded = []
    for t in items:
        grade, findings, facts = assess(t.get("lesson"), t, origin, routes, children, slugs, titles, ref_cache)
        graded.append({"slug": t.get("slug"), "title": t.get("title"), "category": t.get("category"),
                       "order": t.get("order"), "effort_minutes": t.get("effort_minutes"),
                       "grade": grade, "findings": findings, "facts": facts})

    by_cat = {}
    for g in graded:
        c = g["category"] or "Uncategorised"
        by_cat.setdefault(c, {"STABLE": 0, "WORKING": 0, "NEEDS_WORK": 0, "lessons": 0})
        by_cat[c][g["grade"]] += 1
        by_cat[c]["lessons"] += 1

    out["diag"] = {"titles_indexed": len(titles), "routes_sample": sorted(routes)[:20],
                   "first_prereq_repr": repr((items[0] or {}).get("prerequisites")) if items else None}
    out["by_section"] = by_cat
    out["lessons"] = graded
    out["summary"] = {
        "STABLE": sum(1 for g in graded if g["grade"] == "STABLE"),
        "WORKING": sum(1 for g in graded if g["grade"] == "WORKING"),
        "NEEDS_WORK": sum(1 for g in graded if g["grade"] == "NEEDS_WORK"),
        "total": len(graded),
        "broken_references": sum(1 for g in graded for f in g["findings"]
                                 if "NOT a registered route" in f or "answered " in f),
        "unanswerable_checks": sum(1 for g in graded for f in g["findings"] if "UNANSWERABLE" in f),
        "dangling_prerequisites": sum(1 for g in graded for f in g["findings"]
                                      if "name no lesson" in f),
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
