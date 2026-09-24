#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/day21_submission.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Depends:     scripts/ci/hostinger_readiness.py, scripts/ci/hostinger_replay.py, scripts/ci/hostinger_checks.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/hostinger_readiness.py; CONSUMES scripts/ci/hostinger_replay.py; CONSUMES scripts/ci/hostinger_checks.py
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""BuildAndDo Day-21 submission closure auditor and evidence-bundle compiler.

This tool does not deploy, submit, publish, or infer success. It converts explicit
repository state and operator-captured evidence into a deterministic submission
readiness report and judge-facing bundle.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci.hostinger_checks import CHECKS, candidate_binding  # noqa: E402
from scripts.ci.hostinger_readiness import (  # noqa: E402
    MAX_AGE,
    ReadinessError,
    acceptance_state,
    check_review,
)
from scripts.ci.hostinger_replay import validate_capture  # noqa: E402

SCHEMA = "buildanddo.day21-submission/v1"
CAMPAIGN = "hostinger-21-day-startup-challenge-2026"
PUBLIC_REPOSITORY = "https://github.com/mrnobodytx/buildanddo"
REQUIRED_PRODUCTS = {
    "unlimited_web_hosting": "Unlimited Web Hosting",
    "hostinger_agents": "Hostinger Agents",
    "ai_builder": "Hostinger AI Builder",
    "vps_kvm1": "VPS KVM 1",
}
RUBRIC = {
    "product_user_experience": 25,
    "business_idea": 20,
    "business_potential": 20,
    "hostinger_product_usage": 20,
    "creativity_innovation": 15,
}
REQUIRED_REPO_PATHS = (
    ".bits/hostinger-readiness.json",
    "docs/hostinger-sprint-closure.md",
    "scripts/ci/hostinger_readiness.py",
    "scripts/ci/hostinger_replay.py",
    "apps/web/src/pages/HomePage.jsx",
    "apps/web/src/pages/SignupPage.jsx",
    ".gitlab-ci.yml",
)
REQUIRED_EVIDENCE = (
    "acceptance-summary.json",
    "public-url.json",
    "hostinger-products.json",
    "browser-journey.json",
    "demo-replay.json",
    "architecture.json",
    "build-journey.json",
)
OPTIONAL_EVIDENCE = ("demo-video.json", "cover-image.json", "social-proof.json")


