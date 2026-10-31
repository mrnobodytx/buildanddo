# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_gitlab_acceptance.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/agent_context.py, scripts/ci/hostinger_readiness.py, scripts/ci/submission_readiness.py, .gitlab/ci/day21-submission.yml, .gitlab/ci/source-validation.yml,
#              .gitlab/ci/github-plane.yml
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/agent_context.py; VALIDATES scripts/ci/hostinger_readiness.py; VALIDATES scripts/ci/submission_readiness.py; VALIDATES .gitlab/ci/day21-submission.yml; VALIDATES .gitlab/ci/source-validation.yml;
#              VALIDATES .gitlab/ci/github-plane.yml
# Intent:      Prevent GitHub configuration, unreachable jobs or incomplete artifacts from standing in for GitLab acceptance,
#              and keep the keyed lesson-key lane off by default, protected-only and unable to leak or gate anything else.
# ───────────────────────────────────────────────────────────────

"""Exercise configured GitLab reachability without claiming a hosted execution."""

from __future__ import annotations

from pathlib import Path
import re
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
PLANE = ".gitlab/ci/github-plane.yml"
KEYED_JOBS = ("lesson_keys_bundle", "lesson_keys_private")
KEYED_RULE = (
    '($CI_PIPELINE_SOURCE == "push" || $CI_PIPELINE_SOURCE == "web") && $CI_COMMIT_BRANCH == "buildanddo-source"'
    ' && $CI_COMMIT_REF_PROTECTED == "true" && $BUILDANDDO_LESSON_KEYS_ENABLED == "1"'
)
# The key file variable itself, not the switch BUILDANDDO_LESSON_KEYS_ENABLED.
KEY_VARIABLE_RE = re.compile(r"\$\{?BUILDANDDO_LESSON_KEYS(?![A-Z0-9_])")


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

    def test_gitlab_is_the_only_ci_and_reviews_every_public_head(self) -> None:
        # SRS-BUILDANDDO-GITLAB-ONLY-CI-001: GitHub runs nothing; GitLab reviews both
        # the public main mirror and every mirrored pull-request head.
        self.assertFalse(list((ROOT / ".github").glob("workflows/*.y*ml")))
        self.assertFalse((ROOT / ".github/actions").exists())
        pipelines = agent_context.collect_pipelines(ROOT)
        self.assertEqual({item["provider"] for item in pipelines}, {"gitlab"})
        self.assertIn(".gitlab/ci/github-plane.yml", {item["file"] for item in pipelines})
        config = gitlab_ci.collect(ROOT)
        self.assertEqual(config.errors, ())
        jobs = {job.name: job for job in config.jobs}
        for name in ("github_intake", "evidence_epoch", "main_writeback", "stack_telemetry", "supply_chain_weekly"):
            self.assertTrue(jobs[name].required, name)
        self.assertFalse(jobs["ci_report"].required)
        sources = {
            path: (ROOT / path).read_text()
            for path in (".gitlab-ci.yml", ".gitlab/ci/day21-submission.yml", ".gitlab/ci/source-validation.yml")
        }
        gate_rule = (
            "'$CI_PIPELINE_SOURCE != \"schedule\" && ($CI_COMMIT_BRANCH == \"main\" || "
            "$CI_COMMIT_BRANCH == \"buildanddo-source\" || $CI_COMMIT_BRANCH =~ /^(sprint|review)\\//)'"
        )
        for path, text in sources.items():
            with self.subTest(path=path):
                self.assertNotIn("'$CI_COMMIT_BRANCH == \"main\" || $CI_COMMIT_BRANCH =~ /^sprint\\//'", text)
        for name in ("integrity_gate", "sprint_replay", "praxis_evidence_tests", "day21_governance",
                     "day21_full_acceptance", "source_discord", "source_foundry", "source_federal_portfolio",
                     "source_mission_suite", "source_behavior_coverage", "source_assurance"):
            with self.subTest(job=name):
                self.assertIn(jobs[name].file, sources)
                body = sources[jobs[name].file].split(f"\n{name}:\n", 1)[1].split("\n\n", 1)[0]
                self.assertIn(gate_rule, body)
        governance = sources[".gitlab/ci/day21-submission.yml"].split("\nday21_governance:\n", 1)[1]
        self.assertLess(
            governance.index("scripts/ci/gitlab_plane.py review-event"),
            governance.index("scripts/ci/verify_public_boundary.py --gitlab-ci"),
        )
        self.assertIn("BUILDANDDO_GITHUB_PR_EVENT: state/ci/github-pr-event.json", governance)
        plane = (ROOT / ".gitlab/ci/github-plane.yml").read_text()
        bodies = {**{k: v for path, text in sources.items() for k, v in
                     ((n, text.split(f"\n{n}:\n", 1)[1].split("\n\n", 1)[0]) for n in jobs if f"\n{n}:\n" in text)},
                  **{n: plane.split(f"\n{n}:\n", 1)[1].split("\n\n", 1)[0] for n in jobs if f"\n{n}:\n" in plane}}
        for name in ("integrity_gate", "day21_full_acceptance", "source_foundry", "ci_report"):
            self.assertIn("interruptible: true", bodies[name], name)
        for name in ("evidence_epoch", "main_writeback", "github_intake"):
            self.assertNotIn("interruptible", bodies[name], name)
        for name in ("github_intake", "main_writeback", "stack_telemetry"):
            self.assertIn("tags: [buildanddo-plane]", bodies[name], name)
        for name in ("integrity_gate", "day21_full_acceptance", "source_foundry", "evidence_epoch", "ci_report"):
            self.assertNotIn("buildanddo-plane", bodies[name], name)
        intake = bodies["github_intake"]
        self.assertLess(intake.index("gitlab_plane.py status"), intake.index("gitlab_plane.py automerge"))
        for name in ("github_intake", "main_writeback"):
            body = plane.split(f"\n{name}:\n", 1)[1].split("\n\n", 1)[0]
            self.assertIn('$CI_COMMIT_REF_PROTECTED == "true"', body, name)

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
            ("tests/career/check_career.py",),
            ("tests/knowledge_units/check_knowledge_units.py",),
            ("tests/integrity/check_integrity.py",),
            ("tests/world_twin/check_world_twin.py",),
            ("tests/upgrade/check_media_corpus.py",),
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
            "source_behavior_coverage",
            "source_assurance",
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

    def test_behavior_coverage_keeps_all_gates_and_reports_reachable(self) -> None:
        config = gitlab_ci.collect(ROOT)
        self.assertEqual(config.errors, ())
        job = next(job for job in config.jobs if job.name == "source_behavior_coverage")
        self.assertEqual(job.file, ".gitlab/ci/source-validation.yml")
        self.assertTrue(job.required)
        suites = ("career", "knowledge_units", "integrity", "world_twin")
        self.assertEqual(
            job.commands,
            ("python${PYTHON_VERSION} -m venv state/ci/behavior-venv",)
            + tuple(
                f"state/ci/behavior-venv/bin/python tests/{suite}/check_{suite}.py"
                for suite in suites
            )
            + (
                "state/ci/behavior-venv/bin/python tests/upgrade/check_work_exchange.py",
                "state/ci/behavior-venv/bin/python tests/upgrade/check_media_corpus.py",
            ),
        )
        sections = {
            name: body
            for name, _inline, body in gitlab_ci._sections((ROOT / job.file).read_text())
        }
        body = sections[job.name]
        self.assertIn("      - reports/coverage/media-corpus.json\n", body)
        self.assertIn("tags: [buildanddo]", body)
        self.assertIn('name: "source-behavior-coverage-${PYTHON_VERSION}"', body)
        self.assertIn("expire_in: 30 days", body)
        self.assertIn("      - reports/coverage/work-exchange.json\n", body)
        for suite in suites:
            with self.subTest(suite=suite):
                self.assertIn(
                    "      - reports/coverage/" + suite.replace("_", "-") + ".json\n",
                    body,
                )
        for rule in (
            '$DAY21_FULL_ACCEPTANCE == "1" || $DAY21_COMPILE_SUBMISSION == "1"',
            '$CI_PIPELINE_SOURCE == "merge_request_event" || $CI_PIPELINE_SOURCE == "external_pull_request_event"',
            '$CI_PIPELINE_SOURCE != "schedule" && ($CI_COMMIT_BRANCH == "main" || '
            '$CI_COMMIT_BRANCH == "buildanddo-source" || $CI_COMMIT_BRANCH =~ /^(sprint|review)\\//)',
        ):
            self.assertIn("    - if: '" + rule + "'\n", body)

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
            "source_behavior_coverage",
            "source_assurance",
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


