#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_seat_session.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN, C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/ocn_rbac_probe.py (same CitadelKey login path);
#              apps/web/src/lib/telemetry.js (the event contract this mirrors);
#              the box's own /opt/citadel/node.json and its CBF blueprints/FLEET_PLACEMENT.json
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

    ocn_seat_session.py [<seat>] [--env staging|production] [--no-capture]

THE SEAT LEARNS WHO IT IS ON ITS OWN BOX. This repository is public, so it carries no table of
which machine holds which guildmaster (operator rule, 2026-09-22: no public surface names a fleet
machine or carries an address). The box already knows: /opt/citadel/node.json names its seat_id and,
in its persona block, its guild; the CBF copy of blueprints/FLEET_PLACEMENT.json names the guild and
persona placed on that seat. The guild is the join key to the guildmaster canon below - the persona
NAME in node.json is a seat-label vocabulary (Warden, Archivist, Herald, Steward) and is not
consulted. When the identity is missing, contradicts itself, names a guild with no guildmaster, or
belongs to a different seat than the one asked for, the session REFUSES before any network call or
telemetry and says why. It never guesses a persona, and never falls back to the hostname.

AGENTS ARE MARKED, NOT DISGUISED. Every new profile and event carries `is_ocn_agent: true`,
`actor_type: agent`, `traffic_type: synthetic` and `probe_type: ocn-seat-session`. Analytics uses a
random session-scoped identity, never a machine address, seat label or person name. The local
receipt retains resolved identity and ordered measurements; historical vendor events are untouched.

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

# Where the box keeps its own identity. Both are written on the box by the fleet installer.
NODE_JSON = "/opt/citadel/node.json"
PLACEMENT = CBF + "/blueprints/FLEET_PLACEMENT.json"

# Guild -> GUILDMASTER: the estate's canonical naming, which is public by design - the website
# publishes every guildmaster with its guild. What must NOT live here is which machine holds which
# seat; that is read from the box at run time (resolve_identity). Joining on GUILD matters because
# five rosters disagree across this estate and the guild is the one thing they agree on.
GUILDMASTERS = {
    "intelligence":  {"persona": "Oracle",         "lens": "pattern-first, forecast-minded"},
    "commerce":      {"persona": "Alex",           "lens": "customer-first, offer-minded"},
    "finance":       {"persona": "Sterling",       "lens": "cost-aware, conservative, risk-first"},
    "creator":       {"persona": "Muse",           "lens": "playful, vivid, image-rich"},
    "research":      {"persona": "Scholar",        "lens": "academic, thorough, evidence-first"},
    "builder":       {"persona": "Forge",          "lens": "operational, safety-first"},
    "writers":       {"persona": "Quill",          "lens": "literate, wry, economical"},
    "entertainment": {"persona": "Director Nexus", "lens": "theatrical, crowd-aware, content-safety-first"},
}
# What each persona exists to care about. Presence of this vocabulary in what is actually served is
# the measurable part of "does this page speak to me".
LEXICON = {
    "Oracle":   ["signal", "pattern", "insight", "evidence", "detect", "forecast", "risk"],
    "Alex":     ["customer", "price", "offer", "market", "revenue", "growth", "sell"],
    "Sterling": ["cost", "price", "budget", "billing", "value", "risk", "plan"],
    "Muse":     ["create", "design", "story", "studio", "craft", "imagine", "build"],
    "Scholar":  ["research", "method", "citation", "evidence", "verify", "source", "claim"],
    "Forge":    ["build", "deploy", "operate", "status", "health", "secure", "uptime"],
    "Quill":    ["write", "draft", "edit", "read", "story", "publish", "guide"],
    "Director Nexus": ["play", "event", "live", "show", "watch", "community", "join"],
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


class IdentityRefused(Exception):
    """The box could not say which guildmaster it is. Raised before any network call."""

    def __init__(self, code, detail, sources):
        super().__init__(detail)
        self.code, self.detail, self.sources = code, detail, sources


def _read_json(path):
    """Returns (document, None), or (None, reason). An absent file and a broken one are different findings."""
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle), None
    except FileNotFoundError:
        return None, "absent"
    except (OSError, ValueError) as exc:
        return None, type(exc).__name__


