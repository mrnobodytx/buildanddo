# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/composition.py, libs/capability_tokens/conformance.py, libs/capability_tokens/economics.py, libs/capability_tokens/interop.py, libs/capability_tokens/models.py, libs/capability_tokens/passport.py, libs/capability_tokens/registry.py, libs/capability_tokens/sharing.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/evolution/episode.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/composition.py; DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/capability_tokens/economics.py; DEPENDS_ON libs/capability_tokens/interop.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/passport.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/capability_tokens/sharing.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/evolution/episode.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Make the six local capability protocol surfaces executable and reviewable from one CLI.
# ───────────────────────────────────────────────────────────────

"""Expose the local protocol as cnwb token commands without network or execution effects."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from libs.evolution.common import decode_json, json_value, mapping, timestamp
from libs.evolution.compiler import DecisionInput
from libs.evolution.episode import Episode
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier

from .composition import CompositionStep, compose
from .conformance import Certification, ConformanceSuite, certify, check
from .economics import ReviewedAdjustment, settlement
from .interop import (
    McpToolCapture,
    SkillPackage,
    export_skill,
    export_skill_index,
    import_skill,
    import_skill_index,
    mcp_descriptor,
    skill_zip,
)
from .models import MAX_BYTES, CapabilityToken, TokenBundle, TokenPin
from .passport import CapabilityPassport, MeteredCall, passport, publish_passport
from .registry import FederatedIndex, Registry
from .sharing import GeneralizedPattern, SharingDraft, export_pattern, prepare_sharing
from .verification import ReviewPolicy

T = TypeVar("T", bound=Contract)


def _read(path: str) -> str:
    target = Path(path)
    require(
        not target.is_symlink() and not any(p.is_symlink() for p in target.parents),
        "input path cannot use symlinks",
    )
    require(
        target.is_file() and target.stat().st_size <= MAX_BYTES,
        "input is missing or too large",
    )
    return target.read_text(encoding="utf-8")


def _model(path: str, model: type[T]) -> T:
    return model.from_json(_read(path))


def _models(path: str, model: type[T]) -> tuple[T, ...]:
    data = decode_json(_read(path))
    require(isinstance(data, list), "input must be a JSON array")
    assert isinstance(data, list)
    return tuple(model.from_dict(mapping(row)) for row in data)


def _emit(value: object, output: str | None) -> None:
    encoded = (
        value
        if isinstance(value, bytes)
        else (
            json.dumps(json_value(value), indent=2, sort_keys=True, allow_nan=False)
            + "\n"
        ).encode()
    )
    if output is None:
        require(not isinstance(value, bytes), "binary output requires a new file")
        print(encoded.decode(), end="")
        return
    target = Path(output)
    require(
        not target.is_symlink() and not any(p.is_symlink() for p in target.parents),
        "output path cannot use symlinks",
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("xb") as handle:
        handle.write(encoded)


def parser() -> argparse.ArgumentParser:
    """Build the protocol CLI with explicit local inputs, scope and output paths."""
    root = argparse.ArgumentParser(
        description="CNWB local capability protocol; proposals only."
    )
    root.add_argument("--state", default="state/cnwb/registry.sqlite")
    root.add_argument("--scope")
    surfaces = root.add_subparsers(dest="surface", required=True)
    token = surfaces.add_parser("token")
    commands = token.add_subparsers(dest="command", required=True)

    def command(name: str, argument: str | None = None) -> argparse.ArgumentParser:
        child = commands.add_parser(name)
        if argument is not None:
            child.add_argument(argument)
        child.add_argument("--output")
        child.add_argument("--at")
        return child

    command("schema")
    command("inspect", "bundle")
    c = command("bundle", "manifest")
    c.add_argument("--assets", required=True)
    c = command("certify", "bundle")
    c.add_argument("--suite", required=True)
    c.add_argument("--checked-at")
    c.add_argument("--proof")
    c.add_argument("--policy")
    c.add_argument("--register", action="store_true")
    command("import-skill", "source")
    c = command("export-skill", "bundle")
    c.add_argument("--implementation", required=True)
    c = command("pack-skill", "package")
    c.add_argument("--contract", required=True)
    c.add_argument("--implementation", required=True)
    c = command("mcp", "bundle")
    c.add_argument("--implementation", required=True)
    command("import-mcp", "descriptor")
    c = command("skill-index")
    c.add_argument("packages", nargs="+")
    c = command("import-skill-index", "index")
    c.add_argument("--resources", required=True)
    c = command("import-registry", "index")
    c.add_argument("--publisher", required=True)
    c.add_argument("--digest", required=True)
    command("search", "query")
    c = command("resolve", "capability")
    c.add_argument("--version")
    command("install", "pin")
    c = command("update", "pin")
    c.add_argument("--previous", required=True)
    c = command("revoke", "pin")
    c.add_argument("--reason", required=True)
    c = command("invoke", "pin")
    c.add_argument("--implementation", required=True)
    c.add_argument("--inputs", required=True)
    c.add_argument("--observation", required=True)
    c.add_argument("--environment", required=True)
    c.add_argument("--policy", required=True)
    c = command("compose", "steps")
    c.add_argument(
        "--authority", choices=[a.value for a in AuthorityTier], required=True
    )
    c.add_argument("--policy", required=True)
    c = command("accept-certificate", "certificate")
    c.add_argument("--policy", required=True)
    for name in ("passport", "settle", "meter"):
        c = command(name, "bundle")
        c.add_argument("--implementation", required=True)
        c.add_argument("--calls", required=name == "meter")
        c.add_argument("--policy", required=True)
        if name == "settle":
            c.add_argument("--adjustments")
    c = command("prepare-sharing", "episodes")
    c.add_argument("--pattern", required=True)
    c = command("export-sharing", "draft")
    c.add_argument("--review", required=True)
    c.add_argument("--policy", required=True)
    command("status")
    c = command("publish-passport", "passport")
    c.add_argument("--review", required=True)
    c.add_argument("--policy", required=True)
    return root


def _dispatch(args: argparse.Namespace, at: datetime) -> tuple[object, int]:
    cmd = args.command
    if cmd == "schema":
        return CapabilityToken.json_schema(), 0
    if cmd == "inspect":
        bundle = _model(args.bundle, TokenBundle)
        return {
            "pin": bundle.token.pin.to_dict(),
            "token": bundle.token.to_dict(),
            "certification": "NOT_ESTABLISHED_BY_MANIFEST",
        }, 0
    if cmd == "bundle":
        token = _model(args.manifest, CapabilityToken)
        root = Path(args.assets)
        files = {
            a.path: _read(str(root / a.path))
            for i in token.implementations
            for a in i.assets
        }
        return TokenBundle(token, files), 0
    if cmd == "import-skill":
        return import_skill(Path(args.source)), 0
    if cmd == "export-skill":
        return skill_zip(
            export_skill(_model(args.bundle, TokenBundle), args.implementation)
        ), 0
    if cmd == "pack-skill":
        from dataclasses import replace
        from .models import Asset, content_hash

        skill = _model(args.package, SkillPackage)
        token = _model(args.contract, CapabilityToken)
        impl = token.implementation(args.implementation)
        require(
            len(token.implementations) == 1 and impl.kind == "agent_skill",
            "packing requires one explicitly declared Agent Skill implementation",
        )
        require(
            impl.entrypoint == "SKILL.md", "Agent Skill entrypoint must be SKILL.md"
        )
        updated = replace(
            impl,
            assets=tuple(
                Asset(p, content_hash(c), len(c.encode()))
                for p, c in sorted(skill.files.items())
            ),
        )
        return TokenBundle(replace(token, implementations=(updated,)), skill.files), 0
    if cmd == "mcp":
        return mcp_descriptor(_model(args.bundle, TokenBundle), args.implementation), 0
    if cmd == "import-mcp":
        return McpToolCapture.from_descriptor(
            mapping(decode_json(_read(args.descriptor)))
        ), 0
    if cmd == "skill-index":
        return export_skill_index(
            tuple(_model(p, SkillPackage) for p in args.packages)
        ), 0
    if cmd == "import-skill-index":
        resources = mapping(decode_json(_read(args.resources)))
        require(
            all(type(v) is str for v in resources.values()),
            "MCP resources must contain captured text",
        )
        return import_skill_index(
            mapping(decode_json(_read(args.index))),
            {k: str(v) for k, v in resources.items()},
        ), 0
    if cmd == "certify":
        bundle = _model(args.bundle, TokenBundle)
        suite = _model(args.suite, ConformanceSuite)
        checked_at = timestamp(args.checked_at) if args.checked_at else at
        if args.proof is None:
            require(
                not args.register, "registration requires independent certification"
            )
            report = check(bundle, suite, at=checked_at)
            return {
                "status": "FAIL" if report.verdict == "FAIL" else "HOLD",
                "report": report.to_dict(),
                "subject": report.subject.to_dict(),
                "report_id": str(report.report_id),
                "reason": "Independent pinned TEVV is required; local tests cannot certify themselves.",
            }, 1 if report.verdict == "FAIL" else 2
        require(
            args.policy is not None,
            "certification requires an independent trust policy",
        )
        policy = _model(args.policy, ReviewPolicy)
        report, certificate = certify(
            bundle,
            suite,
            checked_at=checked_at,
            reviewed_at=at,
            policy=policy,
            proof=_model(args.proof, PromotionProof),
        )
        assert certificate is not None
        if args.register:
            require(args.scope is not None, "registry scope is required")
            with Registry(Path(args.state), args.scope) as registry:
                registry.add_certificate(certificate, policy, at=at)
        return {
            "status": "CERTIFIED",
            "certificate": certificate.to_dict(),
            "scope": "Local conformance and pinned receipt consistency; no identity authentication or effects.",
        }, 0

    if cmd == "publish-passport":
        raw = mapping(decode_json(_read(args.passport)))
        record = CapabilityPassport.from_dict(mapping(raw.get("passport", raw)))
        return publish_passport(
            record,
            _model(args.review, VerificationReceipt),
            _model(args.policy, ReviewPolicy),
            at=at,
        ), 0

    require(args.scope is not None, "explicit tenant/workspace scope is required")
    if cmd == "prepare-sharing":
        return prepare_sharing(
            _models(args.episodes, Episode),
            _model(args.pattern, GeneralizedPattern),
            scope_id=args.scope,
            at=at,
        ), 0
    if cmd == "export-sharing":
        return export_pattern(
            _model(args.draft, SharingDraft),
            _model(args.review, VerificationReceipt),
            _model(args.policy, ReviewPolicy),
            scope_id=args.scope,
            at=at,
        ), 0
    with Registry(Path(args.state), args.scope) as registry:
        if cmd == "accept-certificate":
            certificate = _model(args.certificate, Certification)
            registry.add_certificate(
                certificate, _model(args.policy, ReviewPolicy), at=at
            )
            return {
                "binding": certificate.report.binding.to_dict(),
                "status": "CERTIFIED",
            }, 0
        if cmd == "import-registry":
            index = _model(args.index, FederatedIndex)
            registry.import_index(
                index,
                publisher=args.publisher,
                expected_digest=ContentDigest(args.digest),
                at=at,
            )
            return {
                "imported": len(index.bundles),
                "generation": index.generation,
                "digest": index.root.to_dict(),
            }, 0
        if cmd == "search":
            return registry.search(args.query), 0
        if cmd == "resolve":
            return registry.resolve(SemanticId(args.capability), args.version), 0
        if cmd in ("install", "update", "revoke"):
            pin = _model(args.pin, TokenPin)
            if cmd == "revoke":
                registry.revoke(pin, reason=args.reason, at=at)
            else:
                registry.install(
                    pin,
                    at=at,
                    expected_previous=_model(args.previous, TokenPin)
                    if cmd == "update"
                    else None,
                )
            return {"operation": cmd, "pin": pin.to_dict()}, 0
        if cmd == "invoke":
            result = registry.invoke(
                _model(args.pin, TokenPin),
                args.implementation,
                mapping(decode_json(_read(args.inputs))),
                _model(args.observation, DecisionInput),
                environment=args.environment,
                policy=_model(args.policy, ReviewPolicy),
                at=at,
            )
            return {
                "proposal": result.to_dict() if result else None,
                "effects_executed": 0,
                "next": "AAXP -> policy -> authority -> adapter -> independent receipt",
            }, 0
        if cmd == "compose":
            return compose(
                registry,
                _models(args.steps, CompositionStep),
                _model(args.policy, ReviewPolicy),
                authority=AuthorityTier(args.authority),
                at=at,
            ), 0
        if cmd in ("passport", "settle", "meter"):
            bundle = _model(args.bundle, TokenBundle)
            policy = _model(args.policy, ReviewPolicy)
            calls = (
                _models(args.calls, MeteredCall)
                if args.calls
                else registry.metered(bundle.token.binding(args.implementation))
            )
            if cmd == "meter":
                registry.meter(bundle, args.implementation, calls, policy, at=at)
                return {
                    "retained": len(
                        registry.metered(bundle.token.binding(args.implementation))
                    )
                }, 0
            if cmd == "passport":
                measured = passport(
                    bundle,
                    args.implementation,
                    calls,
                    policy,
                    scope_id=args.scope,
                    at=at,
                )
                return {
                    "passport": measured.to_dict(),
                    "summary": measured.summary(),
                }, 0
            adjustments = (
                _models(args.adjustments, ReviewedAdjustment)
                if args.adjustments
                else ()
            )
            return settlement(
                bundle,
                args.implementation,
                calls,
                adjustments,
                policy,
                scope_id=args.scope,
                at=at,
            ), 0
        state = registry.state()
        return {
            "scope_id": args.scope,
            "root": state.root.to_dict() if state.root else None,
            "versions": len(state.bundles),
            "installed": len(state.installed),
            "revoked": len(state.revoked),
            "certificates_retained": len(state.certificates),
            "effects_executed": 0,
            "funds_moved": 0,
        }, 0


def main(argv: list[str] | None = None) -> int:
    """Return explicit failure/HOLD exit codes while never overwriting output artifacts."""
    args = parser().parse_args(argv)
    try:
        if args.output is not None:
            target = Path(args.output)
            require(
                not target.exists() and not target.is_symlink(), "output already exists"
            )
            require(
                not any(p.is_symlink() for p in target.parents),
                "output path cannot use symlinks",
            )
        at = timestamp(args.at) if args.at else datetime.now(timezone.utc)
        result, code = _dispatch(args, at)
        _emit(result, args.output)
        return code
    except (
        ContractError,
        OSError,
        UnicodeError,
        ValueError,
        KeyError,
        TypeError,
        RecursionError,
        sqlite3.DatabaseError,
    ) as exc:
        print(
            json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=True),
            file=sys.stderr,
        )
        return 1
