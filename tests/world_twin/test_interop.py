# --- CGRF Header ------------------------------------------------
# File:        tests/world_twin/test_interop.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, apps/world_twin/episode.py, apps/world_twin/projection.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/world_twin/events.py; VALIDATES apps/world_twin/episode.py; VALIDATES apps/world_twin/projection.py; CONSUMES tests/upgrade/test_evolution_support.py
# DAG Node:    none
# Intent:      Challenge world-event identity, lineage, privacy and receiving-pinned review boundaries with explicitly synthetic evidence.
# ----------------------------------------------------------------

"""Exercise synthetic interoperability controls, never live or deployment evidence."""

from __future__ import annotations

import hashlib
import json
import unittest
from collections.abc import Mapping
from dataclasses import FrozenInstanceError, replace
from datetime import datetime, timedelta, timezone
from itertools import permutations
from typing import cast
from unittest.mock import patch

from apps.world_twin.episode import WorldEpisode, review_states, world_episodes
from apps.world_twin.events import (
    LAYERS,
    Layer,
    TraceReference,
    WorldEvent,
    world_events,
)
from apps.world_twin.projection import ProjectionScope, compile_projection
from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest, identity, json_value
from libs.evolution.event import CitadelEvent, Phase, SourceKind
from libs.semantic_twin.contracts import Contract, ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.ingestion.graph import SemanticGraph
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.models import CanonicalObjectEnvelope
from libs.semantic_twin.receipts import ActorType, VerificationReceipt
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    EvidenceState,
    MerkleState,
    RelationPredicate,
    TevvState,
)
from tests.upgrade.test_evolution_support import verification

NOW = datetime(2026, 9, 23, tzinfo=timezone.utc)
TENANT = "synthetic-world-tenant"
HUMAN = SemanticId("cni://person/synthetic-world-learner")
AGENT = SemanticId("cni://agent/synthetic-world-agent")
PEER = SemanticId("cni://person/synthetic-hidden-peer")
GUILD = SemanticId("cni://guild/synthetic-world-guild")
PROJECT = SemanticId("cni://resource/synthetic-world-project")
GUILDMASTER = SemanticId("cni://guildmaster/synthetic-world-guide")
CAPABILITY = SemanticId("cni://capability/synthetic-world-build")
REVIEWER = SemanticId("cni://verifier/synthetic-independent-reviewer")
TRACE = TraceReference(
    "browser",
    "synthetic-vendor",
    "synthetic:opaque-capture",
    "synthetic-shared-vendor-trace",
    "synthetic-hidden-span",
    ContentDigest(digest("synthetic trace bytes")),
)


def at(second: int) -> datetime:
    """Offset a fixed synthetic clock without reading wall time."""
    return NOW + timedelta(seconds=second)


def event(
    key: str = "result",
    *,
    second: int = 10,
    phase: Phase = Phase.RESULT,
    actor: SemanticId = HUMAN,
    authority: AuthorityTier = AuthorityTier.A1,
    inputs: tuple[str, ...] = (),
    data: Mapping[str, object] | None = None,
    **changes: object,
) -> WorldEvent:
    """Wrap a typed synthetic observation; no supplied field authenticates it."""
    observation = CitadelEvent(
        scope_id=TENANT,
        occurred_at=at(second),
        observed_at=at(second),
        ingested_at=at(second),
        mission_id="synthetic-world-mission",
        correlation_id="synthetic-world-correlation",
        actor_id=actor,
        event_type="BUILD",
        subject_id=PROJECT,
        subject_version="synthetic-v1",
        source_sha="a" * 40,
        source_kind=SourceKind.TEST,
        source_ref=f"synthetic:world/{key}",
        source_digest=ContentDigest(digest(("synthetic source bytes", key))),
        evidence_state=EvidenceState.OBSERVED,
        authority=authority,
        risk="synthetic-source-test-only",
        phase=phase,
        inputs=inputs,
        data={"synthetic": True, **(data or {})},
    )
    value = WorldEvent(
        schema_version="buildanddo.world-event/v1",
        tenant_id=TENANT,
        observation=observation,
        actor_kind=ActorType.AGENT if actor == AGENT else ActorType.HUMAN,
        context_id="synthetic-world-context",
        outcome="SUCCESS" if phase is Phase.RESULT else "NONE",
        guild_id=GUILD,
        project_id=PROJECT,
        guildmaster_id=GUILDMASTER,
        release_sha="a" * 40,
        capabilities=(CAPABILITY,),
        traces=(TRACE,),
    )
    return WorldEvent.from_dict({**value.to_dict(), "event_id": "", **obj(json_value(changes))})


def scope(events: tuple[WorldEvent, ...], **changes: object) -> ProjectionScope:
    """Supply an explicit synthetic receiver grant, not a grant read from events."""
    value = ProjectionScope(
        tenant_id=TENANT,
        subject_id=SemanticId("cni://tenant/synthetic-world-tenant"),
        view="community",
        as_of=at(120),
        allowed_event_ids=tuple(sorted({SemanticId(e.event_id) for e in events})),
    )
    return ProjectionScope.from_dict({**value.to_dict(), **obj(json_value(changes))})


def review(
    value: WorldEvent,
    *,
    second: int = 30,
    state: TevvState = TevvState.PASS,
    reviewer: SemanticId = REVIEWER,
    actor: SemanticId | None = None,
    checks: tuple[str, ...] | None = None,
    sources: tuple[str, ...] | None = None,
) -> VerificationReceipt:
    """Reuse the existing synthetic receipt pattern for an exact world revision."""
    receipt = verification(
        value.review_subject,
        (value.observation.event_id,) if sources is None else sources,
        when=at(second),
        state=state,
        checks=("world.provenance", "world.outcome", "world.attribution", "world.capability")
        if checks is None
        else checks,
        actor=value.observation.actor_id if actor is None else actor,
        tier=AuthorityTier.A0,
    )
    return replace(
        receipt,
        receipt_id=identity("receipt", ("synthetic world review", value.review_subject, reviewer, state)),
        result=replace(receipt.result, verifier_id=reviewer),
    )


def pins(*receipts: VerificationReceipt, **changes: object) -> ReviewPolicy:
    """Simulate receiving-owner pins only inside this explicitly synthetic harness."""
    value = ReviewPolicy(
        SemanticId("cni://policy/fixture"),
        "fixture/1",
        tuple(sorted({r.result.verifier_id for r in receipts})) or (REVIEWER,),
        tuple(ContentDigest(value) for value in sorted({digest(r) for r in receipts})),
    )
    return ReviewPolicy.from_dict({**value.to_dict(), **obj(json_value(changes))})


def history() -> tuple[WorldEvent, ...]:
    """Retain a synthetic failed attempt before a successful, explicitly linked retry."""
    values = [
        event("problem", phase=Phase.PROBLEM, second=0),
        event("context", phase=Phase.CONTEXT, second=1),
        event("hypothesis", phase=Phase.HYPOTHESIS, second=2),
    ]
    for index, status in enumerate(("FAIL", "PASS")):
        attempt = f"synthetic-attempt-{index}"
        start = 3 + index * 3
        action = event(attempt + "-action", phase=Phase.ACTION, second=start, data={"attempt_id": attempt})
        result = event(
            attempt + "-result",
            second=start + 1,
            inputs=(action.observation.event_id,),
            data={"attempt_id": attempt, "status": status},
            outcome="FAILURE" if status == "FAIL" else "SUCCESS",
        )
        verification_event = event(
            attempt + "-review",
            phase=Phase.VERIFICATION,
            second=start + 2,
            inputs=(result.observation.event_id,),
            data={"attempt_id": attempt},
        )
        values.extend((action, result, verification_event))
    return tuple(values)


def obj(value: object) -> dict[str, object]:
    """Narrow an actual output object without weakening its runtime assertions."""
    assert isinstance(value, dict)
    return cast(dict[str, object], value)


def rows(value: object) -> list[dict[str, object]]:
    """Narrow an actual output array of objects."""
    assert isinstance(value, list)
    return [obj(row) for row in value]


