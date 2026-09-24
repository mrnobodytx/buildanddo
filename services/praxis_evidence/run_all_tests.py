#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File:        services/praxis_evidence/run_all_tests.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     services/praxis_evidence/isolated_test.py, tests/upgrade/test_classroom_native.py, scripts/ci/hostinger_checks.py, tools/day21/day21_acceptance.py
# EnumType:    Test
# EnumEdges:   CONSUMES services/praxis_evidence/isolated_test.py; CONSUMES tests/upgrade/test_classroom_native.py; CONSUMES scripts/ci/hostinger_checks.py; CONSUMES tools/day21/day21_acceptance.py; VERIFIED_BY tests/upgrade/test_praxis_isolation.py
# Intent:      Run every real Praxis selftest in a fresh owned backend without inheriting shared targets or deployment credentials.
# ----------------------------------------------------------------

"""Run mutating selftests in disposable native PocketBase processes, never shared services."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from typing import Any
from urllib.error import HTTPError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[2]
SERVICE = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci.hostinger_checks import runtime_version  # noqa: E402
from services.praxis_evidence.isolated_test import CONTEXT, EMAIL, PASSWORD  # noqa: E402
from services.praxis_evidence.client import NoRedirect  # noqa: E402
from tests.upgrade.test_classroom_native import DiagnosticNativeServer, sanitize_diagnostics  # noqa: E402
from tools.day21.day21_acceptance import extract_binary  # noqa: E402

SUITES = sorted(p.name for p in SERVICE.glob("selftest*.py"))
MIGRATIONS = ("1788800000_create_praxis_evidence_fabric.js", "1788920000_add_claim_authorship_and_reputation.js")


class PraxisServer(DiagnosticNativeServer):
    """Own one fresh database, synthetic administrator and loopback fixture proof."""

    context_file: Path

    def __init__(self, binary: Path) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-praxis-")
        self.root = Path(self.directory.name)
        self.binary = str(binary.resolve())
        self.process = None
        # The diagnostic subclass uses binary offsets; its legacy base annotates a text log.
        self.log = tempfile.TemporaryFile(mode="w+b")  # type: ignore[assignment]
        self.environment = {"PATH": os.environ.get("PATH", "")}
        try:
            hooks, migrations = self.root / "hooks", self.root / "migrations"
            hooks.mkdir()
            migrations.mkdir()
            # Only these fixture files and public schema migrations run. No deployed
            # hook, configured sink, bootstrap link or shared database is imported.
            (migrations / "0000000001_fixture.js").write_text(
                "migrate((app) => {\n"
                "const users = app.findCollectionByNameOrId('users');\n"
                "if (!users.fields.getByName('name')) users.fields.add(new TextField({name:'name',max:120}));\n"
                "users.authAlert = {enabled:false}; app.save(users);\n"
                "const admin = new Record(app.findCollectionByNameOrId('_superusers'));\n"
                f"admin.set('email', {json.dumps(EMAIL)}); admin.setPassword({json.dumps(PASSWORD)});\n"
                "app.save(admin);\n}, () => {});\n", encoding="utf-8"
            )
            for name in MIGRATIONS:
                shutil.copyfile(ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name)
            (hooks / "fixture.pb.js").write_text(
                "routerAdd('GET', '/api/buildanddo-test/fixture', (e) => e.json(200, "
                + json.dumps({"fixture": self.root.name}) + "));\n", encoding="utf-8"
            )
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            self.migrate()
            self.start()
            assert self.process is not None
            self.context_file = self.root / "test-context.json"
            self.context_file.write_text(json.dumps({
                "schema": "buildanddo.praxis-fixture/v1", "fixture": self.root.name,
                "runner_pid": os.getpid(), "server_pid": self.process.pid, "base_url": self.base,
            }), encoding="utf-8")
            self.context_file.chmod(0o600)
        except BaseException:
            self.close()
            raise

    def child_environment(self) -> dict[str, str]:
        """Pass only the owned fixture configuration, never inherited service secrets or proxies."""
        return {"PATH": os.environ.get("PATH", ""), "PYTHONDONTWRITEBYTECODE": "1",
                "TMPDIR": str(self.root.parent), "PB_API_URL": self.base, CONTEXT: str(self.context_file)}

    def request(self, method: str, path: str, body: dict[str, Any] | None = None, token: str = "") -> tuple[int, dict[str, Any]]:
        """Probe only local startup health, without proxies or redirect following."""
        if method != "GET" or path != "/api/health" or body is not None or token:
            raise ValueError("The runner only probes its own health route")
        opener = build_opener(ProxyHandler({}), NoRedirect())
        try:
            with opener.open(self.base + path, timeout=5) as response:
                data = json.loads(response.read(4096))
                if not isinstance(data, dict):
                    raise ValueError("Invalid native health response")
                return response.status, data
        except HTTPError as error:
            return error.code, {}


def run_suites(binary: Path, suites: list[str]) -> int:
    """Discard each real test database even when a suite times out or leaves records behind."""
    if not suites:
        print("FAIL: no Praxis suites found")
        return 1
    passed = 0
    for suite in suites:
        with_fixture = None
        try:
            with_fixture = PraxisServer(binary)
            proc = subprocess.run([sys.executable, str(SERVICE / suite)], cwd=SERVICE,
                                  env=with_fixture.child_environment(), capture_output=True, text=True, timeout=120, check=False)
            print(sanitize_diagnostics(proc.stdout))
            if proc.stderr:
                print(sanitize_diagnostics(proc.stderr), file=sys.stderr)
            summaries = re.findall(r"^([0-9]+)/([0-9]+) passed[ \t]*$", proc.stdout, re.MULTILINE)
            success = proc.returncode == 0 and len(summaries) == 1 and int(summaries[0][0]) == int(summaries[0][1]) > 0 \
                and not re.search(r"^FAIL\b", proc.stdout, re.MULTILINE)
            passed += success
            print(f"{'PASS' if success else 'FAIL'}: {suite} (disposable native backend)")
        except (OSError, subprocess.SubprocessError, AssertionError, RuntimeError) as error:
            print(f"FAIL: {suite}: {sanitize_diagnostics(str(error))}", file=sys.stderr)
        finally:
            if with_fixture is not None:
                with_fixture.close()
    print(f"{'PASS' if passed == len(suites) else 'FAIL'}: {passed}/{len(suites)} native Praxis suites; no shared backend used")
    return 0 if passed == len(suites) else 1


def main(argv: list[str] | None = None) -> int:
    """Select a declared native runtime and run no selftest without a fresh local fixture."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("package", "compose"), default="package")
    parser.add_argument("--binary", type=Path, help="Already installed disposable-test binary")
    parser.add_argument("--provision", action="store_true", help="Provision the declared binary using the existing Docker test helper")
    parser.add_argument("--suite", choices=SUITES, help="Run just one real suite in a fresh fixture")
    args = parser.parse_args(argv)
    suites = [args.suite] if args.suite else SUITES
    if not suites:
        print("FAIL: no Praxis suites found")
        return 1
    configured = os.environ.get("BUILDANDDO_TEST_POCKETBASE_" + args.profile.upper()) or os.environ.get("BUILDANDDO_TEST_POCKETBASE")
    binary = args.binary or (Path(configured) if configured else None)
    if binary is None and not args.provision:
        print("BLOCKED: install the declared PocketBase test binary; no Praxis tests ran")
        return 2
    with tempfile.TemporaryDirectory(prefix="buildanddo-praxis-binary-") as work:
        try:
            expected = runtime_version(ROOT, args.profile)
            if binary is None:
                binary = extract_binary(ROOT, expected, Path(work))
            if not binary.is_file():
                raise ValueError("The supplied native test binary is unavailable")
            version = subprocess.run([str(binary.resolve()), "--version"], capture_output=True, text=True,
                                     env={"PATH": os.environ.get("PATH", "")}, timeout=15, check=False)
            if version.returncode or not re.search(r"(?<![\d.])" + re.escape(expected) + r"(?![\d.])", version.stdout + version.stderr):
                raise ValueError("The native test binary does not match the selected declared runtime")
            return run_suites(binary, suites)
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
            print("BLOCKED: " + sanitize_diagnostics(str(error)), file=sys.stderr)
            return 2


if __name__ == "__main__":
    raise SystemExit(main())
