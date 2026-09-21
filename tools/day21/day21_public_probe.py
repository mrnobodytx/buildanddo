#!/usr/bin/env python3
# # --- CGRF Header ------------------------------------------------
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Capture deterministic public-URL evidence for the Day-21 submission."""
from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

MAX_BODY = 4 * 1024 * 1024


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--url", required=True)
    p.add_argument("--output", type=Path, default=Path("state/day21/evidence/public-url.json"))
    args = p.parse_args(argv)
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        print("FAIL: public URL must be https", file=sys.stderr)
        return 2
    try:
        request = urllib.request.Request(args.url, headers={"User-Agent": "BuildAndDo-Day21-Probe/1.0", "Accept": "text/html,*/*"})
        with urllib.request.urlopen(request, timeout=30, context=ssl.create_default_context()) as response:
            body = response.read(MAX_BODY + 1)
            if len(body) > MAX_BODY:
                raise RuntimeError("public response exceeds 4 MiB evidence bound")
            final_url = response.geturl()
            status = response.status
        final = urlparse(final_url)
        if final.scheme != "https":
            raise RuntimeError("public URL redirected away from https")
        receipt = {
            "schema": "buildanddo.day21-public-url/v1",
            "url": f"{final.scheme}://{final.netloc}{final.path or ''}".rstrip("/"),
            "status_code": int(status),
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "body_sha256": hashlib.sha256(body).hexdigest(),
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0 if 200 <= status < 400 else 1
    except (OSError, RuntimeError, urllib.error.URLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
