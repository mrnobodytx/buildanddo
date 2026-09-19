# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/identity.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.identity
# Intent:      Preserve source-qualified semantic identity and version scope before objects or receipts enter the twin.
# ───────────────────────────────────────────────────────────────

"""Freeze entity names and normalize the section 46 identifier namespaces."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from types import MappingProxyType
from typing import ClassVar, Final, Mapping
from urllib.parse import quote, urlsplit

from .contracts import Contract, ContractError, WireString, require, text
from .vocabulary import StringEnum


class EntityType(StringEnum):
    """Name section 34.1 entities and the explicit section 35 capability/resource types."""

    SYSTEM = "System"
    PRODUCT = "Product"
    TENANT = "Tenant"
    SERVICE = "Service"
    MODULE = "Module"
    PACKAGE = "Package"
    LIBRARY = "Library"
    REPOSITORY = "Repository"
    BRANCH = "Branch"
    COMMIT = "Commit"
    MERGE_REQUEST = "MergeRequest"
    FILE = "File"
    CODE_SYMBOL = "CodeSymbol"
    FUNCTION = "Function"
    CLASS = "Class"
    METHOD = "Method"
    API_ENDPOINT = "APIEndpoint"
    EVENT_TYPE = "EventType"
    EVENT_INSTANCE = "EventInstance"
    DATABASE = "Database"
    TABLE = "Table"
    COLUMN = "Column"
    QUEUE = "Queue"
    TOPIC = "Topic"
    NATS_SUBJECT = "NATSSubject"
    WORKFLOW = "Workflow"
    N8N_WORKFLOW = "n8nWorkflow"
    CONFIGURATION_KEY = "ConfigurationKey"
    SECRET_REFERENCE = "SecretReference"
    CONTAINER = "Container"
    HOST = "Host"
    DEPLOYMENT = "Deployment"
    ENVIRONMENT = "Environment"
    RELEASE_ARTIFACT = "ReleaseArtifact"
    SBOM = "SBOM"
    COMPONENT = "Component"
    OBJECTIVE = "Objective"
    REQUIREMENT = "Requirement"
    CONSTRAINT = "Constraint"
    DECISION = "Decision"
    CLAIM = "Claim"
    DEFINITION = "Definition"
    DOCUMENT = "Document"
    DOCUMENT_SECTION = "DocumentSection"
    ARCHITECTURE_DIAGRAM = "ArchitectureDiagram"
    RUNBOOK = "Runbook"
    INCIDENT_REPORT = "IncidentReport"
    ROADMAP_ITEM = "RoadmapItem"
    ACCEPTANCE_CRITERION = "AcceptanceCriterion"
    AGENT = "Agent"
    GUILDMASTER = "Guildmaster"
    PERSONA = "Persona"
    MEMORY = "Memory"
    EPISODE = "Episode"
    CONTEXT_BUNDLE = "ContextBundle"
    HYPOTHESIS = "Hypothesis"
    OBSERVATION = "Observation"
    INFERENCE = "Inference"
    EVALUATION = "Evaluation"
    TOOL_CALL = "ToolCall"
    PLAN = "Plan"
    MISSION = "Mission"
    SEMANTIC_TRANSACTION = "SemanticTransaction"
    EVIDENCE = "Evidence"
    RECEIPT = "Receipt"
    TRACE = "Trace"
    METRIC = "Metric"
    LOG_EVENT = "LogEvent"
    TEST = "Test"
    TEST_RUN = "TestRun"
    VERIFIER = "Verifier"
    POLICY = "Policy"
    AUTHORITY_GRANT = "AuthorityGrant"
    CHANGE_CONTRACT = "ChangeContract"
    ROLLBACK = "Rollback"
    ATTESTATION = "Attestation"
    MERKLE_EPOCH = "MerkleEpoch"
    MERKLE_ROOT = "MerkleRoot"
    INCLUSION_PROOF = "InclusionProof"
    SHACL_SHAPE = "SHACLShape"
    SHACL_VALIDATION_RESULT = "SHACLValidationResult"
    GUILD = "Guild"
    OWNER = "Owner"
    PERSON = "Person"
    ORGANIZATION = "Organization"
    CUSTOMER = "Customer"
    LEAD = "Lead"
    OPPORTUNITY = "Opportunity"
    SUBSCRIPTION = "Subscription"
    ENTITLEMENT = "Entitlement"
    PAYMENT = "Payment"
    SETTLEMENT = "Settlement"
    CONTENT_OBJECT = "ContentObject"
    CAMPAIGN = "Campaign"
    CAPABILITY = "Capability"
    RESOURCE = "Resource"


NAMESPACE_REGISTRY: Final[Mapping[str, frozenset[str]]] = MappingProxyType(
    {
        "cni": frozenset(
            {
                "system",
                "product",
                "tenant",
                "service",
                "module",
                "package",
                "library",
                "repository",
                "branch",
                "commit",
                "merge-request",
                "file",
                "symbol",
                "function",
                "class",
                "method",
                "endpoint",
                "event",
                "event-type",
                "database",
                "table",
                "column",
                "queue",
                "topic",
                "workflow",
                "configuration",
                "secret-reference",
                "container",
                "host",
                "deployment",
                "environment",
                "artifact",
                "sbom",
                "component",
                "objective",
                "capability",
                "requirement",
                "resource",
                "constraint",
                "decision",
                "claim",
                "definition",
                "document",
                "section",
                "diagram",
                "runbook",
                "incident",
                "roadmap",
                "acceptance",
                "agent",
                "guildmaster",
                "persona",
                "memory",
                "episode",
                "context",
                "hypothesis",
                "observation",
                "inference",
                "evaluation",
                "tool-call",
                "plan",
                "mission",
                "transaction",
                "evidence",
                "receipt",
                "trace",
                "metric",
                "log",
                "test",
                "test-run",
                "verifier",
                "policy",
                "authority",
                "change",
                "rollback",
                "attestation",
                "epoch",
                "root",
                "proof",
                "shape",
                "validation",
                "guild",
                "owner",
                "person",
                "organization",
                "customer",
                "lead",
                "opportunity",
                "subscription",
                "entitlement",
                "payment",
                "settlement",
                "content",
                "campaign",
            }
        ),
        "git": frozenset(),  # Repository name is the authority; path selects commit/file/symbol.
        "doc": frozenset(),  # Document name is the authority; version and section are required.
        "datadog": frozenset({"trace", "log", "metric"}),
        "posthog": frozenset({"event"}),
        "nats": frozenset({"subject"}),
        "sbom": frozenset({"component"}),
        "ext-git": frozenset(),  # Host + owner/repo@immutable-commit/path.
    }
)

_UNRESERVED = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
)

ENTITY_NAMESPACES: Final[Mapping[EntityType, str]] = MappingProxyType(
    {
        **{entity: entity.name.lower().replace("_", "-") for entity in EntityType},
        EntityType.CODE_SYMBOL: "symbol",
        EntityType.API_ENDPOINT: "endpoint",
        EntityType.EVENT_INSTANCE: "event",
        EntityType.NATS_SUBJECT: "topic",
        EntityType.N8N_WORKFLOW: "workflow",
        EntityType.CONFIGURATION_KEY: "configuration",
        EntityType.RELEASE_ARTIFACT: "artifact",
        EntityType.DOCUMENT_SECTION: "section",
        EntityType.ARCHITECTURE_DIAGRAM: "diagram",
        EntityType.INCIDENT_REPORT: "incident",
        EntityType.ROADMAP_ITEM: "roadmap",
        EntityType.ACCEPTANCE_CRITERION: "acceptance",
        EntityType.CONTEXT_BUNDLE: "context",
        EntityType.SEMANTIC_TRANSACTION: "transaction",
        EntityType.LOG_EVENT: "log",
        EntityType.AUTHORITY_GRANT: "authority",
        EntityType.CHANGE_CONTRACT: "change",
        EntityType.MERKLE_EPOCH: "epoch",
        EntityType.MERKLE_ROOT: "root",
        EntityType.INCLUSION_PROOF: "proof",
        EntityType.SHACL_SHAPE: "shape",
        EntityType.SHACL_VALIDATION_RESULT: "validation",
        EntityType.CONTENT_OBJECT: "content",
    }
)


def _normalize_component(value: str) -> str:
    require(not re.search(r"%(?![0-9a-fA-F]{2})", value), "invalid percent escape")

    def escape(match: re.Match[str]) -> str:
        char = chr(int(match[0][1:], 16))
        require(
            char not in "/\\" and ord(char) > 32 and ord(char) != 127,
            "encoded separator or control in identifier",
        )
        return char if char in _UNRESERVED else match[0].upper()

    normalized = re.sub(r"%[0-9a-fA-F]{2}", escape, value)
    require(
        normalized not in (".", "..", ""),
        "identifier contains an empty or relative segment",
    )
    return quote(normalized, safe="-._~%:@!$&'()*+,;=")


class SemanticId(WireString):
    """Represent a canonical, namespace-qualified immutable semantic identifier."""

    __slots__ = ()

    def __new__(cls, value: str) -> SemanticId:
        require(isinstance(value, str) and bool(value), "semantic_id must be a string")
        require(
            not any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value),
            "whitespace/control in semantic_id",
        )
        require("\\" not in value, "backslash in semantic_id")
        try:
            parts = urlsplit(value)
        except ValueError as exc:
            raise ContractError("invalid semantic_id") from exc
        scheme = parts.scheme.lower()
        require(scheme in NAMESPACE_REGISTRY, "unregistered semantic_id scheme")
        require(
            bool(parts.netloc) and not parts.query and "?" not in value,
            "semantic_id requires authority and forbids queries",
        )
        require(
            not re.search(r"[@:%]", parts.netloc),
            "credentials, ports or escaped authorities are forbidden",
        )
        namespace = (
            parts.netloc.lower()
            if scheme in ("cni", "datadog", "posthog", "nats", "sbom", "ext-git")
            else parts.netloc
        )
        require(
            bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", namespace)),
            "invalid semantic_id authority",
        )
        allowed = NAMESPACE_REGISTRY[scheme]
        require(
            not allowed or namespace in allowed, "unregistered semantic_id namespace"
        )
        require(
            parts.path.startswith("/") and len(parts.path) > 1,
            "semantic_id requires a path",
        )
        segments = [_normalize_component(s) for s in parts.path[1:].split("/")]
        if scheme == "git":
            require(
                len(segments) >= 2 and segments[0] in {"commit", "file", "symbol"},
                "git IDs require commit, file or symbol scope",
            )
        if scheme == "doc":
            require(len(segments) >= 2, "doc IDs require version and section")
        if scheme == "ext-git":
            require(
                len(segments) >= 3
                and re.fullmatch(
                    r"[^@]+@[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?", segments[1]
                )
                is not None,
                "external repository IDs require owner/repo@immutable-commit/path",
            )
            repo, revision = segments[1].split("@")
            segments[1] = repo + "@" + revision.lower()
        if scheme == "nats":
            require(
                len(segments) == 1 and not re.search(r"[*>%]", segments[0]),
                "NATS IDs must identify a concrete subject",
            )
        fragment = ""
        if "#" in value:
            require(
                scheme in ("git", "doc", "ext-git"),
                "fragment not allowed in this namespace",
            )
            fragment = "#" + _normalize_component(parts.fragment)
        return str.__new__(
            cls, f"{scheme}://{namespace}/{'/'.join(segments)}{fragment}"
        )

    @classmethod
    def parse(cls, value: str) -> SemanticId:
        """Parse and normalize a URI without performing network access."""
        return cls(value)

    @property
    def scheme(self) -> str:
        """Return the registered identifier scheme."""
        return urlsplit(self).scheme

    @property
    def namespace(self) -> str:
        """Return the identifier authority or CNI entity namespace."""
        return urlsplit(self).netloc

    def require_namespace(self, *names: str) -> None:
        """Require a CNI identifier in one of the named namespaces."""
        require(
            self.scheme == "cni" and self.namespace in names,
            f"expected cni namespace {names}",
        )

    def require_entity_type(self, entity_type: EntityType) -> None:
        """Check a CNI ID's namespace against its declared entity class."""
        require(type(entity_type) is EntityType, "expected EntityType")
        if self.scheme == "cni":
            require(
                self.namespace == ENTITY_NAMESPACES[entity_type],
                "identifier namespace disagrees with entity type",
            )


@dataclass(frozen=True, slots=True)
class SubjectRef(Contract):
    """Bind evidence and receipts to the exact subject revision."""

    semantic_id: SemanticId
    version: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.version, "subject.version")


@dataclass(frozen=True, slots=True)
class ValidTime(Contract):
    """Bound validity independently of observation time."""

    valid_from: datetime | None = None
    valid_until: datetime | None = None
    WIRE_ALIASES: ClassVar[Mapping[str, str]] = MappingProxyType(
        {"valid_from": "from", "valid_until": "until"}
    )

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.valid_from is not None and self.valid_until is not None:
            require(
                self.valid_until >= self.valid_from,
                "valid_time.until must not precede valid_time.from",
            )