class WorldContractTests(unittest.TestCase):
    def test_round_trip_and_closed_schema_for_every_new_contract(self) -> None:
        value = event()
        models: tuple[Contract, ...] = (TRACE, value, WorldEpisode((value,)), scope((value,)))
        for model in models:
            with self.subTest(contract=type(model).__name__):
                restored = type(model).from_json(model.to_json())
                self.assertEqual(restored, model)
                self.assertEqual(restored.to_json(), model.to_json())
                schema = type(model).json_schema()
                self.assertFalse(schema["$defs"][type(model).__name__]["additionalProperties"])
                with self.assertRaisesRegex(ContractError, "unknown fields"):
                    type(model).from_dict({**model.to_dict(), "untrusted_extension": True})
        self.assertEqual(value.schema_version, "buildanddo.world-event/v1")
        self.assertEqual(value.review_subject.semantic_id, SemanticId(value.event_id))
        self.assertEqual(value.review_subject.version, digest(value.stable_body))

    def test_deep_immutability_and_detached_wire_bodies(self) -> None:
        nested: dict[str, object] = {"labels": ["synthetic-original"]}
        value = event(data={"nested": nested})
        frozen = value.to_json()
        nested["labels"] = ["synthetic-mutated"]
        wire = value.to_dict()
        wire["observation"]["data"]["nested"]["labels"].append("wire mutation")
        body = value.stable_body
        obj(obj(body["observation"])["data"])["synthetic"] = False
        with self.assertRaises(TypeError):
            cast(dict[str, object], value.observation.data)["synthetic"] = False
        with self.assertRaises(TypeError):
            cast(dict[str, object], value.observation.data["nested"])["labels"] = ()
        for model, field in ((value, "tenant_id"), (value.observation, "source_ref"), (TRACE, "reference")):
            with self.subTest(model=type(model).__name__), self.assertRaises(FrozenInstanceError):
                setattr(model, field, "synthetic-mutated")
        self.assertEqual(value.to_json(), frozen)
        self.assertIsInstance(value.observation.data["nested"], Mapping)
        self.assertIsInstance(cast(Mapping[str, object], value.observation.data["nested"])["labels"], tuple)

    def test_duplicate_json_keys_and_nonfinite_numbers_are_rejected(self) -> None:
        value = event(data={"marker": 0})
        models: tuple[Contract, ...] = (TRACE, value, WorldEpisode((value,)), scope((value,)))
        for model in models:
            first, content = next(iter(model.to_dict().items()))
            duplicate = "{" + json.dumps(first) + ":" + json.dumps(content) + "," + model.to_json()[1:]
            with self.subTest(contract=type(model).__name__), self.assertRaisesRegex(ContractError, "duplicate JSON key"):
                type(model).from_json(duplicate)
        nested_duplicate = value.to_json().replace('"marker":0', '"marker":0,"marker":1')
        with self.assertRaisesRegex(ContractError, "duplicate JSON key"):
            WorldEvent.from_json(nested_duplicate)
        for token in ("NaN", "Infinity", "-Infinity", "1e999"):
            with self.subTest(token=token), self.assertRaises(ContractError):
                WorldEvent.from_json(value.to_json().replace('"marker":0', '"marker":' + token))
        for number in (float("nan"), float("inf"), -float("inf")):
            with self.subTest(number=number), self.assertRaises(ContractError):
                event(data={"nested": [number]})

    def test_world_schema_rejects_unknown_fields_versions_and_boolean_coercion(self) -> None:
        value = event()
        bad: tuple[tuple[str, object], ...] = (
            ("schema_version", "2"), ("schema_version", 1), ("schema_version", True),
            ("tenant_id", True), ("actor_kind", True), ("actor_kind", "verifier"),
            ("outcome", True), ("outcome", "VERIFIED"), ("visibility", "public"),
            ("context_id", "bad scope/with/slashes"), ("release_sha", "a" * 39),
            ("capabilities", [str(HUMAN)]), ("participants", [True]),
            ("guild_id", str(PROJECT)), ("project_id", str(GUILD)),
            ("guildmaster_id", str(HUMAN)), ("event_id", False),
        )
        for field, invalid in bad:
            with self.subTest(field=field, invalid=invalid), self.assertRaises(ContractError):
                WorldEvent.from_dict({**value.to_dict(), "event_id": "", field: invalid})
        for location in ("observation", "trace"):
            wire = value.to_dict()
            target = wire["observation"] if location == "observation" else wire["traces"][0]
            target["unrecognized"] = "synthetic"
            with self.subTest(location=location), self.assertRaisesRegex(ContractError, "unknown fields"):
                WorldEvent.from_dict(wire)
        for field in ("observation", "tenant_id", "actor_kind", "context_id", "outcome"):
            wire = value.to_dict()
            del wire[field]
            with self.subTest(missing=field), self.assertRaisesRegex(ContractError, "missing field"):
                WorldEvent.from_dict(wire)
        unversioned = value.to_dict()
        del unversioned["schema_version"]
        with self.assertRaisesRegex(ContractError, "missing field: schema_version"):
            WorldEvent.from_dict(unversioned)
        with self.assertRaisesRegex(ContractError, "namespace"):
            replace(value, actor_kind=ActorType.AGENT, event_id="")

    def test_trace_handles_are_strict_opaque_references(self) -> None:
        bad: tuple[tuple[str, object], ...] = (
            ("layer", "unknown"), ("provider", "Vendor Name"), ("provider", True),
            ("reference", "synthetic:capture?query=1"), ("reference", "synthetic:capture#fragment"),
            ("reference", "synthetic://user@host/capture"), ("reference", "synthetic capture"),
            ("trace_id", "trace/id"), ("span_id", "span id"),
            ("trace_id", None), ("content_digest", {"value": "z" * 64, "algorithm": "sha256"}),
        )
        for field, invalid in bad:
            with self.subTest(field=field, invalid=invalid), self.assertRaises(ContractError):
                TraceReference.from_dict({**TRACE.to_dict(), field: invalid})
        self.assertEqual(TraceReference("edge", "synthetic", "synthetic:edge").trace_id, None)

    def test_scope_rejects_missing_grants_bad_identity_and_non_boolean_consent(self) -> None:
        value = scope((event(),))
        for field, invalid in (
            ("tenant_id", " "), ("view", "all"), ("subject_id", str(HUMAN)),
            ("allowed_event_ids", [str(HUMAN)]), ("allowed_event_ids", [True]),
            ("allowed_event_ids", [event().event_id] * 2),
            ("share_profile", 1), ("share_profile", "true"), ("adult_confirmed", 1),
            ("audience", "everyone"), ("shared_entity_ids", [str(HUMAN)] * 2),
        ):
            with self.subTest(field=field, invalid=invalid), self.assertRaises(ContractError):
                ProjectionScope.from_dict({**value.to_dict(), field: invalid})
        wire = value.to_dict()
        del wire["allowed_event_ids"]
        with self.assertRaisesRegex(ContractError, "missing field"):
            ProjectionScope.from_dict(wire)

    def test_naive_times_and_temporal_reversal_are_rejected(self) -> None:
        value = event()
        for field in ("occurred_at", "observed_at", "ingested_at"):
            wire = value.to_dict()
            wire["observation"][field] = "2026-09-23T00:00:10"
            with self.subTest(field=field), self.assertRaisesRegex(ContractError, "timezone-aware"):
                WorldEvent.from_dict(wire)
        with self.assertRaises(ContractError):
            replace(scope((value,)), as_of=NOW.replace(tzinfo=None))
        for occurred, observed, ingested in ((11, 10, 10), (10, 11, 10), (10, 10, 9)):
            with self.subTest(times=(occurred, observed, ingested)), self.assertRaisesRegex(ContractError, "timestamps"):
                replace(value.observation, event_id="", occurred_at=at(occurred),
                        observed_at=at(observed), ingested_at=at(ingested))

    def test_ids_cannot_be_reused_after_tampering(self) -> None:
        value = event()
        for change in ({"outcome": "FAILURE"}, {"context_id": "synthetic-other-context"}, {"event_id": "cni://event/forged"}):
            with self.subTest(change=change), self.assertRaisesRegex(ContractError, "content/id mismatch"):
                WorldEvent.from_dict({**value.to_dict(), **change})
        with self.assertRaisesRegex(ContractError, "content/id mismatch"):
            replace(value.observation, source_digest=ContentDigest("b" * 64))
        with self.assertRaisesRegex(ContractError, "tenant mismatch"):
            replace(value, tenant_id="synthetic-foreign-tenant", event_id="")

    def test_inventory_order_is_canonical_but_duplicates_and_excess_are_not(self) -> None:
        extra = TraceReference("application", "synthetic", "synthetic:application")
        other_capability = SemanticId("cni://capability/synthetic-other")
        value = event(traces=(TRACE, extra), participants=(PEER, AGENT), capabilities=(CAPABILITY, other_capability))
        reordered = replace(value, traces=tuple(reversed(value.traces)), participants=tuple(reversed(value.participants)),
                            capabilities=tuple(reversed(value.capabilities)))
        self.assertEqual(reordered, value)
        for change in (
            {"traces": (TRACE, TRACE)}, {"participants": (PEER, PEER)}, {"capabilities": (CAPABILITY, CAPABILITY)},
            {"participants": tuple(SemanticId(f"cni://person/synthetic-{i}") for i in range(33))},
        ):
            with self.subTest(change=change), self.assertRaisesRegex(ContractError, "duplicate or excessive"):
                WorldEvent.from_dict({**value.to_dict(), "event_id": "", **obj(json_value(change))})
        with self.assertRaisesRegex(ContractError, "metadata limit"):
            event(data={"synthetic_padding": "x" * 65536})


