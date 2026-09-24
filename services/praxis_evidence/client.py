#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File:        services/praxis_evidence/client.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     none
# EnumType:    Service
# EnumEdges:   VERIFIED_BY tests/upgrade/test_praxis_isolation.py
# Intent:      Require explicit service configuration without reading deployment secrets or selecting a public write target on import.
# ----------------------------------------------------------------
"""
client.py - thin PocketBase REST client for the Praxis Evidence Fabric.

stdlib-only (urllib), matching this repo's established convention (ship.py,
activity_publish.py). Authenticates as the PocketBase superuser using
explicit configuration or the OS environment, never a deployment file.
There is no default write target. Selftests use the separately guarded fixture.
"""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class PocketBaseError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Prevent credentials and writes from following an HTTP redirect."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        raise PocketBaseError("PocketBase redirects are not allowed")


class PocketBaseClient:
    """Authenticates once per process as the PocketBase superuser. This is an
    internal service credential (never exposed to end users/browsers) - the
    epistemic-state and no-self-audit rules live in THIS module, not in
    PocketBase's own API rules, so callers must go through here, not raw REST."""

    def __init__(self, base_url: str | None = None, *, email: str | None = None,
                 password: str | None = None, opener: urllib.request.OpenerDirector | None = None) -> None:
        target = base_url if base_url is not None else os.environ.get("PB_API_URL", "")
        parts = urllib.parse.urlsplit(target)
        if not target or parts.scheme not in ("http", "https") or not parts.hostname or parts.username is not None \
                or parts.password is not None or parts.query or parts.fragment or any(char.isspace() for char in target) or "\\" in target:
            raise PocketBaseError("PB_API_URL must explicitly name a credential-free backend URL")
        self.base_url = target.rstrip("/")
        self._email = email if email is not None else os.environ.get("PB_SUPERUSER_EMAIL")
        self._password = password if password is not None else os.environ.get("PB_SUPERUSER_PASSWORD")
        self._opener = opener or urllib.request.build_opener(NoRedirect())
        self._token: str | None = None

    def _authenticate(self) -> str:
        email = self._email
        password = self._password
        if not email or not password:
            raise PocketBaseError("PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD not configured")
        body = json.dumps({"identity": email, "password": password}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/collections/_superusers/auth-with-password",
            data=body, method="POST", headers={"Content-Type": "application/json", "User-Agent": "BuildAndDo-Praxis/1 (+https://buildanddo.com)"})
        with self._opener.open(req, timeout=15) as resp:
            data = json.loads(resp.read())
        token = data.get("token") if isinstance(data, dict) else None
        if not isinstance(token, str) or not token:
            raise PocketBaseError("PocketBase did not return a session")
        self._token = token
        return token

    def _token_header(self) -> dict[str, str]:
        if not self._token:
            self._authenticate()
        return {"Authorization": f"Bearer {self._token}"}

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, retried: bool = False) -> dict[str, Any]:
        if not path.startswith("/api/") or "\\" in path:
            raise PocketBaseError("Use a PocketBase API path")
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json", "User-Agent": "BuildAndDo-Praxis/1 (+https://buildanddo.com)", **self._token_header()}
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with self._opener.open(req, timeout=15) as resp:
                result = json.loads(resp.read() or b"{}")
            if not isinstance(result, dict):
                raise PocketBaseError("PocketBase did not return an object")
            return result
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and not retried:
                self._token = None
                return self._request(method, path, payload, retried=True)
            raise PocketBaseError(f"{exc.code} on {method} {path}") from None

    def create(self, collection: str, record: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/api/collections/{collection}/records", record)

    def get(self, collection: str, record_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/collections/{collection}/records/{record_id}")

    def list(self, collection: str, filter_expr: str | None = None, per_page: int = 50) -> list[dict[str, Any]]:
        query = f"?perPage={per_page}"
        if filter_expr:
            query += f"&filter={urllib.parse.quote(filter_expr)}"
        result = self._request("GET", f"/api/collections/{collection}/records{query}")
        items = result.get("items", [])
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise PocketBaseError("PocketBase did not return a record list")
        return items
