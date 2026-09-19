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
# Depends:     libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/semantic_twin/vocabulary.py; VALIDATES libs/semantic_twin/models.py
# DAG Node:    semantic-twin.phase-0.transitions
# Intent:      Make lifecycle gates executable while preventing unsupported evidence, causality and success shortcuts.
# ───────────────────────────────────────────────────────────

"""Enforce the Phase 0 state progressions and forbidden shortcuts."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType
from typing import Final, Iterable, Mapping, TypeAlias, cast

from .models import AxisState, ObjectState

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


class InvalidTransitionError(ValueError):
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


def allowed_transitions(
    current: TransitionState,
    *,
    direct_deterministic_verifier: bool = False,
) -> frozenset[TransitionState]:
    """Return the next states permitted by the frozen Phase 0 policy.

    The specification permits ``OBSERVED -> VERIFIED`` only when a policy-defined
    direct deterministic verifier has sufficient evidence. The opt-in flag makes
    that exceptional proof obligation explicit at the call site.
    """

    try:
        targets = TRANSITION_POLICIES[type(current)][current]
    except KeyError as exc:
        raise TypeError(f"unsupported state type: {type(current).__name__}") from exc
    if direct_deterministic_verifier and current is EvidenceState.OBSERVED:
        return targets | {EvidenceState.VERIFIED}
    return targets


def can_transition(
    current: TransitionState,
    target: TransitionState,
    *,
    direct_deterministic_verifier: bool = False,
) -> bool:
    """Return whether a target is an allowed immediate next state."""

    if type(current) is not type(target):
        return False
    return target in allowed_transitions(
        current,
        direct_deterministic_verifier=direct_deterministic_verifier,
    )


def require_transition(
    current: TransitionState,
    target: TransitionState,
    *,
    direct_deterministic_verifier: bool = False,
) -> None:
    """Raise when an immediate transition is not allowed."""

    if not can_transition(
        current,
        target,
        direct_deterministic_verifier=direct_deterministic_verifier,
    ):
        raise InvalidTransitionError(f"transition not allowed: {current} -> {target}")


def can_automatically_promote(source: str, target: str) -> bool:
    """Reject the specification's six forbidden automatic promotions."""

    return (source.strip().lower(), target.strip().lower()) not in (
        FORBIDDEN_AUTOMATIC_PROMOTIONS
    )


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
class StateDelta:
    """Describe one evidenced compare-and-set change on a named state axis."""

    axis: StateAxis
    before: AxisState
    after: AxisState
    reason: str
    evidence: tuple[str, ...]

    def __post_init__(self) -> None:
        """Require axis-safe values and replayable evidence."""

        if not isinstance(self.axis, StateAxis):
            raise TypeError("state delta axis must be StateAxis")
        expected_type = AXIS_STATE_TYPES[self.axis]
        values = (self.before, self.after)
        if self.axis is StateAxis.LIFECYCLE:
            valid_types = all(type(value) is str for value in values)
        else:
            valid_types = all(isinstance(value, expected_type) for value in values)
        if not valid_types:
            raise TypeError(
                f"{self.axis.value} deltas require {expected_type.__name__} values"
            )
        if self.before == self.after:
            raise ValueError("state delta must change its axis value")
        if not isinstance(self.reason, str) or not self.reason.strip():
            raise ValueError("state delta reason must be a non-empty string")
        if not self.evidence or any(
            not isinstance(item, str) or not item.strip() for item in self.evidence
        ):
            raise ValueError("state delta requires non-empty evidence references")

    def to_dict(self) -> dict[str, object]:
        """Render a replayable wire representation of the delta."""

        return {
            "axis": self.axis.value,
            "before": str(self.before),
            "after": str(self.after),
            "reason": self.reason,
            "evidence": list(self.evidence),
        }


def apply_state_deltas(
    current: ObjectState,
    deltas: Iterable[StateDelta],
    *,
    direct_deterministic_verifier: bool = False,
) -> ObjectState:
    """Validate and atomically apply independent changes across the state vector.

    Every delta is compare-and-set against ``current``. All scalar transitions and
    the final cross-axis state are validated before a new immutable vector is
    returned. Authority and open lifecycle changes remain outside this automatic
    operation because Phase 0 defines no safe transition policy for either axis.
    """

    requested = tuple(deltas)
    if not requested:
        raise ValueError("at least one state delta is required")
    axes = tuple(delta.axis for delta in requested)
    if len(axes) != len(set(axes)):
        raise InvalidTransitionError("a state change set may modify each axis once")

    updates: dict[str, object] = {}
    for delta in requested:
        actual = current.axis_value(delta.axis)
        if actual != delta.before or type(actual) is not type(delta.before):
            raise InvalidTransitionError(
                f"stale state delta for {delta.axis.value}: "
                f"expected {delta.before}, found {actual}"
            )
        if delta.axis in {StateAxis.AUTHORITY, StateAxis.LIFECYCLE}:
            raise InvalidTransitionError(
                f"{delta.axis.value} has no automatic Phase 0 transition policy"
            )
        before = cast(TransitionState, delta.before)
        after = cast(TransitionState, delta.after)
        require_transition(
            before,
            after,
            direct_deterministic_verifier=direct_deterministic_verifier,
        )
        updates[delta.axis.value] = delta.after

    try:
        return ObjectState(
            evidence_state=cast(
                EvidenceState,
                updates.get(StateAxis.EVIDENCE.value, current.evidence_state),
            ),
            shacl_state=cast(
                ShaclState,
                updates.get(StateAxis.SHACL.value, current.shacl_state),
            ),
            merkle_state=cast(
                MerkleState,
                updates.get(StateAxis.MERKLE.value, current.merkle_state),
            ),
            cgrf_action_state=cast(
                CgrfActionState,
                updates.get(
                    StateAxis.CGRF_ACTION.value,
                    current.cgrf_action_state,
                ),
            ),
            tevv_state=cast(
                TevvState,
                updates.get(StateAxis.TEVV.value, current.tevv_state),
            ),
            semantic_transaction_state=cast(
                SemanticTransactionState,
                updates.get(
                    StateAxis.SEMANTIC_TRANSACTION.value,
                    current.semantic_transaction_state,
                ),
            ),
            causal_state=cast(
                CausalState,
                updates.get(StateAxis.CAUSAL.value, current.causal_state),
            ),
            corpus_use_state=cast(
                CorpusUseState,
                updates.get(StateAxis.CORPUS_USE.value, current.corpus_use_state),
            ),
            authority_tier=current.authority_tier,
            lifecycle_state=current.lifecycle_state,
        )
    except ValueError as exc:
        raise InvalidTransitionError(f"inconsistent final state: {exc}") from exc
