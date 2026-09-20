# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/transitions.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/vocabulary.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/models.py, libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/semantic_twin/vocabulary.py; VALIDATES libs/semantic_twin/models.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/receipts.py
# DAG Node:    semantic-twin.phase-0.transitions
# Intent:      Make lifecycle gates executable while preventing unsupported evidence, causality and success shortcuts.
# ───────────────────────────────────────────────────────────

"""Enforce the Phase 0 state progressions and forbidden shortcuts."""

from __future__ import annotations

from dataclasses import dataclass, fields, replace
from enum import Enum
from types import MappingProxyType
from typing import Any, Final, Iterable, Mapping, Self, TypeAlias, cast

from .contracts import Contract, ContractError, require, text
from .identity import SubjectRef
from .models import AxisState, ObjectState
from .promotions import PromotionProof, requires_proof
from .receipts import EvidenceReference, validate_evidence

from .vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    SemanticTransactionState,
    ShaclState,
    StateAxis,
    TevvState,
)


TransitionState: TypeAlias = (
    EvidenceState
    | ShaclState
    | MerkleState
    | CgrfActionState
    | TevvState
    | SemanticTransactionState
    | CausalState
    | CorpusUseState
)


class InvalidTransitionError(ContractError):
    """Report an attempted lifecycle shortcut or invalid cross-family change."""


def _freeze_transitions(
    transitions: Mapping[TransitionState, Iterable[TransitionState]],
) -> Mapping[TransitionState, frozenset[TransitionState]]:
    """Freeze a transition table and all of its target sets."""

    return MappingProxyType(
        {state: frozenset(targets) for state, targets in transitions.items()}
    )


EVIDENCE_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            EvidenceState.UNMEASURED: {EvidenceState.OBSERVED},
            EvidenceState.OBSERVED: {
                EvidenceState.INFERRED,
                EvidenceState.INSUFFICIENT,
            },
            EvidenceState.INFERRED: {EvidenceState.HYPOTHESIS},
            EvidenceState.HYPOTHESIS: {EvidenceState.TESTING},
            EvidenceState.TESTING: {
                EvidenceState.VERIFIED,
                EvidenceState.CONTRADICTED,
            },
            EvidenceState.VERIFIED: {
                EvidenceState.CONTRADICTED,
                EvidenceState.SUPERSEDED,
                EvidenceState.RETIRED,
            },
            EvidenceState.CONTRADICTED: set(),
            EvidenceState.INSUFFICIENT: set(),
            EvidenceState.QUARANTINED: set(),
            EvidenceState.SUPERSEDED: set(),
            EvidenceState.RETIRED: set(),
        }
    )
)

SHACL_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            ShaclState.NOT_EVALUATED: {
                ShaclState.CONFORMS,
                ShaclState.WARNING,
                ShaclState.VIOLATES,
                ShaclState.DEFERRED,
            },
            ShaclState.CONFORMS: {
                ShaclState.SUPERSEDED,
            },
            ShaclState.WARNING: {
                ShaclState.CONFORMS,
                ShaclState.QUARANTINED,
                ShaclState.DEFERRED,
            },
            ShaclState.VIOLATES: {
                ShaclState.QUARANTINED,
                ShaclState.NOT_EVALUATED,
            },
            ShaclState.DEFERRED: {
                ShaclState.NOT_EVALUATED,
                ShaclState.CONFORMS,
                ShaclState.VIOLATES,
            },
            ShaclState.QUARANTINED: {
                ShaclState.NOT_EVALUATED,
                ShaclState.RETIRED,
            },
            ShaclState.SUPERSEDED: set(),
            ShaclState.RETIRED: set(),
        }
    )
)

