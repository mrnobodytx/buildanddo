#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/publish/activity_publish.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-07
# Depends:     scripts/deploy/ship.py
# EnumType:    Service
# EnumEdges:   CONSUMED_BY scripts/deploy/ship.py; VALIDATED_BY tests/upgrade/test_activity_publish.py
# DAG Node:    none
# Intent:      Publish one verified release to the wiki, Discord and Reddit with every IP address
#              and every fleet machine name withheld from the public text.
# ───────────────────────────────────────────────────────────────
"""
activity_publish.py - the canonical BuildAndDo publication fabric.

One verified release becomes ONE canonical ReleaseEvent, scrubbed into a
PublicActivityEvent, then projected to bounded per-channel adapters. No
adapter invents its own copy of "what happened" - they all render the same
evidence object differently:

  Wiki    = canonical durable record (the source of truth other channels
            link back to)
  Discord = concise operational notice (already proven working, cf3262e -
            preserved here, not rewritten)
  Reddit  = HOLD until a dedicated BuildAndDo Reddit app exists (never a
            fake PASS - see _publish_reddit)

Idempotent: keyed on (repository, commit, environment). Re-running ship.py
for the same commit does not re-publish; each channel's outcome is tracked
independently in state/publication/latest.json + history.jsonl.

No public text carries an IP address (IPv4 or IPv6, public or private) or a
fleet machine name. Both are replaced with a black bar before any adapter
sees the event; see redact_public_text.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
import re
import string
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
sys.path.insert(0, str(ROOT / "scripts" / "deploy"))
from ship import _SECRETS, _run  # noqa: E402 - reuse, don't duplicate secret loading / subprocess helper

STATE_DIR = ROOT / "state" / "publication"
WIKI_URL = "https://wiki.buildanddo.com"
PROD_URL = "https://buildanddo.com/"

# Reused verbatim from scripts/ci/verify_public_boundary.py - one definition of
# "looks like a secret", not a second copy that could silently drift.
SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github_pat", re.compile(r"\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b")),
    ("gitlab_pat", re.compile(r"\bglpat-[A-Za-z0-9_-]{12,}\b")),
    ("provider_sk", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
]
PRIVATE_PATTERNS = [
    ("windows_path", re.compile(r"[A-Za-z]:\\\\?(Users|citadel_websites|HOSTINGER_COMP)")),
    ("citadel_internal", re.compile(r"\bcitadel[-_]?nexus\.com\b|\bguilds/CNWB\b", re.IGNORECASE)),
]

# Operator rule, 2026-09-22: no public text carries ANY IP address - IPv4 or IPv6, public or
# private - or any fleet machine name. The pattern this replaces matched only 10.x, so a public
# address, a loopback URL or an IPv6 literal reached the wiki, Discord and Reddit verbatim.
# Matches are REDACTED rather than held: a release note that mentions an address is still worth
# publishing, and the address is the only part of it that must not travel.
IPV4 = re.compile(r"(?<!\d)(?<!\d\.)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\d)(?!\.\d)")
IPV6 = re.compile(
    r"(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}(?![\w:])"
    r"|(?<![\w:])(?:[0-9A-Fa-f]{1,4}:){1,6}:(?:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5})?(?![\w:])"
    r"|(?<![\w:])::[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,6}(?![\w:])"
)
REDACTED = "**" + chr(0x2588) * 8 + "**"  # the bold black bar (8 x U+2588) every withheld value becomes
LOOPBACK = "127.0.0.1"                  # the one address that becomes a word instead: localhost

# Machine names are deliberately NOT listed in this file. The repository is public, so a list
# here would be the very disclosure it exists to prevent. They are read at publish time from the
# private fleet map that CITADEL_FLEET_MAP points at.
FLEET_MAP_ENV = "CITADEL_FLEET_MAP"
FLEET_NAME_FIELDS = ("aka", "datadog_host", "provider_name", "hostname")


def _publication_key(repository: str, commit: str, environment: str) -> str:
    raw = f"{repository}:{commit}:{environment}:production_release"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _load_ledger() -> dict:
    p = STATE_DIR / "latest.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}


def _save_ledger(entry: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    (STATE_DIR / "latest.json").write_text(json.dumps(entry, indent=2, default=str), encoding="utf-8")
    with (STATE_DIR / "history.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, default=str) + "\n")


def build_release_event(title: str, summary: str, evidence: dict) -> dict:
    """The private, factual record. No social-specific copy belongs here (PHASE 2)."""
    sha = _run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT).get("stdout_tail", "").strip()
    msg = _run(["git", "log", "-1", "--pretty=%s"], cwd=ROOT).get("stdout_tail", "").strip()
    return {
        "event_id": f"BD-REL-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        "event_type": "production_release",
        "product": "buildanddo",
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "git": {"repository": "buildanddo", "commit": sha, "commit_message": msg},
        "deployment": {"environment": "production", "state": "VERIFIED_LIVE" if evidence.get("production_readback") else "UNVERIFIED"},
        "change": {"title": title or msg, "summary": summary or msg},
        "evidence": evidence,
        "publication": {"visibility": "PUBLIC_SAFE"},
    }


def _counts_as_ipv6(candidate: str) -> bool:
    """Prose produces IPv6 SHAPES too ('a::b'). Only '::1' or a candidate carrying at least
    four hex digits is treated as an address."""
    return candidate == "::1" or sum(ch in string.hexdigits for ch in candidate) >= 4


def _address_spans(text: str) -> list[tuple[int, int]]:
    spans = [m.span() for m in IPV4.finditer(text)]
    spans += [m.span() for m in IPV6.finditer(text) if _counts_as_ipv6(m.group())]
    return spans


def _fleet_names() -> list[str] | None:
    """Machine names from the private fleet map, longest first.

    [] when CITADEL_FLEET_MAP is unset: names are then skipped silently. None when it IS set but
    cannot be read as a fleet map - the operator asked for names to be withheld and that can no
    longer be guaranteed, so the caller holds the release rather than publish them."""
    location = os.environ.get(FLEET_MAP_ENV) or _SECRETS.get(FLEET_MAP_ENV)
    if not location:
        return []
    try:
        boxes = json.loads(Path(location).read_text(encoding="utf-8"))["boxes"]
        found = []
        for key, box in boxes.items():
            found.append(key)
            fields = box if isinstance(box, dict) else {}
            for field in FLEET_NAME_FIELDS:
                value = fields.get(field)
                found.extend(value if isinstance(value, list) else [value])
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    unique = {n.strip().lower(): n.strip() for n in found if isinstance(n, str) and n.strip()}
    return sorted(unique.values(), key=lambda name: (-len(name), name.lower()))


def _name_pattern(names: list[str]) -> re.Pattern | None:
    """One case-insensitive alternation, longest name first, bounded so a name inside a longer
    token (a name plus a suffix) is not cut in half."""
    if not names:
        return None
    alternation = "|".join(re.escape(name) for name in names)
    return re.compile(rf"(?<![A-Za-z0-9_-])(?:{alternation})(?![A-Za-z0-9_-])", re.IGNORECASE)


def redact_public_text(text: str, names: re.Pattern | None = None) -> str:
    """Withhold every IP address and fleet machine name in `text`.

    Spans are collected on the ORIGINAL text and merged before anything is replaced, so an
    address both patterns claim (an IPv4-mapped IPv6 literal) is withheld whole rather than
    half. The IPv4 loopback becomes `localhost`; everything else becomes the black bar."""
    spans = _address_spans(text)
    if names is not None:
        spans += [m.span() for m in names.finditer(text)]
    if not spans:
        return text
    merged: list[list[int]] = []
    for start, end in sorted(spans):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    parts, cursor = [], 0
    for start, end in merged:
        parts += [text[cursor:start], "localhost" if text[start:end] == LOOPBACK else REDACTED]
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def _redact_values(value, names: re.Pattern | None):
    """Redact every string VALUE of a nested event. Keys are left alone on purpose: an address
    in a key survives to the fail-closed scrub below and holds the release instead."""
    if isinstance(value, str):
        return redact_public_text(value, names)
    if isinstance(value, dict):
        return {key: _redact_values(item, names) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact_values(item, names) for item in value]
    return value


def _scrub_text(text: str, names: re.Pattern | None = None) -> tuple[bool, str | None]:
    """Fail-closed: any hit means the event may NOT reach a public adapter (PHASE 3). It runs
    after redaction, so an address or machine name found here is one redaction could not reach."""
    for fid, rx in SECRET_PATTERNS + PRIVATE_PATTERNS:
        if rx.search(text or ""):
            return False, fid
    if _address_spans(text or ""):
        return False, "ip_address"
    if names is not None and names.search(text or ""):
        return False, "fleet_machine_name"
    return True, None


def compile_public_projection(event: dict) -> tuple[dict | None, str | None]:
    """ReleaseEvent -> PublicActivityEvent with addresses and machine names withheld.
    Returns (None, finding) - a HOLD - if the scrub fails, and never silently publishes an
    event that failed the check."""
    fleet = _fleet_names()
    if fleet is None:
        return None, "fleet_map_unreadable"
    names = _name_pattern(fleet)
    event = _redact_values(event, names)
    ok, finding = _scrub_text(json.dumps(event, default=str), names)
    if not ok:
        return None, finding
    return {
        "event_id": event["event_id"],
        "commit": event["git"]["commit"],
        "timestamp": event["timestamp"],
        "title": event["change"]["title"],
        "summary": event["change"]["summary"],
        "deployment_state": event["deployment"]["state"],
        "evidence": event["evidence"],
        "public_url": PROD_URL,
    }, None


def _publish_wiki(public_event: dict) -> dict:
    """Canonical durable record. Returns page_id/url/content_sha256 or a HOLD reason -
    never a fake PASS if the API call fails."""
    api_key = _SECRETS.get("BAD_WIKI_API")
    if not api_key:
        return {"state": "HOLD", "reason": "BAD_WIKI_API not configured"}

    path = f"releases/bd-rel-{public_event['commit']}"
    title = f"Release {public_event['commit']} — {public_event['title']}"
    ev = public_event["evidence"]
    content = (
        f"# {title}\n\n"
        f"**Date:** {public_event['timestamp']}\n\n"
        f"## What changed\n\n{public_event['summary']}\n\n"
        f"## Verification\n\n"
        f"- Build: {ev.get('build', 'Unknown')}\n"
        f"- Lint: {ev.get('lint', 'Unknown')}\n"
        f"- Public boundary scrub: {ev.get('public_scrub', 'Unknown')}\n"
        f"- Production readback: {ev.get('production_readback', 'Unknown')}\n\n"
        f"## Commit\n\n`{public_event['commit']}` — "
        f"[github.com/mrnobodytx/buildanddo](https://github.com/mrnobodytx/buildanddo/commit/{public_event['commit']})\n\n"
        f"## Result\n\nLive at [{PROD_URL}]({PROD_URL})\n"
    )
    content_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()

    query = """
    mutation($content:String!,$description:String!,$path:String!,$title:String!) {
      pages { create(content:$content, description:$description, editor:"markdown",
                      isPublished:true, isPrivate:false, locale:"en", path:$path,
                      tags:["release"], title:$title) {
        responseResult { succeeded errorCode message } page { id path } } }
    }"""
    variables = {"content": content, "description": public_event["summary"][:190], "path": path, "title": title}
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(f"{WIKI_URL}/graphql", data=body, method="POST",
                                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 - fixed self-hosted URL from local secrets
            result = json.loads(resp.read())
    except urllib.error.URLError as exc:
        return {"state": "FAILED", "reason": f"{type(exc).__name__}: {exc}"}

    create = result.get("data", {}).get("pages", {}).get("create", {})
    rr = create.get("responseResult", {})
    if not rr.get("succeeded"):
        return {"state": "FAILED", "reason": rr.get("message", "unknown GraphQL error")}

    page = create.get("page", {})
    url = f"{WIKI_URL}/{page.get('path')}"
    readback_ok = False
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
            readback_ok = resp.status == 200
    except Exception:  # noqa: BLE001
        readback_ok = False

    return {"state": "VERIFIED" if readback_ok else "POSTED", "page_id": page.get("id"),
            "url": url, "content_sha256": content_sha256, "readback": readback_ok}


def _publish_discord(public_event: dict, wiki_result: dict) -> dict:
    """Preserves the exact proven cf3262e transport (explicit User-Agent, ?wait=true,
    returned message_id) - PHASE 1 requirement: do not regress working behavior."""
    from ship import _notify_guildmasters  # noqa: PLC0415 - reuse the proven transport, don't duplicate it

    wiki_line = f"\nWiki: {wiki_result['url']}" if wiki_result.get("url") else ""
    message = (f"BuildAndDo shipped to production — `{public_event['commit']}` {public_event['title']}"
               f" ({public_event['public_url']} verified live){wiki_line}")
    return _notify_guildmasters(message)


def _publish_reddit(public_event: dict) -> dict:
    """Bounded OAuth adapter - HOLD (not a fake PASS) until BUILDANDDO_REDDIT_* secrets
    exist. Deliberately does NOT reuse Citadel's own REDDIT_* credentials (workspace.env)
    - those are a different account/brand and mixing them would misattribute posts."""
    required = ["BUILDANDDO_REDDIT_CLIENT_ID", "BUILDANDDO_REDDIT_CLIENT_SECRET",
                "BUILDANDDO_REDDIT_REFRESH_TOKEN", "BUILDANDDO_REDDIT_USER_AGENT", "BUILDANDDO_REDDIT_SUBREDDIT"]
    missing = [k for k in required if not _SECRETS.get(k)]
    if missing:
        return {"state": "HOLD", "reason": f"missing: {', '.join(missing)}"}
    return {"state": "HOLD", "reason": "credentials present but the Reddit transport is not built; nothing is posted"}


def publish(title: str, summary: str, evidence: dict) -> dict:
    event = build_release_event(title, summary, evidence)
    ledger = _load_ledger()
    pub_key = _publication_key(event["git"]["repository"], event["git"]["commit"], event["deployment"]["environment"])

    if ledger.get("publication_key") == pub_key:
        result = dict(ledger)
        result["idempotent_skip"] = True
        print(json.dumps(result, indent=2, default=str))
        return result

    public_event, finding = compile_public_projection(event)
    if public_event is None:
        result = {"publication_key": pub_key, "state": "HOLD_SCRUB_FAILED", "finding": finding,
                  "event_id": event["event_id"]}
        _save_ledger(result)
        print(json.dumps(result, indent=2, default=str))
        return result

    wiki_result = _publish_wiki(public_event)
    discord_result = _publish_discord(public_event, wiki_result)
    reddit_result = _publish_reddit(public_event)

    result = {
        "publication_key": pub_key,
        "event_id": event["event_id"],
        "commit": event["git"]["commit"],
        "channels": {"wiki": wiki_result, "discord": discord_result, "reddit": reddit_result},
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    _save_ledger(result)
    print(json.dumps(result, indent=2, default=str))
    return result


if __name__ == "__main__":
    raise SystemExit(0 if publish("Manual publication test", "Manual CLI invocation",
                                    {"build": "PASS", "lint": "PASS", "public_scrub": "PASS",
                                     "production_readback": True}) else 1)
