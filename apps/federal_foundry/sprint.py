# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/sprint.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/decision/packages.py, apps/federal_foundry/episodes.py, apps/federal_foundry/polynomial.py, apps/pocketbase/pb_migrations/data/research-sprint.json
# EnumType:    Service
# EnumEdges:   CONSUMES apps/decision/packages.py; CONSUMES apps/federal_foundry/episodes.py; CONSUMES apps/federal_foundry/polynomial.py; CONSUMES apps/pocketbase/pb_migrations/data/research-sprint.json
# Intent:      Export reproducible decision demonstrations and market controls alongside separate proposal gaps and GPU receiving prerequisites.
# ───────────────────────────────────────────────────────────────

"""Compile the owner-requested research sprint over existing decision and foundry owners."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
from html import escape
import json
from pathlib import Path
from typing import cast

from apps.decision.packages import (
    INPUT_SCHEMA,
    evaluate,
    evidence_record,
    fingerprint,
    refresh,
    semantic_graph,
    verify,
)
from apps.federal_foundry.catalog import require
from apps.federal_foundry.episodes import MarketAgent, episode, replay
from apps.federal_foundry.polynomial import doctor
from apps.mission_suite.engine import decode, instant, obj, rows
from foundry.shared.federal_foundry.validation import staging
from libs.semantic_twin.ingestion.drafts import canonical_json

ROOT = Path(__file__).resolve().parents[2]
PLAN = "apps/pocketbase/pb_migrations/data/research-sprint.json"
SOURCE_FILES = (
    "apps/decision/packages.py",
    "apps/decision/primitives.py",
    "apps/mission_suite/engine.py",
    "apps/federal_foundry/sprint.py",
    "apps/federal_foundry/episodes.py",
    "apps/federal_foundry/polynomial.py",
    "foundry/shared/federal_foundry/market.py",
    PLAN,
)


def load_plan() -> dict[str, object]:
    """Load the shared planning document without promoting research leads to official notices."""
    plan = decode((ROOT / PLAN).read_text(encoding="utf-8"))
    require(
        plan.get("schema_version") == "buildanddo.research-sprint/v1"
        and plan.get("authorized") is False,
        "invalid_sprint_plan",
    )
    require(
        plan.get("source_status") == "OWNER_SUPPLIED_UNVERIFIED",
        "source_review_required",
    )
    return plan


def demo_input(at: str, *, changed: bool = False) -> dict[str, object]:
    """Create an explicitly synthetic infrastructure trade study for reproducible teaching."""
    instant(at)
    expiry = (instant(at) + timedelta(days=1)).isoformat()
    values = {
        "a_cost": 90,
        "b_cost": 50,
        "a_latency": 8 if changed else 2,
        "b_latency": 5,
    }
    observations = [
        evidence_record(
            key,
            "demo-public",
            value,
            "synthetic/architecture-trial.json",
            fingerprint(
                {"fixture": "architecture", "changed": changed, "values": values}
            ),
            at,
            expiry,
            synthetic=True,
        )
        for key, value in values.items()
    ]
    return {
        "schema_version": INPUT_SCHEMA,
        "decision_id": "architecture-study",
        "tenant_id": "demo-public",
        "question": "Which synthetic design meets the declared latency limit at acceptable cost?",
        "objective": "Teach a reproducible trade study and evidence refresh; no deployment is authorized.",
        "criteria": [
            {
                "id": "cost",
                "direction": "minimize",
                "weight": 40,
                "unit": "synthetic cost units",
            },
            {
                "id": "latency",
                "direction": "minimize",
                "weight": 60,
                "unit": "synthetic milliseconds",
            },
        ],
        "options": [
            {
                "id": key,
                "label": label,
                "measurements": {"cost": f"{key}_cost", "latency": f"{key}_latency"},
            }
            for key, label in (
                ("a", "Synthetic edge design"),
                ("b", "Synthetic regional design"),
            )
        ],
        "constraints": [{"criterion": "latency", "operator": "lte", "threshold": 6}],
        "assumptions": [
            {
                "id": "fixed-workload",
                "statement": "The fixture holds workload constant; real workload equivalence remains unmeasured.",
                "evidence_ids": list(values),
                "expires_at": expiry,
            }
        ],
        "risks": [
            {
                "id": "external-validity",
                "statement": "Synthetic values cannot justify a real architecture choice.",
                "evidence_ids": list(values),
                "mitigation": "Collect same-workload measurements and obtain independent review before a real decision.",
            }
        ],
        "bias_checks": [
            {
                "id": "symmetric-options",
                "statement": "Both options use the same criteria and source fixture.",
                "evidence_ids": list(values),
                "status": "reviewed",
            }
        ],
        "evidence": observations,
    }


def release_input(root: Path, at: str) -> dict[str, object]:
    """Use a real retained acceptance record while holding for missing current-candidate evidence."""
    path = ".bits/out/VCC-BUILDANDDO-UPGRADE-001/objective-closure-validation.json"
    raw = (root / path).read_bytes()
    record = decode(raw.decode("utf-8"))
    counts = obj(obj(record.get("acceptance")).get("profile_counts"))
    require(
        all(
            type(counts.get(key, 0)) is int and cast(int, counts.get(key, 0)) >= 0
            for key in ("PASS", "FAIL", "HOLD", "BLOCKED")
        ),
        "invalid_acceptance_counts",
    )
    total = sum(
        cast(int, counts.get(key, 0)) for key in ("PASS", "FAIL", "HOLD", "BLOCKED")
    )
    require(total > 0, "acceptance_unmeasured")
    observed = str(record["observed_at"])
    evidence = evidence_record(
        "retained-pass-fraction",
        "buildanddo-public",
        cast(int, counts.get("PASS", 0)) / total,
        path,
        hashlib.sha256(raw).hexdigest(),
        observed,
        (instant(observed) + timedelta(days=1)).isoformat(),
    )
    document = demo_input(at)
    document.update(
        {
            "decision_id": "release-readiness",
            "tenant_id": "buildanddo-public",
            "question": "Is the current BuildAndDo release supported by complete same-candidate acceptance?",
            "objective": "Require complete current acceptance and owner authorization before releasing.",
            "criteria": [
                {
                    "id": "acceptance",
                    "direction": "maximize",
                    "weight": 100,
                    "unit": "passing profile fraction",
                }
            ],
            "options": [
                {
                    "id": "release",
                    "label": "Release current candidate",
                    "measurements": {"acceptance": "same-candidate-acceptance"},
                },
                {
                    "id": "retain",
                    "label": "Retain deployed release",
                    "measurements": {"acceptance": "deployed-health"},
                },
            ],
            "constraints": [
                {"criterion": "acceptance", "operator": "gte", "threshold": 1}
            ],
            "assumptions": [
                {
                    "id": "candidate-binding",
                    "statement": "Historical acceptance cannot stand in for current candidate or deployed health.",
                    "evidence_ids": ["retained-pass-fraction"],
                    "expires_at": evidence["expires_at"],
                }
            ],
            "risks": [
                {
                    "id": "missing-runtime",
                    "statement": "The retained run has incomplete runtime acceptance.",
                    "evidence_ids": ["retained-pass-fraction"],
                    "mitigation": "Run the complete unchanged acceptance matrix on the actual candidate and retain deployment evidence.",
                }
            ],
            "bias_checks": [
                {
                    "id": "same-candidate",
                    "statement": "Independent same-candidate review is missing.",
                    "evidence_ids": ["retained-pass-fraction"],
                    "status": "open",
                }
            ],
            "evidence": [evidence],
        }
    )
    return document


def market_dataset() -> dict[str, object]:
    """Return a frozen two-asset market with six private valuation profiles."""
    return {
        "agents": [
            {
                "id": f"agent{i}",
                "values": {"compute": 20 + i * 7, "storage": 65 - i * 6},
            }
            for i in range(6)
        ],
        "supply": {"compute": 2, "storage": 3},
        "rounds": 3,
        "news": [
            {"round": 1, "asset": "compute", "delta": 8},
            {"round": 2, "asset": "storage", "delta": -4},
        ],
    }


def scripted_agents(
    dataset: dict[str, object], *, shaded: bool = False
) -> list[MarketAgent]:
    """Bind named synthetic controls, never labeling them as LLM observations."""

    async def act(prompt: dict[str, object]) -> dict[str, object]:
        multiplier = (0.4 + int(str(prompt["agent"])[-1]) * 0.1) if shaded else 1
        return {"price": float(cast(float, prompt["private_value"])) * multiplier}

    return [
        MarketAgent(
            str(obj(row)["id"]),
            "local-script",
            "shaded-control" if shaded else "truthful-control",
            "1",
            "scripted",
            act,
        )
        for row in rows(dataset["agents"], 32, 2)
    ]


def _header(path: str, at: str) -> str:
    return (
        "# ─── CGRF Header ───────────────────────────────────────────────\n"
        f"# File: {path}\n# Stage: 13_SAVE\n# SRS: SRS-BUILDANDDO-UPGRADE-001\n# CAPS: pending\n# CK: pending\n"
        "# Dispatch: VCC-BUILDANDDO-UPGRADE-001\n# Seat: BITS-CODEGEN\n# Owner: Citadel Nexus Inc.\n"
        f"# Created: {at}\n# Depends: apps/federal_foundry/sprint.py\n# EnumType: Doc\n"
        "# EnumEdges: CONSUMES apps/federal_foundry/sprint.py\n"
        "# Intent: Retain reproducible local research without inventing approval or official acceptance.\n"
        "# ───────────────────────────────────────────────────────────────\n"
    )


def _write(root: Path, path: str, value: object, at: str) -> None:
    dest = root / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    if path.endswith(".json"):
        dest.write_bytes(canonical_json(value) + b"\n")
        (root / (path + ".cgrf.yaml")).write_text(
            _header(path + ".cgrf.yaml", at) + "file: " + path + "\n", encoding="utf-8"
        )
    else:
        header = _header(path, at)
        if path.endswith(".html"):
            header = "<!--\n" + header + "-->\n"
        dest.write_text(header + str(value), encoding="utf-8")


def _package_parts(package: dict[str, object]) -> dict[str, object]:
    verify(package)
    data = obj(package["input"])
    return {
        "decision": package,
        "decision/input": data,
        "evidence": data["evidence"],
        "assumptions": data["assumptions"],
        "risk": data["risks"],
        "causality": {
            "kind": "declared dependencies, not causal proof",
            "graph": semantic_graph(package),
        },
        "verification": package["verification"],
        "human-approval": package["human_approval"],
    }


def _export_package(
    root: Path, directory: str, package: dict[str, object], at: str
) -> None:
    data = obj(package["input"])
    for name, value in _package_parts(package).items():
        _write(root, f"{directory}/{name}.json", value, at)
    html = (
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        "<title>Decision Package</title><main><h1>Decision Package</h1><p>Advisory; independent review and human approval remain pending.</p>"
        f'<h2>{escape(str(data["question"]))}</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{escape(json.dumps(package, indent=2, ensure_ascii=True))}</pre></main></html>\n'
    )
    _write(root, f"{directory}/decision-package.html", html, at)


def _comparison(controls: list[dict[str, object]]) -> dict[str, object]:
    return {
        "state": "SYNTHETIC_CONTROLS",
        "same_dataset": True,
        "seed": 23,
        "metrics": [obj(obj(control["result"])["metrics"]) for control in controls],
        "replay": [replay(control) for control in controls],
        "cross_model_results": "BLOCKED: authorized model bindings and real receipts are required",
        "behavior_classification": "UNMEASURED",
    }


def _summary(
    observed: str,
    first: dict[str, object],
    longitudinal: dict[str, object],
    release: dict[str, object],
    controls: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "schema_version": "buildanddo.research-sprint-export/v1",
        "at": observed,
        "state": "LOCAL_DEMOS_READY_FOR_REVIEW",
        "army_point": obj(first["decision"])["state"],
        "army_refresh_flipped": longitudinal["flipped"],
        "buildanddo_release": obj(release["decision"])["state"],
        "market_replay": [replay(control) for control in controls],
        "fherma": "BLOCKED",
        "official_sources": "UNVERIFIED",
        "authorized": False,
        "independently_verified": False,
    }


def _proposal(lane: dict[str, object]) -> str:
    lead = (
        f"# {lane['title']} — proposal skeleton\n\n"
        f"Research lead: {lane['source_url']}\n\n"
        "Official notice, eligibility, dates and submission rules remain unverified. "
        "This working draft requires solicitation review, a named investigator, "
        "a costed work plan and owner authorization before submission.\n\n"
    )
    if lane["id"] == "army":
        return (
            lead
            + """## Problem