MERKLE_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            MerkleState.UNHASHED: {MerkleState.CANONICALIZED},
            MerkleState.CANONICALIZED: {
                MerkleState.LEAF_HASHED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            },
            MerkleState.LEAF_HASHED: {
                MerkleState.ROOTED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            },
            MerkleState.ROOTED: {
                MerkleState.ATTESTED,
                MerkleState.INCLUSION_PROVEN,
                MerkleState.STALE,
                MerkleState.SUPERSEDED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            },
            MerkleState.ATTESTED: {
                MerkleState.INCLUSION_PROVEN,
                MerkleState.STALE,
                MerkleState.SUPERSEDED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            },
            MerkleState.INCLUSION_PROVEN: {
                MerkleState.STALE,
                MerkleState.SUPERSEDED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            },
            MerkleState.STALE: {MerkleState.SUPERSEDED, MerkleState.QUARANTINED},
            MerkleState.CORRUPT: {MerkleState.QUARANTINED},
            MerkleState.SUPERSEDED: set(),
            MerkleState.QUARANTINED: set(),
        }
    )
)

CGRF_ACTION_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            CgrfActionState.OBSERVED: {CgrfActionState.PROPOSED},
            CgrfActionState.PROPOSED: {
                CgrfActionState.POLICY_EVALUATING,
                CgrfActionState.SUPERSEDED,
            },
            CgrfActionState.POLICY_EVALUATING: {
                CgrfActionState.DENIED,
                CgrfActionState.AUTHORIZED,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.DENIED: {CgrfActionState.SUPERSEDED},
            CgrfActionState.AUTHORIZED: {
                CgrfActionState.RESERVED,
                CgrfActionState.EXECUTING,
                CgrfActionState.FAILED_CLOSED,
                CgrfActionState.SUPERSEDED,
            },
            CgrfActionState.RESERVED: {
                CgrfActionState.EXECUTING,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.EXECUTING: {
                CgrfActionState.MUTATED_UNVERIFIED,
                CgrfActionState.ROLLBACK_REQUIRED,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.MUTATED_UNVERIFIED: {
                CgrfActionState.VERIFYING,
                CgrfActionState.WATCH,
                CgrfActionState.ROLLBACK_REQUIRED,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.VERIFYING: {
                CgrfActionState.VERIFIED,
                CgrfActionState.WATCH,
                CgrfActionState.ROLLBACK_REQUIRED,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.VERIFIED: {
                CgrfActionState.WATCH,
                CgrfActionState.ROLLBACK_REQUIRED,
                CgrfActionState.SUPERSEDED,
            },
            CgrfActionState.WATCH: {
                CgrfActionState.VERIFIED,
                CgrfActionState.ROLLBACK_REQUIRED,
                CgrfActionState.FAILED_CLOSED,
                CgrfActionState.SUPERSEDED,
            },
            CgrfActionState.ROLLBACK_REQUIRED: {
                CgrfActionState.ROLLED_BACK,
                CgrfActionState.FAILED_CLOSED,
            },
            CgrfActionState.ROLLED_BACK: {CgrfActionState.SUPERSEDED},
            CgrfActionState.FAILED_CLOSED: {CgrfActionState.SUPERSEDED},
            CgrfActionState.SUPERSEDED: set(),
        }
    )
)

TEVV_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            TevvState.NOT_TESTED: {
                TevvState.TESTING,
                TevvState.NOT_APPLICABLE,
                TevvState.SUPERSEDED,
            },
            TevvState.TESTING: {
                TevvState.PASS,
                TevvState.FAIL,
                TevvState.HOLD,
                TevvState.WATCH,
            },
            TevvState.PASS: {TevvState.TESTING, TevvState.WATCH, TevvState.SUPERSEDED},
            TevvState.FAIL: {TevvState.TESTING, TevvState.HOLD, TevvState.SUPERSEDED},
            TevvState.HOLD: {TevvState.TESTING, TevvState.SUPERSEDED},
            TevvState.WATCH: {
                TevvState.TESTING,
                TevvState.PASS,
                TevvState.FAIL,
                TevvState.HOLD,
                TevvState.SUPERSEDED,
            },
            TevvState.NOT_APPLICABLE: {TevvState.SUPERSEDED},
            TevvState.SUPERSEDED: set(),
        }
    )
)

