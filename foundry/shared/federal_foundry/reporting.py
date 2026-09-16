# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/reporting.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/validation.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/evidence.py; DEPENDS_ON foundry/shared/federal_foundry/validation.py
# DAG Node:    none
# Intent:      Project actual comparison evidence into readable technical briefs, slides and portfolio readiness views.
# ───────────────────────────────────────────────────────────────

"""Render deterministic technical reports from compiled evidence and measured runs."""

from __future__ import annotations

from collections import Counter
import html
import json
from typing import Iterable

from .evidence import ClaimRow, RequirementRow
from .models import Opportunity
from .validation import mapping, records, strings

DESIGNS = {
    "darpa-dv026-influence": (
        "Replayable multi-agent auction reference",
        "A seeded market kernel records unit bids, valuations, uniform clearing prices, allocations and the best feasible allocation. "
        "The comparison holds supply and news constant while changing truthful bidding to heterogeneous bid shading. "
        "Counterfactual runs remove news while retaining the same agent sensitivities. Agents are scripted, so this establishes no LLM behavior.",
        "Integrate versioned model providers, preregister behavioral labels and evaluate held-out market scenarios.",
    ),
    "navair-acquisition-analysis": (
        "Deterministic acquisition-document retrieval",
        "A fixed tokenizer, source fingerprints and document-ID tie breaks make BM25 and TF-IDF rankings inspectable. "
        "Each recommendation retains matched-term contributions, an excerpt and a source digest. "
        "The same queries and relevance judgments score both candidates; fixture quality is not acquisition-domain effectiveness.",
        "Accept a rights-cleared domain corpus and independent judgments, then add embedding, graph and container baselines.",
    ),
    "daf-nv027-low-swap": (
        "Temporal compute-gating reference",
        "Dense and event-gated projections process the same labelled sequence with the same weights and temporal decay. "
        "The gated candidate omits projection arithmetic on quiet frames while preserving state decay. "
        "Reports separate arithmetic counts, gate checks, elapsed time and traced Python allocation peaks. None is a power measurement.",
        "Preregister a neural research hypothesis, add trained subsystem baselines and measure hardware power under a controlled protocol.",
    ),
    "darpa-semantic-isr": (
        "Semantic packet and reconstruction reference",
        "An encoder sends full annotated scenes or ordered ROI deltas with periodic keyframes and deletion records. "
        "The receiver reconstructs state from serialized packet bytes. Required-object recall and coordinate error use the original scene labels. "
        "This isolates the wire contract; it is not an EO detector or a comparison with video codecs.",
        "Acquire permitted video, establish H.264/H.265/AV1 baselines and collect physical edge-hardware feasibility receipts.",
    ),
    "diu-sentinel-maritime": (
        "Public maritime evidence and replay reference",
        "The reference reuses the portable mission-suite engine with fixed evaluation time and explicit fixture rights. "
        "Original and shuffled observations must produce the same analysis while preserving contradictory evidence. "
        "Candidates remain HOLD and admitted counts remain separate. The private Sentinel/NNC runtime is not exercised.",
        "Use the existing private receiving-seat handoff for live-source, NNC, 48-hour demonstration and deployment acceptance.",
    ),
}


def cell(value: object) -> str:
    """Escape a value for a Markdown table."""
    return str(value).replace("|", r"\|").replace("\r", " ").replace("\n", " ")


def table(headers: tuple[str, ...], rows: Iterable[Iterable[object]]) -> str:
    """Render a table with stable column order and escaped data."""
    return (
        "\n".join(
            [
                "| " + " | ".join(headers) + " |",
                "|" + "|".join("---" for _ in headers) + "|",
                *(
                    "| " + " | ".join(cell(value) for value in row) + " |"
                    for row in rows
                ),
            ]
        )
        + "\n"
    )


