# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        services/buildanddo_visual_substrate/server.py
# Stage:       09_RUNTIME
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     services/buildanddo_visual_substrate/bridge_client.py,
#              services/buildanddo_visual_substrate/citadelkey.py,
#              services/buildanddo_visual_substrate/leakcheck.py
# EnumType:    Service
# EnumEdges:   CONSUMES services/buildanddo_visual_substrate/bridge_client.py;
#              CONSUMES services/buildanddo_visual_substrate/leakcheck.py;
#              PRODUCES GET /api/rooms/projection/{kind}, /api/rooms/health, /api/rooms/policy;
#              VERIFIED_BY services/buildanddo_visual_substrate/__main__.py --selftest
# Intent:      The BuildAndDo backend boundary for Living Rooms: the only process that
#              holds the tenant private key, signs on behalf of the browser, refuses
#              `systems` locally, and leak-checks every body before it is rendered.
# ───────────────────────────────────────────────────────────────
"""Threaded stdlib HTTP sidecar exposing ``/api/rooms/*`` to the SPA.

Routes
    GET /api/rooms/projection/{kind}   kind in PUBLIC_ROOMS -> signed upstream GET
                                       kind == systems      -> 403 locally, never forwarded
    GET /api/rooms/health              {state, custody, upstream}
    GET /api/rooms/policy              signed upstream GET, passed through

Bind address comes from ``BUILDANDDO_ROOMS_BIND`` (default ``127.0.0.1:8092``);
nginx or the Vite dev proxy fronts it. The process never listens on a public
interface by default and never accepts anything but GET.
"""
from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import __version__
from .bridge_client import BridgeClient, UpstreamResponse
from .citadelkey import CustodyError, Signer, custody_status
from .leakcheck import find_leaks

SRS = "SRS-BUILDANDDO-LIVE-UTILIZATION-001"
BIND_ENV = "BUILDANDDO_ROOMS_BIND"
DEFAULT_BIND = "127.0.0.1:8092"
PREFIX = "/api/rooms/"

#: Rooms the SPA may ask for. What Citadel Nexus actually grants is its decision;
#: this list only bounds what we are willing to forward.
PUBLIC_ROOMS: frozenset[str] = frozenset({
    "organization", "capability", "development", "mission",
    "learning", "evidence", "community", "replay",
})
#: Never forwarded. Internal topology by definition (Citadel Nexus NEVER_EXPORT).
NEVER_FORWARD: frozenset[str] = frozenset({"systems"})


def parse_bind(text: str | None = None) -> tuple[str, int]:
    raw = text if text is not None else os.environ.get(BIND_ENV, DEFAULT_BIND)
    host, _, port = raw.rpartition(":")
    return host or "127.0.0.1", int(port)


class RoomsState:
    """Process-wide state shared by handler threads: the client and last upstream verdict."""

    def __init__(self, client: BridgeClient, custody: dict[str, Any]):
        self.client = client
        self.custody = custody
        self._lock = threading.Lock()
        self.upstream: dict[str, Any] = {"state": "UNMEASURED", "last_status": None,
                                         "last_detail": None, "last_projection": None}

    def record_upstream(self, projection: str, resp: UpstreamResponse) -> None:
        with self._lock:
            self.upstream = {
                "state": "REACHABLE" if resp.status < 500 else "UNREACHABLE",
                "last_status": resp.status,
                "last_detail": None if resp.status == 200 else resp.detail(),
                "last_projection": projection,
            }

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self.upstream)


def build_state(signer: Signer | None = None, client: BridgeClient | None = None,
                custody: dict[str, Any] | None = None) -> RoomsState:
    """Assemble state from the environment; a missing key is a HOLD, not a crash.

    The sidecar still starts without a key so ``/api/rooms/health`` can say WHY it
    cannot serve, and so every projection request answers 401 from upstream instead
    of a connection refusal the browser cannot distinguish from an outage.
    """
    if custody is None:
        custody = custody_status()
    if client is None:
        if signer is None and custody.get("custody") in ("PASS", "UNMEASURED"):
            try:
                signer = Signer.from_env()
            except CustodyError:
                signer = None
        client = BridgeClient(signer)
    return RoomsState(client, custody)


class RoomsHandler(BaseHTTPRequestHandler):
    server_version = "BuildAndDoRooms/" + __version__
    state: RoomsState  # attached by make_server()

    def log_message(self, fmt: str, *args: Any) -> None:  # keep stdout quiet; nginx logs
        return

    # ── helpers ──────────────────────────────────────────────────────────────
    def _send_json(self, status: int, body: dict[str, Any] | bytes) -> None:
        raw = body if isinstance(body, bytes) else json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def _relay(self, projection: str, resp: UpstreamResponse) -> None:
        """Pass an upstream verdict through unchanged, leak-checking a 200 body first."""
        self.state.record_upstream(projection, resp)
        if resp.status != 200:
            body = resp.body if resp.status < 500 else b""
            self._send_json(resp.status, body or {"detail": resp.detail()})
            return
        text = resp.body.decode("utf-8", errors="replace")
        leaks = find_leaks(text)
        if leaks:
            # The body is dropped here and now. Only the finding KINDS are reported;
            # the matched tokens stay in-process.
            kinds = sorted({item.split(":", 1)[0] for item in leaks})
            self._send_json(502, {"detail": "projection_leak_check_failed", "kinds": kinds})
            return
        self._send_json(200, resp.body)

    # ── routes ───────────────────────────────────────────────────────────────
    def do_GET(self) -> None:  # noqa: N802 - http.server API
        path = self.path.split("?", 1)[0]
        if not path.startswith(PREFIX):
            self._send_json(404, {"detail": "not_found"})
            return
        rest = path[len(PREFIX):].strip("/")
        if rest == "health":
            self._send_json(200, self.health())
        elif rest == "policy":
            self._relay("policy", self.state.client.get_policy())
        elif rest.startswith("projection/"):
            self.projection(rest[len("projection/"):])
        else:
            self._send_json(404, {"detail": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        self._send_json(405, {"detail": "method_not_allowed"})

    do_PUT = do_DELETE = do_PATCH = do_POST

    def projection(self, kind: str) -> None:
        if kind in NEVER_FORWARD:
            self._send_json(403, {"detail": "projection_never_exportable"})
            return
        if kind not in PUBLIC_ROOMS:
            self._send_json(404, {"detail": "unknown_room"})
            return
        self._relay(kind, self.state.client.get_projection(kind))

    def health(self) -> dict[str, Any]:
        custody = self.state.custody
        state = "HOLD" if custody.get("custody") == "HOLD" else "READY"
        return {"srs": SRS, "state": state, "version": __version__,
                "custody": custody, "upstream": self.state.snapshot(),
                "rooms": sorted(PUBLIC_ROOMS), "never_forwarded": sorted(NEVER_FORWARD)}


def make_server(state: RoomsState, bind: tuple[str, int] | None = None) -> ThreadingHTTPServer:
    handler = type("BoundRoomsHandler", (RoomsHandler,), {"state": state})
    return ThreadingHTTPServer(bind or parse_bind(), handler)


def serve_forever(state: RoomsState | None = None) -> None:
    httpd = make_server(state or build_state())
    host, port = httpd.server_address[:2]
    print(json.dumps({"srs": SRS, "listening": f"{host}:{port}",
                      "custody": httpd.RequestHandlerClass.state.custody.get("custody")}))
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
