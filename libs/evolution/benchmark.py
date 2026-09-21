# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/benchmark.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/semantic_twin/phase1/history.py, libs/evolution/episode.py, libs/evolution/scorer.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/history.py; CONSUMES libs/evolution/episode.py; CONSUMES libs/evolution/scorer.py
# Intent:      Measure BuildAndDo history from exact parent trees while leaving absent outcome and model evidence ungraded.
# ───────────────────────────────────────────────────────────────

"""Benchmark actual local Git history without inventing pipeline, repair or model outcomes."""

from __future__ import annotations

import ast
import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from time import perf_counter_ns

from libs.semantic_twin.contracts import Contract, ContractError, require, text
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.phase1.history import FileChange, read_git_history

from .common import digest, identity, mapping, timestamp
from .episode import Episode
from .scorer import OutcomeLabels, Rate

PROFILE = "citadel.history-benchmark/1"
_SOURCE_PREFIXES = ("libs/", "apps/", "tests/", "scripts/ci/", "tools/")
_FORBIDDEN = ("_meta/", "services/common/citadel_attest/", "src/api/routes/lazarus_")
_MAX_BLOB = 256_000
_MAX_SNAPSHOT = 16_000_000


class HistoricalReadError(ContractError):
    """Report unavailable local history without printing transport or source contents."""


def _git(root: Path, *args: str, input_bytes: bytes | None = None) -> bytes:
    """Run fixed local read-only Git arguments without invoking a shell."""
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args],
            input=input_bytes,
            capture_output=True,
            check=False,
            timeout=60,
        )
    except subprocess.TimeoutExpired as exc:
        raise HistoricalReadError(f"local historical Git {args[0]} timed out") from exc
    if result.returncode:
        raise HistoricalReadError(
            f"local historical Git {args[0]} unavailable (exit {result.returncode})"
        )
    return result.stdout


def _available_blobs(root: Path) -> dict[str, int]:
    """Inventory local objects without requesting missing partial-clone content."""
    result = {}
    for line in _git(
        root,
        "cat-file",
        "--batch-all-objects",
        "--batch-check=%(objectname) %(objecttype) %(objectsize)",
    ).splitlines():
        sha, kind, size = line.split()
        if kind == b"blob":
            result[sha.decode("ascii")] = int(size)
    return result


def _tree(
    root: Path, revision: str, available: Mapping[str, int]
) -> dict[str, tuple[str, int]]:
    SourceRevision(revision)
    output: dict[str, tuple[str, int]] = {}
    # -l would look up blob sizes and can trigger implicit network fetches.
    for entry in _git(root, "ls-tree", "-rz", revision).split(b"\0"):
        if not entry:
            continue
        meta, raw_path = entry.split(b"\t", 1)
        parts = meta.split()
        if parts[1] == b"blob" and parts[0] != b"120000":
            output[raw_path.decode("utf-8", errors="replace")] = (
                parts[2].decode("ascii"),
                available.get(parts[2].decode("ascii"), -1),
            )
    return output


def _blobs(root: Path, ids: tuple[str, ...]) -> dict[str, bytes]:
    if not ids:
        return {}
    raw = _git(
        root, "cat-file", "--batch", input_bytes=("\n".join(ids) + "\n").encode("ascii")
    )
    result: dict[str, bytes] = {}
    cursor = 0
    for expected in ids:
        end = raw.index(b"\n", cursor)
        sha, kind, size = raw[cursor:end].split()
        require(
            sha.decode() == expected and kind == b"blob", "unexpected historical blob"
        )
        cursor = end + 1
        result[expected] = raw[cursor : cursor + int(size)]
        cursor += int(size) + 1
    return result