def resolve_identity(seat_arg, node_path, placement_path):
    """Learn this seat's guildmaster from the box's own identity files, or refuse.

    Args:
        seat_arg: The seat named on the command line, or None to take the box's own.
        node_path: The box identity file (node.json).
        placement_path: The box-local FLEET_PLACEMENT.json.

    Returns:
        {"seat", "persona", "guild", "lens", "identity"} for a seat whose identity is complete and
        consistent.

    Raises:
        IdentityRefused: with a code naming the first thing that was missing or contradictory.
    """
    node, node_error = _read_json(node_path)
    sources = {"node.json": node_error or "read"}
    if not isinstance(node, dict):
        raise IdentityRefused("IDENTITY_UNREADABLE", "%s is %s" % (node_path, node_error or "not a JSON object"),
                              sources)
    seat = str(node.get("seat_id") or node.get("node_id") or "").strip()
    if not seat:
        raise IdentityRefused("IDENTITY_NO_SEAT", "%s names no seat_id" % node_path, sources)
    if seat_arg and seat_arg != seat:
        raise IdentityRefused("IDENTITY_MISMATCH", "asked to run as %s, but this box is %s" % (seat_arg, seat),
                              sources)
    claims = {}
    block = node.get("persona") if isinstance(node.get("persona"), dict) else {}
    if block.get("guild") or node.get("guild"):
        claims["node.json"] = str(block.get("guild") or node.get("guild")).strip().lower()
    placement, placement_error = _read_json(placement_path)
    sources["FLEET_PLACEMENT.json"] = placement_error or "read"
    boxes = placement.get("boxes") if isinstance(placement, dict) else None
    entry = boxes.get(seat) if isinstance(boxes, dict) else None
    declared = ""
    if isinstance(entry, dict):
        if entry.get("guild"):
            claims["FLEET_PLACEMENT.json"] = str(entry["guild"]).strip().lower()
        declared = str(entry.get("persona") or "").strip()
    if not claims:
        raise IdentityRefused("IDENTITY_NO_GUILD", "neither identity source names this seat's guild", sources)
    if len(set(claims.values())) > 1:
        raise IdentityRefused("IDENTITY_CONFLICT", "the identity sources disagree on the guild: %s"
                              % json.dumps(claims, sort_keys=True), sources)
    guild = next(iter(claims.values()))
    canon = GUILDMASTERS.get(guild)
    if canon is None:
        raise IdentityRefused("NO_GUILDMASTER", "guild %r has no guildmaster in the canon" % guild, sources)
    # A placement that names a persona must name THIS guild's guildmaster. A box placed as another
    # persona (not a guildmaster seat, or a roster still being reconciled) is refused, not relabelled.
    if declared and declared.lower() != canon["persona"].lower():
        raise IdentityRefused("PERSONA_CONFLICT", "the placement names %r, but the %s guildmaster is %s"
                              % (declared, guild, canon["persona"]), sources)
    return {"seat": seat, "persona": canon["persona"], "guild": guild, "lens": canon["lens"],
            "identity": {"state": "RESOLVED", "guild_from": sorted(claims), "sources": sources}}


