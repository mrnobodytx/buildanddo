# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/compiler.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/federal_foundry/catalog.py, apps/federal_foundry/protocol.py, apps/federal_foundry/evidence.py, apps/mission_suite/bundle.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/federal_foundry/catalog.py; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Compile model-independent Bits packets and proposal projections from one catalogue and inspected evidence instead of invented claims.
# ───────────────────────────────────────────────────────────────

"""Compile reviewable Bits work packages from one opportunity/evidence catalogue."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from apps.mission_suite.bundle import source_fingerprint
from apps.mission_suite.engine import instant, obj, text
from scripts.ci.evidence_epoch import sha256_json
from apps.federal_foundry.catalog import (
    FoundryError,
    named,
    objects,
    require,
    seeds,
    strings,
    validate_catalog,
)
from apps.federal_foundry.evidence import evaluate
from apps.federal_foundry.protocol import make_task


def json_text(value: object) -> str:
    """Serialize reproducible finite JSON with a final newline."""
    return (
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True, allow_nan=False)
        + "\n"
    )


def yaml_text(value: object, indent: int = 0) -> str:
    """Serialize the catalogue's JSON types as safe YAML without tags or anchors."""
    prefix = " " * indent
    if isinstance(value, dict) and value:
        lines = []
        for key, item in value.items():
            head = prefix + json.dumps(str(key)) + ":"
            if isinstance(item, (dict, list)) and item:
                lines.append(head + "\n" + yaml_text(item, indent + 2))
            else:
                lines.append(
                    head + " " + json.dumps(item, ensure_ascii=True, allow_nan=False)
                )
        return "\n".join(lines)
    if isinstance(value, list) and value:
        return "\n".join(
            prefix + "-\n" + yaml_text(item, indent + 2)
            if isinstance(item, (dict, list)) and item
            else prefix + "- " + json.dumps(item, ensure_ascii=True, allow_nan=False)
            for item in value
        )
    return prefix + json.dumps(value, ensure_ascii=True, allow_nan=False)


def markdown(value: object) -> str:
    """Escape catalogue and receipt text used inside generated Markdown tables."""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("|", "\\|")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def table(columns: list[str], rows: list[list[object]]) -> str:
    """Render a compact table without allowing source text to create new cells."""
    return (
        "\n".join(
            [
                "| " + " | ".join(columns) + " |",
                "| " + " | ".join("---" for _ in columns) + " |",
                *[
                    "| " + " | ".join(markdown(cell) for cell in row) + " |"
                    for row in rows
                ],
            ]
        )
        + "\n"
    )


def cgrf(path: str, srs_code: str, at: str, *, stage: str = "06_PLAN") -> str:
    """Mark generated drafts with their scope and lack of execution authority."""
    return "\n".join(
        [
            "# ─── CGRF Header ───────────────────────────────────────────────",
            "# File:        " + path,
            "# Stage:       " + stage,
            "# SRS:         " + srs_code,
            "# CAPS:        pending",
            "# CK:          pending",
            "# Dispatch:    VCC-BUILDANDDO-UPGRADE-001",
            "# Seat:        BITS-CODEGEN",
            "# Owner:       Citadel Nexus Inc.",
            "# Created:     " + at[:10],
            "# Depends:     apps/federal_foundry/opportunities.json",
            "# EnumType:    Doc",
            "# EnumEdges:   CONSUMES apps/federal_foundry/opportunities.json",
            "# DAG Node:    none",
            "# Intent:      Project declared scope and inspected evidence into a reviewable draft.",
            "# ───────────────────────────────────────────────────────────────",
            "",
        ]
    )