def _module_name(path: str) -> str:
    parts = list(PurePosixPath(path).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _first_parent_changes(
    root: Path, parent: str, commit: str
) -> tuple[FileChange, ...]:
    """Read merge changes from tree metadata without rename-content lookups."""
    SourceRevision(parent)
    SourceRevision(commit)
    parts = _git(
        root,
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "--no-renames",
        "--no-ext-diff",
        "-r",
        "-z",
        parent,
        commit,
    ).split(b"\0")
    if parts[-1] == b"":
        parts.pop()
    require(len(parts) % 2 == 0, "invalid first-parent change metadata")
    return tuple(
        FileChange(
            parts[n].decode("ascii"), parts[n + 1].decode("utf-8", errors="replace")
        )
        for n in range(0, len(parts), 2)
    )


def _imports(path: str, content: bytes) -> tuple[str, ...] | None:
    try:
        tree = ast.parse(content, filename=path)
    except (SyntaxError, UnicodeError, ValueError):
        return None
    package = _module_name(path).split(".")
    if not path.endswith("/__init__.py"):
        package.pop()
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                if node.level > len(package):
                    continue
                base = package[: len(package) - node.level + 1]
                if node.module:
                    base += node.module.split(".")
            else:
                base = node.module.split(".") if node.module else []
            name = ".".join(base)
            if name:
                names.add(name)
            names.update(
                ".".join((*base, alias.name))
                for alias in node.names
                if alias.name != "*"
            )
    return tuple(sorted(names))


def _subsystem(path: str) -> str:
    parts = path.split("/")
    if path.startswith("libs/semantic_twin/"):
        return "semantic_twin"
    if path.startswith("apps/"):
        return parts[1] if len(parts) > 1 else "apps"
    if path.startswith(".bits/"):
        return "governance"
    if path.startswith("scripts/ci/"):
        return "ci"
    if path == "tools/buildanddo_release.py":
        return "release"
    return parts[0] if len(parts) > 1 else "repository"


@dataclass(frozen=True, slots=True, kw_only=True)
class HistoricalPrediction(Contract):
    """Retain heuristic selections independently of any grading answer."""

    subsystems: tuple[str, ...]
    dependencies: tuple[str, ...]
    tests: tuple[str, ...]
    runtime_risk: str | None
    next_failure: str | None = None
    repair_class: str | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class HistoricalModelCapture(Contract):
    """Accept an optional model answer to the exact same frozen historical question."""

    input_id: str
    model: str
    model_version: str
    source_ref: str
    source_digest: ContentDigest
    observed_at: datetime
    prediction: HistoricalPrediction

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.input_id, self.model, self.model_version, self.source_ref):
            text(value, "historical model provenance")


@dataclass(frozen=True, slots=True, kw_only=True)
class HistoricalCase(Contract):
    """Bind first-parent context, changed paths, predictions and optional reviewed truth."""

    commit: str
    before_commit: str | None
    committed_at: datetime
    changed_paths: tuple[str, ...]
    parent_tree_digest: ContentDigest | None
    parent_paths_resolved: int
    parent_paths_expected: int
    python_files: int
    unparsed_python_files: int
    prediction: HistoricalPrediction
    latency_ms: float
    unavailable_paths: tuple[str, ...] = ()
    outcome: Episode | None = None
    model: HistoricalModelCapture | None = None
    gaps: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        SourceRevision(self.commit)
        if self.before_commit is not None:
            SourceRevision(self.before_commit)
        require(
            0 <= self.parent_paths_resolved <= self.parent_paths_expected,
            "invalid historical resolution count",
        )
        require(
            self.latency_ms >= 0
            and 0 <= self.unparsed_python_files <= self.python_files,
            "invalid historical measurement",
        )
        if self.outcome is not None:
            require(
                self.outcome.status == "VERIFIED",
                "outcome is not independently verified",
            )
            result = self.outcome.attempts[-1].result
            assert result is not None
            require(result.source_sha == self.commit, "outcome result source mismatch")
            require(
                self.outcome.ended_at >= self.committed_at,
                "outcome precedes source commit",
            )
        if self.model is not None:
            require(
                self.model.input_id == self.input_id,
                "model saw a different historical context",
            )

    @property
    def input_id(self) -> str:
        """Address only the before state and declared diff; exclude later outcomes."""
        return str(
            identity(
                "context",
                {
                    "profile": PROFILE,
                    "commit": self.commit,
                    "before": self.before_commit,
                    "tree": self.parent_tree_digest,
                    "paths": self.changed_paths,
                    "unavailable_paths": self.unavailable_paths,
                },
            )
        )

    @property
    def truth(self) -> OutcomeLabels | None:
        """Recover labels only from an independent result-bound episode receipt."""
        if self.outcome is None or self.outcome.status != "VERIFIED":
            return None
        result = self.outcome.attempts[-1].result
        assert result is not None
        labels = result.data.get("labels")
        return OutcomeLabels.from_dict(mapping(labels)) if labels else None


