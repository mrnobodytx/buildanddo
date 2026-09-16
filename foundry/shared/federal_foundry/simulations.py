# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/simulations.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/validation.py, apps/mission_suite/engine.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/validation.py; DEPENDS_ON apps/mission_suite/engine.py
# DAG Node:    none
# Intent:      Exercise compute gating, semantic reconstruction and existing maritime replay without inventing hardware or operational evidence.
# ───────────────────────────────────────────────────────────────

"""Run public simulation references with explicit limits on their evidence."""

from __future__ import annotations

import random

from apps.mission_suite.engine import run_suite
from .models import FoundryValidationError
from .validation import (
    canonical,
    decode,
    digest,
    finite,
    integer,
    mapping,
    records,
    strings,
)


def low_swap(
    dataset: dict[str, object], candidate: str, seed: int
) -> dict[str, object]:
    """Measure dense versus event-gated temporal projection on a labelled fixture."""
    if candidate not in {"dense-temporal", "event-gated"}:
        raise FoundryValidationError("unknown compute candidate")
    raw_weights = dataset.get("weights")
    if not isinstance(raw_weights, list) or not 2 <= len(raw_weights) <= 16:
        raise FoundryValidationError("weights must have 2 to 16 rows")
    weights: list[list[float]] = []
    for raw_row in raw_weights:
        if not isinstance(raw_row, list) or not 2 <= len(raw_row) <= 128:
            raise FoundryValidationError("weights must have 2 to 128 columns")
        weights.append([finite(value) for value in raw_row])
    width = len(weights[0])
    if any(len(row) != width for row in weights):
        raise FoundryValidationError("weight matrix must be rectangular")
    frames = records(dataset.get("frames"), "frames")
    if not 1 <= len(frames) <= 512:
        raise FoundryValidationError("compute fixture needs 1 to 512 frames")
    leak = finite(dataset.get("leak"))
    threshold = finite(dataset.get("classification_threshold"))
    gate = finite(dataset.get("gate_threshold"))
    if not 0 < leak < 1 or threshold <= 0 or not 0 <= gate < threshold:
        raise FoundryValidationError("invalid decay or gate thresholds")
    state = [0.0] * len(weights)
    decisions: list[dict[str, object]] = []
    multiplies = correct = active = 0
    for index, frame in enumerate(frames):
        values = frame.get("features")
        if not isinstance(values, list) or len(values) != width:
            raise FoundryValidationError("frame has wrong feature dimension")
        features = [finite(value) for value in values]
        expected = integer(frame.get("label"), -1, len(weights) - 1, "label")
        enabled = (
            candidate == "dense-temporal"
            or sum(abs(value) for value in features) >= gate
        )
        active += enabled
        for row_id, row in enumerate(weights):
            contribution = (
                sum(weight * value for weight, value in zip(row, features, strict=True))
                if enabled
                else 0.0
            )
            state[row_id] = leak * state[row_id] + contribution
            multiplies += width if enabled else 0
        predicted = (
            max(range(len(state)), key=lambda idx: (state[idx], -idx))
            if max(state) >= threshold
            else -1
        )
        correct += predicted == expected
        decisions.append(
            {
                "frame": index,
                "predicted": predicted,
                "label": expected,
                "compute_enabled": enabled,
            }
        )
    dense = len(frames) * len(weights) * width
    return {
        "metrics": {
            "accuracy": correct / len(frames),
            "samples": len(frames),
            "active_multiplications": multiplies,
            "dense_multiplications": dense,
            "compute_fraction": multiplies / dense,
            "active_frames": active,
            "gate_feature_checks": len(frames) * width
            if candidate == "event-gated"
            else 0,
        },
        "details": {
            "predictions": decisions,
            "state_elements": len(state),
            "weights": len(weights) * width,
            "seed_use": "fixed labelled sequence; no stochastic training",
        },
        "limitations": [
            "Fixed temporal projection, not a trained heterogeneous neural architecture.",
            "Counts exclude decay, control and gate overhead; no watts, VRAM or energy estimate is inferred.",
            "Timing and allocation peaks measure this Python process only.",
        ],
    }


def apply_packet(
    packet: dict[str, object],
    state: dict[str, dict[str, object]],
    expected_sequence: int,
) -> dict[str, dict[str, object]]:
    """Apply an ordered semantic packet and reject lost or conflicting updates."""
    if (
        packet.get("sequence") != expected_sequence
        or type(packet.get("reset")) is not bool
    ):
        raise FoundryValidationError(
            "semantic packet sequence mismatch or invalid reset"
        )
    updates = records(packet.get("updates"), "packet updates")
    removed = strings(packet.get("removed"), "removed IDs")
    ids = strings([row.get("id") for row in updates], "update IDs")
    if set(ids) & set(removed):
        raise FoundryValidationError("packet both updates and removes an object")
    result = {} if packet["reset"] else dict(state)
    for identity in removed:
        result.pop(identity, None)
    for row in updates:
        for axis in ("x", "y", "confidence"):
            finite(row.get(axis), axis)
        if not 0 <= finite(row["confidence"]) <= 1 or not isinstance(
            row.get("class"), str
        ):
            raise FoundryValidationError("invalid semantic observation")
        result[str(row["id"])] = dict(row)
    return result