def benchmark_report(summary: dict[str, object] | None) -> str:
    """Render candidate outcomes, seed distributions and local acceptance checks."""
    if summary is None:
        return "# Benchmark report\n\nNo recorded campaign was supplied. Run the registered experiment before reporting measurements.\n"
    candidates = records(summary["candidates"])
    rows: list[tuple[object, ...]] = []
    checks: list[tuple[object, ...]] = []
    for candidate in candidates:
        for name, raw in mapping(candidate["metrics"]).items():
            stats = mapping(raw)
            rows.append(
                (
                    candidate["candidate_id"],
                    name,
                    stats["unit"],
                    stats["n"],
                    stats["mean"],
                    stats["stddev"],
                    stats["min"],
                    stats["p50"],
                    stats["p95"],
                    stats["max"],
                )
            )
        for test in records(candidate["acceptance"]):
            checks.append(
                (
                    candidate["candidate_id"],
                    test["metric"],
                    test["operator"],
                    test["target"],
                    test["observed"],
                    "PASS" if test["passed"] else "FAIL",
                )
            )
    outcome_rows = [
        (
            row["candidate_id"],
            row["status"],
            row["successful_attempts"],
            row["attempts"],
            row["reproducible"],
            row["local_criteria_pass"],
        )
        for row in candidates
    ]
    return (
        "# Benchmark report\n\n"
        f"Scope: {summary['scope']}\n\nDataset SHA-256: {summary['dataset_sha256']}.\n\n"
        f"Seeds: {summary['seeds']}; repeats per seed: {summary['repetitions']}.\n\n"
        "## Outcomes\n\n"
        + table(
            (
                "Candidate",
                "Execution",
                "Successful attempts",
                "Attempts",
                "Repeat bytes match",
                "Local criteria pass",
            ),
            outcome_rows,
        )
        + "\n## Measured distributions\n\n"
        + table(
            (
                "Candidate",
                "Metric",
                "Unit",
                "Seed groups",
                "Mean",
                "Stddev",
                "Min",
                "p50",
                "p95",
                "Max",
            ),
            rows,
        )
        + "\n"
        + str(summary["statistics_scope"])
        + "\n\n"
        "Runtime uses perf_counter with tracemalloc enabled; memory is peak traced Python allocations, not process RSS, VRAM or watts. "
        "Repeat identity excludes these resource measurements.\n\n"
        "## Preregistered local checks\n\n"
        + table(
            ("Candidate", "Metric", "Operator", "Target", "Observed mean", "Outcome"),
            checks,
        )
        + "\nThese are fixture acceptance checks, not official solicitation thresholds or qualification.\n\n"
        "## Failed attempts\n\n"
        + (
            "\n".join(
                f"- {row['run']}: {row['reason']}"
                for row in records(summary["failed_attempts"])
            )
            or "None recorded."
        )
        + "\n"
    )


def readiness(
    opportunity: Opportunity,
    requirements: tuple[RequirementRow, ...],
    claims: tuple[ClaimRow, ...],
    summary: dict[str, object] | None,
) -> dict[str, object]:
    """Report measured denominators and named blockers without granting approval."""
    counts = Counter(row.status for row in requirements)
    blockers: list[dict[str, str]] = []
    for row in requirements:
        if row.status not in {"satisfied", "not_applicable"}:
            blockers.append(
                {
                    "id": row.requirement_id,
                    "kind": "technical",
                    "reason": row.acceptance,
                }
            )
    for criterion in opportunity.eligibility:
        if criterion["status"] != "eligible":
            blockers.append(
                {
                    "id": str(criterion["id"]),
                    "kind": "eligibility",
                    "reason": str(criterion["criterion"]),
                }
            )
    for missing in opportunity.evidence_missing:
        blockers.append(
            {
                "id": str(missing["id"]),
                "kind": "declared_evidence_gap",
                "reason": str(missing["description"]),
            }
        )
    if opportunity.deadline is None:
        blockers.append(
            {
                "id": "DEADLINE",
                "kind": "official_source",
                "reason": "Current official deadline and topic revision are not attached.",
            }
        )
    if summary is None:
        blockers.append(
            {
                "id": "CAMPAIGN",
                "kind": "execution",
                "reason": "No recorded reference campaign was supplied.",
            }
        )
    elif summary["status"] != "completed":
        blockers.append(
            {
                "id": "CAMPAIGN",
                "kind": "execution",
                "reason": "One or more attempts failed or repeated computational bytes diverged.",
            }
        )
    blockers.append(
        {
            "id": "HUMAN-SUBMISSION",
            "kind": "human_review",
            "reason": "Final claim, eligibility, rights, cost, team, format and portal approval remains with the operator.",
        }
    )
    return {
        "schema_version": "foundry.readiness/v1",
        "lane_id": opportunity.lane_id,
        "requirements": {
            "total": len(requirements),
            **{
                key: counts[key]
                for key in ("satisfied", "partial", "open", "blocked", "not_applicable")
            },
        },
        "claims": {
            "total": len(claims),
            "verified": sum(
                row.requested_level == "verified" and row.support_level == "verified"
                for row in claims
            ),
        },
        "reference_campaign": summary["status"] if summary else "not_run",
        "data_kind": "synthetic" if summary else "no_run",
        "submission_ready": False,
        "human_review_required": True,
        "blockers": blockers,
    }