def _prediction(
    paths: tuple[str, ...], edges: Mapping[str, tuple[str, ...]]
) -> HistoricalPrediction:
    affected = set(paths)
    changed = True
    while changed:
        changed = False
        for importer, dependencies in edges.items():
            if importer not in affected and set(dependencies) & affected:
                affected.add(importer)
                changed = True
    tests = tuple(
        sorted(
            path
            for path in affected
            if path.endswith(".py")
            and (PurePosixPath(path).name.startswith("test_") or "/tests/" in path)
        )
    )
    risk = (
        "runtime"
        if any(
            path.endswith((".py", ".js", ".jsx", ".ts", ".tsx"))
            and not path.startswith(("tests/", "docs/"))
            for path in paths
        )
        else "governance"
        if any(path.startswith((".bits/", ".github/")) for path in paths)
        else "tests"
        if any(path.startswith("tests/") for path in paths)
        else "documentation"
        if paths
        else None
    )
    return HistoricalPrediction(
        subsystems=tuple(sorted({_subsystem(path) for path in paths})),
        dependencies=tuple(sorted(affected - set(paths))),
        tests=tests,
        runtime_risk=risk,
    )


def _scores(
    cases: tuple[HistoricalCase, ...], *, model: bool = False
) -> dict[str, Rate]:
    totals = {
        name: [0, 0]
        for name in (
            "subsystem_resolution",
            "dependency_precision",
            "dependency_recall",
            "test_precision",
            "test_recall",
            "runtime_risk",
            "failure_classification",
            "repair_class_selection",
        )
    }
    for case in cases:
        truth = case.truth
        prediction = (
            case.model.prediction
            if model and case.model
            else (None if model else case.prediction)
        )
        if truth is None or prediction is None:
            continue
        for field, label in (
            ("subsystems", "subsystem_resolution"),
            ("runtime_risk", "runtime_risk"),
            ("next_failure", "failure_classification"),
            ("repair_class", "repair_class_selection"),
        ):
            actual = getattr(truth, field)
            if actual is not None:
                totals[label][1] += 1
                totals[label][0] += getattr(prediction, field) == actual
        for field, prefix in (("dependencies", "dependency"), ("tests", "test")):
            actual = getattr(truth, field)
            if actual is not None:
                expected, selected = set(actual), set(getattr(prediction, field))
                intersection = len(expected & selected)
                totals[prefix + "_precision"][0] += intersection
                totals[prefix + "_precision"][1] += len(selected)
                totals[prefix + "_recall"][0] += intersection
                totals[prefix + "_recall"][1] += len(expected)
    return {name: Rate(*counts) for name, counts in totals.items()}


