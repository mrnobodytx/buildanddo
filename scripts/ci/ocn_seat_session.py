#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_seat_session.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/ocn_rbac_probe.py (same CitadelKey login path);
#              apps/web/src/lib/telemetry.js (the event contract this mirrors)
# EnumType:    Verifier
# EnumEdges:   PRODUCES PostHog person + session + events for an OCN seat;
#              PRODUCES a persona perception record for the systems report
# Intent:      Let an agent seat use BuildAndDo as itself, from its own machine, and leave the same
#              kind of behavioural trail a person leaves - so agent behaviour and human behaviour can
#              be compared in one place instead of guessed at separately.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_seat_session.py - one OCN seat's session against BuildAndDo, reported to PostHog.

RUNS ON A FLEET BOX. The seat signs in with the CitadelKey only that box holds, walks a journey,
and emits the events a browser would, plus one persona perception record.

    ocn_seat_session.py <seat> [--env staging|production] [--no-capture]

AGENTS ARE MARKED, NOT DISGUISED. Every person and every event carries `is_ocn_agent: true`,
`ocn_seat`, `ocn_persona` and `ocn_guild`. That is the point rather than a caveat: analytics that
silently blends synthetic traffic into human funnels is corrupted analytics, and the operator asked
for user stats AND agent stats, which needs the two to be separable. Filter the flag out for human
behaviour, filter it in for agent behaviour.

SESSIONS, AND WHAT "REPLAY" CAN HONESTLY MEAN HERE. Every event carries one `$session_id`, so
PostHog groups the journey into a single session with a real timeline and duration. It is NOT a
video: PostHog's session recording is rrweb DOM capture inside a browser, and there is no DOM here.
So this also writes an ordered, re-runnable step list - the replay this process can actually honour.
A visual recording would need a headless browser on the box, which is a separate, heavier thing and
is deliberately not pretended at.

CAPTURE IS FIRE-AND-FORGET. Measured 2026-09-20: POST /i/v0/e/ answers 200 {"status":"Ok"} for a
DELIBERATELY INVALID api key, and that event never appears. A 200 here proves the request was
accepted for processing and nothing else. Verify ingestion by querying the project with a personal
API key - see verify_ocn_telemetry() in the estate driver - never by trusting this status code.