SEMANTIC_TRANSACTION_TRANSITIONS: Final[
    Mapping[TransitionState, frozenset[TransitionState]]
] = _freeze_transitions(
    {
        SemanticTransactionState.DRAFT: {
            SemanticTransactionState.PARSED,
            SemanticTransactionState.REJECTED,
            SemanticTransactionState.SUPERSEDED,
        },
        SemanticTransactionState.PARSED: {
            SemanticTransactionState.SHACL_VALIDATED,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.SHACL_VALIDATED: {
            SemanticTransactionState.EVIDENCE_BOUND,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.EVIDENCE_BOUND: {
            SemanticTransactionState.POLICY_EVALUATED,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.POLICY_EVALUATED: {
            SemanticTransactionState.AUTHORIZED,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.AUTHORIZED: {
            SemanticTransactionState.EXECUTING,
            SemanticTransactionState.REJECTED,
            SemanticTransactionState.SUPERSEDED,
        },
        SemanticTransactionState.EXECUTING: {
            SemanticTransactionState.MUTATED_UNVERIFIED,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.MUTATED_UNVERIFIED: {
            SemanticTransactionState.VERIFYING,
            SemanticTransactionState.WATCH,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.VERIFYING: {
            SemanticTransactionState.VERIFIED,
            SemanticTransactionState.WATCH,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.REJECTED,
        },
        SemanticTransactionState.VERIFIED: {
            SemanticTransactionState.CANONICALIZED,
            SemanticTransactionState.WATCH,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.SUPERSEDED,
        },
        SemanticTransactionState.CANONICALIZED: {
            SemanticTransactionState.WATCH,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.SUPERSEDED,
        },
        SemanticTransactionState.WATCH: {
            SemanticTransactionState.VERIFYING,
            SemanticTransactionState.VERIFIED,
            SemanticTransactionState.ROLLED_BACK,
            SemanticTransactionState.REJECTED,
            SemanticTransactionState.SUPERSEDED,
        },
        SemanticTransactionState.ROLLED_BACK: {SemanticTransactionState.SUPERSEDED},
        SemanticTransactionState.REJECTED: {SemanticTransactionState.SUPERSEDED},
        SemanticTransactionState.SUPERSEDED: set(),
    }
)

CAUSAL_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            CausalState.TEMPORAL_ONLY: {
                CausalState.CORRELATED,
                CausalState.REFUTED_CAUSE,
                CausalState.UNDECIDABLE,
            },
            CausalState.CORRELATED: {
                CausalState.CANDIDATE_CAUSE,
                CausalState.REFUTED_CAUSE,
                CausalState.UNDECIDABLE,
            },
            CausalState.CANDIDATE_CAUSE: {
                CausalState.HYPOTHESIZED_CAUSE,
                CausalState.REFUTED_CAUSE,
                CausalState.UNDECIDABLE,
            },
            CausalState.HYPOTHESIZED_CAUSE: {
                CausalState.EXPERIMENTALLY_SUPPORTED,
                CausalState.REFUTED_CAUSE,
                CausalState.UNDECIDABLE,
            },
            CausalState.EXPERIMENTALLY_SUPPORTED: {
                CausalState.VERIFIED_CAUSE,
                CausalState.REFUTED_CAUSE,
                CausalState.UNDECIDABLE,
            },
            CausalState.VERIFIED_CAUSE: {CausalState.REFUTED_CAUSE},
            CausalState.REFUTED_CAUSE: set(),
            CausalState.UNDECIDABLE: set(),
        }
    )
)

CORPUS_USE_TRANSITIONS: Final[Mapping[TransitionState, frozenset[TransitionState]]] = (
    _freeze_transitions(
        {
            CorpusUseState.DISCOVERY_ONLY: {
                CorpusUseState.COMPARATIVE_OBSERVATION,
                CorpusUseState.REJECTED_FOR_CITADEL,
            },
            CorpusUseState.COMPARATIVE_OBSERVATION: {
                CorpusUseState.PATTERN_CANDIDATE,
                CorpusUseState.REJECTED_FOR_CITADEL,
            },
            CorpusUseState.PATTERN_CANDIDATE: {
                CorpusUseState.CITADEL_HYPOTHESIS,
                CorpusUseState.REJECTED_FOR_CITADEL,
            },
            CorpusUseState.CITADEL_HYPOTHESIS: {
                CorpusUseState.TESTED_IN_CITADEL,
                CorpusUseState.REJECTED_FOR_CITADEL,
            },
            CorpusUseState.TESTED_IN_CITADEL: {
                CorpusUseState.VERIFIED_FOR_CITADEL,
                CorpusUseState.REJECTED_FOR_CITADEL,
            },
            CorpusUseState.VERIFIED_FOR_CITADEL: set(),
            CorpusUseState.REJECTED_FOR_CITADEL: set(),
        }
    )
)

TRANSITION_POLICIES: Final[
    Mapping[type[Enum], Mapping[TransitionState, frozenset[TransitionState]]]
] = MappingProxyType(
    {
        EvidenceState: EVIDENCE_TRANSITIONS,
        ShaclState: SHACL_TRANSITIONS,
        MerkleState: MERKLE_TRANSITIONS,
        CgrfActionState: CGRF_ACTION_TRANSITIONS,
        TevvState: TEVV_TRANSITIONS,
        SemanticTransactionState: SEMANTIC_TRANSACTION_TRANSITIONS,
        CausalState: CAUSAL_TRANSITIONS,
        CorpusUseState: CORPUS_USE_TRANSITIONS,
    }
)

FORBIDDEN_AUTOMATIC_PROMOTIONS: Final[frozenset[tuple[str, str]]] = frozenset(
    {
        ("correlation", "causation"),
        ("chronology", "causation"),
        ("schema-valid", "true"),
        ("hash-valid", "true"),
        ("authorized", "correct"),
        ("deployed", "verified"),
    }
)


def allowed_transitions(current: TransitionState) -> frozenset[TransitionState]:
    """Return adjacency only; can_transition also checks typed prerequisites.

    Evidence and SHACL adjacency follows sections 36.2 and 25.4. Other tables
    preserve the conservative P0 progression profile; the specification does not
    define exhaustive edges for those families. Direct deterministic observation
    verification is a conditional exception, checked by require_transition.
    """
    try:
        return TRANSITION_POLICIES[type(current)][current]
    except KeyError as exc:
        raise ContractError(
            f"unsupported state type: {type(current).__name__}"
        ) from exc


def require_transition(
    current: TransitionState,
    target: TransitionState,
    *,
    subject: SubjectRef | None = None,
    proof: PromotionProof | None = None,
) -> None:
    """Require an adjacent, evidenced change for the exact subject revision."""
    try:
        require(type(current) is type(target), "state transition cannot cross axes")
        direct = current is EvidenceState.OBSERVED and target is EvidenceState.VERIFIED
        require(
            direct or target in allowed_transitions(current),
            "state edge is not allowed",
        )
        if requires_proof(target):
            require(
                type(subject) is SubjectRef and type(proof) is PromotionProof,
                "transition requires subject and typed promotion proof",
            )
        if proof is not None:
            require(
                type(proof) is PromotionProof and proof.subject == subject,
                "promotion subject/version mismatch",
            )
            proof.validate_for(current, target)
    except ContractError as exc:
        raise InvalidTransitionError(
            f"transition not allowed: {current} -> {target}: {exc}"
        ) from exc


def can_transition(
    current: TransitionState,
    target: TransitionState,
    *,
    subject: SubjectRef | None = None,
    proof: PromotionProof | None = None,
) -> bool:
    """Return whether both adjacency and required receipt contracts are satisfied."""
    try:
        require_transition(current, target, subject=subject, proof=proof)
    except InvalidTransitionError:
        return False
    return True


def can_automatically_promote(source: str, target: str) -> bool:
    """Recognize only the observation-to-inference shorthand; never grant authority.

    Unknown phrases fail closed. Actual state changes must use require_transition
    or apply_state_deltas with their typed evidence.
    """
    return (source.strip().lower(), target.strip().lower()) == ("observed", "inferred")


AXIS_STATE_TYPES: Final[Mapping[StateAxis, type[object]]] = MappingProxyType(
    {
        StateAxis.EVIDENCE: EvidenceState,
        StateAxis.SHACL: ShaclState,
        StateAxis.MERKLE: MerkleState,
        StateAxis.CGRF_ACTION: CgrfActionState,
        StateAxis.TEVV: TevvState,
        StateAxis.SEMANTIC_TRANSACTION: SemanticTransactionState,
        StateAxis.CAUSAL: CausalState,
        StateAxis.CORPUS_USE: CorpusUseState,
        StateAxis.AUTHORITY: AuthorityTier,
        StateAxis.LIFECYCLE: str,
    }
)


@dataclass(frozen=True, slots=True)
class StateDelta(Contract):
    """Describe one version-bound compare-and-set change and its prerequisite proof."""

    axis: StateAxis
    before: AxisState
    after: AxisState
    reason: str
    subject: SubjectRef
    evidence: tuple[EvidenceReference, ...]
    proof: PromotionProof | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        expected = AXIS_STATE_TYPES[self.axis]
        require(
            type(self.before) is expected and type(self.after) is expected,
            f"{self.axis.value} deltas require {expected.__name__}",
        )
        require(self.before != self.after, "state delta must change its axis value")
        text(self.reason, "state delta reason")
        validate_evidence(self.evidence, self.subject)
        if self.axis is StateAxis.LIFECYCLE:
            text(str(self.before), "lifecycle before")
            text(str(self.after), "lifecycle after")
        if self.proof is not None:
            require(
                self.proof.subject == self.subject,
                "delta proof subject/version mismatch",
            )
            require(
                self.proof.evidence == self.evidence,
                "delta proof evidence differs from delta evidence",
            )

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> Self:
        """Decode each scalar using its named axis, avoiding equal enum spellings."""
        require(isinstance(payload, Mapping), "delta must be an object")
        names = {"axis", "before", "after", "reason", "subject", "evidence", "proof"}
        require(
            not payload.keys() - names and names - {"proof"} <= payload.keys(),
            "unknown or missing delta fields",
        )
        require(type(payload["axis"]) is str, "delta axis must be a wire string")
        try:
            axis = StateAxis(payload["axis"])
        except ValueError as exc:
            raise ContractError("unknown delta axis") from exc
        enum_type = AXIS_STATE_TYPES[axis]
        require(
            type(payload["before"]) is str and type(payload["after"]) is str,
            "delta states must be wire strings",
        )
        try:
            before = (
                payload["before"]
                if enum_type is str
                else cast(type[Enum], enum_type)(payload["before"])
            )
            after = (
                payload["after"]
                if enum_type is str
                else cast(type[Enum], enum_type)(payload["after"])
            )
        except ValueError as exc:
            raise ContractError("invalid state for delta axis") from exc
        subject = SubjectRef.from_dict(cast(Mapping[str, object], payload["subject"]))
        raw_evidence = payload["evidence"]
        require(
            isinstance(raw_evidence, (tuple, list)), "delta evidence must be an array"
        )
        evidence = tuple(
            EvidenceReference.from_dict(item)
            for item in cast(list[Mapping[str, object]], raw_evidence)
        )
        proof = (
            None
            if payload.get("proof") is None
            else PromotionProof.from_dict(cast(Mapping[str, object], payload["proof"]))
        )
        return cls(
            axis,
            cast(AxisState, before),
            cast(AxisState, after),
            cast(str, payload["reason"]),
            subject,
            evidence,
            proof,
        )

    @classmethod
    def json_schema(cls) -> dict[str, Any]:
        """Constrain the before/after wire enum to the chosen axis."""
        schema = super(StateDelta, cls).json_schema()
        definition = schema["$defs"][cls.__name__]
        definition["allOf"] = [
            {
                "if": {"properties": {"axis": {"const": axis.value}}},
                "then": {
                    "properties": {
                        field: (
                            {"type": "string", "minLength": 1}
                            if axis is StateAxis.LIFECYCLE
                            else {
                                "enum": [v.value for v in cast(type[Enum], enum_type)]
                            }
                        )
                        for field in ("before", "after")
                    }
                },
            }
            for axis, enum_type in AXIS_STATE_TYPES.items()
        ]
        return schema


def apply_state_deltas(
    current: ObjectState,
    deltas: Iterable[StateDelta],
    *,
    subject: SubjectRef,
) -> ObjectState:
    """Return a new state only after every scoped delta and final invariant passes.

    This is an in-memory, all-or-nothing validation operation. It does not lock
    storage, write a graph, authenticate receipts, or confer execution authority.
    Authority and open lifecycle axes have no automatic P0 transition policy.
    """
    require(
        type(current) is ObjectState and type(subject) is SubjectRef,
        "state and subject contracts are required",
    )
    requested = tuple(deltas)
    require(bool(requested), "at least one state delta is required")
    require(
        all(type(delta) is StateDelta for delta in requested),
        "expected StateDelta contracts",
    )
    axes = tuple(delta.axis for delta in requested)
    if len(axes) != len(set(axes)):
        raise InvalidTransitionError("a state change set may modify each axis once")
    _check_receipt_identity(requested)
    updates: dict[str, Any] = {}
    for delta in requested:
        if delta.subject != subject:
            raise InvalidTransitionError("state delta subject/version mismatch")
        actual = current.axis_value(delta.axis)
        if actual != delta.before or type(actual) is not type(delta.before):
            raise InvalidTransitionError(f"stale state delta for {delta.axis.value}")
        if delta.axis in {StateAxis.AUTHORITY, StateAxis.LIFECYCLE}:
            raise InvalidTransitionError(
                f"{delta.axis.value} has no automatic Phase 0 transition policy"
            )
        require_transition(
            cast(TransitionState, delta.before),
            cast(TransitionState, delta.after),
            subject=subject,
            proof=delta.proof,
        )
        updates[delta.axis.value] = delta.after
    try:
        return replace(current, **updates)
    except ContractError as exc:
        raise InvalidTransitionError(f"inconsistent final state: {exc}") from exc


def _check_receipt_identity(deltas: tuple[StateDelta, ...]) -> None:
    """Reject conflicting records under one receipt ID while allowing distinct tests."""
    seen: dict[str, Contract] = {}
    visited: set[int] = set()

    def visit(value: object) -> None:
        if isinstance(value, tuple):
            for child in value:
                visit(child)
        elif isinstance(value, Contract) and id(value) not in visited:
            visited.add(id(value))
            for name in (
                "receipt_id",
                "result_id",
                "decision_id",
                "validation_id",
                "evidence_id",
                "grant_id",
                "attestation_id",
            ):
                identifier = getattr(value, name, None)
                if identifier is not None:
                    key = str(identifier)
                    if key in seen and seen[key] != value:
                        raise InvalidTransitionError(f"conflicting records for {key}")
                    seen[key] = value
                    break
            for field in fields(value):  # type: ignore[arg-type]
                visit(getattr(value, field.name))

    visit(deltas)