class WorldIngestionTests(unittest.TestCase):
    def test_ingestion_retry_keeps_identity_review_binding_and_projection(self) -> None:
        original = event()
        retry = replace(original, observation=replace(original.observation, ingested_at=at(900)))
        self.assertEqual(original.event_id, retry.event_id)
        self.assertEqual(original.observation.event_id, retry.observation.event_id)
        self.assertEqual(original.review_subject, retry.review_subject)
        for values in ((retry, original, retry), (original, retry), (retry,)):
            with self.subTest(ingestions=[e.observation.ingested_at for e in values]):
                self.assertEqual(len(world_events(values, TENANT, at(120))), 1)
                self.assertEqual(compile_projection(values, scope((original,))), compile_projection((original,), scope((original,))))
        self.assertEqual(world_events((retry, original), TENANT, at(120)), (original,))

    def test_conflicting_source_revision_is_not_silently_deduplicated(self) -> None:
        original = event()
        conflicts = (
            replace(original, event_id="", outcome="FAILURE"),
            replace(original, event_id="", participants=(PEER,)),
            replace(original, event_id="", observation=replace(original.observation, event_id="", source_digest=ContentDigest("b" * 64))),
        )
        for conflict in conflicts:
            for values in ((original, conflict), (conflict, original)):
                with self.subTest(conflict=conflict.event_id), self.assertRaisesRegex(ContractError, "conflicting observations"):
                    world_events(values, TENANT, at(120))
        revision = replace(original, event_id="", observation=replace(original.observation, event_id="", subject_version="synthetic-v2"))
        self.assertEqual(len(world_events((original, revision), TENANT, at(120))), 2)

    def test_cutoff_uses_source_observation_not_occurrence_or_ingestion(self) -> None:
        observed = event()
        future = replace(observed, event_id="", observation=replace(observed.observation, event_id="", observed_at=at(121), ingested_at=at(122)))
        self.assertEqual(world_events((future, observed), TENANT, at(120)), (observed,))
        self.assertEqual(world_events((observed,), TENANT, at(10)), (observed,))
        self.assertEqual(world_events((observed,), TENANT, at(9)), ())
        output = compile_projection((future, observed), scope((future, observed)))
        self.assertEqual(output["events"], [observed.event_id])
        self.assertNotIn(future.event_id, json.dumps(output))
        with self.assertRaisesRegex(ContractError, "cutoff requires timezone"):
            world_events((observed,), TENANT, NOW.replace(tzinfo=None))

    def test_foreign_legacy_and_oversized_captures_fail_closed(self) -> None:
        value = event()
        foreign = replace(value, tenant_id="synthetic-foreign", event_id="", observation=replace(value.observation, scope_id="synthetic-foreign", event_id=""))
        for values in ((foreign,), (value, foreign)):
            with self.subTest(count=len(values)), self.assertRaisesRegex(ContractError, "foreign tenant"):
                compile_projection(values, scope((value,)))
        with self.assertRaisesRegex(ContractError, "legacy claims"):
            world_events(cast(tuple[WorldEvent, ...], ({"event_id": "legacy-claim"},)), TENANT, at(120))
        with self.assertRaisesRegex(ContractError, "event limit"):
            world_events((value,) * 2001, TENANT, at(120))


class WorldEpisodeTests(unittest.TestCase):
    def test_identical_vendor_trace_never_merges_scope_boundaries(self) -> None:
        base = event()
        foreign = replace(base, tenant_id="synthetic-foreign", event_id="", observation=replace(base.observation, scope_id="synthetic-foreign", event_id=""))
        other_mission = replace(base, event_id="", observation=replace(base.observation, mission_id="synthetic-other-mission", event_id=""))
        other_correlation = replace(base, event_id="", observation=replace(base.observation, correlation_id="synthetic-other-correlation", event_id=""))
        other_release = replace(base, release_sha="b" * 40, event_id="")
        values = (base, foreign, other_mission, other_correlation, other_release)
        self.assertEqual({e.traces[0].trace_id for e in values}, {TRACE.trace_id})
        episodes = world_episodes(values)
        self.assertEqual(len(episodes), 5)
        self.assertTrue(all(len(ep.events) == 1 for ep in episodes))
        self.assertEqual(episodes, world_episodes(tuple(reversed(values))))
        for other in values[1:]:
            with self.subTest(other=other.event_id), self.assertRaisesRegex(ContractError, "mixes tenant"):
                WorldEpisode((base, other))

    def test_authority_scopes_have_distinct_lineages(self) -> None:
        values = (event("read", phase=Phase.CONTEXT, second=1, authority=AuthorityTier.A0), event("build", second=2, authority=AuthorityTier.A2))
        episode, = world_episodes(values)
        self.assertEqual([lineage.events[0].authority for lineage in episode.lineages], [AuthorityTier.A0, AuthorityTier.A2])
        action = event("action", second=3, phase=Phase.ACTION, data={"attempt_id": "synthetic-boundary"})
        result = event("result", second=4, authority=AuthorityTier.A2, inputs=(action.observation.event_id,), data={"attempt_id": "synthetic-boundary"})
        with self.assertRaisesRegex(ContractError, "unknown attempt"):
            world_episodes((action, result))

    def test_real_attempt_links_preserve_failed_history_and_partial_coverage(self) -> None:
        values = history()
        episode, = world_episodes(tuple(reversed(values)))
        attempts = episode.lineages[0].attempts
        self.assertEqual(len(attempts), 2)
        self.assertEqual([(a.action.event_id, a.result.event_id if a.result else None, a.review.event_id if a.review else None) for a in attempts],
                         [(values[i].observation.event_id, values[i + 1].observation.event_id, values[i + 2].observation.event_id) for i in (3, 6)])
        self.assertTrue(all(a.verdict is None for a in attempts))
        replay = episode.replay(review_states(values, (), None, at=at(120)), include_traces=True)
        self.assertEqual(replay["state"], "PARTIAL")
        self.assertEqual(replay["missing_layers"], ["application", "compute", "decision", "edge", "human", "infrastructure", "result", "verification"])
        self.assertEqual(replay["unresolved_inputs"], 0)
        self.assertEqual([r["recorded_outcome"] for r in rows(replay["timeline"]) if r["phase"] == "RESULT"], ["FAILURE", "SUCCESS"])
        self.assertEqual(replay["causal_state"], "TEMPORAL_ONLY")
        self.assertFalse(replay["executed"])

    def test_predecessors_must_be_actual_core_events_not_labels_or_world_ids(self) -> None:
        values = history()
        action, result, verification_event = values[3:6]
        for wrong in ((), (action.event_id,), (values[0].observation.event_id,)):
            broken = replace(result, event_id="", observation=replace(result.observation, event_id="", inputs=wrong))
            with self.subTest(predecessor=wrong), self.assertRaisesRegex(ContractError, "predecessor reference"):
                world_episodes((action, broken))
        broken_review = replace(verification_event, event_id="", observation=replace(verification_event.observation, event_id="", inputs=(action.observation.event_id,)))
        with self.assertRaisesRegex(ContractError, "predecessor reference"):
            world_episodes((action, result, broken_review))

    def test_orphan_duplicate_and_time_reversed_attempts_are_rejected(self) -> None:
        action, result, verification_event = history()[3:6]
        duplicate = replace(result, event_id="", observation=replace(result.observation, event_id="", source_ref="synthetic:duplicate-result"))
        reversed_time = replace(result, event_id="", observation=replace(result.observation, event_id="", occurred_at=at(2), observed_at=at(2)))
        for values, message in (
            ((result,), "unknown attempt"),
            ((action, verification_event), "predecessor reference"),
            ((action, result, duplicate), "duplicate phase"),
            ((action, reversed_time), "time reversal"),
            ((action, action), "duplicate world episode"),
        ):
            with self.subTest(message=message), self.assertRaisesRegex(ContractError, message):
                world_episodes(values)
        with self.assertRaisesRegex(ContractError, "needs events"):
            WorldEpisode(())
        with self.assertRaisesRegex(ContractError, "chronologically ordered"):
            WorldEpisode((result, action))

    def test_temporal_adjacency_does_not_invent_attempts_or_causation(self) -> None:
        action = event("unlinked-action", phase=Phase.ACTION, second=1)
        result = event("unlinked-result", second=2, inputs=("cni://event/synthetic-missing",))
        inferred = replace(result, event_id="", observation=replace(result.observation, event_id="", evidence_state=EvidenceState.INFERRED))
        episode, = world_episodes((action, inferred))
        self.assertEqual(episode.lineages[0].attempts, ())
        replay = episode.replay(review_states((action, inferred), (), None, at=at(120)), include_traces=False)
        self.assertEqual((replay["state"], replay["unresolved_inputs"], replay["causal_state"]), ("PARTIAL", 1, "TEMPORAL_ONLY"))
        self.assertEqual(rows(replay["timeline"])[1]["reported_evidence_state"], "INFERRED")
        self.assertTrue(all(row["traces"] == [] for row in rows(replay["timeline"])))

    def test_complete_layer_recording_is_not_verification(self) -> None:
        values = history()
        traces = tuple(TraceReference(cast(Layer, layer), "synthetic", "synthetic:" + layer) for layer in LAYERS)
        values = (replace(values[0], event_id="", traces=traces), *values[1:])
        episode, = world_episodes(values)
        standing = review_states(values, (), None, at=at(120))
        replay = episode.replay(standing, include_traces=True)
        self.assertEqual((replay["state"], replay["missing_layers"]), ("RECORDED", []))
        self.assertFalse(any(row["independently_reviewed"] for row in standing.values()))
        self.assertEqual(replay["causal_state"], "TEMPORAL_ONLY")
        without_release = tuple(replace(value, event_id="", release_sha=None) for value in values)
        missing, = world_episodes(without_release)
        self.assertEqual(missing.replay(review_states(without_release, (), None, at=at(120)), include_traces=False)["state"], "PARTIAL")


