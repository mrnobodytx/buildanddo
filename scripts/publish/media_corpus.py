#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/publish/media_corpus.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     scripts/publish/media_contracts.py, scripts/publish/activity_publish.py, libs/capability_tokens/verification.py, libs/semantic_twin/receipts.py, libs/evolution/common.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES scripts/publish/media_contracts.py; CONSUMES scripts/publish/activity_publish.py; CONSUMES libs/capability_tokens/verification.py; CONSUMES libs/semantic_twin/receipts.py; CONSUMES libs/evolution/common.py
# Intent:      Turn explicitly selected public evidence into reusable local media drafts and receiving production plans without invoking a provider or publisher.
# ───────────────────────────────────────────────────────────────

"""Compile source-bound media drafts; all provider and publication actions stay external."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from libs.capability_tokens.verification import ReviewPolicy, require_review  # noqa: E402
from libs.evolution.common import decode_json, digest, mapping, timestamp  # noqa: E402
from libs.semantic_twin.contracts import Contract, ContractError, require  # noqa: E402
from libs.semantic_twin.receipts import VerificationReceipt  # noqa: E402
from libs.semantic_twin.vocabulary import AuthorityTier  # noqa: E402
from scripts.publish.media_contracts import (  # noqa: E402
    MAX_FILE_BYTES,
    MAX_TOTAL_BYTES,
    CorpusOptions,
    MediaArtifact,
    MediaObservation,
    MediaSource,
    relative_path,
)

LABELS = {
    "article": "Article",
    "social": "Social post",
    "daily_audio": "Daily Edition",
    "short_video": "Short video",
    "mission_story": "Mission autopsy",
    "guild_debrief": "Guildmaster debrief",
    "build_report": "Build in public",
    "tutorial": "Micro tutorial",
    "onboarding": "Onboarding",
    "case_study": "Case study",
}
TARGETS = {
    "daily_audio": (30, 90),
    "short_video": (20, 45),
    "mission_story": (90, 150),
    "guild_debrief": (300, 900),
    "build_report": (180, 480),
    "tutorial": (30, 90),
    "onboarding": (30, 120),
    "case_study": (90, 240),
}
SECTIONS = ("problem", "action", "outcome", "lesson")
SECTION_LABELS = {
    "problem": "Problem reported",
    "action": "Action recorded",
    "outcome": "Outcome reported",
    "lesson": "Lesson recorded",
}


def checked_path(path: Path) -> Path:
    """Reject symlink traversal for explicitly selected local inputs and outputs."""
    absolute = path.absolute()
    require(
        not any(p.is_symlink() for p in (absolute, *absolute.parents)),
        "selected path contains a symlink",
    )
    return absolute


def read_bytes(path: Path, limit: int = MAX_FILE_BYTES) -> bytes:
    """Read a bounded regular file without printing its contents on failure."""
    path = checked_path(path)
    try:
        require(
            stat.S_ISREG(path.stat().st_mode), "selected input is not a regular file"
        )
        with path.open("rb") as stream:
            raw = stream.read(limit + 1)
        require(0 < len(raw) <= limit, "selected input is empty or oversized")
        return raw
    except OSError as exc:
        raise ContractError("selected local input is unavailable") from exc


def read_artifact(root: Path, artifact: MediaArtifact) -> bytes:
    """Check the exact bytes referenced by one selected artifact."""
    raw = read_bytes(checked_path(root) / artifact.path)
    require(
        len(raw) == artifact.size
        and hashlib.sha256(raw).hexdigest() == artifact.sha256,
        "artifact size or digest mismatch",
    )
    return raw


def load_object(path: Path) -> dict[str, object]:
    """Load one bounded strict JSON object."""
    return mapping(decode_json(read_bytes(path)))


def _text_leaves(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for item in value.values() for text in _text_leaves(item)]
    if isinstance(value, list):
        return [text for item in value for text in _text_leaves(item)]
    return []


def validate_source(
    source: MediaSource,
    evidence_root: Path,
    *,
    at: datetime,
    verification: VerificationReceipt | None = None,
    policy: ReviewPolicy | None = None,
) -> str:
    """Check source bytes and separately pinned review without conferring publishing authority."""
    require(
        at.tzinfo is not None and source.observed_at <= at,
        "source is from the future or clock is naive",
    )
    texts: dict[str, str] = {}
    for artifact in source.artifacts:
        raw = read_artifact(evidence_root, artifact)
        try:
            text = raw.decode("utf-8")
        except UnicodeError as exc:
            raise ContractError("source evidence must be selected UTF-8 text") from exc
        if artifact.path.endswith(".json"):
            text = "\n".join(_text_leaves(decode_json(text)))
        texts[artifact.artifact_id] = text
    for claim in source.claims:
        require(
            any(claim.text in texts[key] for key in claim.evidence_ids),
            "claim is not an exact excerpt of its cited evidence",
        )
    require(
        (verification is None) == (policy is None),
        "source review needs a separately supplied receiving policy and receipt",
    )
    if verification is not None and policy is not None:
        require(
            verification.result.actor_id == source.producer,
            "review names a different source producer",
        )
        require(
            verification.result.verifier_id not in {source.producer, *source.authors},
            "source participants cannot verify their own story",
        )
        require_review(
            verification,
            source.subject,
            policy,
            at=at,
            tier=AuthorityTier.A1,
            checks=("claim_support", "public_disclosure"),
            sources=source.required_sources,
            since=source.observed_at,
        )
    if at >= source.expires_at:
        return "STALE"
    return "REVIEWED_SOURCE" if verification is not None else "REPORTED_SOURCE"


def validate_activity(source: MediaSource, path: Path) -> None:
    """Bind a selection to the existing publisher's actual PublicActivityEvent export."""
    raw = read_bytes(path)
    activity = mapping(decode_json(raw))
    required = {
        "event_id",
        "commit",
        "timestamp",
        "title",
        "summary",
        "deployment_state",
        "evidence",
        "public_url",
    }
    require(
        set(activity) == required, "expected the existing public activity projection"
    )
    commit = activity["commit"]
    require(
        isinstance(commit, str)
        and 7 <= len(commit) <= 40
        and source.revision.startswith(commit),
        "activity revision differs from selected source",
    )
    require(
        source.event_id == activity["event_id"] and source.title == activity["title"],
        "activity identity differs from selected source",
    )
    require(
        source.observed_at == timestamp(activity["timestamp"])
        and source.source_url == activity["public_url"],
        "activity time or URL differs from selected source",
    )
    require(
        any(
            a.sha256 == hashlib.sha256(raw).hexdigest() and a.size == len(raw)
            for a in source.artifacts
        ),
        "source omits the original public activity bytes",
    )
    # deployment_state is an attributed upstream report, never an independent review.


