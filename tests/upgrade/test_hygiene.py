# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_hygiene.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-HYGIENE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-HYGIENE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/agent_context.py, scripts/ci/public_redaction.py, knip.json
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/agent_context.py; VALIDATES scripts/ci/public_redaction.py;
#              VALIDATES knip.json
# Intent:      Prove the context lock reports GitHub-run gates and stale dispatches truthfully, and
#              that the docs redaction gate catches a planted machine name.
# ───────────────────────────────────────────────────────────────
"""Repository hygiene: the findings SRS-BUILDANDDO-HYGIENE-001 made the tools report."""
from __future__ import annotations

import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.ci import agent_context
from scripts.ci import public_redaction

ROOT = Path(__file__).resolve().parents[2]


def dispatch(srs: str, rows: list[str], *, header_only: bool = False) -> str:
    srs_line = "" if header_only else f"**SRS:** {srs} **Risk:** A1 **Seat:** DEMO **Status:** in_progress\n\n"
    table = "".join(f"| {i} | task {i} | `true` | {status} |\n" for i, status in enumerate(rows, 1))
    return (
        f"# ─── CGRF Header ───\n# SRS:         {srs}\n# ─────────\n\n# Dispatch\n\n{srs_line}"
        + ("| # | Task | Gate command | Status |\n|---|------|--------------|--------|\n" + table if rows else "")
    )


class HygieneFindingsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="hygiene-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        (self.root / ".bits/queue").mkdir(parents=True)
        (self.root / ".bits/srs").mkdir(parents=True)
        self.registry = [
            {"code": "SRS-DEMO-DONE-001", "status": "in_progress"},
            {"code": "SRS-DEMO-OPEN-001", "status": "in_progress"},
            {"code": "SRS-DEMO-SHIPPED-001", "status": "delivered"},
            {"code": "SRS-DEMO-HEADER-001", "status": "in_progress"},
        ]
        queue = self.root / ".bits/queue"
        queue.joinpath("VCC-DEMO-DONE-001.md").write_text(dispatch("SRS-DEMO-DONE-001", ["done", "done"]), encoding="utf-8")
        queue.joinpath("VCC-DEMO-OPEN-001.md").write_text(dispatch("SRS-DEMO-OPEN-001", ["done", "todo"]), encoding="utf-8")
        queue.joinpath("VCC-DEMO-SHIPPED-001.md").write_text(dispatch("SRS-DEMO-SHIPPED-001", ["done"]), encoding="utf-8")
        queue.joinpath("VCC-DEMO-HEADER-001.md").write_text(dispatch("SRS-DEMO-HEADER-001", [], header_only=True), encoding="utf-8")
        queue.joinpath("TEMPLATE.md").write_text(dispatch("SRS-X-001", ["todo"]), encoding="utf-8")
        self.inventory = {
            "governance": {"files": {}},
            "gates": [
                {"path": "scripts/ci/github_only.py", "wired_into_ci": False, "configured_providers": ["github"], "referenced_by": []},
                {"path": "scripts/ci/orphan.py", "wired_into_ci": False, "configured_providers": [], "referenced_by": []},
            ],
            "pipelines": [
                {"file": ".github/workflows/demo.yml", "provider": "github", "kind": "workflow", "scripts": ["scripts/ci/github_only.py"]},
            ],
            "tests": {"js_runners": ["vitest"], "junit_configured": True},
            "repo": {"build_scripts": [], "web_source_files": 0},
        }
        self.findings = agent_context.collect_findings(self.root, self.inventory, self.registry)

    def statements(self, fragment: str) -> list[dict]:
        return [f for f in self.findings if fragment in f["statement"]]

    def test_a_github_run_gate_names_its_workflow(self) -> None:
        (finding,) = self.statements("github_only.py")
        self.assertIn("run only by GitHub (.github/workflows/demo.yml)", finding["evidence"])

    def test_control_a_gate_nothing_runs_still_says_nothing(self) -> None:
        (finding,) = self.statements("orphan.py")
        self.assertEqual(finding["evidence"], "referenced by: nothing in this repo")

    def test_a_fully_done_dispatch_on_an_open_code_is_reported_not_closed(self) -> None:
        (finding,) = self.statements("VCC-DEMO-DONE-001 has every task done")
        self.assertEqual(finding["severity"], "medium")
        self.assertIn("2/2 tasks done", finding["evidence"])
        self.assertEqual(self.registry[0]["status"], "in_progress", "the finding must never flip a status")

    def test_control_a_dispatch_with_open_tasks_is_not_reported(self) -> None:
        self.assertEqual(self.statements("VCC-DEMO-OPEN-001"), [])

    def test_a_delivered_code_whose_dispatch_is_still_queued_is_reported(self) -> None:
        (finding,) = self.statements("SRS-DEMO-SHIPPED-001 is delivered")
        self.assertIn("delete a queue file once its PR is merged", finding["evidence"])
        self.assertEqual(self.statements("VCC-DEMO-SHIPPED-001 has every task done"), [],
                         "a delivered code is not also 'still in progress'")

    def test_a_dispatch_without_a_task_table_is_reported(self) -> None:
        (finding,) = self.statements("VCC-DEMO-HEADER-001 has no task table")
        self.assertEqual(finding["srs"], "SRS-DEMO-HEADER-001", "the SRS code comes from the CGRF header")

    def test_the_template_is_never_a_dispatch(self) -> None:
        self.assertEqual([f for f in self.findings if "TEMPLATE" in f["statement"]], [])


