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
"""Optional Playwright browser evidence recorder for the Day-21 demo journey.

The script is intentionally configuration-driven. Secrets are read from named
environment variables referenced by the scenario; they are never written to the
receipt. If Playwright is unavailable the run is BLOCKED, not silently skipped.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--scenario", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--candidate-sha", required=True)
    p.add_argument("--base-url", required=True)
    args = p.parse_args(argv)
    if urlparse(args.base_url).scheme != "https":
        print("FAIL: base URL must be https", file=sys.stderr)
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        print("BLOCKED: install Playwright and its Chromium runtime before browser acceptance", file=sys.stderr)
        return 3
    scenario = json.loads(args.scenario.read_text(encoding="utf-8"))
    steps = scenario.get("steps")
    if not isinstance(steps, list) or not steps:
        print("FAIL: scenario has no steps", file=sys.stderr)
        return 2
    out = args.output
    shots = out / "screenshots"
    shots.mkdir(parents=True, exist_ok=True)
    receipt = {"schema": "buildanddo.day21-browser-journey/v1", "candidate_sha": args.candidate_sha, "started_at": now(), "steps": []}
    console_errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        try:
            for index, raw in enumerate(steps, start=1):
                if not isinstance(raw, dict):
                    raise ValueError("step must be an object")
                kind, action = raw.get("kind"), raw.get("action")
                item = {"kind": kind, "state": "PASS", "screenshots": []}
                if action == "goto":
                    target = urljoin(args.base_url.rstrip("/") + "/", str(raw.get("path", "")).lstrip("/"))
                    response = page.goto(target, wait_until="networkidle", timeout=45000)
                    if response is None or response.status >= 400:
                        raise RuntimeError(f"navigation failed: {target}")
                elif action == "click":
                    page.get_by_role(str(raw.get("role", "button")), name=str(raw["name"])).click(timeout=15000)
                elif action == "fill":
                    value = raw.get("value")
                    env_name = raw.get("env")
                    if env_name:
                        value = os.environ.get(str(env_name))
                        if not value:
                            raise RuntimeError(f"missing required environment variable: {env_name}")
                    page.get_by_label(str(raw["label"]), exact=False).fill(str(value))
                elif action == "expect":
                    page.get_by_text(str(raw["text"]), exact=False).wait_for(state="visible", timeout=15000)
                else:
                    raise ValueError(f"unsupported action: {action}")
                filename = shots / f"{index:02d}-{kind}.png"
                page.screenshot(path=str(filename), full_page=True)
                item["screenshots"].append({"path": filename.relative_to(out).as_posix(), "sha256": sha(filename), "observed_at": now()})
                receipt["steps"].append(item)
        except Exception as exc:
            receipt["steps"].append({"kind": "capture_failure", "state": "FAIL", "screenshots": [], "reason": type(exc).__name__})
        finally:
            receipt["finished_at"] = now()
            receipt["console_error_count"] = len(console_errors)
            browser.close()
    target = out / "browser-journey.json"
    target.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(target)
    return 0 if all(step.get("state") == "PASS" for step in receipt["steps"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
