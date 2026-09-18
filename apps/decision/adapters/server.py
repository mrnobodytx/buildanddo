# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/adapters/server.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py, apps/research/blueprints.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/decision/contract.py; DEPENDS_ON apps/research/blueprints.py
# DAG Node:    none
# Intent:      Run authenticated application decisions and blueprint analysis through a bounded local CPU process.
# ───────────────────────────────────────────────────────────────

"""Serve local PocketBase RPC through bounded disposable Python processes."""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import subprocess
import sys

from apps.decision.adapters.service import MAX_REQUEST, MAX_RESPONSE, json_object
from apps.research.contracts import ResearchError

ROOT = Path(__file__).resolve().parents[3]


def execute(operation: str, payload: bytes) -> tuple[int, bytes]:
    """Run one isolated CPU request with a deadline and no shell interpolation."""
    try:
        body = json_object(payload)
        request = json.dumps({"operation": operation, "payload": body}, ensure_ascii=True).encode()
        if len(request) > MAX_REQUEST:
            raise ResearchError("too_large")
        process = subprocess.run([sys.executable, "-m", "apps.decision.adapters.service"],
                                 input=request, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                 timeout=30, check=False)
        if process.returncode or len(process.stdout) > MAX_RESPONSE:
            return 503, b'{"failure":"processor_unavailable"}'
        result = json_object(process.stdout)
        code = result.get("failure")
        status = 503 if code == "capability_unavailable" else 403 if code == "authority_denied" else 400 if code else 200
        return status, process.stdout
    except subprocess.TimeoutExpired:
        return 504, b'{"failure":"timeout"}'
    except ResearchError:
        return 400, b'{"failure":"invalid_data"}'
    except OSError:
        return 503, b'{"failure":"processor_unavailable"}'


class DecisionHandler(BaseHTTPRequestHandler):
    """Accept application-owned loopback POSTs without exposing browser access."""

    def log_message(self, format: str, *args: object) -> None:
        """Suppress request logs that could contain user-controlled content."""

    def do_POST(self) -> None:
        """Dispatch only the two local operations behind native PocketBase auth."""
        if (self.path not in {"/decide", "/blueprint"} or self.headers.get("Origin")
                or self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding")):
            self._reply(400, b'{"failure":"invalid_request"}')
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= MAX_REQUEST:
            self._reply(413, b'{"failure":"too_large"}')
            return
        self.connection.settimeout(10)
        try:
            payload = self.rfile.read(size)
        except OSError:
            self._reply(408, b'{"failure":"timeout"}')
            return
        if len(payload) != size:
            self._reply(400, b'{"failure":"invalid_data"}')
            return
        status, result = execute(self.path[1:], payload)
        self._reply(status, result)

    def _reply(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    """Bind the CPU bridge to loopback; never expose a separate public API."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8091)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    # One request at a time bounds parser concurrency and resource consumption.
    with HTTPServer(("127.0.0.1", args.port), DecisionHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