def lane_documents(
    catalog: dict[str, object],
    lane: dict[str, object],
    result: dict[str, object],
) -> dict[str, str]:
    """Produce substantive proposal projections without filling unknown facts."""
    title, objective = text(lane["title"], 160), text(lane["objective"], 2400)
    requirements = objects(result["requirements"])
    claims = objects(result["claims"])
    requirement_table = table(
        [
            "Requirement",
            "Acceptance",
            "Evidence kind",
            "State",
            "Supported candidates",
            "Receipts",
        ],
        [
            [
                row["id"],
                row["statement"],
                row["required_kind"],
                row["state"],
                ", ".join(strings(row["supported_candidates"])) or "none",
                ", ".join(strings(row["record_ids"])) or "none",
            ]
            for row in requirements
        ],
    )
    claim_table = table(
        [
            "Claim",
            "Statement",
            "Required checks",
            "Evidence state",
            "Supported candidates",
            "Human approval",
        ],
        [
            [
                row["id"],
                row["statement"],
                ", ".join(strings(row["requirements"])),
                row["state"],
                ", ".join(strings(row["supported_candidates"])) or "none",
                "pending",
            ]
            for row in claims
        ],
    )
    metric_table = table(
        ["Metric", "Unit", "Aggregate", "Direction", "Target from owner brief"],
        [
            [
                row["id"],
                row["unit"],
                row["aggregate"],
                row["direction"],
                "Unset; approve an experiment target"
                if row["target"] is None
                else str(row["comparator"]) + " " + str(row["target"]),
            ]
            for row in named(lane["metrics"]).values()
        ],
    )
    missing = "\n".join(
        "- " + markdown(item) for item in strings(lane["evidence_missing"])
    )
    controls = "\n".join(
        "- " + markdown(item) for item in strings(obj(lane["experiment"])["controls"])
    )
    architecture = "\n\n".join(markdown(item) for item in strings(lane["architecture"]))
    candidates = table(
        ["Candidate", "Approach"],
        [[name, row["approach"]] for name, row in named(lane["candidates"]).items()],
    )
    milestones = table(
        ["Milestone", "Predecessors", "Deliverable"],
        [
            [name, ", ".join(strings(row["depends_on"])) or "none", row["objective"]]
            for name, row in named(lane["milestones"]).items()
        ],
    )
    pending = table(
        ["Human gate", "State"],
        [[row["gate"], row["state"]] for row in objects(result["human_gates"])],
    )
    summary = (
        f"{result['requirements_with_passing_evidence']}/{result['requirements_total']} "
        "requirements have passing declared evidence. This is an evidence count, "
        "not product completion, technical eligibility or submission approval.\n"
    )
    topic = obj(lane["topic"])
    scope = (
        "Topic: "
        + markdown(topic["reference"])
        + " ("
        + markdown(topic["agency"])
        + "). "
        "Official verification, deadline and eligibility: unverified.\n\n"
        + markdown(obj(lane["submission_format"])["notes"])
        + "\n"
    )
    common = "# " + title + "\n\nDRAFT — submission remains HOLD.\n\n"
    docs = {
        "requirements_matrix.md": common + scope + "\n" + requirement_table,
        "claim_evidence_matrix.md": common + summary + "\n" + claim_table,
        "architecture.md": common
        + objective
        + "\n\n"
        + architecture
        + "\n\n"
        + "Shared components\n\n"
        + "\n".join(
            "- " + markdown(row["intent"])
            for row in objects(catalog["shared_components"])
        )
        + "\n\nReuse after inspection\n\n"
        + "\n".join("- " + markdown(path) for path in strings(lane["reuse"]))
        + "\n",
        "experiment_plan.md": common
        + objective
        + "\n\n"
        + candidates
        + "\n"
        + metric_table
        + "\nInitial reproducibility seeds: "
        + ", ".join(str(seed) for seed in seeds(obj(lane["experiment"])["seeds"]))
        + ". These seeds do not establish statistical power.\n\n"
        + controls
        + "\n\nFreeze dataset and benchmark hashes before tuning. Emit one measurement "
        "receipt per candidate/requirement and retain failures. A distinct verifier "
        "reviews exact receipt bytes. Hardware claims require observed physical evidence.\n",
        "results.json": json_text(result),
        "benchmark_report.md": common
        + summary
        + "\n"
        + metric_table
        + "\nNo candidate ranking is inferred from file or test counts. Use the compare "
        "command with explicit candidate IDs and independently reviewed measurement receipts. "
        "Reports include sample count and descriptive dispersion; statistical significance "
        "and promotion require independent analysis.\n\n"
        + table(
            ["Receipt", "Candidate", "Check", "Kind", "State", "SHA-256"],
            [
                [
                    row["record_id"],
                    row["candidate_id"],
                    row["requirement_id"],
                    row["kind"],
                    row["state"],
                    row["receipt_sha256"],
                ]
                for row in objects(result["records"])
            ],
        ),
        "gap_report.md": common
        + summary
        + "\n"
        + missing
        + "\n\n"
        + table(
            ["Requirement", "Evidence state"],
            [
                [row["id"], row["state"]]
                for row in requirements
                if row["state"] != "PASS"
            ],
        ),
        "risk_register.md": common
        + table(
            ["Risk", "Mitigation"],
            [[row["risk"], row["mitigation"]] for row in objects(lane["risks"])],
        )
        + "\n"
        + pending,
        "SOW.md": common
        + objective
        + "\n\n"
        + milestones
        + "\nAcceptance is the requirement/evidence matrix. Assign an execution dispatch, "
        "owner, budget, dates and official scope before committing this research SOW. "
        "No fixed price, staffing commitment or government award is asserted.\n",
        "commercialization.md": common
        + "Potential product capability to assess: "
        + objective
        + "\n\n"
        "Citadel Nexus Inc. must validate the intended users, purchasing route and "
        "competitive alternatives with actual interviews or public sources. Customer demand, "
        "revenue, partner commitments and market size have not been established by this portfolio.\n\n"
        "Review reused code licenses, model terms, dataset rights, foreground IP and "
        "commercial-use restrictions before a commercialization claim. Funding needs, "
        "pricing and commercialization milestones require owner-approved evidence.\n",
        "whitepaper.md": common
        + scope
        + "\nProblem and proposed contribution\n\n"
        + objective
        + "\n\nTechnical approach\n\n"
        + architecture
        + "\n\nExperiment and alternatives\n\n"
        + candidates
        + "\n"
        + metric_table
        + "\nEvidence available for review\n\n"
        + summary
        + "\n"
        + claim_table
        + "\nWork plan\n\n"
        + milestones
        + "\nGaps and risks\n\n"
        + missing
        + "\n\nManagement, commercialization, funding and IP\n\n"
        "Team qualifications, personnel availability, prior funding, cost proposal and "
        "commercialization claims require the owner's actual records and approval. "
        "No partner, award, customer or certification is inferred from code output.\n\n"
        "Submission-format limits remain unverified. This Markdown is a source draft; "
        "pagination, references and any rendered package need a separate review.\n",
        "slides/outline.md": common
        + "1. Problem and research hypothesis\n\n"
        + objective
        + "\n\n2. Proposed architecture\n\n"
        + architecture
        + "\n\n3. Experimental comparison\n\n"
        + candidates
        + "\n\n4. Observed evidence and open gaps\n\n"
        + summary
        + "\n"
        + missing
        + "\n\n5. Work plan and requested human decisions\n\n"
        + milestones
        + "\nThis five-part outline is a review aid, not a verified agency page/slide limit "
        "or a replacement for the existing Maritime slide/claim mapping.\n",
        "submission_checklist.md": common
        + scope
        + "\n"
        + pending
        + "\nSource generation never approves submission. Preserve the actual human "
        "decision and final portal acknowledgment in the existing mission/evidence flow.\n",
    }
    return docs