def semantic(
    dataset: dict[str, object], candidate: str, seed: int
) -> dict[str, object]:
    """Encode annotations and measure receiver reconstruction against frame truth."""
    if candidate not in {"full-scene-json", "roi-delta-json"}:
        raise FoundryValidationError("unknown semantic candidate")
    frames = records(dataset.get("frames"), "frames")
    if not 1 <= len(frames) <= 64:
        raise FoundryValidationError("semantic fixture needs 1 to 64 frames")
    keyframe_every = integer(dataset.get("keyframe_every"), 1, 64, "keyframe_every")
    state: dict[str, dict[str, object]] = {}
    packets: list[dict[str, object]] = []
    reconstructions: list[dict[str, object]] = []
    required = recovered = total_bytes = full_bytes = 0
    error = 0.0
    for sequence, frame in enumerate(frames):
        objects = records(frame.get("objects"), "objects")
        if not 1 <= len(objects) <= 64:
            raise FoundryValidationError("semantic frames need 1 to 64 objects")
        strings([row.get("id") for row in objects], "scene identities")
        for row in objects:
            if type(row.get("relevant")) is not bool or not isinstance(
                row.get("class"), str
            ):
                raise FoundryValidationError(
                    "scene needs class and explicit relevance labels"
                )
            for name in ("x", "y", "confidence"):
                finite(row.get(name), name)
        truth = {str(row["id"]): row for row in objects if row["relevant"]}
        required += len(truth)

        def project(row: dict[str, object]) -> dict[str, object]:
            return {
                "id": row["id"],
                "class": row["class"],
                "x": round(finite(row["x"]), 1)
                if candidate == "roi-delta-json"
                else row["x"],
                "y": round(finite(row["y"]), 1)
                if candidate == "roi-delta-json"
                else row["y"],
                "confidence": row["confidence"],
            }

        selected = {
            str(row["id"]): project(row)
            for row in objects
            if candidate == "full-scene-json" or row["relevant"]
        }
        reset = candidate == "full-scene-json" or sequence % keyframe_every == 0
        packet: dict[str, object] = {
            "sequence": sequence,
            "reset": reset,
            "updates": [
                selected[key]
                for key in sorted(selected)
                if reset or state.get(key) != selected[key]
            ],
            "removed": [] if reset else sorted(set(state) - set(selected)),
        }
        raw = canonical(packet)
        full_bytes += len(
            canonical(
                {
                    "sequence": sequence,
                    "reset": True,
                    "updates": [
                        {
                            key: row[key]
                            for key in ("id", "class", "x", "y", "confidence")
                        }
                        for row in sorted(objects, key=lambda r: str(r["id"]))
                    ],
                    "removed": [],
                }
            )
        )
        total_bytes += len(raw)
        # The receiver parses the actual wire bytes, not the sender's object.
        state = apply_packet(decode(raw), state, sequence)
        for identity, row in truth.items():
            if identity in state:
                recovered += 1
                error += abs(finite(state[identity]["x"]) - finite(row["x"]))
                error += abs(finite(state[identity]["y"]) - finite(row["y"]))
        packets.append(packet)
        reconstructions.append(
            {"sequence": sequence, "objects": [state[key] for key in sorted(state)]}
        )
    if not required:
        raise FoundryValidationError("semantic fixture has no relevant truth")
    return {
        "metrics": {
            "wire_bytes": total_bytes,
            "full_scene_bytes": full_bytes,
            "byte_ratio": total_bytes / full_bytes,
            "mission_object_recall": recovered / required,
            "position_mae": error / (2 * recovered) if recovered else 0,
            "required_objects": required,
            "recovered_objects": recovered,
        },
        "details": {
            "packets": packets,
            "receiver": reconstructions,
            "position_unit": "synthetic grid units",
            "seed_use": "fixed scene annotations; no stochastic detector",
        },
        "limitations": [
            "Synthetic annotated scenes; relevance is supplied truth, not inferred from EO video.",
            "Comparison uses JSON wire formats, not H.264, H.265 or AV1.",
            "No edge hardware, radio, power, DP2 qualification or semantic-video accuracy is measured.",
        ],
    }


def maritime(
    dataset: dict[str, object], candidate: str, seed: int
) -> dict[str, object]:
    """Run the existing public suite and check order invariance and HOLD outcomes."""
    if candidate not in {"ordered-observations", "shuffled-observations"}:
        raise FoundryValidationError("unknown maritime candidate")
    original = mapping(dataset.get("document"), "mission suite input")
    request = decode(canonical(original))
    payload = mapping(request.get("payload"))
    observations = records(payload.get("observations"), "observations")
    if candidate == "shuffled-observations":
        random.Random(seed).shuffle(observations)
    request["payload"] = {**payload, "observations": observations}
    result = run_suite(canonical(request).decode("utf-8"))
    reference = run_suite(canonical(original).decode("utf-8"))
    analysis = mapping(result["analysis"])
    summary = mapping(analysis["summary"])
    candidates = records(analysis["candidates"], "candidates")
    held = sum(row.get("admission_verdict") == "HOLD" for row in candidates)
    matches = digest(canonical(analysis)) == digest(canonical(reference["analysis"]))
    if result.get("release_state") != "HOLD":
        raise FoundryValidationError(
            "maritime fixture unexpectedly obtained release authority"
        )
    return {
        "metrics": {
            "analysis_replay_match": int(matches),
            "hold_fraction": held / len(candidates) if candidates else 1,
            "observations": finite(summary["observations"]),
            "entities": finite(summary["entities"]),
            "candidates": len(candidates),
            "admitted": finite(summary["admitted"]),
        },
        "details": {
            "analysis": analysis,
            "proof": result["proof"],
            "engine_version": result["engine_version"],
            "source_sha256": result["source_sha256"],
            "release_state": result["release_state"],
        },
        "limitations": [
            "Existing portable public engine, not the private Sentinel/NNC runtime.",
            "Synthetic observations, no live maritime feed or 48-hour operating demonstration.",
            "HOLD and candidate counts do not establish detection effectiveness or DIU readiness.",
        ],
    }
