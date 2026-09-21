#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/verifier_control_gate.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/ocn_*.py
# EnumType:    Gate
# EnumEdges:   ENFORCES that every verifier carries a control it has been seen to fail
# Intent:      Stop a checker being trusted because it has only ever agreed with us. Three findings
#              this week were the instrument rather than the system, and each one arrived in the
#              shape of a real finding - so the gate asks every verifier to show a case it REFUSES.
# ─────────────────────────────────────────────────────────────────────────────
"""verifier_control_gate.py - a checker that has only been seen to pass has not been tested.

    python scripts/ci/verifier_control_gate.py            # report
    python scripts/ci/verifier_control_gate.py --strict   # exit 1 if any verifier lacks a control
    python scripts/ci/verifier_control_gate.py --selftest # prove THIS gate can fail

WHY THIS EXISTS. Measured this cycle, three separate findings were produced by broken instruments
and every one of them looked exactly like a real defect:

  * a 4000-byte truncation searched a 761KB bundle over its first 4KB, found no routes, and
    reported all 33 lessons broken
  * a patched regex carried an invisible 0x08 byte, so a filter that read as correct never matched
  * prerequisites were resolved against a graph the curriculum does not have, marking 27 lessons
    dangling

A broken checker does not raise. It returns a FINDING, in the same shape and the same confident
tone as a true one. The only defence that survives contact with that is a case the checker is
SHOWN to refuse.

WHAT COUNTS AS A CONTROL. Not the word "control" in a comment. The gate looks for a verifier that
does at least one of:

  * runs an input it expects to FAIL and asserts the failure (a negative control), or
  * carries a `--selftest` / `selftest(` path, or
  * documents a CONTROL: line naming what it must refuse

and it records WHICH of those it found, so "has a control" is never a bare boolean somebody has to
take on trust.

THIS GATE HAS ITS OWN CONTROL. `--selftest` feeds it a synthetic verifier with no control at all
and requires the gate to flag it. A gate that cannot demonstrate its own failure mode is the exact
thing it exists to prevent.
"""
from __future__ import annotations
import argparse
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent

# Each pattern is a DIFFERENT way of showing a refusal, not synonyms for the same one. They are
# reported by name so a reviewer can tell a real negative control from a --selftest stub.
SIGNALS = {
    "negative_control_run": re.compile(
        r"CONTROL[: ].{0,120}?(must|should)\s+(be\s+)?(refus|fail|reject|not\b)", re.I | re.S),
    "documented_control_line": re.compile(r"^\s*#.*\bCONTROL\b", re.M),
    "selftest_path": re.compile(r"--selftest|def\s+selftest\s*\(|\bselftest\b\s*=", re.I),
    "asserts_a_refusal": re.compile(
        r"(assert|expect|require)[^\n]{0,80}(refus|denied|403|401|409|invalid|must not)", re.I),
}


def scan_text(text):
    found = sorted(name for name, rex in SIGNALS.items() if rex.search(text))
    return found


def scan(paths):
    rows = []
    for path in sorted(paths):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            rows.append({"file": path.name, "state": "UNREADABLE",
                         "reason": type(exc).__name__, "signals": []})
            continue
        found = scan_text(text)
        rows.append({"file": path.name, "signals": found,
                     "state": "HAS_CONTROL" if found else "NO_CONTROL"})
    return rows


def selftest():
    """Feed the gate something with no control and require it to complain.

    If this passes, the gate can distinguish a verifier that shows its failure mode from one that
    does not - which is the only claim it makes.
    """
    bare = ("import sys\n"
            "def main():\n"
            "    print('everything is fine')\n"
            "    return 0\n")
    guarded = ("# CONTROL: the probe must be REFUSED when the token is absent.\n"
               "import sys\n"
               "def main():\n"
               "    assert refused, 'expected 403 denied'\n"
               "    return 0\n")
    bare_found = scan_text(bare)
    guarded_found = scan_text(guarded)
    ok = (not bare_found) and bool(guarded_found)
    print(json.dumps({
        "schema": "buildanddo.verifier-control-gate-selftest/v1",
        "uncontrolled_sample_flagged": not bare_found,
        "controlled_sample_recognised": bool(guarded_found),
        "controlled_signals": guarded_found,
        "verdict": "PASS" if ok else "FAIL",
        "means": ("the gate refuses a verifier with no control and accepts one that shows its "
                  "failure mode" if ok else
                  "the gate cannot tell the two apart and must not be trusted"),
    }, indent=1))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", default=str(HERE), help="directory of verifiers to scan")
    ap.add_argument("--glob", default="ocn_*.py")
    ap.add_argument("--strict", action="store_true", help="exit 1 when any verifier lacks a control")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()

    paths = sorted(pathlib.Path(args.dir).glob(args.glob))
    rows = scan(paths)
    missing = [r for r in rows if r["state"] == "NO_CONTROL"]
    out = {"schema": "buildanddo.verifier-control-gate/v1",
           "scanned_dir": str(pathlib.Path(args.dir)), "pattern": args.glob,
           "verifiers": len(rows), "with_a_control": len(rows) - len(missing),
           "without_a_control": [r["file"] for r in missing],
           "detail": rows,
           "verdict": "PASS" if not missing else "FAIL"}
    if args.json:
        print(json.dumps(out, indent=1))
    else:
        print("%-38s %-12s %s" % ("verifier", "state", "how it shows a refusal"))
        for r in rows:
            print("%-38s %-12s %s" % (r["file"][:38], r["state"], ", ".join(r["signals"]) or "-"))
        print("\n%d of %d verifiers carry a control. verdict %s"
              % (out["with_a_control"], out["verifiers"], out["verdict"]))
        if missing:
            print("without one: %s" % ", ".join(out["without_a_control"]))
    if not paths:
        # Scanning nothing is not a pass. This is the failure the mission's own first step hit.
        print("no verifiers matched - that is UNMEASURED, not clean", file=sys.stderr)
        return 2
    return 1 if (missing and args.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
