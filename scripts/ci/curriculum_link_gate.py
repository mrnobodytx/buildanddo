#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/curriculum_link_gate.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_migrations/data/*.json
# EnumType:    Gate
# EnumEdges:   REFUSES a curriculum containing a link a learner cannot follow
# Intent:      Probe every URL a learner can SEE, including the ones written into prose, because
#              the content assessor resolves only the structured references array and eight lessons
#              shipped pointing at a 404 underneath its "0 broken references".
# ─────────────────────────────────────────────────────────────────────────────
"""curriculum_link_gate.py - probe every link a learner can actually see.

    python3 curriculum_link_gate.py [--json]
    python3 curriculum_link_gate.py --selftest    # prove this gate can FAIL

WHY IT EXISTS. ocn_content_assessment.py reported `broken_references: 0` and
`references_resolving == references` for all 33 lessons, and it was right about what it looked at:
the structured `references` array. Every government lesson also ended with "Read the chapter
yourself at tcss.legis.texas.gov/resources/GV/htm/" - a DIRECTORY path returning 404, written in a
paragraph. A checker's clean field is a claim about its scope and says nothing about the rest.

BARE HOSTNAMES COUNT. The defect was written with no scheme, so a `https?://`-anchored pattern
would have missed it and the instrument would have reproduced the bug it exists to catch.

RESERVED NAMES ARE NOT FAILURES. RFC 2606 sets aside .example/.invalid/.test/.localhost and
example.{com,net,org} precisely so documentation can name a host that must never resolve. A worked
example using one is correct, and a gate that failed it would push authors toward naming a real
domain they do not control.

IT REFUSES ON UNKNOWNS. Finding no links at all exits non-zero: a probe that passes because it
extracted nothing is issuing a receipt, not a measurement.
"""
from __future__ import annotations
import argparse
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "apps" / "pocketbase" / "pb_migrations" / "data"
FILES = ("starter-tutorials.json", "government-submissions.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-link-gate/1.0)"}
TIMEOUT = 25
OK_STATUS = (200, 301, 302, 303, 307, 308)

# Scheme-ful, or a bare host followed by an optional path.
URL = re.compile(r"(?:https?://|(?<![\w.])(?=[a-z0-9-]+\.[a-z]{2,}))"
                 r"[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s,)\"'>]*)?", re.I)
# RFC 2606 / RFC 6761 reserved for documentation - these MUST NOT resolve.
RESERVED = re.compile(r"(?:^|\.)(?:example|invalid|test|localhost)$|"
                      r"(?:^|\.)example\.(?:com|net|org)$", re.I)
# A bare filename is not a host: "data.db", "context.md", "ship.py".
FILENAME = re.compile(r"^[\w.-]+\.(?:js|jsx|json|py|md|txt|db|yaml|yml|toml|lock|env|sh|ps1)"
                      r"(?:[.-][\w.-]*)?$", re.I)
# THE CONTROL IS THE DEFECT THAT ACTUALLY SHIPPED, not an invented dead host. The first version of
# this selftest planted a host ending in .test, which the gate exempts as an RFC 2606 documentation
# name - so it was never probed, the gate reported PASS on its own negative control, and the gate
# was briefly untrustworthy in exactly the way it exists to catch. This URL is the real directory
# path the eight government lessons pointed at, measured 404 while every chapter file returns 200.
PLANTED = "https://tcss.legis.texas.gov/resources/GV/htm/"


