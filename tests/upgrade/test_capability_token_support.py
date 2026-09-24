# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_capability_token_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/conformance.py, libs/capability_tokens/models.py, libs/capability_tokens/schema.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/evolution/promotion.py, libs/evolution/registry.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/schema.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/evolution/promotion.py; DEPENDS_ON libs/evolution/registry.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py; DEPENDS_ON tests/upgrade/test_evolution_support.py
# Intent:      Construct explicitly synthetic protocol evidence without claiming live certification.
# ───────────────────────────────────────────────────────────────

"""Provide synthetic capability fixtures; none are runtime or payment evidence."""

from dataclasses import replace
from datetime import timedelta

from libs.capability_tokens.conformance import (
    ConformanceCase,
    ConformanceSuite,
    Certification,
    check,
)
from libs.capability_tokens.models import (
    CHECKS,
    Asset,
    Attribution,
    AuthorityRequirements,
    CapabilityToken,
    EvidenceRequirements,
    Implementation,
    Pricing,
    Rollback,
    TokenBundle,
    content_hash,
)
from libs.capability_tokens.schema import ValueSchema
from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest
from libs.evolution.compiler import DecisionInput, evaluate_rule
from libs.evolution.promotion import PromotionPolicy
from libs.evolution.registry import TokenlessProgram
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import ActorType, AuthorityGrant
from libs.semantic_twin.vocabulary import AuthorityTier
from tests.upgrade.test_evolution_support import (
    ACTOR,
    IMPORTER,
    SCOPE,
    VERIFIER,
    at,
    candidate,
    evaluations,
    graph,
    verification as base_verification,
)

POLICY = SemanticId("cni://policy/fixture")


def verification(subject, sources, *, tier=AuthorityTier.A2, **kwargs):
    """Add an explicit synthetic human grant when exercising A3 publication gates."""
    receipt = base_verification(subject, sources, tier=AuthorityTier.A2, **kwargs)
    if tier is not AuthorityTier.A3:
        return replace(receipt, policy=replace(receipt.policy, tier=tier))
    when = receipt.policy.evaluated_at
    grant = AuthorityGrant(
        SemanticId("cni://authority/synthetic-publication"),
        SemanticId("cni://person/synthetic-owner"),
        ActorType.HUMAN,
        receipt.policy.actor_id,
        AuthorityTier.A3,
        (subject.semantic_id,),
        when - timedelta(seconds=1),
        when + timedelta(seconds=60),
        SemanticId("cni://receipt/synthetic-human-dispatch"),
    )
    return replace(receipt, policy=replace(receipt.policy, tier=tier, grant=grant))


def schema(properties, required=None):
    """Make a closed synthetic object schema."""
    return ValueSchema(
        {
            "type": "object",
            "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": False,
        }
    )