def evaluate_rule(rule: str, env: dict[str, str]) -> bool:
    """Evaluate a GitLab `if:` made of ==, !=, &&, || and parentheses; an unset variable is null."""
    tokens = re.findall(r'\s*(\(|\)|&&|\|\||==|!=|\$[A-Za-z_][A-Za-z0-9_]*|"[^"]*")', rule)
    if "".join(tokens).replace(" ", "") != rule.replace(" ", ""):
        raise ValueError("unsupported rule syntax")
    items = [token.strip() for token in tokens]
    position = 0

    def take() -> str:
        nonlocal position
        position += 1
        return items[position - 1]

    def operand() -> str | None:
        token = take()
        return env.get(token[1:]) if token.startswith("$") else token[1:-1]

    def primary() -> bool:
        if items[position] == "(":
            take()
            value = disjunction()
            if take() != ")":
                raise ValueError("unbalanced rule")
            return value
        left, operator, right = operand(), take(), operand()
        if operator not in {"==", "!="}:
            raise ValueError("unsupported comparison")
        return (left == right) == (operator == "==")

    def conjunction() -> bool:
        value = primary()
        while position < len(items) and items[position] == "&&":
            take()
            value = primary() and value
        return value

    def disjunction() -> bool:
        value = conjunction()
        while position < len(items) and items[position] == "||":
            take()
            value = conjunction() or value
        return value

    result = disjunction()
    if position != len(items):
        raise ValueError("trailing rule tokens")
    return result


