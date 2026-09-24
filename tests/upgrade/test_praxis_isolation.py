# --- CGRF Header ------------------------------------------------
# File:        tests/upgrade/test_praxis_isolation.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     services/praxis_evidence/client.py, services/praxis_evidence/run_all_tests.py
# EnumType:    Test
# EnumEdges:   VALIDATES services/praxis_evidence/client.py; VALIDATES services/praxis_evidence/run_all_tests.py
# Intent:      Reject unsafe Praxis test targets before credentials, deployment files or network writes can be used.
# ----------------------------------------------------------------

"""Exercise test isolation without authenticating to or writing any real backend."""

from __future__ import annotations

from contextlib import contextmanager, redirect_stderr, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from typing import Any, Iterator
import unittest
from unittest.mock import MagicMock, Mock, patch
from email.message import Message
from urllib.request import HTTPHandler, build_opener
from urllib.response import addinfourl
from urllib.error import HTTPError

from services.praxis_evidence import isolated_test as isolation


ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/praxis_evidence"


def load(name: str) -> Any:
    """Load a source module with the caller's explicit I/O and environment guards."""
    spec = importlib.util.spec_from_file_location("praxis_test_" + name, SERVICE / (name + ".py"))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@contextmanager
def fixture_context() -> Iterator[tuple[Path, dict[str, Any]]]:
    """Supply an explicit local fixture document, never a shared service configuration."""
    with tempfile.TemporaryDirectory(prefix="buildanddo-praxis-") as tmp:
        path = Path(tmp) / "test-context.json"
        value = {"schema": "buildanddo.praxis-fixture/v1", "fixture": path.parent.name,
                 "runner_pid": os.getppid(), "server_pid": 12345, "base_url": "http://127.0.0.1:18945"}
        path.write_text(json.dumps(value))
        with patch.dict("os.environ", {isolation.CONTEXT: str(path), "PB_API_URL": value["base_url"]}, clear=True):
            yield path, value