class WorldReviewTests(unittest.TestCase):
    def test_only_exact_receiving_pins_support_an_observed_result(self) -> None:
        value = event()
        receipt = review(value)
        self.assertEqual(VerificationReceipt.from_json(receipt.to_json()), receipt)
        for policy in (None, pins()):
            with self.subTest(policy=policy):
                output = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=policy)
                self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
        output = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=pins(receipt))
        self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 1, "event_ids": [value.event_id]})
        self.assertEqual(obj(output["capabilities"])[str(CAPABILITY)], {
            "state": "REVIEWED_EVIDENCE", "event_ids": [value.event_id],
            "contexts": [value.context_id], "promoted": False,
        })

    def test_wrong_policy_verifier_producer_authority_or_denial_cannot_support(self) -> None:
        value = event()
        receipt = review(value)
        policies = (
            pins(receipt, policy_id=SemanticId("cni://policy/synthetic-wrong-policy")),
            pins(receipt, policy_version="synthetic-wrong-version"),
            pins(receipt, verifiers=(SemanticId("cni://verifier/synthetic-untrusted"),)),
        )
        wrong_receipts = (
            review(value, actor=AGENT),
            replace(receipt, policy=replace(receipt.policy, tier=AuthorityTier.A1)),
            replace(receipt, policy=replace(receipt.policy, allowed=False)),
            replace(receipt, policy=replace(receipt.policy, target_ids=(PROJECT,))),
        )
        cases = [(receipt, policy) for policy in policies] + [(r, pins(r)) for r in wrong_receipts]
        for candidate, policy in cases:
            with self.subTest(receipt=digest(candidate), policy=digest(policy)):
                status = review_states((value,), (candidate,), policy, at=at(120))[value.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertFalse(status["independently_reviewed"])
                self.assertTrue(status["unaccepted_review"])

    def test_premature_future_and_stale_reviews_are_rejected_even_when_pinned(self) -> None:
        value = event()
        for second, age in ((9, 300), (121, 300), (30, 89)):
            receipt = review(value, second=second)
            with self.subTest(second=second, max_age=age):
                status = review_states((value,), (receipt,), pins(receipt, max_age_seconds=age), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertTrue(status["unaccepted_review"])
        receipt = review(value, second=30)
        self.assertTrue(review_states((value,), (receipt,), pins(receipt, max_age_seconds=90), at=at(120))[value.event_id]["independently_reviewed"])

    def test_checks_evidence_revision_and_exact_observation_are_required(self) -> None:
        value = event()
        good = review(value)
        stale_evidence = replace(good, result=replace(good.result, evidence=tuple(replace(ref, observed_at=at(9)) for ref in good.result.evidence)))
        wrong_revision = verification(
            replace(value.review_subject, version="synthetic-other-revision"),
            (value.observation.event_id,), when=at(30), actor=HUMAN, tier=AuthorityTier.A0,
            checks=("world.provenance", "world.outcome", "world.attribution", "world.capability"),
        )
        candidates = (
            review(value, checks=("world.outcome",)),
            review(value, sources=("cni://event/synthetic-not-this-observation",)),
            review(value, state=TevvState.FAIL, sources=("cni://event/synthetic-not-this-observation",)),
            stale_evidence,
            wrong_revision,
        )
        for candidate in candidates:
            with self.subTest(candidate=digest(candidate)):
                status = review_states((value,), (candidate,), pins(candidate), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertFalse(status["independently_reviewed"])

    def test_self_participant_and_guildmaster_reviews_are_not_independent(self) -> None:
        value = event(participants=(PEER,))
        with self.assertRaisesRegex(ContractError, "independent verifier"):
            review(value, reviewer=HUMAN)
        candidates = (review(value, state=TevvState.FAIL, reviewer=HUMAN), review(value, reviewer=PEER), review(value, reviewer=GUILDMASTER))
        for candidate in candidates:
            with self.subTest(reviewer=candidate.result.verifier_id):
                status = review_states((value,), (candidate,), pins(candidate), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertTrue(status["unaccepted_review"])

    def test_attribution_trace_tenant_and_result_changes_invalidate_old_pins(self) -> None:
        original = event()
        receipt = review(original)
        changed = (
            replace(original, event_id="", participants=(PEER,)),
            replace(original, event_id="", observation=replace(original.observation, event_id="", actor_id=PEER)),
            replace(original, event_id="", traces=(replace(TRACE, content_digest=ContentDigest("c" * 64)),)),
            replace(original, event_id="", tenant_id="synthetic-foreign", observation=replace(original.observation, event_id="", scope_id="synthetic-foreign")),
            replace(original, event_id="", outcome="FAILURE"),
            replace(original, event_id="", observation=replace(original.observation, event_id="", data={"synthetic": True, "status": "FAIL"})),
        )
        for value in changed:
            with self.subTest(changed=value.event_id):
                self.assertNotEqual(value.event_id, original.event_id)
                self.assertNotEqual(value.review_subject, original.review_subject)
                status = review_states((value,), (receipt,), pins(receipt), at=at(120))[value.event_id]
                self.assertFalse(status["independently_reviewed"])
                retargeted = review(value)
                status = review_states((value,), (retargeted,), pins(receipt), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertTrue(status["unaccepted_review"])

    def test_changing_receipt_bytes_cannot_reuse_receipt_identity_as_a_pin(self) -> None:
        value = event()
        receipt = review(value)
        changed = replace(receipt, result=replace(receipt.result, evaluated_at=at(31)))
        self.assertEqual(changed.receipt_id, receipt.receipt_id)
        self.assertNotEqual(digest(changed), digest(receipt))
        status = review_states((value,), (changed,), pins(receipt), at=at(120))[value.event_id]
        self.assertEqual(status["status"], "UNREVIEWED")
        self.assertTrue(status["unaccepted_review"])

    def test_verifier_strings_and_embedded_citadel_verification_never_promote(self) -> None:
        claimed = event(data={"verified_by": [str(REVIEWER)], "status": "PASS", "state": "VERIFIED", "synthetic": True})
        embedded = verification(claimed.observation.subject, ("cni://event/synthetic-upstream",), when=at(10), actor=HUMAN, tier=AuthorityTier.A1)
        verified = replace(claimed, event_id="", observation=replace(claimed.observation, event_id="", evidence_state=EvidenceState.VERIFIED, verification=embedded))
        self.assertIs(verified.observation.evidence_state, EvidenceState.VERIFIED)
        for value in (claimed, verified):
            with self.subTest(claim=value.observation.evidence_state):
                output = compile_projection((value,), scope((value,)), reviews=(embedded,), review_policy=pins(embedded))
                self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
                self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")

    def test_embedded_attempt_verdict_is_not_a_receiving_world_review(self) -> None:
        values = history()
        result, verification_event = values[-2:]
        receipt = verification(
            result.observation.subject, (result.observation.event_id,),
            when=at(8), actor=HUMAN, tier=AuthorityTier.A1,
        )
        verified = replace(verification_event, event_id="", observation=replace(
            verification_event.observation, event_id="", actor_id=PEER, verification=receipt,
        ))
        values = (*values[:-1], verified)
        episode, = world_episodes(values)
        self.assertIs(episode.lineages[0].attempts[-1].verdict, TevvState.PASS)
        self.assertEqual(episode.lineages[0].status, "VERIFIED")
        output = compile_projection(values, scope(values), reviews=(receipt,), review_policy=pins(receipt))
        self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
        self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")
        self.assertTrue(all(lineage["state"] == "RECORDED" for lineage in rows(rows(output["episodes"])[0]["lineages"])))
        for candidate, message in (
            (verification(result.observation.subject, ("cni://event/synthetic-not-result",), when=at(8), actor=HUMAN, tier=AuthorityTier.A1), "exact result event"),
            (verification(result.observation.subject, (result.observation.event_id,), when=at(8), actor=AGENT, tier=AuthorityTier.A1), "producer mismatch"),
            (verification(result.observation.subject, (result.observation.event_id,), when=at(6), actor=HUMAN, tier=AuthorityTier.A1), "predates result"),
        ):
            invalid = replace(verified, event_id="", observation=replace(verified.observation, event_id="", verification=candidate))
            with self.subTest(message=message), self.assertRaisesRegex(ContractError, message):
                world_episodes((*values[:-1], invalid))

    def test_review_of_inference_preserves_inferred_status(self) -> None:
        original = event()
        value = replace(original, event_id="", observation=replace(original.observation, event_id="", evidence_state=EvidenceState.INFERRED))
        receipt = review(value)
        status = review_states((value,), (receipt,), pins(receipt), at=at(120))[value.event_id]
        self.assertEqual(status["status"], "PASS")
        self.assertFalse(status["independently_reviewed"])
        output = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=pins(receipt))
        self.assertEqual(rows(rows(output["episodes"])[0]["timeline"])[0]["reported_evidence_state"], "INFERRED")
        self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")

    def test_exact_receiving_pins_support_verified_source_observations(self) -> None:
        original = event()
        embedded = verification(original.observation.subject, ("cni://event/synthetic-upstream",),
                                when=at(10), actor=HUMAN, tier=AuthorityTier.A1)
        verified = replace(original, event_id="", observation=replace(
            original.observation, event_id="", evidence_state=EvidenceState.VERIFIED, verification=embedded,
        ))
        receipt = review(verified)
        for policy in (None, pins(), pins(embedded), pins(review(original))):
            with self.subTest(unaccepted_policy=policy):
                status = review_states((verified,), (receipt, embedded), policy, at=at(120))[verified.event_id]
                self.assertEqual(status["status"], "UNREVIEWED")
                self.assertFalse(status["independently_reviewed"])
        status = review_states((verified,), (receipt,), pins(receipt), at=at(120))[verified.event_id]
        self.assertEqual(status["status"], "PASS")
        self.assertTrue(status["independently_reviewed"])
        output = compile_projection((verified,), scope((verified,)), reviews=(receipt,), review_policy=pins(receipt))
        self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 1, "event_ids": [verified.event_id]})
        self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "REVIEWED_EVIDENCE")
        self.assertEqual(rows(rows(output["episodes"])[0]["timeline"])[0]["reported_evidence_state"], "VERIFIED")
        self.assertTrue(all(CanonicalObjectEnvelope.from_dict(row).state.evidence_state is EvidenceState.OBSERVED
                            for row in rows(obj(output["graph"])["objects"])))
        self.assertFalse(output["authority_granted"])

    def test_other_source_states_are_not_observed_facts_even_with_exact_pins(self) -> None:
        original = event(data={"status": "PASS", "state": "VERIFIED", "verified_by": [str(REVIEWER)]})
        for state in EvidenceState:
            if state in (EvidenceState.OBSERVED, EvidenceState.VERIFIED):
                continue
            value = replace(original, event_id="", observation=replace(original.observation, event_id="", evidence_state=state))
            receipt = review(value)
            with self.subTest(state=state):
                status = review_states((value,), (receipt,), pins(receipt), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "PASS")
                self.assertFalse(status["independently_reviewed"])
                output = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=pins(receipt))
                self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
                self.assertEqual(rows(rows(output["episodes"])[0]["timeline"])[0]["reported_evidence_state"], state.value)
        for invalid_state in ("DECLARED", "VERIFIED"):
            wire = original.to_dict()
            wire["event_id"] = ""
            wire["observation"].update(event_id="", evidence_state=invalid_state)
            with self.subTest(invalid_state=invalid_state), self.assertRaises(ContractError):
                WorldEvent.from_dict(wire)

    def test_receipt_identity_collisions_preserve_conflicting_content(self) -> None:
        value = event()
        positive = review(value)
        negative = replace(review(value, state=TevvState.FAIL), receipt_id=positive.receipt_id)
        wrong_revision = verification(replace(value.review_subject, version="synthetic-wrong-revision"),
                                      (value.observation.event_id,), when=at(30), actor=HUMAN, tier=AuthorityTier.A0)
        for ordered in permutations((positive, negative, wrong_revision)):
            with self.subTest(order=[digest(receipt) for receipt in ordered]):
                status = review_states((value,), (*ordered, positive), pins(*ordered), at=at(120))[value.event_id]
                self.assertEqual(status["status"], "CONTESTED")
                self.assertFalse(status["independently_reviewed"])
                self.assertEqual(status["receipt_ids"], [str(positive.receipt_id)])
                self.assertEqual(status["receipt_digests"], sorted((digest(positive), digest(negative))))
                self.assertTrue(status["unaccepted_review"])
        for ordered in ((positive, negative), (negative, positive)):
            status = review_states((value,), ordered, pins(positive), at=at(120))[value.event_id]
            self.assertEqual(status["status"], "PASS")
            self.assertEqual(status["receipt_digests"], [digest(positive)])
            self.assertTrue(status["unaccepted_review"])

    def test_review_matching_hashes_each_event_once(self) -> None:
        values = tuple(event(f"hash-{index}", second=10 + index) for index in range(3))
        positive = tuple(review(value) for value in values)
        negative = review(values[0], state=TevvState.FAIL)
        unrelated = review(event("unrelated-review", second=20))
        for receipts in (positive, (*positive, negative, unrelated, positive[0])):
            policy = pins(*receipts)
            with self.subTest(receipts=len(receipts)):
                with patch("apps.world_twin.events.digest", wraps=digest) as hashed:
                    states = review_states(values, receipts, policy, at=at(120))
                self.assertEqual(hashed.call_count, len(values))
                self.assertCountEqual([call.args[0] for call in hashed.call_args_list], [value.stable_body for value in values])
                self.assertEqual(states[values[0].event_id]["status"], "PASS" if receipts == positive else "CONTESTED")

    def test_review_subjects_keep_boolean_integer_and_float_content_distinct(self) -> None:
        original = event(data={"measurement": True})
        receipt = review(original)
        subjects = {original.review_subject}
        for measurement in (1, 1.0):
            changed = replace(original, event_id="", observation=replace(
                original.observation, event_id="", data={"synthetic": True, "measurement": measurement},
            ))
            with self.subTest(measurement=type(measurement).__name__):
                self.assertEqual(original.observation.data, changed.observation.data)
                self.assertNotIn(changed.review_subject, subjects)
                subjects.add(changed.review_subject)
                status = review_states((changed,), (receipt,), pins(receipt), at=at(120))[changed.event_id]
                self.assertFalse(status["independently_reviewed"])
                current = review(changed)
                self.assertTrue(review_states((changed,), (current,), pins(current), at=at(120))[changed.event_id]["independently_reviewed"])
                with self.assertRaisesRegex(ContractError, "conflicting observations"):
                    world_events((original, changed), TENANT, at(120))

    def test_disagreement_is_retained_as_contested_and_is_order_independent(self) -> None:
        value = event()
        positive, negative = review(value), review(value, state=TevvState.FAIL)
        policy = pins(positive, negative)
        statuses = [review_states((value,), reviews, policy, at=at(120))[value.event_id]
                    for reviews in ((positive, negative), (negative, positive, positive))]
        self.assertEqual(statuses[0], statuses[1])
        self.assertEqual(statuses[0]["status"], "CONTESTED")
        self.assertFalse(statuses[0]["independently_reviewed"])
        self.assertEqual(statuses[0]["receipt_ids"], sorted([str(positive.receipt_id), str(negative.receipt_id)]))
        output = compile_projection((value,), scope((value,)), reviews=(positive, negative), review_policy=policy)
        self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")
        unpinned = review_states((value,), (positive, negative), pins(positive), at=at(120))[value.event_id]
        self.assertEqual(unpinned["status"], "PASS")
        self.assertTrue(unpinned["unaccepted_review"])

    def test_reviewed_views_reads_comments_and_non_results_earn_no_capability(self) -> None:
        base = event()
        candidates = [replace(base, event_id="", observation=replace(base.observation, event_id="", event_type=kind)) for kind in ("VIEW", "READ", "COMMENT")]
        candidates.extend((event("action", phase=Phase.ACTION), event("failure", outcome="FAILURE"), event("no-outcome", outcome="NONE")))
        for value in candidates:
            receipt = review(value)
            with self.subTest(type=value.observation.event_type, phase=value.observation.phase, outcome=value.outcome):
                output = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=pins(receipt))
                self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 1, "event_ids": [value.event_id]})
                self.assertEqual(obj(output["capabilities"])[str(CAPABILITY)], {"state": "NOT_ESTABLISHED", "event_ids": [], "contexts": [], "promoted": False})


class WorldReviewLineageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.action = event("linked-action", phase=Phase.ACTION, actor=HUMAN, second=1, data={"attempt_id": "attempt"})
        self.result = event("linked-result", actor=AGENT, second=2, inputs=(self.action.observation.event_id,), data={"attempt_id": "attempt"})
        self.values = (self.action, self.result)

    def test_action_and_result_authors_are_excluded_without_optional_participants(self) -> None:
        recorded_review = event("linked-review", phase=Phase.VERIFICATION, actor=PEER, second=3,
                                inputs=(self.result.observation.event_id,), data={"attempt_id": "attempt"})
        values = (*self.values, recorded_review)
        self.assertTrue(all(not value.participants for value in values))
        for value, reviewer in ((self.result, HUMAN), (self.action, AGENT), (recorded_review, HUMAN), (recorded_review, AGENT)):
            for state in (TevvState.PASS, TevvState.FAIL):
                receipt = review(value, reviewer=reviewer, state=state)
                with self.subTest(phase=value.observation.phase, reviewer=reviewer, state=state):
                    status = review_states(values, (receipt,), pins(receipt), at=at(120))[value.event_id]
                    self.assertEqual(status["status"], "UNREVIEWED")
                    self.assertFalse(status["independently_reviewed"])
                    self.assertTrue(status["unaccepted_review"])
        independent = review(self.result)
        self.assertTrue(review_states(values, (independent,), pins(independent), at=at(120))[self.result.event_id]["independently_reviewed"])

    def test_hidden_action_authors_cannot_review_agent_results(self) -> None:
        result = replace(self.result, event_id="", visibility="PUBLIC")
        values = (self.action, result)
        receipt = review(result, reviewer=HUMAN)
        selections = (
            scope(values), scope(values, view="agent", subject_id=AGENT), scope((result,)),
            scope(values, audience="public", share_profile=True, adult_confirmed=True,
                  shared_entity_ids=(AGENT, PROJECT, GUILD, GUILDMASTER)),
        )
        for selection in selections:
            with self.subTest(view=selection.view, audience=selection.audience, grants=len(selection.allowed_event_ids)):
                output = compile_projection(values, selection, reviews=(receipt,), review_policy=pins(receipt))
                self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
                self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")
                if selection != selections[0]:
                    self.assertEqual(output["events"], [result.event_id])
                    for hidden in (self.action.event_id, self.action.observation.event_id, str(HUMAN)):
                        self.assertNotIn(hidden, json.dumps(output))

    def test_linked_wrapper_participants_and_guildmasters_are_not_independent(self) -> None:
        for attributed_phase in (Phase.ACTION, Phase.RESULT):
            action = replace(self.action, event_id="", guildmaster_id=None)
            result = replace(self.result, event_id="", guildmaster_id=None)
            if attributed_phase is Phase.ACTION:
                action = replace(action, event_id="", participants=(PEER,), guildmaster_id=GUILDMASTER)
            else:
                result = replace(result, event_id="", participants=(PEER,), guildmaster_id=GUILDMASTER)
            recorded_review = event("linked-review", phase=Phase.VERIFICATION, actor=HUMAN, second=3,
                                    inputs=(result.observation.event_id,), data={"attempt_id": "attempt"}, guildmaster_id=None)
            values = (action, result, recorded_review)
            targets = (result if attributed_phase is Phase.ACTION else action, recorded_review)
            for target in targets:
                for reviewer in (PEER, GUILDMASTER):
                    for state in (TevvState.PASS, TevvState.FAIL):
                        receipt = review(target, reviewer=reviewer, state=state)
                        with self.subTest(attributed=attributed_phase, target=target.observation.phase, reviewer=reviewer, state=state):
                            status = review_states(values, (receipt,), pins(receipt), at=at(120))[target.event_id]
                            self.assertEqual(status["status"], "UNREVIEWED")
                            self.assertFalse(status["independently_reviewed"])
                            self.assertTrue(status["unaccepted_review"])
                independent = review(target)
                self.assertTrue(review_states(values, (independent,), pins(independent), at=at(120))[target.event_id]["independently_reviewed"])

    def test_hidden_predecessor_wrapper_attribution_cannot_support_result_review(self) -> None:
        action = replace(self.action, event_id="", participants=(PEER,), guildmaster_id=GUILDMASTER)
        result = replace(self.result, event_id="", visibility="PUBLIC", guildmaster_id=None)
        values = (action, result)
        selections = (
            scope(values, view="agent", subject_id=AGENT), scope((result,)),
            scope(values, audience="public", share_profile=True, adult_confirmed=True,
                  shared_entity_ids=(AGENT, PROJECT, GUILD)),
        )
        for reviewer in (PEER, GUILDMASTER):
            receipt = review(result, reviewer=reviewer)
            for selection in selections:
                with self.subTest(reviewer=reviewer, view=selection.view, audience=selection.audience):
                    output = compile_projection(values, selection, reviews=(receipt,), review_policy=pins(receipt))
                    self.assertEqual(output["events"], [result.event_id])
                    self.assertEqual(obj(output["measures"])["reviewed_observations"], {"value": 0, "event_ids": []})
                    self.assertEqual(obj(obj(output["capabilities"])[str(CAPABILITY)])["state"], "NOT_ESTABLISHED")
                    status = obj(rows(rows(output["episodes"])[0]["timeline"])[0]["review"])
                    self.assertEqual(status["status"], "UNREVIEWED")
                    self.assertTrue(status["unaccepted_review"])
                    for hidden in (action.event_id, action.observation.event_id, str(HUMAN), str(PEER), str(GUILDMASTER)):
                        self.assertNotIn(hidden, json.dumps(output))

    def test_shared_core_wrapper_attribution_stays_with_its_release(self) -> None:
        action = replace(self.action, event_id="", guildmaster_id=None)
        result = replace(self.result, event_id="", guildmaster_id=None)
        other_action = replace(action, event_id="", release_sha="b" * 40, participants=(PEER,), guildmaster_id=GUILDMASTER)
        other_result = replace(result, event_id="", release_sha="b" * 40)
        self.assertEqual(action.observation.event_id, other_action.observation.event_id)
        self.assertEqual(result.observation.event_id, other_result.observation.event_id)
        values = (action, result, other_action, other_result)
        for reviewer in (PEER, GUILDMASTER):
            receipts = (review(result, reviewer=reviewer), review(other_result, reviewer=reviewer))
            for ordered in (values, tuple(reversed(values))):
                with self.subTest(reviewer=reviewer, reversed=ordered != values):
                    statuses = review_states(ordered, receipts, pins(*receipts), at=at(120))
                    self.assertTrue(statuses[result.event_id]["independently_reviewed"])
                    self.assertFalse(statuses[result.event_id]["unaccepted_review"])
                    self.assertEqual(statuses[other_result.event_id]["status"], "UNREVIEWED")

    def test_all_wrappers_of_a_linked_core_event_retain_their_exclusions(self) -> None:
        participant_action = replace(self.action, event_id="", participants=(PEER,), guildmaster_id=None)
        guide_action = self.action
        result = replace(self.result, event_id="", guildmaster_id=None)
        self.assertEqual(participant_action.observation.event_id, guide_action.observation.event_id)
        for values in ((participant_action, guide_action, result), (guide_action, participant_action, result)):
            with self.assertRaisesRegex(ContractError, "conflicting observations"):
                world_events(values, TENANT, at(120))
            for reviewer in (PEER, GUILDMASTER):
                receipt = review(result, reviewer=reviewer)
                with self.subTest(reviewer=reviewer, first_wrapper=values[0].event_id):
                    status = review_states(values, (receipt,), pins(receipt), at=at(120))[result.event_id]
                    self.assertEqual(status["status"], "UNREVIEWED")
                    self.assertTrue(status["unaccepted_review"])

    def test_review_admission_validates_attempt_predecessors_and_scope(self) -> None:
        bad_input = replace(self.result, event_id="", observation=replace(
            self.result.observation, event_id="", inputs=(self.action.event_id,),
        ))
        wrong_authority = replace(self.result, event_id="", observation=replace(
            self.result.observation, event_id="", authority=AuthorityTier.A2,
        ))
        wrong_release = replace(self.result, event_id="", release_sha="b" * 40)
        for values in ((self.result,), (self.action, bad_input), (self.action, wrong_authority), (self.action, wrong_release)):
            receipt = review(values[-1])
            with self.subTest(events=[value.event_id for value in values]), self.assertRaises(ContractError):
                review_states(values, (receipt,), pins(receipt), at=at(120))

    def test_unrelated_events_and_attempts_do_not_exclude_a_reviewer(self) -> None:
        context = event("unrelated-context", phase=Phase.CONTEXT, actor=PEER, second=0, participants=(REVIEWER,))
        guide = SemanticId("cni://guildmaster/synthetic-unrelated-guide")
        other_action = event("other-action", phase=Phase.ACTION, actor=PEER, second=3, data={"attempt_id": "other"},
                             participants=(REVIEWER,), guildmaster_id=guide)
        other_result = event("other-result", actor=AGENT, second=4, inputs=(other_action.observation.event_id,), data={"attempt_id": "other"})
        for reviewer in (PEER, REVIEWER, guide):
            receipt = review(self.result, reviewer=reviewer)
            with self.subTest(reviewer=reviewer):
                status = review_states((*self.values, context, other_action, other_result), (receipt,), pins(receipt), at=at(120))[self.result.event_id]
                self.assertTrue(status["independently_reviewed"])
                self.assertFalse(status["unaccepted_review"])

    def test_reused_attempt_names_do_not_cross_world_scope_boundaries(self) -> None:
        guide = SemanticId("cni://guildmaster/synthetic-unrelated-guide")
        other = event("other-action", phase=Phase.ACTION, actor=PEER, second=1, data={"attempt_id": "attempt"},
                      participants=(REVIEWER,), guildmaster_id=guide)
        actions = (
            replace(other, event_id="", tenant_id="synthetic-foreign", observation=replace(other.observation, event_id="", scope_id="synthetic-foreign")),
            replace(other, event_id="", observation=replace(other.observation, event_id="", mission_id="synthetic-other-mission")),
            replace(other, event_id="", observation=replace(other.observation, event_id="", correlation_id="synthetic-other-correlation")),
            replace(other, event_id="", release_sha="b" * 40),
            replace(other, event_id="", observation=replace(other.observation, event_id="", authority=AuthorityTier.A2)),
        )
        receipts = tuple(review(self.result, reviewer=reviewer) for reviewer in (PEER, REVIEWER, guide))
        for action in actions:
            result = replace(self.result, event_id="", tenant_id=action.tenant_id, release_sha=action.release_sha,
                             observation=replace(self.result.observation, event_id="", scope_id=action.tenant_id,
                                 mission_id=action.observation.mission_id, correlation_id=action.observation.correlation_id,
                                 authority=action.observation.authority, source_ref="synthetic:other-result", inputs=(action.observation.event_id,)))
            values = (*self.values, action, result)
            for ordered in (values, tuple(reversed(values))):
                with self.subTest(action=action.event_id, reversed=ordered != values):
                    status = review_states(ordered, receipts, pins(*receipts), at=at(120))[self.result.event_id]
                    self.assertTrue(status["independently_reviewed"])
                    self.assertFalse(status["unaccepted_review"])
                    self.assertEqual(status["verifier_ids"], sorted((str(PEER), str(REVIEWER), str(guide))))
            if action.tenant_id != TENANT:
                with self.assertRaisesRegex(ContractError, "foreign tenant"):
                    compile_projection(values, scope(self.values), reviews=receipts, review_policy=pins(*receipts))

    def test_shared_core_event_does_not_import_another_release_result_author(self) -> None:
        other_action = replace(self.action, event_id="", release_sha="b" * 40)
        other_result = event("other-release-result", actor=PEER, second=2, release_sha="b" * 40,
                             inputs=(other_action.observation.event_id,), data={"attempt_id": "attempt"})
        self.assertEqual(self.action.observation.event_id, other_action.observation.event_id)
        values = (self.action, other_action, other_result)
        receipts = (review(self.action, reviewer=PEER), review(other_action, reviewer=PEER))
        statuses = review_states(values, receipts, pins(*receipts), at=at(120))
        self.assertTrue(statuses[self.action.event_id]["independently_reviewed"])
        self.assertEqual(statuses[other_action.event_id]["status"], "UNREVIEWED")


