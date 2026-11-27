# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/scrub.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     none
# EnumType:    Policy
# EnumEdges:   VALIDATES Sentry events before they leave a BuildAndDo process
# DAG Node:    none
# Intent:      Drop any event that touches code outside the public BuildAndDo plane and strip source, variables and personal data from the rest.
# ─────────────────────────────────────────────────────────────

"""Event firewall for Sentry.

Sentry is scoped to the public BuildAndDo plane. ``scrub_event`` is written to be passed as
an SDK ``before_send`` hook: it returns ``None`` to drop an event and a scrubbed copy
otherwise. Two rules apply.

* Scope guard. An event whose stack frames, modules or tags reference anything outside
  the allowed BuildAndDo roots is dropped whole, so private-plane code never reaches
  Sentry even if it is imported by mistake.
* Minimisation. Source context, local variables, request bodies, cookies, headers, user
  identity and host names are removed, and secret-looking strings in messages are
  redacted. What remains is the exception type, a redacted message and the frame
  locations: enough to triage, not enough to reconstruct the code.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Iterable, Mapping
from typing import Any

ALLOWED_ROOTS: tuple[str, ...] = ("apps/", "services/", "scripts/", "libs/", "tests/", "src/")
PRIVATE_MARKERS: tuple[str, ...] = (
    "citadel", "cnwb", "cnp", "nemesis", "guardian", "kestrel", "megamind", "forge_gpu",
    "memory_store", "lazarus", "sake_aegis", "cortex", "sentinel_core",
)
FRAME_DROP_KEYS: tuple[str, ...] = ("vars", "pre_context", "post_context", "context_line", "abs_path")
EVENT_DROP_KEYS: tuple[str, ...] = ("request", "user", "server_name", "contexts", "extra", "modules", "breadcrumbs")
REDACTED = "[redacted]"
SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]{8,}"),
    re.compile(r"(?i)\b(?:sk|pk|rk|xox[abp]|ghp|gho|glpat|dd)[-_][a-z0-9_-]{8,}"),
    re.compile(r"(?i)\b(?:api[_-]?key|token|secret|password|passwd|dsn)\s*[=:]\s*\S+"),
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    re.compile(r"https?://[^\s'\"]+"),
)


def redact(text: str) -> str:
    """Replace secret-looking substrings, emails, IPs and URLs in ``text``."""
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(REDACTED, text)
    return text


def _private(value: str) -> bool:
    lowered = value.lower().replace("\\", "/")
    return any(marker in lowered for marker in PRIVATE_MARKERS)


def _frames(event: Mapping[str, Any]) -> Iterable[dict[str, Any]]:
    for value in (event.get("exception") or {}).get("values") or []:
        yield from ((value.get("stacktrace") or {}).get("frames") or [])
    for thread in (event.get("threads") or {}).get("values") or []:
        yield from ((thread.get("stacktrace") or {}).get("frames") or [])


def in_scope(event: Mapping[str, Any]) -> bool:
    """True when nothing in the event points outside the public BuildAndDo plane."""
    for frame in _frames(event):
        for key in ("filename", "abs_path", "module", "package", "function"):
            value = frame.get(key)
            if isinstance(value, str) and _private(value):
                return False
        name = str(frame.get("filename") or "").replace("\\", "/").lstrip("./")
        if frame.get("in_app") and name and not name.startswith(ALLOWED_ROOTS):
            return False
    tags = event.get("tags") or {}
    pairs = tags.items() if isinstance(tags, Mapping) else (tuple(pair) for pair in tags)
    for key, value in pairs:
        if _private(str(key)) or _private(str(value)):
            return False
    return not _private(str(event.get("logger") or "")) and not _private(str(event.get("transaction") or ""))


def scrub_event(event: Mapping[str, Any], hint: Any = None) -> dict[str, Any] | None:
    """SDK ``before_send`` hook: drop out-of-scope events, minimise the rest."""
    del hint
    if not isinstance(event, Mapping) or not in_scope(event):
        return None
    clean = copy.deepcopy(dict(event))
    for key in EVENT_DROP_KEYS:
        clean.pop(key, None)
    for frame in _frames(clean):
        for key in FRAME_DROP_KEYS:
            frame.pop(key, None)
    for value in (clean.get("exception") or {}).get("values") or []:
        if isinstance(value.get("value"), str):
            value["value"] = redact(value["value"])
    message = clean.get("message")
    if isinstance(message, str):
        clean["message"] = redact(message)
    elif isinstance(message, Mapping):
        clean["message"] = {k: redact(v) if isinstance(v, str) else v for k, v in message.items() if k != "params"}
    logentry = clean.get("logentry")
    if isinstance(logentry, Mapping):
        clean["logentry"] = {"message": redact(str(logentry.get("formatted") or logentry.get("message") or ""))}
    return clean


SDK_OPTIONS: dict[str, Any] = {
    "send_default_pii": False,
    "include_local_variables": False,
    "include_source_context": False,
    "max_breadcrumbs": 0,
    "attach_stacktrace": False,
}
"""Python SDK options to pair with ``before_send=scrub_event``."""