@dataclass(frozen=True, slots=True)
class BenchmarkReport(Contract):
    """Retain an honest historical epoch with comparable corpus and grading boundaries."""

    scope_id: str
    evaluated_at: datetime
    cases: tuple[HistoricalCase, ...]
    profile: str = PROFILE

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "benchmark scope")
        require(
            self.profile == PROFILE and bool(self.cases), "unknown or empty benchmark"
        )
        require(
            len({case.commit for case in self.cases}) == len(self.cases),
            "duplicate historical case",
        )
        for case in self.cases:
            require(case.committed_at <= self.evaluated_at, "future historical source")
            if case.outcome is not None:
                require(
                    case.outcome.events[0].scope_id == self.scope_id,
                    "outcome scope mismatch",
                )
                require(
                    all(
                        e.ingested_at <= self.evaluated_at for e in case.outcome.events
                    ),
                    "future outcome ingestion",
                )
            if case.model is not None:
                require(
                    case.model.observed_at <= self.evaluated_at, "future model capture"
                )

    @property
    def corpus_digest(self) -> str:
        """Bind comparisons to the same questions and exact grading evidence."""
        return digest(
            {
                "profile": self.profile,
                "scope": self.scope_id,
                "cases": [
                    (case.input_id, case.outcome.episode_id if case.outcome else None)
                    for case in self.cases
                ],
            }
        )

    @property
    def report_id(self) -> str:
        """Address the full measured chronological epoch."""
        return str(identity("evaluation", self))

    def summary(self) -> dict[str, object]:
        """Separate source coverage from outcome accuracy and missing teachers."""
        return {
            "report_id": self.report_id,
            "profile": self.profile,
            "scope_id": self.scope_id,
            "evaluated_at": self.evaluated_at.isoformat(),
            "cases": len(self.cases),
            "corpus_digest": self.corpus_digest,
            "reviewed_outcomes": sum(case.truth is not None for case in self.cases),
            "model_captures": sum(case.model is not None for case in self.cases),
            "cases_with_unavailable_source": sum(
                bool(case.unavailable_paths) or case.parent_tree_digest is None
                for case in self.cases
            ),
            "structural_parent_resolution": Rate(
                sum(c.parent_paths_resolved for c in self.cases),
                sum(c.parent_paths_expected for c in self.cases),
            ).summary(),
            "structural_prediction_coverage": Rate(
                sum(bool(c.changed_paths) for c in self.cases),
                len(self.cases),
            ).summary(),
            "graph_scores": {k: v.summary() for k, v in _scores(self.cases).items()},
            "model_scores": {
                k: v.summary() for k, v in _scores(self.cases, model=True).items()
            },
            "latency_ms": sum(case.latency_ms for case in self.cases),
            "model_calls": 0,
            "tokens": 0,
            "effects_executed": 0,
            "causal_identification": "UNMEASURED",
            "limitations": (
                "Parent-tree Python import closure is a static prediction, not measured dependency impact.",
                "Changed paths are the declared input; new source and commit messages are not prediction inputs.",
                "Missing pipeline, runtime, repair and model captures have no grading denominator.",
                "Ordering and subsequent fixes do not establish causality.",
            ),
        }


