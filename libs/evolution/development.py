# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/development.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/compiler.py, libs/evolution/benchmark.py, libs/evolution/replay.py, libs/evolution/store.py, libs/capability_tokens/verification.py, libs/evolution/development_sources.py, libs/evolution/intelligence.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/compiler.py; CONSUMES libs/evolution/benchmark.py; CONSUMES libs/evolution/replay.py; CONSUMES libs/evolution/store.py; CONSUMES libs/capability_tokens/verification.py; CONSUMES libs/evolution/development_sources.py; CONSUMES libs/evolution/intelligence.py
# Intent:      Record predictions before actual source tests and admit independently reviewed outcomes into existing replay without changing competence or execution authority.
# ───────────────────────────────────────────────────────────────

"""Connect repository observations, bounded work proposals and reviewed test outcomes."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from libs.capability_tokens.verification import ReviewPolicy, require_review
from libs.semantic_twin.contracts import Contract, ContractError, require, text
from libs.semantic_twin.identity import EntityType, SemanticId, SubjectRef
from libs.semantic_twin.ingestion.drafts import GraphDraft, RelationDraft, make_object
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    EvidenceState,
    RelationPredicate,
)

from .benchmark import _imports, _module_name
from .candidate import Decision, ResponseTemplate, Rule
from .common import decode_json, digest, identity, mapping, read_json, unique
from .compiler import ActionProposal, DecisionInput, GraphSnapshot, evaluate_rule
from .development_sources import GitHubRunCapture, collect_github_run, ingest_run
from .episode import Episode, event_order
from .event import CitadelEvent, Phase, SourceKind
from .intelligence import (
    DevelopmentOpportunity,
    opportunity_from_workflow,
    write_mission_packet,
)
from .loop import next_actions, refresh_episodes
from .registry import require_bounded
from .replay import ReplayCase
from .scorer import OutcomeLabels
from .store import Journal

SOURCE_ROOTS = ("libs/evolution", "libs/capability_tokens", "libs/semantic_twin")
TEST_FAMILIES = (
    "test_evolution",
    "test_capability_token",
    "test_semantic_twin",
    "test_development",
)
_MARKER = "CITADEL_DEVELOPMENT_TEST_RESULT="
# This fixed runner obtains counts from unittest's result object, not from prose
# in a provider log or the predictor's selected test names. It grants no TEVV.
_RUNNER = """
import json, sys, unittest
suite = unittest.defaultTestLoader.loadTestsFromNames(sys.argv[1:])
result = unittest.TextTestRunner(verbosity=2).run(suite)
summary = {
    'tests_run': result.testsRun, 'failures': len(result.failures),
    'errors': len(result.errors), 'skipped': len(result.skipped),
    'expected_failures': len(result.expectedFailures),
    'unexpected_successes': len(result.unexpectedSuccesses),
    'failed_tests': [t.id() for t, _ in result.failures + result.errors],
}
print('CITADEL_DEVELOPMENT_TEST_RESULT=' + json.dumps(summary, sort_keys=True))
sys.exit(0 if result.wasSuccessful() else 1)
"""


def _test_path(path: str) -> bool:
    name = Path(path).name
    return (
        bool(re.fullmatch(r"tests/upgrade/test_[A-Za-z0-9_]+\.py", path))
        and name.startswith(TEST_FAMILIES)
        and not name.endswith("_support.py")
    )


def source_bytes(root: Path) -> dict[str, bytes]:
    """Capture only bounded public Python source, rejecting symlinks and oversized trees."""
    root = root.resolve()
    paths = [p for prefix in SOURCE_ROOTS for p in (root / prefix).rglob("*.py")]
    paths += [
        p
        for p in (root / "tests/upgrade").glob("test_*.py")
        if p.name.startswith(TEST_FAMILIES)
    ]
    require(0 < len(paths) <= 500, "source inventory is empty or exceeds bound")
    result: dict[str, bytes] = {}
    total = 0
    for path in sorted(paths):
        require(
            not path.is_symlink() and path.resolve().is_relative_to(root),
            "source path escapes repository",
        )
        require(
            not any(
                p.is_symlink()
                for p in path.parents
                if p != root and p.is_relative_to(root)
            ),
            "source parent is a symlink",
        )
        raw = path.read_bytes()
        total += len(raw)
        require(
            len(raw) <= 500_000 and total <= 20_000_000, "source capture exceeds bound"
        )
        result[path.relative_to(root).as_posix()] = raw
    return result


def _file_digests(sources: Mapping[str, bytes]) -> dict[str, str]:
    return {
        path: hashlib.sha256(raw).hexdigest() for path, raw in sorted(sources.items())
    }


def _head(root: Path) -> str:
    result = subprocess.run(
        ("git", "rev-parse", "HEAD"),
        cwd=root,
        capture_output=True,
        timeout=10,
        check=False,
    )
    require(result.returncode == 0, "repository has no readable HEAD")
    return SourceRevision(result.stdout.decode("ascii").strip()).source_sha


def test_graph(
    sources: Mapping[str, bytes], *, scope_id: str, source_sha: str, at: datetime
) -> GraphSnapshot:
    """Reuse historical AST import extraction and canonical graph dependency traversal."""
    require(bool(sources), "source snapshot is empty")
    modules = {_module_name(path): path for path in sources}
    require(len(modules) == len(sources), "ambiguous Python module inventory")
    # Unittest discovery's sibling-helper imports are scoped to tests/upgrade.
    modules.update({Path(p).stem: p for p in sources if p.startswith("tests/upgrade/")})
    drafts = []
    for path, content in sorted(sources.items()):
        imported = _imports(path, content)
        require(
            imported is not None, "cannot freeze syntactically invalid Python: " + path
        )
        assert imported is not None
        targets: set[str] = set()
        for name in imported:
            while name:
                if name in modules:
                    if modules[name] != path:
                        targets.add(modules[name])
                    break
                name = name.rpartition(".")[0]
        relations = [
            RelationDraft(
                RelationPredicate.DEPENDS_ON,
                "module:" + target,
                (path,),
                None,
                EvidenceState.INFERRED,
            )
            for target in sorted(targets)
        ]
        if _test_path(path):
            suite = "suite:" + path
            relations.append(
                RelationDraft(
                    RelationPredicate.TESTED_BY,
                    suite,
                    (path,),
                    None,
                    EvidenceState.INFERRED,
                )
            )
            drafts.append(
                make_object(
                    suite,
                    "Test",
                    path,
                    input_digest=hashlib.sha256(content).hexdigest(),
                    commit=source_sha,
                    claims=(
                        {
                            "name": suite,
                            "test_path": path,
                            "coverage": "static-imports-only",
                        },
                    ),
                )
            )
        drafts.append(
            make_object(
                "module:" + path,
                "Module",
                path,
                input_digest=hashlib.sha256(content).hexdigest(),
                commit=source_sha,
                claims=(
                    {
                        "path": path,
                        "static_imports": imported,
                        "coverage": "static-imports-only",
                    },
                ),
                relations=tuple(relations),
            )
        )
    graph = GraphDraft(tuple(drafts)).resolve(observed_at=at)
    return GraphSnapshot(
        scope_id=scope_id, source_sha=source_sha, as_of=at, objects=graph.objects
    )


def _claim_path(claims: tuple[Mapping[str, object], ...]) -> str | None:
    for claim in claims:
        path = claim.get("path", claim.get("test_path"))
        if isinstance(path, str):
            return path
    return None


@dataclass(frozen=True, slots=True, kw_only=True)
class FrozenPrediction(Contract):
    """Retain the exact decision input and source bytes before observing an outcome."""

    observation: DecisionInput
    rule: Rule
    actor_id: SemanticId
    mission_id: str
    file_digests: Mapping[str, str]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.mission_id, "prediction mission")
        require(
            self.observation.authority is AuthorityTier.A1,
            "local source-test prediction requires A1",
        )
        require(bool(self.file_digests), "prediction needs actual source bytes")
        for path, fingerprint in self.file_digests.items():
            ContentDigest(fingerprint)
            require(
                not Path(path).is_absolute()
                and ".." not in Path(path).parts
                and path.endswith(".py")
                and "\\" not in path,
                "invalid captured source path",
            )
        for obj in self.observation.graph.objects:
            captured_path = _claim_path(obj.claims)
            require(
                captured_path is not None and captured_path in self.file_digests,
                "graph object is outside source snapshot",
            )
            assert captured_path is not None
            require(
                obj.source.version == "sha256:" + self.file_digests[captured_path],
                "graph source differs from captured bytes",
            )
        decision = self.decision
        require(
            decision.operation == "select_tests",
            "development runner accepts only test selection",
        )
        require_bounded(self.proposal, self.observation)
        self.selected_tests

    @property
    def prediction_id(self) -> SemanticId:
        """Bind time, source, graph, producer and rule before outcome data exists."""
        return identity("decision", self)

    @property
    def decision(self) -> Decision:
        """Evaluate the existing deterministic compiler with no outcome access."""
        decision = evaluate_rule(self.rule, self.observation)
        require(decision is not None, "test-selection rule abstained")
        assert decision is not None
        return decision

    @property
    def proposal(self) -> ActionProposal:
        """Expose a hypothesis proposal without pretending it is a certified capability."""
        return ActionProposal(
            capability=SubjectRef(identity("capability", self.rule), digest(self.rule)),
            scope_id=self.observation.scope_id,
            authority=self.observation.authority,
            source_sha=self.observation.graph.source_sha,
            context_root=self.observation.graph.root,
            decision=self.decision,
            requested_at=self.observation.decision_at,
            correlation_id=self.observation.correlation_id,
        )

    @property
    def selected_tests(self) -> tuple[str, ...]:
        """Resolve selected test IDs only to the finite public source-test families."""
        paths = []
        for name in self.decision.tests:
            obj = self.observation.graph.resolve(name)
            require(
                obj is not None and obj.object_type is EntityType.TEST,
                "selected test is not a captured test object",
            )
            assert obj is not None
            path = _claim_path(obj.claims)
            require(
                isinstance(path, str) and _test_path(path),
                "selected test is outside allowed source suites",
            )
            paths.append(str(path))
        return tuple(sorted(set(paths)))


def freeze_prediction(
    root: Path,
    *,
    changed_paths: tuple[str, ...],
    scope_id: str,
    mission_id: str,
    actor_id: SemanticId,
    at: datetime | None = None,
) -> FrozenPrediction:
    """Freeze an actual bounded worktree; Git HEAD is context, not a byte substitute."""
    unique(changed_paths, "changed path")
    require(bool(changed_paths), "select changed paths")
    sources = source_bytes(root)
    require(
        set(changed_paths) <= set(sources),
        "changed path lies outside bounded source context",
    )
    revision = _head(root)
    observed = at or datetime.now(timezone.utc)
    graph = test_graph(sources, scope_id=scope_id, source_sha=revision, at=observed)
    variables: dict[str, str] = {"task": "change-impact-test-selection"}
    targets = []
    for index, path in enumerate(sorted(changed_paths)):
        obj = graph.resolve(path)
        require(obj is not None, "changed source has no unambiguous graph object")
        assert obj is not None
        variables[f"target_{index}"] = str(obj.semantic_id)
        targets.append(obj.semantic_id)
    bindings = tuple(f"$target_{i}" for i in range(len(targets)))
    rule = Rule(
        {"task": "change-impact-test-selection"},
        ResponseTemplate(
            diagnosis="Run source suites connected by captured static imports; sufficiency requires independent review.",
            operation="select_tests",
            targets=bindings,
            reverse_tests_for=bindings,
        ),
    )
    observation = DecisionInput(
        scope_id=scope_id,
        correlation_id=str(
            identity(
                "context", (scope_id, mission_id, observed, graph.root, changed_paths)
            )
        ),
        authority=AuthorityTier.A1,
        risk="bounded_source_test_selection",
        decision_at=observed,
        features_observed_at=observed,
        features=variables,
        graph=graph,
        allowed_targets=tuple(targets),
        allowed_operations=("select_tests",),
    )
    return FrozenPrediction(
        observation=observation,
        rule=rule,
        actor_id=actor_id,
        mission_id=mission_id,
        file_digests=_file_digests(sources),
    )


def _event(
    prediction: FrozenPrediction,
    phase: Phase,
    *,
    at: datetime,
    data: Mapping[str, object],
    inputs: tuple[str, ...] = (),
    subject: SubjectRef | None = None,
    receipt: VerificationReceipt | None = None,
) -> CitadelEvent:
    target = subject or SubjectRef(prediction.prediction_id, digest(prediction))
    return CitadelEvent(
        scope_id=prediction.observation.scope_id,
        occurred_at=at,
        observed_at=at,
        ingested_at=at,
        mission_id=prediction.mission_id,
        correlation_id=prediction.observation.correlation_id,
        actor_id=receipt.result.verifier_id if receipt else prediction.actor_id,
        event_type="development." + phase.value.lower(),
        subject_id=target.semantic_id,
        subject_version=target.version,
        source_sha=prediction.observation.graph.source_sha,
        source_kind=SourceKind.TEST,
        source_ref="repo://buildanddo/development/" + digest(prediction),
        source_digest=ContentDigest(digest(data)),
        evidence_state=EvidenceState.OBSERVED,
        authority=prediction.observation.authority,
        risk=prediction.observation.risk,
        phase=phase,
        inputs=inputs,
        evidence_refs=(str(prediction.prediction_id),),
        features=prediction.observation.features
        if phase in (Phase.PROBLEM, Phase.CONTEXT, Phase.HYPOTHESIS)
        else {},
        data=data,
        verification=receipt,
    )


def prediction_events(prediction: FrozenPrediction) -> tuple[CitadelEvent, ...]:
    """Record pre-outcome context and hypothesis without manufacturing execution approval."""
    at = prediction.observation.decision_at
    problem = _event(
        prediction,
        Phase.PROBLEM,
        at=at,
        data={"problem": "Select tests for a bounded source change."},
    )
    context = _event(
        prediction,
        Phase.CONTEXT,
        at=at,
        data={"prediction": prediction.to_dict()},
        inputs=(problem.event_id,),
    )
    hypothesis = _event(
        prediction,
        Phase.HYPOTHESIS,
        at=at,
        data={"proposal": prediction.proposal.to_dict(), "competence": "HYPOTHESIS"},
        inputs=(context.event_id,),
    )
    action = _event(
        prediction,
        Phase.ACTION,
        at=at,
        data={
            "attempt_id": str(prediction.prediction_id),
            "response": prediction.rule.response.to_dict(),
            "rule": prediction.rule.to_dict(),
            "decision": prediction.decision.to_dict(),
            "action": "propose_source_test_selection",
        },
        inputs=(hypothesis.event_id,),
    )
    return problem, context, hypothesis, action


@dataclass(frozen=True, slots=True)
class TestCounts(Contract):
    """Retain actual unittest counts, including skipped and expected-failure tests."""

    tests_run: int
    failures: int
    errors: int
    skipped: int
    expected_failures: int
    unexpected_successes: int
    failed_tests: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            min(
                self.tests_run,
                self.failures,
                self.errors,
                self.skipped,
                self.expected_failures,
                self.unexpected_successes,
            )
            >= 0,
            "negative test counts",
        )
        require(
            self.skipped + self.expected_failures <= self.tests_run,
            "inconsistent test counts",
        )
        require(
            len(self.failed_tests) == self.failures + self.errors,
            "failure identities disagree with counts",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class MeasuredTestRun(Contract):
    """Bind a real process observation to its earlier prediction and exact source bytes."""

    prediction_id: SemanticId
    source_sha: str
    source_digest: ContentDigest
    selected_tests: tuple[str, ...]
    started_at: datetime
    completed_at: datetime
    exit_code: int | None
    counts: TestCounts | None
    log: str
    source_unchanged: bool

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        SourceRevision(self.source_sha)
        require(self.started_at <= self.completed_at, "test process time reversal")
        unique(self.selected_tests, "executed suite")
        require(
            all(_test_path(p) for p in self.selected_tests),
            "run includes out-of-scope test suite",
        )
        require(len(self.log.encode()) <= 8_000_000, "test output exceeds bound")

    @property
    def run_id(self) -> SemanticId:
        """Address the exact output, process outcome and source-integrity observation."""
        return identity("test-run", self)

    @property
    def log_digest(self) -> ContentDigest:
        """Hash retained process output without assigning it reviewer authority."""
        return ContentDigest(hashlib.sha256(self.log.encode()).hexdigest())

    @property
    def status(self) -> Literal["PASS", "FAIL", "HOLD"]:
        """Reject missing, empty, skipped or drifting execution as passing evidence."""
        if not self.source_unchanged or self.counts is None or self.exit_code is None:
            return "HOLD"
        counts = self.counts
        if (
            self.exit_code != 0
            or counts.failures
            or counts.errors
            or counts.unexpected_successes
        ):
            return "FAIL"
        if counts.tests_run == 0 or counts.skipped or counts.expected_failures:
            return "HOLD"
        return "PASS"


def run_source_tests(
    prediction: FrozenPrediction, root: Path, *, timeout_seconds: int = 180
) -> MeasuredTestRun:
    """Run only captured source-test modules with a fixed unittest driver and no shell."""
    require(1 <= timeout_seconds <= 600, "invalid local test deadline")
    require(
        _head(root) == prediction.observation.graph.source_sha,
        "HEAD changed after prediction",
    )
    require(
        _file_digests(source_bytes(root)) == prediction.file_digests,
        "source changed after prediction",
    )
    selected = prediction.selected_tests
    require(
        bool(selected), "no static test selection; abstain instead of reporting success"
    )
    started = datetime.now(timezone.utc)
    require(prediction.observation.decision_at <= started, "prediction is future-dated")
    modules = tuple(path.removesuffix(".py").replace("/", ".") for path in selected)
    code: int | None
    counts = None
    try:
        result = subprocess.run(
            (sys.executable, "-c", _RUNNER, *modules),
            cwd=root,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
        output = result.stdout.decode("utf-8", errors="replace")
        log = result.stderr.decode("utf-8", errors="replace") + output
        code = result.returncode
        last = output.splitlines()[-1] if output.splitlines() else ""
        if last.startswith(_MARKER):
            counts = TestCounts.from_dict(mapping(decode_json(last[len(_MARKER) :])))
    except subprocess.TimeoutExpired as exc:
        log = (
            (exc.stderr or b"").decode("utf-8", errors="replace")
            + (exc.stdout or b"").decode("utf-8", errors="replace")
            + "\nLocal test deadline exceeded.\n"
        )
        code = None
    return MeasuredTestRun(
        prediction_id=prediction.prediction_id,
        source_sha=prediction.observation.graph.source_sha,
        source_digest=ContentDigest(digest(prediction.file_digests)),
        selected_tests=selected,
        started_at=started,
        completed_at=datetime.now(timezone.utc),
        exit_code=code,
        counts=counts,
        log=log,
        source_unchanged=_head(root) == prediction.observation.graph.source_sha
        and _file_digests(source_bytes(root)) == prediction.file_digests,
    )


def _bind_run(prediction: FrozenPrediction, run: MeasuredTestRun) -> None:
    require(
        run.prediction_id == prediction.prediction_id
        and run.source_sha == prediction.observation.graph.source_sha
        and run.source_digest == ContentDigest(digest(prediction.file_digests))
        and run.selected_tests == prediction.selected_tests,
        "test result does not match exact frozen prediction/source/selection",
    )
    require(
        run.started_at >= prediction.observation.decision_at,
        "outcome predates prediction",
    )


def observe_test_run(
    journal: Journal, prediction: FrozenPrediction, run: MeasuredTestRun
) -> CitadelEvent:
    """Retain failures and raw counts before any independent grading is available."""
    _bind_run(prediction, run)
    require(
        journal.scope_id == prediction.observation.scope_id,
        "run journal scope mismatch",
    )
    require(
        journal.get("event", prediction_events(prediction)[-1].event_id) is not None,
        "prediction must be recorded before the run is admitted",
    )
    require(
        not any(
            e.correlation_id == prediction.observation.correlation_id
            and "observed_run" in e.data
            and e.data.get("run_id") != str(run.run_id)
            for e in journal.events()
        ),
        "record a new prediction before another execution; prior outcomes are immutable",
    )
    event = _event(
        prediction,
        Phase.CONTEXT,
        at=run.completed_at,
        data={
            "observed_run": run.to_dict(),
            "run_id": str(run.run_id),
            "process_status": run.status,
            "outcome_labels": "UNMEASURED",
        },
    )
    journal.put_events((event,))
    return event


@dataclass(frozen=True, slots=True)
class OutcomeReviewRequest(Contract):
    """Bind proposed reviewer labels to the exact prediction and actual process result."""

    prediction: FrozenPrediction
    run: MeasuredTestRun
    labels: OutcomeLabels

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        _bind_run(self.prediction, self.run)
        require(
            self.labels.rule_digest == ContentDigest(digest(self.prediction.rule)),
            "grading labels name a different rule",
        )

    @property
    def subject(self) -> SubjectRef:
        """Bind the independent receipt to the complete outcome assessment."""
        return SubjectRef(identity("evaluation", self), digest(self))

    @property
    def result(self) -> CitadelEvent:
        """Prepare an unverified result revision for the external independent reviewer."""
        return _event(
            self.prediction,
            Phase.RESULT,
            at=self.run.completed_at,
            subject=self.subject,
            inputs=(prediction_events(self.prediction)[-1].event_id,),
            data={
                "attempt_id": str(self.prediction.prediction_id),
                "status": self.run.status,
                "run_id": str(self.run.run_id),
                "labels": self.labels.to_dict(),
                "log_digest": self.run.log_digest.to_dict(),
            },
        )

    @property
    def required_sources(self) -> tuple[SemanticId, ...]:
        """Name all exact artifacts the receiving review must cover."""
        return (
            self.prediction.prediction_id,
            self.run.run_id,
            SemanticId(self.result.event_id),
        )


def admit_reviewed_outcome(
    journal: Journal,
    request: OutcomeReviewRequest,
    receipt: VerificationReceipt,
    policy: ReviewPolicy,
    *,
    at: datetime,
) -> ReplayCase:
    """Admit independent, externally pinned PASS evidence through existing replay rules."""
    prediction, run = request.prediction, request.run
    require(
        journal.scope_id == prediction.observation.scope_id,
        "review journal scope mismatch",
    )
    require(
        run.status == "PASS",
        "failed or incomplete runs stay observations; retain a reviewed successful repair before qualification",
    )
    require(
        receipt.result.actor_id == prediction.actor_id,
        "review names a different producer",
    )
    require(
        receipt.result.verifier_id != prediction.actor_id,
        "producer cannot independently review itself",
    )
    require_review(
        receipt,
        request.subject,
        policy,
        at=at,
        tier=prediction.observation.authority,
        checks=("development_outcome",),
        sources=request.required_sources,
        since=run.completed_at,
    )
    original = prediction_events(prediction)
    require(
        all(journal.get("event", e.event_id) is not None for e in original),
        "review omits retained pre-outcome prediction",
    )
    require(
        any(
            e.data.get("run_id") == str(run.run_id)
            and digest(e.data.get("observed_run")) == digest(run)
            for e in journal.events()
        ),
        "review omits retained process observation",
    )
    result = request.result
    # A correlation has one frozen prediction and one admitted result revision.
    # Changed labels require a new explicitly recorded experiment, not silent repair.
    require(
        not any(
            e.correlation_id == result.correlation_id
            and e.phase is Phase.RESULT
            and e.event_id != result.event_id
            for e in journal.events()
        ),
        "conflicting reviewed outcome for this prediction",
    )
    review = _event(
        prediction,
        Phase.VERIFICATION,
        at=receipt.result.evaluated_at,
        subject=request.subject,
        receipt=receipt,
        inputs=(result.event_id,),
        data={
            "attempt_id": str(prediction.prediction_id),
            "review_policy": str(policy.policy_id),
        },
    )
    require(
        not any(
            e.correlation_id == review.correlation_id
            and e.phase is Phase.VERIFICATION
            and e.event_id != review.event_id
            for e in journal.events()
        ),
        "conflicting review for this prediction",
    )
    case = ReplayCase(
        prediction.observation,
        Episode(tuple(sorted((*original, result, review), key=event_order))),
    )
    require(
        case.truth is not None,
        "existing replay contract did not accept reviewed labels",
    )
    journal.put_events((result, review))
    journal.save("episode", case.episode)
    return case


def _write_new(path: Path, value: object) -> None:
    require(not path.exists() and not path.is_symlink(), "output already exists")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        stream.write(
            json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"
        )


def main(argv: Sequence[str] | None = None) -> int:
    """Run explicit read, proposal, test and review steps without remote effects."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state", type=Path, default=Path("state/development-loop/journal.sqlite")
    )
    parser.add_argument("--scope", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    capture = sub.add_parser("capture-run")
    capture.add_argument("--repository", required=True)
    capture.add_argument("--run-id", type=int, required=True)
    capture.add_argument("--attempt", type=int, required=True)
    capture.add_argument("--candidate", required=True)
    capture.add_argument("--output", type=Path, required=True)
    imported = sub.add_parser("ingest-run")
    imported.add_argument("capture", type=Path)
    imported.add_argument("--repository", required=True)
    imported.add_argument("--candidate", required=True)
    plan = sub.add_parser("predict")
    plan.add_argument("--root", type=Path, default=Path.cwd())
    plan.add_argument("--changed", action="append", required=True)
    plan.add_argument("--mission", required=True)
    plan.add_argument("--actor", default="cni://agent/bits-codegen")
    plan.add_argument("--output", type=Path, required=True)
    run = sub.add_parser("test")
    run.add_argument("prediction", type=Path)
    run.add_argument("--root", type=Path, default=Path.cwd())
    run.add_argument("--output", type=Path, required=True)
    grade = sub.add_parser("prepare-review")
    grade.add_argument("prediction", type=Path)
    grade.add_argument("run", type=Path)
    grade.add_argument("--labels", type=Path, required=True)
    grade.add_argument("--output", type=Path, required=True)
    admit = sub.add_parser("admit-review")
    admit.add_argument("request", type=Path)
    admit.add_argument("--receipt", type=Path, required=True)
    admit.add_argument("--review-policy", type=Path, required=True)
    admit.add_argument("--output", type=Path, required=True)
    mission = sub.add_parser("mission")
    mission.add_argument("opportunity", type=Path)
    mission.add_argument("--srs", required=True)
    mission.add_argument("--dispatch", required=True)
    mission.add_argument("--builder", required=True)
    mission.add_argument("--verifier", required=True)
    mission.add_argument("--output", type=Path, required=True)
    from_run = sub.add_parser("mission-from-run")
    from_run.add_argument("prediction", type=Path)
    from_run.add_argument("capture", type=Path)
    from_run.add_argument("--repository", required=True)
    from_run.add_argument("--srs", required=True)
    from_run.add_argument("--dispatch", required=True)
    from_run.add_argument("--builder", required=True)
    from_run.add_argument("--verifier", required=True)
    from_run.add_argument("--output", type=Path, required=True)
    sub.add_parser("status")
    options = parser.parse_args(argv)
    try:
        now = datetime.now(timezone.utc)
        if getattr(options, "output", None) is not None:
            require(
                not options.output.exists(),
                "select a new output; prior evidence is retained",
            )
        with Journal(options.state, scope_id=options.scope) as journal:
            if options.command in ("capture-run", "ingest-run"):
                captured = (
                    collect_github_run(
                        options.repository, options.run_id, options.attempt
                    )
                    if options.command == "capture-run"
                    else GitHubRunCapture.from_dict(mapping(read_json(options.capture)))
                )
                event = ingest_run(
                    journal,
                    captured,
                    repository=options.repository,
                    candidate=options.candidate,
                    at=datetime.now(timezone.utc),
                )
                if options.command == "capture-run":
                    _write_new(options.output, captured.to_dict())
                print(json.dumps(event.to_dict(), sort_keys=True))
            elif options.command == "predict":
                prediction = freeze_prediction(
                    options.root,
                    changed_paths=tuple(options.changed),
                    scope_id=options.scope,
                    mission_id=options.mission,
                    actor_id=SemanticId(options.actor),
                )
                _write_new(options.output, prediction.to_dict())
                journal.put_events(prediction_events(prediction))
                print(
                    json.dumps(
                        {
                            "prediction": str(prediction.prediction_id),
                            "tests": prediction.selected_tests,
                            "competence": "HYPOTHESIS",
                            "scope": "Static import selection; source bytes are captured independently of Git HEAD.",
                        }
                    )
                )
            elif options.command == "test":
                prediction = FrozenPrediction.from_dict(
                    mapping(read_json(options.prediction))
                )
                require(
                    prediction.observation.scope_id == journal.scope_id,
                    "prediction scope mismatch",
                )
                require(
                    journal.get("event", prediction_events(prediction)[-1].event_id)
                    is not None,
                    "record prediction before executing tests",
                )
                require(
                    not any(
                        e.correlation_id == prediction.observation.correlation_id
                        and "observed_run" in e.data
                        for e in journal.events()
                    ),
                    "record a new prediction before another execution",
                )
                measured = run_source_tests(prediction, options.root)
                _write_new(options.output, measured.to_dict())
                observe_test_run(journal, prediction, measured)
                print(
                    json.dumps(
                        {
                            "status": measured.status,
                            "counts": measured.counts.to_dict()
                            if measured.counts
                            else None,
                            "grading": "UNMEASURED",
                            "run_id": str(measured.run_id),
                        }
                    )
                )
                return 0 if measured.status == "PASS" else 2
            elif options.command == "prepare-review":
                request = OutcomeReviewRequest(
                    FrozenPrediction.from_dict(mapping(read_json(options.prediction))),
                    MeasuredTestRun.from_dict(mapping(read_json(options.run))),
                    OutcomeLabels.from_dict(mapping(read_json(options.labels))),
                )
                require(
                    request.prediction.observation.scope_id == journal.scope_id,
                    "review request scope mismatch",
                )
                _write_new(options.output, request.to_dict())
                print(
                    json.dumps(
                        {
                            "subject": request.subject.to_dict(),
                            "required_sources": [
                                str(s) for s in request.required_sources
                            ],
                            "required_check": "development_outcome",
                            "status": "AWAITING_INDEPENDENT_REVIEW",
                        }
                    )
                )
            elif options.command == "admit-review":
                request = OutcomeReviewRequest.from_dict(
                    mapping(read_json(options.request))
                )
                receipt = VerificationReceipt.from_dict(
                    mapping(read_json(options.receipt))
                )
                policy = ReviewPolicy.from_dict(
                    mapping(read_json(options.review_policy))
                )
                case = admit_reviewed_outcome(journal, request, receipt, policy, at=now)
                _write_new(options.output, case.to_dict())
                print(
                    json.dumps(
                        {
                            "case_id": case.case_id,
                            "status": case.episode.status,
                            "promotion": "Requires disjoint replay/shadow and existing PromotionProof gates.",
                        }
                    )
                )
            elif options.command in ("mission", "mission-from-run"):
                if options.command == "mission-from-run":
                    prediction = FrozenPrediction.from_dict(
                        mapping(read_json(options.prediction))
                    )
                    captured = GitHubRunCapture.from_dict(
                        mapping(read_json(options.capture))
                    )
                    event = ingest_run(
                        journal,
                        captured,
                        repository=options.repository,
                        candidate=prediction.observation.graph.source_sha,
                        at=now,
                    )
                    opportunity = opportunity_from_workflow(event, prediction.proposal)
                else:
                    opportunity = DevelopmentOpportunity.from_dict(
                        mapping(read_json(options.opportunity))
                    )
                require(
                    opportunity.proposal.scope_id == journal.scope_id,
                    "mission scope mismatch",
                )
                packet = write_mission_packet(
                    opportunity,
                    options.output,
                    srs=options.srs,
                    dispatch=options.dispatch,
                    builder=SemanticId(options.builder),
                    verifier=SemanticId(options.verifier),
                    at=now,
                )
                print(
                    json.dumps(
                        {
                            "status": packet["status"],
                            "srs": packet["srs"],
                            "authority": packet["authority"],
                        }
                    )
                )
            else:
                episodes = refresh_episodes(journal)
                print(
                    json.dumps(
                        {
                            "observations": len(journal.events()),
                            "episodes": len(episodes),
                            "verified_episodes": sum(
                                e.status == "VERIFIED" for e in episodes
                            ),
                            "next_actions": next_actions(journal),
                        }
                    )
                )
        return 0
    except (ContractError, OSError, subprocess.SubprocessError) as exc:
        print("HOLD: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