class DocsRedactionGateTests(unittest.TestCase):
    """The CI step: public_redaction.py scan docs README.md CHANGELOG.md CLAUDE.md AGENTS.md CONTRIBUTING.md."""

    TARGETS = ["docs", "README.md", "CHANGELOG.md", "CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md"]

    def scan(self, *targets: str) -> int:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return public_redaction.main(["scan", *targets])

    def test_the_live_public_docs_pass(self) -> None:
        self.assertEqual(self.scan(*(str(ROOT / t) for t in self.TARGETS)), 0)

    def test_control_a_planted_machine_name_in_a_doc_fails(self) -> None:
        folder = Path(tempfile.mkdtemp(prefix="docs-"))
        self.addCleanup(shutil.rmtree, folder, True)
        # A made-up name of a machine family, in a doc - not a test file, so no fixture allowance.
        (folder / "runbook.md").write_text("Run the probe from kvm7 before promoting.\n", encoding="utf-8")
        self.assertEqual(self.scan(str(folder)), 1)


class RegistryYamlTests(unittest.TestCase):
    """The repo's own readers parse the registry line by line, so they never noticed a note that broke
    YAML (an unquoted ": " added by this SRS on 2026-09-24). Any YAML reader would have."""

    def test_the_registry_is_valid_yaml_with_unique_codes(self) -> None:
        try:
            import yaml
        except ImportError:  # pragma: no cover - PyYAML ships with the CI images
            self.skipTest("PyYAML is not installed")
        data = yaml.safe_load((ROOT / ".bits/srs_registry.yml").read_text(encoding="utf-8"))
        codes = [entry["code"] for value in data.values() if isinstance(value, list)
                 for entry in value if isinstance(entry, dict) and "code" in entry]
        self.assertGreater(len(codes), 0)
        self.assertEqual(len(codes), len(set(codes)), "a code is registered twice")


class KnipConfigTests(unittest.TestCase):
    def test_every_named_entry_exists(self) -> None:
        config = json.loads((ROOT / "knip.json").read_text(encoding="utf-8"))
        for workspace, settings in config["workspaces"].items():
            for entry in settings.get("entry", []):
                if any(ch in entry for ch in "*{"):
                    self.assertTrue(list((ROOT / workspace).glob(entry.split("{")[0] + "*")), entry)
                else:
                    self.assertTrue((ROOT / workspace / entry).is_file(), f"{workspace}: {entry} does not exist")

    def test_no_component_is_hidden_as_an_entry(self) -> None:
        config = json.loads((ROOT / "knip.json").read_text(encoding="utf-8"))
        entries = config["workspaces"]["apps/web"]["entry"]
        self.assertFalse([e for e in entries if e.startswith("src/") and e != "src/main.jsx"],
                         "listing source files as entries hides them from the dead-code metric")


if __name__ == "__main__":
    unittest.main()
