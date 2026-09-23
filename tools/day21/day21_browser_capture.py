#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File:        tools/day21/day21_browser_capture.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Depends:     scripts/ci/day21_submission.py, tools/day21/day21_public_probe.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/day21_submission.py; CONSUMES tools/day21/day21_public_probe.py
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Optional Playwright browser evidence recorder for the Day-21 demo journey.

The script is intentionally configuration-driven. Secrets are read from named
environment variables referenced by the scenario; they are never written to the
receipt. If Playwright is unavailable the run is BLOCKED, not silently skipped.
Console events retain levels, times and message digests, not potentially private
message text. Candidate SHA is read back before and after the journey; source
and artifact digests remain explicitly supplied expectations.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci import day21_submission as day21  # noqa: E402
from tools.day21.day21_public_probe import (  # noqa: E402
    checked_url,
    prepare_output,
    retain,
    version_observation,
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--scenario", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--candidate-sha", required=True)
    p.add_argument("--source-sha256", required=True)
    p.add_argument("--artifact-tree-sha256", required=True)
    p.add_argument("--base-url", required=True)
    args = p.parse_args(argv)
    try:
        identity = day21.candidate_fields(vars(args))
        checked_url(args.base_url)
        scenario = day21.strict_json(args.scenario)
        steps = scenario.get("steps")
        if not isinstance(steps, list) or not steps:
            raise day21.Day21Error("scenario has no steps")
        for raw in steps:
            if (
                not isinstance(raw, dict)
                or not isinstance(raw.get("kind"), str)
                or not raw["kind"].strip()
            ):
                raise day21.Day21Error("step must be an object with a nonempty kind")
            action = raw.get("action")
            fields = {
                "goto": (),
                "click": ("name",),
                "fill": ("label",),
                "expect": ("text",),
            }
            if not isinstance(action, str) or action not in fields:
                raise day21.Day21Error("unsupported scenario action")
            if any(
                not isinstance(raw.get(key), str) or not raw[key].strip()
                for key in fields[action]
            ):
                raise day21.Day21Error("scenario action requires nonempty text fields")
            if action == "goto":
                if not isinstance(raw.get("path", ""), str):
                    raise day21.Day21Error("navigation path must be a string")
                checked_url(
                    urljoin(args.base_url.rstrip("/") + "/", raw.get("path", "")),
                    args.base_url,
                )
            if action == "fill" and (
                ("env" in raw) == ("value" in raw)
                or not isinstance(raw.get("env", raw.get("value")), str)
                or ("env" in raw and not raw["env"].strip())
            ):
                raise day21.Day21Error(
                    "fill needs exactly one literal value or named environment variable"
                )
        prepare_output(
            args.output, ("browser-journey.json", "browser-console.json", "screenshots")
        )
    except (OSError, ValueError, TypeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 2
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import-not-found]
    except ImportError:
        print(
            "BLOCKED: install Playwright and its Chromium runtime before browser acceptance",
            file=sys.stderr,
        )
        return 3
    out = args.output
    shots = out / "screenshots"
    receipt: dict[str, Any] = {
        "schema": "buildanddo.day21-browser-journey/v1",
        **identity,
        "started_at": now(),
        "steps": [],
        "release_readbacks": [],
        "identity_scope": "Source and artifact digests are caller-supplied expectations; only commit_sha was read back.",
    }
    console: list[dict[str, str]] = []

    def record_console(event: str, level: str, text: str) -> None:
        console.append(
            {
                "event": event,
                "level": level,
                "observed_at": now(),
                "message_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            }
        )

    try:
        shots.mkdir()
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    viewport={"width": 1440, "height": 1000}, service_workers="block"
                )
                page = context.new_page()
                page.on(
                    "console", lambda msg: record_console("console", msg.type, msg.text)
                )
                page.on(
                    "pageerror",
                    lambda error: record_console("pageerror", "error", str(error)),
                )
                scope_failures: list[str] = []

                def guard_navigation(route: Any) -> None:
                    request = route.request
                    if (
                        request.is_navigation_request()
                        and request.frame == page.main_frame
                    ):
                        try:
                            checked_url(request.url, args.base_url)
                        except ValueError:
                            scope_failures.append("navigation left the selected origin")
                            route.abort()
                            return
                    route.continue_()

                page.route("**/*", guard_navigation)

                def read_version() -> None:
                    url = urljoin(args.base_url, "/version.json")
                    response = context.request.get(
                        url,
                        max_redirects=0,
                        timeout=30000,
                        headers={"Cache-Control": "no-cache"},
                    )
                    try:
                        if checked_url(response.url, args.base_url) != url:
                            raise day21.Day21Error(
                                "version response URL differs from the requested scope"
                            )
                        receipt["release_readbacks"].append(
                            version_observation(
                                response.url,
                                response.status,
                                response.body(),
                                identity["candidate_sha"],
                                now(),
                            )
                        )
                    finally:
                        response.dispose()

                read_version()
                for index, raw in enumerate(steps, start=1):
                    kind, action = raw["kind"], raw.get("action")
                    if action == "goto":
                        target = checked_url(
                            urljoin(
                                args.base_url.rstrip("/") + "/", raw.get("path", "")
                            ),
                            args.base_url,
                        )
                        response = page.goto(
                            target, wait_until="networkidle", timeout=45000
                        )
                        if (
                            response is None
                            or response.status != 200
                            or response.url != target
                        ):
                            raise day21.Day21Error(
                                "navigation did not return HTTP 200 from the requested URL"
                            )
                    else:
                        checked_url(page.url, args.base_url)
                        if action == "click":
                            page.get_by_role(
                                str(raw.get("role", "button")), name=str(raw["name"])
                            ).click(timeout=15000)
                        elif action == "fill":
                            value = raw.get("value")
                            env_name = raw.get("env")
                            if env_name:
                                value = os.environ.get(str(env_name))
                            if not isinstance(value, str) or (env_name and not value):
                                raise day21.Day21Error(
                                    "fill needs a value or available named environment variable"
                                )
                            page.get_by_label(str(raw["label"]), exact=False).fill(
                                value
                            )
                        elif action == "expect":
                            page.get_by_text(str(raw["text"]), exact=False).wait_for(
                                state="visible", timeout=15000
                            )
                        else:
                            raise day21.Day21Error("unsupported scenario action")
                    observed_url = checked_url(page.url, args.base_url)
                    if scope_failures:
                        raise day21.Day21Error(scope_failures[0])
                    image = page.screenshot(full_page=True)
                    if (
                        not image
                        or checked_url(page.url, args.base_url) != observed_url
                        or scope_failures
                    ):
                        raise day21.Day21Error(
                            "screenshot is empty or navigation changed during capture"
                        )
                    ref = retain(out, f"screenshots/{index:02d}.png", image, now())
                    receipt["steps"].append(
                        {
                            "kind": kind,
                            "state": "PASS",
                            "url": observed_url,
                            "screenshots": [ref],
                        }
                    )
                    if kind == "public_entry":
                        receipt["url"] = observed_url
                read_version()
                checked_url(page.url, args.base_url)
                if scope_failures:
                    raise day21.Day21Error(scope_failures[0])
            finally:
                browser.close()
    except Exception as exc:
        receipt["steps"].append(
            {
                "kind": "capture_failure",
                "state": "FAIL",
                "screenshots": [],
                "reason": str(exc)
                if isinstance(exc, day21.Day21Error)
                else type(exc).__name__,
            }
        )
    try:
        console_at = now()
        receipt["console_error_count"] = sum(
            event["level"] == "error" for event in console
        )
        receipt["console"] = retain(
            out,
            "browser-console.json",
            (json.dumps({"events": console}, indent=2, sort_keys=True) + "\n").encode(
                "utf-8"
            ),
            console_at,
        )
        receipt["finished_at"] = now()
        target = out / "browser-journey.json"
        with target.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
        print(target)
        day21.validate_browser(out, datetime.fromisoformat(now()))
        return 0
    except (OSError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