class PraxisIsolationTests(unittest.TestCase):
    def test_import_never_reads_deployment_secrets(self) -> None:
        with (
            patch.dict("os.environ", {}, clear=True),
            patch.object(Path, "is_file", return_value=True),
            patch.object(Path, "read_text", side_effect=AssertionError("deployment file read")),
        ):
            load("client")

    def test_missing_service_target_is_not_a_public_backend_default(self) -> None:
        with patch.dict("os.environ", {}, clear=True), patch.object(Path, "is_file", return_value=False):
            client = load("client")
            with self.assertRaisesRegex(client.PocketBaseError, "PB_API_URL"):
                client.PocketBaseClient()

    def test_explicit_service_client_keeps_auth_failures_and_responses_bounded(self) -> None:
        module = load("client")
        opener = MagicMock()
        with patch.dict("os.environ", {}, clear=True):
            client = module.PocketBaseClient("http://127.0.0.1:18945", opener=opener)
            with self.assertRaisesRegex(module.PocketBaseError, "not configured"):
                client.get("users", "fixture")
            with self.assertRaises(module.PocketBaseError):
                client._request("GET", "https://redirect.fixture.invalid")
            opener.open.assert_not_called()
            client = module.PocketBaseClient("http://127.0.0.1:18945", email="fixture@fixture.invalid", password="fixture-only", opener=opener)
            opener.open.return_value.__enter__.return_value.read.return_value = b'{}'
            with self.assertRaisesRegex(module.PocketBaseError, "return a session"):
                client.get("users", "fixture")
            client._token = "synthetic-session"
            opener.open.return_value.__enter__.return_value.read.return_value = b'[]'
            with self.assertRaisesRegex(module.PocketBaseError, "return an object"):
                client.get("users", "fixture")
            opener.open.return_value.__enter__.return_value.read.return_value = b'{"items":[{"id":"fixture"}]}'
            self.assertEqual(client.list("knowledge_claims", 'domain="fixture"', per_page=2), [{"id": "fixture"}])
            self.assertIn("filter=domain%3D%22fixture%22", opener.open.call_args.args[0].full_url)
            opener.open.return_value.__enter__.return_value.read.return_value = b'{"items":[false]}'
            with self.assertRaisesRegex(module.PocketBaseError, "record list"):
                client.list("knowledge_claims")
            error = HTTPError("http://127.0.0.1:18945/api/fixture", 403, "Forbidden", {}, io.BytesIO(b"private provider body"))
            opener.open.side_effect = error
            with self.assertRaisesRegex(module.PocketBaseError, "403") as result:
                client.get("users", "fixture")
            self.assertNotIn("private provider body", str(result.exception))

    def test_service_client_reauthenticates_once_without_redirect_or_unbounded_retry(self) -> None:
        module = load("client")
        opener = MagicMock()
        response = MagicMock()
        response.__enter__.return_value.read.side_effect = [b'{"token":"new-synthetic-session"}', b'{"id":"fixture"}']
        expired = HTTPError("http://127.0.0.1:18945/api/fixture", 401, "Expired", {}, io.BytesIO())
        client = module.PocketBaseClient("http://127.0.0.1:18945", email="fixture@fixture.invalid", password="fixture-only", opener=opener)
        client._token = "old-synthetic-session"
        opener.open.side_effect = [expired, response, response]
        self.assertEqual(client.get("users", "fixture"), {"id": "fixture"})
        self.assertEqual(opener.open.call_count, 3)
        opener.open.side_effect = expired
        with self.assertRaises(HTTPError):
            client.get("users", "fixture")
        self.assertEqual(opener.open.call_count, 5)

    def test_runner_does_not_forward_a_shared_target_to_selftests(self) -> None:
        with (
            patch.dict("os.environ", {"PB_API_URL": "https://shared.fixture.invalid"}, clear=True),
            patch("sys.argv", ["run_all_tests.py"]),
            patch("subprocess.run", side_effect=AssertionError("unsafe suite started")) as run,
            redirect_stdout(io.StringIO()),
        ):
            runner = load("run_all_tests")
            self.assertNotEqual(runner.main(), 0)
            run.assert_not_called()

    def test_context_refuses_remote_ambiguous_or_changed_targets_before_http(self) -> None:
        with fixture_context() as (path, original), patch.object(isolation, "build_opener") as opener:
            self.assertEqual(isolation.context(), original)
            for target in ("https://shared.fixture.invalid", "http://localhost:18945", "http://127.1:18945",
                           "http://2130706433:18945", "http://127.0.0.1", "http://127.0.0.1:18945/",
                           "http://127.0.0.1:18945/path", "http://127.0.0.1:18945?target=remote",
                           "http://127.0.0.1:18945#fragment", "http://u:p@127.0.0.1:18945",
                           "http://127.0.0.1:999999", "http://127.0.0.1:18945\\@remote", " http://127.0.0.1:18945"):
                path.write_text(json.dumps({**original, "base_url": target}))
                with self.subTest(target=target), patch.dict("os.environ", {"PB_API_URL": target}), self.assertRaises(isolation.TestIsolationError):
                    isolation.isolated_client()
            opener.assert_not_called()

    def test_context_binds_parent_process_fixture_identity_and_actual_path(self) -> None:
        with fixture_context() as (path, original):
            for changes in ({"schema": "other"}, {"runner_pid": -1}, {"runner_pid": True}, {"server_pid": 0},
                            {"server_pid": True}, {"fixture": "different-fixture"}):
                path.write_text(json.dumps({**original, **changes}))
                with self.subTest(changes=changes), self.assertRaises(isolation.TestIsolationError):
                    isolation.context()
            for text in ("[]", "null", "{}", "{", "x" * 4097):
                path.write_text(text)
                with self.subTest(text=text[:5]), self.assertRaises(isolation.TestIsolationError):
                    isolation.context()
            path.write_text(json.dumps(original))
            link = path.parent / "other.json"
            link.symlink_to(path)
            for value in (str(link), "test-context.json", str(path.parent / "missing.json"), ""):
                with self.subTest(value=value), patch.dict("os.environ", {isolation.CONTEXT: value}), self.assertRaises(isolation.TestIsolationError):
                    isolation.context()
            path.unlink()
            with self.assertRaises(isolation.TestIsolationError):
                isolation.context()

    def test_fixture_probe_precedes_authentication_and_uses_no_proxy(self) -> None:
        with fixture_context() as (_, value):
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value.read.return_value = b'{"fixture":"not-this-fixture"}'
            with patch.object(isolation, "build_opener", return_value=opener) as build, self.assertRaises(isolation.TestIsolationError):
                isolation.isolated_client()
            self.assertEqual(build.call_args.args[0].proxies, {})
            self.assertIsInstance(build.call_args.args[1], isolation.NoRedirect)
            self.assertEqual(opener.open.call_count, 1)
            self.assertEqual(opener.open.call_args.args[0], value["base_url"] + "/api/buildanddo-test/fixture")

    def test_fixture_changes_reject_even_an_already_authenticated_client(self) -> None:
        with fixture_context() as (path, value):
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value.read.return_value = json.dumps({"fixture": value["fixture"]}).encode()
            with patch.object(isolation, "build_opener", return_value=opener):
                client = isolation.isolated_client()
            client._token = "synthetic-local-session"
            opener.open.reset_mock()
            client.base_url = "https://shared.fixture.invalid"
            with self.assertRaises(isolation.TestIsolationError):
                client.create("users", {"email": "fixture@fixture.invalid"})
            opener.open.assert_not_called()
            client.base_url = value["base_url"]
            path.write_text(json.dumps({**value, "fixture": "replacement"}))
            with self.assertRaises(isolation.TestIsolationError):
                client.get("users", "fixture")
            opener.open.assert_not_called()

    def test_valid_fixture_checks_proof_before_native_auth_and_record_request(self) -> None:
        with fixture_context() as (_, value):
            opener = MagicMock()
            proof = json.dumps({"fixture": value["fixture"]}).encode()
            opener.open.return_value.__enter__.return_value.read.side_effect = [proof, proof, proof,
                b'{"token":"synthetic-fixture-session"}', b'{"id":"fixture-record"}']
            with patch.object(isolation, "build_opener", return_value=opener):
                client = isolation.isolated_client()
                self.assertEqual(client.create("users", {"name": "Synthetic"}), {"id": "fixture-record"})
            urls = [call.args[0] if isinstance(call.args[0], str) else call.args[0].full_url for call in opener.open.call_args_list]
            self.assertEqual(urls[:3], [value["base_url"] + "/api/buildanddo-test/fixture"] * 3)
            self.assertTrue(urls[3].endswith("/_superusers/auth-with-password"))
            self.assertTrue(urls[4].endswith("/users/records"))
            self.assertTrue(all(url.startswith(value["base_url"] + "/api/") for url in urls))

    def test_redirects_and_proof_read_failures_never_trigger_authentication(self) -> None:
        with self.assertRaises(isolation.PocketBaseError):
            isolation.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://shared.fixture.invalid")
        for failure in (OSError("unavailable"), ValueError("not JSON")):
            with fixture_context(), patch.object(isolation, "build_opener") as build:
                build.return_value.open.side_effect = failure
                with self.assertRaises(isolation.TestIsolationError):
                    isolation.isolated_client()
                self.assertEqual(build.return_value.open.call_count, 1)

    def test_all_direct_selftests_fail_before_network_or_deployment_file_access(self) -> None:
        script = """
import runpy, sys
def guard(event, args):
    if event in ('socket.connect', 'socket.getaddrinfo'):
        raise AssertionError('unsafe network access')
    if event == 'open' and isinstance(args[0], str) and 'deploy.local.env' in args[0]:
        raise AssertionError('unsafe deployment configuration read')
sys.addaudithook(guard)
runpy.run_path(sys.argv[1], run_name='__main__')
"""
        for suite in sorted(SERVICE.glob("selftest*.py")):
            with self.subTest(suite=suite.name):
                result = subprocess.run([sys.executable, "-c", script, str(suite)], cwd=SERVICE, capture_output=True, text=True,
                                        env={"PB_API_URL": "https://shared.fixture.invalid"}, timeout=15, check=False)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("an isolated fixture is required", result.stderr)
                self.assertNotIn("AssertionError", result.stderr)

    def test_runner_assembles_only_public_schema_and_disposes_each_suite(self) -> None:
        runner = load("run_all_tests")
        seen = []

        def start(server: Any) -> None:
            server.process = SimpleNamespace(pid=12345)

        def execute(_argv: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
            env = kwargs["env"]
            self.assertEqual(set(env), {"PATH", "PYTHONDONTWRITEBYTECODE", "TMPDIR", "PB_API_URL", isolation.CONTEXT})
            metadata = json.loads(Path(env[isolation.CONTEXT]).read_text())
            self.assertEqual(metadata["runner_pid"], os.getpid())
            root = Path(env[isolation.CONTEXT]).parent
            self.assertEqual(env["TMPDIR"], str(root.parent))
            self.assertNotIn(root, seen)
            seen.append(root)
            self.assertEqual({p.name for p in (root / "hooks").iterdir()}, {"fixture.pb.js"})
            self.assertEqual({p.name for p in (root / "migrations").iterdir()}, {"0000000001_fixture.js", *runner.MIGRATIONS})
            for name in runner.MIGRATIONS:
                self.assertEqual((root / "migrations" / name).read_bytes(), (ROOT / "apps/pocketbase/pb_migrations" / name).read_bytes())
            return subprocess.CompletedProcess(_argv, 0, "PASS fixture\n1/1 passed\n", "")

        with (
            patch.object(runner.PraxisServer, "migrate"), patch.object(runner.PraxisServer, "start", start),
            patch.object(runner.PraxisServer, "stop"), patch("subprocess.run", side_effect=execute),
            patch.dict("os.environ", {"PB_API_URL": "https://shared.fixture.invalid", "PB_SUPERUSER_PASSWORD": "unrelated-private-setting", "HTTPS_PROXY": "https://proxy.invalid"}),
            redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(runner.run_suites(Path("/fixture-binary"), ["selftest.py", "selftest_logic.py"]), 0)
        self.assertEqual(len(seen), 2)
        self.assertTrue(all(not root.exists() for root in seen))

    def test_runner_closes_fixtures_after_failure_timeout_or_empty_output(self) -> None:
        runner = load("run_all_tests")
        for outcome in (subprocess.CompletedProcess([], 1, "0/1 passed", "failure"),
                        subprocess.CompletedProcess([], 0, "", ""), subprocess.TimeoutExpired("fixture", 1)):
            server = Mock()
            with (
                patch.object(runner, "PraxisServer", return_value=server),
                patch("subprocess.run", side_effect=outcome if isinstance(outcome, Exception) else None, return_value=outcome),
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()),
            ):
                self.assertEqual(runner.run_suites(Path("/fixture"), ["selftest.py"]), 1)
                server.close.assert_called_once()

    def test_runner_rejects_contradictory_partial_or_multiple_pass_summaries(self) -> None:
        runner = load("run_all_tests")
        for output in ("1/2 passed\n", "11/1 passed\n", "0/0 passed\n", "prefix 1/1 passed\n",
                       "1/1 passed\n2/2 passed\n", "FAIL: assertion\n1/1 passed\n"):
            with (
                self.subTest(output=output), patch.object(runner, "PraxisServer"),
                patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, output, "")),
                redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(runner.run_suites(Path("/fixture"), ["selftest.py"]), 1)

    def test_isolation_failure_is_not_an_expected_domain_rejection(self) -> None:
        with fixture_context() as (_, value):
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value.read.return_value = json.dumps({"fixture": value["fixture"]}).encode()
            with patch.object(isolation, "build_opener", return_value=opener):
                client = isolation.isolated_client()
            opener.open.return_value.__enter__.return_value.read.return_value = b'{"fixture":"wrong"}'
            with self.assertRaises(isolation.TestIsolationError):
                try:
                    client._request("PATCH", "/api/collections/knowledge_beliefs/records/fixture", {"epistemic_class": "CLAIM"})
                except isolation.PocketBaseError:
                    self.fail("Isolation was mistaken for a successful schema rejection")

    def test_custom_temp_root_is_explicitly_shared_with_the_child(self) -> None:
        runner = load("run_all_tests")
        server = object.__new__(runner.PraxisServer)
        server.root = Path("/fixture-scratch/buildanddo-praxis-example")
        server.base = "http://127.0.0.1:18945"
        server.context_file = server.root / "test-context.json"
        self.assertEqual(server.child_environment().get("TMPDIR"), str(server.root.parent))

    def test_startup_health_cannot_follow_a_redirect_off_loopback(self) -> None:
        runner = load("run_all_tests")
        visited = []

        class Transport(HTTPHandler):
            handler_order = 100

            def http_open(self, request: Any) -> Any:
                visited.append(request.full_url)
                headers = Message()
                redirected = request.full_url.startswith("http://127.0.0.1:")
                if redirected:
                    headers["Location"] = "https://redirect.fixture.invalid/health"
                response = addinfourl(io.BytesIO(b"{}"), headers, request.full_url, 302 if redirected else 200)
                response.msg = "fixture response"
                return response

            https_open = http_open

        def build(*handlers: Any) -> Any:
            return build_opener(*handlers, Transport())

        server = object.__new__(runner.PraxisServer)
        server.base = "http://127.0.0.1:18945"
        with (
            patch("tests.upgrade.test_dossier_native.build_opener", side_effect=build),
            patch.object(runner, "build_opener", side_effect=build, create=True),
            self.assertRaises(RuntimeError),
        ):
            server.request("GET", "/api/health")
        self.assertEqual(visited, [server.base + "/api/health"])

    def test_every_fixture_redirect_status_is_fatal_even_with_no_usable_location(self) -> None:
        for code in (301, 302, 303, 307, 308):
            for location in (None, "urn:fixture:redirect", "https://redirect.fixture.invalid"):
                with self.subTest(code=code, location=location), fixture_context() as (_, value):
                    visited = []

                    class Transport(HTTPHandler):
                        handler_order = 100

                        def http_open(self, request: Any) -> Any:
                            visited.append(request.full_url)
                            proof = request.full_url.endswith("/api/buildanddo-test/fixture")
                            headers = Message()
                            if not proof and location:
                                headers["Location"] = location
                            body = json.dumps({"fixture": value["fixture"]}).encode() if proof else b"{}"
                            response = addinfourl(io.BytesIO(body), headers, request.full_url, 200 if proof else code)
                            response.msg = "fixture response"
                            return response

                        https_open = http_open

                    with patch.object(isolation, "build_opener", side_effect=lambda *handlers: build_opener(*handlers, Transport())):
                        client = isolation.isolated_client()
                    client._token = "synthetic-local-session"
                    with self.assertRaises(isolation.TestIsolationError):
                        try:
                            client._request("PATCH", "/api/collections/knowledge_beliefs/records/fixture", {"epistemic_class": "CLAIM"})
                        except isolation.PocketBaseError:
                            self.fail("A redirect was counted as an application rejection")
                    self.assertTrue(all(url.startswith(value["base_url"] + "/api/") for url in visited))

    def test_runner_requires_selected_declared_binary_and_provisioning_is_explicit(self) -> None:
        runner = load("run_all_tests")
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / "pocketbase"
            binary.touch()
            for profile in ("package", "compose"):
                expected = runner.runtime_version(ROOT, profile)
                with (
                    patch.dict("os.environ", {}, clear=True),
                    patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, "PocketBase v" + expected, "")),
                    patch.object(runner, "run_suites", return_value=0) as run,
                    patch.object(runner, "extract_binary", return_value=binary) as provision,
                ):
                    self.assertEqual(runner.main(["--profile", profile, "--binary", str(binary), "--suite", "selftest.py"]), 0)
                    provision.assert_not_called()
                    run.assert_called_once_with(binary, ["selftest.py"])
                    run.reset_mock()
                    self.assertEqual(runner.main(["--profile", profile, "--provision"]), 0)
                    provision.assert_called_once()
                    self.assertEqual(run.call_args.args[1], runner.SUITES)
            with (
                patch.dict("os.environ", {}, clear=True),
                patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, "PocketBase v0.0.0", "")),
                patch.object(runner, "run_suites") as run, redirect_stderr(io.StringIO()),
            ):
                self.assertEqual(runner.main(["--binary", str(binary)]), 2)
                run.assert_not_called()

    def test_gitlab_preserves_real_praxis_gate_with_isolated_profiles(self) -> None:
        text = (ROOT / ".gitlab-ci.yml").read_text()
        job = text.split("praxis_evidence_tests:", 1)[1].split("# BEGIN CITADEL", 1)[0]
        self.assertIn('POCKETBASE_PROFILE: ["package", "compose"]', job)
        self.assertIn("run_all_tests.py --profile $POCKETBASE_PROFILE --provision", job)
        self.assertNotIn("allow_failure", job)
        self.assertNotIn("_load_secrets", job)


if __name__ == "__main__":
    unittest.main()
