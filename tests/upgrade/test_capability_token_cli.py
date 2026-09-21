# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_capability_token_cli.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/cli.py, libs/capability_tokens/composition.py, libs/capability_tokens/models.py, libs/capability_tokens/passport.py, libs/capability_tokens/registry.py, libs/capability_tokens/sharing.py, libs/evolution/common.py, libs/semantic_twin/vocabulary.py, tests/upgrade/test_capability_token_records.py, tests/upgrade/test_capability_token_support.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/cli.py; DEPENDS_ON libs/capability_tokens/composition.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/passport.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/capability_tokens/sharing.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/vocabulary.py; DEPENDS_ON tests/upgrade/test_capability_token_records.py; DEPENDS_ON tests/upgrade/test_capability_token_support.py; DEPENDS_ON tests/upgrade/test_evolution_support.py
# Intent:      Exercise persistent operator commands and distinguish local protocol tests from live acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise CLI persistence, portable adapters and incomplete independent acceptance."""

import contextlib
import io
import json
import runpy
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from libs.capability_tokens.cli import main
from libs.capability_tokens.composition import CompositionStep
from libs.capability_tokens.models import Asset, TokenBundle, content_hash
from libs.capability_tokens.passport import passport
from libs.capability_tokens.registry import FederatedIndex, Registry
from libs.capability_tokens.sharing import GeneralizedPattern, prepare_sharing
from libs.evolution.common import json_value
from libs.semantic_twin.vocabulary import AuthorityTier, RelationPredicate
from tests.upgrade.test_capability_token_records import call
from tests.upgrade.test_capability_token_support import (
    SCOPE,
    at,
    bundle,
    certified,
    observation,
    schema,
    trust,
    verification,
)
from tests.upgrade.test_evolution_support import episode


class CliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.b, self.s, self.c, self.policy = certified()
        self.state = self.root / "registry.sqlite"
        self.bp = self.write("bundle.json", self.b)
        self.pin = self.write("pin.json", self.b.token.pin)
        self.pol = self.write("policy.json", self.policy)
        self.sp = self.write("suite.json", self.s)

    def write(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(json_value(data), indent=2))
        return str(path)

    def run_cli(self, *args, code=0, when=600, scope=SCOPE):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = main(
                [
                    "--state",
                    str(self.state),
                    "--scope",
                    scope,
                    "token",
                    *map(str, args),
                    "--at",
                    at(when).isoformat(),
                ]
            )
        self.assertEqual(result, code, stderr.getvalue() or stdout.getvalue()[:1000])
        output = stdout.getvalue() or stderr.getvalue()
        return json.loads(output) if output else None

    def admit(self, certificates=True):
        index = FederatedIndex(
            "citadel", 1, at(322), (self.b,), (self.c,) if certificates else ()
        )
        self.run_cli(
            "import-registry",
            self.write("index.json", index),
            "--publisher",
            "citadel",
            "--digest",
            index.root.value,
        )
        return index

    def test_persistent_certification_install_proposal_and_revocation(self):
        self.admit(certificates=False)
        self.run_cli(
            "certify",
            self.bp,
            "--suite",
            self.sp,
            "--checked-at",
            at(320).isoformat(),
            code=2,
        )
        certified_result = self.run_cli(
            "certify",
            self.bp,
            "--suite",
            self.sp,
            "--checked-at",
            at(320).isoformat(),
            "--proof",
            self.write("proof.json", self.c.proof),
            "--policy",
            self.pol,
            "--register",
        )
        self.assertEqual(certified_result["status"], "CERTIFIED")
        self.run_cli(
            "accept-certificate",
            self.write("certificate.json", self.c),
            "--policy",
            self.pol,
        )
        self.run_cli("install", self.pin)
        obs = observation(700)
        result = self.run_cli(
            "invoke",
            self.pin,
            "--implementation",
            "graph-v1",
            "--inputs",
            self.write("variables.json", obs.features),
            "--observation",
            self.write("observation.json", obs),
            "--environment",
            "synthetic",
            "--policy",
            self.pol,
            when=700,
        )
        self.assertEqual(result["effects_executed"], 0)
        self.assertEqual(result["proposal"]["authority"], "A2")
        self.assertEqual(self.run_cli("status", when=700)["installed"], 1)
        found = self.run_cli("search", "import", when=700)
        self.assertEqual(len(found), 1)
        self.assertEqual(
            self.run_cli("resolve", self.b.token.capability_id, when=700),
            self.b.token.pin.to_dict(),
        )
        self.run_cli("revoke", self.pin, "--reason", "captured regression", when=701)
        failed = self.run_cli(
            "invoke",
            self.pin,
            "--implementation",
            "graph-v1",
            "--inputs",
            self.write("variables2.json", obs.features),
            "--observation",
            self.write("observation2.json", obs),
            "--environment",
            "synthetic",
            "--policy",
            self.pol,
            when=702,
            code=1,
        )
        self.assertIn("revoked", failed["error"])

    def test_contract_schema_bundle_roundtrip_and_exclusive_output(self):
        self.assertIn("$defs", self.run_cli("schema"))
        inspection = self.run_cli("inspect", self.bp)
        self.assertEqual(inspection["certification"], "NOT_ESTABLISHED_BY_MANIFEST")
        assets = self.root / "assets"
        assets.mkdir()
        for path, content in self.b.files.items():
            (assets / path).write_text(content)
        packed = self.run_cli(
            "bundle", self.write("manifest.json", self.b.token), "--assets", assets
        )
        self.assertEqual(TokenBundle.from_dict(packed), self.b)
        output = self.root / "out.json"
        self.run_cli("schema", "--output", output)
        before = output.read_bytes()
        self.run_cli("schema", "--output", output, code=1)
        self.assertEqual(output.read_bytes(), before)

    def test_skill_archive_capture_index_and_mcp_roundtrip(self):
        directory = self.root / "skill"
        directory.mkdir()
        text = "---\nname: local-inspection\ndescription: Read captured public metadata.\n---\n\nPrepare a proposal.\n"
        (directory / "SKILL.md").write_text(text)
        imported = self.run_cli("import-skill", directory)
        package = self.write("skill.json", imported)
        snapshot = self.run_cli("skill-index", package)
        imported_again = self.run_cli(
            "import-skill-index",
            self.write("skill-index.json", snapshot["index"]),
            "--resources",
            self.write("resources.json", snapshot["resources"]),
        )
        self.assertEqual(imported_again, [imported])
        zip_path = self.root / "portable.zip"
        self.run_cli(
            "export-skill",
            self.bp,
            "--implementation",
            "graph-v1",
            "--output",
            zip_path,
        )
        exported = self.run_cli("import-skill", zip_path)
        self.assertIn("references/capability.json", exported["files"])
        original = self.b.token.implementations[0]
        skill_impl = replace(
            original,
            kind="agent_skill",
            entrypoint="SKILL.md",
            rollback_entrypoint=None,
            assets=(Asset("SKILL.md", content_hash(text), len(text.encode())),),
        )
        contract = replace(self.b.token, implementations=(skill_impl,))
        wrapped = self.run_cli(
            "pack-skill",
            package,
            "--contract",
            self.write("skill-contract.json", contract),
            "--implementation",
            "graph-v1",
        )
        self.assertEqual(TokenBundle.from_dict(wrapped).files, {"SKILL.md": text})
        self.assertIn(
            "_meta", self.run_cli("mcp", self.bp, "--implementation", "graph-v1")
        )
        descriptor = {
            "name": "lookup",
            "description": "Read metadata.",
            "inputSchema": schema({"query": {"type": "string"}}).document,
            "outputSchema": schema({"found": {"type": "boolean"}}).document,
        }
        capture = self.run_cli("import-mcp", self.write("tool.json", descriptor))
        self.assertEqual(capture["name"], "lookup")

    def test_update_and_compose_require_explicit_pinned_contracts(self):
        idx = self.admit()
        self.run_cli("install", self.pin)
        step = CompositionStep(
            "first", self.b.token.pin, "graph-v1", (), ("exception",), {}
        )
        plan = self.run_cli(
            "compose",
            self.write("steps.json", (step,)),
            "--authority",
            "A2",
            "--policy",
            self.pol,
        )
        self.assertEqual(plan["authority"], "A2")
        newer = bundle(version="1.1.0")
        index = FederatedIndex(
            "citadel", 2, at(601), (newer,), previous_digest=idx.root
        )
        self.run_cli(
            "import-registry",
            self.write("new-index.json", index),
            "--publisher",
            "citadel",
            "--digest",
            index.root.value,
            when=602,
        )
        self.run_cli(
            "update",
            self.write("new-pin.json", newer.token.pin),
            "--previous",
            self.pin,
            when=603,
        )
        self.assertEqual(
            self.run_cli("resolve", newer.token.capability_id, when=603),
            newer.token.pin.to_dict(),
        )

    def test_metered_passport_and_accounting_require_actual_captured_receipts(self):
        self.admit()
        item = call(self.b)
        policy = trust(item.verification)
        policy_path = self.write("call-policy.json", policy)
        calls = self.write("calls.json", (item, item))
        result = self.run_cli(
            "meter",
            self.bp,
            "--implementation",
            "graph-v1",
            "--calls",
            calls,
            "--policy",
            policy_path,
        )
        self.assertEqual(result["retained"], 1)
        summary = self.run_cli(
            "passport", self.bp, "--implementation", "graph-v1", "--policy", policy_path
        )
        self.assertEqual(summary["summary"]["verified_successes"], 1)
        report = self.run_cli(
            "settle", self.bp, "--implementation", "graph-v1", "--policy", policy_path
        )
        self.assertEqual(report["verified_units"], 1)
        self.assertIsNone(report["actual_revenue_minor"])
        measured = passport(
            self.b, "graph-v1", (item,), policy, scope_id=SCOPE, at=at(600)
        )
        review = verification(
            measured.subject,
            (str(measured.report_id),),
            when=at(601),
            tier=AuthorityTier.A3,
            checks=(
                "passport.measurements",
                "passport.privacy",
                "passport.publication",
            ),
        )
        public = self.run_cli(
            "publish-passport",
            self.write("measured.json", measured),
            "--review",
            self.write("publish-review.json", review),
            "--policy",
            self.write("publish-policy.json", trust(review)),
            when=602,
        )
        self.assertNotIn(SCOPE, json.dumps(public))
        self.assertEqual(public["passport"]["calls"], 1)

    def test_sharing_exports_only_closed_public_hypotheses(self):
        pattern = GeneralizedPattern(
            "python_imports",
            "module_missing",
            "restore_package_boundary",
            (RelationPredicate.DEPENDS_ON,),
            ("imports",),
        )
        episodes = (episode(0), episode(1))
        prepared = self.run_cli(
            "prepare-sharing",
            self.write("episodes.json", episodes),
            "--pattern",
            self.write("pattern.json", pattern),
        )
        draft = prepare_sharing(episodes, pattern, scope_id=SCOPE, at=at(600))
        self.assertEqual(prepared, draft.to_dict())
        receipt = verification(
            draft.subject,
            (str(draft.draft_id),),
            when=at(601),
            tier=AuthorityTier.A3,
            checks=("sharing.consent", "sharing.privacy", "sharing.generalization"),
        )
        exported = self.run_cli(
            "export-sharing",
            self.write("draft.json", draft),
            "--review",
            self.write("sharing-review.json", receipt),
            "--policy",
            self.write("sharing-policy.json", trust(receipt)),
            when=602,
        )
        self.assertEqual(exported["pattern"]["state"], "HYPOTHESIS")
        self.assertNotIn(SCOPE, json.dumps(exported))

    def test_bad_json_scope_and_missing_policy_fail_without_downgrading(self):
        broken = self.root / "broken.json"
        broken.write_text('{"name": "x", "name": "y"}')
        self.run_cli("inspect", broken, code=1)
        self.admit()
        self.run_cli("status", scope="foreign", code=1)
        self.run_cli(
            "certify",
            self.bp,
            "--suite",
            self.sp,
            "--proof",
            self.write("proof-bad.json", self.c.proof),
            "--checked-at",
            at(320).isoformat(),
            code=1,
        )
        with Registry(self.state, SCOPE) as registry:
            old_count = len(registry.entries())
        self.run_cli("install", self.pin, "--output", self.bp, code=1)
        with Registry(self.state, SCOPE) as registry:
            self.assertEqual(len(registry.entries()), old_count)

    def test_both_entrypoints_expose_the_same_protocol(self):
        root = Path(__file__).resolve().parents[2]
        for command in (
            [sys.executable, "-m", "libs.capability_tokens", "token", "--help"],
            [str(root / "scripts/cnwb"), "token", "--help"],
        ):
            result = subprocess.run(
                command, cwd=root, capture_output=True, text=True, check=False
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            for operation in (
                "certify",
                "invoke",
                "compose",
                "settle",
                "export-sharing",
                "revoke",
            ):
                self.assertIn(operation, result.stdout)
        for runner in (
            lambda: runpy.run_module("libs.capability_tokens", run_name="__main__"),
            lambda: runpy.run_path(str(root / "scripts/cnwb"), run_name="__main__"),
        ):
            with (
                patch.object(sys, "argv", ["cnwb", "token", "--help"]),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.assertRaises(SystemExit) as stopped:
                    runner()
                self.assertEqual(stopped.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