class KeyedLaneContractTests(unittest.TestCase):
    """SRS-BUILDANDDO-CURRICULUM-PRIVATE-001 A10: the keyed lane ships off and stays isolated."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = gitlab_ci.collect(ROOT)
        cls.jobs = {job.name: job for job in cls.config.jobs}
        cls.plane = (ROOT / PLANE).read_text()
        cls.sources = {name: (ROOT / name).read_text() for name in cls.config.files}
        cls.bodies = {
            name: text.split(f"\n{name}:\n", 1)[1].split("\n\n", 1)[0]
            for text in cls.sources.values()
            for name in cls.jobs
            if f"\n{name}:\n" in text
        }

    def test_both_jobs_are_reachable_in_the_plane_include(self) -> None:
        self.assertEqual(self.config.errors, ())
        self.assertIn(PLANE, self.config.files)
        for name in KEYED_JOBS:
            with self.subTest(job=name):
                self.assertEqual(self.jobs[name].file, PLANE)

    def test_the_lane_runs_only_when_enabled_on_protected_buildanddo_source(self) -> None:
        for name in KEYED_JOBS:
            with self.subTest(job=name):
                rules = self.bodies[name].split("\n  rules:\n", 1)[1].rstrip("\n")
                self.assertEqual(rules, "    - if: '" + KEYED_RULE + "'\n    - when: never")
        on = {"CI_PIPELINE_SOURCE": "push", "CI_COMMIT_BRANCH": "buildanddo-source",
              "CI_COMMIT_REF_PROTECTED": "true", "BUILDANDDO_LESSON_KEYS_ENABLED": "1"}
        self.assertTrue(evaluate_rule(KEYED_RULE, on))
        self.assertTrue(evaluate_rule(KEYED_RULE, {**on, "CI_PIPELINE_SOURCE": "web"}))
        off: list[dict[str, str]] = []
        off += [{**on, "BUILDANDDO_LESSON_KEYS_ENABLED": v} for v in ("", "0", "true", "yes", " 1", "1 ")]
        off += [{k: v for k, v in on.items() if k != "BUILDANDDO_LESSON_KEYS_ENABLED"}]
        off += [{**on, "CI_COMMIT_BRANCH": b} for b in ("review/pr-7", "main", "sprint/x", "bits/SRS-X-001-y", "")]
        off += [{**on, "CI_PIPELINE_SOURCE": s} for s in ("schedule", "merge_request_event", "external_pull_request_event",
                                                          "api", "trigger", "pipeline", "parent_pipeline", "chat")]
        off += [{**on, "CI_COMMIT_REF_PROTECTED": "false"},
                {k: v for k, v in on.items() if k != "CI_COMMIT_REF_PROTECTED"}]
        for env in off:
            with self.subTest(env=env):
                self.assertFalse(evaluate_rule(KEYED_RULE, env))
        # Syntax the evaluator does not model is refused, never guessed.
        gate = ('$CI_PIPELINE_SOURCE != "schedule" && ($CI_COMMIT_BRANCH == "main" || '
                '$CI_COMMIT_BRANCH == "buildanddo-source" || $CI_COMMIT_BRANCH =~ /^(sprint|review)\\//)')
        with self.assertRaises(ValueError):
            evaluate_rule(gate, on)
        self.assertTrue(evaluate_rule('$A == "1" && ($B == "x" || $B == "y")', {"A": "1", "B": "y"}))
        self.assertFalse(evaluate_rule('$A != "1"', {"A": "1"}))

    def test_the_bundle_job_builds_without_keys_and_keeps_dist_for_a_day(self) -> None:
        body = self.bodies["lesson_keys_bundle"]
        self.assertEqual(self.jobs["lesson_keys_bundle"].commands, ("npm ci", "npm run build"))
        for line in ("  tags: [buildanddo]\n", "  needs: []\n",
                     "  artifacts:\n    expire_in: 1 day\n    paths:\n      - dist/apps/web/\n  rules:\n"):
            self.assertIn(line, body)
        self.assertNotRegex(body, KEY_VARIABLE_RE)
        self.assertNotIn("environment:", body)
        self.assertNotIn("buildanddo-protected", body)

    def test_the_private_job_runs_only_the_two_built_in_checks_with_no_artifacts(self) -> None:
        job = self.jobs["lesson_keys_private"]
        body = self.bodies["lesson_keys_private"]
        self.assertEqual(
            [gitlab_ci.arguments(command) for command in job.commands],
            [["python3", "-I", "scripts/ci/lesson_keys.py", "verify", "--keys", "$BUILDANDDO_LESSON_KEYS",
              "--require-private"],
             ["node", "apps/web/tools/check-public-lessons.mjs", "dist/apps/web", "--keys", "$BUILDANDDO_LESSON_KEYS",
              "--require-keys"]],
        )
        # Quoted, so an unset variable is an empty argument and the tools report BLOCKED (exit 3).
        self.assertEqual(body.count('--keys "$BUILDANDDO_LESSON_KEYS"'), 2)
        for line in ("  tags: [buildanddo-protected]\n",
                     "  needs:\n    - job: lesson_keys_bundle\n      artifacts: true\n",
                     "  environment:\n    name: lesson-keys\n    action: prepare\n",
                     "  cache: []\n", "  allow_failure: {exit_codes: [3]}\n"):
            self.assertIn(line, body)
        self.assertEqual(re.findall(r"^  ([a-z_]+):", body, re.MULTILINE),
                         ["stage", "tags", "timeout", "needs", "environment", "cache", "allow_failure", "script", "rules"])
        for word in ("npm", "npx", "vite", "yarn", "pnpm", "before_script", "after_script",
                     "variables", "image", "services", "extends", "inherit", "dependencies"):
            self.assertNotRegex(body, rf"\b{word}\b", word)
        # The one mention is the download of the bundle's dist; the job itself keeps nothing.
        self.assertEqual(re.findall(r"^.*\bartifacts\b.*$", body, re.MULTILINE), ["      artifacts: true"])
        # Optional only for the BLOCKED exit code, so it never counts as acceptance wiring.
        self.assertFalse(job.required)

    def test_neither_job_writes_reports_epochs_or_bookkeeping(self) -> None:
        for name in KEYED_JOBS:
            body = self.bodies[name]
            for marker in ("reports/", "state/epochs", "state/ci", "gitlab_plane.py", "evidence_epoch",
                           "resource_group", "GITHUB_", "GITLAB_INGEST_TOKEN"):
                with self.subTest(job=name, marker=marker):
                    self.assertNotIn(marker, body)

    def test_only_the_private_job_sees_the_key_variable_or_its_environment(self) -> None:
        for path, text in self.sources.items():
            for match in KEY_VARIABLE_RE.finditer(text):
                with self.subTest(path=path, offset=match.start()):
                    self.assertEqual(path, PLANE)
                    line = text[text.rfind("\n", 0, match.start()) + 1:text.find("\n", match.start())]
                    self.assertTrue(line.startswith("#") or line in self.bodies["lesson_keys_private"], line)
                    if not line.startswith("#"):
                        self.assertIn(line.strip()[2:], self.jobs["lesson_keys_private"].commands)
            for marker in ("lesson-keys", "buildanddo-protected", "job: lesson_keys_"):
                for name, body in self.bodies.items():
                    if marker in body and self.jobs[name].file == path:
                        with self.subTest(path=path, job=name, marker=marker):
                            self.assertEqual(name, "lesson_keys_private")

    def test_the_lane_comment_names_variables_never_values_or_private_locations(self) -> None:
        comment = self.plane.split("\nlesson_keys_bundle:\n", 1)[0].rsplit("\n\n", 1)[1]
        self.assertTrue(all(line.startswith("#") for line in comment.splitlines()), comment)
        for name in ("BUILDANDDO_LESSON_KEYS_ENABLED", "BUILDANDDO_LESSON_KEYS ", "lesson-keys"):
            self.assertIn(name, comment)
        for marker in ("/etc/", "/root/", "lesson-keys.json", "curriculum/", ".json", "=1 ", "http", "@"):
            self.assertNotIn(marker, comment, marker)

    def test_existing_gates_and_submission_needs_are_unchanged(self) -> None:
        gate_rule = (
            "'$CI_PIPELINE_SOURCE != \"schedule\" && ($CI_COMMIT_BRANCH == \"main\" || "
            "$CI_COMMIT_BRANCH == \"buildanddo-source\" || $CI_COMMIT_BRANCH =~ /^(sprint|review)\\//)'"
        )
        for name in ("integrity_gate", "sprint_replay", "praxis_evidence_tests", "day21_governance",
                     "day21_full_acceptance", "source_discord", "source_foundry", "source_federal_portfolio",
                     "source_mission_suite", "source_behavior_coverage", "source_assurance"):
            with self.subTest(job=name):
                self.assertIn(gate_rule, self.bodies[name])
                self.assertTrue(self.jobs[name].required)
        for name, body in self.bodies.items():
            if name in KEYED_JOBS:
                continue
            with self.subTest(job=name):
                self.assertNotIn("BUILDANDDO_LESSON_KEYS", body)
                self.assertNotIn("lesson_keys", body)
        bundle = self.bodies["day21_submission_bundle"]
        needs = re.findall(r"^\s+- job: (\S+)$", bundle, re.MULTILINE)
        self.assertEqual(sorted(needs), sorted([
            "day21_governance", "day21_full_acceptance", "source_discord", "source_foundry",
            "source_federal_portfolio", "source_mission_suite", "source_behavior_coverage", "source_assurance"]))
        plane_jobs = [name for name, job in self.jobs.items() if job.file == PLANE]
        self.assertEqual(plane_jobs, ["github_intake", "stack_telemetry", "supply_chain_weekly", "evidence_epoch",
                                      "main_writeback", "ci_report", *KEYED_JOBS])


if __name__ == "__main__":
    unittest.main()
