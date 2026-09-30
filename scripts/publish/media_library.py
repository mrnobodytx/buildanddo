#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/publish/media_library.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     scripts/publish/media_contracts.py, scripts/publish/media_corpus.py, libs/evolution/common.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES scripts/publish/media_contracts.py; CONSUMES scripts/publish/media_corpus.py; CONSUMES libs/evolution/common.py
# Intent:      Reconcile retained generation and distribution observations into a reproducible media index without inventing delivery, engagement or provider authentication.
# ───────────────────────────────────────────────────────────────

"""Derive a local media library from explicitly supplied, byte-checked observations."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from libs.evolution.common import digest, timestamp  # noqa: E402
from libs.semantic_twin.contracts import ContractError, require  # noqa: E402
from scripts.publish.media_contracts import MAX_TOTAL_BYTES, MediaObservation  # noqa: E402
from scripts.publish.media_corpus import (
    checked_path,
    load_object,
    read_artifact,
    read_corpus,
)  # noqa: E402


def reconcile(
    corpus_directory: Path,
    observations: tuple[MediaObservation, ...],
    evidence_root: Path,
    *,
    at: datetime,
) -> dict[str, object]:
    """Check lineage and deduplicate attempts and engagement snapshots without summing overlapping windows."""
    require(at.tzinfo is not None, "observation clock must be timezone-aware")
    require(len(observations) <= 1000, "too many media observations")
    corpus = read_corpus(corpus_directory)
    assets = {
        str(a["asset_id"]): a for a in cast(list[dict[str, object]], corpus["assets"])
    }
    unique: dict[str, MediaObservation] = {}
    total_bytes = 0
    checked: set[tuple[str, str]] = set()
    for observation in observations:
        require(observation.observed_at <= at, "media observation is from the future")
        require(
            observation.asset_id in assets,
            "observation names an unselected media asset",
        )
        asset = assets[observation.asset_id]
        require(
            observation.request_digest == asset["request_digest"],
            "media observation belongs to a different production request",
        )
        require(
            observation.observed_at >= timestamp(corpus["compiled_at"]),
            "media observation predates its corpus",
        )
        previous = unique.get(observation.observation_id)
        require(
            previous is None or previous == observation,
            "conflicting observation identity",
        )
        unique[observation.observation_id] = observation
        for artifact in (observation.evidence, observation.media):
            if artifact is None:
                continue
            artifact_key = (artifact.path, artifact.sha256)
            if artifact_key not in checked:
                read_artifact(evidence_root, artifact)
                total_bytes += artifact.size
                require(
                    total_bytes <= MAX_TOTAL_BYTES,
                    "selected observation bytes exceed the batch bound",
                )
                checked.add(artifact_key)
    ordered = sorted(
        unique.values(), key=lambda row: (row.observed_at, row.observation_id)
    )
    attempts: dict[tuple[str, str, str, str], MediaObservation] = {}
    for observation in ordered:
        if observation.kind == "engagement":
            continue
        attempt_key = (
            observation.asset_id,
            observation.kind,
            observation.provider,
            observation.attempt_id,
        )
        previous = attempts.get(attempt_key)
        if previous is not None:
            require(
                previous.observed_at < observation.observed_at
                or previous == observation,
                "ambiguous attempt observations at one timestamp",
            )
            if previous.state == "succeeded":
                require(
                    observation.state == "succeeded"
                    and previous.media == observation.media
                    and previous.media_sha256 == observation.media_sha256
                    and previous.publication_id == observation.publication_id
                    and previous.publication_url == observation.publication_url,
                    "terminal attempt changed; retain a new attempt instead",
                )
        attempts[attempt_key] = observation
    generated: dict[tuple[str, str], MediaObservation] = {}
    for observation in ordered:
        if (
            observation.kind == "generation"
            and observation.state == "succeeded"
            and observation.media is not None
        ):
            generated.setdefault(
                (observation.asset_id, observation.media.sha256), observation
            )
    publications: dict[tuple[str, str], MediaObservation] = {}
    for observation in ordered:
        if observation.kind != "publication" or observation.state != "succeeded":
            continue
        media = generated.get((observation.asset_id, str(observation.media_sha256)))
        require(
            media is not None and media.observed_at <= observation.observed_at,
            "publication has no preceding generated artifact observation",
        )
        key = (observation.provider, str(observation.publication_id))
        previous = publications.get(key)
        require(
            previous is None
            or (previous.asset_id, previous.media_sha256, previous.publication_url)
            == (
                observation.asset_id,
                observation.media_sha256,
                observation.publication_url,
            ),
            "publication identity changed its media binding",
        )
        publications.setdefault(key, observation)
    metrics: dict[tuple[str, str, str, str, str, str], dict[str, object]] = {}
    for observation in ordered:
        if observation.kind != "engagement" or observation.state != "succeeded":
            continue
        destination = observation.publication_provider or observation.provider
        publication = publications.get((destination, str(observation.publication_id)))
        require(
            publication is not None,
            "engagement has no selected publication observation from the same provider",
        )
        assert publication is not None
        require(
            (
                publication.asset_id,
                publication.publication_url,
                publication.media_sha256,
            )
            == (
                observation.asset_id,
                observation.publication_url,
                observation.media_sha256,
            ),
            "engagement references different published content",
        )
        require(
            publication.observed_at <= observation.observed_at,
            "engagement predates its publication",
        )
        for metric in observation.metrics:
            require(
                publication.observed_at <= metric.window_start,
                "engagement window predates its publication",
            )
            metric_key = (
                observation.provider,
                destination,
                str(observation.publication_id),
                metric.name,
                metric.window_start.isoformat(),
                metric.window_end.isoformat(),
            )
            row = {
                **metric.to_dict(),
                "asset_id": observation.asset_id,
                "provider": observation.provider,
                "publication_provider": destination,
                "publication_id": observation.publication_id,
                "observed_at": observation.observed_at.isoformat(),
                "evidence_sha256": observation.evidence.sha256,
            }
            previous_metric = metrics.get(metric_key)
            require(
                previous_metric is None
                or previous_metric["observed_at"] != row["observed_at"]
                or previous_metric["value"] == row["value"],
                "conflicting engagement snapshot at one timestamp",
            )
            metrics[metric_key] = row
    selected_attempts = sorted(
        attempts.values(), key=lambda o: (o.asset_id, o.kind, o.provider, o.attempt_id)
    )
    index: dict[str, object] = {
        "schema": "buildanddo.media-library/v1",
        "corpus_digest": corpus["corpus_digest"],
        "as_of": at.isoformat(),
        "authentication": "reported_observations_only",
        "publication_authority": False,
        "external_effects": 0,
        "source_digest": corpus["source_digest"],
        "attempts": [o.to_dict() for o in selected_attempts],
        "history": [o.to_dict() for o in ordered],
        "engagement_snapshots": [metrics[key] for key in sorted(metrics)],
        "engagement_policy": "latest observation per provider/publication/metric/exact window; overlapping windows are never summed",
        "counts": {
            "assets": len(assets),
            "observations": len(ordered),
            "generation_attempts": sum(
                o.kind == "generation" for o in selected_attempts
            ),
            "reported_generations": sum(
                o.kind == "generation" and o.state == "succeeded"
                for o in selected_attempts
            ),
            "publication_attempts": sum(
                o.kind == "publication" for o in selected_attempts
            ),
            "reported_publications": len(publications),
            "unresolved_attempts": sum(o.state == "unknown" for o in selected_attempts),
        },
        "next_work": [
            {
                "asset_id": asset_id,
                "reason": "engagement_unmeasured",
                "status": "proposed",
            }
            for asset_id in sorted(assets)
            if asset_id not in {str(row["asset_id"]) for row in metrics.values()}
        ],
    }
    index["library_digest"] = digest(index)
    return index


def main(argv: list[str] | None = None) -> int:
    """Inspect retained receipts without accessing a provider, publisher or analytics account."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path)
    parser.add_argument("observations", type=Path, nargs="*")
    parser.add_argument("--evidence-root", type=Path, required=True)
    parser.add_argument("--at", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        rows = tuple(
            MediaObservation.from_dict(load_object(path)) for path in args.observations
        )
        index = reconcile(args.corpus, rows, args.evidence_root, at=timestamp(args.at))
        output = checked_path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x", encoding="utf-8") as stream:
            json.dump(index, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        print(
            json.dumps(
                {
                    "state": "OBSERVATIONS_RECONCILED",
                    "counts": index["counts"],
                    "authentication": index["authentication"],
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