class WorldProjectionTests(unittest.TestCase):
    def test_all_five_views_select_their_exact_subject(self) -> None:
        human = event("human")
        agent = event("agent", actor=AGENT, second=11)
        outsider = event("outsider", actor=PEER, second=12, guild_id=SemanticId("cni://guild/synthetic-other"), project_id=SemanticId("cni://resource/synthetic-other"))
        outsider = replace(outsider, event_id="", observation=replace(outsider.observation, event_id="", subject_id=SemanticId("cni://resource/synthetic-other")))
        values = (human, agent, outsider)
        for view, subject, expected in (
            ("user", HUMAN, [human.event_id]), ("agent", AGENT, [agent.event_id]),
            ("guild", GUILD, [human.event_id, agent.event_id]),
            ("project", PROJECT, [human.event_id, agent.event_id]),
            ("community", SemanticId("cni://tenant/synthetic-world-tenant"), [e.event_id for e in values]),
        ):
            with self.subTest(view=view):
                output = compile_projection(values, scope(values, view=view, subject_id=subject))
                self.assertEqual(output["events"], expected)
                self.assertEqual(obj(output["measures"])["activity"], {"value": len(expected), "event_ids": expected})
                self.assertEqual(obj(output["graph"])["schema_version"], "semantic-twin.graph/v2")

    def test_missing_or_submitted_grants_do_not_leak_any_event(self) -> None:
        value = event(data={"allowed_event_ids": ["*"], "share_profile": True, "adult_confirmed": True})
        for allowed in ((), (SemanticId(value.observation.event_id),), (SemanticId("cni://event/synthetic-untrusted-grant"),)):
            with self.subTest(allowed=allowed):
                output = compile_projection((value,), scope((value,), allowed_event_ids=allowed))
                self.assertEqual(output["events"], [])
                self.assertEqual(output["episodes"], [])
                self.assertEqual(output["capabilities"], {})
                self.assertEqual(obj(output["graph"])["objects"], [])
                wire = json.dumps(output)
                for hidden in (value.event_id, str(HUMAN), str(GUILD), TRACE.reference, str(CAPABILITY)):
                    self.assertNotIn(hidden, wire)

    def test_public_and_community_sharing_default_to_withheld_for_unknown_age_or_minor(self) -> None:
        value = event(visibility="PUBLIC")
        for audience in ("public", "community"):
            for share_profile, adult_confirmed in ((False, False), (True, False), (False, True)):
                with self.subTest(audience=audience, share=share_profile, adult=adult_confirmed):
                    output = compile_projection((value,), scope((value,), audience=audience, share_profile=share_profile, adult_confirmed=adult_confirmed))
                    self.assertEqual(output["state"], "WITHHELD")
                    self.assertEqual(set(output), {"schema_version", "audience", "state", "reason"})
                    self.assertNotIn(value.event_id, json.dumps(output))
        unknown_age = scope((value,), audience="public", share_profile=True)
        self.assertFalse(unknown_age.adult_confirmed)
        self.assertEqual(compile_projection((value,), unknown_age)["state"], "WITHHELD")

    def test_non_private_views_hide_private_events_unshared_peers_reviews_and_traces(self) -> None:
        public = event("public", visibility="PUBLIC")
        community = event("community", visibility="COMMUNITY", second=11)
        private = event("private", second=12)
        hidden_peer = event("hidden-peer", participants=(PEER,), visibility="PUBLIC", second=13)
        values = (public, community, private, hidden_peer)
        receipt = review(public)
        shared = (HUMAN, PROJECT, GUILD, GUILDMASTER)
        for audience, expected in (("public", [public.event_id]), ("community", [public.event_id, community.event_id])):
            with self.subTest(audience=audience):
                output = compile_projection(values, scope(values, audience=audience, share_profile=True, adult_confirmed=True, shared_entity_ids=shared), reviews=(receipt,), review_policy=pins(receipt))
                self.assertEqual(output["events"], expected)
                wire = json.dumps(output)
                for hidden in (private.event_id, hidden_peer.event_id, str(PEER), str(REVIEWER), str(receipt.receipt_id), TRACE.reference, TRACE.trace_id, TRACE.span_id):
                    assert hidden is not None
                    self.assertNotIn(hidden, wire)
                for episode in rows(output["episodes"]):
                    for row in rows(episode["timeline"]):
                        self.assertEqual(row["traces"], [])
                        self.assertNotIn("verifier_ids", obj(row["review"]))
                        self.assertNotIn("receipt_ids", obj(row["review"]))
        output = compile_projection((public,), scope((public,)), reviews=(receipt,), review_policy=pins(receipt))
        self.assertIn(TRACE.reference, json.dumps(output))
        self.assertIn(str(receipt.receipt_id), json.dumps(output))
        unshared = compile_projection((public,), scope((public,), audience="public", share_profile=True, adult_confirmed=True))
        self.assertEqual(unshared["events"], [])

    def test_hidden_predecessors_leave_only_an_unresolved_count(self) -> None:
        hidden = event("hidden-predecessor", phase=Phase.CONTEXT, second=1, actor=PEER)
        visible = event("public-result", second=2, visibility="PUBLIC", inputs=(hidden.observation.event_id,))
        values = (hidden, visible)
        output = compile_projection(values, scope(values, audience="public", share_profile=True, adult_confirmed=True, shared_entity_ids=(HUMAN, GUILD, PROJECT, GUILDMASTER)))
        self.assertEqual(output["events"], [visible.event_id])
        episode, = rows(output["episodes"])
        self.assertEqual((episode["unresolved_inputs"], episode["state"]), (1, "PARTIAL"))
        wire = json.dumps(output)
        for reference in (hidden.event_id, hidden.observation.event_id, str(PEER), TRACE.reference):
            self.assertNotIn(reference, wire)
        for node in rows(obj(output["graph"])["objects"]):
            self.assertFalse(any(edge["predicate"] == "DERIVED_FROM" for edge in rows(node["relations"])))

    def test_graph_is_deterministic_resolved_v2_and_never_promotes_state(self) -> None:
        values = history()[3:6]
        receipt = review(values[1])
        original = compile_projection(values, scope(values), reviews=(receipt,), review_policy=pins(receipt))
        for ordered in permutations(values):
            self.assertEqual(compile_projection(ordered, scope(values), reviews=(receipt, receipt), review_policy=pins(receipt)), original)
        body = {key: value for key, value in original.items() if key != "digest"}
        self.assertEqual(original["digest"], digest(body))
        graph = obj(original["graph"])
        self.assertEqual(graph["schema_version"], "semantic-twin.graph/v2")
        objects = tuple(CanonicalObjectEnvelope.from_dict(row) for row in rows(graph["objects"]))
        typed = SemanticGraph(objects)
        typed.require_resolved()
        self.assertEqual(graph["object_count"], len(objects))
        self.assertEqual([str(node.semantic_id) for node in objects], sorted(str(node.semantic_id) for node in objects))
        leaves = rows(graph["leaf_digests"])
        self.assertEqual(len(leaves), len(objects))
        for node, leaf in zip(objects, leaves, strict=True):
            self.assertEqual(node.schema_version, "2")
            self.assertEqual(leaf["subject"], node.subject.to_dict())
            self.assertEqual(leaf["digest"], ContentDigest(hashlib.sha256(node.to_json().encode()).hexdigest()).to_dict())
            self.assertIs(node.state.evidence_state, EvidenceState.OBSERVED)
            self.assertIs(node.state.authority_tier, AuthorityTier.A0)
            self.assertIs(node.state.tevv_state, TevvState.NOT_TESTED)
            self.assertIs(node.state.causal_state, CausalState.TEMPORAL_ONLY)
            self.assertIs(node.state.cgrf_action_state, CgrfActionState.OBSERVED)
            self.assertIs(node.state.merkle_state, MerkleState.UNHASHED)
            for edge in node.relations:
                self.assertEqual(edge.source, node.subject)
                self.assertEqual(edge.target_version, typed.by_id()[str(edge.target)].subject.version)
                self.assertIn(edge.predicate, (RelationPredicate.ABOUT, RelationPredicate.CONTAINS, RelationPredicate.DERIVED_FROM))
        derived = {(str(edge.source.semantic_id), str(edge.target)) for edge in typed.relations() if edge.predicate is RelationPredicate.DERIVED_FROM}
        self.assertEqual(derived, {(values[1].event_id, values[0].event_id), (values[2].event_id, values[1].event_id)})
        self.assertFalse(original["authority_granted"])
        self.assertFalse(original["rewards_settled"])
        self.assertTrue(all(not episode["executed"] for episode in rows(original["episodes"])))

    def test_subject_referencing_visible_event_reuses_its_graph_identity(self) -> None:
        original = event("referenced-event", second=1)
        referencing = event("reference", phase=Phase.CONTEXT, second=2)
        referencing = replace(referencing, event_id="", observation=replace(referencing.observation, event_id="", subject_id=SemanticId(original.event_id)))
        values = (original, referencing)
        output = compile_projection(values, scope(values))
        graph = obj(output["graph"])
        nodes = tuple(CanonicalObjectEnvelope.from_dict(row) for row in rows(graph["objects"]))
        SemanticGraph(nodes).require_resolved()
        self.assertEqual(sum(node.semantic_id == original.event_id for node in nodes), 1)
        target = next(node for node in nodes if node.semantic_id == referencing.event_id)
        self.assertTrue(any(edge.predicate is RelationPredicate.ABOUT and edge.target == original.event_id for edge in target.relations))


