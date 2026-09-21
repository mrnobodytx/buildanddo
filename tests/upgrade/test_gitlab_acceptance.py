# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_gitlab_acceptance.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/agent_context.py, scripts/ci/hostinger_readiness.py, scripts/ci/submission_readiness.py, .gitlab/ci/day21-submission.yml
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/agent_context.py; VALIDATES scripts/ci/hostinger_readiness.py; VALIDATES scripts/ci/submission_readiness.py; VALIDATES .gitlab/ci/day21-submission.yml
# Intent:      Prevent GitHub configuration, unreachable jobs or incomplete artifacts from standing in for GitLab acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise configured GitLab reachability without claiming a hosted execution."""

from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from scripts.ci import (
    agent_context,
    gitlab_ci,
    hostinger_readiness,
    submission_readiness,
)

ROOT = Path(__file__).resolve().parents[2]
FRAGMENT = ".gitlab/ci/day21-submission.yml"


class GitLabAcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="gitlab-acceptance-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.write(".gitlab-ci.yml", "include:\n  - local: '" + FRAGMENT + "'\n")
        self.job = (
            "day21_governance:\n"
            "  stage: verify\n"
            "  script:\n"
            "    - python3 scripts/ci/hostinger_readiness.py --check\n"
            "    - python3 scripts/ci/submission_readiness.py --check\n"
        )
        self.write(FRAGMENT, self.job)
        for name in ("AGENTS.md", ".bits/context.md"):
            self.write(
                name,
                "python scripts/ci/hostinger_readiness.py --check\n"
                "python scripts/ci/submission_readiness.py --check\n"
                "governance:readiness\n",
            )
        self.write(
            "apps/web/src/components/workspace/ProgressionPipeline.jsx",
            "governance:readiness\n",
        )

    def write(self, name: str, content: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def test_gitlab_root_and_reachable_includes_are_inventoried(self) -> None:
        self.write(
            ".gitlab/ci/orphan.yml",
            "unused:\n  script:\n    - python scripts/ci/orphan.py\n",
        )
        pipelines = agent_context.collect_pipelines(self.root)
        self.assertEqual(
            {item["file"] for item in pipelines}, {".gitlab-ci.yml", FRAGMENT}
        )
        included = next(item for item in pipelines if item["file"] == FRAGMENT)
        self.assertEqual(included["provider"], "gitlab")
        self.assertIn("scripts/ci/hostinger_readiness.py", included["scripts"])

    def test_governance_uses_gitlab_without_requiring_github(self) -> None:
        hostinger_readiness.check_wiring(self.root)
        submission_readiness.check_wiring(self.root)

    def test_github_cannot_replace_missing_gitlab_governance(self) -> None:
        self.write(
            ".github/workflows/pr-governance.yml",
            "jobs:\n  checks:\n    steps:\n"
            "      - run: python scripts/ci/hostinger_readiness.py --check\n"
            "      - run: python scripts/ci/submission_readiness.py --check\n",
        )
        self.write(FRAGMENT, "# " + self.job.replace("\n", "\n# "))
        for module in (hostinger_readiness, submission_readiness):
            with (
                self.subTest(module=module.__name__),
                self.assertRaises(hostinger_readiness.ReadinessError),
            ):
                module.check_wiring(self.root)

    def test_unreachable_include_does_not_satisfy_governance(self) -> None:
        self.write(".gitlab-ci.yml", "stages: [test]\n")
        with self.assertRaises(hostinger_readiness.ReadinessError):
            hostinger_readiness.check_wiring(self.root)

    def test_comments_and_templates_do_not_wire_gates(self) -> None:
        self.write(
            FRAGMENT,
            ".template:\n  script:\n    - python scripts/ci/hidden.py\n"
            "real_job:\n  script:\n    # python scripts/ci/comment.py\n"
            "    - python scripts/ci/actual.py\n",
        )
        pipelines = agent_context.collect_pipelines(self.root)
        scripts = {script for item in pipelines for script in item["scripts"]}
        self.assertEqual(scripts, {"scripts/ci/actual.py"})

    def test_full_runner_exposes_its_transitive_fixed_checks(self) -> None:
        self.write(
            FRAGMENT,
            "full:\n  script:\n    - python3 tools/day21/day21_acceptance.py --offline\n",
        )
        pipelines = agent_context.collect_pipelines(self.root)
        scripts = {script for item in pipelines for script in item["scripts"]}
        self.assertIn("scripts/ci/supply_chain.py", scripts)
        self.assertIn("scripts/ci/verify_public_boundary.py", scripts)
        self.assertIn("scripts/ci/day21_submission.py", scripts)

    def test_github_only_gate_is_not_reported_as_gitlab_execution(self) -> None:
        self.write(
            ".github/workflows/old.yml",
            "jobs:\n  old:\n    steps:\n      - run: python scripts/ci/old.py\n",
        )
        gates = agent_context.collect_gates(
            self.root,
            ["scripts/ci/old.py", "scripts/ci/hostinger_readiness.py"],
            agent_context.collect_pipelines(self.root),
        )
        by_path = {gate["path"]: gate for gate in gates}
        self.assertFalse(by_path["scripts/ci/old.py"]["wired_into_ci"])
        self.assertTrue(by_path["scripts/ci/hostinger_readiness.py"]["wired_into_ci"])

    def test_nested_includes_are_inspected_once_and_cycles_fail_closed(self) -> None:
        nested = ".gitlab/ci/nested.yaml"
        self.write(FRAGMENT, "include:\n  - local: '" + nested + "'\n")
        self.write(nested, self.job)
        self.assertEqual(gitlab_ci.collect(self.root).files.count(nested), 1)
        hostinger_readiness.check_wiring(self.root)
        self.write(nested, "include:\n  - local: '.gitlab-ci.yml'\n" + self.job)
        with self.assertRaisesRegex(hostinger_readiness.ReadinessError, "Cyclic"):
            hostinger_readiness.check_wiring(self.root)

    def test_missing_unsafe_external_and_symlinked_includes_are_not_inferred(
        self,
    ) -> None:
        for entry in (
            "local: '.gitlab/ci/missing.yml'",
            "local: '../outside.yml'",
            "remote: 'https://example.invalid/unavailable.yml'",
            "local: '.gitlab/ci/link.yml'",
        ):
            self.write(".gitlab-ci.yml", "include:\n  - " + entry + "\n" + self.job)
            link = self.root / ".gitlab/ci/link.yml"
            if not link.exists():
                link.symlink_to(self.root / FRAGMENT)
            with (
                self.subTest(entry=entry),
                self.assertRaises(hostinger_readiness.ReadinessError),
            ):
                hostinger_readiness.check_wiring(self.root)

    def test_optional_disabled_inherited_or_suppressed_checks_cannot_gate(self) -> None:
        for changed in (
            self.job.replace("  stage: verify", "  allow_failure: true"),
            self.job.replace("  stage: verify", "  when: never"),
            self.job.replace("  stage: verify", "  when: manual"),
            self.job.replace("  stage: verify", "  extends: .template"),
            self.job.replace("--check", "--check || true"),
            self.job.replace("python3 scripts", "echo python3 scripts"),
            self.job.replace("--check", "--check\n  rules:\n    - when: manual"),
        ):
            self.write(FRAGMENT, changed)
            with (
                self.subTest(job=changed),
                self.assertRaises(hostinger_readiness.ReadinessError),
            ):
                hostinger_readiness.check_wiring(self.root)

    def test_duplicate_job_override_cannot_preserve_a_disabled_gate(self) -> None:
        self.write(
            ".gitlab-ci.yml",
            (self.root / ".gitlab-ci.yml").read_text()
            + "day21_governance:\n  when: never\n",
        )
        with self.assertRaisesRegex(hostinger_readiness.ReadinessError, "Duplicate"):
            hostinger_readiness.check_wiring(self.root)

    def test_block_scalars_and_aliases_need_merged_config_review(self) -> None:
        for script in (
            "    - |\n      python3 scripts/ci/hostinger_readiness.py --check\n",
            "    - *inherited_steps\n",
            "    - !reference [.template, script]\n",
        ):
            self.write(FRAGMENT, "review:\n  script:\n" + script)
            with self.assertRaises(hostinger_readiness.ReadinessError):
                hostinger_readiness.check_wiring(self.root)
        self.assertEqual(gitlab_ci.arguments("unterminated '"), [])

    def test_checked_in_job_runs_full_matrix_with_isolated_python(self) -> None:
        config = gitlab_ci.collect(ROOT)
        self.assertEqual(config.errors, ())
        jobs = {job.name: job for job in config.jobs}
        full = jobs["day21_full_acceptance"]
        invocations = [
            gitlab_ci.arguments(command)
            for command in full.commands
            if "tools/day21/day21_acceptance.py" in command
        ]
        self.assertEqual(len(invocations), 1)
        argv = invocations[0]
        self.assertEqual(argv[0], "state/day21/venv/bin/python")
        self.assertIn("--install-deps", argv)
        self.assertFalse({"--source-only", "--native-only"} & set(argv))
        self.assertTrue(full.required)
        self.assertFalse(jobs["day21_submission_bundle"].required)
        hostinger_readiness.check_wiring(ROOT)
        submission_readiness.check_wiring(ROOT)

    def test_github_governance_is_an_explicit_manual_fallback(self) -> None:
        workflow = next(
            item
            for item in agent_context.collect_pipelines(ROOT)
            if item["file"] == ".github/workflows/pr-governance.yml"
        )
        self.assertEqual(workflow["triggers"], ["workflow_dispatch"])
        text = (ROOT / workflow["file"]).read_text()
        self.assertNotIn("ref: refs/pull/", text)
        self.assertEqual(text.count("uses: actions/checkout@v4"), 7)
        self.assertEqual(text.count("ref: ${{ needs.candidate.outputs.sha }}"), 7)
        self.assertEqual(text.count("needs: candidate"), 7)

    def test_gitlab_preserves_required_coverage_and_actor_gates(self) -> None:
        commands = (
            ("scripts/ci/verify_public_boundary.py", "--gitlab-ci"),
            ("tests/upgrade/check_sprint_execution.py",),
            (
                "tests/upgrade/check_discordbot.py",
                "--include-research",
                "--require-sdk",
                "--require-pdf",
            ),
            ("tests/upgrade/check_blueprint_pipeline.py", "--require-pdf"),
            ("tests/foundry/check_foundry.py",),
            ("tests/upgrade/check_federal_foundry.py",),
            ("tests/upgrade/check_mission_suite.py",),
        )
        for script, *args in commands:
            with self.subTest(script=script):
                gitlab_ci.require_command(ROOT, script, *args)
        governance = next(
            job
            for job in gitlab_ci.collect(ROOT).jobs
            if job.name == "day21_governance"
        )
        self.assertTrue(
            any(
                "tests.upgrade.test_hostinger_replay" in command
                for command in governance.commands
            )
        )

    def test_portable_suites_keep_both_python_versions_and_real_outputs(self) -> None:
        path = ROOT / ".gitlab/ci/source-validation.yml"
        self.assertTrue(
            path.is_file(), "Required suites must move with the execution provider"
        )
        text = path.read_text()
        sections = {name: body for name, _inline, body in gitlab_ci._sections(text)}
        for name in (
            "source_foundry",
            "source_federal_portfolio",
            "source_mission_suite",
        ):
            with self.subTest(job=name):
                body = sections[name]
                self.assertIn('PYTHON_VERSION: ["3.11", "3.12"]', body)
                self.assertIn("python${PYTHON_VERSION} -m venv", body)
                self.assertIn("when: always", body)
                self.assertNotIn("allow_failure: true", body)
        self.assertIn(
            "federal_foundry verify state/ci/foundry-review", sections["source_foundry"]
        )
        self.assertIn(
            "apps.federal_foundry compile --output state/ci/federal-portfolio",
            sections["source_federal_portfolio"],
        )
        self.assertIn(
            "apps.mission_suite package state/ci/mission-suite.tgz",
            sections["source_mission_suite"],
        )

    def test_submission_waits_for_all_required_source_jobs(self) -> None:
        sections = {
            name: body
            for name, _inline, body in gitlab_ci._sections(
                (ROOT / ".gitlab/ci/day21-submission.yml").read_text()
            )
        }
        bundle = sections["day21_submission_bundle"]
        for name in (
            "day21_governance",
            "day21_full_acceptance",
            "source_discord",
            "source_foundry",
            "source_federal_portfolio",
            "source_mission_suite",
        ):
            with self.subTest(job=name):
                self.assertIn("- job: " + name + "\n", bundle)
        self.assertNotIn("optional: true", bundle)
        self.assertIn("when: manual", bundle)
        self.assertIn("allow_failure: false", bundle)

    def test_wrapper_modes_and_literal_scripts_are_reported_conservatively(
        self,
    ) -> None:
        scripts = agent_context.gitlab_scripts(
            [
                "python3 scripts/ci/hostinger_readiness.py --run all",
                "python3 scripts/ci/hostinger_readiness.py --run",
                "python3 scripts/ci/hostinger_readiness.py --run unknown",
                "python3 -m unittest",
                "echo scripts/ci/only_documented.py",
            ]
        )
        self.assertIn("scripts/ci/supply_chain.py", scripts)
        self.assertNotIn("scripts/ci/only_documented.py", scripts)
        scripts = agent_context.gitlab_scripts(
            [
                "python3 tools/day21/day21_acceptance.py --native-only",
            ]
        )
        self.assertNotIn("scripts/ci/supply_chain.py", scripts)


if __name__ == "__main__":
    unittest.main()
