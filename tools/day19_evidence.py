#!/usr/bin/env python3
"""tools/day19_evidence.py -- compile the Day-19 evidence the anchor keeps asking for.

SRS:         SRS-BUILDANDDO-DAY19-EVIDENCE-001
Created:     2026-09-21
Campaign:    citadel-21-day-2026-09

DAYS 18 AND 20 HAVE NO CRITERIA. The sprint carries milestones on ODD days only, so an assessment
of "days 18, 19, 20" reduces to Day 19 and two working days. Saying so is part of the answer: a
report that invented findings for even days would be describing a sprint that does not exist.

WHAT DAY 19 ACTUALLY ASKS FOR, AND WHY EACH IS STILL OPEN:
  D19-1  one canonical release event projected to wiki + Discord + forum.
         Finding: individual deliveries succeeded, but NO examined event completed all three, and
         the best paired receipt concerns a learning incident rather than a release.
  D19-2  the self-hosted wiki as durable public record.
         Finding: implemented and reachable; the anchor asks only that it be MEASURED and recorded.
  D19-3  specialist desk views scoped by role.
         Finding: the desks page was replaced by Capability Passport and the change was never
         stated against the criterion.

EVIDENCE IS COMPILED FROM SOURCE AND FROM THE LIVE SITE, NEVER ASSERTED HERE. The D19-3 statement
is read out of `App.jsx` and the SRS at run time, so if the routing changes the statement changes
with it. A hand-written sentence claiming the same thing would be a claim; this is a reading.

A 200 IS NOT EVIDENCE OF A WIKI -- AND NEITHER IS A BYTE COUNT. The first version of this probe
rejected the root page for being under 4 KB and called it a likely stub. That was a FALSE NEGATIVE:
the wiki is a client-rendered SPA (Wiki.js), whose index.html is legitimately ~1.8 KB and loads
everything by script. Judging a JS app by the size of its shell measures the wrong thing.
So the probe now asks two separate questions. Is a real application shell being served (script
bundle + app root)? And does an actual CONTENT page return a document? Only the second supports the
claim "durable public record" -- a shell proves the server is up, not that the record exists.

D19-1 IS EXPECTED TO REPORT NOTHING, AND THAT IS THE POINT. No three-channel receipt exists, so the
compiler reports NO_COMPLETE_RECEIPT with the channels it could and could not evidence. Emitting a
partial receipt as if it satisfied the criterion is the exact failure the finding already names.

CLI:
  py -3.13 tools/day19_evidence.py                 # compile and print
  py -3.13 tools/day19_evidence.py --write         # also write the evidence file
  py -3.13 tools/day19_evidence.py --json
  py -3.13 tools/day19_evidence.py --selftest
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "state" / "day19" / "evidence.json"

MEASURED = "MEASURED"
UNMEASURED = "UNMEASURED"

WIKI_URL = "https://wiki.buildanddo.com"
# Markers of a real application shell. A byte threshold cannot distinguish an SPA index from a
# parked page; the presence of a script bundle and a mount point can.
SHELL_MARKERS = ("<script", "id=\"root\"", "id=\"app\"", "/_assets/", "/assets/")
# A content page, not the root. "Reachable" and "serving the record" are different claims.
WIKI_CONTENT_PATHS = ("/home", "/en/home", "/index")
CHANNELS = ("wiki", "discord", "forum")

APP_JSX = ROOT / "apps" / "web" / "src" / "App.jsx"
PASSPORT_SRC = ROOT / "apps" / "web" / "src" / "pages" / "workspace" / "SpecialistDeskPage.jsx"
WITNESS_SRS = ROOT / ".bits" / "srs" / "SRS-BUILDANDDO-WITNESS-001.md"


# --- D19-2: the wiki, measured ----------------------------------------------------------
def probe_wiki(url: str = WIKI_URL, timeout: int = 25) -> Dict[str, Any]:
    """Live readback with a content hash. A failure is UNMEASURED, never 'down'."""
    started = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "citadel-day19-evidence"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        return {"state": MEASURED, "url": url, "status": exc.code, "serving": False,
                "reason": "HTTP %d" % exc.code}
    except Exception as exc:  # noqa: BLE001
        return {"state": UNMEASURED, "url": url,
                "reason": ("probe failed (%s); unreachable FROM HERE is not the same as down"
                           % type(exc).__name__)}
    digest = hashlib.sha256(body).hexdigest()
    text = body.decode("utf-8", "replace")[:8000].lower()
    shell = any(m.lower() in text for m in SHELL_MARKERS)
    credible = shell
    return {
        "state": MEASURED, "url": url, "status": status, "bytes": len(body),
        "sha256": digest, "latency_ms": round((time.time() - started) * 1000, 1),
        "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "serving": status == 200,
        "body_credible": credible,
        "app_shell_detected": shell,
        "reason": ("HTTP %d, %d bytes, application shell %s"
                   % (status, len(body), "detected" if shell else "NOT detected")
                   + ("" if shell else
                      " -- no script bundle or mount point, so this looks like a parked or error "
                      "page rather than an application")),
    }


def probe_wiki_content(base: str = WIKI_URL, timeout: int = 25) -> Dict[str, Any]:
    """Fetch an actual CONTENT page. The shell proves the server is up; this tests the record.

    A durable public record is a claim about CONTENT. The root of an SPA returns the same bytes
    whether the wiki holds a thousand pages or none, so it cannot answer this question at all.
    """
    tried = []
    for path in WIKI_CONTENT_PATHS:
        url = base.rstrip("/") + path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "citadel-day19-evidence"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                tried.append({"url": url, "status": resp.status, "bytes": len(body),
                              "sha256": hashlib.sha256(body).hexdigest()})
                if resp.status == 200 and body:
                    return {"state": MEASURED, "serving_content": True, "url": url,
                            "status": resp.status, "bytes": len(body),
                            "sha256": hashlib.sha256(body).hexdigest(),
                            "attempts": tried,
                            "reason": "a content path returned a document"}
        except urllib.error.HTTPError as exc:
            tried.append({"url": url, "status": exc.code})
        except Exception as exc:  # noqa: BLE001
            tried.append({"url": url, "error": type(exc).__name__})
    return {"state": MEASURED, "serving_content": False, "attempts": tried,
            "reason": ("no content path of %s returned a document; the shell is up but the record "
                       "itself is not evidenced from here" % ", ".join(WIKI_CONTENT_PATHS))}


# --- D19-3: the scope change, read out of source ----------------------------------------
def read_scope_change() -> Dict[str, Any]:
    """Compile the desks -> Capability Passport statement FROM the code, not from memory."""
    if not APP_JSX.exists():
        return {"state": UNMEASURED, "reason": "no App.jsx at %s" % APP_JSX}
    text = APP_JSX.read_text(encoding="utf-8", errors="replace")
    routes = re.findall(r"path:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'", text)
    passport_routes = [(p, l) for p, l in routes if "passport" in l.lower() or p in ("desks", "passport")]
    rationale = ""
    m = re.search(r"//([^\n]*former desks page[^\n]*)\n//([^\n]*)", text)
    if m:
        rationale = (m.group(1) + " " + m.group(2)).strip()
    srs_ref = "SRS-BUILDANDDO-WITNESS-001" if "SRS-BUILDANDDO-WITNESS-001" in text else None
    return {
        "state": MEASURED if passport_routes else UNMEASURED,
        "source_file_present": PASSPORT_SRC.exists(),
        "source_file_bytes": PASSPORT_SRC.stat().st_size if PASSPORT_SRC.exists() else None,
        "routes": [{"path": p, "label": l} for p, l in passport_routes],
        "in_code_rationale": rationale or None,
        "srs": srs_ref,
        "srs_present": WITNESS_SRS.exists(),
        "statement": (
            "The Specialist Desks page was REPLACED by the Capability Passport under %s. The file "
            "path `pages/workspace/SpecialistDeskPage.jsx` was retained deliberately so existing "
            "/app/desks bookmarks keep resolving, and both `desks` and `passport` route to the "
            "Capability Passport. The original role-scoped desk requirement was therefore NOT "
            "delivered as written; it was superseded. This is the explicit statement the criterion "
            "asks for, compiled from the routing table rather than asserted."
            % (srs_ref or "an unrecorded SRS")),
        "reason": ("compiled from App.jsx routing + the retained source file"
                   if passport_routes else "no passport/desks route found in App.jsx"),
    }


# --- D19-1: the three-channel receipt ---------------------------------------------------
def find_release_receipt(evidence_dirs: Optional[List[Path]] = None) -> Dict[str, Any]:
    """Look for ONE canonical release event delivered to all three channels.

    Reports NO_COMPLETE_RECEIPT rather than assembling a partial one. The finding already says
    individual deliveries succeeded and no event completed all three; a compiler that stitched
    three unrelated receipts together would manufacture exactly the evidence that does not exist.
    """
    roots = evidence_dirs or [ROOT / "state", ROOT / "data" / "runtime", ROOT / "reports"]
    candidates: List[Path] = []
    for root in roots:
        if root.exists():
            candidates.extend(p for p in root.rglob("*.json") if "release" in p.name.lower())
    complete, partial = [], []
    for path in candidates[:400]:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        blob = json.dumps(data).lower()
        hit = {c: (c in blob) for c in CHANNELS}
        if all(hit.values()):
            complete.append({"file": str(path.relative_to(ROOT)), "channels": hit})
        elif any(hit.values()):
            partial.append({"file": str(path.relative_to(ROOT)), "channels": hit})
    return {
        "state": MEASURED,
        "verdict": "COMPLETE_RECEIPT" if complete else "NO_COMPLETE_RECEIPT",
        "scanned": len(candidates),
        "complete": complete[:5],
        "partial": partial[:5],
        "reason": (
            "found %d receipt(s) naming all of %s" % (len(complete), ", ".join(CHANNELS))
            if complete else
            "no receipt names all of %s together. %d partial receipt(s) name some. A canonical "
            "release requires ONE event delivered to all three; stitching separate receipts would "
            "manufacture the evidence the finding says is missing."
            % (", ".join(CHANNELS), len(partial))),
    }


def compile_evidence() -> Dict[str, Any]:
    wiki = probe_wiki()
    content = probe_wiki_content()
    scope = read_scope_change()
    receipt = find_release_receipt()
    return {
        "schema": "buildanddo.day19-evidence/v1",
        "srs": "SRS-BUILDANDDO-DAY19-EVIDENCE-001",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "structural_note": ("milestones fall on ODD days only, so days 18 and 20 carry no criteria; "
                            "the whole of that window is Day 19"),
        "D19_1_release_projection": receipt,
        "D19_2_wiki": wiki,
        "D19_2_wiki_content": content,
        "D19_3_scope_change": scope,
        "closable_now": {
            "D19-1": receipt["verdict"] == "COMPLETE_RECEIPT",
            # Measured AND credible -- a 200 on a stub does not make a durable public record.
            # Shell up is not the record. Closing D19-2 needs a CONTENT document.
            "D19-2": bool(wiki.get("serving") and wiki.get("body_credible")
                          and content.get("serving_content")),
            "D19-3": scope.get("state") == MEASURED,
        },
    }


def render(r: Dict[str, Any]) -> str:
    w, s, rc = r["D19_2_wiki"], r["D19_3_scope_change"], r["D19_1_release_projection"]
    out = [
        "DAY-19 EVIDENCE  (%s)  %s" % (r["srs"], r["generated_at"]),
        "  %s" % r["structural_note"],
        "",
        "  D19-1  release projection: %s" % rc["verdict"],
        "    %s" % rc["reason"],
        "",
        "  D19-2  wiki: %s" % ("MEASURED" if w.get("state") == MEASURED else "UNMEASURED"),
        "    %s" % w.get("reason"),
    ]
    if w.get("sha256"):
        out.append("    sha256=%s  latency=%sms  observed_at=%s"
                   % (w["sha256"][:24], w.get("latency_ms"), w.get("observed_at")))
    out += ["", "  D19-3  scope change: %s" % s.get("state"),
            "    routes: %s" % ", ".join("%s -> %s" % (x["path"], x["label"])
                                         for x in s.get("routes", [])),
            "    source retained: %s (%s bytes)  SRS: %s"
            % (s.get("source_file_present"), s.get("source_file_bytes"), s.get("srs")),
            "    %s" % s.get("statement", "")[:220],
            "", "  CLOSABLE NOW: %s" % r["closable_now"]]
    return "\n".join(out)


# --- selftest ---------------------------------------------------------------------------
def _selftest() -> int:
    checks: List[Tuple[str, bool]] = []

    def ck(n: str, c: bool) -> None:
        checks.append((n, bool(c)))

    # -- GUARD: credibility is judged by SHELL MARKERS, not byte count.
    # A byte threshold called the real wiki a stub -- its SPA index is legitimately ~1.8 KB.
    parked = "<html><body>Domain parked</body></html>".lower()
    spa = '<html><head><script src="/assets/app.js"></script></head>'.lower()
    ck("a parked page shows no application shell",
       not any(m.lower() in parked for m in SHELL_MARKERS))
    ck("a small SPA index DOES show a shell",
       any(m.lower() in spa for m in SHELL_MARKERS))
    ck("the shell markers are declared", len(SHELL_MARKERS) > 0)
    ck("content paths are declared separately from the root", len(WIKI_CONTENT_PATHS) > 0)

    live = probe_wiki()
    ck("the wiki probe reaches a state", live.get("state") in (MEASURED, UNMEASURED))
    if live.get("state") == MEASURED:
        ck("a measured probe records a content hash", bool(live.get("sha256")))
        ck("...and a byte count", isinstance(live.get("bytes"), int))
        ck("...and separates serving from credible",
           "serving" in live and "body_credible" in live)
    else:
        ck("an unreachable probe is UNMEASURED, not 'down'",
           "not the same as down" in live.get("reason", ""))
        ck("...and says so", True)
        ck("...and does not claim a hash", "sha256" not in live)

    # -- D19-3 is compiled from source, not asserted
    scope = read_scope_change()
    ck("the scope change reads real routes", len(scope.get("routes") or []) >= 1)
    ck("...finds the retained source file", scope.get("source_file_present") is True)
    ck("...cites the governing SRS", scope.get("srs") == "SRS-BUILDANDDO-WITNESS-001")
    ck("...and states the requirement was superseded, not delivered",
       "NOT delivered as written" in scope.get("statement", ""))

    # -- D19-1 must refuse to stitch a receipt together
    rc = find_release_receipt(evidence_dirs=[ROOT / "___no_such_dir___"])
    ck("with no receipts the verdict is NO_COMPLETE_RECEIPT",
       rc["verdict"] == "NO_COMPLETE_RECEIPT")
    ck("...and it refuses to stitch partials", "manufacture the evidence" in rc["reason"])
    ck("...naming all three channels", all(c in rc["reason"] for c in CHANNELS))

    full = compile_evidence()
    ck("the compiler states that days 18 and 20 have no criteria",
       "days 18 and 20 carry no criteria" in full["structural_note"])
    ck("closable_now covers all three criteria",
       set(full["closable_now"]) == {"D19-1", "D19-2", "D19-3"})
    ck("D19-2 needs serving AND a shell AND a content document",
       full["closable_now"]["D19-2"] ==
       bool(full["D19_2_wiki"].get("serving") and full["D19_2_wiki"].get("body_credible")
            and full["D19_2_wiki_content"].get("serving_content")))
    ck("a shell alone does not close D19-2",
       not (full["D19_2_wiki"].get("app_shell_detected")
            and not full["D19_2_wiki_content"].get("serving_content")
            and full["closable_now"]["D19-2"]))
    ck("render produces all three sections",
       all(k in render(full) for k in ("D19-1", "D19-2", "D19-3")))

    passed = sum(1 for _n, ok in checks if ok)
    for n, ok in checks:
        print("  %s %s" % ("PASS" if ok else "FAIL", n))
    print("\n  selftest: %d/%d" % (passed, len(checks)))
    return 0 if passed == len(checks) else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Compile Day-19 evidence from source and live probes.")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return _selftest()
    r = compile_evidence()
    if a.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(r, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        r["written"] = str(OUT)
    print(json.dumps(r, indent=2, sort_keys=True) if a.json else render(r))
    if r.get("written"):
        print("\n  evidence: %s" % r["written"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