Engineering trade studies become difficult to audit when the selected option is
separated from its measurements, assumptions and approval. The proposed study
tests whether an explicit, replayable Decision Package makes changed conclusions
and missing evidence inspectable. Requirement crosswalk: `requirements.json`.

## Innovation and existing technical basis

Extend BuildAndDo's existing advisory decision runtime, semantic envelopes and
evidence review workflow. A package couples a bounded trade study to exact input
digests, validity windows and retained revisions. This is a testable integration
hypothesis; synthetic demonstrations do not establish operational benefit.

## Decision schema and evaluation

`point/decision/input.json` contains the objective, alternatives, weighted criteria,
hard constraints, assumptions, risks, bias checks and cited numeric evidence.
The implemented evaluator uses weighted min/max normalization, abstains on ties,
and holds the whole comparison for missing, stale or conflicting support.
`point/decision.json` preserves tradeoffs and reevaluation triggers. Domain
experts must review the criteria and normalization before operational use.

## Agent governance and human control

An agent may elicit candidate inputs and propose a workflow. The current package
compiler is deterministic and does not call a model. Outputs remain A0 advisory,
with independent verification UNMEASURED and human approval PENDING. Existing
mission approval and separate-reviewer rules own execution authority. A reviewed
agent adapter and real elicitation sessions remain Phase I work.