def strings_of(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            yield from strings_of(value, "%s[%d]" % (path, i))
    elif isinstance(obj, dict):
        for key, value in obj.items():
            yield from strings_of(value, "%s.%s" % (path, key))


def host_of(url):
    bare = re.sub(r"^https?://", "", url, flags=re.I)
    return bare.split("/")[0].split(":")[0]


def collect(docs):
    """Every learner-visible link, with where it was written and which lessons carry it."""
    found = {}
    for doc in docs:
        for lesson in doc.get("lessons") or []:
            for path, text in strings_of(lesson.get("lesson") or {}):
                structured = ".references[" in path
                for match in URL.finditer(text):
                    raw = match.group(0).rstrip(".,;:)")
                    if raw.startswith("/") or FILENAME.match(raw):
                        continue
                    entry = found.setdefault(raw.lower(), {
                        "url": raw, "lessons": set(), "structured": False, "prose": False})
                    entry["lessons"].add(lesson.get("slug"))
                    entry["structured" if structured else "prose"] = True
    return found


def probe(url):
    full = url if url.lower().startswith("http") else "https://" + url
    for method in ("HEAD", "GET"):
        try:
            request = urllib.request.Request(full, headers=UA, method=method)
            with urllib.request.urlopen(request, timeout=TIMEOUT) as resp:
                return resp.status, ""
        except urllib.error.HTTPError as exc:
            # Some hosts refuse HEAD outright; that is not a dead link.
            if method == "HEAD" and exc.code in (403, 405, 501):
                continue
            return exc.code, ""
        except Exception as exc:  # noqa: BLE001
            return 0, type(exc).__name__
    return 0, "unreachable"


def run(plant=False):
    out = {"schema": "buildanddo.curriculum-link-gate/v1", "selftest": plant}
    docs = []
    for name in FILES:
        path = DATA / name
        if not path.exists():
            out["state"] = "UNMEASURED"
            out["reason"] = "curriculum data missing at %s" % path
            return out
        docs.append(json.loads(path.read_text(encoding="utf-8")))

    found = collect(docs)
    if plant:
        # Plant a dead link IN PROSE, which is exactly where the real defect lived.
        found[PLANTED.lower()] = {"url": PLANTED, "lessons": {"__selftest__"},
                                  "structured": False, "prose": True}
    if not found:
        out["state"] = "UNMEASURED"
        out["reason"] = "no links extracted - the gate looked and found nothing to check"
        return out

    checked, reserved, broken = [], [], []
    for key in sorted(found):
        entry = found[key]
        where = ("both" if entry["structured"] and entry["prose"]
                 else "references" if entry["structured"] else "prose")
        row = {"url": entry["url"], "where": where, "lessons": sorted(entry["lessons"])}
        if RESERVED.search(host_of(entry["url"])):
            row["verdict"] = "RESERVED"
            row["note"] = "RFC 2606 documentation name - must not resolve, correct as written"
            reserved.append(row)
            continue
        status, err = probe(entry["url"])
        row["status"] = status
        if err:
            row["error"] = err
        if status in OK_STATUS:
            row["verdict"] = "OK"
            checked.append(row)
        else:
            row["verdict"] = "BROKEN"
            broken.append(row)

    out["probed"] = len(checked) + len(broken)
    out["reserved"] = len(reserved)
    out["in_prose"] = sum(1 for r in checked + broken if r["where"] in ("prose", "both"))
    out["broken"] = broken
    out["links"] = checked + reserved
    out["state"] = "FAIL" if broken else "PASS"
    out["verdict"] = ("%d link(s) a learner can see do not resolve" % len(broken) if broken else
                      "every learner-visible link resolves, including %d written in prose"
                      % out["in_prose"])
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true",
                        help="plant a dead link in prose and require this gate to catch it")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        clean = run(plant=False)
        planted = run(plant=True)
        ok = clean.get("state") == "PASS" and planted.get("state") == "FAIL"
        print(json.dumps({"schema": "buildanddo.curriculum-link-gate-selftest/v1",
                          "clean": clean.get("state"),
                          "with_a_planted_dead_link": planted.get("state"),
                          "verdict": "PASS" if ok else "FAIL",
                          "means": ("the gate passes a clean curriculum and REFUSES a dead link"
                                    if ok else
                                    "the gate cannot tell them apart and must not be trusted"),
                          "planted": PLANTED,
                          "caught": [b["url"] for b in (planted.get("broken") or [])]}, indent=1))
        return 0 if ok else 1

    result = run()
    if args.json:
        print(json.dumps(result, indent=1))
    else:
        for row in result.get("broken") or []:
            print("BROKEN  %-58s status=%s  in=%s  lessons=%s"
                  % (row["url"][:58], row.get("status"), row["where"], ", ".join(row["lessons"])))
        print("%s  probed=%s reserved=%s in_prose=%s  %s"
              % (result.get("state"), result.get("probed"), result.get("reserved"),
                 result.get("in_prose"), result.get("verdict") or result.get("reason")))
    return {"PASS": 0}.get(result.get("state"), 1)


if __name__ == "__main__":
    raise SystemExit(main())
