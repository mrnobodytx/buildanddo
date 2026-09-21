# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_day21_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/day21_submission.py, tests/upgrade/test_hostinger_replay.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/day21_submission.py; CONSUMES tests/upgrade/test_hostinger_replay.py
# Intent:      Isolate synthetic candidate evidence used to exercise closure contracts from operational acceptance.
# ───────────────────────────────────────────────────────────────

"""Create explicitly synthetic receipts; these never establish real acceptance."""

from __future__ import annotations

from datetime import timedelta
import hashlib
from pathlib import Path
import shutil

from scripts.ci import day21_submission as day21, hostinger_checks as checks
from tests.upgrade.test_hostinger_readiness import write_json
from tests.upgrade.test_hostinger_replay import (
    ARTIFACT,
    NOW,
    SHA,
    SOURCE,
    ReplayFixture,
)


def candidate_fixture(root: Path, evidence: Path, capture: ReplayFixture) -> Path:
    """Write complete synthetic process, browser, product and raw replay evidence."""
    evidence.mkdir(parents=True, exist_ok=True)
    declarations = {
        "apps/pocketbase/.pocketbase-version": "0.39.8\n",
        "docker-compose.yml": "version: ${POCKETBASE_VERSION:-0.28.4}\n",
        "reports/junit/web.xml": "<testsuites><testsuite><testcase name='synthetic fixture'/></testsuite></testsuites>",
        "dist/apps/web/index.html": "Synthetic build artifact\n",
    }
    for name, value in declarations.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
    started, finished = NOW - timedelta(minutes=2), NOW - timedelta(minutes=1)
    identity = {
        "candidate_sha": SHA,
        "source_sha256": SOURCE,
        "artifact_tree_sha256": ARTIFACT,
    }

    def ref(name: str) -> dict[str, str]:
        return {
            "path": name,
            "sha256": hashlib.sha256((evidence / name).read_bytes()).hexdigest(),
            "observed_at": NOW.isoformat(),
        }

    references = {}
    for name, check in checks.CHECKS.items():
        for profile in (
            ("package", "compose") if check.level == "native" else ("package",)
        ):
            key = name + ":" + profile if check.level == "native" else name
            stem = key.replace(":", "-")
            log = {
                "tap": "# tests 1\n# fail 0\n# skipped 0\n",
                "unittest": "Ran 1 test in 0.01s\nOK\n",
            }.get(check.test_format, "Synthetic process fixture\n")
            directory = evidence / "acceptance"
            directory.mkdir(exist_ok=True)
            (directory / (stem + ".log")).write_text(log)
            version = (
                checks.runtime_version(root, profile) if check.level == "native" else ""
            )
            receipt = {
                "schema_version": "buildanddo.acceptance/v1",
                "check": name,
                "level": check.level,
                "profile": profile,
                "runtime_expected": version,
                "runtime_observed": version,
                "source_sha256": SOURCE,
                "candidate_sha": SHA,
                "candidate_clean": True,
                "candidate_unchanged": True,
                "started_at": started.isoformat(),
                "finished_at": finished.isoformat(),
                "status": "PASS",
                "reason": "Synthetic fixture",
                "exit_code": 0,
                "argv": checks.command(root, check),
                "counts": {
                    "tests": 1 if check.test_format else 0,
                    "failures": 0,
                    "skipped": 0,
                },
                "log": stem + ".log",
                "log_sha256": hashlib.sha256(log.encode()).hexdigest(),
                "artifacts": {
                    path: day21.file_digest(root / path) for path in check.artifacts
                },
            }
            write_json(directory / (stem + ".json"), receipt)
            references[key] = {
                "receipt": ref("acceptance/" + stem + ".json"),
                "log": ref("acceptance/" + stem + ".log"),
            }
    artifacts = {}
    for name in ("reports/junit/web.xml", "dist/apps/web/index.html"):
        destination = evidence / "artifacts" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, destination)
        artifacts[name] = ref("artifacts/" + name)
    write_json(
        evidence / "acceptance-summary.json",
        {
            "schema": "buildanddo.day21-acceptance-summary/v1",
            "candidate_sha": SHA,
            "source_sha256": SOURCE,
            "observed_at": NOW.isoformat(),
            "state": "PASS",
            "expected_profiles": len(references),
            "profiles": dict.fromkeys(references, "PASS"),
            "evidence": references,
            "artifacts": artifacts,
        },
    )
    (evidence / "page.html").write_text("Synthetic observed page fixture\n")
    write_json(
        evidence / "public-url.json",
        {
            "schema": "buildanddo.day21-public-url/v1",
            **identity,
            "url": "https://demo.example.org",
            "status_code": 200,
            "observed_at": NOW.isoformat(),
            "body": ref("page.html"),
            "body_sha256": ref("page.html")["sha256"],
        },
    )
    products = []
    for key in day21.REQUIRED_PRODUCTS:
        (evidence / (key + ".txt")).write_text(
            "Synthetic separate product fixture: " + key
        )
        products.append(
            {
                "id": key,
                "meaningful_use": "Synthetic observed use of " + key,
                "evidence": [ref(key + ".txt")],
            }
        )
    write_json(
        evidence / "hostinger-products.json",
        {
            "schema": "buildanddo.day21-hostinger-products/v1",
            **identity,
            "products": products,
        },
    )
    steps = []
    for kind in (
        "public_entry",
        "auth",
        "challenge",
        "mission",
        "evidence",
        "operator_readback",
    ):
        (evidence / (kind + ".png")).write_bytes(
            b"Synthetic screenshot fixture: " + kind.encode()
        )
        steps.append(
            {"kind": kind, "state": "PASS", "screenshots": [ref(kind + ".png")]}
        )
    (evidence / "console.log").write_text("Synthetic zero-error browser log\n")
    write_json(
        evidence / "browser-journey.json",
        {
            "schema": "buildanddo.day21-browser-journey/v1",
            **identity,
            "url": "https://demo.example.org",
            "started_at": started.isoformat(),
            "finished_at": NOW.isoformat(),
            "console_error_count": 0,
            "console": ref("console.log"),
            "steps": steps,
        },
    )
    result = capture.validate()
    replay_root = evidence / "replay"
    replay_root.mkdir(exist_ok=True)
    names = {"capture.json", capture.capture["action_output"]["path"]}
    names.update(value["path"] for value in capture.capture["records"].values())
    for category in ("release_receipts", "gitlab_exports", "datadog_exports"):
        names.update(value["path"] for value in capture.capture[category])
    for name in names:
        output = replay_root / name
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(capture.root / name, output)
    write_json(
        evidence / "demo-replay.json",
        {**result, **identity, "capture": ref("replay/capture.json")},
    )
    for name, schema in (
        ("architecture", "architecture"),
        ("build-journey", "build-journey"),
    ):
        (evidence / (name + ".txt")).write_text("Synthetic retained " + name)
        write_json(
            evidence / (name + ".json"),
            {
                "schema": "buildanddo.day21-" + schema + "/v1",
                "title": name,
                "evidence": [ref(name + ".txt")],
            },
        )
    return day21.index_evidence(evidence, now=NOW)