class Day21Error(ValueError):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode()


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def utc(value: object) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise Day21Error("timestamp must be a nonempty UTC string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Day21Error("invalid timestamp") from exc
    if parsed.tzinfo is None:
        raise Day21Error("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def strict_json(path: Path, max_bytes: int = 4_000_000) -> dict[str, Any]:
    if path.is_symlink():
        raise Day21Error("evidence cannot follow a symlink")
    with path.open("rb") as stream:
        raw = stream.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise Day21Error(f"evidence too large: {path.name}")
    seen: set[str] = set()

    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in items:
            if key in out:
                raise Day21Error(f"duplicate JSON key in {path.name}: {key}")
            out[key] = value
            seen.add(key)
        return out

    try:
        value = json.loads(
            raw,
            object_pairs_hook=pairs,
            parse_constant=lambda _: (_ for _ in ()).throw(
                Day21Error("non-finite JSON")
            ),
        )
    except (json.JSONDecodeError, RecursionError) as exc:
        raise Day21Error(f"invalid JSON: {path.name}") from exc
    if not isinstance(value, dict):
        raise Day21Error(f"expected object: {path.name}")
    return value


def contained(root: Path, rel: object, *, must_exist: bool = True) -> Path:
    if not isinstance(rel, str) or not rel or "\\" in rel or Path(rel).is_absolute():
        raise Day21Error("evidence path must be a relative POSIX path")
    if any(part in ("", ".", "..") for part in rel.split("/")):
        raise Day21Error("evidence path escapes its root")
    path = root
    if root.is_symlink():
        raise Day21Error("evidence root cannot be a symlink")
    for part in rel.split("/"):
        path /= part
        if path.is_symlink():
            raise Day21Error("evidence cannot follow a symlink")
    path = path.resolve()
    if not path.is_relative_to(root.resolve()):
        raise Day21Error("evidence path escapes its root")
    if must_exist and not path.is_file():
        raise Day21Error(f"evidence file missing: {rel}")
    return path


def validate_ref(root: Path, ref: object, now: datetime) -> dict[str, str]:
    if not isinstance(ref, dict) or set(ref) != {"path", "sha256", "observed_at"}:
        raise Day21Error("evidence ref must contain path, sha256 and observed_at")
    path = contained(root, ref["path"])
    actual = file_digest(path)
    if actual != ref["sha256"]:
        raise Day21Error(f"evidence hash mismatch: {ref['path']}")
    observed = utc(ref["observed_at"])
    if observed > now:
        raise Day21Error("evidence cannot be observed in the future")
    return {
        "path": str(ref["path"]),
        "sha256": actual,
        "observed_at": observed.isoformat(),
    }


def required_profiles() -> set[str]:
    """Use the actual reviewed acceptance commands and both declared native profiles."""
    return {
        name + ":" + profile if check.level == "native" else name
        for name, check in CHECKS.items()
        for profile in (
            ("package", "compose") if check.level == "native" else ("package",)
        )
    }


def candidate_fields(data: dict[str, Any], *, artifact: bool = True) -> dict[str, str]:
    """Require exact source and release identities on every candidate observation."""
    fields = {"candidate_sha": 40, "source_sha256": 64}
    if artifact:
        fields["artifact_tree_sha256"] = 64
    result = {}
    for name, length in fields.items():
        value = data.get(name)
        if not isinstance(value, str) or not re.fullmatch(
            r"[a-f0-9]{" + str(length) + "}", value
        ):
            raise Day21Error(f"{name} must be a complete content identity")
        result[name] = value
    return result


def export_acceptance(
    root: Path,
    receipts: Path,
    evidence: Path,
    candidate: str,
    *,
    now: datetime | None = None,
) -> Path:
    """Copy observed check history and summarize it without upgrading any result."""
    if candidate_binding(root) != (candidate, True):
        raise Day21Error(
            "acceptance export requires the selected exact committed candidate"
        )
    _, source = check_review(root)
    now = now or datetime.now(timezone.utc)
    states = acceptance_state(root, receipts, source, now, candidate)
    destination = evidence / "acceptance"
    target = evidence / "acceptance-summary.json"
    if (
        destination.exists()
        or destination.is_symlink()
        or target.exists()
        or target.is_symlink()
    ):
        raise Day21Error("acceptance evidence already exists; select a new directory")
    documents = {}
    files: dict[str, Path] = {}
    latest: dict[str, tuple[datetime, str]] = {}
    for path in sorted(receipts.glob("*.json")):
        document = strict_json(contained(receipts, path.name))
        name = document["check"]
        key = (
            name + ":" + document["profile"] if CHECKS[name].level == "native" else name
        )
        finished = utc(document["finished_at"])
        if key not in latest or finished >= latest[key][0]:
            latest[key] = (finished, path.name)
        documents[path.name] = document
        files[path.name] = path
        log = contained(receipts, document["log"])
        files[document["log"]] = log
    evidence.mkdir(parents=True, exist_ok=True)
    destination.mkdir()
    for name, path in files.items():
        output = contained(destination, name, must_exist=False)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("xb") as stream:
            stream.write(path.read_bytes())
    references = {}
    for key, (finished, name) in latest.items():
        document = documents[name]
        references[key] = {
            kind: {
                "path": "acceptance/" + filename,
                "sha256": file_digest(destination / filename),
                "observed_at": finished.isoformat(),
            }
            for kind, filename in (("receipt", name), ("log", document["log"]))
        }
    artifacts = {}
    for name in sorted({name for check in CHECKS.values() for name in check.artifacts}):
        path = contained(root, name, must_exist=False)
        if path.is_file():
            target_path = contained(evidence, "artifacts/" + name, must_exist=False)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with target_path.open("xb") as stream:
                stream.write(path.read_bytes())
            artifacts[name] = {
                "path": "artifacts/" + name,
                "sha256": file_digest(target_path),
                "observed_at": now.isoformat(),
            }
    profiles = {
        name: states.get(name, "UNMEASURED") for name in sorted(required_profiles())
    }
    summary = {
        "schema": "buildanddo.day21-acceptance-summary/v1",
        "candidate_sha": candidate,
        "source_sha256": source,
        "observed_at": now.isoformat(),
        "expected_profiles": len(profiles),
        "state": "PASS"
        if all(value == "PASS" for value in profiles.values())
        else "HOLD",
        "profiles": profiles,
        "evidence": references,
        "artifacts": artifacts,
    }
    with target.open("x") as stream:
        json.dump(summary, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return target


def index_evidence(evidence: Path, *, now: datetime | None = None) -> Path:
    """Pin the complete captured proof documents for the final submission auditor."""
    at = now or datetime.now(timezone.utc)
    acceptance = strict_json(contained(evidence, "acceptance-summary.json"))
    identity = candidate_fields(acceptance, artifact=False)
    refs = {
        name: {
            "path": name,
            "sha256": file_digest(contained(evidence, name)),
            "observed_at": at.isoformat(),
        }
        for name in REQUIRED_EVIDENCE
    }
    target = evidence / "candidate-evidence.json"
    if target.exists() or target.is_symlink():
        raise Day21Error("candidate evidence index already exists")
    with target.open("x") as stream:
        json.dump(
            {
                "schema_version": "buildanddo.candidate-evidence/v1",
                **identity,
                "files": refs,
            },
            stream,
            indent=2,
            sort_keys=True,
        )
        stream.write("\n")
    return target


def validate_index(
    root: Path, path: Path, candidate: str, source: str, now: datetime
) -> dict[str, Any]:
    """Recheck pinned source, browser, product and replay evidence as one candidate."""
    document = strict_json(path)
    if document.get(
        "schema_version"
    ) != "buildanddo.candidate-evidence/v1" or candidate_fields(
        document, artifact=False
    ) != {"candidate_sha": candidate, "source_sha256": source}:
        raise Day21Error("candidate evidence index names another source revision")
    files = document.get("files")
    if not isinstance(files, dict) or set(files) != set(REQUIRED_EVIDENCE):
        raise Day21Error("candidate index must pin every required proof document")
    for name, ref in files.items():
        value = validate_ref(path.parent, ref, now)
        if value["path"] != name:
            raise Day21Error("candidate evidence file does not match its declared role")
    report = evidence_audit(path.parent, now, root=root)
    if report["state"] != "PASS":
        reasons = [
            name + ": " + str(row.get("reason", row["state"]))
            for name, row in report["items"].items()
            if row["state"] not in ("PASS", "OPTIONAL")
        ]
        raise Day21Error("candidate proof remains HOLD: " + "; ".join(reasons))
    accepted = report["items"]["acceptance-summary.json"]["value"]
    if accepted["candidate_sha"] != candidate or accepted["source_sha256"] != source:
        raise Day21Error("candidate index differs from captured acceptance")
    return report


def _require_text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Day21Error(f"{field} must be nonempty")
    return value.strip()


def _https_url(value: object, field: str) -> str:
    url = _require_text(value, field)
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
    ):
        raise Day21Error(f"{field} must be a public https URL")
    return url.rstrip("/")


def validate_acceptance(
    evidence: Path, now: datetime, *, root: Path = ROOT
) -> dict[str, Any]:
    data = strict_json(evidence / "acceptance-summary.json")
    if data.get("schema") != "buildanddo.day21-acceptance-summary/v1":
        raise Day21Error("unsupported acceptance summary schema")
    observed = utc(data.get("observed_at"))
    if not now - MAX_AGE <= observed <= now:
        raise Day21Error("acceptance summary is stale or observed in the future")
    if data.get("state") != "PASS":
        raise Day21Error("all 18 required acceptance profiles must PASS")
    required = required_profiles()
    if data.get("expected_profiles") != len(required):
        raise Day21Error("acceptance summary must cover every required profile")
    profiles = data.get("profiles")
    if (
        not isinstance(profiles, dict)
        or set(profiles) != required
        or any(value != "PASS" for value in profiles.values())
    ):
        raise Day21Error("acceptance profile set is incomplete or non-PASS")
    raw_evidence = data.get("evidence")
    if not isinstance(raw_evidence, dict) or set(raw_evidence) != set(profiles):
        raise Day21Error(
            "acceptance summary must bind receipt/log evidence for every profile"
        )
    verified_evidence = {}
    identity = candidate_fields(data, artifact=False)
    _, source = check_review(root)
    if identity["source_sha256"] != source:
        raise Day21Error("acceptance differs from the current reviewed source")
    receipt_directories = set()
    for key, refs in raw_evidence.items():
        if not isinstance(refs, dict) or set(refs) != {"receipt", "log"}:
            raise Day21Error("each acceptance profile needs receipt and log refs")
        pair = {name: validate_ref(evidence, ref, now) for name, ref in refs.items()}
        receipt_path = contained(evidence, pair["receipt"]["path"])
        receipt = strict_json(receipt_path)
        name = receipt.get("check")
        if not isinstance(name, str) or name not in CHECKS:
            raise Day21Error("unknown acceptance receipt check")
        actual_key = (
            name + ":" + str(receipt.get("profile"))
            if CHECKS[name].level == "native"
            else name
        )
        if actual_key != key or receipt.get("status") != "PASS":
            raise Day21Error(
                "acceptance summary references a different or nonpassing check"
            )
        if contained(evidence, pair["log"]["path"]) != contained(
            receipt_path.parent, receipt.get("log")
        ):
            raise Day21Error("acceptance log is not the receipt's actual log")
        if utc(receipt.get("finished_at")) > observed:
            raise Day21Error("summary predates an acceptance result")
        receipt_directories.add(receipt_path.parent)
        verified_evidence[key] = pair
    if len(receipt_directories) != 1:
        raise Day21Error("acceptance must retain one complete receipt history")
    states = acceptance_state(
        root, receipt_directories.pop(), source, now, identity["candidate_sha"]
    )
    if any(states.get(key) != "PASS" for key in required):
        raise Day21Error(
            "actual acceptance receipts are incomplete, stale, altered or nonpassing"
        )
    artifacts = data.get("artifacts")
    required_artifacts = {name for check in CHECKS.values() for name in check.artifacts}
    if not isinstance(artifacts, dict) or set(artifacts) != required_artifacts:
        raise Day21Error("acceptance must retain the actual JUnit and build artifacts")
    verified_artifacts = {}
    for name, ref in artifacts.items():
        valid = validate_ref(evidence, ref, now)
        if valid["sha256"] != file_digest(contained(root, name)):
            raise Day21Error(
                "retained acceptance artifact differs from reviewed build output"
            )
        verified_artifacts[name] = valid
    return {
        "state": "PASS",
        **identity,
        "observed_at": observed.isoformat(),
        "profiles": profiles,
        "evidence": verified_evidence,
        "artifacts": verified_artifacts,
    }


def validate_public_url(evidence: Path, now: datetime) -> dict[str, Any]:
    data = strict_json(evidence / "public-url.json")
    if data.get("schema") != "buildanddo.day21-public-url/v1":
        raise Day21Error("unsupported public URL evidence schema")
    url = _https_url(data.get("url"), "url")
    status = data.get("status_code")
    if type(status) is not int or status < 200 or status >= 400:
        raise Day21Error("public URL must have an observed successful HTTP status")
    observed = utc(data.get("observed_at"))
    if not now - MAX_AGE <= observed <= now:
        raise Day21Error("public URL observation is stale or in the future")
    if not re.fullmatch(r"[0-9a-f]{64}", str(data.get("body_sha256", ""))):
        raise Day21Error("public URL evidence requires a response body SHA-256")
    body = validate_ref(evidence, data.get("body"), now)
    if body["sha256"] != data["body_sha256"] or utc(body["observed_at"]) != observed:
        raise Day21Error(
            "public URL evidence must retain its exact observed response body"
        )
    return {
        **candidate_fields(data),
        "url": url,
        "status_code": status,
        "observed_at": observed.isoformat(),
        "body_sha256": data["body_sha256"],
        "body": body,
    }


def validate_products(evidence: Path, now: datetime) -> dict[str, Any]:
    data = strict_json(evidence / "hostinger-products.json")
    if data.get("schema") != "buildanddo.day21-hostinger-products/v1":
        raise Day21Error("unsupported Hostinger product evidence schema")
    raw = data.get("products")
    if not isinstance(raw, list):
        raise Day21Error("products must be a list")
    identity = candidate_fields(data)
    by_id: dict[str, dict[str, Any]] = {}
    used: set[str] = set()
    for value in raw:
        if not isinstance(value, dict):
            raise Day21Error("invalid Hostinger product record")
        product_id = _require_text(value.get("id"), "product id")
        if product_id in by_id:
            raise Day21Error("duplicate Hostinger product evidence")
        if product_id not in REQUIRED_PRODUCTS:
            raise Day21Error(f"unknown Hostinger challenge product: {product_id}")
        use = _require_text(value.get("meaningful_use"), "meaningful_use")
        refs = value.get("evidence")
        if not isinstance(refs, list) or not refs:
            raise Day21Error(f"{product_id} has no evidence refs")
        verified = [validate_ref(evidence, ref, now) for ref in refs]
        checksums = {ref["sha256"] for ref in verified}
        if used & checksums:
            raise Day21Error("each product needs separately observed proof")
        used.update(checksums)
        by_id[product_id] = {
            "id": product_id,
            "name": REQUIRED_PRODUCTS[product_id],
            "meaningful_use": use,
            "evidence": verified,
        }
    missing = sorted(set(REQUIRED_PRODUCTS) - set(by_id))
    if missing:
        raise Day21Error("missing Hostinger product proof: " + ", ".join(missing))
    return {
        **identity,
        "products": [by_id[key] for key in REQUIRED_PRODUCTS],
        "complete": True,
    }


def validate_browser(evidence: Path, now: datetime) -> dict[str, Any]:
    data = strict_json(evidence / "browser-journey.json")
    if data.get("schema") != "buildanddo.day21-browser-journey/v1":
        raise Day21Error("unsupported browser evidence schema")
    identity = candidate_fields(data)
    url = _https_url(data.get("url"), "browser url")
    started, finished = utc(data.get("started_at")), utc(data.get("finished_at"))
    if not now - MAX_AGE <= started <= finished <= now:
        raise Day21Error("invalid browser journey times")
    steps = data.get("steps")
    required_order = [
        "public_entry",
        "auth",
        "challenge",
        "mission",
        "evidence",
        "operator_readback",
    ]
    if not isinstance(steps, list) or len(steps) < len(required_order):
        raise Day21Error("browser journey must record all six ordered steps")
    required_kinds = set(required_order)
    recorded_order = []
    kinds = set()
    screenshots: list[dict[str, str]] = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            raise Day21Error("invalid browser step")
        kind = _require_text(step.get("kind"), f"step[{index}].kind")
        state = _require_text(step.get("state"), f"step[{index}].state")
        if state not in {"PASS", "HOLD", "FAIL"}:
            raise Day21Error("browser step state must be PASS/HOLD/FAIL")
        kinds.add(kind)
        if kind in required_kinds:
            recorded_order.append(kind)
        refs = step.get("screenshots", [])
        if not isinstance(refs, list):
            raise Day21Error("screenshots must be a list")
        verified_refs = [validate_ref(evidence, ref, now) for ref in refs]
        if any(
            not started <= utc(ref["observed_at"]) <= finished for ref in verified_refs
        ):
            raise Day21Error("browser screenshots must be observed during the journey")
        if kind in required_kinds and not verified_refs:
            raise Day21Error(
                f"required browser step has no screenshot evidence: {kind}"
            )
        screenshots.extend(verified_refs)
    missing = sorted(required_kinds - kinds)
    if missing:
        raise Day21Error(
            "browser journey missing required step kinds: " + ", ".join(missing)
        )
    if any(step.get("state") != "PASS" for step in steps if isinstance(step, dict)):
        raise Day21Error("browser journey contains non-PASS required steps")
    if not screenshots:
        raise Day21Error("browser journey needs screenshot evidence")
    if recorded_order != required_order:
        raise Day21Error("browser steps are duplicated or out of order")
    console_errors = data.get("console_error_count")
    if type(console_errors) is not int or console_errors != 0:
        raise Day21Error("browser journey must record zero console errors")
    console = validate_ref(evidence, data.get("console"), now)
    if not started <= utc(console["observed_at"]) <= finished:
        raise Day21Error("console capture must belong to the recorded journey")
    return {
        **identity,
        "url": url,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "step_count": len(steps),
        "screenshots": screenshots,
        "console": console,
        "console_error_count": console_errors,
    }


def validate_demo_replay(
    evidence: Path, now: datetime, *, root: Path = ROOT
) -> dict[str, Any]:
    data = strict_json(evidence / "demo-replay.json")
    if data.get("status") != "CONSISTENT_CAPTURE" or data.get("synthetic") is not False:
        raise Day21Error("demo replay must be a nonsynthetic CONSISTENT_CAPTURE")
    for field in (
        "candidate_sha",
        "capture_sha256",
        "workspace",
        "mission",
        "dispatch",
        "producer",
        "verifier",
    ):
        _require_text(data.get(field), field)
    if data["producer"] == data["verifier"]:
        raise Day21Error("producer and verifier must be distinct")
    identity = candidate_fields(data)
    _, source = check_review(root)
    if identity["source_sha256"] != source:
        raise Day21Error("replay differs from reviewed source")
    capture_ref = validate_ref(evidence, data.get("capture"), now)
    capture_path = contained(evidence, capture_ref["path"])
    capture = strict_json(capture_path)
    replay = validate_capture(
        capture_path,
        candidate=identity["candidate_sha"],
        source=source,
        workspace=data["workspace"],
        mission=data["mission"],
        dispatch=data["dispatch"],
        now=now,
    )
    if (
        any(
            replay.get(key) != data[key]
            for key in (
                "status",
                "candidate_sha",
                "source_sha256",
                "capture_sha256",
                "workspace",
                "mission",
                "dispatch",
                "producer",
                "verifier",
                "synthetic",
            )
        )
        or capture.get("artifact_tree_sha256") != identity["artifact_tree_sha256"]
    ):
        raise Day21Error("replay summary differs from its actual captured chain")
    nested = []
    references = [
        *capture["records"].values(),
        capture["action_output"],
        *capture["release_receipts"],
        *capture["gitlab_exports"],
        *capture["datadog_exports"],
    ]
    for reference in references:
        valid = validate_ref(capture_path.parent, reference, now)
        valid["path"] = (
            (capture_path.parent / valid["path"])
            .relative_to(evidence.resolve())
            .as_posix()
        )
        nested.append(valid)
    return {**identity, **replay, "capture": capture_ref, "captured_files": nested}


def validate_simple_artifact(
    evidence: Path, filename: str, schema: str, now: datetime
) -> dict[str, Any]:
    data = strict_json(evidence / filename)
    if data.get("schema") != schema:
        raise Day21Error(f"unsupported {filename} schema")
    title = _require_text(data.get("title"), "title")
    refs = data.get("evidence")
    if not isinstance(refs, list) or not refs:
        raise Day21Error(f"{filename} needs evidence refs")
    verified = [validate_ref(evidence, ref, now) for ref in refs]
    return {"title": title, "evidence": verified}


def repository_audit(root: Path) -> dict[str, Any]:
    missing = [name for name in REQUIRED_REPO_PATHS if not (root / name).is_file()]
    page = root / "apps/web/src/pages/HostingerChallengePage.jsx"
    route = root / "apps/web/src/App.jsx"
    public_pages = root / "apps/web/src/lib/publicPages.js"
    gitlab_fragment = root / ".gitlab/ci/day21-submission.yml"
    gaps = []
    if missing:
        gaps.append(
            {
                "id": "canonical_source",
                "state": "BLOCKED",
                "detail": "missing: " + ", ".join(missing),
            }
        )
    if not page.is_file():
        gaps.append(
            {
                "id": "judge_page",
                "state": "MISSING",
                "detail": "public Hostinger challenge page absent",
            }
        )
    if not route.is_file() or "HostingerChallengePage" not in route.read_text(
        encoding="utf-8", errors="replace"
    ):
        gaps.append(
            {
                "id": "judge_route",
                "state": "MISSING",
                "detail": "public challenge route absent",
            }
        )
    if (
        not public_pages.is_file()
        or "/hostinger-challenge"
        not in public_pages.read_text(encoding="utf-8", errors="replace")
    ):
        gaps.append(
            {
                "id": "judge_discovery",
                "state": "MISSING",
                "detail": "challenge page absent from public page catalog",
            }
        )
    if not gitlab_fragment.is_file():
        gaps.append(
            {
                "id": "self_hosted_acceptance",
                "state": "MISSING",
                "detail": "GitLab day-21 acceptance lane absent",
            }
        )
    origins: dict[str, str] = {}
    if public_pages.is_file():
        match = re.search(
            r"SITE_ORIGIN\s*=\s*['\"]([^'\"]+)",
            public_pages.read_text(encoding="utf-8", errors="replace"),
        )
        if match:
            origins["site_origin"] = match.group(1).rstrip("/")
    readme = root / "README.md"
    if readme.is_file():
        match = re.search(
            r"\*\*Live site:\*\*\s*(https://\S+)",
            readme.read_text(encoding="utf-8", errors="replace"),
        )
        if match:
            origins["readme_live_site"] = match.group(1).rstrip("/")
    if len(set(origins.values())) > 1:
        gaps.append(
            {
                "id": "canonical_domain",
                "state": "HOLD",
                "detail": f"public origin mismatch: {origins}",
            }
        )
    return {
        "schema": "buildanddo.day21-repo-audit/v1",
        "missing_required_paths": missing,
        "origins": origins,
        "gaps": gaps,
        "state": "PASS" if not gaps else "HOLD",
    }


def evidence_audit(
    evidence: Path, now: datetime | None = None, *, root: Path = ROOT
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    states: dict[str, dict[str, Any]] = {}
    validators: dict[str, Callable[[], dict[str, Any]]] = {
        "acceptance-summary.json": lambda: validate_acceptance(
            evidence, now, root=root
        ),
        "public-url.json": lambda: validate_public_url(evidence, now),
        "hostinger-products.json": lambda: validate_products(evidence, now),
        "browser-journey.json": lambda: validate_browser(evidence, now),
        "demo-replay.json": lambda: validate_demo_replay(evidence, now, root=root),
        "architecture.json": lambda: validate_simple_artifact(
            evidence, "architecture.json", "buildanddo.day21-architecture/v1", now
        ),
        "build-journey.json": lambda: validate_simple_artifact(
            evidence, "build-journey.json", "buildanddo.day21-build-journey/v1", now
        ),
    }
    for name in REQUIRED_EVIDENCE:
        if not (evidence / name).is_file():
            states[name] = {
                "state": "MISSING",
                "reason": "required evidence file absent",
            }
            continue
        try:
            states[name] = {"state": "PASS", "value": validators[name]()}
        except (OSError, Day21Error, ReadinessError) as exc:
            states[name] = {"state": "HOLD", "reason": str(exc)}
    optional_schemas = {
        "demo-video.json": "buildanddo.day21-demo-video/v1",
        "cover-image.json": "buildanddo.day21-cover-image/v1",
        "social-proof.json": "buildanddo.day21-social-proof/v1",
    }
    for name in OPTIONAL_EVIDENCE:
        if not (evidence / name).is_file():
            states[name] = {"state": "OPTIONAL"}
            continue
        try:
            states[name] = {
                "state": "PASS",
                "value": validate_simple_artifact(
                    evidence, name, optional_schemas[name], now
                ),
            }
        except (OSError, Day21Error, ReadinessError) as exc:
            states[name] = {"state": "HOLD", "reason": str(exc)}
    complete = all(
        states[name]["state"] == "PASS" for name in REQUIRED_EVIDENCE
    ) and not any(states[name]["state"] == "HOLD" for name in OPTIONAL_EVIDENCE)
    if complete:
        values = [states[name]["value"] for name in REQUIRED_EVIDENCE[:5]]
        for field in ("candidate_sha", "source_sha256", "artifact_tree_sha256"):
            if len({value[field] for value in values if field in value}) != 1:
                states["candidate_continuity"] = {
                    "state": "HOLD",
                    "reason": "candidate evidence disagrees on " + field,
                }
                complete = False
        public, browser = (
            states["public-url.json"]["value"],
            states["browser-journey.json"]["value"],
        )
        if urlparse(public["url"]).netloc != urlparse(browser["url"]).netloc:
            states["candidate_continuity"] = {
                "state": "HOLD",
                "reason": "browser and public URL origins disagree",
            }
            complete = False
    return {
        "schema": "buildanddo.day21-evidence-audit/v1",
        "state": "PASS" if complete else "HOLD",
        "items": states,
    }


def rubric_coverage(audit: dict[str, Any]) -> dict[str, Any]:
    passed = {
        name for name, value in audit["items"].items() if value.get("state") == "PASS"
    }
    mapping = {
        "product_user_experience": {
            "acceptance-summary.json",
            "public-url.json",
            "browser-journey.json",
            "demo-replay.json",
        },
        "business_idea": {"public-url.json", "build-journey.json"},
        "business_potential": {
            "public-url.json",
            "architecture.json",
            "build-journey.json",
        },
        "hostinger_product_usage": {"hostinger-products.json"},
        "creativity_innovation": {
            "acceptance-summary.json",
            "architecture.json",
            "demo-replay.json",
            "build-journey.json",
        },
    }
    rows = {}
    weighted = 0.0
    for key, needed in mapping.items():
        fraction = len(needed & passed) / len(needed)
        weighted += RUBRIC[key] * fraction
        rows[key] = {
            "weight": RUBRIC[key],
            "evidence_coverage": round(fraction, 3),
            "required_artifacts": sorted(needed),
            "missing": sorted(needed - passed),
        }
    return {
        "note": "Evidence coverage is not a predicted judge score.",
        "weighted_evidence_coverage": round(weighted, 2),
        "areas": rows,
    }


def _copy_ref_files(
    evidence: Path, bundle: Path, audit: dict[str, Any]
) -> list[dict[str, str]]:
    copied: list[dict[str, str]] = []
    refs: dict[str, str] = {}
    for value in audit["items"].values():
        raw = value.get("value") if isinstance(value, dict) else None
        stack = [raw]
        while stack:
            item = stack.pop()
            if isinstance(item, dict):
                if set(item) >= {"path", "sha256", "observed_at"} and isinstance(
                    item.get("path"), str
                ):
                    if item["path"] in refs and refs[item["path"]] != item["sha256"]:
                        raise Day21Error("conflicting content references in bundle")
                    refs[item["path"]] = item["sha256"]
                stack.extend(item.values())
            elif isinstance(item, list):
                stack.extend(item)
    proof_dir = bundle / "evidence"
    proof_dir.mkdir(parents=True, exist_ok=True)
    for rel in sorted(refs):
        source = contained(evidence, rel)
        target = proof_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if file_digest(target) != refs[rel]:
            raise Day21Error("evidence changed while packaging the bundle")
        copied.append({"path": "evidence/" + rel, "sha256": file_digest(target)})
    for name in (*REQUIRED_EVIDENCE, *OPTIONAL_EVIDENCE):
        source = evidence / name
        if not source.is_file():
            continue
        target = proof_dir / name
        shutil.copy2(source, target)
        copied.append({"path": "evidence/" + name, "sha256": file_digest(target)})
    return copied


def compile_bundle(
    root: Path,
    evidence: Path,
    output: Path,
    *,
    title: str,
    target_audience: str,
    problem: str,
    solution: str,
    pitch: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    at = now or datetime.now(timezone.utc)
    repo = repository_audit(root)
    ev = evidence_audit(evidence, at, root=root)
    if repo["state"] != "PASS":
        raise Day21Error(
            "repository submission audit is not PASS; resolve source/domain gaps first"
        )
    if ev["state"] != "PASS":
        raise Day21Error(
            "required submission evidence is incomplete; run audit for details"
        )
    acceptance = ev["items"]["acceptance-summary.json"]["value"]
    public = ev["items"]["public-url.json"]["value"]
    products = ev["items"]["hostinger-products.json"]["value"]
    browser = ev["items"]["browser-journey.json"]["value"]
    replay = ev["items"]["demo-replay.json"]["value"]
    if (
        replay["candidate_sha"] != browser["candidate_sha"]
        or browser["candidate_sha"] != acceptance["candidate_sha"]
    ):
        raise Day21Error(
            "acceptance, browser journey and demo replay must describe the same candidate SHA"
        )
    canonical_origin = next(iter(repo["origins"].values()), "")
    if canonical_origin:
        public_origin = f"{urlparse(public['url']).scheme}://{urlparse(public['url']).netloc}".rstrip(
            "/"
        )
        if public_origin != canonical_origin:
            raise Day21Error(
                "public URL evidence does not match the repository canonical origin"
            )
    coverage = rubric_coverage(ev)
    if output.exists() and any(output.iterdir()):
        raise Day21Error("output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)
    copied = _copy_ref_files(evidence, output, ev)
    manifest = {
        "schema": SCHEMA,
        "campaign": CAMPAIGN,
        "compiled_at": at.isoformat(),
        "title": _require_text(title, "title"),
        "repository_url": PUBLIC_REPOSITORY,
        "public_url": public["url"],
        "problem": _require_text(problem, "problem"),
        "solution": _require_text(solution, "solution"),
        "pitch": _require_text(pitch, "pitch"),
        "target_audience": _require_text(target_audience, "target_audience"),
        "candidate_sha": browser["candidate_sha"],
        "acceptance": acceptance,
        "demo_replay": replay,
        "hostinger_products": products["products"],
        "rubric_evidence": coverage,
        "repository_audit": repo,
        "evidence_files": copied,
        "submission_state": "READY_FOR_OWNER_REVIEW",
        "authority_effect": "NONE",
        "note": "This compiler prepares evidence. It does not submit to Hostinger or assert a judge score.",
    }
    manifest["manifest_sha256"] = digest(manifest)
    (output / "submission.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    judge = f"""# {manifest["title"]}\n\n## One-line pitch\n\n{manifest["pitch"]}\n\n## Problem\n\n{manifest["problem"]}\n\n## Solution\n\n{manifest["solution"]}\n\n## Target audience\n\n{manifest["target_audience"]}\n\n## Live project\n\n{manifest["public_url"]}\n\n## What the demo proves\n\nThe captured journey is bound to candidate `{manifest["candidate_sha"]}` and a nonsynthetic replay receipt. The submission evidence directory contains the hashed screenshots and proof files used by this bundle.\n\n## Hostinger products\n\n"""
    for product in manifest["hostinger_products"]:
        judge += f"### {product['name']}\n\n{product['meaningful_use']}\n\n"
    judge += "## Verification boundary\n\nPrepared evidence is not self-certification. Runtime receipts, producer/verifier separation, and evidence hashes remain inspectable in `submission.json` and `evidence/`.\n"
    (output / "README_FOR_JUDGES.md").write_text(judge, encoding="utf-8")

    demo = f"""# 90-second demo script\n\n1. **0-15s - Problem:** {manifest["problem"]}\n2. **15-30s - Product:** Open {manifest["public_url"]} and show the challenge desk.\n3. **30-50s - Bounded work:** Submit one real project or question and open the resulting mission with its scope and approval state.\n4. **50-70s - Proof:** Show the distinct action receipt and independent verification in the Evidence Ledger / Operator readback.\n5. **70-85s - Learning:** Show the Daily Edition or correction/provenance surface explaining what changed and what is still uncertain.\n6. **85-90s - Hostinger:** Close with the four Hostinger product roles listed in this bundle.\n\nDo not claim automation, deployment, provider health, or verification unless the corresponding captured receipt is in this exact bundle.\n"""
    (output / "DEMO_SCRIPT.md").write_text(demo, encoding="utf-8")

    matrix = [
        "# Submission evidence matrix",
        "",
        "| Area | Weight | Coverage | Missing |",
        "|---|---:|---:|---|",
    ]
    for key, value in coverage["areas"].items():
        matrix.append(
            f"| {key.replace('_', ' ').title()} | {value['weight']}% | {value['evidence_coverage'] * 100:.0f}% | {', '.join(value['missing']) or '-'} |"
        )
    matrix.extend(
        [
            "",
            f"Weighted evidence coverage: **{coverage['weighted_evidence_coverage']:.1f}%**. This is not a predicted judge score.",
        ]
    )
    (output / "RUBRIC_EVIDENCE.md").write_text(
        "\n".join(matrix) + "\n", encoding="utf-8"
    )

    tevv = f"""# TEVV submission summary

## Test

The final candidate `{manifest["candidate_sha"]}` is bound to an 18-profile acceptance summary in which every required source/rendered/build/native profile is PASS.

## Evaluation

The browser journey captures the public entry, authenticated workspace, challenge, mission, evidence and operator readback with zero recorded console errors and content-hashed screenshots.

## Verification

The demo replay is nonsynthetic, candidate-bound, and records distinct producer and verifier identities.

## Validation

The public HTTPS URL, four Hostinger-product evidence records, architecture snapshot and challenge-period build journey are present and hash-bound. The final competition-form submission still requires human owner review.

## Decision boundary

Bundle state is `READY_FOR_OWNER_REVIEW`; authority effect is `NONE`. This document does not assert a judge score, deployment authority, or completed external submission.
"""
    (output / "TEVV_SUMMARY.md").write_text(tevv, encoding="utf-8")

    technology = """# Technology used

## Product

- React 18 + Vite public/workspace application
- PocketBase auth, migrations, workspace/business records and hooks
- Python and JavaScript verification/CI tooling
- Docker for reproducible local/native acceptance

## Hostinger challenge products

- Unlimited Web Hosting — public discovery/submission surface
- Hostinger Agent — strategy/development assistance, evidenced separately
- Hostinger AI Builder — public application/design iteration, evidenced separately
- VPS KVM 1 — self-hosted backend/automation/observability capability, evidenced separately

## Delivery and evidence

- GitHub public source/provenance
- private GitLab intake/runner and release evidence
- BuildAndDo evidence/replay contracts
- Datadog/PostHog observability surfaces where enabled

This list describes declared technology and challenge roles. Operational availability is established by the separate evidence receipts.
"""
    (output / "TECHNOLOGY.md").write_text(technology, encoding="utf-8")

    reproduce = f"""# Reproduce and inspect

## Public product

Open {manifest["public_url"]} and follow the captured demo path in `DEMO_SCRIPT.md`.

## Public source

Repository: {manifest["repository_url"]}
Candidate: `{manifest["candidate_sha"]}`

## Local source reproduction

```bash
git clone {manifest["repository_url"]}
cd buildanddo
git checkout {manifest["candidate_sha"]}
docker compose up -d
```

Then open `http://localhost:3000`. Local reproduction does not substitute for the public/browser evidence in this bundle.

## Verification commands

```bash
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/day21_submission.py audit --root . --evidence state/day21/evidence --json
```

The full native/browser acceptance requires the dependencies and authorized test credentials described in the repository/runbook.
"""
    (output / "REPRODUCIBLE_DEMO.md").write_text(reproduce, encoding="utf-8")

    optional_rows = [
        f"- {name}: {ev['items'][name]['state']}" for name in OPTIONAL_EVIDENCE
    ]
    checklist = (
        """# Final owner submission checklist

- [ ] Public URL is the intended canonical challenge URL and is accessible without private credentials.
- [ ] Problem, solution, pitch and target audience match the current public product.
- [ ] All four Hostinger products have evidence-backed meaningful use.
- [ ] 18-profile acceptance summary is PASS for the same candidate shown in browser/replay evidence.
- [ ] Browser journey and nonsynthetic replay are inspectable.
- [ ] Architecture and build-journey artifacts are included.
- [ ] Cover/video assets requested by the current Hostinger form are attached if required.
- [ ] The current official Hostinger submission form/rules have been reviewed immediately before submission.
- [ ] Human competition owner authorizes and performs the external submission.

## Optional package assets

"""
        + "\n".join(optional_rows)
        + "\n"
    )
    (output / "SUBMISSION_CHECKLIST.md").write_text(checklist, encoding="utf-8")

    index: dict[str, Any] = {"schema": "buildanddo.day21-bundle-index/v1", "files": []}
    for path in sorted(p for p in output.rglob("*") if p.is_file()):
        rel = path.relative_to(output).as_posix()
        if rel == "BUNDLE_INDEX.json":
            continue
        index["files"].append(
            {"path": rel, "sha256": file_digest(path), "bytes": path.stat().st_size}
        )
    index["root_digest"] = digest(index["files"])
    (output / "BUNDLE_INDEX.json").write_text(
        json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return manifest


def write_templates(evidence: Path) -> None:
    evidence.mkdir(parents=True, exist_ok=True)
    identity = {
        "candidate_sha": "REPLACE",
        "source_sha256": "REPLACE",
        "artifact_tree_sha256": "REPLACE",
    }
    templates = {
        "acceptance-summary.json": {
            "schema": "buildanddo.day21-acceptance-summary/v1",
            "observed_at": "REPLACE",
            "state": "UNMEASURED",
            "candidate_sha": "REPLACE",
            "source_sha256": "REPLACE",
            "expected_profiles": len(required_profiles()),
            "profiles": {},
            "evidence": {},
            "artifacts": {},
        },
        "public-url.json": {
            "schema": "buildanddo.day21-public-url/v1",
            **identity,
            "url": "https://buildanddo.example",
            "status_code": 0,
            "observed_at": "REPLACE",
            "body_sha256": "REPLACE",
            "body": None,
        },
        "hostinger-products.json": {
            "schema": "buildanddo.day21-hostinger-products/v1",
            **identity,
            "products": [
                {
                    "id": key,
                    "meaningful_use": "REPLACE WITH OBSERVED USE",
                    "evidence": [],
                }
                for key in REQUIRED_PRODUCTS
            ],
        },
        "browser-journey.json": {
            "schema": "buildanddo.day21-browser-journey/v1",
            **identity,
            "url": "REPLACE",
            "started_at": "REPLACE",
            "finished_at": "REPLACE",
            "console_error_count": None,
            "console": None,
            "steps": [],
        },
        "demo-replay.json": {
            **identity,
            "status": "UNMEASURED",
            "synthetic": True,
            "capture": None,
        },
        "architecture.json": {
            "schema": "buildanddo.day21-architecture/v1",
            "title": "BuildAndDo architecture",
            "evidence": [],
        },
        "build-journey.json": {
            "schema": "buildanddo.day21-build-journey/v1",
            "title": "21-day build journey",
            "evidence": [],
        },
    }
    for name, value in templates.items():
        target = evidence / name
        if not target.exists():
            target.write_text(
                json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["audit", "templates", "acceptance", "index", "bundle"]
    )
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--evidence", type=Path, default=Path("state/day21/evidence"))
    parser.add_argument("--output", type=Path, default=Path("state/day21/submission"))
    parser.add_argument("--title", default="BuildAndDo")
    # The same four texts as apps/web/src/data/hostingerChallenge.js (and the pitch is purpose.js's summary), so the
    # judge bundle describes the product the public page does; apps/web/src/lib/__tests__/purpose.test.js checks it.
    # One line each, on purpose: purpose.test.js reads these defaults as text, so a formatter must
    # not split them across lines, or that check can no longer read them.
    # fmt: off
    parser.add_argument("--target-audience", default="People who learn best by doing: learners, teams and builders, beginners included, who want to work through a real project together with other people and AI agents, and keep proof of what they built.")
    parser.add_argument("--problem", default="Online learning mostly stops at watching and reading. People rarely work through a real project with guidance and with others, and when they do, little records what they actually built or whether it worked.")
    parser.add_argument("--solution", default="BuildAndDo turns one real question or project into a bounded mission: it keeps the sources, asks for approval before anything runs, records the work, verifies the outcome and keeps the evidence, with classrooms, guilds and AI guildmaster agents to learn alongside.")
    parser.add_argument("--pitch", default="BuildAndDo is a learning platform for building real things together: bring a question or a project, work through it with people and AI, verify what happened, and keep the evidence.")
    # fmt: on
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--acceptance",
        type=Path,
        help="Actual retained check receipts; used by the acceptance exporter.",
    )
    parser.add_argument(
        "--candidate", default="", help="Full selected revision for acceptance export."
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    evidence = args.evidence if args.evidence.is_absolute() else root / args.evidence
    output = args.output if args.output.is_absolute() else root / args.output
    try:
        if args.command == "acceptance":
            if args.acceptance is None:
                raise Day21Error("select the actual acceptance receipt directory")
            print(export_acceptance(root, args.acceptance, evidence, args.candidate))
            return 0
        if args.command == "index":
            print(index_evidence(evidence))
            return 0
        if args.command == "templates":
            write_templates(evidence)
            print(f"PASS templates: {evidence}")
            return 0
        if args.command == "audit":
            result: dict[str, Any] = {
                "repository": repository_audit(root),
                "evidence": evidence_audit(evidence, root=root)
                if evidence.exists()
                else {"state": "MISSING", "items": {}},
                "owner_requested_products": REQUIRED_PRODUCTS,
                "planning_rubric": RUBRIC,
                "official_rules": "Confirm using the separate owner-reviewed organizer capture.",
            }
            result["state"] = (
                "PASS"
                if result["repository"]["state"] == "PASS"
                and result["evidence"]["state"] == "PASS"
                else "HOLD"
            )
            print(
                json.dumps(result, indent=2, sort_keys=True)
                if args.json
                else f"DAY21 {result['state']}\nrepo={result['repository']['state']} evidence={result['evidence']['state']}"
            )
            return 0 if result["state"] == "PASS" else 1
        manifest = compile_bundle(
            root,
            evidence,
            output,
            title=args.title,
            target_audience=args.target_audience,
            problem=args.problem,
            solution=args.solution,
            pitch=args.pitch,
        )
        print(
            json.dumps(manifest, indent=2, sort_keys=True)
            if args.json
            else f"READY_FOR_OWNER_REVIEW: {output}"
        )
        return 0
    except (OSError, Day21Error, ReadinessError, KeyError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
