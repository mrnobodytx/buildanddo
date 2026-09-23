# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_capability_token_contracts.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/interop.py, libs/capability_tokens/models.py, libs/capability_tokens/schema.py, libs/semantic_twin/contracts.py, libs/semantic_twin/merkle.py, tests/upgrade/test_capability_token_support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/interop.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/schema.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON tests/upgrade/test_capability_token_support.py
# Intent:      Test portable typed contracts, exact artifact identity and malicious skill containers.
# ───────────────────────────────────────────────────────────────

"""Test portable token and interoperability boundaries with synthetic inputs."""

import json
import stat
import tempfile
import unittest
import zipfile
from dataclasses import replace
from pathlib import Path

from libs.capability_tokens.interop import (
    McpToolCapture,
    SkillPackage,
    export_skill,
    export_skill_index,
    import_skill,
    import_skill_index,
    mcp_descriptor,
    skill_zip,
)
from libs.capability_tokens.models import (
    Asset,
    Attribution,
    CapabilityToken,
    Pricing,
    TokenBundle,
    content_hash,
    safe_path,
    version_key,
)
from libs.capability_tokens.schema import ValueSchema
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.merkle import ContentDigest
from tests.upgrade.test_capability_token_support import ACTOR, bundle, schema


class SchemaTests(unittest.TestCase):
    def test_integer_bounds_preserve_precision_beyond_float_range(self):
        exact = 2**53 + 1
        bounded = ValueSchema({"type": "integer", "minimum": exact, "maximum": exact})
        bounded.validate(exact)
        with self.assertRaises(ContractError):
            bounded.validate(exact - 1)
        huge = 10**500
        ValueSchema({"type": "integer"}).validate(huge)
        ValueSchema({"type": "number", "minimum": huge, "maximum": huge}).validate(huge)

    def test_nested_strict_types_and_roundtrip(self):
        model = schema(
            {
                "count": {"type": "integer", "minimum": 1, "maximum": 3},
                "items": {
                    "type": "array",
                    "items": {"type": "boolean"},
                    "minItems": 1,
                    "maxItems": 2,
                },
                "name": {"type": "string", "minLength": 1, "maxLength": 3},
                "nil": {"type": "null"},
            }
        )
        value = {"count": 2, "items": [False], "name": "ab", "nil": None}
        model.validate(value)
        self.assertEqual(ValueSchema.from_json(model.to_json()), model)
        for patch in (
            {"count": True},
            {"count": 4},
            {"count": 0},
            {"items": []},
            {"items": [False] * 3},
            {"name": ""},
            {"name": "long"},
            {"nil": False},
            {"surprise": "x"},
            {"count": float("nan")},
        ):
            with self.subTest(patch=patch), self.assertRaises(ContractError):
                model.validate({**value, **patch})
        with self.assertRaises(ContractError):
            model.validate({})

    def test_unknown_schema_constraints_fail_closed(self):
        for doc in (
            {"type": "string", "pattern": ".*"},
            {"type": ["string", "null"]},
            {
                "type": "object",
                "properties": {},
                "required": [],
                "additionalProperties": True,
            },
            {"type": "array"},
            {"type": "string", "enum": []},
            {"type": "integer", "enum": [1, True]},
            {"type": "string", "enum": ["x", "x"]},
            {"type": "number", "minimum": 10, "maximum": 1},
            {"type": "string", "minLength": -1},
            {"type": "string", "maxLength": True},
            {"type": "integer", "minimum": "1"},
            {"type": "number", "maximum": float("inf")},
            {"type": "string", "description": 1},
            {"type": "string", "x-data-classification": "unrestricted"},
        ):
            with self.subTest(doc=doc), self.assertRaises(ContractError):
                ValueSchema(doc)

    def test_enum_and_conservative_composition_fields(self):
        enum = ValueSchema({"type": "string", "enum": ["one", "two"]})
        enum.validate("one")
        with self.assertRaises(ContractError):
            enum.validate("three")
        self.assertTrue(
            enum.accepts(ValueSchema({**enum.document, "description": "label"}))
        )
        self.assertFalse(enum.accepts(ValueSchema({"type": "integer"})))
        obj = schema({"choice": dict(enum.document)}, required=[])
        with self.assertRaises(ContractError):
            obj.field("choice", required=True)
        with self.assertRaises(ContractError):
            obj.field("missing")
        with self.assertRaises(ContractError):
            enum.field("choice")
        ValueSchema({"type": "number"}).validate(1.25)

    def test_recursive_bound_and_input_immutability(self):
        doc = {"type": "string"}
        for _ in range(18):
            doc = {"type": "array", "items": doc}
        with self.assertRaises(ContractError):
            ValueSchema(doc)
        original = {"type": "string", "enum": ["x"]}
        obj = ValueSchema(original)
        original["enum"].append("y")
        with self.assertRaises(ContractError):
            obj.validate("y")