## Evidence, semantic relationships and verification

Each observation has a tenant, source digest and time window. `causality.json`
links the decision to canonical observations; those dependencies are not proof
of causality. Package verification recomputes the decision, and the bundle
verifier checks split evidence, history and conclusions. Required remaining
evidence: an independent reviewer, exact external source receipts and real
stakeholder acceptance. Hashes alone do not authenticate a source's truth.

## Demo A — point decision

`point/` compares two synthetic architecture designs against cost and latency.
Both designs initially satisfy the latency constraint; the stated weights select
option a. Inspect its decision, source observations, assumptions and escaped HTML
view. This demonstrates the mechanism without claiming a real architecture win.

## Demo B — changed evidence

`refresh/history.json` retains the prior package and the new observation revision.
Option a's synthetic latency changes from 2 to 8 against a limit of 6; the
recommendation switches to option b. The history names the changed input and
preserves before/after evidence. Rerun the verifier to reproduce the flip.

## BuildAndDo dogfood

`release/` consumes a real retained acceptance receipt. Its recommendation is
HOLD: current-candidate acceptance and deployment health are missing. Collect
those receipts and a separate review before treating this example as a release
decision. The compiler neither ships a release nor fills in missing evidence.

## Proposed Phase I milestones

1. Confirm the official scope, applicant eligibility and chosen SBIR/STTR lane;
   have a domain reviewer accept the crosswalk and comparison protocol.
