# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/dogfood.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/conformance.py, libs/capability_tokens/interop.py, libs/capability_tokens/models.py, libs/capability_tokens/registry.py, libs/capability_tokens/schema.py, libs/evolution/candidate.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/evolution/registry.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/ingestion/source.py, libs/semantic_twin/vocabulary.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/capability_tokens/interop.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/capability_tokens/schema.py; DEPENDS_ON libs/evolution/candidate.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/evolution/registry.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/ingestion/source.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Measure the local protocol against actual public release source without fabricating independent learning or operational evidence.
# ───────────────────────────────────────────────────────────────

"""Exercise the protocol on the actual public release controller without external effects."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from libs.capability_tokens.conformance import ConformanceCase, ConformanceSuite, check
from libs.capability_tokens.interop import (
    export_skill,
    import_skill,
    mcp_descriptor,
    skill_zip,
)
from libs.capability_tokens.models import (
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
from libs.capability_tokens.registry import FederatedIndex, Registry
from libs.capability_tokens.schema import ValueSchema
from libs.evolution.candidate import ResponseTemplate, Rule
from libs.evolution.common import digest, json_value
from libs.evolution.compiler import DecisionInput, GraphSnapshot, evaluate_rule
from libs.evolution.registry import TokenlessProgram
from libs.semantic_twin.contracts import require
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.ingestion.source import ingest_release_source, source_module_id
from libs.semantic_twin.vocabulary import AuthorityTier

ROOT = Path(__file__).resolve().parents[3]


def object_schema(properties: dict[str, object]) -> ValueSchema:
    """Declare every expected public input/output field."""
    return ValueSchema(
        {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        }
    )


def main() -> int:
    """Capture source checks while leaving unavailable independent replay and TEVV on HOLD."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists(), "dogfood output must be a new directory")
    args.output.mkdir(parents=True)
    at = datetime.now(timezone.utc)
    source = ROOT / "tools/buildanddo_release.py"
    sha = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()
    committed = subprocess.run(
        ["git", "show", sha + ":tools/buildanddo_release.py"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout
    require(
        source.read_bytes() == committed,
        "release source differs from declared revision",
    )
    graph = ingest_release_source(
        source, repository_root=ROOT, commit=sha, observed_at=at
    )
    snapshot = GraphSnapshot(
        scope_id="public/buildanddo-release",
        source_sha=sha,
        as_of=at,
        objects=graph.objects,
    )
    target = SemanticId(source_module_id(graph))
    lineage = SubjectRef(
        SemanticId("cni://capability/citadel/release-inspection-candidate"),
        digest(snapshot),
    )
    response = ResponseTemplate(
        diagnosis="Inspect the captured public release controller.",
        operation="inspect_source",
        targets=(str(target),),
        parameters={"path": "tools/buildanddo_release.py"},
    )
    rule = Rule({"request": "inspect_release_path"}, response)
    program = TokenlessProgram(
        lineage, snapshot.scope_id, AuthorityTier.A0, snapshot.compatibility, rule
    )
    reverse = replace(
        program,
        rule=replace(rule, response=replace(response, operation="discard_proposal")),
    )
    files = {"rule.json": program.to_json(), "rollback.json": reverse.to_json()}
    impl = Implementation(
        implementation_id="graph-v1",
        kind="graph_rule",
        source_sha=sha,
        entrypoint="rule.json",
        rollback_entrypoint="rollback.json",
        assets=tuple(
            Asset(p, content_hash(c), len(c.encode())) for p, c in files.items()
        ),
        environments=("local-public-source",),
    )
    token = CapabilityToken(
        capability_id=SemanticId("cni://capability/citadel/release-source-inspection"),
        publisher="citadel",
        version="1.0.0",
        name="release-source-inspection",
        description="Propose inspection of the actual captured release controller.",
        category="engineering",
        risk="read_only_public_metadata",
        skills=("public-source-inspection",),
        inputs=object_schema({"request": {"type": "string"}}),
        outputs=object_schema(
            {
                "diagnosis": {"type": "string"},
                "operation": {"type": "string"},
                "targets": {"type": "array", "items": {"type": "string"}},
                "parameters": object_schema({"path": {"type": "string"}}).document,
                "tests": {"type": "array", "items": {"type": "string"}},
            }
        ),
        authority=AuthorityRequirements(
            AuthorityTier.A0,
            ("inspect_source", "discard_proposal"),
            ("read_public_source",),
            ("external_effect",),
        ),
        evidence=EvidenceRequirements(
            SemanticId("cni://policy/citadel/token-review"), "1"
        ),
        implementations=(impl,),
        applicability=("Captured public BuildAndDo source only",),
        rollback=Rollback("discard_proposal", ("no external state changed",)),
        pricing=Pricing(
            "USD", 0, (Attribution(SemanticId("cni://organization/citadel"), 10000),)
        ),
        license="Repository license; source inspection only",
        lineage=(lineage,),
    )
    bundle = TokenBundle(token, files)
    obs = DecisionInput(
        scope_id=snapshot.scope_id,
        correlation_id="release-source-dogfood",
        authority=AuthorityTier.A0,
        risk=token.risk,
        decision_at=at,
        features_observed_at=at,
        features={"request": "inspect_release_path"},
        graph=snapshot,
        allowed_targets=(target,),
        allowed_operations=token.authority.operations,
    )
    wrong = replace(obs, features={"request": "unmatched"})
    security = replace(obs, authority=AuthorityTier.A3)
    suite = ConformanceSuite(
        token.binding("graph-v1"),
        (
            ConformanceCase(
                "source",
                "positive",
                obs.features,
                obs,
                "local-public-source",
                evaluate_rule(rule, obs),
            ),
            ConformanceCase(
                "abstain",
                "negative",
                wrong.features,
                wrong,
                "local-public-source",
                None,
            ),
            ConformanceCase(
                "authority",
                "security",
                security.features,
                security,
                "local-public-source",
                None,
            ),
            ConformanceCase(
                "discard",
                "rollback",
                obs.features,
                obs,
                "local-public-source",
                evaluate_rule(reverse.rule, obs),
            ),
            ConformanceCase(
                "environment", "compatibility", obs.features, obs, "production", None
            ),
        ),
    )
    report = check(bundle, suite, at=at)
    require(report.verdict == "HOLD", "missing independent outcomes must not certify")
    skill = export_skill(bundle, "graph-v1")
    archive = args.output / "skill.zip"
    archive.write_bytes(skill_zip(skill))
    require(import_skill(archive) == skill, "portable skill round trip differs")
    index = FederatedIndex("citadel", 1, at, (bundle,))
    with Registry(args.output / "registry.sqlite", snapshot.scope_id) as registry:
        registry.import_index(
            index, publisher="citadel", expected_digest=index.root, at=at
        )
        registry.install(token.pin, at=at)
        require(
            registry.resolve(token.capability_id) == token.pin,
            "registry resolution differs",
        )
        registry_summary = {
            "versions": len(registry.state().bundles),
            "installed": len(registry.state().installed),
            "certifications": len(registry.state().certificates),
        }
    outputs: dict[str, object] = {
        "bundle.json": bundle,
        "suite.json": suite,
        "conformance.json": report,
        "mcp-tool.json": mcp_descriptor(bundle, "graph-v1"),
        "index.json": index,
    }
    for path, value in outputs.items():
        encoded = (
            json.dumps(json_value(value), separators=(",", ":"), sort_keys=True)
            if path == "suite.json"
            else json.dumps(json_value(value), indent=2, sort_keys=True)
        )
        (args.output / path).write_text(encoded + "\n")
    summary = {
        "schema_version": "cnwb.capability-dogfood/v1",
        "captured_at": at.isoformat(),
        "source_sha": sha,
        "source_path": "tools/buildanddo_release.py",
        "source_sha256": content_hash(committed).value,
        "graph_objects": len(graph.objects),
        "context_root": snapshot.root.value,
        "pin": token.pin.to_dict(),
        "conformance": report.to_dict(),
        "status": "HOLD",
        "authority": "A0",
        "archive_roundtrip": "PASS",
        "mcp_descriptor": "GENERATED",
        "registry": registry_summary,
        "effects_executed": 0,
        "funds_moved": 0,
        "missing": [
            "independent holdout replay",
            "independent pinned TEVV",
            "authenticated receiving runtime",
        ],
        "artifact_digests": {
            p: content_hash((args.output / p).read_bytes()).value for p in outputs
        },
    }
    (args.output / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n"
    )
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