PERCEPTION IS MEASURED, NOT IMAGINED. The persona chooses WHICH questions get asked; the answers
come from the bytes actually served. A perception score is derived from status, latency, how much
text the page carries before JavaScript runs, and whether the vocabulary this persona exists to care
about is present. Nothing here asks a model how it feels about a page.
"""
from __future__ import annotations
import argparse
import datetime
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
PH_HOST = "https://us.i.posthog.com"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-seat/1.0)", "Content-Type": "application/json"}

# Box -> persona/guild from blueprints/FLEET_PLACEMENT.json, embedded so a box needs no repo
# checkout. NOTE: the guild here is FLEET_PLACEMENT's, which disagrees with
# services/seats/personas.yaml for some seats (herald: commerce vs intelligence; scholar:
# intelligence vs research). Five rosters disagree across the estate and reconciling them is not
# this script's job, so the source is named rather than silently picked.
SEATS = {
    "ray-tor1-1":   {"persona": "Scholar",   "guild": "intelligence", "lens": "academic, thorough, evidence-first"},
    "ray-tor1-2":   {"persona": "Herald",    "guild": "commerce",     "lens": "formal proclamation, governance-minded"},
    "ray-tor1-3":   {"persona": "Steward",   "guild": "finance",      "lens": "cost-aware, conservative, risk-first"},
    "ray-tor1-4":   {"persona": "Muse",      "guild": "creator",      "lens": "playful, vivid, image-rich"},
    "mesh-memory":  {"persona": "Archivist", "guild": "research",     "lens": "provenance-first, citation-minded"},
    "mesh-control": {"persona": "Warden",    "guild": "builder",      "lens": "operational, safety-first"},
}
# What each persona exists to care about. Presence of this vocabulary in what is actually served is
# the measurable part of "does this page speak to me".
LEXICON = {
    "Scholar":   ["evidence", "research", "method", "citation", "verify", "source", "claim"],
    "Herald":    ["announce", "release", "governance", "policy", "publish", "community", "signal"],
    "Steward":   ["cost", "price", "budget", "plan", "billing", "risk", "value"],
    "Muse":      ["create", "build", "design", "story", "studio", "craft", "imagine"],
    "Archivist": ["history", "record", "provenance", "archive", "version", "lineage", "log"],
    "Warden":    ["status", "health", "deploy", "operate", "secure", "access", "uptime"],
}
ROUTES = ["/", "/roadmap", "/app", "/practice", "/login"]
DATA = ["/roadmap-status.json", "/_version", "/capabilities.json"]


def http(url, data=None, headers=None, method=None, timeout=25):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head, method=method or ("POST" if data else "GET"))
    started = datetime.datetime.now()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ms = int((datetime.datetime.now() - started).total_seconds() * 1000)
            return {"status": resp.status, "body": raw, "ms": ms,
                    "ctype": (resp.headers.get("Content-Type") or "").split(";")[0]}
    except urllib.error.HTTPError as exc:
        raw = exc.read() if hasattr(exc, "read") else b""
        return {"status": exc.code, "body": raw,
                "ms": int((datetime.datetime.now() - started).total_seconds() * 1000), "ctype": ""}
    except Exception as exc:  # noqa: BLE001 - a dead hop is a measurement, not a crash
        return {"status": 0, "body": b"", "ms": int((datetime.datetime.now() - started).total_seconds() * 1000),
                "ctype": "", "error": type(exc).__name__}


class Telemetry:
    """PostHog capture for one seat session. Marks every payload as agent traffic."""

    def __init__(self, key, seat, meta, enabled=True):
        self.key, self.seat, self.meta, self.enabled = key, seat, meta, enabled and bool(key)
        self.distinct_id = "ocn:" + seat
        self.session_id = str(uuid.uuid4())
        self.sent, self.refused = 0, 0

    def _post(self, payload):
        if not self.enabled:
            return False
        payload["api_key"] = self.key
        payload.setdefault("timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat())
        res = http(PH_HOST + "/i/v0/e/", data=json.dumps(payload).encode(), timeout=20)
        ok = res["status"] == 200
        self.sent += int(ok)
        self.refused += int(not ok)
        return ok

    def _props(self, extra):
        base = {"$session_id": self.session_id, "is_ocn_agent": True, "ocn_seat": self.seat,
                "ocn_persona": self.meta["persona"], "ocn_guild": self.meta["guild"],
                "ocn_box_ip": self.meta.get("egress_ip"), "$lib": "bnd-ocn-seat"}
        base.update(extra or {})
        return base

    def identify(self):
        """person_profiles is 'identified_only' in the web app, so without this there is no person."""
        return self._post({"event": "$identify", "distinct_id": self.distinct_id,
                           "properties": self._props({"$set": {
                               "is_ocn_agent": True, "ocn_seat": self.seat,
                               "ocn_persona": self.meta["persona"], "ocn_guild": self.meta["guild"],
                               "ocn_box_ip": self.meta.get("egress_ip"),
                               "name": "OCN seat: " + self.seat}})})

    def pageview(self, url, status, ms):
        return self._post({"event": "$pageview", "distinct_id": self.distinct_id,
                           "properties": self._props({"$current_url": url, "http_status": status,
                                                      "latency_ms": ms})})

    def event(self, name, props=None):
        return self._post({"event": name, "distinct_id": self.distinct_id,
                           "properties": self._props(props)})


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
        return None, None, "SIGN_FAILED"
    res = http(base + BACKEND + "/api/ocn/login", data=b"{}", headers={"X-Citadel-Key": header})
    if res["status"] != 200:
        return None, None, "LOGIN_%d" % res["status"]
    body = json.loads(res["body"])
    return body.get("token"), (body.get("record") or {}).get("id"), "LOGIN_OK"


def visible_text(html):
    """Roughly what a reader sees before JavaScript runs. Scripts and styles are not content."""
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def perceive(seat, meta, pages, data_docs):
    """Score what this seat actually received, through the questions its persona exists to ask."""
    words = LEXICON.get(meta["persona"], [])
    served_text = " ".join(p["text"] for p in pages).lower()
    data_text = " ".join(json.dumps(d["json"])[:20000].lower() for d in data_docs if d.get("json"))
    corpus = served_text + " " + data_text
    hits = sorted({w for w in words if w in corpus})
    reachable = [p for p in pages if p["status"] == 200]
    latencies = [p["ms"] for p in pages if p["status"] == 200] or [0]
    # A single page app answers 200 for any path, so "every route returned 200" says nothing about
    # whether a route exists. Text volume BEFORE JavaScript is the honest signal, and it is also
    # what a crawler, a screen reader in a degraded mode, and a link preview will see.
    prerender = max((len(p["text"]) for p in pages), default=0)
    score = {
        "reachable_routes": "%d/%d" % (len(reachable), len(pages)),
        "median_latency_ms": sorted(latencies)[len(latencies) // 2],
        "prerendered_text_chars": prerender,
        "persona_vocabulary_hits": hits,
        "persona_vocabulary_coverage": "%d/%d" % (len(hits), len(words)),
        "data_endpoints_ok": sum(1 for d in data_docs if d["status"] == 200 and d.get("json")),
        "data_endpoints_total": len(data_docs),
    }
    notes = []
    if prerender < 500:
        notes.append("Served HTML carries almost no text before JavaScript runs (%d chars): a "
                     "crawler, a link preview or a reader without JS sees an empty page." % prerender)
    if len(hits) <= len(words) // 3:
        notes.append("Little of the %s vocabulary this seat exists to look for is present in what "
                     "is actually served (%s)." % (meta["persona"], score["persona_vocabulary_coverage"]))
    if score["data_endpoints_ok"] < score["data_endpoints_total"]:
        notes.append("%d of %d public data endpoints did not return usable JSON."
                     % (score["data_endpoints_total"] - score["data_endpoints_ok"],
                        score["data_endpoints_total"]))
    if not notes:
        notes.append("Nothing this seat checks for came back wrong.")
    return {"persona": meta["persona"], "guild": meta["guild"], "lens": meta["lens"],
            "score": score, "observations": notes}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    ap.add_argument("--ph-key", default="")
    ap.add_argument("--no-capture", action="store_true")
    args = ap.parse_args()
    meta = dict(SEATS.get(args.seat) or {"persona": "Unknown", "guild": "unknown", "lens": "unspecified"})
    base = ENVS[args.env]

    ip = http("https://api.ipify.org", timeout=12)
    meta["egress_ip"] = ip["body"].decode("utf-8", "replace").strip() if ip["status"] == 200 else None

    tel = Telemetry(args.ph_key, args.seat, meta, enabled=not args.no_capture)
    out = {"schema": "buildanddo.ocn-seat-session/v1", "seat": args.seat, "env": args.env,
           "persona": meta["persona"], "guild": meta["guild"], "egress_ip": meta["egress_ip"],
           "session_id": tel.session_id, "distinct_id": tel.distinct_id,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "replay": []}

    token, uid, state = login(args.seat, base)
    out["login"] = state
    tel.identify()
    tel.event("ocn_session_start", {"env": args.env, "login_state": state})
    out["replay"].append({"step": "ocn_login", "result": state})
    if not token:
        out["telemetry"] = {"accepted": tel.sent, "refused": tel.refused}
        print(json.dumps(out))
        return 1

    pages = []
    for route in ROUTES:
        res = http(base + route, timeout=25)
        html = res["body"].decode("utf-8", "replace")
        page = {"route": route, "status": res["status"], "ms": res["ms"], "text": visible_text(html)}
        pages.append(page)
        tel.pageview(base + route, res["status"], res["ms"])
        out["replay"].append({"step": "pageview", "route": route, "http": res["status"], "ms": res["ms"],
                              "prerendered_chars": len(page["text"])})

    data_docs = []
    for path in DATA:
        res = http(base + path, timeout=25)
        doc = None
        if res["status"] == 200 and res["body"][:1] in b"{[":
            try:
                doc = json.loads(res["body"])
            except Exception:  # noqa: BLE001
                doc = None
        data_docs.append({"path": path, "status": res["status"], "json": doc})
        out["replay"].append({"step": "data", "path": path, "http": res["status"],
                              "json": doc is not None})

    api = {}
    for coll in ("workspaces", "missions", "signals", "evidence", "tutorials"):
        res = http(base + BACKEND + "/api/collections/%s/records?perPage=1" % coll,
                   headers={"Authorization": token}, timeout=25)
        total = None
        if res["status"] == 200:
            try:
                total = json.loads(res["body"]).get("totalItems")
            except Exception:  # noqa: BLE001
                total = None
        api[coll] = {"http": res["status"], "items": total}
        tel.event("ocn_collection_read", {"collection": coll, "http": res["status"], "items": total})
        out["replay"].append({"step": "api_read", "collection": coll, "http": res["status"], "items": total})
    out["authenticated_reads"] = api

    perception = perceive(args.seat, meta, pages, data_docs)
    out["perception"] = perception
    tel.event("ocn_perception", {"persona": perception["persona"], "guild": perception["guild"],
                                 **{("perc_" + k): v for k, v in perception["score"].items()},
                                 "observation_count": len(perception["observations"])})
    tel.event("ocn_session_end", {"steps": len(out["replay"])})
    out["telemetry"] = {"accepted": tel.sent, "refused": tel.refused,
                        "note": "PostHog answers 200 for an invalid key; accepted != ingested. "
                                "Confirm by querying the project."}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
