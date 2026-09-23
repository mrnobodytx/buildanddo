# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_day21_submission.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/day21_submission.py, tests/upgrade/test_day21_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/day21_submission.py; CONSUMES tests/upgrade/test_day21_support.py
# Intent:      Reject summary-only, stale, mismatched and tampered submission evidence before candidate packaging.
# ───────────────────────────────────────────────────────────────

"""Verify closure composition with synthetic receipts, never deployed acceptance."""

from __future__ import annotations

import base64
from collections.abc import Callable
from contextlib import redirect_stdout, redirect_stderr
import copy
from datetime import datetime, timedelta
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
from typing import Any, cast
import unittest
from unittest.mock import MagicMock, patch
import urllib.error
import urllib.request

from scripts.ci import day21_submission as day21
from tests.upgrade.test_day21_support import candidate_fixture
from tests.upgrade.test_hostinger_readiness import fixture, write_json
from tests.upgrade.test_hostinger_replay import (
    ARTIFACT,
    NOW,
    SHA,
    SOURCE,
    ReplayFixture,
)
from tools.day21 import day21_browser_capture as browser_capture
from tools.day21 import day21_public_probe as public_probe


class CaptureProducerTests(unittest.TestCase):
    """Use synthetic transports and screenshots, never live deployment evidence."""

    def setUp(self) -> None:
        directory = self.enterContext(
            tempfile.TemporaryDirectory(prefix="day21-synthetic-capture-")
        )
        self.root = Path(directory)
        self.url = "https://synthetic.example.org/hostinger-challenge?fixture=1"
        self.origin = "https://synthetic.example.org"
        self.body = b"<html>Synthetic response fixture</html>\r\n\x00\xff"
        self.version_body = json.dumps(
            {"commit_sha": SHA, "version": "0.0.0+synthetic"}
        ).encode()
        self.identity_args = [
            "--candidate-sha",
            SHA,
            "--source-sha256",
            SOURCE,
            "--artifact-tree-sha256",
            ARTIFACT,
        ]
        self.public_args = [
            "--url",
            self.url,
            "--output",
            str(self.root / "public-url.json"),
            *self.identity_args,
        ]
        self.scenario = self.root / "synthetic-scenario.json"
        kinds = (
            "public_entry",
            "auth",
            "challenge",
            "mission",
            "evidence",
            "operator_readback",
        )
        write_json(
            self.scenario,
            {
                "synthetic": True,
                "steps": [
                    {"kind": kind, "action": "goto", "path": self.url}
                    if index == 0
                    else {"kind": kind, "action": "expect", "text": "Synthetic " + kind}
                    for index, kind in enumerate(kinds)
                ],
            },
        )
        self.browser_args = [
            "--scenario",
            str(self.scenario),
            "--output",
            str(self.root),
            "--base-url",
            self.origin,
            *self.identity_args,
        ]
        self.events: list[tuple[str, str]] = []
        self.page = MagicMock()
        self.page.url = "about:blank"
        self.handlers: dict[str, Callable[[Any], None]] = {}
        self.page.on.side_effect = self.handlers.__setitem__

        def navigate(url: str, **_kwargs: object) -> MagicMock:
            route = MagicMock()
            route.request.is_navigation_request.return_value = True
            route.request.frame = self.page.main_frame
            route.request.url = url
            self.page.route.call_args.args[1](route)
            route.continue_.assert_called_once()
            self.page.url = url
            for level, text in self.events:
                self.handlers["console"](SimpleNamespace(type=level, text=text))
            response = MagicMock(status=200, url=url)
            response.request.redirected_from = None
            return response

        def screenshot(path: str | None = None, **_kwargs: object) -> bytes:
            body = (
                b"Synthetic screenshot, NOT browser acceptance: "
                + str(self.page.url).encode()
            )
            if path is not None:
                Path(path).write_bytes(body)
            return body

        self.page.goto.side_effect = navigate
        self.page.screenshot.side_effect = screenshot
        self.context = MagicMock()
        self.context.new_page.return_value = self.page
        self.browser = MagicMock()
        self.browser.new_context.return_value = self.context
        self.playwright = MagicMock()
        self.playwright.return_value.__enter__.return_value.chromium.launch.return_value = self.browser
        self.enterContext(
            patch.dict(
                sys.modules,
                {
                    "playwright": SimpleNamespace(),
                    "playwright.sync_api": SimpleNamespace(
                        sync_playwright=self.playwright
                    ),
                },
            )
        )

        self.responses = {}
        for url in (self.url, self.origin + "/version.json"):
            response = MagicMock(status=200, url=url)
            response.geturl.return_value = url
            response.__enter__.return_value = response
            self.responses[url] = response

        def fetch(
            request: urllib.request.Request | str, **_kwargs: object
        ) -> MagicMock:
            url = request if isinstance(request, str) else request.full_url
            body = self.version_body if url.endswith("/version.json") else self.body
            response = self.responses[url]
            response.read.return_value = body
            response.body.return_value = body
            return response

        self.fetch = MagicMock(side_effect=fetch)
        self.real_build_opener = urllib.request.build_opener
        self.enterContext(
            patch.object(
                public_probe.urllib.request,
                "urlopen",
                side_effect=AssertionError("Redirect-capable transport is forbidden"),
            )
        )
        self.enterContext(
            patch.object(
                public_probe.urllib.request,
                "build_opener",
                return_value=SimpleNamespace(open=self.fetch),
            )
        )
        self.context.request.get.side_effect = self.fetch
        self.enterContext(
            patch(
                "socket.create_connection",
                side_effect=AssertionError("No network in synthetic capture tests"),
            )
        )
        self.enterContext(
            patch(
                "subprocess.run",
                side_effect=AssertionError("No checkout-derived identity in captures"),
            )
        )
        clock = self.enterContext(
            patch.object(public_probe, "datetime", wraps=datetime)
        )
        clock.now.return_value = NOW
        self.enterContext(
            patch.object(browser_capture, "now", return_value=NOW.isoformat())
        )
        self.output = io.StringIO()
        self.enterContext(redirect_stdout(self.output))
        self.enterContext(redirect_stderr(self.output))

    def test_public_capture_retains_exact_body_and_candidate(self) -> None:
        self.assertEqual(public_probe.main(self.public_args), 0)
        result = day21.validate_public_url(self.root, NOW)
        self.assertEqual(result["candidate_sha"], SHA)
        self.assertEqual(result["source_sha256"], SOURCE)
        self.assertEqual(result["artifact_tree_sha256"], ARTIFACT)
        self.assertEqual((self.root / result["body"]["path"]).read_bytes(), self.body)
        self.assertEqual(result["url"], self.url)
        receipt = day21.strict_json(self.root / "public-url.json")
        readback = receipt["release_readback"]
        self.assertEqual(base64.b64decode(readback["body_base64"]), self.version_body)
        self.assertEqual(readback["commit_sha"], SHA)
        self.assertEqual(readback["url"], self.origin + "/version.json")
        self.assertIn("caller-supplied", receipt["identity_scope"])
        request = self.fetch.call_args_list[0].args[0]
        self.assertEqual(request.full_url, self.url)
        self.assertEqual(request.get_header("Cache-control"), "no-cache")

    def test_browser_capture_satisfies_existing_validator(self) -> None:
        self.events.append(
            ("info", "Synthetic console message, not operational evidence")
        )
        self.assertEqual(browser_capture.main(self.browser_args), 0)
        result = day21.validate_browser(self.root, NOW)
        self.assertEqual(result["candidate_sha"], SHA)
        self.assertEqual(result["source_sha256"], SOURCE)
        self.assertEqual(result["artifact_tree_sha256"], ARTIFACT)
        self.assertEqual(result["url"], self.url)
        self.assertEqual(result["step_count"], 6)
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertEqual(len(receipt["release_readbacks"]), 2)
        for readback in receipt["release_readbacks"]:
            self.assertEqual(
                base64.b64decode(readback["body_base64"]), self.version_body
            )
        events = day21.strict_json(self.root / result["console"]["path"])["events"]
        self.assertEqual([event["level"] for event in events], ["info"])
        self.assertNotIn(self.events[0][1], json.dumps(receipt) + json.dumps(events))
        self.assertTrue(
            all(
                call.kwargs["max_redirects"] == 0
                for call in self.context.request.get.call_args_list
            )
        )
        self.browser.close.assert_called_once()

    def test_browser_console_errors_cannot_exit_success(self) -> None:
        self.events.append(("error", "Synthetic browser error"))
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertEqual(receipt["console_error_count"], 1)
        self.assertTrue((self.root / receipt["console"]["path"]).is_file())
        with self.assertRaisesRegex(day21.Day21Error, "zero console errors"):
            day21.validate_browser(self.root, NOW)

    def test_browser_actions_use_only_explicit_synthetic_values(self) -> None:
        scenario = day21.strict_json(self.scenario)
        scenario["steps"][1] = {
            "kind": "auth",
            "action": "fill",
            "label": "Synthetic input",
            "env": "DAY21_SYNTHETIC_VALUE",
        }
        scenario["steps"][2] = {
            "kind": "challenge",
            "action": "click",
            "name": "Synthetic submit",
        }
        scenario["steps"][3] = {
            "kind": "mission",
            "action": "fill",
            "label": "Synthetic input",
            "value": "",
        }
        write_json(self.scenario, scenario)
        environment = MagicMock()
        environment.get.side_effect = {
            "DAY21_SYNTHETIC_VALUE": "Synthetic local value"
        }.__getitem__
        with patch.object(browser_capture, "os", SimpleNamespace(environ=environment)):
            self.assertEqual(browser_capture.main(self.browser_args), 0)
        environment.get.assert_called_once_with("DAY21_SYNTHETIC_VALUE")
        self.page.get_by_role.assert_called_once_with("button", name="Synthetic submit")
        self.assertEqual(
            [
                call.args[0]
                for call in self.page.get_by_label.return_value.fill.call_args_list
            ],
            ["Synthetic local value", ""],
        )
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertNotIn("Synthetic local value", json.dumps(receipt))
        args, _ = self.output_args(self.browser_args, "missing-synthetic-value")
        with patch.object(browser_capture, "os", SimpleNamespace(environ={})):
            self.assertEqual(browser_capture.main(args), 1)

    def output_args(self, original: list[str], name: str) -> tuple[list[str], Path]:
        args = original.copy()
        directory = self.root / name
        args[args.index("--output") + 1] = str(
            directory / "public-url.json" if "--url" in args else directory
        )
        return args, directory

    def test_absent_and_malformed_expected_identities_stop_before_transport(
        self,
    ) -> None:
        for main, original in (
            (public_probe.main, self.public_args),
            (browser_capture.main, self.browser_args),
        ):
            for flag in (
                "--candidate-sha",
                "--source-sha256",
                "--artifact-tree-sha256",
            ):
                with self.subTest(producer=main.__module__, flag=flag, missing=True):
                    args = original.copy()
                    index = args.index(flag)
                    del args[index : index + 2]
                    with self.assertRaises(SystemExit) as stopped:
                        main(args)
                    self.assertEqual(stopped.exception.code, 2)
                for value in ("", "short", "g" * 64, "A" * 40):
                    with self.subTest(producer=main.__module__, flag=flag, value=value):
                        args = original.copy()
                        args[args.index(flag) + 1] = value
                        self.assertEqual(main(args), 2)
        self.fetch.assert_not_called()
        self.playwright.assert_not_called()

    def test_invalid_urls_and_foreign_scenario_targets_stop_before_transport(
        self,
    ) -> None:
        invalid = (
            "http://synthetic.example.org",
            "https://",
            "https://@synthetic.example.org",
            "https://fixture:fixture@synthetic.example.org",
            self.url + "#fragment",
            "https://synthetic.example.org:invalid",
            "https://synthetic.example.org:0",
            "https://synthetic.example.org\\other",
            self.url + "\n",
        )
        for main, original, flag in (
            (public_probe.main, self.public_args, "--url"),
            (browser_capture.main, self.browser_args, "--base-url"),
        ):
            for value in invalid:
                with self.subTest(producer=main.__module__, url=value):
                    args = original.copy()
                    args[args.index(flag) + 1] = value
                    self.assertEqual(main(args), 2)
        for target in (
            "//foreign.example.org/path",
            "https://foreign.example.org/path",
        ):
            scenario = day21.strict_json(self.scenario)
            scenario["steps"][0]["path"] = target
            write_json(self.scenario, scenario)
            self.assertEqual(browser_capture.main(self.browser_args), 2)
        self.fetch.assert_not_called()
        self.playwright.assert_not_called()

    def test_missing_malformed_and_foreign_runtime_sha_never_pass(self) -> None:
        bodies = (
            b"",
            b"Synthetic non-JSON response",
            b"[]",
            b"{}",
            b'{"commit_sha": null}',
            b'{"commit_sha": 123}',
            b'{"commit_sha": "short"}',
            b'{"commit_sha": "' + b"d" * 40 + b'"}',
            b'{"commit_sha":"'
            + SHA.encode()
            + b'", "commit_sha":"'
            + b"d" * 40
            + b'"}',
            b'{"commit_sha":"' + SHA.encode() + b'", "other":NaN}',
            b"\xff",
            b" " * (public_probe.MAX_VERSION_BODY + 1),
        )
        for producer, (main, original) in enumerate(
            (
                (public_probe.main, self.public_args),
                (browser_capture.main, self.browser_args),
            )
        ):
            for index, body in enumerate(bodies):
                with self.subTest(producer=producer, body=index):
                    self.version_body = body
                    args, directory = self.output_args(
                        original, f"bad-version-{producer}-{index}"
                    )
                    self.assertEqual(main(args), 1)
                    if producer == 0:
                        self.assertFalse((directory / "public-url.json").exists())
                    else:
                        receipt = day21.strict_json(directory / "browser-journey.json")
                        self.assertEqual(receipt["steps"][-1]["state"], "FAIL")
        self.page.goto.assert_not_called()

    def test_response_status_redirect_and_scope_are_not_relabelled_success(
        self,
    ) -> None:
        for role in ("public", "version"):
            response = self.responses[
                self.url if role == "public" else self.origin + "/version.json"
            ]
            original_url = response.url
            for index, (status, url) in enumerate(
                (
                    (301, original_url),
                    (302, original_url),
                    (307, original_url),
                    (308, original_url),
                    (204, original_url),
                    (206, original_url),
                    (404, original_url),
                    (500, original_url),
                    (200, "https://foreign.example.org/version.json"),
                    (200, self.origin + "/different-path"),
                    (200, "http://synthetic.example.org/version.json"),
                    (200, self.origin + ":444/version.json"),
                )
            ):
                response.status, response.url = status, url
                response.geturl.return_value = url
                for main, original in (
                    [(public_probe.main, self.public_args)]
                    if role == "public"
                    else [
                        (public_probe.main, self.public_args),
                        (browser_capture.main, self.browser_args),
                    ]
                ):
                    with self.subTest(
                        role=role, status=status, url=url, producer=main.__module__
                    ):
                        args, _ = self.output_args(
                            original, f"scope-{role}-{index}-{main.__module__}"
                        )
                        self.assertEqual(main(args), 1)
            response.status, response.url = 200, original_url
            response.geturl.return_value = original_url

    def test_public_transport_does_not_follow_http_redirects(self) -> None:
        observed: list[str] = []

        class SyntheticHTTPSHandler(urllib.request.HTTPSHandler):
            def https_open(self, request: urllib.request.Request) -> Any:
                observed.append(request.full_url)
                headers = public_probe.Message()
                headers["Location"] = "https://foreign.example.org/redirected"
                response = urllib.response.addinfourl(
                    io.BytesIO(b"Synthetic redirect"), headers, request.full_url, 302
                )
                setattr(response, "msg", "Found")
                return response

        opener = self.real_build_opener(
            public_probe.NoRedirect(), SyntheticHTTPSHandler()
        )
        with patch.object(
            public_probe.urllib.request, "build_opener", return_value=opener
        ):
            self.assertEqual(public_probe.main(self.public_args), 1)
        self.assertEqual(observed, [self.url])
        self.assertFalse((self.root / "public-url.json").exists())

    def test_public_bound_and_transport_errors_fail_without_success_receipt(
        self,
    ) -> None:
        self.body = b"S" * (public_probe.MAX_BODY + 1)
        self.assertEqual(public_probe.main(self.public_args), 1)
        for error in (
            urllib.error.URLError("Synthetic transport failure"),
            OSError("Synthetic read failure"),
            public_probe.HTTPException("Synthetic HTTP failure"),
        ):
            with self.subTest(error=type(error).__name__):
                self.fetch.side_effect = error
                self.assertEqual(public_probe.main(self.public_args), 1)
        self.assertFalse((self.root / "public-url.json").exists())

    def test_evidence_tampering_missing_bytes_and_overwrite_are_rejected(self) -> None:
        self.assertEqual(public_probe.main(self.public_args), 0)
        self.assertEqual(browser_capture.main(self.browser_args), 0)
        files = {
            path.relative_to(self.root): path.read_bytes()
            for path in self.root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(public_probe.main(self.public_args), 2)
        self.assertEqual(browser_capture.main(self.browser_args), 2)
        self.assertEqual(
            files,
            {
                path.relative_to(self.root): path.read_bytes()
                for path in self.root.rglob("*")
                if path.is_file()
            },
        )
        for filename, validator in (
            ("public-response.bin", day21.validate_public_url),
            ("screenshots/01.png", day21.validate_browser),
            ("browser-console.json", day21.validate_browser),
        ):
            with self.subTest(file=filename):
                path = self.root / filename
                original = path.read_bytes()
                path.write_bytes(b"Tampered synthetic fixture")
                with self.assertRaisesRegex(day21.Day21Error, "hash mismatch"):
                    validator(self.root, NOW)
                path.unlink()
                with self.assertRaisesRegex(day21.Day21Error, "file missing"):
                    validator(self.root, NOW)
                path.symlink_to(self.scenario)
                with self.assertRaisesRegex(day21.Day21Error, "symlink"):
                    validator(self.root, NOW)
                path.unlink()
                path.write_bytes(original)

    def test_output_symlinks_cannot_replace_another_artifact(self) -> None:
        linked = self.root / "linked"
        linked.symlink_to(self.root, target_is_directory=True)
        for original, main in (
            (self.public_args, public_probe.main),
            (self.browser_args, browser_capture.main),
        ):
            args, _ = self.output_args(original, "linked/nested")
            self.assertEqual(main(args), 2)
        self.fetch.assert_not_called()
        self.playwright.assert_not_called()

    def test_browser_release_change_after_screenshots_fails_closed(self) -> None:
        response = self.responses[self.origin + "/version.json"]
        response.body.side_effect = [
            self.version_body,
            json.dumps({"commit_sha": "d" * 40}).encode(),
        ]
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertEqual(len(receipt["steps"]), 7)
        self.assertEqual(receipt["steps"][-1]["state"], "FAIL")
        self.assertIn("deployment SHA differs", receipt["steps"][-1]["reason"])

    def test_browser_page_errors_and_capture_exceptions_are_retained(self) -> None:
        def page_error(**_kwargs: object) -> bytes:
            self.handlers["pageerror"](
                RuntimeError("Synthetic uncaught page exception")
            )
            return b"Synthetic screenshot"

        self.page.screenshot.side_effect = page_error
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertEqual(receipt["console_error_count"], 6)
        for index, error in enumerate(
            (
                TimeoutError("Synthetic screenshot timeout"),
                OSError("Synthetic browser failure"),
            )
        ):
            args, directory = self.output_args(
                self.browser_args, f"capture-error-{index}"
            )
            self.page.screenshot.side_effect = error
            self.assertEqual(browser_capture.main(args), 1)
            self.assertEqual(
                day21.strict_json(directory / "browser-journey.json")["steps"][-1][
                    "state"
                ],
                "FAIL",
            )

    def test_browser_navigation_failures_and_cross_origin_redirect_attempts_fail(
        self,
    ) -> None:
        for index, response in enumerate(
            (
                None,
                MagicMock(status=500, url=self.url),
                MagicMock(status=200, url=self.origin + "/other"),
            )
        ):
            with self.subTest(response=index):
                args, _ = self.output_args(self.browser_args, f"navigation-{index}")
                self.page.goto.side_effect = None
                self.page.goto.return_value = response
                self.assertEqual(browser_capture.main(args), 1)

        route = MagicMock()
        route.request.is_navigation_request.return_value = True
        route.request.frame = self.page.main_frame
        route.request.url = "https://foreign.example.org/redirect"

        def redirected(url: str, **_kwargs: object) -> MagicMock:
            self.page.url = url
            self.page.route.call_args.args[1](route)
            return MagicMock(status=200, url=url)

        self.page.goto.side_effect = redirected
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        route.abort.assert_called_once()
        route.continue_.assert_not_called()

    def test_browser_empty_screenshots_and_navigation_during_capture_fail(self) -> None:
        for index, (image, destination) in enumerate(
            (
                (b"", self.url),
                (b"Synthetic screenshot", "https://foreign.example.org/changed"),
                (b"Synthetic screenshot", self.origin + "/changed"),
            )
        ):
            with self.subTest(case=index):

                def screenshot(**_kwargs: object) -> bytes:
                    self.page.url = destination
                    return image

                self.page.screenshot.side_effect = screenshot
                args, directory = self.output_args(
                    self.browser_args, f"changed-screenshot-{index}"
                )
                self.assertEqual(browser_capture.main(args), 1)
                self.assertEqual(
                    day21.strict_json(directory / "browser-journey.json")["steps"][-1][
                        "state"
                    ],
                    "FAIL",
                )

    def test_browser_scenario_validation_and_existing_order_gate_are_preserved(
        self,
    ) -> None:
        original = day21.strict_json(self.scenario)
        invalid: tuple[object, ...] = (
            [],
            {},
            {"steps": []},
            {"steps": [None]},
            {"steps": [{"kind": "public_entry", "action": "invented"}]},
            {"steps": [{"kind": "auth", "action": "fill", "label": "Synthetic field"}]},
        )
        for value in invalid:
            self.scenario.write_text(json.dumps(value))
            self.assertEqual(browser_capture.main(self.browser_args), 2)
        self.playwright.assert_not_called()
        original["steps"][2]["kind"] = "auth"
        write_json(self.scenario, original)
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        with self.assertRaisesRegex(day21.Day21Error, "missing required step"):
            day21.validate_browser(self.root, NOW)
        original["steps"][2]["kind"] = "challenge"
        original["steps"][3], original["steps"][4] = (
            original["steps"][4],
            original["steps"][3],
        )
        write_json(self.scenario, original)
        args, directory = self.output_args(self.browser_args, "wrong-order")
        self.assertEqual(browser_capture.main(args), 1)
        with self.assertRaisesRegex(day21.Day21Error, "out of order"):
            day21.validate_browser(directory, NOW)

    def test_missing_browser_dependency_and_launch_failure_are_nonpassing(self) -> None:
        with patch.dict(sys.modules, {"playwright.sync_api": None}):
            self.assertEqual(browser_capture.main(self.browser_args), 3)
        self.assertFalse((self.root / "browser-journey.json").exists())
        self.playwright.return_value.__enter__.return_value.chromium.launch.side_effect = RuntimeError(
            "Synthetic launch failure"
        )
        self.assertEqual(browser_capture.main(self.browser_args), 1)
        receipt = day21.strict_json(self.root / "browser-journey.json")
        self.assertEqual(receipt["steps"][-1]["state"], "FAIL")

    def test_producers_revalidate_retained_artifacts_before_exiting_success(
        self,
    ) -> None:
        actual_retain: Callable[[Path, str, bytes, str], dict[str, str]] = (
            public_probe.retain
        )

        def tamper(
            root: Path, name: str, body: bytes, observed_at: str
        ) -> dict[str, str]:
            ref = actual_retain(root, name, body, observed_at)
            if name in {"public-response.bin", "browser-console.json"}:
                (root / name).write_bytes(b"Synthetic post-capture tampering")
            return ref

        with patch.object(public_probe, "retain", side_effect=tamper):
            self.assertEqual(public_probe.main(self.public_args), 1)
        with patch.object(browser_capture, "retain", side_effect=tamper):
            self.assertEqual(browser_capture.main(self.browser_args), 1)


class CandidateEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="candidate-evidence-fixture-"
        )
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.contract = fixture(self.root)
        source = self.root / "capture"
        source.mkdir()
        self.capture = ReplayFixture(source, synthetic=False)
        self.evidence = self.root / "proof"
        self.index = candidate_fixture(self.root, self.evidence, self.capture)
        handle = patch.object(
            day21, "check_review", return_value=(self.contract, SOURCE)
        )
        handle.start()
        self.addCleanup(handle.stop)

    def audit(self) -> dict[str, Any]:
        return cast(
            dict[str, Any], day21.evidence_audit(self.evidence, NOW, root=self.root)
        )

    def test_complete_fixture_revalidates_all_raw_receipts_and_replay(self) -> None:
        self.assertEqual(self.audit()["state"], "PASS")
        result = day21.validate_index(self.root, self.index, SHA, SOURCE, NOW)
        self.assertEqual(result["state"], "PASS")
        replay = result["items"]["demo-replay.json"]["value"]
        self.assertGreater(len(replay["captured_files"]), 9)
        self.assertEqual(replay["candidate_sha"], SHA)

    def test_arbitrary_eighteen_pass_strings_are_not_acceptance(self) -> None:
        path = self.evidence / "acceptance-summary.json"
        summary = json.loads(path.read_text())
        summary["profiles"] = {str(index): "PASS" for index in range(18)}
        write_json(path, summary)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")

    def test_newer_failed_run_invalidates_old_passing_summary(self) -> None:
        path = self.evidence / "acceptance/source_node.json"
        later = json.loads(path.read_text())
        later.update(status="FAIL", exit_code=1, finished_at=NOW.isoformat())
        write_json(path.parent / "later-failure.json", later)
        self.assertEqual(
            self.audit()["items"]["acceptance-summary.json"]["state"], "HOLD"
        )

    def test_check_log_counts_runtime_artifact_and_candidate_are_rechecked(
        self,
    ) -> None:
        path = self.evidence / "acceptance/native_workspace-package.json"
        original = json.loads(path.read_text())
        summary_path = self.evidence / "acceptance-summary.json"
        summary = json.loads(summary_path.read_text())
        for changes in (
            {"counts": {"tests": 0, "failures": 0, "skipped": 0}},
            {"runtime_observed": "1.2.3"},
            {"candidate_sha": "0" * 40},
            {"candidate_clean": False},
            {"candidate_unchanged": False},
            {"source_sha256": "0" * 64},
            {"argv": ["invented"]},
        ):
            with self.subTest(changes=changes):
                write_json(path, {**original, **changes})
                summary["evidence"]["native_workspace:package"]["receipt"]["sha256"] = (
                    day21.file_digest(path)
                )
                write_json(summary_path, summary)
                self.assertEqual(
                    self.audit()["items"][summary_path.name]["state"], "HOLD"
                )
        write_json(path, original)
        summary["evidence"]["native_workspace:package"]["receipt"]["sha256"] = (
            day21.file_digest(path)
        )
        write_json(summary_path, summary)
        (self.root / "dist/apps/web/index.html").write_text("changed build")
        self.assertEqual(self.audit()["items"][summary_path.name]["state"], "HOLD")

    def test_summary_without_raw_replay_or_altered_raw_chain_cannot_pass(self) -> None:
        path = self.evidence / "demo-replay.json"
        value = json.loads(path.read_text())
        del value["capture"]
        write_json(path, value)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")
        self.index.unlink()
        candidate_fixture(self.root, self.evidence, self.capture)
        (self.evidence / "replay/result.txt").write_text("changed after capture")
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")

    def test_public_response_bytes_and_browser_order_console_are_required(self) -> None:
        browser = self.evidence / "browser-journey.json"
        original = json.loads(browser.read_text())
        changes: tuple[Callable[[dict[str, Any]], object], ...] = (
            lambda data: data.update(console_error_count=1),
            lambda data: data["steps"].reverse(),
            lambda data: data["steps"][0].update(screenshots=[]),
            lambda data: data.pop("console"),
            lambda data: data.update(started_at=(NOW - timedelta(days=3)).isoformat()),
        )
        for change in changes:
            data = copy.deepcopy(original)
            change(data)
            write_json(browser, data)
            self.assertEqual(self.audit()["items"][browser.name]["state"], "HOLD")
        write_json(browser, original)
        (self.evidence / "page.html").write_text("different response")
        self.assertEqual(self.audit()["items"]["public-url.json"]["state"], "HOLD")

    def test_product_proofs_and_candidate_artifact_continuity_are_required(
        self,
    ) -> None:
        path = self.evidence / "hostinger-products.json"
        original = json.loads(path.read_text())
        data = copy.deepcopy(original)
        data["products"][1]["evidence"] = data["products"][0]["evidence"]
        write_json(path, data)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")
        for field, value in (
            ("candidate_sha", "0" * 40),
            ("artifact_tree_sha256", "0" * 64),
            ("source_sha256", "0" * 64),
        ):
            write_json(path, {**original, field: value})
            report = self.audit()
            self.assertEqual(report["items"]["candidate_continuity"]["state"], "HOLD")
            self.assertEqual(report["state"], "HOLD")

    def test_index_digest_path_escape_duplicate_json_and_symlinks_fail_closed(
        self,
    ) -> None:
        path = self.evidence / "architecture.json"
        path.write_text(path.read_text() + " ")
        with self.assertRaisesRegex(day21.Day21Error, "hash mismatch"):
            day21.validate_index(self.root, self.index, SHA, SOURCE, NOW)
        for name in ("../outside", "a/../b", "/absolute", "a\\b"):
            with self.assertRaises(day21.Day21Error):
                day21.contained(self.evidence, name)
        link = self.evidence / "link.txt"
        link.symlink_to(self.evidence / "page.html")
        with self.assertRaises(day21.Day21Error):
            day21.contained(self.evidence, link.name)
        path.write_text('{"duplicate":1,"duplicate":2}')
        with self.assertRaises(day21.Day21Error):
            day21.strict_json(path)

    def test_acceptance_export_preserves_failure_history_and_refuses_overwrite(
        self,
    ) -> None:
        with patch.object(day21, "candidate_binding", return_value=(SHA, True)):
            exported = day21.export_acceptance(
                self.root,
                self.evidence / "acceptance",
                self.root / "export",
                SHA,
                now=NOW,
            )
            self.assertEqual(json.loads(exported.read_text())["state"], "PASS")
            with self.assertRaises(day21.Day21Error):
                day21.export_acceptance(
                    self.root, self.evidence / "acceptance", self.root / "export", SHA
                )
            failed = json.loads(
                (self.evidence / "acceptance/source_node.json").read_text()
            )
            failed.update(status="FAIL", finished_at=NOW.isoformat())
            write_json(self.evidence / "acceptance/later-fail.json", failed)
            exported = day21.export_acceptance(
                self.root,
                self.evidence / "acceptance",
                self.root / "failure-export",
                SHA,
                now=NOW,
            )
            self.assertEqual(json.loads(exported.read_text())["state"], "HOLD")
            self.assertTrue((exported.parent / "acceptance/source_node.json").is_file())
            self.assertTrue((exported.parent / "acceptance/later-fail.json").is_file())
        with patch.object(day21, "candidate_binding", return_value=(SHA, False)):
            with self.assertRaises(day21.Day21Error):
                day21.export_acceptance(
                    self.root, self.evidence / "acceptance", self.root / "dirty", SHA
                )

    def test_bundle_preserves_relative_raw_evidence_and_remains_owner_review_only(
        self,
    ) -> None:
        for name in day21.REQUIRED_REPO_PATHS:
            path = self.root / name
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("Synthetic repository fixture\n")
        for name, contents in {
            "apps/web/src/pages/HostingerChallengePage.jsx": "Synthetic page",
            "apps/web/src/App.jsx": "HostingerChallengePage",
            "apps/web/src/lib/publicPages.js": "const SITE_ORIGIN = 'https://demo.example.org'; const path = '/hostinger-challenge';",
            ".gitlab/ci/day21-submission.yml": "Synthetic lane",
            "README.md": "**Live site:** https://demo.example.org\n",
        }.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents)
        output = self.root / "bundle"
        args = dict(
            title="Synthetic entry",
            target_audience="Fixture users",
            problem="Fixture problem",
            solution="Fixture solution",
            pitch="Fixture pitch",
            now=NOW,
        )
        result = day21.compile_bundle(self.root, self.evidence, output, **args)
        self.assertEqual(result["submission_state"], "READY_FOR_OWNER_REVIEW")
        self.assertEqual(result["authority_effect"], "NONE")
        self.assertTrue((output / "evidence/replay/result.txt").is_file())
        self.assertTrue((output / "evidence/artifacts/reports/junit/web.xml").is_file())
        self.assertEqual(
            day21.evidence_audit(output / "evidence", NOW, root=self.root)["state"],
            "PASS",
        )
        index = json.loads((output / "BUNDLE_INDEX.json").read_text())
        for item in index["files"]:
            self.assertEqual(item["sha256"], day21.file_digest(output / item["path"]))
        with self.assertRaises(day21.Day21Error):
            day21.compile_bundle(self.root, self.evidence, output, **args)

    def test_cli_drafts_are_unmeasured_and_missing_evidence_is_hold(self) -> None:
        output = io.StringIO()
        path = self.root / "draft"
        with redirect_stdout(output), redirect_stderr(io.StringIO()):
            self.assertEqual(
                day21.main(
                    ["templates", "--root", str(self.root), "--evidence", str(path)]
                ),
                0,
            )
            self.assertEqual(
                day21.main(
                    [
                        "audit",
                        "--root",
                        str(self.root),
                        "--evidence",
                        str(path),
                        "--json",
                    ]
                ),
                1,
            )
            self.assertEqual(day21.main(["acceptance", "--root", str(self.root)]), 1)
            self.assertEqual(day21.main(["index", "--evidence", str(self.evidence)]), 1)
        self.assertEqual(
            json.loads((path / "acceptance-summary.json").read_text())["state"],
            "UNMEASURED",
        )
        self.assertIn('"official_rules"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
