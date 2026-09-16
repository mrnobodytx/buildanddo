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
# Depends:     foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/benchmarks.py, foundry/shared/federal_foundry/reporting.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/evidence.py; DEPENDS_ON foundry/shared/federal_foundry/benchmarks.py; DEPENDS_ON foundry/shared/federal_foundry/reporting.py
# DAG Node:    none
# Intent:      Compile deterministic self-contained review bundles only after checking referenced evidence and measured campaign bytes.
# ───────────────────────────────────────────────────────────────

"""Compile, verify and package deterministic evidence-based portfolio bundles."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
import os
import tempfile
import zipfile

from .benchmarks import load_plan, verify_campaign
from .evidence import ClaimEvidenceCompiler, RequirementTracker, evidence_index
from .models import EvidenceRecord, FoundryValidationError, LaneResults, Opportunity
from .registry import OpportunityRegistry
from . import reporting
from .validation import (
    digest,
    manifest,
    mapping,
    read_bytes,
    read_json,
    records,
    staging,
    strings,
    verify_manifest,
    write_json,
)

COPIED_ARTIFACTS = (
    "architecture.md",
    "risk_register.md",
    "SOW.md",
    "commercialization.md",
)


def _write(output: Path, relative: str, content: str | bytes) -> None:
    path = output / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(content.encode("utf-8") if isinstance(content, str) else content)


def _merge_results(
    source: dict[str, object], measured: dict[str, object] | None
) -> dict[str, object]:
    if measured is None:
        return source
    LaneResults.from_mapping(source)
    LaneResults.from_mapping(measured)
    if source["lane_id"] != measured["lane_id"]:
        raise FoundryValidationError("results refer to different lanes")
    merged = dict(source)
    for section in (
        "evidence",
        "experiments",
        "benchmarks",
        "claim_updates",
        "requirement_updates",
    ):
        old = records(source[section], section)
        new = records(measured[section], section)
        overlap = {row["id"] for row in old} & {row["id"] for row in new}
        if overlap:
            raise FoundryValidationError(
                f"{section} has ambiguous authored and campaign updates"
            )
        merged[section] = old + new
    return merged


def _record(record: EvidenceRecord) -> dict[str, object]:
    value = asdict(record)
    value["id"] = value.pop("evidence_id")
    return value


def _evidence_bytes(record: EvidenceRecord, root: Path) -> bytes | None:
    if record.digest is None:
        # Legacy planning/source descriptions are declared observations, not
        # fingerprinted file evidence. They cannot be promoted to verified.
        return None
    forbidden = (
        "private/",
        "secrets/",
        "golden/",
        "infra/",
        "state/",
        ".git/",
        "_meta/",
    )
    if record.locator.startswith(forbidden) or any(
        part.startswith(".env") for part in Path(record.locator).parts
    ):
        raise FoundryValidationError("evidence references a nonpublic path")
    data = read_bytes(root, record.locator)
    if digest(data) != record.digest:
        raise FoundryValidationError(f"evidence digest mismatch: {record.evidence_id}")
    return data


def _gap_report(opportunity: Opportunity, status: dict[str, object]) -> str:
    return (
        "# Gap report\n\n## Declared evidence gaps\n\n"
        + "\n".join(
            f"- {row['id']}: {row['description']}"
            for row in opportunity.evidence_missing
        )
        + "\n\n## Current requirement and review blockers\n\n"
        + "\n".join(
            f"- {row['id']} ({row['kind']}): {row['reason']}"
            for row in records(status["blockers"])
        )
        + "\n"
    )


class PortfolioCompiler:
    """Compile authored plans and measured attempts without mutating either source."""

    def __init__(self, repository_root: Path) -> None:
        self.repository_root = repository_root.resolve()
        self.foundry_root = self.repository_root / "foundry"
        self.registry = OpportunityRegistry(self.foundry_root)

    def _campaign(self, runs: Path | None, selected: tuple[str, ...]) -> None:
        if runs is not None:
            campaign = verify_campaign(self.repository_root, runs)
            if campaign["status"] == "cancelled":
                raise FoundryValidationError(
                    "cancelled campaign retains attempts but cannot be compiled"
                )
            if not set(selected).issubset(strings(campaign["lanes"])):
                raise FoundryValidationError(
                    "campaign does not contain every selected lane"
                )

    def _build_lane(
        self, lane_id: str, output: Path, runs: Path | None
    ) -> dict[str, object]:
        opportunity = self.registry.load(lane_id)
        plan = load_plan(self.repository_root, lane_id)
        source_root = self.foundry_root / "lanes" / lane_id
        source = read_json(source_root, "results.json")
        summary = read_json(runs / lane_id, "summary.json") if runs else None
        measured = read_json(runs / lane_id, "results.json") if runs else None
        raw_results = _merge_results(source, measured)
        results = LaneResults.from_mapping(raw_results)
        if results.lane_id != lane_id:
            raise FoundryValidationError("results lane identity mismatch")
        available = tuple(
            EvidenceRecord.from_mapping(row, "opportunity evidence")
            for row in opportunity.evidence_available
        )
        evidence = evidence_index((*available, *results.evidence))
        requirement_ids = {str(row["id"]) for row in opportunity.requirements}
        claim_ids = {str(row["id"]) for row in opportunity.claims}
        measured_ids = (
            {str(row["id"]) for row in records(measured["evidence"])}
            if measured
            else set()
        )
        evidence_data: dict[str, bytes] = {}
        index: list[dict[str, object]] = []
        for identity, record in sorted(evidence.items()):
            if (
                set(record.requirement_ids) - requirement_ids
                or set(record.claim_ids) - claim_ids
            ):
                raise FoundryValidationError(
                    "evidence scope references a foreign requirement or claim"
                )
            origin = (
                runs / lane_id
                if runs is not None and identity in measured_ids
                else self.repository_root
            )
            data = _evidence_bytes(record, origin)
            row = _record(record)
            row["byte_verification"] = (
                "matched"
                if data is not None
                else "declared locator; bytes not fingerprinted"
            )
            row["original_locator"] = record.locator
            if data is not None:
                relative = f"evidence/{record.digest}.bin"
                row["locator"] = relative
                evidence_data[relative] = data
            index.append(row)
        for run_record in (*results.experiments, *results.benchmarks):
            refs = strings(run_record.get("evidence_ids", []))
            if set(refs) - set(evidence):
                raise FoundryValidationError(
                    "experiment or benchmark references unknown evidence"
                )
            if run_record["status"] == "succeeded" and not refs:
                raise FoundryValidationError(
                    "successful experiment or benchmark needs evidence"
                )
        tracker = RequirementTracker(opportunity, evidence)
        tracker.apply(results.requirement_updates)
        claim_compiler = ClaimEvidenceCompiler(opportunity, evidence)
        claim_rows = claim_compiler.compile(results.claim_updates)
        status = reporting.readiness(opportunity, tracker.rows(), claim_rows, summary)
        output.mkdir()
        for relative in COPIED_ARTIFACTS:
            _write(output, relative, read_bytes(source_root, relative))
        # Preserve the authored paper and slide sources alongside the generated brief.
        _write(
            output, "authored/whitepaper.md", read_bytes(source_root, "whitepaper.md")
        )
        _write(
            output,
            "authored/experiment_plan.md",
            read_bytes(source_root, "experiment_plan.md"),
        )
        slides_root = source_root / "slides"
        if not slides_root.is_dir() or slides_root.is_symlink():
            raise FoundryValidationError("lane slides directory is missing or linked")
        for relative in manifest(slides_root):
            _write(
                output, f"authored/slides/{relative}", read_bytes(slides_root, relative)
            )
        _write(
            output,
            "opportunity.yaml",
            read_bytes(self.foundry_root, f"registry/{lane_id}/opportunity.yaml"),
        )
        _write(output, "experiment_plan.md", reporting.experiment_report(plan.document))
        for relative, data in evidence_data.items():
            _write(output, relative, data)
        if runs is not None:
            for relative in manifest(runs / lane_id):
                _write(
                    output,
                    "run_evidence/" + relative,
                    read_bytes(runs / lane_id, relative),
                )
        # Rewrite generated result locators to the bytes in this self-contained bundle.
        relocated = {str(row["id"]): row["locator"] for row in index}
        raw_results = {
            **raw_results,
            "evidence": [
                {**row, "locator": relocated[str(row["id"])]}
                for row in records(raw_results["evidence"])
            ],
        }
        # Only campaign experiment receipts have the run_evidence prefix.
        campaign_run_ids = (
            {str(row["id"]) for row in records(measured["experiments"])}
            if measured
            else set()
        )
        raw_results["experiments"] = [
            {
                **row,
                **(
                    {"receipt": "run_evidence/" + str(row["receipt"])}
                    if row["id"] in campaign_run_ids
                    else {}
                ),
            }
            for row in records(raw_results["experiments"])
        ]
        write_json(output / "results.json", raw_results)
        write_json(output / "evidence_index.json", {"evidence": index})
        write_json(output / "readiness.json", status)
        requirements_md = tracker.to_markdown()
        claims_md = claim_compiler.to_markdown(claim_rows)
        gaps_md = _gap_report(opportunity, status)
        for relative, content in (
            ("requirements_matrix.md", requirements_md),
            ("claim_evidence_matrix.md", claims_md),
            ("gap_report.md", gaps_md),
            ("benchmark_report.md", reporting.benchmark_report(summary)),
            (
                "whitepaper.md",
                reporting.technical_brief(
                    opportunity, summary, requirements_md, claims_md, gaps_md
                ),
            ),
        ):
            _write(output, relative, content)
        for name, content in reporting.slides(opportunity, summary, status).items():
            _write(output, f"slides/{name}", content)
        _write(
            output,
            "slides/README.md",
            "# Source briefing\n\nFive generated Markdown slides share the evidence in whitepaper.md. Authored slide sources are preserved under authored/slides. Render and verify final pagination separately.\n",
        )
        checklist = (
            "# Submission checklist\n\n"
            f"- [{'x' if summary and summary['status'] == 'completed' else ' '}] Reference campaign attempts completed with matching repeated computational bytes.\n"
            f"- [{'x' if tracker.is_complete() else ' '}] Engineering requirements have scoped verified evidence.\n"
            "- [ ] Official deadline, topic revision and eligibility were reviewed against source bytes.\n"
            "- [ ] IP, data rights, cost, team and commercialization assertions were approved.\n"
            "- [ ] Physical feasibility evidence was accepted where required.\n"
            "- [ ] Final rendered pages, slides and attachments meet current official instructions.\n"
            "- [ ] A named human approved the exact submission package.\n"
            "- [ ] The portal receipt was preserved after submission.\n\n"
            "The compiler never checks the final human or portal boxes.\n"
        )
        _write(output, "submission_checklist.md", checklist)
        _write(
            output,
            "index.html",
            reporting.html_view(
                opportunity.topic,
                [status],
                {lane_id: summary} if summary else {},
                portfolio=False,
            ),
        )
        lane_manifest: dict[str, object] = {
            "schema_version": "foundry.bundle/v2",
            "lane_id": lane_id,
            "engineering_requirements_complete": tracker.is_complete(),
            "claims_verified": bool(claim_rows)
            and all(
                row.requested_level == "verified" and row.support_level == "verified"
                for row in claim_rows
            ),
            "human_review_required": True,
            "submission_approval": False,
            "artifacts": manifest(output),
        }
        write_json(output / "manifest.json", lane_manifest)
        return lane_manifest

    def compile_lane(
        self, lane_id: str, destination: Path, *, runs: Path | None = None
    ) -> dict[str, object]:
        """Compile one lane atomically after validating every referenced input."""
        if lane_id not in self.registry.lane_ids():
            raise FoundryValidationError("unknown foundry lane")
        self._campaign(runs, (lane_id,))
        with staging(destination, self.foundry_root) as temporary:
            built = temporary / "lane"
            result = self._build_lane(lane_id, built, runs)
            for path in built.iterdir():
                path.rename(temporary / path.name)
            built.rmdir()
        return result

    def compile_portfolio(
        self, destination: Path, *, runs: Path | None = None
    ) -> dict[str, object]:
        """Compile every lane, a readable portfolio view and an exact artifact manifest."""
        lane_ids = self.registry.lane_ids()
        if not lane_ids:
            raise FoundryValidationError("registry contains no lanes")
        self._campaign(runs, lane_ids)
        with staging(destination, self.foundry_root) as output:
            lanes = [self._build_lane(lane, output / lane, runs) for lane in lane_ids]
            statuses = [read_json(output / lane, "readiness.json") for lane in lane_ids]
            summaries = (
                {lane: read_json(runs / lane, "summary.json") for lane in lane_ids}
                if runs
                else {}
            )
            _write(
                output,
                "portfolio_index.md",
                "# Federal R&D portfolio review index\n\n"
                + reporting.table(
                    (
                        "Lane",
                        "Reference campaign",
                        "Satisfied",
                        "Total",
                        "Partial",
                        "Submission ready",
                    ),
                    (
                        (
                            row["lane_id"],
                            row["reference_campaign"],
                            mapping(row["requirements"])["satisfied"],
                            mapping(row["requirements"])["total"],
                            mapping(row["requirements"])["partial"],
                            False,
                        )
                        for row in statuses
                    ),
                )
                + "\nNo row is submission approval. Eligibility and final-package review remain human gates.\n",
            )
            _write(
                output,
                "index.html",
                reporting.html_view(
                    "Federal R&D Foundry", statuses, summaries, portfolio=True
                ),
            )
            write_json(
                output / "readiness.json",
                {"lanes": statuses, "submission_approval": False},
            )
            result: dict[str, object] = {
                "schema_version": "foundry.portfolio/v2",
                "lanes": lanes,
                "human_review_required": True,
                "submission_approval": False,
                "artifacts": manifest(output),
            }
            write_json(output / "portfolio_manifest.json", result)
        return result


def verify_bundle(directory: Path) -> dict[str, object]:
    """Verify every exported byte, including child manifests and all added files."""
    is_portfolio = (directory / "portfolio_manifest.json").exists()
    name = "portfolio_manifest.json" if is_portfolio else "manifest.json"
    value = read_json(directory, name)
    expected = "foundry.portfolio/v2" if is_portfolio else "foundry.bundle/v2"
    if (
        value.get("schema_version") != expected
        or value.get("human_review_required") is not True
        or value.get("submission_approval") is not False
    ):
        raise FoundryValidationError("invalid bundle contract or submission authority")
    verify_manifest(directory, value.get("artifacts"), exclude=(name,))
    if is_portfolio:
        lane_ids = strings([row.get("lane_id") for row in records(value.get("lanes"))])
        for lane_id, row in zip(lane_ids, records(value["lanes"]), strict=True):
            if verify_bundle(directory / lane_id) != row:
                raise FoundryValidationError("portfolio child manifest differs")
    return value


def package_bundle(directory: Path, archive: Path) -> dict[str, object]:
    """Create a reproducible ZIP after verifying the complete export."""
    verify_bundle(directory)
    if archive.absolute().is_relative_to(directory.absolute()):
        raise FoundryValidationError("archive must be outside the bundle")
    if archive.exists() or archive.is_symlink():
        raise FoundryValidationError("archive already exists")
    for parent in archive.absolute().parents:
        if parent.is_symlink():
            raise FoundryValidationError("archive parents cannot be symlinks")
    archive.parent.mkdir(parents=True, exist_ok=True)
    files = manifest(directory)
    # Write to a temporary sibling so a failed read never publishes a partial ZIP.
    with tempfile.TemporaryDirectory(
        prefix=".foundry-zip-", dir=archive.parent
    ) as temporary:
        path = Path(temporary) / "bundle.zip"
        with zipfile.ZipFile(path, "x", compression=zipfile.ZIP_DEFLATED) as output:
            for name in files:
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(info, read_bytes(directory, name))
        data = path.read_bytes()
        # An exclusive hard link publishes only the complete archive and cannot
        # replace an output that appeared while the ZIP was being written.
        os.link(path, archive)
    return {"archive": str(archive), "files": len(files), "sha256": digest(data)}