def experiment_report(plan: dict[str, object]) -> str:
    """Render the actual executable experiment design."""
    return (
        "# Experiment plan\n\n" + str(plan["purpose"]) + "\n\n"
        f"Scope: {plan['scope']}\n\nDataset: {plan['dataset']}; SHA-256: {plan['dataset_sha256']}.\n\n"
        f"Candidates: {', '.join(strings(plan['candidates']))}.\n\n"
        f"Seeds: {plan['seeds']}; repeats: {plan['repetitions']}; timeout per attempt: {plan['timeout_seconds']} seconds.\n\n"
        "Each attempt starts in a new working directory with the frozen input. "
        "Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.\n\n"
        + table(
            ("Metric", "Unit", "Direction", "Local threshold"),
            (
                (
                    row["name"],
                    row["unit"],
                    row["direction"],
                    json.dumps(row.get("threshold", {}), sort_keys=True),
                )
                for row in records(plan["metrics"])
            ),
        )
        + "\nIndependent verification recomputes file fingerprints, run identities, sample counts and summaries. "
        "Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.\n"
    )


def technical_brief(
    opportunity: Opportunity,
    summary: dict[str, object] | None,
    requirements_markdown: str,
    claims_markdown: str,
    gaps_markdown: str,
) -> str:
    """Generate an evidence brief with traceable claims and a measured results annex."""
    title, design, next_work = DESIGNS[opportunity.lane_id]
    return (
        f"# {title}\n\nTechnical evidence brief for {opportunity.topic}.\n\n"
        "## Problem and proposed approach\n\n" + design + "\n\n"
        "## Evidence boundary\n\n"
        "The included runs use authored public synthetic fixtures. Official instructions and entity eligibility remain unverified. "
        "This document supplies engineering evidence for review; it does not assert final proposal approval.\n\n"
        "## Evaluation and results\n\n"
        + benchmark_report(summary).removeprefix("# Benchmark report\n\n")
        + "\n"
        "## Requirement traceability\n\n"
        + requirements_markdown.removeprefix("# Requirements matrix\n\n")
        + "\n"
        "## Claim traceability\n\n"
        + claims_markdown.removeprefix("# Claim-evidence matrix\n\n")
        + "\n"
        "## Remaining work and transition\n\n" + next_work + "\n\n"
        "## Risks and missing evidence\n\n"
        + gaps_markdown.removeprefix("# Gap report\n\n")
        + "\n"
        "## Management, commercialization, funding and rights\n\n"
        "Company, team, customer, cost and data-rights assertions require named human review. "
        "The authored SOW and commercialization draft are included separately. No financial, personnel or certification fact is inferred from a benchmark.\n\n"
        "## Submission format\n\n"
        + table(
            ("Planning field", "Recorded value"),
            sorted(opportunity.submission_format.items()),
        )
        + "\nLimits above come from the supplied planning brief and need official confirmation. Markdown length is not PDF pagination.\n"
    )


