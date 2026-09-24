# --- CGRF Header ------------------------------------------------
# File:        services/praxis_evidence/isolated_test.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     services/praxis_evidence/client.py
# EnumType:    Test
# EnumEdges:   CONSUMES services/praxis_evidence/client.py; VERIFIED_BY tests/upgrade/test_praxis_isolation.py
# Intent:      Fence all mutating selftests to a current runner-owned loopback fixture before credentials or writes are sent.
# ----------------------------------------------------------------

"""Guard real native selftests; this is not permission to use a shared backend."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener

if TYPE_CHECKING or __package__:
    from .client import NoRedirect, PocketBaseClient, PocketBaseError
else:
    from client import NoRedirect, PocketBaseClient, PocketBaseError

EMAIL = "praxis-fixture@fixture.invalid"
PASSWORD = "isolated-native-fixture-only"
CONTEXT = "BUILDANDDO_PRAXIS_TEST_CONTEXT"


class TestIsolationError(RuntimeError):
    """Abort isolation failures; they are never expected domain/schema rejections."""


class FixtureNoRedirect(NoRedirect):
    """Make transport escape fatal even inside a negative application assertion."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        raise TestIsolationError("Test fixture redirects are not allowed")

    def http_error_302(self, req: Any, fp: Any, code: int, msg: str, headers: Any) -> None:
        # Reject the status before urllib interprets missing or unsupported Location values.
        raise TestIsolationError("Test fixture redirects are not allowed")

    http_error_301 = http_error_302
    http_error_303 = http_error_302
    http_error_307 = http_error_302
    http_error_308 = http_error_302


def context() -> dict[str, Any]:
    """Validate the runner's local lifetime and literal loopback target without I/O to it."""
    message = "Use run_all_tests.py with a disposable PocketBase binary; an isolated fixture is required"
    raw = os.environ.get(CONTEXT, "")
    if not raw:
        raise TestIsolationError(message)
    path = Path(raw)
    if not path.is_absolute() or path.name != "test-context.json" or not path.parent.name.startswith("buildanddo-praxis-") \
            or path.is_symlink() or path.parent.is_symlink() or path.parent.parent.resolve() != Path(tempfile.gettempdir()).resolve():
        raise TestIsolationError(message)
    try:
        if path.stat().st_size > 4096:
            raise TestIsolationError(message)
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise TestIsolationError(message)
        url = value["base_url"]
        parts = urlsplit(url)
        if value["schema"] != "buildanddo.praxis-fixture/v1" or type(value["runner_pid"]) is not int or value["runner_pid"] != os.getppid() \
                or value["fixture"] != path.parent.name or type(value["server_pid"]) is not int or value["server_pid"] <= 0 \
                or parts.scheme != "http" or parts.hostname != "127.0.0.1" or not parts.port \
                or url != f"http://127.0.0.1:{parts.port}" or os.environ.get("PB_API_URL") != url:
            raise TestIsolationError(message)
    except (OSError, KeyError, TypeError, ValueError) as error:
        raise TestIsolationError(message) from error
    return value


class IsolatedClient(PocketBaseClient):
    """Disable proxies/redirects and check the fixture before each authenticated operation."""

    def __init__(self) -> None:
        self._fixture = context()
        super().__init__(self._fixture["base_url"], email=EMAIL, password=PASSWORD,
                         opener=build_opener(ProxyHandler({}), FixtureNoRedirect()))
        self._check_fixture()

    def _check_fixture(self) -> None:
        if context() != self._fixture or self.base_url != self._fixture["base_url"]:
            raise TestIsolationError("The isolated fixture lifetime changed")
        try:
            with self._opener.open(self.base_url + "/api/buildanddo-test/fixture", timeout=5) as response:
                data = json.loads(response.read(4096))
            if data != {"fixture": self._fixture["fixture"]}:
                raise TestIsolationError("The local server is not this test fixture")
        except (OSError, ValueError, PocketBaseError) as error:
            raise TestIsolationError("The local test fixture could not be confirmed") from error

    def _authenticate(self) -> str:
        self._check_fixture()
        return super()._authenticate()

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, retried: bool = False) -> dict[str, Any]:
        self._check_fixture()
        return super()._request(method, path, payload, retried)


def isolated_client() -> IsolatedClient:
    """Create a client only inside the disposable runner's child process."""
    return IsolatedClient()
