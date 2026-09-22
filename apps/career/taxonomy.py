# ─── CGRF Header ──────────────────────────────
# File:        apps/career/taxonomy.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     none
# EnumType:    Schema
# EnumEdges:   PRODUCES apps/career/history.py; PRODUCES apps/career/jobs.py
# DAG Node:    none
# Intent:      Name the capabilities both work evidence and job requirements resolve to, so matching compares like with like.
# ─────────────────────────────────────────────────────────────

"""Declare the shared capability vocabulary for work evidence and job requirements."""

from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Capability:
    """Describe one capability and the signals that resolve to it."""

    capability_id: str
    label: str
    claim_object: str
    keywords: tuple[str, ...]
    path_patterns: tuple[str, ...] = ()
    commit_scopes: tuple[str, ...] = ()


CAPABILITIES: tuple[Capability, ...] = (
    Capability(
        "distributed_systems",
        "Distributed systems",
        "distributed, event-driven services",
        ("distributed systems", "distributed system", "event-driven", "event driven",
         "message bus", "messaging", "nats", "kafka", "microservices", "event architecture"),
        ("services/*", "libs/semantic_twin/*", "libs/evolution/*"),
        ("evidence",),
    ),
    Capability(
        "ci_cd",
        "CI/CD",
        "CI/CD pipelines and quality gates",
        ("ci/cd", "continuous integration", "continuous delivery", "build pipeline",
         "pipelines", "gitlab", "github actions", "ci"),
        (".gitlab-ci.yml", ".gitlab/*", ".github/workflows/*", ".github/actions/*", "scripts/ci/*"),
        ("ci",),
    ),
    Capability(
        "observability",
        "Observability",
        "observability and telemetry instrumentation",
        ("observability", "monitoring", "telemetry", "datadog", "apm", "tracing", "logging", "rum"),
        ("*datadog*", "*telemetry*", "*metrics*"),
        (),
    ),
    Capability(
        "frontend",
        "Frontend engineering",
        "React/TypeScript frontend features",
        ("react", "typescript", "javascript", "frontend", "front-end", "vite", "web application"),
        ("apps/web/*",),
        ("web",),
    ),
    Capability(
        "backend_api",
        "Backend and API development",
        "backend services and APIs",
        ("backend", "back-end", "api", "apis", "rest api", "rest apis", "restful", "pocketbase", "fastapi",
         "database"),
        ("apps/pocketbase/*",),
        ("pocketbase",),
    ),
    Capability(
        "python",
        "Python",
        "Python systems and tooling",
        ("python",),
        ("*.py",),
        (),
    ),
    Capability(
        "security",
        "Security and supply chain",
        "security, supply-chain and public-boundary controls",
        ("security", "supply chain", "supply-chain", "sbom", "owasp", "nist",
         "vulnerability", "secret scanning", "appsec"),
        ("*supply_chain*", "*boundary*", "*security*", "*secret*"),
        (),
    ),
    Capability(
        "testing_verification",
        "Testing and verification",
        "automated test and verification suites",
        ("testing", "test automation", "automated tests", "verification", "qa",
         "quality assurance", "tevv", "unit tests", "integration tests"),
        ("tests/*", "*.test.mjs", "*.test.js", "*.test.jsx", "*/test_*.py"),
        ("test",),
    ),
    Capability(
        "ai_systems",
        "AI and agent systems",
        "AI agent and decision-runtime systems",
        ("ai", "llm", "llms", "machine learning", "agents", "agentic", "multi-agent",
         "ai infrastructure", "inference"),
        ("apps/decision/*", "apps/federal_foundry/*", "foundry/*"),
        (),
    ),
    Capability(
        "architecture",
        "System architecture",
        "system architecture and design documents",
        ("architecture", "system design", "architect", "technical design"),
        ("docs/architecture/*",),
        (),
    ),
    Capability(
        "deployment",
        "Deployment and infrastructure",
        "deployment and release tooling",
        ("deployment", "deployments", "release engineering", "infrastructure", "docker",
         "containers", "cloud"),
        ("scripts/deploy/*", "docker-compose*", "*Dockerfile*"),
        ("deploy",),
    ),
    Capability(
        "governance",
        "Engineering governance",
        "engineering governance and change-control process",
        ("governance", "compliance", "change management", "policy as code", "audit"),
        (".bits/*", "AGENTS.md", "CONTRIBUTING.md"),
        ("governance",),
    ),
    Capability(
        "technical_writing",
        "Technical writing",
        "technical documentation",
        ("documentation", "technical writing", "docs"),
        ("docs/*", "*.md"),
        ("docs",),
    ),
    Capability(
        "kubernetes",
        "Kubernetes",
        "Kubernetes workloads",
        ("kubernetes", "k8s", "helm"),
        ("*k8s*", "*kubernetes*"),
        (),
    ),
)

BY_ID: dict[str, Capability] = {item.capability_id: item for item in CAPABILITIES}

_SCOPE = re.compile(r"^[a-z]+\(([a-z0-9_-]+)\)!?:")


def _keyword_pattern(keyword: str) -> re.Pattern[str]:
    return re.compile(r"(?<![a-z0-9])" + re.escape(keyword) + r"(?![a-z0-9])")


_KEYWORDS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (item.capability_id, _keyword_pattern(keyword))
    for item in CAPABILITIES
    for keyword in item.keywords
)


def capabilities_for_text(text: str) -> tuple[str, ...]:
    """Return capability ids whose keywords occur as whole terms in the text."""
    lowered = text.lower()
    found = {capability for capability, pattern in _KEYWORDS if pattern.search(lowered)}
    return tuple(item.capability_id for item in CAPABILITIES if item.capability_id in found)


def capabilities_for_change(subject: str, paths: tuple[str, ...]) -> tuple[str, ...]:
    """Return capability ids evidenced by a commit's conventional scope and changed paths."""
    found: set[str] = set()
    scope = _SCOPE.match(subject.strip().lower())
    for item in CAPABILITIES:
        if scope and scope.group(1) in item.commit_scopes:
            found.add(item.capability_id)
        for path in paths:
            if any(fnmatch.fnmatch(path, pattern) for pattern in item.path_patterns):
                found.add(item.capability_id)
                break
    return tuple(item.capability_id for item in CAPABILITIES if item.capability_id in found)