2. Reproduce both demos from retained inputs; test missing evidence, tenant swaps,
   stale assumptions, conflicting bias checks and forged approval failures.
3. Repeat point and refreshed studies with approved real evidence and distinct
   producer/reviewer identities; measure reproducibility, review time and
   decision-change explanations against a predeclared baseline.
4. Deliver a reviewed schema, reproducible packages, limitations and a costed
   transition plan. Numeric improvement targets require baseline measurement.

## Commercial transition and open items

The same package can support educational projects, software-release reviews and
engineering procurement studies. The membership desk provides a governed place
to prepare work; it does not establish federal eligibility. Budget, investigator,
customer commitments, institutional partnership if required, and submission
authorization are owner decisions still outstanding.
"""
        )
    return (
        lead
        + """## Market architecture

Reuse the existing deterministic uniform-price auction. The retained experiment
has six agents, two assets, scarce unit supply and a changing public news feed.
Private valuations determine utility; the same dataset and seed support paired
controls. `dataset.json` fixes the experimental inputs. This bounded seed is not
a simulation of an actual financial market or a complete program deliverable.

## Black-box agent interface

`MarketAgent` binds an identity, provider, model and version to an async action
function. Each request exposes only that agent's value and released public news.
The response is a bounded bid. Exact prompts, responses and digests are retained;
timeouts or malformed actions hold the episode without silently dropping agents.
No weights, hidden state or internal access to the tested model are required.

