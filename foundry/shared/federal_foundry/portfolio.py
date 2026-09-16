# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/portfolio.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/registry.py, foundry/templates/submission_checklist.md
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/evidence.py; DEPENDS_ON foundry/shared/federal_foundry/registry.py; USES_TEMPLATE foundry/templates/submission_checklist.md
# DAG Node:    foundry.portfolio.compiler
# Intent:      Compile deterministic reviewer bundles from lane-authored plans and explicit evidence.
# ───────────────────────────────────────────────────────────────

"""Compile deterministic lane and portfolio review bundles."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable
import hashlib
import json

from .evidence import (
    ClaimEvidenceCompiler,
    ClaimRow,
    RequirementRow,
    RequirementTracker,
    evidence_index,
)
from .models import EvidenceRecord, FoundryValidationError, Opportunity
from .registry import OpportunityRegistry


COPIED_ARTIFACTS = (
    "architecture.md",
    "experiment_plan.md",
    "risk_register.md",
    "SOW.md",
    "commercialization.md",
    "whitepaper.md",
    "results.json",
    "results.json.cgrf.yaml",
)


def _write(path: Path, content: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, str):
        path.write_text(content, encoding="utf-8", newline="\n")
    else:
        path.write_bytes(content)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _available_evidence(opportunity: Opportunity) -> tuple[EvidenceRecord, ...]:
    return tuple(
        EvidenceRecord.from_mapping(record, f"evidence_available[{index}]")
        for index, record in enumerate(opportunity.evidence_available)
    )


def _gap_report(
    opportunity: Opportunity,
    requirements: Iterable[RequirementRow],
    claims: Iterable[ClaimRow],
) -> str:
    lines = ["# Gap report", "", "## Declared evidence gaps", ""]
    missing = sorted(opportunity.evidence_missing, key=lambda record: str(record["id"]))
    if missing:
        lines.extend(
            f"- `{record['id']}` — {record['description']}" for record in missing
        )
    else:
        lines.append("- None declared.")
    lines.extend(["", "## Open requirements", ""])
    open_rows = [
        row for row in requirements if row.status not in {"satisfied", "not_applicable"}
    ]
    lines.extend(
        (f"- `{row.requirement_id}` — {row.status}: {row.text}" for row in open_rows),
    )
    if not open_rows:
        lines.append("- None.")
    lines.extend(["", "## Unsupported or planned claims", ""])
    open_claims = [row for row in claims if row.support_level != "verified"]
    lines.extend(
        (
            f"- `{row.claim_id}` — {row.support_level}: {row.text}"
            for row in open_claims
        ),
    )
    if not open_claims:
        lines.append("- None.")
    return "\n".join(lines) + "\n"


def _benchmark_report(benchmarks: Iterable[dict[str, object]]) -> str:
    rows = sorted(benchmarks, key=lambda record: str(record["id"]))
    lines = [
        "# Benchmark report",
        "",
        "| ID | Status | Candidate | Metrics | Evidence |",
        "|---|---|---|---|---|",
    ]
    if not rows:
        lines.append("| none | not_run | none | none | none |")
    for row in rows:
        metrics = json.dumps(
            row.get("metrics", {}), sort_keys=True, separators=(",", ":")
        )
        raw_evidence = row.get("evidence_ids", [])
        if not isinstance(raw_evidence, list) or not all(
            isinstance(item, str) for item in raw_evidence
        ):
            raise FoundryValidationError(
                "benchmark evidence_ids must be a list of strings"
            )
        evidence = ", ".join(raw_evidence) or "none"
        lines.append(
            f"| {row['id']} | {row['status']} | {row.get('candidate_id', 'unknown')} | {metrics} | {evidence} |"
        )
    return "\n".join(lines) + "\n"


def _submission_checklist(
    opportunity: Opportunity,
    requirements_complete: bool,
    claims: Iterable[ClaimRow],
) -> str:
    claims_complete = all(row.support_level == "verified" for row in claims)
    lines = [
        "# Submission checklist",
        "",
        f"- [{'x' if requirements_complete else ' '}] Engineering requirements have verified evidence.",
        f"- [{'x' if claims_complete else ' '}] Every included claim is supported by verified evidence.",
        f"- [{'x' if opportunity.deadline else ' '}] Official deadline and topic revision are recorded.",
        "- [ ] Eligibility was reviewed against the current official solicitation.",
        "- [ ] IP, data-rights, pricing and commercialization assertions were approved.",
        "- [ ] Team, key-personnel and partner representations were approved.",
        "- [ ] Required physical and hardware evidence was independently verified.",
        "- [ ] Page, slide, attachment and portal-format checks passed on final bytes.",
        "- [ ] A named human approved the exact submission package.",
        "- [ ] The portal receipt was preserved after submission.",
        "",
        "Compiler output is advisory and never checks the final human or portal boxes.",
    ]
    return "\n".join(lines) + "\n"


class PortfolioCompiler:
    """Compile lane evidence into deterministic, non-mutating review bundles."""

    def __init__(self, repository_root: Path) -> None:
        self.repository_root = repository_root.resolve()
        self.foundry_root = self.repository_root / "foundry"
        self.registry = OpportunityRegistry(self.foundry_root)

    @staticmethod
    def _new_directory(path: Path) -> Path:
        if path.exists():
            raise FoundryValidationError(f"output already exists: {path}")
        path.mkdir(parents=True)
        return path

    def compile_lane(self, lane_id: str, destination: Path) -> dict[str, object]:
        """Compile one lane into a new destination directory."""

        opportunity = self.registry.load(lane_id)
        results = self.registry.load_results(lane_id)
        evidence = evidence_index(
            (*_available_evidence(opportunity), *results.evidence)
        )
        tracker = RequirementTracker(opportunity, evidence)
        tracker.apply(results.requirement_updates)
        claim_compiler = ClaimEvidenceCompiler(opportunity, evidence)
        claim_rows = claim_compiler.compile(results.claim_updates)
        lane_source = self.foundry_root / "lanes" / lane_id
        output = self._new_directory(destination)
        _write(output / "requirements_matrix.md", tracker.to_markdown())
        _write(
            output / "claim_evidence_matrix.md",
            claim_compiler.to_markdown(claim_rows),
        )
        _write(
            output / "gap_report.md",
            _gap_report(opportunity, tracker.rows(), claim_rows),
        )
        _write(output / "benchmark_report.md", _benchmark_report(results.benchmarks))
        _write(
            output / "submission_checklist.md",
            _submission_checklist(opportunity, tracker.is_complete(), claim_rows),
        )
        for relative in COPIED_ARTIFACTS:
            source = lane_source / relative
            if not source.is_file():
                raise FoundryValidationError(f"lane artifact is missing: {source}")
            _write(output / relative, source.read_bytes())
        slides = lane_source / "slides"
        if not slides.is_dir():
            raise FoundryValidationError(f"lane slides directory is missing: {slides}")
        for source in sorted(path for path in slides.rglob("*") if path.is_file()):
            _write(output / "slides" / source.relative_to(slides), source.read_bytes())
        artifacts = {
            str(path.relative_to(output)): _sha256(path)
            for path in sorted(output.rglob("*"))
            if path.is_file()
        }
        manifest: dict[str, object] = {
            "schema_version": "foundry.bundle/v1",
            "lane_id": lane_id,
            "engineering_requirements_complete": tracker.is_complete(),
            "claims_verified": all(
                row.support_level == "verified" for row in claim_rows
            ),
            "human_review_required": True,
            "artifacts": artifacts,
        }
        _write(
            output / "manifest.json",
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        )
        return manifest

    def compile_portfolio(self, destination: Path) -> dict[str, object]:
        """Compile every registered lane and a deterministic portfolio index."""

        output = self._new_directory(destination)
        manifests: list[dict[str, object]] = []
        for lane_id in self.registry.lane_ids():
            manifests.append(self.compile_lane(lane_id, output / lane_id))
        lines = [
            "# Federal R&D portfolio review index",
            "",
            "| Lane | Engineering requirements complete | Claims verified | Human review |",
            "|---|---|---|---|",
        ]
        for manifest in manifests:
            lines.append(
                f"| {manifest['lane_id']} | {str(manifest['engineering_requirements_complete']).lower()} | "
                f"{str(manifest['claims_verified']).lower()} | required |"
            )
        lines.extend(
            [
                "",
                "No row is submission approval. Eligibility and final-package review remain human gates.",
            ]
        )
        _write(output / "portfolio_index.md", "\n".join(lines) + "\n")
        portfolio: dict[str, object] = {
            "schema_version": "foundry.portfolio/v1",
            "lanes": manifests,
            "human_review_required": True,
        }
        _write(
            output / "portfolio_manifest.json",
            json.dumps(portfolio, indent=2, sort_keys=True) + "\n",
        )
        return portfolio