class TokenTests(unittest.TestCase):
    def test_token_roundtrip_schema_and_exact_digests(self):
        b = bundle()
        self.assertEqual(b, TokenBundle.from_json(b.to_json()))
        self.assertEqual(b.token.pin, CapabilityToken.from_json(b.token.to_json()).pin)
        self.assertIn("$defs", CapabilityToken.json_schema())
        changed = replace(b.token, description=b.token.description + " updated")
        self.assertNotEqual(b.token.pin, changed.pin)
        self.assertNotEqual(b.token.binding("graph-v1"), changed.binding("graph-v1"))
        with self.assertRaises(ContractError):
            TokenBundle(b.token, {**b.files, "rule.json": b.files["rule.json"] + " "})
        with self.assertRaises(ContractError):
            TokenBundle(b.token, {**b.files, "hidden.txt": "x"})

    def test_semver_namespace_and_missing_alternative(self):
        self.assertLess(version_key("1.9.0"), version_key("1.10.0"))
        for value in ("latest", "v1.0.0", "01.0.0", "1.0", "1.0.0-rc1"):
            with self.assertRaises(ContractError):
                version_key(value)
        b = bundle()
        with self.assertRaises(ContractError):
            replace(b.token, publisher="another")
        with self.assertRaises(ContractError):
            b.token.implementation("unknown")
        with self.assertRaises(ContractError):
            replace(b.token, dependencies=(b.token.pin,))

    def test_asset_and_pricing_bounds(self):
        for path in (
            "../SKILL.md",
            "/SKILL.md",
            "a//b",
            "./a",
            ".",
            r"a\b",
            "a:b",
            ".env",
            "x/id_rsa",
        ):
            with self.assertRaises(ContractError):
                safe_path(path)
        for amount in (-1, 10001):
            with self.assertRaises(ContractError):
                Attribution(ACTOR, amount)
        with self.assertRaises(ContractError):
            Pricing("USD", -1, (Attribution(ACTOR, 1),))
        with self.assertRaises(ContractError):
            Pricing("usd", 1, (Attribution(ACTOR, 1),))
        with self.assertRaises(ContractError):
            Asset("a", ContentDigest("a" * 64), 0)
        self.assertEqual(content_hash("a"), content_hash(b"a"))

    def test_graph_program_cannot_change_contract_authority_or_lineage(self):
        b = bundle()
        with self.assertRaises(ContractError):
            TokenBundle(replace(b.token, lineage=()), b.files)
        with self.assertRaises(ContractError):
            replace(b.token, implementations=())
        with self.assertRaises(ContractError):
            replace(b.token, skills=())
        with self.assertRaises(ContractError):
            b.program("graph-v1", rollback=True).from_json("{}")