## Stock agents and controls

`truthful.json` and `shaded.json` record two scripted policies under the same
conditions. They are controls, not LLM results. The receiving experiment owner
must bind approved providers and versions, retain failed episodes, expand the
stock-agent suite and record inference settings and cost before cross-model claims.

## Quantitative outputs

`comparison.json` contains actual local allocative-efficiency and utility metrics
with replay results. The truthful fixture supplies the available-surplus baseline.
No official efficiency target is claimed. Performance on scripted fixtures cannot
be generalized to model behavior; report per-seed variation and confidence
intervals only after repeated real-model episodes exist.

## News, behavioral classification and bias

News affects valuations when its declared round arrives. Private values and
unreleased events are excluded from agent prompts. The auction's counterfactual
replay holds recorded actions fixed; it does not measure a model's response to
changed information. Collaboration, deception and bias remain UNMEASURED until
independent labeled controls, an annotation protocol and classifier validation
exist. A shaded bid alone is not evidence of deceptive intent.

## Experimental protocol and reproducibility

Freeze dataset, seed, models, inference settings and outcome definitions before
comparison. Run paired episodes, retain every receipt and failure, then use
`market-replay` and `verify-sprint` to recompute prompts, orders, clearing and
metrics. A separate verifier should inspect information isolation and labels.
Hashes establish byte continuity, not provider authenticity or model repeatability.

## Scaling hypothesis and proposed milestones

Test whether the same black-box contract can compare heterogeneous agents while
preserving information boundaries and reproducibility. First reproduce the two
controls; then run approved model bindings over predeclared repeated seeds. Add
independently labeled behavioral controls, missing-provider and adversarial-news
conditions. Expand toward the reported ten-agent-model target only after the
official scope is confirmed. Record latency, cost, uncertainty and classifier
error as the population grows; do not extrapolate from the six-agent fixture.

## Remaining proposal decisions