def _chunks(blocks: list[str], prefix: str, suffix: str, maximum: int) -> list[str]:
    result: list[str] = []
    selected: list[str] = []
    for block in blocks:
        require(
            len("\n\n".join([prefix, block, suffix])) <= maximum,
            "one claim plus its limitations exceeds the chunk bound; edit the source selection",
        )
        proposed = "\n\n".join([prefix, *selected, block, suffix])
        if len(proposed) > maximum:
            result.append("\n\n".join([prefix, *selected, suffix]))
            selected = []
        selected.append(block)
    if selected:
        result.append("\n\n".join([prefix, *selected, suffix]))
    return result


def _scripts(source: MediaSource, format_name: str, maximum: int) -> list[str]:
    dated = (
        f"{source.title}. Source report dated {source.observed_at.date().isoformat()}."
    )
    limitations = " ".join(c.text for c in source.claims if c.section == "limitation")
    require(len(limitations) <= 1000, "select a bounded complete limitations statement")
    blocks: list[str] = []
    selected = list(source.claims)
    if format_name in ("social", "short_video"):
        selected = [
            next(c for c in source.claims if c.section == section)
            for section in ("problem", "action", "outcome")
        ]
    for section in SECTIONS:
        for claim in selected:
            if claim.section != section:
                continue
            label = SECTION_LABELS[section]
            if format_name == "guild_debrief":
                blocks.append(
                    f"Host: What does the source record about the {section}?\nAnalyst: {claim.text}"
                )
            elif format_name == "article":
                blocks.append(f"## {label}\n\n{claim.text}")
            else:
                blocks.append(f"{label}: {claim.text}")
    if format_name == "guild_debrief":
        prefix = f"Host: {dated}\nHost and Analyst are scripted narration roles, not quotations from real workers."
        suffix = f"Analyst: Limitations recorded: {limitations}"
    else:
        prefix = ("# " if format_name == "article" else "") + dated
        if format_name == "build_report":
            prefix += f" This report covers revision {source.revision}."
        if format_name in ("tutorial", "onboarding"):
            prefix += " Inspect the recorded example and its lesson before trying the procedure."
        if format_name == "case_study":
            prefix += " This case records one source account; it establishes no customer result beyond that account."
        suffix = f"Limitations recorded: {limitations}"
    return _chunks(blocks, prefix, suffix, maximum)