class WorldSeamTests(unittest.TestCase):
    """Keep real producer vocabularies, partial views and review availability compatible."""

    def test_existing_citadel_event_types_keep_their_identity(self) -> None:
        original = event()
        for kind in ("git.commit_observed", "telemetry.snapshot", "graph.object_observed"):
            observation = replace(original.observation, event_id="", event_type=kind)
            wrapped = replace(original, event_id="", observation=observation)
            self.assertEqual(wrapped.observation.event_id, observation.event_id)

    def test_two_records_in_one_source_capture_do_not_conflict(self) -> None:
        original = event()
        other = replace(original, event_id="", observation=replace(original.observation, event_id="",
                         subject_id=SemanticId("cni://resource/synthetic-second-object")))
        self.assertEqual(len(world_events((original, other), TENANT, at(120))), 2)

    def test_actor_and_permission_slices_keep_linked_attempts_partial(self) -> None:
        action = event("mixed-action", actor=HUMAN, phase=Phase.ACTION, second=1, data={"attempt_id": "attempt"})
        result = event("mixed-result", actor=AGENT, second=2, inputs=(action.observation.event_id,), data={"attempt_id": "attempt"})
        values = (action, result)
        for selection in (scope(values, view="agent", subject_id=AGENT), scope((result,))):
            output = compile_projection(values, selection)
            self.assertEqual(output["events"], [result.event_id])
            replay = rows(output["episodes"])[0]
            self.assertEqual(replay["state"], "PARTIAL")
            self.assertNotIn(action.event_id, json.dumps(output))
            self.assertNotIn(action.observation.event_id, json.dumps(output))

    def test_late_review_changes_graph_revision_and_availability(self) -> None:
        value = event(second=10)
        receipt = review(value, second=60)
        unreviewed = compile_projection((value,), scope((value,), as_of=at(20)))
        reviewed = compile_projection((value,), scope((value,)), reviews=(receipt,), review_policy=pins(receipt))
        before = next(CanonicalObjectEnvelope.from_dict(row) for row in rows(obj(unreviewed["graph"])["objects"])
                      if row["semantic_id"] == value.event_id)
        after = next(CanonicalObjectEnvelope.from_dict(row) for row in rows(obj(reviewed["graph"])["objects"])
                     if row["semantic_id"] == value.event_id)
        self.assertNotEqual(after.source.version, before.source.version)
        observed = after.observed_time
        assert observed is not None
        self.assertGreaterEqual(observed, receipt.result.evaluated_at)
        self.assertTrue(all(ref.observed_at >= receipt.result.evaluated_at for ref in after.evidence))


if __name__ == "__main__":
    unittest.main()
