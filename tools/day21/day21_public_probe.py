#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File:        tools/day21/day21_public_probe.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Depends:     scripts/ci/day21_submission.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/day21_submission.py
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Capture public response bytes and same-origin version readback for Day-21.

All three expected identities must be supplied explicitly. Only the candidate
SHA is checked against the deployed /version.json; source and artifact digests
remain caller-supplied expectations, not remote artifact attestations.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
from http.client import HTTPException
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path
from typing import IO
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci import day21_submission as day21  # noqa: E402

MAX_BODY = 4 * 1024 * 1024
MAX_VERSION_BODY = 64 * 1024


def checked_url(url: str, origin: str | None = None) -> str:
    """Reject ambiguous HTTPS URLs and observations outside the selected origin."""
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or "\\" in url
        or any(ord(char) <= 32 or ord(char) == 127 for char in url)
        or (parsed.port is not None and not 1 <= parsed.port <= 65535)
    ):
        raise day21.Day21Error(
            "capture URL must be unambiguous HTTPS without credentials or fragments"
        )
    if origin is not None:
        expected = urlparse(origin)
        if (parsed.hostname, parsed.port or 443) != (
            expected.hostname,
            expected.port or 443,
        ):
            raise day21.Day21Error("response or navigation left the selected origin")
    return url


def prepare_output(root: Path, names: tuple[str, ...]) -> None:
    """Refuse symlinks and prior capture files rather than replacing evidence."""
    if any(path.is_symlink() for path in (root, *root.parents)):
        raise day21.Day21Error("capture output cannot follow a symlink")
    for name in names:
        if day21.contained(root, name, must_exist=False).exists():
            raise day21.Day21Error(
                "capture output already exists; select a new directory"
            )
    root.mkdir(parents=True, exist_ok=True)


def retain(root: Path, name: str, body: bytes, observed_at: str) -> dict[str, str]:
    """Retain exact captured bytes with the existing evidence-reference contract."""
    path = day21.contained(root, name, must_exist=False)
    with path.open("xb") as stream:
        stream.write(body)
    return {
        "path": name,
        "sha256": hashlib.sha256(body).hexdigest(),
        "observed_at": observed_at,
    }


def version_observation(
    url: str,
    status: int,
    body: bytes,
    candidate: str,
    observed_at: str,
) -> dict[str, object]:
    """Compare actual release JSON and retain its exact bytes inside the receipt."""
    if status != 200 or len(body) > MAX_VERSION_BODY:
        raise day21.Day21Error(
            "version readback needs HTTP 200 within the evidence bound"
        )

    def unique(items: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in items:
            if key in result:
                raise day21.Day21Error("duplicate key in version readback")
            result[key] = value
        return result

    def nonfinite(value: str) -> object:
        raise day21.Day21Error("non-finite value in version readback")

    try:
        data = json.loads(body, object_pairs_hook=unique, parse_constant=nonfinite)
    except (ValueError, RecursionError) as exc:
        raise day21.Day21Error("malformed version readback") from exc
    observed = data.get("commit_sha") if isinstance(data, dict) else None
    if not isinstance(observed, str) or not re.fullmatch(r"[a-f0-9]{40}", observed):
        raise day21.Day21Error("version readback lacks a complete commit_sha")
    if observed != candidate:
        raise day21.Day21Error(
            "observed deployment SHA differs from expected candidate"
        )
    # Inline bytes survive the existing bundle copier without adding another ref role.
    return {
        "url": url,
        "status_code": status,
        "observed_at": observed_at,
        "commit_sha": observed,
        "body_sha256": hashlib.sha256(body).hexdigest(),
        "body_base64": base64.b64encode(body).decode("ascii"),
    }


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: IO[bytes],
        code: int,
        msg: str,
        headers: Message,
        newurl: str,
    ) -> urllib.request.Request | None:
        return None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", required=True)
    p.add_argument("--candidate-sha", required=True)
    p.add_argument("--source-sha256", required=True)
    p.add_argument("--artifact-tree-sha256", required=True)
    p.add_argument(
        "--output", type=Path, default=Path("state/day21/evidence/public-url.json")
    )
    args = p.parse_args(argv)
    try:
        identity = day21.candidate_fields(vars(args))
        checked_url(args.url)
        if args.output.name != "public-url.json":
            raise day21.Day21Error("output must name public-url.json")
        prepare_output(args.output.parent, (args.output.name, "public-response.bin"))
    except (OSError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 2
    try:
        opener = urllib.request.build_opener(
            NoRedirect(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )

        def fetch(url: str, limit: int) -> tuple[bytes, int]:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "BuildAndDo-Day21-Probe/1.0",
                    "Accept": "text/html,application/json",
                    "Cache-Control": "no-cache",
                },
            )
            with opener.open(request, timeout=30) as response:
                body = response.read(limit + 1)
                if len(body) > limit:
                    raise day21.Day21Error("response exceeds evidence bound")
                if checked_url(response.geturl(), args.url) != url:
                    raise day21.Day21Error(
                        "response URL differs from the requested scope"
                    )
                if response.status != 200:
                    raise day21.Day21Error(
                        "capture requires an observed HTTP 200 response"
                    )
                return body, response.status

        body, status = fetch(args.url, MAX_BODY)
        observed_at = datetime.now(timezone.utc).isoformat()
        body_ref = retain(args.output.parent, "public-response.bin", body, observed_at)
        version_url = urljoin(args.url, "/version.json")
        version_body, version_status = fetch(version_url, MAX_VERSION_BODY)
        release = version_observation(
            version_url,
            version_status,
            version_body,
            identity["candidate_sha"],
            datetime.now(timezone.utc).isoformat(),
        )
        receipt = {
            "schema": "buildanddo.day21-public-url/v1",
            **identity,
            "url": args.url,
            "status_code": status,
            "observed_at": observed_at,
            "body_sha256": body_ref["sha256"],
            "body": body_ref,
            "release_readback": release,
            "identity_scope": "Source and artifact digests are caller-supplied expectations; only commit_sha was read back.",
        }
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
        day21.validate_public_url(args.output.parent, datetime.now(timezone.utc))
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except (
        OSError,
        ValueError,
        RuntimeError,
        HTTPException,
        urllib.error.URLError,
    ) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
