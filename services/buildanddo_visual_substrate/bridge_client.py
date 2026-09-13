# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        services/buildanddo_visual_substrate/bridge_client.py
# Stage:       09_RUNTIME
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     services/buildanddo_visual_substrate/citadelkey.py
# EnumType:    Service
# EnumEdges:   CONSUMES services/buildanddo_visual_substrate/citadelkey.py;
#              CONSUMES https://citadel-nexus.com/api/platform/rooms/*;
#              VERIFIED_BY services/buildanddo_visual_substrate/__main__.py --selftest
# Intent:      One signed GET per request against the Citadel Nexus room bridge,
#              passing its status codes and denial reasons through unchanged so a
#              caller can tell "not granted" from "bad signature".
# ───────────────────────────────────────────────────────────────
"""HTTP client for the Citadel Nexus platform-rooms bridge.

Every call signs a FRESH envelope (new nonce, new timestamp) bound to the exact
payload the upstream route rebuilds, ``{"projection": name}``. Status codes are
never rewritten: 401 means the key was not believed, 403 means it was believed and
still refused, and the first ``BODY_HEAD`` bytes of any 4xx body are preserved so
the ``detail`` reason survives the hop.

``transport`` is injectable so the selftest can run against an in-process fake
verifier with no socket at all; production uses ``urllib``.
"""
from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from .citadelkey import AUDIENCE, Signer

DEFAULT_BASE_URL = "https://citadel-nexus.com"
BASE_URL_ENV = "BUILDANDDO_ROOMS_UPSTREAM"
USER_AGENT = "BuildAndDo-Rooms-Bridge (https://buildanddo.com, 1.0)"
TIMEOUT_S = 8.0
BODY_HEAD = 2048
PROJECTION_PATH = "/api/platform/rooms/projection/"
POLICY_PATH = "/api/platform/rooms/policy"


@dataclass(frozen=True)
class UpstreamResponse:
    status: int
    body: bytes
    content_type: str

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))

    def detail(self) -> str:
        """Denial reason as the upstream phrased it, or a status-derived fallback."""
        try:
            data = json.loads(self.body.decode("utf-8", errors="replace")[:BODY_HEAD])
            if isinstance(data, dict) and data.get("detail"):
                return str(data["detail"])
        except ValueError:
            pass
        return f"upstream_http_{self.status}"


Transport = Callable[[str, dict[str, str]], UpstreamResponse]


def urllib_transport(url: str, headers: dict[str, str]) -> UpstreamResponse:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return UpstreamResponse(resp.status, resp.read(),
                                    resp.headers.get("Content-Type", ""))
    except urllib.error.HTTPError as err:
        body = err.read() if err.fp is not None else b""
        if err.code >= 500:
            body = body[:BODY_HEAD]
        return UpstreamResponse(err.code, body, err.headers.get("Content-Type", ""))
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as err:
        reason = type(err).__name__
        return UpstreamResponse(502, json.dumps({"detail": f"upstream_unreachable:{reason}"}).encode(),
                                "application/json")


class BridgeClient:
    def __init__(self, signer: Signer | None, base_url: str | None = None,
                 transport: Transport | None = None, audience: str = AUDIENCE):
        self.signer = signer
        self.base_url = (base_url or os.environ.get(BASE_URL_ENV, DEFAULT_BASE_URL)).rstrip("/")
        self.transport = transport or urllib_transport
        self.audience = audience

    def _headers(self, payload: dict[str, Any] | None) -> dict[str, str]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if self.signer is not None:
            headers["X-Citadel-Key"] = self.signer.header(payload, self.audience)
        return headers

    def get_projection(self, name: str) -> UpstreamResponse:
        payload = {"projection": name}
        return self.transport(self.base_url + PROJECTION_PATH + name, self._headers(payload))

    def get_policy(self) -> UpstreamResponse:
        # The policy route decodes the envelope for routing only and does not bind a
        # payload; sign with no payload exactly as a bare `sign(seat)` would.
        return self.transport(self.base_url + POLICY_PATH, self._headers(None))