def compile_corpus(
    source: MediaSource,
    options: CorpusOptions,
    evidence_root: Path,
    *,
    at: datetime,
    verification: VerificationReceipt | None = None,
    policy: ReviewPolicy | None = None,
) -> dict[str, object]:
    """Compile a deterministic review corpus and two explicitly held production lanes."""
    source_state = validate_source(
        source, evidence_root, at=at, verification=verification, policy=policy
    )
    source_digest = digest(source)
    assets: list[dict[str, object]] = []
    translation_tasks = []
    for tag in options.languages:
        if tag != source.language or not source.language.startswith("en"):
            translation_tasks.append(
                {
                    "language": tag,
                    "state": "HOLD",
                    "reason": "selected_translated_source_template_and_review_required",
                }
            )
            continue
        for format_name in options.formats:
            scripts = _scripts(source, format_name, options.chunk_characters)
            styles = options.styles if format_name in TARGETS else ("neutral",)
            for style in styles:
                for part, script in enumerate(scripts, 1):
                    request = {
                        "source_digest": source_digest,
                        "format": format_name,
                        "language": tag,
                        "style": style,
                        "part": part,
                        "parts": len(scripts),
                        "script": script,
                        "requested_model": options.requested_model,
                        "speaker_roles": ["host", "analyst"]
                        if format_name == "guild_debrief"
                        else ["narrator"],
                    }
                    request_digest = digest(request)
                    asset_id = digest(
                        {"schema": "buildanddo.media-asset/v1", "request": request}
                    )
                    title = (
                        f"{LABELS[format_name]}: {source.title} ({part}/{len(scripts)})"
                    )
                    body = f"{script}\n\nSource: {source.source_url}\nRevision: {source.revision}\nEvidence selection: {source_digest}"
                    brief = f"Imported media draft {asset_id}.\nSource event: {source.event_id}; scope: {source.scope_id}.\nReview the source, rights and exact script before production or publication."
                    require(
                        all(
                            len(value.encode("utf-16-le")) // 2 <= maximum
                            for value, maximum in (
                                (title, 200),
                                (body, 5000),
                                (brief, 2000),
                                (source.audience, 300),
                            )
                        ),
                        "draft exceeds the existing Content studio bound",
                    )
                    draft = {
                        "schema": "buildanddo.content-draft/v1",
                        "asset_id": asset_id,
                        "source_digest": source_digest,
                        "language": tag,
                        "title": title,
                        "format": "social"
                        if format_name == "social"
                        else "tutorial"
                        if format_name in ("tutorial", "onboarding")
                        else "blog",
                        "audience": source.audience,
                        "brief": brief,
                        "body": body,
                        "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
                        "channel": LABELS[format_name],
                        "call_to_action": "Inspect the cited source and its limitations.",
                    }
                    target = TARGETS.get(format_name)
                    seconds = round(len(script.split()) * 60 / 150, 1)
                    assets.append(
                        {
                            "asset_id": asset_id,
                            "request_digest": request_digest,
                            "request": request,
                            "script_sha256": hashlib.sha256(
                                script.encode()
                            ).hexdigest(),
                            "characters": len(script),
                            "draft": draft,
                            "claim_ids": [
                                c.claim_id for c in source.claims if c.text in script
                            ],
                            "target_seconds": target,
                            "estimated_seconds": seconds,
                            "duration_basis": "planning estimate at 150 words/minute, not measured audio",
                            "duration_state": "NOT_APPLICABLE"
                            if target is None
                            else "IN_RANGE"
                            if target[0] <= seconds <= target[1]
                            else "NEEDS_EDIT",
                            "clip_plan": [
                                {
                                    "order": i + 1,
                                    "claim_id": c.claim_id,
                                    "evidence_ids": list(c.evidence_ids),
                                    "timing": "align_after_actual_audio",
                                }
                                for i, c in enumerate(source.claims)
                                if c.text in script
                            ],
                        }
                    )
    require(len(assets) <= options.max_assets, "requested corpus exceeds asset budget")
    spoken = [a for a in assets if mapping(a["request"])["format"] in TARGETS]
    characters = sum(cast(int, a["characters"]) for a in spoken)
    require(
        characters <= options.character_budget,
        "requested corpus exceeds character budget",
    )
    common_holds = [
        "human_script_approval",
        "voice_rights_confirmation",
        "provider_capability_confirmation",
    ]
    if source_state != "REVIEWED_SOURCE":
        common_holds.append("current_independent_source_review")
    jobs = [
        {
            "asset_id": a["asset_id"],
            "request_digest": a["request_digest"],
            "characters": a["characters"],
        }
        for a in spoken
    ]
    plans = {
        "elevencreative": {
            "state": "HOLD",
            "mode": "manual_studio",
            "holds": [*common_holds, "account_and_studio_terms_confirmation"],
            "jobs": jobs,
            "promotion_eligibility": "UNKNOWN",
            "cost": None,
        },
        "api": {
            "state": "HOLD",
            "transport_owner": "existing_private_ElevenLabsBridge",
            "holds": [
                *common_holds,
                "funding_authorization",
                "private_bridge_activation",
            ],
            "jobs": jobs,
            "grant_balance": None,
            "studio_promotion_covers_api": None,
            "cost": None,
        },
    }
    result: dict[str, object] = {
        "schema": "buildanddo.media-corpus/v1",
        "compiled_at": at.isoformat(),
        "source": source.to_dict(),
        "source_digest": source_digest,
        "source_state": source_state,
        "source_review_digest": digest(verification)
        if verification is not None
        else None,
        "options": options.to_dict(),
        "assets": assets,
        "translation_tasks": translation_tasks,
        "production_plans": plans,
        "generation_characters_per_lane": characters,
        "lane_selection": "choose one lane per job; producing in both incurs both lanes' usage",
        "publication_authority": False,
        "external_effects": 0,
    }
    result["corpus_digest"] = digest(result)
    return result


