# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/assurance/browser.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/runtime.py, tests/assurance/test_runtime.py, apps/web/src/App.jsx
# EnumType:    Test
# EnumEdges:   CONSUMES tests/assurance/runtime.py; CONSUMES tests/assurance/test_runtime.py; VALIDATES apps/web/src/App.jsx
# Intent:      Exercise actual learner views, keyboard access and browser sizes against an isolated backend with no external browser requests.
# ───────────────────────────────────────────────────────────────

"""Run real-browser profiles on a fresh local app and PocketBase; never target production."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
from typing import Any, Iterator
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener

from tests.assurance.runtime import AssuranceServer
from tests.assurance.test_runtime import classroom, native_mission_journey
from tests.upgrade.test_workspace_native import ROOT, WORKSPACE, ALICE


def vite_entry() -> Path | None:
    """Locate the installed locked frontend runner without installing dependencies."""
    return next(
        (
            path
            for path in (
                ROOT / "node_modules/vite/bin/vite.js",
                ROOT / "apps/web/node_modules/vite/bin/vite.js",
            )
            if path.is_file()
        ),
        None,
    )


@contextmanager
def web(server: AssuranceServer, output: Path) -> Iterator[str]:
    """Start Vite only on loopback with an explicit disposable PocketBase endpoint."""
    vite, node = vite_entry(), shutil.which("node")
    if vite is None or node is None:
        raise RuntimeError("BLOCKED: locked Vite and Node are required.")
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        port = reserved.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "VITE_POCKETBASE_API_URL": server.base,
        "NODE_ENV": "development",
    }
    with (output / "web.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [
                node,
                str(vite),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--strictPort",
                "--mode",
                "assurance",
            ],
            cwd=ROOT / "apps/web",
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            opener = build_opener(ProxyHandler({}))
            until = time.monotonic() + 45
            while time.monotonic() < until:
                if process.poll() is not None:
                    raise RuntimeError(
                        "Local frontend exited before becoming ready; inspect web.log."
                    )
                try:
                    with opener.open(base, timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(0.2)
            else:
                raise RuntimeError("Local frontend startup timed out.")
            yield base
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def login(page: Any, base: str, actor: str) -> None:
    """Use the product login form with synthetic credentials rather than seeding browser auth."""
    page.goto(base + "/login")
    page.get_by_label("Email address", exact=True).fill(actor + "@fixture.invalid")
    page.get_by_label("Password", exact=True).fill("local-fixture-password-only")
    page.get_by_role("button", name="Sign in", exact=True).click()
    page.wait_for_url(re.compile(r"/(app|onboarding)(?:[/?#]|$)"))


def semantics(page: Any) -> None:
    """Check visible naming, document language and horizontal fit without claiming WCAG certification."""
    errors = page.evaluate("""() => {
        const visible = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
        const name = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') ||
            Array.from(e.labels || []).map(label => label.textContent).join(' ') || e.innerText || e.getAttribute('alt') || (e.type === 'submit' ? e.value : '') || '').trim();
        const failures = [];
        if (!document.documentElement.lang) failures.push('document-language');
        if (!Array.from(document.querySelectorAll('h1')).some(visible)) failures.push('page-heading');
        for (const e of document.querySelectorAll('button,a[href],input:not([type=hidden]),textarea,select'))
            if (visible(e) && !name(e)) failures.push('unnamed-' + e.tagName.toLowerCase());
        for (const e of document.querySelectorAll('img')) if (visible(e) && !e.hasAttribute('alt')) failures.push('image-alt');
        if (document.documentElement.scrollWidth > innerWidth + 2) failures.push('horizontal-overflow');
        return failures;
    }""")
    if errors:
        raise AssertionError(
            "Accessible structure checks failed: " + ", ".join(errors[:20])
        )


def onboarding(page: Any, base: str, server: AssuranceServer) -> None:
    """Save a real objective through the three-step learner setup and verify native persistence."""
    login(page, base, "learner")
    page.get_by_label("Learn something", exact=True).check()
    page.get_by_role("button", name="Continue", exact=True).click()
    page.get_by_label("Your objective", exact=True).fill(
        "Learn to verify a shared project with evidence"
    )
    page.get_by_role("button", name="Continue", exact=True).click()
    page.get_by_label("Workspace name", exact=True).fill("Assurance learner workspace")
    page.get_by_role("button", name="Create workspace", exact=True).click()
    page.wait_for_url(re.compile(r"/app(?:[/?#]|$)"))
    saved = server.call(
        "GET", "/api/collections/workspaces/records?perPage=100", actor="learner"
    )["items"]
    if len(saved) != 1 or not saved[0].get("onboarding_objective"):
        raise AssertionError(
            "Objective-first onboarding did not create exactly one linked workspace."
        )
    page.reload()
    if (
        len(
            server.call(
                "GET",
                "/api/collections/workspaces/records?perPage=100",
                actor="learner",
            )["items"]
        )
        != 1
    ):
        raise AssertionError("Reload duplicated onboarding.")


def learning_journey(page: Any, base: str, server: AssuranceServer) -> None:
    """Combine browser learning/collaboration with native independent verification and browser readback."""
    login(page, base, "alice")
    server.call(
        "POST",
        "/api/collections/erp_objectives/records",
        {
            "workspace": WORKSPACE,
            "owner": ALICE,
            "title": "Learn to verify an observed result",
            "status": "active",
            "progress": 0,
        },
    )
    lesson = server.lesson()
    page.goto(base + "/app/tutorials")
    opener = page.get_by_role(
        "button", name="Start interactive tutorial: " + lesson["title"], exact=True
    )
    opener.click()
    page.get_by_role("button", name="Start and save my progress", exact=True).click()
    for _ in lesson["lesson"]["sections"]:
        page.get_by_role(
            "button", name="Save checkpoint and continue", exact=True
        ).click()
    for checkbox in page.get_by_role("dialog").get_by_role("checkbox").all():
        checkbox.check()
    page.get_by_role("button", name="Save practice and continue", exact=True).click()
    page.get_by_label(
        lesson["lesson"]["check"]["choices"][lesson["lesson"]["check"]["answer"]],
        exact=True,
    ).check()
    page.get_by_role("button", name="Check answer and finish", exact=True).click()
    page.get_by_text(
        "Tutorial complete. Your certificate and 100 learning points are saved.",
        exact=True,
    ).wait_for()
    page.keyboard.press("Escape")
    if not opener.evaluate("e => e === document.activeElement"):
        raise AssertionError("Lesson dialog did not return keyboard focus.")
    path, room = classroom(server)
    page.goto(f"{base}/app/classrooms/{room}?workspace={WORKSPACE}")
    page.get_by_role("button", name="Join class", exact=True).click()
    page.get_by_text("You are attending", exact=True).wait_for()
    if not server.call("GET", f"{path}/{room}")["membership"]["active"]:
        raise AssertionError("Browser classroom join did not persist.")
    mission = native_mission_journey(server)
    page.goto(base + "/app/missions?mission=" + mission["id"])
    page.get_by_text(mission["title"], exact=True).first.wait_for()
    if (
        mission["mission_reviewed_by"] == ALICE
        or not mission["mission_review"]["reflection"]
    ):
        raise AssertionError("Independent review and reflection are missing.")
    page.goto(base + "/app/tutorials")
    if server.call("GET", "/api/buildanddo/learning")["points"] != 100:
        raise AssertionError("Learning credit did not survive the complete journey.")


def paywall(page: Any, base: str) -> None:
    """Reject direct routes and client-supplied price/tier claims for an unpaid member."""
    login(page, base, "viewer")
    for path in (
        "/app/government?paid=true&tier=government&amount=100",
        "/app/suite",
        "/app/tutorials?path=government",
    ):
        page.goto(base + path)
        page.get_by_role(
            "heading", name="Government research membership", exact=True
        ).wait_for()
        if page.get_by_role(
            "heading", name="Army decision packages", exact=True
        ).count():
            raise AssertionError("Protected research leaked through a direct URL.")


def accessibility(page: Any, base: str, server: AssuranceServer) -> None:
    """Check keyboard entry, dialog focus, reduced motion and 200-percent text zoom."""
    login(page, base, "alice")
    lesson = server.lesson()
    page.goto(base + "/app/tutorials")
    opener = page.get_by_role(
        "button", name="Start interactive tutorial: " + lesson["title"], exact=True
    )
    opener.wait_for()
    semantics(page)
    opener.focus()
    page.keyboard.press("Enter")
    dialog = page.get_by_role("dialog")
    dialog.wait_for()
    for _ in range(12):
        page.keyboard.press("Tab")
        if not dialog.evaluate("e => e.contains(document.activeElement)"):
            raise AssertionError("Keyboard focus escaped an open learning dialog.")
    page.keyboard.press("Escape")
    if not opener.evaluate("e => e === document.activeElement"):
        raise AssertionError("Dialog focus did not return to its opener.")
    page.goto(base + "/app/government")
    page.get_by_role("heading", name="Army decision packages", exact=True).wait_for()
    page.add_style_tag(content="html { font-size: 200%; }")
    semantics(page)
    page.keyboard.press("Tab")
    if page.evaluate("document.activeElement === document.body"):
        raise AssertionError("No keyboard-focusable control was reached.")


def run(profile: str, output: Path, binary: str) -> dict[str, object]:
    """Run a named browser profile and retain actual case outcomes and local screenshots."""
    from playwright.sync_api import sync_playwright

    results: list[dict[str, object]] = []
    server = AssuranceServer(binary)
    try:
        with web(server, output) as base, sync_playwright() as engine:
            cases = (
                [
                    (name, width)
                    for name in ("chromium", "firefox", "webkit")
                    for width in (390, 1280)
                ]
                if profile == "compatibility"
                else [("chromium", 1280)]
            )
            for name, width in cases:
                browser = getattr(engine, name).launch()
                try:
                    actions = (
                        [onboarding, learning_journey, paywall]
                        if profile == "journey"
                        else [accessibility]
                        if profile == "accessibility"
                        else [None]
                    )
                    for action in actions:
                        context = browser.new_context(
                            viewport={"width": width, "height": 844},
                            reduced_motion="reduce",
                        )
                        allowed = {urlsplit(base).netloc, urlsplit(server.base).netloc}
                        context.route(
                            "**/*",
                            lambda route: route.continue_()
                            if urlsplit(route.request.url).netloc in allowed
                            else route.abort(),
                        )
                        page = context.new_page()
                        page.set_default_timeout(15000)
                        errors: list[str] = []
                        page.on(
                            "pageerror",
                            lambda error: errors.append(type(error).__name__),
                        )
                        case = f"{name}-{width}-{action.__name__ if action else 'workspace-layout'}"
                        try:
                            if action is paywall:
                                paywall(page, base)
                            elif action is not None:
                                action(page, base, server)
                            else:
                                login(page, base, "alice")
                                for path, heading in (
                                    ("/app/government", "Government research"),
                                    ("/app/tutorials", "Field Manual"),
                                    ("/app/classrooms", "Classrooms"),
                                ):
                                    page.goto(base + path)
                                    page.get_by_role(
                                        "heading", name=heading, exact=True
                                    ).first.wait_for()
                                    semantics(page)
                            if errors:
                                raise AssertionError("Browser runtime errors occurred.")
                            page.screenshot(
                                path=str(output / (case + ".png")), full_page=True
                            )
                            results.append({"case": case, "state": "PASS"})
                        except Exception as error:
                            results.append(
                                {
                                    "case": case,
                                    "state": "FAIL",
                                    "reason": type(error).__name__
                                    + ": "
                                    + str(error)[:1200],
                                }
                            )
                        finally:
                            context.close()
                finally:
                    browser.close()
    finally:
        server.close()
    return {
        "profile": profile,
        "state": "PASS"
        if results and all(case["state"] == "PASS" for case in results)
        else "FAIL",
        "cases": results,
        "scope": "loopback app and native backend; naming/focus/zoom checks do not establish complete accessibility conformance",
    }


def main() -> int:
    """Write the exact browser result and fail on any unsuccessful case."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "profile", choices=("journey", "accessibility", "compatibility")
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = run(
        args.profile, args.output, os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
    )
    (args.output / "browser-result.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(result))
    return 0 if result["state"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