def compile_portfolio(
    catalog: dict[str, object],
    output: Path,
    *,
    manifests: list[dict[str, object]] | None = None,
    evidence_root: Path | None = None,
    evaluated_at: str | None = None,
) -> dict[str, object]:
    """Write a new portable portfolio only after validating all input evidence."""
    validate_catalog(catalog)
    source_sha256 = source_fingerprint()
    at = evaluated_at or datetime.now(timezone.utc).isoformat()
    instant(at)
    supplied: dict[str, dict[str, object]] = {}
    for manifest in manifests or []:
        obj(
            manifest,
            {"schema_version", "lane_id", "evaluated_at", "receipts", "reviews"},
        )
        lane_id = text(manifest.get("lane_id"), 80)
        require(
            lane_id not in supplied and lane_id in named(catalog["opportunities"]),
            "duplicate_or_unknown_lane",
        )
        supplied[lane_id] = manifest
    require(not supplied or evidence_root is not None, "evidence_root_required")
    files: dict[str, str] = {}
    tasks = []
    for lane_id, lane in named(catalog["opportunities"]).items():
        manifest = supplied.get(
            lane_id,
            {
                "schema_version": "federal.evidence/v1",
                "lane_id": lane_id,
                "evaluated_at": at,
                "receipts": [],
                "reviews": [],
            },
        )
        require(instant(manifest["evaluated_at"]) <= instant(at), "future_manifest")
        result = evaluate(catalog, manifest, evidence_root or Path.cwd())
        srs = text(lane["srs_code"], 100)
        for name, content in lane_documents(catalog, lane, result).items():
            path = lane_id + "/" + name
            files[path] = (
                content if name.endswith(".json") else cgrf(path, srs, at) + content
            )
        opportunity_path = lane_id + "/opportunity.yaml"
        files[opportunity_path] = (
            cgrf(opportunity_path, srs, at, stage="04_HYPOTHESIZE")
            + yaml_text(lane)
            + "\n"
        )
        lane_tasks = [
            make_task(catalog, lane_id, role) for role in ("builder", "verifier")
        ]
        tasks.extend(lane_tasks)
        for task in lane_tasks:
            files[lane_id + "/" + str(task["role"]) + "-task.json"] = json_text(task)
        path = lane_id + "/bits-task.md"
        files[path] = cgrf(path, srs, at, stage="11_COMMIT") + (
            "# Bits intake: " + text(lane["title"], 160) + "\n\n"
            "Status: PREPARED. Execution dispatch: unassigned. Model: selected by the caller.\n\n"
            "SRS: "
            + srs
            + "\nSuggested branch: "
            + str(lane_tasks[0]["suggested_branch"])
            + "\n\n"
            + text(lane["objective"], 2400)
            + "\n\n"
            + "\n".join(
                str(index + 1) + ". " + instruction
                for index, instruction in enumerate(
                    strings(lane_tasks[0]["instructions"])
                )
            )
            + "\n\nAcceptance\n\n"
            + "\n".join(
                "- " + text(row["statement"], 2400)
                for row in named(lane["requirements"]).values()
            )
            + "\n\nUse builder-task.json for implementation and verifier-task.json in a distinct "
            "reviewer session after the builder produces receipts. These files are the repository's "
            "portable contract; they are not a Datadog-hosted API schema or an execution receipt.\n"
        )
    files["bits_tasks.json"] = json_text(
        {
            "schema_version": "federal.bits-intake/v1",
            "catalog_sha256": sha256_json(catalog),
            "source_sha256": source_sha256,
            "intake_status": "PREPARED",
            "max_parallel_lanes": catalog["max_parallel_lanes"],
            "model_selection": "caller",
            "tasks": tasks,
            "hosted_dispatches_created": 0,
        }
    )
    files["README.md"] = cgrf("README.md", "SRS-BUILDANDDO-UPGRADE-001", at) + (
        "# Federal R&D portfolio\n\n"
        "Five lane directories contain opportunity specifications, builder/verifier packets "
        "and evidence-derived proposal drafts. Prepared intake is not a running agent.\n\n"
        "Give each lane its own verified execution dispatch and repository session through "
        "the existing Bits workflow. Select models by capability and bind provider, model, "
        "version and configuration digest at execution time. The compiler makes no model "
        "calls and creates no branches, PRs or submissions.\n\n"
        "Use python -m apps.federal_foundry to validate public measurement/review receipts "
        "or compare explicit candidates. Keep raw receipts in an authorized evidence location; "
        "the proposal projection retains hashes and declared review states. "
        "Unknown eligibility, targets and physical evidence remain open.\n"
    )
    for name in list(files):
        if name.endswith(".json"):
            sidecar = name + ".cgrf.yaml"
            files[sidecar] = cgrf(
                sidecar, "SRS-BUILDANDDO-UPGRADE-001", at, stage="11_COMMIT"
            ) + ("schema_version: 1\ngoverns: " + json.dumps(name) + "\n")
    files["portfolio-manifest.json"] = json_text(
        {
            "schema_version": "federal.bundle/v1",
            "evaluated_at": at,
            "catalog_sha256": sha256_json(catalog),
            "source_sha256": source_sha256,
            "files": [
                {
                    "path": name,
                    "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
                }
                for name, content in sorted(files.items())
            ],
            "authority": "prepared_work_and_declared_evidence_only",
        }
    )
    files["portfolio-manifest.json.cgrf.yaml"] = (
        cgrf(
            "portfolio-manifest.json.cgrf.yaml",
            "SRS-BUILDANDDO-UPGRADE-001",
            at,
            stage="11_COMMIT",
        )
        + "schema_version: 1\ngoverns: portfolio-manifest.json\n"
    )
    require(
        source_fingerprint() == source_sha256
        and all(task["source_sha256"] == source_sha256 for task in tasks),
        "source_changed_during_compile",
    )
    require(not output.exists() and not output.is_symlink(), "output_exists")
    require(
        output.parent.is_dir()
        and not any(parent.is_symlink() for parent in (output.parent, *output.parents)),
        "unsafe_output",
    )
    try:
        output.mkdir()
        for name, content in sorted(files.items()):
            destination = output / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("x", encoding="utf-8", newline="\n") as stream:
                stream.write(content)
    except OSError:
        # Never delete or overwrite another run; retain any partial output for inspection.
        raise FoundryError("output_write_failed") from None
    return {
        "state": "COMPILED",
        "output": str(output),
        "opportunities": len(named(catalog["opportunities"])),
        "files": len(files),
        "tasks": len(tasks),
        "intake_status": "PREPARED",
        "source_sha256": source_sha256,
        "catalog_sha256": sha256_json(catalog),
        "hosted_dispatches_created": 0,
        "submission_authorized": False,
    }
