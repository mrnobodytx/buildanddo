#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/integrations_status.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-PUBLIC-RECORD-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     state/roadmap_broadcast/deliveries.jsonl (controller estate),
#              state/roadmap_broadcast/outbox/BC-*/manifest.json (controller estate),
#              state/error_corpus/tutorials.latest.json (controller estate),
#              state/integrations/validity.latest.json (controller estate)
# EnumType:    Service
# EnumEdges:   CONSUMES state/roadmap_broadcast/deliveries.jsonl;
#              CONSUMES state/roadmap_broadcast/outbox;
#              CONSUMES state/error_corpus/tutorials.latest.json;
#              CONSUMES state/integrations/validity.latest.json;
#              PRODUCES apps/web/public/integrations-status.json
# Intent:      Project the estate's public-record channels (wiki / forum /
#              Discord / Reddit) into the one file the workspace reads, or say
#              UNMEASURED per section rather than invent a count.
# ───────────────────────────────────────────────────────────────
"""
integrations_status.py - writes apps/web/public/integrations-status.json before
every build, so the Community "Public record" tab and the Field Manual
"Failure tutorials" tab render what the estate has actually published, queued
or held - never demo data. Vite copies public/ verbatim into dist, so this
ships with every build ship.py runs, exactly like roadmap_status.py.

Sources are read-only files in the controller estate (env NAME
BUILDANDDO_ESTATE_ROOT, default the clone's grandparent, D:\\HOSTINGER_COMP in
the controller layout). Each absent or unreadable source yields its section as
{"state": "UNMEASURED", "reason": ...}; nothing here can fail the build.

What is never bridged: secret names, tokens, endpoints, identities, webhook
message ids, content hashes, HELD channel texts. A leak guard scans every
string in the projection before the write and refuses the file if anything
token-shaped slipped through (exit 1, so ship.py writes its UNMEASURED marker).

Run `py -3.13 scripts/deploy/integrations_status.py --selftest` to exercise the
projection against a temporary fake estate; the real estate is never read
under --selftest.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import os
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
OUT_PATH = ROOT / "apps" / "web" / "public" / "integrations-status.json"
ESTATE_ENV = "BUILDANDDO_ESTATE_ROOT"
ESTATE_DEFAULT = ROOT.parent.parent  # <estate>/sites/buildanddo is this clone
SCHEMA = "buildanddo.integrations-status/v1"

CHANNELS = ("wiki", "reddit", "forum", "discord")
VALIDITY_IDS = frozenset({"wiki", "discord", "reddit", "forum", "github", "posthog",
                          "datadog", "mautic", "twenty", "youtube"})
QUEUED_STATES = frozenset({"QUEUED", "QUEUED_LOCAL"})
HELD_STATES = frozenset({"HELD"})
PUBLISHED_STATES = frozenset({"PASS"})
WIKI_LATEST_N = 10
RECENT_N = 5
TITLE_MAX = 160

# Anything matching one of these anywhere in the projection fails the write.
LEAK_PATTERNS = (
    ("jwt", re.compile(r"eyJ[A-Za-z0-9_-]{10,}")),
    ("github_pat", re.compile(r"ghp_[A-Za-z0-9]{20,}")),
    ("gitlab_pat", re.compile(r"glpat-[A-Za-z0-9_-]{16,}")),
    ("posthog_key", re.compile(r"\bph[cx]_[A-Za-z0-9]{20,}")),
    ("long_hex", re.compile(r"[0-9a-fA-F]{40,}")),
)
# Reasons in validity.latest.json may name the secret that is missing; the name
# is not a value, but the workspace does not need it either.
SECRET_NAME_RE = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|SECRET|TOKEN|PASSWORD|WEBHOOK(?:_URL)?)\b")
SECRET_LIST_RE = re.compile(r"(SECRET_NAMES_NOT_RESOLVED):[A-Z0-9_,]+")


def _unmeasured(reason: str) -> dict:
    return {"state": "UNMEASURED", "reason": reason}


def _read_json(path: Path) -> tuple[dict | list | None, str | None]:
    if not path.is_file():
        return None, "FILE_ABSENT"
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except Exception as exc:  # noqa: BLE001 - a corrupt estate file must not fail the build
        return None, f"{type(exc).__name__}: {exc}"


def _read_deliveries(estate: Path) -> tuple[list[dict] | None, str | None]:
    path = estate / "state" / "roadmap_broadcast" / "deliveries.jsonl"
    if not path.is_file():
        return None, "FILE_ABSENT"
    rows: list[dict] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if isinstance(row, dict) and row.get("channel") in CHANNELS:
                rows.append(row)
    except Exception as exc:  # noqa: BLE001
        return None, f"{type(exc).__name__}: {exc}"
    return rows, None


def _read_outbox(estate: Path) -> tuple[list[dict] | None, str | None]:
    """Every BC-*/manifest.json, newest created_at first; unreadable ones are skipped."""
    outbox = estate / "state" / "roadmap_broadcast" / "outbox"
    if not outbox.is_dir():
        return None, "DIR_ABSENT"
    manifests: list[dict] = []
    for d in sorted(outbox.glob("BC-*")):
        data, err = _read_json(d / "manifest.json")
        if err or not isinstance(data, dict) or not isinstance(data.get("channels"), dict):
            continue
        data["_dir"] = d
        manifests.append(data)
    manifests.sort(key=lambda m: str(m.get("created_at") or ""), reverse=True)
    return manifests, None


def _reddit_title(manifest: dict) -> str | None:
    """First line of reddit.txt, only when the manifest says it is public-safe and not HELD."""
    reddit = manifest["channels"].get("reddit") or {}
    if manifest.get("public_safe") is not True or reddit.get("state") in HELD_STATES:
        return None
    if reddit.get("state") not in QUEUED_STATES | PUBLISHED_STATES:
        return None
    path = manifest["_dir"] / "reddit.txt"
    if not path.is_file():
        return None
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                return line.strip()[:TITLE_MAX]
    except OSError:
        return None
    return None


def _channels(deliveries: list[dict] | None, deliveries_reason: str | None,
              manifests: list[dict] | None, outbox_reason: str | None) -> dict:
    out: dict = {}
    for ch in CHANNELS:
        block: dict = {"state": "UNMEASURED", "reason": None,
                       "published": None, "last_published_at": None,
                       "queued": None, "held": None, "recent": []}
        if deliveries is not None:
            passed = [r for r in deliveries if r.get("channel") == ch and r.get("state") in PUBLISHED_STATES]
            block["published"] = len({r.get("change_id") for r in passed})
            stamps = sorted(str(r.get("published_at") or "") for r in passed)
            block["last_published_at"] = stamps[-1] if stamps and stamps[-1] else None
            if ch == "wiki":
                latest = sorted((r for r in passed if r.get("url")), key=lambda r: str(r.get("published_at") or ""), reverse=True)
                block["latest"] = [{"change_id": r.get("change_id"), "url": r.get("url"),
                                    "published_at": r.get("published_at")} for r in latest[:WIKI_LATEST_N]]
        if manifests is not None:
            states = [(m, (m["channels"].get(ch) or {}).get("state")) for m in manifests if ch in m["channels"]]
            block["queued"] = sum(1 for _, s in states if s in QUEUED_STATES)
            block["held"] = sum(1 for _, s in states if s in HELD_STATES)
            recent = []
            for m, s in states[:RECENT_N]:
                entry = {"change_id": m.get("change_id"), "state": s, "created_at": m.get("created_at")}
                if ch == "reddit":
                    entry["title"] = _reddit_title(m)
                recent.append(entry)
            block["recent"] = recent
        measured = deliveries is not None or manifests is not None
        block["state"] = "MEASURED" if measured else "UNMEASURED"
        block["reason"] = None if measured else f"deliveries={deliveries_reason};outbox={outbox_reason}"
        out[ch] = block
    return out


def _tutorials(estate: Path, manifests: list[dict] | None, deliveries: list[dict] | None) -> tuple[list[dict], dict]:
    """Public-safe lessons, joined to a wiki page only through an observed chain:
    tutorial.incident_dir prefixes a manifest evidence path -> that manifest's
    change_id -> a PASS wiki delivery carrying a url. No chain, no link."""
    data, err = _read_json(estate / "state" / "error_corpus" / "tutorials.latest.json")
    if err or not isinstance(data, dict) or not isinstance(data.get("tutorials"), list):
        return [], _unmeasured(err or "SCHEMA_MISMATCH")
    wiki_url_by_change: dict[str, str] = {}
    for r in deliveries or []:
        if r.get("channel") == "wiki" and r.get("state") in PUBLISHED_STATES and r.get("url") and r.get("change_id"):
            wiki_url_by_change[str(r["change_id"])] = str(r["url"])
    rows = []
    for t in data["tutorials"]:
        if not isinstance(t, dict) or t.get("public_safe") is not True:
            continue
        incident_dir = str(t.get("incident_dir") or "").replace("\\", "/").rstrip("/")
        change_id, url = None, None
        if incident_dir:
            for m in manifests or []:
                evidence = [str(e).replace("\\", "/") for e in (m.get("evidence") or [])]
                if any(e.startswith(incident_dir + "/") or e == incident_dir for e in evidence):
                    change_id = m.get("change_id")
                    url = wiki_url_by_change.get(str(change_id))
                    if url:
                        break
        rows.append({
            "lesson_id": t.get("lesson_id"),
            "error_class": t.get("error_class"),
            "severity": t.get("severity"),
            "env": t.get("env"),
            "channels": [c for c in (t.get("channels") or []) if isinstance(c, str)],
            "wiki_change_id": change_id,
            "wiki_url": url,
            "wiki_join": "incident_dir->manifest.evidence->change_id->wiki delivery" if url else
                         ("CHANGE_FOUND_NOT_PUBLISHED" if change_id else "NO_JOIN_KEY"),
        })
    return rows, {"state": "MEASURED", "reason": None, "generated_at": data.get("generated_at")}


def _sanitize_reason(reason) -> str | None:
    if not isinstance(reason, str) or not reason:
        return None
    reason = SECRET_LIST_RE.sub(r"\1", reason)
    return SECRET_NAME_RE.sub("[secret-name]", reason)


def _validity(estate: Path) -> tuple[list[dict], dict]:
    data, err = _read_json(estate / "state" / "integrations" / "validity.latest.json")
    if err or not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return [], _unmeasured(err or "SCHEMA_MISMATCH")
    rows = [{"id": i.get("id"), "state": i.get("state"), "observed_at": i.get("observed_at"),
             "latency_ms": i.get("latency_ms"), "reason": _sanitize_reason(i.get("reason"))}
            for i in data["items"] if isinstance(i, dict) and i.get("id") in VALIDITY_IDS]
    return rows, {"state": "MEASURED", "reason": None, "generated_at": data.get("generated_at")}


def leak_scan(obj, path: str = "$") -> list[str]:
    """Every string in the projection, against every token-shaped pattern."""
    hits: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            hits.extend(leak_scan(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits.extend(leak_scan(v, f"{path}[{i}]"))
    elif isinstance(obj, str):
        for name, pat in LEAK_PATTERNS:
            if pat.search(obj):
                hits.append(f"{path}: {name}")
    return hits


def project(estate: Path) -> dict:
    deliveries, d_reason = _read_deliveries(estate)
    manifests, o_reason = _read_outbox(estate)
    tutorials, t_section = _tutorials(estate, manifests, deliveries)
    validity, v_section = _validity(estate)
    channels = _channels(deliveries, d_reason, manifests, o_reason)
    for ch in CHANNELS:
        channels[ch]["validity"] = next((v for v in validity if v["id"] == ch), None)
    sections = {
        "deliveries": _unmeasured(d_reason) if deliveries is None else {"state": "MEASURED", "reason": None, "rows": len(deliveries)},
        "outbox": _unmeasured(o_reason) if manifests is None else {"state": "MEASURED", "reason": None, "manifests": len(manifests)},
        "tutorials": t_section,
        "validity": v_section,
    }
    measured = any(s.get("state") == "MEASURED" for s in sections.values())
    return {
        "schema": SCHEMA,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "state": "MEASURED" if measured else "UNMEASURED",
        "reason": None if measured else "NO_SOURCE_READABLE",
        "sections": sections,
        "channels": channels,
        "tutorials": tutorials,
        "validity": validity,
        "truth_boundary": {"presentation_only": True, "remote_writes": 0, "reddit_auto_post": False},
    }


def write_projection(estate: Path, out_path: Path) -> int:
    report = project(estate)
    hits = leak_scan(report)
    if hits:
        print("LEAK_GUARD: refusing to write integrations-status.json:")
        for h in hits:
            print(f"  {h}")
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    summary = {
        "state": report["state"],
        "sections": {k: v.get("state") for k, v in report["sections"].items()},
        "channels": {ch: {k: report["channels"][ch][k] for k in ("published", "queued", "held")} for ch in CHANNELS},
        "tutorials": len(report["tutorials"]),
        "validity": len(report["validity"]),
    }
    print(json.dumps(summary, indent=2))
    return 0


# ─── selftest: temporary fake estate, never the real one ───────────────────

def _fake_estate(root: Path) -> None:
    bc = root / "state" / "roadmap_broadcast"
    (bc / "outbox" / "BC-AAA").mkdir(parents=True)
    (bc / "outbox" / "BC-BBB").mkdir(parents=True)
    (root / "state" / "error_corpus").mkdir(parents=True)
    (root / "state" / "integrations").mkdir(parents=True)
    deliveries = [
        {"change_id": "BC-AAA", "channel": "wiki", "http_status": 500, "state": "FAIL", "url": None,
         "published_at": "2026-09-11T10:00:00+00:00", "readback": None},
        {"change_id": "BC-AAA", "channel": "wiki", "http_status": 200, "state": "PASS",
         "url": "https://wiki.example.test/roadmap/changes/2026-09-11-BC-AAA",
         "published_at": "2026-09-11T11:00:00+00:00", "readback": True},
        {"change_id": "BC-AAA", "channel": "discord", "http_status": 200, "state": "PASS", "url": None,
         "published_at": "2026-09-11T11:00:01+00:00", "readback": None},
        {"change_id": "BC-BBB", "channel": "reddit", "http_status": None, "state": "QUEUED_LOCAL", "url": None,
         "published_at": "2026-09-11T11:00:02+00:00", "readback": None},
    ]
    (bc / "deliveries.jsonl").write_text("\n".join(json.dumps(r) for r in deliveries) + "\n", encoding="utf-8")
    (bc / "outbox" / "BC-AAA" / "manifest.json").write_text(json.dumps({
        "change_id": "BC-AAA", "created_at": "2026-09-11T09:00:00+00:00", "public_safe": True,
        "channels": {"wiki": {"state": "PASS", "reason": None, "sha256": "a" * 64},
                     "discord": {"state": "PASS", "reason": None, "secret_name": "DISCORD_WEBHOOK_URL"},
                     "forum": {"state": "QUEUED", "reason": None},
                     "reddit": {"state": "QUEUED", "reason": None}},
        "evidence": ["state/learning_incidents/ERR-111/lesson.json"],
    }), encoding="utf-8")
    (bc / "outbox" / "BC-AAA" / "reddit.txt").write_text("Why X fails on staging and how to verify the fix\n\nbody\n", encoding="utf-8")
    (bc / "outbox" / "BC-BBB" / "manifest.json").write_text(json.dumps({
        "change_id": "BC-BBB", "created_at": "2026-09-11T12:00:00+00:00", "public_safe": False,
        "channels": {"wiki": {"state": "HELD", "reason": "TEMPLATE_UNRENDERED_IN_SOURCE"},
                     "discord": {"state": "HELD", "reason": "X"},
                     "forum": {"state": "HELD", "reason": "X"},
                     "reddit": {"state": "HELD", "reason": "X"}},
        "evidence": ["state/learning_incidents/ERR-222/lesson.json"],
    }), encoding="utf-8")
    (bc / "outbox" / "BC-BBB" / "reddit.txt").write_text("HELD TITLE MUST NOT LEAK\n", encoding="utf-8")
    (root / "state" / "error_corpus" / "tutorials.latest.json").write_text(json.dumps({
        "generated_at": "2026-09-11T12:30:00+00:00",
        "tutorials": [
            {"lesson_id": "LES-ERR-111", "error_class": "BACKEND_PROXY_MISSING", "severity": "P0", "env": "staging",
             "channels": ["wiki", "forum"], "public_safe": True, "paths": ["/x"], "incident_dir": "state/learning_incidents/ERR-111"},
            {"lesson_id": "LES-ERR-222", "error_class": "STALE_STATUS", "severity": "P2", "env": "production",
             "channels": ["wiki"], "public_safe": True, "paths": ["/y"], "incident_dir": "state/learning_incidents/ERR-222"},
            {"lesson_id": "LES-ERR-333", "error_class": "PRIVATE", "severity": "P1", "env": "staging",
             "channels": ["wiki"], "public_safe": False, "paths": ["/z"], "incident_dir": "state/learning_incidents/ERR-333"},
        ],
    }), encoding="utf-8")
    (root / "state" / "integrations" / "validity.latest.json").write_text(json.dumps({
        "generated_at": "2026-09-11T12:40:00+00:00",
        "items": [
            {"id": "wiki", "state": "PASS", "http_status": 200, "latency_ms": 12, "observed_at": "2026-09-11T12:40:00+00:00",
             "probe": "graphql", "endpoint": "https://wiki.example.test/graphql?token=" + "ghp_" + "A" * 26,
             "identity": "svc@example.test", "secret_names": ["WIKIJS_API_TOKEN"], "reason": None},
            {"id": "reddit", "state": "UNMEASURED", "http_status": None, "latency_ms": None, "observed_at": "2026-09-11T12:40:01+00:00",
             "probe": None, "endpoint": None, "identity": None, "secret_names": ["R_SECRET"],
             "reason": "SECRET_NAMES_NOT_RESOLVED:BUILDANDDO_REDDIT_BRIDGE_SECRET,BUILDANDDO_REDDIT_CLIENT_ID"},
            {"id": "forum", "state": "DEGRADED", "http_status": 200, "latency_ms": 30, "observed_at": "2026-09-11T12:40:02+00:00",
             "probe": None, "endpoint": None, "identity": None, "secret_names": [], "reason": "publish key missing: BUILDANDDO_FORUM_API_KEY"},
            {"id": "gumroad", "state": "PASS", "http_status": 200, "latency_ms": 5, "observed_at": "2026-09-11T12:40:03+00:00",
             "probe": None, "endpoint": None, "identity": None, "secret_names": [], "reason": None},
        ],
    }), encoding="utf-8")


def _check(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def selftest() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _fake_estate(root / "estate")
        out = root / "out" / "integrations-status.json"
        rc = write_projection(root / "estate", out)
        _check(rc == 0, "fake estate: write returned non-zero", failures)
        report = json.loads(out.read_text(encoding="utf-8"))
        _check(report["schema"] == SCHEMA and report["state"] == "MEASURED", "schema/state", failures)
        wiki, reddit, forum, discord = (report["channels"][c] for c in ("wiki", "reddit", "forum", "discord"))
        _check(wiki["published"] == 1 and wiki["held"] == 1 and wiki["queued"] == 0, f"wiki counts {wiki}", failures)
        _check(wiki["latest"] and wiki["latest"][0]["change_id"] == "BC-AAA", "wiki latest", failures)
        _check(wiki["last_published_at"] == "2026-09-11T11:00:00+00:00", "wiki last_published_at", failures)
        _check(discord["published"] == 1 and discord["held"] == 1, f"discord counts {discord}", failures)
        _check(forum["published"] == 0 and forum["queued"] == 1 and forum["held"] == 1, f"forum counts {forum}", failures)
        _check(reddit["published"] == 0 and reddit["queued"] == 1 and reddit["held"] == 1, f"reddit counts {reddit}", failures)
        titles = {e["change_id"]: e.get("title") for e in reddit["recent"]}
        _check(titles.get("BC-AAA", "").startswith("Why X fails"), "reddit safe title present", failures)
        _check(titles.get("BC-BBB") is None, "reddit HELD title must be null", failures)
        _check(wiki["validity"]["state"] == "PASS" and "endpoint" not in wiki["validity"], "wiki validity projected without endpoint", failures)
        ids = {t["lesson_id"] for t in report["tutorials"]}
        _check(ids == {"LES-ERR-111", "LES-ERR-222"}, f"public_safe only: {ids}", failures)
        by_id = {t["lesson_id"]: t for t in report["tutorials"]}
        _check(by_id["LES-ERR-111"]["wiki_url"].endswith("BC-AAA"), "tutorial joined to wiki url", failures)
        _check(by_id["LES-ERR-222"]["wiki_url"] is None and by_id["LES-ERR-222"]["wiki_join"] == "CHANGE_FOUND_NOT_PUBLISHED",
               "unpublished tutorial has null wiki_url", failures)
        vids = {v["id"] for v in report["validity"]}
        _check(vids == {"wiki", "reddit", "forum"}, f"validity id filter: {vids}", failures)
        reasons = {v["id"]: v["reason"] for v in report["validity"]}
        _check(reasons["reddit"] == "SECRET_NAMES_NOT_RESOLVED", f"reddit reason sanitized: {reasons['reddit']}", failures)
        _check("BUILDANDDO_FORUM_API_KEY" not in (reasons["forum"] or ""), "forum reason sanitized", failures)
        text = out.read_text(encoding="utf-8")
        for needle in ("secret_name", "sha256", "endpoint", "identity", "ghp_", "HELD TITLE", "WIKIJS_API_TOKEN"):
            _check(needle not in text, f"forbidden field/value in output: {needle}", failures)
        # leak guard trips on a token-shaped value and refuses the write
        _check(leak_scan({"a": {"b": ["eyJhbGciOiJIUzI1NiJ9.x"]}}) == ["$.a.b[0]: jwt"], "leak_scan jwt", failures)
        _check(leak_scan({"x": "glpat-" + "a" * 26}) == ["$.x: gitlab_pat"], "leak_scan glpat", failures)
        _check(leak_scan({"x": "f" * 40}) == ["$.x: long_hex"], "leak_scan hex", failures)
        _check(leak_scan({"x": "phc_" + "A" * 24}) == ["$.x: posthog_key"], "leak_scan phc", failures)
        _check(leak_scan(report) == [], "clean report scans clean", failures)
        (root / "estate" / "state" / "roadmap_broadcast" / "outbox" / "BC-AAA" / "reddit.txt").write_text(
            "ghp_" + "A" * 30 + "\n", encoding="utf-8")  # built at runtime so the public-boundary scanner never sees a token-shaped literal
        out2 = root / "out2" / "integrations-status.json"
        _check(write_projection(root / "estate", out2) == 1 and not out2.exists(), "leak guard refuses the write", failures)
        # absent estate: every section UNMEASURED, still exit 0
        out3 = root / "out3" / "integrations-status.json"
        _check(write_projection(root / "nowhere", out3) == 0, "absent estate exits 0", failures)
        absent = json.loads(out3.read_text(encoding="utf-8"))
        _check(absent["state"] == "UNMEASURED", "absent estate state", failures)
        _check(all(s["state"] == "UNMEASURED" for s in absent["sections"].values()), "absent sections", failures)
        _check(all(c["state"] == "UNMEASURED" and c["published"] is None for c in absent["channels"].values()), "absent channels", failures)
        _check(absent["tutorials"] == [] and absent["validity"] == [], "absent lists empty", failures)
        # corrupt tutorials file: only that section UNMEASURED
        (root / "estate" / "state" / "error_corpus" / "tutorials.latest.json").write_text("{not json", encoding="utf-8")
        partial = project(root / "estate")
        _check(partial["sections"]["tutorials"]["state"] == "UNMEASURED" and partial["state"] == "MEASURED", "partial corrupt", failures)
    for f in failures:
        print(f"SELFTEST FAIL: {f}")
    print(f"SELFTEST {'PASS' if not failures else 'FAIL'} failures={len(failures)}")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="project estate public-record channels into integrations-status.json")
    ap.add_argument("--estate", default=None, help=f"estate root (default env {ESTATE_ENV} or {ESTATE_DEFAULT})")
    ap.add_argument("--out", default=None, help=f"output path (default {OUT_PATH})")
    ap.add_argument("--selftest", action="store_true", help="run against a temporary fake estate and exit")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()
    estate = Path(args.estate or os.environ.get(ESTATE_ENV) or ESTATE_DEFAULT)
    return write_projection(estate, Path(args.out) if args.out else OUT_PATH)


if __name__ == "__main__":
    raise SystemExit(main())