class Telemetry:
    """Capture allowlisted probe measurements without exporting machine/person identity."""

    def __init__(self, key: str | None, seat: str, meta: dict[str, object], enabled: bool = True) -> None:
        self.key, self.seat, self.meta, self.enabled = key, seat, meta, enabled and bool(key)
        self.session_id = str(uuid.uuid4())
        self.distinct_id = "ocn-probe:" + self.session_id
        self.sent, self.refused = 0, 0

    def _post(self, payload: dict[str, object]) -> bool:
        if not self.enabled:
            return False
        payload["api_key"] = self.key
        payload.setdefault("timestamp", datetime.datetime.now(datetime.timezone.utc).isoformat())
        res = http(PH_HOST + "/i/v0/e/", data=json.dumps(payload).encode(), timeout=20)
        ok = bool(res["status"] == 200)
        self.sent += int(ok)
        self.refused += int(not ok)
        return ok

    def _props(self, extra: object) -> dict[str, object]:
        base: dict[str, object] = {"$session_id": self.session_id, "$lib": "bnd-ocn-seat",
                "is_ocn_agent": True, "actor_type": "agent", "traffic_type": "synthetic",
                "probe_type": "ocn-seat-session", "$geoip_disable": True}
        guild = self.meta.get("guild")
        if isinstance(guild, str) and guild in GUILDMASTERS:
            base["ocn_guild"] = guild
        for key, value in (extra if isinstance(extra, dict) else {}).items():
            if key in {"http_status", "http", "latency_ms", "items", "steps", "observation_count",
                       "perc_median_latency_ms", "perc_prerendered_text_chars",
                       "perc_data_endpoints_ok", "perc_data_endpoints_total"}:
                if type(value) is int and value >= 0:
                    base[key] = value
            elif key in {"perc_reachable_routes", "perc_persona_vocabulary_coverage"}:
                if isinstance(value, str) and re.fullmatch(r"\d+/\d+", value):
                    base[key] = value
            elif key == "perc_persona_vocabulary_hits" and isinstance(value, list):
                base[key] = sorted({word for word in value if isinstance(word, str) and
                                    any(word in words for words in LEXICON.values())})
            elif key == "env" and isinstance(value, str) and value in ENVS:
                base[key] = value
            elif key == "login_state" and isinstance(value, str) and re.fullmatch(r"LOGIN_(?:OK|[1-5]\d\d)|SIGN_FAILED", value):
                base[key] = value
            elif key == "collection" and isinstance(value, str) and value in {"workspaces", "missions", "signals", "evidence", "tutorials"}:
                base[key] = value
            elif key == "$current_url" and isinstance(value, str):
                try:
                    url = urllib.parse.urlsplit(value)
                    origin = "%s://%s" % (url.scheme, url.netloc)
                    if origin in ENVS.values() and url.path in ROUTES:
                        base[key] = origin + url.path
                except ValueError:
                    pass
        return base

    def identify(self) -> bool:
        """Identify only this synthetic session, not the person or machine running it."""
        properties = self._props({})
        properties["$set"] = {key: value for key, value in properties.items() if key != "$session_id"}
        return self._post({"event": "$identify", "distinct_id": self.distinct_id,
                           "properties": properties})

    def pageview(self, url: str, status: int, ms: int | float) -> bool:
        return self._post({"event": "$pageview", "distinct_id": self.distinct_id,
                           "properties": self._props({"$current_url": url, "http_status": status,
                                                      "latency_ms": ms})})

    def event(self, name: str, props: object = None) -> bool:
        if not isinstance(name, str) or name not in {"ocn_session_start", "ocn_collection_read", "ocn_perception", "ocn_session_end"}:
            return False
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
    ap.add_argument("seat", nargs="?", default=None,
                    help="this box's seat id; defaults to the one in node.json and must match it when given")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    ap.add_argument("--ph-key", default="")
    ap.add_argument("--no-capture", action="store_true")
    args = ap.parse_args()
    try:
        meta = resolve_identity(args.seat, NODE_JSON, PLACEMENT)
    except IdentityRefused as refused:
        # Nothing has touched the network: no login or telemetry under a guess.
        print(json.dumps({"schema": "buildanddo.ocn-seat-session/v1", "seat": args.seat, "env": args.env,
                          "actor_type": "agent", "traffic_type": "synthetic", "probe_type": "ocn-seat-session",
                          "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          "identity": {"state": "REFUSED", "code": refused.code, "detail": refused.detail,
                                       "sources": refused.sources},
                          "login": "NOT_ATTEMPTED", "replay": []}))
        return 2
    seat = meta["seat"]
    base = ENVS[args.env]

    tel = Telemetry(args.ph_key, seat, meta, enabled=not args.no_capture)
    out = {"schema": "buildanddo.ocn-seat-session/v1", "seat": seat, "env": args.env,
           "persona": meta["persona"], "guild": meta["guild"],
           "actor_type": "agent", "traffic_type": "synthetic", "probe_type": "ocn-seat-session",
           "identity": meta["identity"],
           "session_id": tel.session_id, "distinct_id": tel.distinct_id,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "replay": []}

    token, uid, state = login(seat, base)
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

    perception = perceive(seat, meta, pages, data_docs)
    out["perception"] = perception
    tel.event("ocn_perception", {**{("perc_" + k): v for k, v in perception["score"].items()},
                                 "observation_count": len(perception["observations"])})
    tel.event("ocn_session_end", {"steps": len(out["replay"])})
    out["telemetry"] = {"accepted": tel.sent, "refused": tel.refused,
                        "note": "PostHog answers 200 for an invalid key; accepted != ingested. "
                                "Confirm by querying the project."}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