def _json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_corpus(corpus: dict[str, object], destination: Path) -> None:
    """Write a new immutable review directory; never overwrite an earlier corpus."""
    destination = checked_path(destination)
    require(not destination.exists(), "corpus destination already exists")
    files: dict[str, bytes] = {"corpus.json": _json(corpus)}
    for value in cast(list[dict[str, object]], corpus["assets"]):
        asset_id = str(value["asset_id"])
        request = mapping(value["request"])
        files[f"scripts/{asset_id}.txt"] = str(request["script"]).encode("utf-8")
        files[f"drafts/{asset_id}.json"] = _json(value["draft"])
    files["production-plans.json"] = _json(corpus["production_plans"])
    files["manifest.json"] = _json(
        {
            "schema": "buildanddo.media-files/v1",
            "corpus_digest": corpus["corpus_digest"],
            "files": {
                name: {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
                for name, raw in sorted(files.items())
            },
        }
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".media-corpus-", dir=destination.parent))
    try:
        for name, raw in files.items():
            target = temporary / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        require(
            not destination.exists(), "corpus destination appeared during compilation"
        )
        os.rename(temporary, destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def read_corpus(directory: Path) -> dict[str, object]:
    """Check every retained script/draft byte before downstream receipt reconciliation."""
    directory = checked_path(directory)
    manifest = load_object(directory / "manifest.json")
    require(
        set(manifest) == {"schema", "corpus_digest", "files"}
        and manifest["schema"] == "buildanddo.media-files/v1",
        "invalid corpus file manifest",
    )
    entries = mapping(manifest["files"])
    require(2 <= len(entries) <= 1002, "invalid corpus file count")
    actual: set[str] = set()
    for folder, directories, filenames in os.walk(directory):
        for name in directories + filenames:
            checked_path(Path(folder) / name)
        actual.update(
            (Path(folder) / name).relative_to(directory).as_posix()
            for name in filenames
        )
    require(
        actual == {*entries, "manifest.json"},
        "corpus contains missing or unreferenced files",
    )
    total = 0
    for name, meta in entries.items():
        relative_path(name)
        fields = mapping(meta)
        require(
            set(fields) == {"sha256", "size"} and type(fields["size"]) is int,
            "invalid file metadata",
        )
        raw = read_bytes(directory / name)
        require(
            fields == {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)},
            "corpus file digest mismatch",
        )
        total += len(raw)
        require(total <= MAX_TOTAL_BYTES, "corpus exceeds total byte bound")
    corpus = load_object(directory / "corpus.json")
    expected = corpus.pop("corpus_digest", None)
    require(
        corpus.get("schema") == "buildanddo.media-corpus/v1"
        and digest(corpus) == expected == manifest["corpus_digest"],
        "corpus digest mismatch",
    )
    require(
        corpus.get("publication_authority") is False
        and corpus.get("external_effects") == 0,
        "corpus cannot grant publication authority",
    )
    source = MediaSource.from_dict(mapping(corpus["source"]))
    options = CorpusOptions.from_dict(mapping(corpus["options"]))
    require(digest(source) == corpus["source_digest"], "corpus source binding differs")
    assets = corpus.get("assets")
    require(
        isinstance(assets, list) and len(assets) <= options.max_assets,
        "invalid retained asset list",
    )
    assert isinstance(assets, list)
    expected_files = {"corpus.json", "production-plans.json"}
    seen: set[str] = set()
    for raw_asset in assets:
        asset = mapping(raw_asset)
        request = mapping(asset.get("request"))
        asset_id = digest({"schema": "buildanddo.media-asset/v1", "request": request})
        require(
            asset.get("asset_id") == asset_id and asset_id not in seen,
            "conflicting retained asset identity",
        )
        seen.add(asset_id)
        require(
            asset.get("request_digest") == digest(request)
            and request.get("source_digest") == digest(source),
            "retained request digest or source differs",
        )
        script = request.get("script")
        require(
            isinstance(script, str) and 0 < len(script) <= options.chunk_characters,
            "invalid retained script",
        )
        assert isinstance(script, str)
        require(
            asset.get("script_sha256") == hashlib.sha256(script.encode()).hexdigest()
            and asset.get("characters") == len(script),
            "retained script binding differs",
        )
        script_path, draft_path = f"scripts/{asset_id}.txt", f"drafts/{asset_id}.json"
        require(
            read_bytes(directory / script_path) == script.encode(),
            "retained script bytes differ from production request",
        )
        require(
            load_object(directory / draft_path) == asset.get("draft"),
            "retained draft differs from corpus",
        )
        expected_files.update((script_path, draft_path))
    require(set(entries) == expected_files, "corpus file selection differs from assets")
    require(
        load_object(directory / "production-plans.json")
        == corpus.get("production_plans"),
        "retained production plans differ",
    )
    corpus["corpus_digest"] = expected
    return corpus


