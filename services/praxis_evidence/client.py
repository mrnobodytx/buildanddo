#!/usr/bin/env python3
"""
client.py - thin PocketBase REST client for the Praxis Evidence Fabric.

stdlib-only (urllib), matching this repo's established convention (ship.py,
activity_publish.py). Authenticates as the PocketBase superuser using
credentials from secrets/deploy.local.env or the OS environment - never
hardcoded, never logged.
"""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
LOCAL_SECRETS = ROOT / "secrets" / "deploy.local.env"


def _load_secrets() -> dict:
    env = dict(os.environ)
    if LOCAL_SECRETS.is_file():
        for line in LOCAL_SECRETS.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


_SECRETS = _load_secrets()
# No default target. An unset PB_API_URL used to fall back to production, so a
# CI job missing its variable ran the suites - which create users - against it.
PB_API_URL = _SECRETS.get("PB_API_URL", "").strip().rstrip("/")
# The production VM is also reachable by address (scripts/deploy/ship.py default host).
PRODUCTION_HOSTS = frozenset({"buildanddo.com", "www.buildanddo.com", "45.82.75.40"})


class PocketBaseError(RuntimeError):
    pass


class UnsafeTargetError(PocketBaseError):
    """The configured PocketBase target is missing, malformed or production."""


def require_target(url: str | None = None) -> str:
    """Return a usable PocketBase base URL, or raise. Never supplies a default."""
    url = (PB_API_URL if url is None else url or "").strip().rstrip("/")
    if not url:
        raise UnsafeTargetError("PB_API_URL is not set; refusing to guess a PocketBase target.")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeTargetError("PB_API_URL must be an http(s) URL with a host.")
    return url


def require_test_target(url: str | None = None) -> str:
    """Like require_target, but also refuses production: the suites create users
    and records, so they may only run against a disposable PocketBase."""
    url = require_target(url)
    host = (urllib.parse.urlsplit(url).hostname or "").rstrip(".").lower()
    if host in PRODUCTION_HOSTS:
        raise UnsafeTargetError(
            "PB_API_URL points at production; the evidence suites create users and records "
            "and only run against a non-production PocketBase.")
    return url


class PocketBaseClient:
    """Authenticates once per process as the PocketBase superuser. This is an
    internal service credential (never exposed to end users/browsers) - the
    epistemic-state and no-self-audit rules live in THIS module, not in
    PocketBase's own API rules, so callers must go through here, not raw REST."""

    def __init__(self, base_url: str | None = None):
        self.base_url = require_target(base_url)
        self._token: str | None = None

    def _authenticate(self) -> str:
        email = _SECRETS.get("PB_SUPERUSER_EMAIL")
        password = _SECRETS.get("PB_SUPERUSER_PASSWORD")
        if not email or not password:
            raise PocketBaseError("PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD not configured")
        body = json.dumps({"identity": email, "password": password}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/collections/_superusers/auth-with-password",
            data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": "BuildAndDo-Praxis/1 (+https://buildanddo.com)"})
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 - fixed self-hosted URL
            data = json.loads(resp.read())
        self._token = data["token"]
        return self._token

    def _token_header(self) -> dict:
        if not self._token:
            self._authenticate()
        return {"Authorization": f"Bearer {self._token}"}

    def _request(self, method: str, path: str, payload: dict | None = None, retried: bool = False) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json", "User-Agent": "BuildAndDo-Praxis/1 (+https://buildanddo.com)", **self._token_header()}
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 - fixed self-hosted URL
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and not retried:
                self._token = None
                return self._request(method, path, payload, retried=True)
            body = exc.read().decode("utf-8", errors="replace")
            raise PocketBaseError(f"{exc.code} on {method} {path}: {body}") from exc

    def create(self, collection: str, record: dict) -> dict:
        return self._request("POST", f"/api/collections/{collection}/records", record)

    def get(self, collection: str, record_id: str) -> dict:
        return self._request("GET", f"/api/collections/{collection}/records/{record_id}")

    def list(self, collection: str, filter_expr: str | None = None, per_page: int = 50) -> list[dict]:
        query = f"?perPage={per_page}"
        if filter_expr:
            query += f"&filter={urllib.parse.quote(filter_expr)}"
        result = self._request("GET", f"/api/collections/{collection}/records{query}")
        return result.get("items", [])
