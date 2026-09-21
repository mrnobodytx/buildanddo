# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/intelligence.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/compiler.py, libs/evolution/common.py, libs/evolution/event.py, libs/semantic_twin/ingestion/drafts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/compiler.py; CONSUMES libs/evolution/common.py; CONSUMES libs/evolution/event.py; CONSUMES libs/semantic_twin/ingestion/drafts.py
# Intent:      Turn attributed information into bounded sprint proposals and reviewable work packets while preserving uncertainty and authority.
# ───────────────────────────────────────────────────────────────

"""Assess inert claims and compile local work proposals over existing contracts."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.ingestion.drafts import GraphDraft, RelationDraft, make_object
from libs.semantic_twin.ingestion.graph import SemanticGraph
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    EvidenceState,
    RelationPredicate,
)

from .common import digest, identity, unique
from .compiler import ActionProposal
from .event import CitadelEvent

# Owner-supplied sprint rubric, not an assertion of reviewed official rules.
JUDGE_WEIGHTS = {
    "product_user_experience": 25,
    "business_idea": 20,
    "business_potential": 20,
    "hostinger_product_usage": 20,
    "creativity_innovation": 15,
}
_INSTRUCTIONS = re.compile(
    r"ignore\s+(?:all\s+|the\s+)?(?:previous|prior|system)\s+instructions"
    r"|(?:system|developer)\s*(?:message|prompt)\s*:"
    r"|(?:reveal|print|send|exfiltrate)\s+(?:the\s+)?(?:secrets?|tokens?|credentials?)"
    r"|<\|(?:im_start|system|assistant)\|>",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class IntelligenceSignal(Contract):
    """Keep an attributed statement, source lineage and acquisition basis together."""

    scope_id: str
    claim_key: str
    statement: str
    publisher: str
    origin_id: str
    source_ref: str
    source_digest: ContentDigest
    published_at: datetime
    observed_at: datetime
    access: Literal["public", "licensed", "authorized"]
    access_reference: str
    stance: Literal["supports", "contradicts"] = "supports"
    source_event: SemanticId | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for name in (
            "scope_id",
            "claim_key",
            "statement",
            "publisher",
            "origin_id",
            "source_ref",
            "access_reference",
        ):
            text(getattr(self, name), name)
        require(len(self.statement) <= 12_000, "claim text exceeds bound")
        require(self.published_at <= self.observed_at, "source chronology is reversed")
        ref = urlsplit(self.source_ref)
        require(
            ref.scheme in ("https", "repo")
            and bool(ref.netloc)
            and ref.username is None
            and ref.password is None
            and not ref.query
            and not ref.fragment,
            "use a source locator without credentials or query parameters",
        )

    @property
    def signal_id(self) -> SemanticId:
        """Bind the claim to its source bytes and complete attribution."""
        return identity("observation", self)


@dataclass(frozen=True, slots=True)
class InformationAssessment(Contract):
    """Expose source-quality limits without certifying an external claim."""

    state: EvidenceState
    disposition: Literal["ELIGIBLE_HYPOTHESIS", "STALE", "CONFLICT", "QUARANTINED"]
    distinct_origins: int
    reasons: tuple[str, ...]


def assess_information(
    signals: tuple[IntelligenceSignal, ...],
    *,
    scope_id: str,
    at: datetime,
    max_age_seconds: int = 604800,
) -> InformationAssessment:
    """Check freshness, declared source independence and conflicts; never follow text."""
    require(
        bool(signals) and len(signals) <= 100, "select 1 to 100 source observations"
    )
    require(0 < max_age_seconds <= 31_536_000, "invalid information lifetime")
    require(len({s.signal_id for s in signals}) == len(signals), "duplicate signal")
    require(all(s.scope_id == scope_id for s in signals), "information crosses scope")
    require(
        len({s.claim_key for s in signals}) == 1,
        "corroboration concerns different claims",
    )
    require(all(s.observed_at <= at for s in signals), "future source observation")
    # Different URLs are not independent when they share an origin OR exact bytes.
    # Connected components also prevent A~B~C copied-source chains inflating counts.
    remaining = set(range(len(signals)))
    groups = 0
    while remaining:
        group = {remaining.pop()}
        while True:
            joined = {
                j
                for j in remaining
                if any(
                    signals[i].origin_id == signals[j].origin_id
                    or signals[i].source_digest == signals[j].source_digest
                    or signals[i].publisher == signals[j].publisher
                    for i in group
                )
            }
            if not joined:
                break
            remaining -= joined
            group |= joined
        groups += 1
    reasons = [
        "Source identity and corroboration are attributed; no independent fact verification is implied."
    ]
    if groups < len(signals):
        reasons.append("Copied or common-origin sources count once.")
    if any(_INSTRUCTIONS.search(s.statement) for s in signals):
        return InformationAssessment(
            EvidenceState.QUARANTINED,
            "QUARANTINED",
            groups,
            (
                *reasons,
                "Instruction-like source content requires review; it remains inert data.",
            ),
        )
    if any((at - s.published_at).total_seconds() > max_age_seconds for s in signals):
        return InformationAssessment(
            EvidenceState.UNMEASURED,
            "STALE",
            groups,
            (*reasons, "Refresh the stale source before prioritization."),
        )
    if any(s.stance == "contradicts" for s in signals):
        return InformationAssessment(
            EvidenceState.UNMEASURED,
            "CONFLICT",
            groups,
            (*reasons, "Retain and resolve opposing claims before implementation."),
        )
    return InformationAssessment(
        EvidenceState.UNMEASURED, "ELIGIBLE_HYPOTHESIS", groups, tuple(reasons)
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class DevelopmentOpportunity(Contract):
    """Bind a hypothesis and measurable acceptance to an existing action proposal."""

    proposal: ActionProposal
    signals: tuple[IntelligenceSignal, ...]
    hypothesis: str
    metric: str
    baseline: str | None
    target: str
    acceptance: tuple[str, ...]
    impact_bps: Mapping[str, int]
    confidence_bps: int
    evidence_strength_bps: int
    estimated_minutes: int
    regression_risk: int
    work_kind: Literal[
        "acceptance", "demo", "ux", "business", "evidence", "architecture"
    ]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for name in ("hypothesis", "metric", "target"):
            text(getattr(self, name), name)
        require(bool(self.acceptance), "proposal needs measurable acceptance")
        unique(self.acceptance, "acceptance criterion")
        require(
            set(self.impact_bps) == set(JUDGE_WEIGHTS),
            "account for every judging dimension",
        )
        require(
            all(0 <= v <= 10000 for v in self.impact_bps.values()),
            "impact must be basis points",
        )
        require(
            0 <= self.confidence_bps <= 10000
            and 0 <= self.evidence_strength_bps <= 10000,
            "invalid estimate basis points",
        )
        require(
            0 < self.estimated_minutes <= 10080 and 1 <= self.regression_risk <= 5,
            "invalid effort or risk estimate",
        )
        require(bool(self.signals), "proposal needs source evidence")
        require(
            all(s.scope_id == self.proposal.scope_id for s in self.signals),
            "proposal evidence crosses scope",
        )
        require(
            all(s.observed_at <= self.proposal.requested_at for s in self.signals),
            "proposal cites future information",
        )

    @property
    def opportunity_id(self) -> SemanticId:
        """Address the complete proposed experiment, including its uncertain estimates."""
        return identity("plan", self)


def opportunity_from_workflow(
    event: CitadelEvent, proposal: ActionProposal
) -> DevelopmentOpportunity:
    """Translate an observed workflow gap into one bounded source-test investigation."""
    require(
        event.event_type == "development.workflow_observed",
        "unsupported development observation",
    )
    require(
        event.scope_id == proposal.scope_id and event.source_sha == proposal.source_sha,
        "workflow and proposal scope/revision differ",
    )
    require(
        event.observed_at <= proposal.requested_at,
        "proposal predates workflow evidence",
    )
    require(
        proposal.decision.operation == "select_tests"
        and proposal.authority is AuthorityTier.A1,
        "workflow bridge only proposes bounded source testing",
    )
    require(
        event.data.get("conclusion") != "success",
        "successful workflow does not trigger a failure investigation",
    )
    statement = json.dumps(
        {
            "workflow": event.data.get("workflow"),
            "provider_status": event.data.get("status"),
            "provider_conclusion": event.data.get("conclusion"),
            "jobs_observed": event.data.get("jobs_observed"),
            "test_outcomes": "UNMEASURED",
        },
        sort_keys=True,
    )
    signal = IntelligenceSignal(
        scope_id=event.scope_id,
        claim_key="workflow-execution-gap",
        statement=statement,
        publisher="GitHub Actions",
        origin_id=event.correlation_id,
        source_ref=event.source_ref,
        source_digest=event.source_digest,
        published_at=event.occurred_at,
        observed_at=event.observed_at,
        access="authorized",
        access_reference="Caller-selected repository read through the configured CLI.",
        source_event=SemanticId(event.event_id),
    )
    return DevelopmentOpportunity(
        proposal=proposal,
        signals=(signal,),
        hypothesis="Executing the selected source suites can supply the missing local test observation for this candidate.",
        metric="executed source tests with retained outcomes and separate grading",
        baseline=None,
        target="Retain a nonempty run with no skips, exact source/log binding and independent outcome review.",
        acceptance=(
            "Record the prediction before executing the selected suites.",
            "Preserve failures, skips and source drift; do not derive test labels from workflow status.",
            "Have a distinct reviewer grade selection sufficiency against the actual change and broader evidence.",
        ),
        impact_bps={
            "product_user_experience": 3000,
            "business_idea": 0,
            "business_potential": 0,
            "hostinger_product_usage": 1000,
            "creativity_innovation": 1000,
        },
        confidence_bps=8000,
        evidence_strength_bps=8000,
        estimated_minutes=30,
        regression_risk=1,
        work_kind="acceptance",
    )


@dataclass(frozen=True, slots=True)
class SprintRank(Contract):
    """Report a prioritization estimate, never a measured competition improvement."""

    priority: Literal["P0", "P1", "DEFER", "HOLD"]
    numerator: int
    denominator: int
    reasons: tuple[str, ...]
    assessment: InformationAssessment
    meaning: Literal["heuristic_estimate_only"] = "heuristic_estimate_only"


def rank_opportunity(
    opportunity: DevelopmentOpportunity, *, at: datetime
) -> SprintRank:
    """Prefer short, evidenced demo improvements and defer architecture expansion."""
    assessment = assess_information(
        opportunity.signals, scope_id=opportunity.proposal.scope_id, at=at
    )
    weighted = sum(JUDGE_WEIGHTS[k] * v for k, v in opportunity.impact_bps.items())
    value = Fraction(
        weighted * opportunity.confidence_bps * opportunity.evidence_strength_bps * 60,
        10000**3 * opportunity.estimated_minutes * opportunity.regression_risk,
    )
    reasons = [
        "Rubric weights and all gain/confidence/effort inputs are planning estimates."
    ]
    priority: Literal["P0", "P1", "DEFER", "HOLD"]
    if assessment.disposition != "ELIGIBLE_HYPOTHESIS":
        priority = "HOLD"
        reasons.append("Resolve information quality before generating executable work.")
    elif opportunity.proposal.authority is AuthorityTier.A3:
        priority = "HOLD"
        reasons.append("A3 requires a separately issued human dispatch.")
    elif opportunity.work_kind == "architecture" or opportunity.estimated_minutes > 180:
        priority = "DEFER"
        reasons.append(
            "Sprint freeze excludes architecture expansion and work beyond three hours."
        )
    else:
        priority = "P0" if value >= 5 else "P1" if value >= 1 else "DEFER"
        if priority == "DEFER":
            reasons.append("Estimated impact does not clear the sprint threshold.")
    return SprintRank(
        priority, value.numerator, value.denominator, tuple(reasons), assessment
    )


def opportunity_graph(
    opportunity: DevelopmentOpportunity, *, at: datetime
) -> SemanticGraph:
    """Represent opportunity roles using canonical entities and existing predicates."""
    rank = rank_opportunity(opportunity, at=at)
    source = "semantic-twin:development-opportunity/" + digest(opportunity)
    fingerprint = digest(opportunity)

    def edge(predicate: RelationPredicate, target: str) -> RelationDraft:
        return RelationDraft(
            predicate, target, (source,), None, EvidenceState.UNMEASURED
        )

    nodes = [
        make_object(
            "product",
            "Product",
            source,
            input_digest=fingerprint,
            claims=({"name": "BuildAndDo"},),
        ),
        make_object(
            "hypothesis",
            "Hypothesis",
            source,
            input_digest=fingerprint,
            evidence_state=EvidenceState.UNMEASURED,
            claims=(
                {
                    "statement": opportunity.hypothesis,
                    "metric": opportunity.metric,
                    "baseline": opportunity.baseline,
                    "target": opportunity.target,
                },
            ),
            relations=(edge(RelationPredicate.ABOUT, "product"),),
        ),
        make_object(
            "mission",
            "Mission",
            source,
            input_digest=fingerprint,
            evidence_state=EvidenceState.UNMEASURED,
            claims=(
                {
                    "status": "proposed",
                    "priority": rank.priority,
                    "action_proposal": opportunity.proposal.to_dict(),
                },
            ),
            relations=(edge(RelationPredicate.DERIVED_FROM, "hypothesis"),),
        ),
    ]
    for signal in opportunity.signals:
        key = str(signal.signal_id)
        nodes.append(
            make_object(
                key,
                "Claim",
                source,
                input_digest=fingerprint,
                evidence_state=rank.assessment.state,
                claims=(
                    {
                        "attributed_statement": signal.statement,
                        "publisher": signal.publisher,
                        "source_ref": signal.source_ref,
                        "source_digest": signal.source_digest.to_dict(),
                        "origin_id": signal.origin_id,
                        "stance": signal.stance,
                        "opportunity_role": "EXPOSES_GAP",
                    },
                ),
                relations=(
                    edge(RelationPredicate.ABOUT, "product"),
                    edge(RelationPredicate.ASSOCIATED_WITH, "hypothesis"),
                ),
            )
        )
    for name, weight in JUDGE_WEIGHTS.items():
        nodes.append(
            make_object(
                "criterion:" + name,
                "AcceptanceCriterion",
                source,
                input_digest=fingerprint,
                evidence_state=EvidenceState.UNMEASURED,
                claims=(
                    {
                        "name": name,
                        "planning_weight": weight,
                        "estimated_impact_bps": opportunity.impact_bps[name],
                        "opportunity_role": "MAY_IMPROVE",
                    },
                ),
                relations=(edge(RelationPredicate.ABOUT, "mission"),),
            )
        )
    return GraphDraft(tuple(nodes)).resolve(observed_at=at)


def _header(
    path: str, stage: str, srs: str, dispatch: str, at: datetime, depends: str
) -> str:
    return (
        "# ─── CGRF Header ───────────────────────────────────────────────\n"
        f"# File:        {path}\n# Stage:       {stage}\n# SRS:         {srs}\n"
        f"# CAPS:        pending\n# CK:          pending\n# Dispatch:    {dispatch}\n"
        "# Seat:        BITS-CODEGEN\n# Owner:       Citadel Nexus Inc.\n"
        f"# Created:     {at.date().isoformat()}\n# Depends:     {depends}\n"
        f"# EnumType:    Doc\n# EnumEdges:   CONSUMES {depends}\n"
        "# Intent:      Preserve a bounded development proposal for receiving authority review.\n"
        "# ───────────────────────────────────────────────────────────────\n\n"
    )


def write_mission_packet(
    opportunity: DevelopmentOpportunity,
    directory: Path,
    *,
    srs: str,
    dispatch: str,
    builder: SemanticId,
    verifier: SemanticId,
    at: datetime,
) -> dict[str, object]:
    """Write a new local proposal packet; never authorize work or mutate a registry."""
    require(
        bool(re.fullmatch(r"SRS-BUILDANDDO-[A-Z0-9]+(?:-[A-Z0-9]+)*", srs)),
        "invalid BuildAndDo SRS",
    )
    require(
        bool(re.fullmatch(r"VCC-BUILDANDDO-[A-Z0-9]+(?:-[A-Z0-9]+)*", dispatch)),
        "invalid dispatch",
    )
    require(builder != verifier, "builder and verifier must be distinct")
    rank = rank_opportunity(opportunity, at=at)
    require(
        rank.priority in ("P0", "P1"),
        "only eligible P0/P1 proposals receive sprint packets",
    )
    require(at >= opportunity.proposal.requested_at, "packet predates proposal")
    graph = opportunity_graph(opportunity, at=at)
    require(not directory.exists(), "packet directory already exists")
    from libs.semantic_twin.ingestion.serializer import serialize_graph

    packet: dict[str, object] = {
        "schema_version": "buildanddo.development-mission/v1",
        "status": "proposed",
        "srs": srs,
        "dispatch": dispatch,
        "actor": "agent",
        "builder": str(builder),
        "verifier": str(verifier),
        "authority": opportunity.proposal.authority.value,
        "source_sha": opportunity.proposal.source_sha,
        "context_root": opportunity.proposal.context_root.to_dict(),
        "proposal": opportunity.proposal.to_dict(),
        "opportunity": opportunity.to_dict(),
        "rank": rank.to_dict(),
        "independent_review": True,
        "branch_proposal": f"bits/{srs}-development-mission",
        "execution": "Requires receiving SRS/dispatch authorization and the existing AAXP policy/adapter path.",
    }
    # JSON contains external prose as data. Markdown is a fixed wrapper, so embedded
    # fences, headings, instructions or shell substitutions cannot become commands.
    files = {
        "mission.json": json.dumps(packet, indent=2, ensure_ascii=True) + "\n",
        "graph.json": serialize_graph(graph),
        "SRS.md": _header(
            f".bits/srs/{srs}.md", "04_HYPOTHESIZE", srs, dispatch, at, "mission.json"
        )
        + f"# {srs}\n\nStatus: proposed. Risk: {opportunity.proposal.authority.value}.\n\n"
        + "Review the evidence-linked hypothesis, measurable acceptance and exact ActionProposal in mission.json.\n"
        + "This packet is not an execution dispatch or evidence of an implemented improvement.\n",
        "dispatch.md": _header(
            f".bits/queue/{dispatch}.md", "11_COMMIT", srs, dispatch, at, "mission.json"
        )
        + f"# {dispatch}\n\nStatus: proposed. SRS: {srs}.\n\n"
        + "| Phase | Work | Gate |\n|---|---|---|\n"
        + "| A | Confirm scope and pre-existing authority | Receiving owner accepts the exact proposal |\n"
        + "| B | Freeze prediction; implement bounded change | Exact source and input recorded before tests |\n"
        + "| C | Run acceptance; retain failures and deltas | Separate verifier reviews exact result |\n"
        + "| D | Replay/shadow and propose merge | Existing promotion and PR gates pass |\n",
        "registry-proposal.yml": _header(
            "registry-proposal.yml", "11_COMMIT", srs, dispatch, at, "mission.json"
        )
        + f"srs:\n  - code: {srs}\n    status: proposed\n    risk: {opportunity.proposal.authority.value}\n    spec: .bits/srs/{srs}.md\n",
    }
    for name in ("mission.json", "graph.json"):
        files[name + ".cgrf.yaml"] = _header(
            name, "11_COMMIT", srs, dispatch, at, "SRS.md"
        )
    directory.mkdir(parents=True, exist_ok=False)
    for name, content in files.items():
        with (directory / name).open("x") as stream:
            stream.write(content)
    return packet