def main(argv: list[str] | None = None) -> int:
    """Expose bounded local compilation and inspection, with no generation or publishing command."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("compile")
    build.add_argument("source", type=Path)
    build.add_argument("--evidence-root", type=Path, required=True)
    build.add_argument("--options", type=Path)
    build.add_argument("--at", required=True)
    build.add_argument("--activity", type=Path)
    build.add_argument("--verification", type=Path)
    build.add_argument("--review-policy", type=Path)
    build.add_argument("--output", type=Path, required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("directory", type=Path)
    schema = commands.add_parser("schema")
    schema.add_argument("kind", choices=("source", "options", "observation"))
    args = parser.parse_args(argv)
    try:
        if args.command == "schema":
            schemas: dict[str, type[Contract]] = {
                "source": MediaSource,
                "options": CorpusOptions,
                "observation": MediaObservation,
            }
            print(
                json.dumps(
                    schemas[args.kind].json_schema(),
                    indent=2,
                )
            )
            return 0
        if args.command == "inspect":
            corpus = read_corpus(args.directory)
            print(
                json.dumps(
                    {
                        "state": "INTEGRITY_ONLY",
                        "corpus_digest": corpus["corpus_digest"],
                        "publication_authority": False,
                    }
                )
            )
            return 0
        source = MediaSource.from_dict(load_object(args.source))
        options = (
            CorpusOptions.from_dict(load_object(args.options))
            if args.options
            else CorpusOptions()
        )
        if args.activity:
            validate_activity(source, args.activity)
        verification = (
            VerificationReceipt.from_dict(load_object(args.verification))
            if args.verification
            else None
        )
        policy = (
            ReviewPolicy.from_dict(load_object(args.review_policy))
            if args.review_policy
            else None
        )
        corpus = compile_corpus(
            source,
            options,
            args.evidence_root,
            at=timestamp(args.at),
            verification=verification,
            policy=policy,
        )
        write_corpus(corpus, args.output)
        print(
            json.dumps(
                {
                    "state": "DRAFTS_PREPARED",
                    "assets": len(cast(list[object], corpus["assets"])),
                    "source_state": corpus["source_state"],
                    "generation_characters_per_lane": corpus[
                        "generation_characters_per_lane"
                    ],
                    "external_effects": 0,
                }
            )
        )
        return 0
    except (ContractError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