def benchmark(
    repository: Path,
    *,
    scope_id: str,
    evaluated_at: datetime,
    limit: int = 100,
    outcomes: tuple[Episode, ...] = (),
    models: tuple[HistoricalModelCapture, ...] = (),
) -> BenchmarkReport:
    """Predict from actual first-parent trees and grade only supplied independently reviewed outcomes."""
    require(1 <= limit <= 1000, "history limit must be between 1 and 1000")
    history = read_git_history(repository, max_count=limit)
    require(bool(history), "repository has no local history")
    model_index = {model.input_id: model for model in models}
    require(len(model_index) == len(models), "duplicate historical model input")
    parsed: dict[tuple[str, str], tuple[str, ...] | None] = {}
    available = _available_blobs(repository)
    cases = []
    for commit in reversed(history):
        started = perf_counter_ns()
        before = commit.parents[0] if commit.parents else None
        gaps: list[str] = []
        tree_known = True
        try:
            tree = _tree(repository, before, available) if before else {}
        except HistoricalReadError as exc:
            tree = {}
            tree_known = False
            gaps.append(str(exc))
        source_files = {
            path: value
            for path, value in tree.items()
            if path.endswith(".py")
            and path.startswith(_SOURCE_PREFIXES)
            and not path.startswith(_FORBIDDEN)
        }
        require(
            sum(max(size, 0) for _, size in source_files.values()) <= _MAX_SNAPSHOT,
            "historical Python snapshot exceeds bounded input size",
        )
        pending = tuple(
            sorted(
                {
                    sha
                    for path, (sha, size) in source_files.items()
                    if 0 <= size <= _MAX_BLOB and (path, sha) not in parsed
                }
            )
        )
        try:
            contents = _blobs(repository, pending)
        except HistoricalReadError as exc:
            contents = {}
            gaps.append(str(exc))
        for path, (sha, size) in source_files.items():
            if (path, sha) not in parsed:
                parsed[path, sha] = (
                    _imports(path, contents[sha]) if sha in contents else None
                )
        modules = {_module_name(path): path for path in source_files}
        edges = {
            path: tuple(
                sorted(
                    {
                        modules[name]
                        for name in (parsed[path, sha] or ())
                        if name in modules
                    }
                )
            )
            for path, (sha, _) in source_files.items()
        }
        changes = commit.changes
        if not changes and before is not None:
            try:
                changes = _first_parent_changes(repository, before, commit.commit)
            except HistoricalReadError as exc:
                gaps.append(str(exc))
        paths = tuple(sorted({change.path for change in changes}))
        if not paths:
            gaps.append("No changed paths observed against the first parent")
        unavailable_paths = tuple(
            sorted(
                path
                for path, (sha, _) in source_files.items()
                if parsed[path, sha] is None
            )
        )
        if unavailable_paths:
            gaps.append(
                "Some parent Python sources are absent, oversized or unparseable; import closure is incomplete"
            )
        if before is None:
            gaps.append("root commit has no before tree")
        expected_paths = tuple(
            change.old_path or change.path for change in changes if change.status != "A"
        )
        committed = timestamp(
            _git(repository, "show", "-s", "--format=%cI", commit.commit)
            .decode("utf-8")
            .strip()
        )
        matches = [
            ep
            for ep in outcomes
            if ep.events[0].scope_id == scope_id
            and ep.status == "VERIFIED"
            and ep.attempts[-1].result is not None
            and ep.attempts[-1].result.source_sha == commit.commit
            and ep.ended_at >= committed
        ]
        if len(matches) > 1:
            gaps.append("multiple outcome episodes require explicit reconciliation")
        outcome = matches[0] if len(matches) == 1 else None
        if outcome is None:
            gaps.append("no independently reviewed retained outcome")
        case = HistoricalCase(
            commit=commit.commit,
            before_commit=before,
            committed_at=committed,
            changed_paths=paths,
            parent_tree_digest=ContentDigest(digest(tree)) if tree_known else None,
            parent_paths_resolved=sum(path in tree for path in expected_paths),
            parent_paths_expected=len(expected_paths) if tree_known else 0,
            python_files=len(source_files),
            unparsed_python_files=sum(
                parsed[path, sha] is None for path, (sha, _) in source_files.items()
            ),
            prediction=_prediction(paths, edges),
            unavailable_paths=unavailable_paths,
            latency_ms=(perf_counter_ns() - started) / 1_000_000,
            outcome=outcome,
            gaps=tuple(gaps),
        )
        if case.input_id in model_index:
            from dataclasses import replace

            case = replace(case, model=model_index[case.input_id])
        cases.append(case)
    require(
        set(model_index) <= {case.input_id for case in cases},
        "model capture outside benchmark corpus",
    )
    return BenchmarkReport(scope_id, evaluated_at, tuple(cases))


def compare_epochs(
    previous: BenchmarkReport, current: BenchmarkReport
) -> dict[str, object]:
    """Compute deltas only for the same corpus, grading evidence and measured denominator."""
    if (
        previous.corpus_digest != current.corpus_digest
        or current.evaluated_at <= previous.evaluated_at
    ):
        return {
            "status": "HOLD",
            "reason": "epochs differ in corpus/evidence or are not chronological",
            "previous": previous.report_id,
            "current": current.report_id,
        }
    before, after = _scores(previous.cases), _scores(current.cases)
    deltas: dict[str, float | None] = {}
    for name, rate in before.items():
        old, new = rate.value, after[name].value
        deltas[name] = (
            new - old
            if old is not None
            and new is not None
            and rate.denominator == after[name].denominator
            else None
        )
    return {
        "status": "COMPARABLE",
        "previous": previous.report_id,
        "current": current.report_id,
        "graph_score_deltas": deltas,
        "verified_outcome_delta": sum(c.truth is not None for c in current.cases)
        - sum(c.truth is not None for c in previous.cases),
    }