class InteropTests(unittest.TestCase):
    def skill(self):
        return SkillPackage.from_files(
            {
                "SKILL.md": "---\nname: sample-skill\ndescription: >\n  Read local data\n  and prepare proposals.\n---\n\nInspect the supplied records.\n",
                "scripts/inspect.py": "raise RuntimeError('must never execute')\n",
            }
        )

    def test_directory_zip_and_metadata_roundtrip_without_execution(self):
        s = self.skill()
        self.assertEqual(s.description, "Read local data and prepare proposals.")
        self.assertEqual(skill_zip(s), skill_zip(s))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            for path, content in s.files.items():
                (root / path).write_text(content)
            self.assertEqual(import_skill(root), s)
            zipped = root.parent / (root.name + ".zip")
            try:
                zipped.write_bytes(skill_zip(s))
                self.assertEqual(import_skill(zipped), s)
            finally:
                zipped.unlink()

    def test_malicious_archives_and_symlinks_rejected(self):
        for name, mode in (
            ("../outside", 0o100644),
            ("/absolute", 0o100644),
            ("resource", stat.S_IFLNK | 0o777),
        ):
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "skill.zip"
                with zipfile.ZipFile(path, "w") as z:
                    info = zipfile.ZipInfo(name)
                    info.external_attr = mode << 16
                    z.writestr(info, "content")
                with self.assertRaises(ContractError):
                    import_skill(path)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "SKILL.md").symlink_to("/not/read")
            with self.assertRaises(ContractError):
                import_skill(root)

    def test_frontmatter_rejects_ambiguous_or_executable_yaml(self):
        for content in (
            "missing",
            "---\nname: x",
            "---\nname: x\nname: y\n---\nbody",
            "---\nname: x\ndescription: !!python/object:anything\n---\nbody",
            "---\nname: x\ndescription: x\nmetadata:\n  run: command\n---\nbody",
            "---\nname: UPPER\ndescription: x\n---\nbody",
            "---\nname: x\ndescription: x\n---\n",
        ):
            with self.subTest(content=content), self.assertRaises(ContractError):
                SkillPackage.from_files({"SKILL.md": content})
        quoted = SkillPackage.from_files(
            {"SKILL.md": "---\nname: quoted\ndescription: 'It''s a skill.'\n---\nbody"}
        )
        self.assertEqual(quoted.description, "It's a skill.")

    def test_index_uses_only_captured_resources(self):
        skill = self.skill()
        capture = export_skill_index((skill,))
        imported = import_skill_index(capture["index"], capture["resources"])
        self.assertEqual(imported[0].files, {"SKILL.md": skill.files["SKILL.md"]})
        with self.assertRaises(ContractError):
            import_skill_index(capture["index"], {})
        changed = {
            "skills": [
                {
                    "name": "wrong",
                    "description": skill.description,
                    "uri": "skill://sample-skill/SKILL.md",
                }
            ]
        }
        with self.assertRaises(ContractError):
            import_skill_index(changed, capture["resources"])

    def test_token_skill_and_mcp_descriptors_do_not_export_verification(self):
        b = bundle()
        skill = export_skill(b, "graph-v1")
        self.assertIn("no certification", skill.files["SKILL.md"])
        descriptor = mcp_descriptor(b, "graph-v1")
        self.assertTrue(descriptor["annotations"]["readOnlyHint"])
        self.assertEqual(set(descriptor["_meta"]["cnwb"]), {"pin", "implementation"})
        self.assertEqual(
            descriptor["inputSchema"]["properties"]["observation"]["$ref"],
            "#/$defs/DecisionInput",
        )
        self.assertIn("DecisionInput", descriptor["inputSchema"]["$defs"])
        json.dumps(descriptor)
        model = {
            "name": "inspect",
            "description": "Inspect values.",
            "inputSchema": schema({"x": {"type": "integer"}}).document,
            "outputSchema": schema({"ok": {"type": "boolean"}}).document,
        }
        captured = McpToolCapture.from_descriptor(model)
        captured.inputs.validate({"x": 1})
        with self.assertRaises(ContractError):
            McpToolCapture.from_descriptor({**model, "inputSchema": {"$ref": "remote"}})


if __name__ == "__main__":
    unittest.main()