def slides(
    opportunity: Opportunity,
    summary: dict[str, object] | None,
    status: dict[str, object],
) -> dict[str, str]:
    """Produce a five-slide source briefing from the same measured evidence brief."""
    title, design, next_work = DESIGNS[opportunity.lane_id]
    evidence = "No campaign has been recorded."
    if summary:
        evidence = table(
            (
                "Candidate",
                "Successful attempts",
                "Attempts",
                "Repeat bytes match",
                "Local checks pass",
            ),
            (
                (
                    row["candidate_id"],
                    row["successful_attempts"],
                    row["attempts"],
                    row["reproducible"],
                    row["local_criteria_pass"],
                )
                for row in records(summary["candidates"])
            ),
        )
    counts = mapping(status["requirements"])
    return {
        "01-problem.md": f"# 1. {title}\n\n{opportunity.topic}\n\nPublic fixture evidence for technical review.\n",
        "02-method.md": f"# 2. Method\n\n{design}\n",
        "03-results.md": f"# 3. Observed results\n\n{evidence}\n\nSee benchmark_report.md for units, distributions and sample counts.\n",
        "04-gaps.md": f"# 4. Gaps\n\n{counts['satisfied']} of {counts['total']} requirements are satisfied; {counts['partial']} have partial evidence.\n\nOfficial-source, eligibility, hardware where required and final human approval remain open.\n",
        "05-work-plan.md": f"# 5. Next work\n\n{next_work}\n\nThese five Markdown slides are a source briefing, not a rendered or submitted deck.\n",
    }


def html_view(
    title: str,
    statuses: list[dict[str, object]],
    summaries: dict[str, dict[str, object]],
    *,
    portfolio: bool,
) -> str:
    """Render a self-contained read-only comparison without executing source markup."""
    escape = html.escape
    sections: list[str] = []
    for status in statuses:
        lane = str(status["lane_id"])
        requirements = mapping(status["requirements"])
        summary = summaries.get(lane)
        rows: list[str] = []
        if summary:
            for candidate in records(summary["candidates"]):
                for metric, value in mapping(candidate["metrics"]).items():
                    stats = mapping(value)
                    rows.append(
                        "<tr>"
                        + "".join(
                            f"<td>{escape(str(item))}</td>"
                            for item in (
                                candidate["candidate_id"],
                                metric,
                                stats["mean"],
                                stats["unit"],
                                stats["n"],
                            )
                        )
                        + "</tr>"
                    )
        blockers = records(status["blockers"])
        link = f"{lane}/benchmark_report.md" if portfolio else "benchmark_report.md"
        sections.append(
            f"<section><h2>{escape(lane)}</h2><p>Reference campaign: {escape(str(status['reference_campaign']))}. "
            f"Requirements: {requirements['satisfied']}/{requirements['total']} satisfied; {requirements['partial']} partial.</p>"
            f'<p><a href="{escape(link)}">Read benchmark evidence</a></p>'
            "<table><thead><tr><th>Candidate</th><th>Metric</th><th>Mean</th><th>Unit</th><th>Seed groups</th></tr></thead><tbody>"
            + "".join(rows)
            + "</tbody></table><details><summary>Open review items</summary><ul>"
            + "".join(
                f"<li>{escape(str(row['id']))}: {escape(str(row['reason']))}</li>"
                for row in blockers
            )
            + "</ul></details></section>"
        )
    return (
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f"<title>{escape(title)}</title><style>"
        ":root{color-scheme:dark}body{margin:0 auto;max-width:1200px;padding:24px;font:16px/1.6 system-ui;background:#050505;color:#00D9FF}"
        "section{margin:24px 0;padding:20px;background:#0D1117;overflow:auto}a{color:#00FF88}th,td{text-align:left;padding:8px;border-bottom:1px solid #00D9FF}"
        "h1,h2{line-height:1.25}summary{cursor:pointer;color:#FFB800}table{border-collapse:collapse;width:100%}"
        "@media(max-width:600px){body{padding:12px}section{padding:12px}}"
        f"</style><main><h1>{escape(title)}</h1>"
        "<p>Measured public synthetic reference workloads. These results do not establish federal qualification, hardware performance or submission approval.</p>"
        + "".join(sections)
        + '</main><footer>Powered by Citadel Nexus Inc. · <a href="https://citadel-nexus.com/status">Public status</a></footer></html>\n'
    )
