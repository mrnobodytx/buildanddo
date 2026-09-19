# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/source.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, tools/buildanddo_release.py
# EnumType:    Service
# EnumEdges:   CONSUMES tools/buildanddo_release.py; PRODUCES libs/semantic_twin/ingestion/pipeline.py; DEPENDS_ON libs/semantic_twin/ingestion/graph.py
# DAG Node:    semantic-twin.phase-1.source-ingestion
# Intent:      Derive code symbols, call edges, configuration reads, receipt writes, publications and external dependencies without importing or executing the release controller.
# ──────────────────────────────────────────────────────────

"""Statically ingest the BuildAndDo release controller with the Python AST."""

from __future__ import annotations

import ast
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
import hashlib
from pathlib import Path
from urllib.parse import quote

from ..models import CanonicalObjectEnvelope, Relation
from ..vocabulary import EvidenceState, RelationPredicate
from .graph import SemanticGraph, make_object


_DEFINITION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
_EXTERNAL_DEPENDENCIES = (
    (
        "Datadog API",
        "external://datadog/api",
        ("datadog", "dd_api_key", "/api/v2/dora"),
    ),
    (
        "GitHub",
        "external://github",
        ("github", "buildanddo_github_remote"),
    ),
    (
        "GitLab",
        "external://gitlab",
        ("gitlab", "gitlab_token", "gitlab_url"),
    ),
)


@dataclass(frozen=True, slots=True)
class _Symbol:
    """Retain one AST definition with its stable qualified name."""

    name: str
    qualname: str
    kind: str
    node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef


class _DefinitionVisitor(ast.NodeVisitor):
    """Collect functions and classes while preserving lexical qualification."""

    def __init__(self) -> None:
        self.stack: list[str] = []
        self.symbols: list[_Symbol] = []

    def _record(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef,
        kind: str,
    ) -> None:
        qualname = ".".join((*self.stack, node.name))
        self.symbols.append(_Symbol(node.name, qualname, kind, node))
        self.stack.append(node.name)
        self.generic_visit(node)
        self.stack.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Record a synchronous function."""

        self._record(node, "function")

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        """Record an asynchronous function."""

        self._record(node, "async_function")

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        """Record a class and then its methods."""

        self._record(node, "class")


def _scope_nodes(
    node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef,
) -> Iterable[ast.AST]:
    """Yield descendants owned by a definition, excluding nested definitions."""

    pending = list(reversed(list(ast.iter_child_nodes(node))))
    while pending:
        current = pending.pop()
        if isinstance(current, _DEFINITION_NODES):
            continue
        yield current
        pending.extend(reversed(list(ast.iter_child_nodes(current))))


def _dotted_name(node: ast.AST) -> str | None:
    """Render a simple name or attribute chain."""

    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = _dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def _expression_pattern(
    node: ast.AST,
    assignments: dict[str, str],
) -> str | None:
    """Render a static string or a stable placeholder-bearing expression."""

    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return assignments.get(node.id, "{" + node.id.upper() + "}")
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _expression_pattern(node.left, assignments)
        right = _expression_pattern(node.right, assignments)
        return f"{left}{right}" if left is not None and right is not None else None
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for value in node.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            elif isinstance(value, ast.FormattedValue):
                rendered = _expression_pattern(value.value, assignments)
                parts.append(rendered or "{EXPR}")
        return "".join(parts)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        rendered = _expression_pattern(node.func.value, assignments)
        if rendered is not None and node.func.attr == "upper":
            return rendered.upper()
        if rendered is not None and node.func.attr in {"lower", "strip"}:
            return rendered
    if isinstance(node, ast.Attribute):
        rendered = _dotted_name(node)
        return "{" + rendered.upper() + "}" if rendered else None
    return None


def _assignments(nodes: tuple[ast.AST, ...]) -> dict[str, str]:
    """Collect simple local string-expression bindings for key reconstruction."""

    result: dict[str, str] = {}
    for node in nodes:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = node.value
            targets = node.targets if isinstance(node, ast.Assign) else (node.target,)
            rendered = _expression_pattern(value, result) if value is not None else None
            if rendered is None:
                continue
            for target in targets:
                if isinstance(target, ast.Name):
                    result[target.id] = rendered
    return result


def _environment_key(
    node: ast.AST,
    assignments: dict[str, str],
) -> str | None:
    """Extract an environment key consumed by a call or subscript."""

    if isinstance(node, ast.Call):
        name = _dotted_name(node.func)
        if (
            name in {"os.environ.get", "os.environ.setdefault", "os.getenv"}
            and node.args
        ):
            return _expression_pattern(node.args[0], assignments)
    if isinstance(node, ast.Subscript) and isinstance(node.ctx, ast.Load):
        if _dotted_name(node.value) == "os.environ":
            return _expression_pattern(node.slice, assignments)
    return None


def _receipt_name(
    call: ast.Call,
    assignments: dict[str, str],
) -> str | None:
    """Extract the receipt name argument from a receipt helper call."""

    if len(call.args) < 2:
        return None
    return _expression_pattern(call.args[1], assignments)


def _semantic_fragment(value: str) -> str:
    """Encode a human value into a URI-safe stable fragment."""

    encoded = quote(value, safe="._-{}")
    if len(encoded) <= 120:
        return encoded
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _source_reference(path: str, node: ast.AST) -> str:
    """Create a line-addressed source evidence reference."""

    line = getattr(node, "lineno", 1)
    return f"{path}:{line}"


def _relation(
    predicate: RelationPredicate,
    target: str,
    evidence: str,
    *,
    state: EvidenceState = EvidenceState.INFERRED,
    confidence: float = 1.0,
) -> Relation:
    """Create a typed static-analysis relation."""

    return Relation(
        predicate=predicate,
        target=target,
        evidence=(evidence,),
        confidence=confidence,
        state=state,
    )


def ingest_release_source(
    controller_path: Path,
    *,
    repository_root: Path | None = None,
    commit: str | None = None,
) -> SemanticGraph:
    """Parse a release controller into code, configuration and event objects."""

    controller = controller_path.resolve()
    root = (
        repository_root.resolve() if repository_root is not None else controller.parent
    )
    try:
        relative = controller.relative_to(root).as_posix()
    except ValueError:
        relative = controller.as_posix()
    source_text = controller.read_text(encoding="utf-8")
    tree = ast.parse(source_text, filename=relative)
    visitor = _DefinitionVisitor()
    visitor.visit(tree)
    symbols = tuple(visitor.symbols)

    module_id = f"code://{relative}#module"
    symbol_ids = {
        symbol.qualname: f"code://{relative}#symbol/{_semantic_fragment(symbol.qualname)}"
        for symbol in symbols
    }
    by_short_name: dict[str, list[_Symbol]] = defaultdict(list)
    for symbol in symbols:
        by_short_name[symbol.name].append(symbol)

    symbol_relations: dict[str, list[Relation]] = {
        symbol.qualname: [
            _relation(
                RelationPredicate.MEMBER_OF,
                module_id,
                _source_reference(relative, symbol.node),
                state=EvidenceState.OBSERVED,
            )
        ]
        for symbol in symbols
    }
    configuration_evidence: dict[str, set[str]] = defaultdict(set)
    event_evidence: dict[str, set[str]] = defaultdict(set)
    dependency_evidence: dict[str, set[str]] = defaultdict(set)

    for symbol in symbols:
        nodes = tuple(_scope_nodes(symbol.node))
        assignments = _assignments(nodes)
        caller_relations = symbol_relations[symbol.qualname]
        segment = ast.get_source_segment(source_text, symbol.node) or ""
        segment_lower = segment.casefold()

        for dependency_name, dependency_id, markers in _EXTERNAL_DEPENDENCIES:
            if any(marker in segment_lower for marker in markers):
                evidence = _source_reference(relative, symbol.node)
                dependency_evidence[dependency_name].add(evidence)
                caller_relations.append(
                    _relation(
                        RelationPredicate.DEPENDS_ON,
                        dependency_id,
                        evidence,
                    )
                )

        for node in nodes:
            evidence = _source_reference(relative, node)
            key = _environment_key(node, assignments)
            if key:
                configuration_evidence[key].add(evidence)
                caller_relations.append(
                    _relation(
                        RelationPredicate.READS,
                        f"config://buildanddo/{_semantic_fragment(key)}",
                        evidence,
                        state=EvidenceState.OBSERVED,
                    )
                )

            if not isinstance(node, ast.Call):
                continue
            called = _dotted_name(node.func)
            if called:
                short_name = called.rsplit(".", 1)[-1]
                candidates = by_short_name.get(short_name, [])
                target: _Symbol | None = None
                parent = symbol.qualname.rpartition(".")[0]
                if parent:
                    qualified = f"{parent}.{short_name}"
                    target = next(
                        (item for item in candidates if item.qualname == qualified),
                        None,
                    )
                if target is None and len(candidates) == 1:
                    target = candidates[0]
                if target is not None and target.qualname != symbol.qualname:
                    caller_relations.append(
                        _relation(
                            RelationPredicate.CALLS,
                            symbol_ids[target.qualname],
                            evidence,
                            state=EvidenceState.OBSERVED,
                        )
                    )

            if called == "write_receipt":
                receipt = _receipt_name(node, assignments)
                if receipt:
                    event_evidence[receipt].add(evidence)
                    event_id = (
                        f"event://buildanddo/receipt/{_semantic_fragment(receipt)}"
                    )
                    caller_relations.extend(
                        (
                            _relation(
                                RelationPredicate.WRITES,
                                event_id,
                                evidence,
                                state=EvidenceState.OBSERVED,
                            ),
                            _relation(
                                RelationPredicate.PUBLISHES,
                                event_id,
                                evidence,
                                state=EvidenceState.OBSERVED,
                            ),
                        )
                    )

            if called == "read_json":
                for descendant in ast.walk(node):
                    if not isinstance(descendant, ast.Call):
                        continue
                    if _dotted_name(descendant.func) != "receipt_path":
                        continue
                    receipt = _receipt_name(descendant, assignments)
                    if receipt:
                        event_evidence[receipt].add(evidence)
                        caller_relations.append(
                            _relation(
                                RelationPredicate.READS,
                                f"event://buildanddo/receipt/{_semantic_fragment(receipt)}",
                                evidence,
                                state=EvidenceState.OBSERVED,
                            )
                        )

        if "dora_deployment" in segment:
            evidence = _source_reference(relative, symbol.node)
            event_evidence["dora_deployment"].add(evidence)
            caller_relations.append(
                _relation(
                    RelationPredicate.PUBLISHES,
                    "event://datadog/dora_deployment",
                    evidence,
                    state=EvidenceState.OBSERVED,
                )
            )

    module_relations: list[Relation] = [
        _relation(
            RelationPredicate.CONTAINS,
            target,
            relative,
            state=EvidenceState.OBSERVED,
        )
        for target in symbol_ids.values()
    ]
    module_relations.extend(
        _relation(
            RelationPredicate.READS,
            f"config://buildanddo/{_semantic_fragment(key)}",
            sorted(configuration_evidence[key])[0],
            state=EvidenceState.OBSERVED,
        )
        for key in sorted(configuration_evidence)
    )
    module_relations.extend(
        _relation(
            RelationPredicate.DEPENDS_ON,
            dependency_id,
            (sorted(dependency_evidence[dependency_name]) or [relative])[0],
        )
        for dependency_name, dependency_id, _ in _EXTERNAL_DEPENDENCIES
    )
    module_relations.extend(
        _relation(
            RelationPredicate.PUBLISHES,
            (
                "event://datadog/dora_deployment"
                if name == "dora_deployment"
                else f"event://buildanddo/receipt/{_semantic_fragment(name)}"
            ),
            sorted(event_evidence[name])[0],
            state=EvidenceState.OBSERVED,
        )
        for name in sorted(event_evidence)
    )
    module = make_object(
        module_id,
        "CodeModule",
        relative,
        claims=(
            {
                "name": controller.name,
                "language": "python",
                "line_count": len(source_text.splitlines()),
            },
        ),
        relations=tuple(module_relations),
        commit=commit,
        documentation=(relative,),
    )

    objects: list[CanonicalObjectEnvelope] = [module]
    for symbol in symbols:
        objects.append(
            make_object(
                symbol_ids[symbol.qualname],
                "CodeSymbol",
                relative,
                claims=(
                    {
                        "name": symbol.name,
                        "qualified_name": symbol.qualname,
                        "kind": symbol.kind,
                        "line": symbol.node.lineno,
                        "end_line": symbol.node.end_lineno,
                    },
                ),
                relations=symbol_relations[symbol.qualname],
                commit=commit,
                documentation=(_source_reference(relative, symbol.node),),
            )
        )

    for key in sorted(configuration_evidence):
        objects.append(
            make_object(
                f"config://buildanddo/{_semantic_fragment(key)}",
                "ConfigurationKey",
                relative,
                claims=({"key": key, "consumed": True},),
                relations=(
                    _relation(
                        RelationPredicate.ASSOCIATED_WITH,
                        module_id,
                        sorted(configuration_evidence[key])[0],
                        state=EvidenceState.OBSERVED,
                    ),
                ),
                commit=commit,
            )
        )

    for dependency_name, dependency_id, _ in _EXTERNAL_DEPENDENCIES:
        dependency_refs = sorted(dependency_evidence[dependency_name]) or [relative]
        objects.append(
            make_object(
                dependency_id,
                "ExternalDependency",
                relative,
                claims=({"name": dependency_name, "external": True},),
                relations=(
                    _relation(
                        RelationPredicate.ASSOCIATED_WITH,
                        module_id,
                        dependency_refs[0],
                    ),
                ),
                evidence_state=EvidenceState.INFERRED,
                commit=commit,
            )
        )

    for event_name in sorted(event_evidence):
        event_id = (
            "event://datadog/dora_deployment"
            if event_name == "dora_deployment"
            else f"event://buildanddo/receipt/{_semantic_fragment(event_name)}"
        )
        objects.append(
            make_object(
                event_id,
                "PublishedEvent",
                relative,
                claims=(
                    {
                        "name": event_name,
                        "channel": (
                            "Datadog DORA API"
                            if event_name == "dora_deployment"
                            else "deployment receipt"
                        ),
                    },
                ),
                relations=(
                    _relation(
                        RelationPredicate.ASSOCIATED_WITH,
                        module_id,
                        sorted(event_evidence[event_name])[0],
                        state=EvidenceState.OBSERVED,
                    ),
                ),
                commit=commit,
            )
        )

    return SemanticGraph(tuple(objects))


def source_symbol_ids(graph: SemanticGraph) -> dict[str, str]:
    """Map extracted qualified symbol names to their semantic identities."""

    result: dict[str, str] = {}
    for item in graph.objects:
        if item.object_type != "CodeSymbol":
            continue
        qualified_name = item.claims[0].get("qualified_name")
        if isinstance(qualified_name, str):
            result[qualified_name] = item.semantic_id
    return result


def source_module_id(graph: SemanticGraph) -> str:
    """Return the single code-module identity from a source ingestion graph."""

    modules = [
        item.semantic_id for item in graph.objects if item.object_type == "CodeModule"
    ]
    if len(modules) != 1:
        raise ValueError(f"expected exactly one code module, found {len(modules)}")
    return modules[0]