Confirm the official notice, topic, deadlines and eligibility. Assign an
investigator, independent verifier and data reviewer; cost the model runs and
annotation effort. `requirements.json` records current capability and evidence
gaps. A real cross-model result and validated classifier remain required before
claiming that the research hypothesis has been demonstrated.
"""
    )


def compile_sprint(
    output: Path, *, at: str | None = None, repository: Path = ROOT
) -> dict[str, object]:
    """Create a new immutable local bundle; never execute models, payments or submissions."""
    observed = at or datetime.now(timezone.utc).isoformat()
    instant(observed)
    plan = load_plan()
    first = evaluate(demo_input(observed), at=observed)
    later_at = (instant(observed) + timedelta(minutes=1)).isoformat()
    longitudinal = refresh(first, demo_input(later_at, changed=True), at=later_at)
    release = evaluate(release_input(repository, observed), at=observed)
    dataset = market_dataset()
    controls = [
        asyncio.run(episode(dataset, scripted_agents(dataset, shaded=shaded), seed=23))
        for shaded in (False, True)
    ]
    source_manifest = {
        path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        for path in SOURCE_FILES
    }
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "properties": [
                {
                    "name": "buildanddo:scope",
                    "value": "bounded source inventory; not a complete runtime SBOM",
                }
            ]
        },
        "components": [
            {
                "type": "file",
                "name": path,
                "hashes": [{"alg": "SHA-256", "content": digest}],
            }
            for path, digest in source_manifest.items()
        ],
    }
    with staging(output) as directory:
        _write(directory, "plan.json", plan, observed)
        _write(directory, "SBOM.json", sbom, observed)
        _write(directory, "source-manifest.json", source_manifest, observed)
        _export_package(directory, "army/point", first, observed)
        _export_package(
            directory, "army/refresh", obj(longitudinal["current"]), observed
        )
        _export_package(directory, "army/release", release, observed)
        _write(directory, "army/refresh/history.json", longitudinal, observed)
        _write(directory, "influence/dataset.json", dataset, observed)
        for name, record in zip(("truthful", "shaded"), controls, strict=True):
            _write(directory, f"influence/{name}.json", record, observed)
        _write(
            directory,
            "influence/comparison.json",
            _comparison(controls),
            observed,
        )
        _write(directory, "fherma/doctor.json", doctor(), observed)
        for raw in rows(plan["lanes"], 3, 3):
            lane = obj(raw)
            _write(
                directory,
                f"{lane['id']}/requirements.json",
                lane["requirements"],
                observed,
            )
            if lane["id"] == "fherma":
                continue
            _write(directory, f"{lane['id']}/proposal.md", _proposal(lane), observed)
        summary = _summary(observed, first, longitudinal, release, controls)
        _write(directory, "summary.json", summary, observed)
        manifest = {
            str(path.relative_to(directory)): hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            for path in sorted(directory.rglob("*"))
            if path.is_file()
        }
        _write(
            directory,
            "manifest.json",
            {"schema_version": "buildanddo.research-manifest/v1", "files": manifest},
            observed,
        )
    return summary


def verify_sprint(directory: Path) -> dict[str, object]:
    """Check exact bundle bytes and replay both decision and market computations."""
    from foundry.shared.federal_foundry.validation import read_json

    manifest = obj(read_json(directory, "manifest.json").get("files"))
    require(
        set(manifest)
        == {
            str(path.relative_to(directory))
            for path in directory.rglob("*")
            if path.is_file()
        }
        - {"manifest.json", "manifest.json.cgrf.yaml"},
        "bundle_file_set_changed",
    )
    from foundry.shared.federal_foundry.validation import read_bytes

    for path, expected in manifest.items():
        require(
            hashlib.sha256(read_bytes(directory, path)).hexdigest() == expected,
            "bundle_bytes_changed",
        )
    packages = {}
    for name in ("point", "refresh", "release"):
        package = read_json(directory, f"army/{name}/decision.json")
        packages[name] = package
        for part, value in _package_parts(package).items():
            require(
                read_bytes(directory, f"army/{name}/{part}.json").strip()
                == canonical_json(value),
                "split_package_changed",
            )
    history = read_json(directory, "army/refresh/history.json")
    current = obj(history["current"])
    require(
        history.get("previous") == packages["point"]
        and current == packages["refresh"]
        and history
        == refresh(
            obj(history["previous"]),
            obj(current["input"]),
            at=str(current["evaluated_at"]),
        ),
        "refresh_history_changed",
    )
    controls = [
        read_json(directory, f"influence/{name}.json")
        for name in ("truthful", "shaded")
    ]
    dataset = read_json(directory, "influence/dataset.json")
    require(
        all(control.get("dataset") == dataset for control in controls),
        "market_datasets_differ",
    )
    require(
        read_json(directory, "influence/comparison.json") == _comparison(controls),
        "market_comparison_changed",
    )
    summary = read_json(directory, "summary.json")
    require(
        summary
        == _summary(
            str(packages["point"]["evaluated_at"]),
            packages["point"],
            history,
            packages["release"],
            controls,
        ),
        "bundle_summary_changed",
    )
    return {
        "state": "PASS",
        "files_checked": len(manifest),
        "scope": "local integrity and replay; independent acceptance remains unmeasured",
        "authorized": False,
    }