def bundle(version="1.0.0", name="import-repair", **overrides):
    """Bind the existing finite rule fixture to a new portable contract."""
    learned = candidate()
    program = TokenlessProgram(
        learned.subject, SCOPE, AuthorityTier.A2, learned.compatibility, learned.rule
    )
    reverse = replace(
        program,
        rule=replace(
            program.rule,
            response=replace(program.rule.response, operation="rollback_import"),
        ),
    )
    files = {"rule.json": program.to_json(), "rollback.json": reverse.to_json()}
    impl = Implementation(
        implementation_id="graph-v1",
        kind="graph_rule",
        source_sha=program.compatibility.source_sha,
        entrypoint="rule.json",
        rollback_entrypoint="rollback.json",
        assets=tuple(
            Asset(path, content_hash(data), len(data.encode()))
            for path, data in files.items()
        ),
        environments=("synthetic",),
        sbom_digest=program.compatibility.sbom_digest,
    )
    token = CapabilityToken(
        capability_id=SemanticId("cni://capability/citadel/" + name),
        publisher="citadel",
        version=version,
        name=name,
        description="Propose a bounded import repair.",
        category="engineering",
        risk="synthetic",
        skills=("python-imports",),
        inputs=schema({"exception": {"type": "string"}}),
        outputs=schema(
            {
                "diagnosis": {"type": "string"},
                "operation": {"type": "string"},
                "targets": {"type": "array", "items": {"type": "string"}},
                "parameters": {
                    "type": "object",
                    "properties": {"replacement": {"type": "string"}},
                    "required": ["replacement"],
                    "additionalProperties": False,
                },
                "tests": {"type": "array", "items": {"type": "string"}},
            }
        ),
        authority=AuthorityRequirements(
            AuthorityTier.A2,
            ("repair_import", "rollback_import"),
            ("synthetic-fixture",),
            ("unapproved_effect",),
        ),
        evidence=EvidenceRequirements(
            POLICY, "fixture/1", replay_policy=PromotionPolicy(replay_cases=2)
        ),
        implementations=(impl,),
        applicability=("synthetic Python import fixture only",),
        rollback=Rollback("rollback_import", ("original import boundary restored",)),
        pricing=Pricing(
            "USD", 101, (Attribution(ACTOR, 3333), Attribution(VERIFIER, 3333))
        ),
        license="synthetic-test-only",
        lineage=(learned.subject,),
    )
    return TokenBundle(replace(token, **overrides), files)


def observation(second=300, **overrides):
    """Make bounded captured input without future labels."""
    data = DecisionInput(
        scope_id=SCOPE,
        correlation_id="token-fixture",
        authority=AuthorityTier.A2,
        risk="synthetic",
        decision_at=at(second),
        features_observed_at=at(second),
        features={"exception": "ModuleNotFoundError"},
        graph=graph(),
        allowed_targets=(IMPORTER,),
        allowed_operations=("repair_import", "rollback_import"),
    )
    return replace(data, **overrides)


def suite(token_bundle=None):
    """Retain real finite rule predictions and typed synthetic holdout results."""
    b = token_bundle or bundle()
    obs = observation()
    expected = evaluate_rule(b.program("graph-v1").rule, obs)
    reverse = evaluate_rule(b.program("graph-v1", rollback=True).rule, obs)
    wrong = replace(obs, features={"exception": "SyntaxError"})
    security = replace(obs, authority=AuthorityTier.A3)
    replay, _ = evaluations()
    return ConformanceSuite(
        b.token.binding("graph-v1"),
        (
            ConformanceCase(
                "match", "positive", obs.features, obs, "synthetic", expected
            ),
            ConformanceCase(
                "no-match", "negative", wrong.features, wrong, "synthetic", None
            ),
            ConformanceCase(
                "authority", "security", security.features, security, "synthetic", None
            ),
            ConformanceCase(
                "compensate", "rollback", obs.features, obs, "synthetic", reverse
            ),
            ConformanceCase(
                "environment", "compatibility", obs.features, obs, "foreign", None
            ),
        ),
        replay,
    )


def trust(*receipts):
    """Pin fixture receipts explicitly rather than trusting claimed verifier names."""
    return ReviewPolicy(
        POLICY,
        "fixture/1",
        (VERIFIER,),
        tuple(ContentDigest(digest(r)) for r in receipts),
    )


def certified(b=None):
    """Exercise conformance and the typed promotion kernel using synthetic independent review."""
    b = b or bundle()
    s = suite(b)
    report = check(b, s, at=at(320))
    receipt = verification(
        report.subject,
        (str(report.report_id),),
        when=at(321),
        checks=tuple("token." + key for key in CHECKS),
    )
    proof = PromotionProof(
        subject=report.subject,
        evidence=receipt.result.evidence,
        verification=receipt,
        tevv=receipt.result,
    )
    certificate = Certification(report, proof)
    policy = trust(receipt)
    certificate.require_valid(b, policy, at=at(322))
    return b, s, certificate, policy
