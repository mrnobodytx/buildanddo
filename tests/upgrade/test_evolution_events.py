# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_evolution_events.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/adapters.py, libs/evolution/candidate.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/adapters.py; VALIDATES libs/evolution/candidate.py; VALIDATES tests/upgrade/test_evolution_support.py
# Intent:      Test provenance, tenant scope, typed result verification and discovery cutoffs before learning can proceed.
# ───────────────────────────────────────────────────────────────

"""Exercise observation provenance, failed attempts and discovery evidence boundaries."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from libs.evolution.adapters import (
    Capture,
    CapturedRecord,
    ingest_local,
    normalize_capture,
)
from libs.evolution.candidate import Candidate, discover_candidates
from libs.evolution.common import digest, read_json
from libs.evolution.episode import Episode, build_episodes, event_order
from libs.evolution.event import CitadelEvent, Phase, SourceKind
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

from tests.upgrade.test_evolution_support import (
    ACTOR,
    SCOPE,
    at,
    compatibility,
    candidate,
    episode,
    event,
    verification,
)


class EventTests(unittest.TestCase):
    def test_round_trip_digest_and_idempotent_ingestion(self) -> None:
        first = event(Phase.CONTEXT)
        self.assertEqual(CitadelEvent.from_json(first.to_json()), first)
        retry = replace(first, ingested_at=at(20))
        self.assertEqual(first.event_id, retry.event_id)
        self.assertEqual(first.stable_payload, retry.stable_payload)
        self.assertNotEqual(digest(first), digest(retry))
        with self.assertRaises(ContractError):
            replace(first, data={"altered": True})
        with self.assertRaises(TypeError):
            first.data["mutate"] = True

    def test_timestamps_and_verified_assertions_fail_closed(self) -> None:
        first = event(Phase.CONTEXT)
        for change in (
            {"observed_at": at(-1)},
            {"ingested_at": at(-1)},
            {"source_sha": "short"},
            {"evidence_state": EvidenceState.VERIFIED},
        ):
            with self.subTest(change=change), self.assertRaises(ContractError):
                replace(first, event_id="", **change)
        receipt = verification(first.subject, (first.event_id,), when=at(1))
        confirmed = replace(
            first,
            occurred_at=at(2),
            observed_at=at(2),
            ingested_at=at(2),
            event_id="",
            verification=receipt,
            evidence_state=EvidenceState.VERIFIED,
        )
        self.assertEqual(confirmed.evidence_state, EvidenceState.VERIFIED)

    def test_every_capture_family_is_an_observation(self) -> None:
        for kind in SourceKind:
            with self.subTest(kind=kind):
                capture = Capture(
                    schema_version="citadel.evolution.capture/v1",
                    scope_id=SCOPE,
                    source_kind=kind,
                    source_ref="synthetic:export",
                    observed_at=at(1),
                    authority=AuthorityTier.A2,
                    risk="synthetic",
                    records=(
                        CapturedRecord(
                            occurred_at=at(0),
                            correlation_id="fixture",
                            actor_id=ACTOR,
                            event_type="provider.pass",
                            subject_id=SemanticId("cni://observation/fixture"),
                            subject_version="v1",
                            phase=Phase.RESULT,
                            data={"status": "PASS"},
                        ),
                    ),
                )
                observed = normalize_capture(capture, ingested_at=at(2)).events[0]
                self.assertEqual(observed.evidence_state, EvidenceState.OBSERVED)
                self.assertIsNone(observed.verification)

    def test_strict_wire_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            for content in ('{"a":1,"a":2}', '{"bad":NaN}', '["incomplete"'):
                path.write_text(content)
                with self.assertRaises(ContractError):
                    read_json(path)
        raw = event(Phase.CONTEXT).to_dict()
        raw["verified"] = True
        with self.assertRaises(ContractError):
            CitadelEvent.from_dict(raw)


class EpisodeTests(unittest.TestCase):
    def test_failed_attempts_survive_success_and_round_trip(self) -> None:
        value = episode(include_failed=True)
        self.assertEqual(value.status, "VERIFIED")
        self.assertEqual([a.verdict.value for a in value.attempts], ["FAIL", "PASS"])
        self.assertEqual(Episode.from_json(value.to_json()), value)
        self.assertEqual(build_episodes(value.events + value.events), (value,))

    def test_provider_pass_is_only_complete(self) -> None:
        self.assertEqual(episode(typed=False).status, "COMPLETE")
        value = episode()
        self.assertEqual(Episode(value.events[:3]).status, "INCOMPLETE")
        self.assertEqual(episode(passed=False).status, "COMPLETE")

    def test_unlinked_attempts_and_after_action_hypotheses_remain_incomplete(
        self,
    ) -> None:
        value = episode()
        for phase in (Phase.ACTION, Phase.RESULT, Phase.VERIFICATION):
            pending = event(
                phase, second=10, correlation="episode-0", sha=value.source_shas[0]
            )
            self.assertEqual(Episode((*value.events, pending)).status, "INCOMPLETE")
        later = replace(
            value.events[2],
            occurred_at=at(10),
            observed_at=at(10),
            ingested_at=at(10),
            event_id="",
        )
        reordered = tuple(
            sorted((*value.events[:2], *value.events[3:], later), key=event_order)
        )
        self.assertEqual(Episode(reordered).status, "INCOMPLETE")

    def test_scope_authority_and_correlation_isolation(self) -> None:
        value = episode()
        for field, changed in (
            ("scope_id", "another/tenant"),
            ("authority", AuthorityTier.A3),
            ("mission_id", "another-mission"),
        ):
            altered = replace(value.events[0], event_id="", **{field: changed})
            with self.subTest(field=field), self.assertRaises(ContractError):
                Episode((altered, *value.events[1:]))
        foreign = replace(event(Phase.CONTEXT), scope_id="another/tenant", event_id="")
        self.assertEqual(len(build_episodes((value.events[0], foreign))), 2)

    def test_future_events_and_unbound_reviews_do_not_complete_episode(self) -> None:
        value = episode()
        past = build_episodes(value.events, as_of=at(3))
        self.assertEqual(past[0].status, "INCOMPLETE")
        review = value.events[-1]
        wrong = verification(
            review.subject, (event(Phase.CONTEXT).event_id,), when=at(5)
        )
        with self.assertRaises(ContractError):
            Episode(
                (*value.events[:-1], replace(review, verification=wrong, event_id=""))
            )
        with self.assertRaises(ContractError):
            Episode(tuple(reversed(value.events)))
        with self.assertRaises(ContractError):
            Episode(value.events[4:])

    def test_self_review_and_conflicting_results_are_rejected(self) -> None:
        value = episode()
        receipt = value.events[-1].verification
        with self.assertRaises(ContractError):
            replace(receipt.result, verifier_id=ACTOR)
        with self.assertRaises(ContractError):
            Episode((*value.events, value.events[4]))


class CandidateTests(unittest.TestCase):
    def test_unfinished_episodes_supply_observations_without_successful_repairs(
        self,
    ) -> None:
        unfinished = tuple(
            Episode(
                (
                    *value.events,
                    event(
                        Phase.ACTION,
                        second=number * 30 + 10,
                        correlation=value.events[0].correlation_id,
                        sha=value.source_shas[0],
                    ),
                )
            )
            for number, value in enumerate((episode(0), episode(1)))
        )
        self.assertEqual(
            discover_candidates(
                unfinished,
                before=at(100),
                discovered_at=at(101),
                compatibility=compatibility(),
                actor_id=ACTOR,
            ),
            (),
        )

    def test_episode_revisions_cannot_inflate_independent_observation_counts(
        self,
    ) -> None:
        learned = candidate()
        duplicated = replace(
            learned.training[1], correlation_id=learned.training[0].correlation_id
        )
        with self.assertRaises(ContractError):
            replace(learned, training=(learned.training[0], duplicated))

    def test_counts_do_not_promote_competence(self) -> None:
        values = (episode(0, include_failed=True), episode(1), episode(2, typed=False))
        candidates = discover_candidates(
            values,
            before=at(100),
            discovered_at=at(101),
            compatibility=compatibility(),
            actor_id=ACTOR,
        )
        self.assertEqual(len(candidates), 1)
        candidate = candidates[0]
        self.assertEqual((candidate.observations, candidate.successful_repairs), (4, 2))
        self.assertEqual(candidate.evidence_state, EvidenceState.HYPOTHESIS)
        self.assertEqual(candidate.authority, AuthorityTier.A2)
        self.assertEqual(Candidate.from_json(candidate.to_json()), candidate)
        self.assertEqual(
            candidate.subject, Candidate.from_json(candidate.to_json()).subject
        )

    def test_future_success_and_insufficient_repeats_are_excluded(self) -> None:
        values = (episode(0), episode(1), episode(3))
        self.assertEqual(
            discover_candidates(
                values,
                before=at(10),
                discovered_at=at(200),
                compatibility=compatibility(),
                actor_id=ACTOR,
            ),
            (),
        )
        with self.assertRaises(ContractError):
            discover_candidates(
                values,
                before=at(100),
                discovered_at=at(1),
                compatibility=compatibility(),
                actor_id=ACTOR,
            )
        self.assertEqual(
            discover_candidates(
                (episode(0, typed=False), episode(1, typed=False)),
                before=at(100),
                discovered_at=at(100),
                compatibility=compatibility(),
                actor_id=ACTOR,
            ),
            (),
        )


class AdapterTests(unittest.TestCase):
    def test_capture_digest_binds_the_single_read_used_for_normalization(self) -> None:
        content = json.dumps(
            {
                "format": "buildanddo.mission-learning/1",
                "mission": "m1",
                "recorded_review_at": at(1).isoformat(),
                "status": "verified",
            }
        ).encode()
        with patch.object(
            Path, "read_bytes", side_effect=(content, b"changed")
        ) as read:
            result = ingest_local(
                Path("capture.json"),
                format_name="mission-learning",
                scope_id=SCOPE,
                actor_id=ACTOR,
                observed_at=at(100),
                ingested_at=at(101),
            )
        read.assert_called_once_with()
        self.assertEqual(
            result.events[0].source_digest.value, hashlib.sha256(content).hexdigest()
        )

    def import_json(self, content: object, format_name: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "captured.json"
            path.write_text(json.dumps(content))
            return ingest_local(
                path,
                format_name=format_name,
                scope_id=SCOPE,
                actor_id=ACTOR,
                observed_at=at(100),
                ingested_at=at(101),
            )

    def test_mission_learning_does_not_mint_verification(self) -> None:
        value = {
            "format": "buildanddo.mission-learning/1",
            "mission": "m1",
            "status": "verified",
            "evidence_ids": ["receipt-1"],
            "recorded_review_at": at(1).isoformat(),
            "learning_points": 100,
        }
        result = self.import_json(value, "mission-learning")
        self.assertEqual(result.events[0].data["claimed_status"], "verified")
        self.assertIsNone(result.events[0].verification)
        self.assertTrue(result.gaps)
        value["recorded_review_at"] = None
        self.assertFalse(self.import_json(value, "mission-learning").events)

    def test_memory_missing_time_or_revision_is_explicit(self) -> None:
        data = {
            "vectors": [
                {"type": "A", "file_path": "example.py"},
                {"type": "C", "description": "no date"},
                {
                    "type": "C",
                    "timestamp": at(1).isoformat(),
                    "commit_sha": "short",
                    "event_type": "test_pass",
                    "dispatch_id": "fixture",
                },
            ]
        }
        result = self.import_json(data, "memory")
        self.assertEqual(len(result.events), 1)
        self.assertIsNone(result.events[0].source_sha)
        self.assertEqual(len(result.gaps), 3)

    def test_telemetry_preserves_missing_metrics(self) -> None:
        value = {
            "schema_version": 1,
            "generated_at": at(1).isoformat(),
            "context": {"commit_sha": "a" * 40},
            "metrics": {"tests.failed": None},
        }
        result = self.import_json(value, "telemetry")
        self.assertIsNone(result.events[0].data["metrics"]["tests.failed"])
        with self.assertRaises(ValueError):
            self.import_json(value, "unsupported")

    def test_event_import_rejects_foreign_scope(self) -> None:
        first = event(Phase.CONTEXT)
        self.assertEqual(self.import_json([first.to_dict()], "events").events, (first,))
        foreign = replace(first, scope_id="foreign", event_id="")
        with self.assertRaises(ContractError):
            self.import_json([foreign.to_dict()], "events")


if __name__ == "__main__":
    unittest.main()
