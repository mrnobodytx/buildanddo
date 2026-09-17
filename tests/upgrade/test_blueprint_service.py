# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_blueprint_service.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/adapters/service.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/decision/adapters/service.py
# DAG Node:    none
# Intent:      Prove the offline blueprint planning chain, native process adapter and authority/provenance boundaries.
# ───────────────────────────────────────────────────────────────

"""Verify Python RPC bounds and the real subprocess decision boundary."""
from __future__ import annotations

import asyncio
import base64
from email.message import Message
import io
import json
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from apps.decision.adapters import server, service
from apps.decision.adapters.server import DecisionHandler
from apps.research.contracts import ResearchError
from tests.upgrade.blueprint_support import FIXTURE, sample_blueprint


class ServiceTests(unittest.TestCase):
    def test_real_subprocess_calls_python_bdr(self):
        body = {"state": {"evidence_count": 3, "contradicted": False},
                "questions": {"should_act": {"type": "noul"}}, "trace_id": "test-trace"}
        status, raw = server.execute("decide", json.dumps(body).encode())
        result = json.loads(raw)
        self.assertEqual(status, 200)
        self.assertTrue(result["answers"]["should_act"]["value"])
        self.assertEqual(result["route"], "rules")
        self.assertEqual(result["cost_usd"], 0)
        self.assertEqual(result["authority"], "A0")
        self.assertFalse(result["verified"])
        self.assertEqual(result["trace_id"], "test-trace")
        self.assertGreaterEqual(result["latency_ms"], 0)

    def test_generic_decide_preserves_typed_state_and_authority_validation(self):
        cases = [
            {"state": {}, "questions": {}, "authority": "A0"},
            {"state": [], "questions": {"answer": {"type": "noul"}}},
            {"state": {}, "questions": {"answer": {"type": "noul"}}, "authority": "A4"},
            {"state": {}, "questions": {"answer": {"type": "noul"}}, "extra": "untrusted"},
        ]
        for payload in cases:
            result = json.loads(service.process_request(json.dumps({"operation": "decide", "payload": payload}).encode()))
            self.assertIn(result["failure"], ("invalid_data", "authority_denied"))
        body = {"state": {}, "questions": {"answer": {"type": "noul"}}, "authority": "A1"}
        result = json.loads(service.process_request(json.dumps({"operation": "decide", "payload": body}).encode()))
        self.assertEqual(result["authority"], "A1")
        self.assertFalse(result["verified"])

    def test_pdf_service_keeps_full_pipeline_and_only_generates_requested_prompts(self):
        body = {"name": FIXTURE.name, "pdf_base64": base64.b64encode(FIXTURE.read_bytes()).decode()}
        with patch.object(service, "extract_blueprint", return_value=sample_blueprint()):
            result = asyncio.run(service.dispatch("blueprint", body))
            self.assertEqual(result["session_prompts"], [])
            self.assertEqual(len(result["evaluations"]), 3)
            self.assertIsNotNone(result["mission_plan"])
            with_prompts = asyncio.run(service.dispatch("blueprint", {**body, "include_prompts": True}))
            self.assertEqual(len(with_prompts["session_prompts"]), 3)
            self.assertEqual(result["mission_plan"], with_prompts["mission_plan"])

    def test_cyclic_plan_preserves_extraction_for_review(self):
        bp = sample_blueprint(["1. A", "REQ-001 The Alpha service depends on the Beta service and must store results.",
                               "2. B", "REQ-002 The Beta service depends on the Alpha service and must read results."])
        body = {"name": FIXTURE.name, "pdf_base64": base64.b64encode(FIXTURE.read_bytes()).decode()}
        with patch.object(service, "extract_blueprint", return_value=bp):
            result = asyncio.run(service.dispatch("blueprint", body))
        self.assertEqual(result["planning_error"], "cyclic_dependencies")
        self.assertIsNone(result["mission_plan"])
        self.assertEqual(len(result["evaluations"]), 2)
        self.assertEqual(result["session_prompts"], [])

    def test_pdf_contract_rejects_actions_authority_invalid_base64_and_unknown_fields(self):
        base = {"name": "input.pdf", "pdf_base64": "JVBERi0xLjQ="}
        for body in [{**base, "authority": "A3"}, {**base, "include_prompts": "yes"}, {**base, "pdf_base64": "bad%%%"},
                     {**base, "endpoint": "https://untrusted.invalid"}, {**base, "pdf_base64": None}]:
            with self.assertRaises(ResearchError):
                asyncio.run(service.dispatch("blueprint", body))
        with self.assertRaises(ResearchError):
            asyncio.run(service.dispatch("launch_session", base))

    def test_json_limits_and_unexpected_parser_errors_are_sanitized(self):
        for raw in [b"[]", b"{", b'{"a":NaN}', b"null", b"{}", b'{"operation":"decide"}']:
            self.assertEqual(json.loads(service.process_request(raw))["failure"], "invalid_data")
        with patch.object(service, "MAX_REQUEST", 2):
            self.assertEqual(json.loads(service.process_request(b"xxx"))["failure"], "too_large")
        payload = json.dumps({"operation": "blueprint", "payload": {"name": "x.pdf", "pdf_base64": "JVBERi0xLjQ="}}).encode()
        with patch.object(service, "extract_blueprint", side_effect=RuntimeError("private-document")):
            self.assertEqual(service.process_request(payload), b'{"failure":"invalid_data"}')
        with patch.object(service, "MAX_RESPONSE", 2):
            result = service.process_request(json.dumps({"operation": "decide", "payload": {
                "state": {}, "questions": {"answer": {"type": "noul"}}}}).encode())
            self.assertEqual(json.loads(result)["failure"], "too_large")

    def test_subprocess_timeouts_errors_and_invalid_outputs_fail_closed(self):
        for value, expected in [
            (subprocess.TimeoutExpired("python", 30), 504), (OSError("private-path"), 503),
            (SimpleNamespace(returncode=1, stdout=b"private-data"), 503),
            (SimpleNamespace(returncode=0, stdout=b"[]"), 400),
            (SimpleNamespace(returncode=0, stdout=b'{"failure":"capability_unavailable"}'), 503),
            (SimpleNamespace(returncode=0, stdout=b'{"failure":"authority_denied"}'), 403),
        ]:
            options = {"side_effect": value} if isinstance(value, Exception) else {"return_value": value}
            with patch.object(server.subprocess, "run", **options):
                status, result = server.execute("decide", b"{}")
            self.assertEqual(status, expected)
            self.assertNotIn(b"private", result)

    def handler(self, path="/decide", payload=b"{}", headers=None):
        handler = object.__new__(DecisionHandler)
        handler.path = path
        handler.headers = Message()
        for key, value in (headers or {"Content-Type": "application/json", "Content-Length": str(len(payload))}).items():
            handler.headers[key] = value
        handler.connection = SimpleNamespace(settimeout=lambda _value: None)
        handler.rfile = io.BytesIO(payload)
        handler.wfile = io.BytesIO()
        responses = []
        handler.send_response = responses.append
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        return handler, responses

    def test_http_handler_bounds_methods_origins_content_type_and_payload(self):
        for path, headers in [
            ("/session", {"Content-Type": "application/json", "Content-Length": "2"}),
            ("/decide", {"Origin": "https://untrusted.invalid", "Content-Type": "application/json", "Content-Length": "2"}),
            ("/decide", {"Content-Type": "text/plain", "Content-Length": "2"}),
            ("/decide", {"Content-Type": "application/json", "Content-Length": "bad"}),
            ("/decide", {"Content-Type": "application/json", "Content-Length": "999999999"}),
            ("/decide", {"Content-Type": "application/json", "Content-Length": "3"}),
            ("/decide", {"Content-Type": "application/json", "Transfer-Encoding": "chunked", "Content-Length": "2"}),
        ]:
            handler, responses = self.handler(path, headers=headers)
            handler.do_POST()
            self.assertIn(responses[0], (400, 413))
        handler, responses = self.handler()
        with patch.object(server, "execute", return_value=(200, b'{"verified":false}')) as execute:
            handler.do_POST()
        execute.assert_called_once_with("decide", b"{}")
        self.assertEqual(responses, [200])
        self.assertEqual(handler.wfile.getvalue(), b'{"verified":false}')
        handler.log_message("source-data", "sensitive")

    def test_http_read_deadline_is_sanitized(self):
        handler, responses = self.handler()
        handler.rfile = SimpleNamespace(read=lambda _size: (_ for _ in ()).throw(OSError("private")))
        handler.do_POST()
        self.assertEqual(responses, [408])

    def test_server_only_binds_loopback(self):
        server_double = SimpleNamespace(serve_forever=lambda: None)
        with patch.object(server.sys, "argv", ["server", "--port", "8123"]), \
             patch.object(server, "HTTPServer") as http:
            http.return_value.__enter__.return_value = server_double
            server.main()
        http.assert_called_once_with(("127.0.0.1", 8123), DecisionHandler)
        with patch.object(server.sys, "argv", ["server", "--port", "70000"]), \
             patch.object(server.sys, "stderr", io.StringIO()):
            with self.assertRaises(SystemExit):
                server.main()
