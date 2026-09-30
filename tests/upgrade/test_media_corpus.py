# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_media_corpus.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     scripts/publish/media_contracts.py, scripts/publish/media_corpus.py, scripts/publish/media_library.py, tests/upgrade/test_activity_publish.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/publish/media_contracts.py; VALIDATES scripts/publish/media_corpus.py; VALIDATES scripts/publish/media_library.py; CONSUMES tests/upgrade/test_activity_publish.py; CONSUMES tests/upgrade/test_evolution_support.py
# Intent:      Prove that actual cited bytes, receiving review pins, bounded drafts and retained observations cannot fabricate media or publishing authority.
# ───────────────────────────────────────────────────────────────

"""Use explicitly synthetic source and provider observations; never call a live service."""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import AuthorityTier
from scripts.publish import media_corpus as corpus
from scripts.publish import media_library as library
from scripts.publish.media_contracts import (
    FORMATS,
    CorpusOptions,
    EngagementMetric,
    MediaArtifact,
    MediaClaim,
    MediaObservation,
    MediaSource,
    public_text,
    public_url,
    relative_path,
)
from tests.upgrade.test_activity_publish import _event, _fleet_map, publisher
from tests.upgrade.test_evolution_support import ACTOR, VERIFIER, verification

AT = datetime(2026, 9, 30, 18, 0, tzinfo=timezone.utc)
FACTS = {
    "problem": "A synthetic worker retried the same request.",
    "action": "The test bound the retry to its original request.",
    "outcome": "The synthetic regression passed once.",
    "lesson": "Inspect the saved request before retrying an uncertain operation.",
    "limitation": "No provider call or deployment was performed.",
}


def artifact(root, name, content, at=AT):
    raw = content.encode() if isinstance(content, str) else content
    (root / name).parent.mkdir(parents=True, exist_ok=True)
    (root / name).write_bytes(raw)
    return MediaArtifact(
        name.replace("/", "-"), name, hashlib.sha256(raw).hexdigest(), len(raw), at
    )


def source(root, **changes):
    evidence = artifact(root, "source/report.txt", "\n".join(FACTS.values()))
    value = MediaSource(
        "buildanddo.media-source/v1",
        "synthetic-media-story",
        "synthetic-workspace",
        "source_change",
        "a" * 40,
        ACTOR,
        (),
        AT,
        AT + timedelta(days=7),
        "Synthetic retry lesson",
        "Test reviewers",
        "en",
        "https://example.com/source",
        "synthetic-public-disclosure",
        (evidence,),
        tuple(
            MediaClaim(section, section, text, (evidence.artifact_id,))
            for section, text in FACTS.items()
        ),
    )
    return replace(value, **changes)


def reviewed(value):
    receipt = verification(
        value.subject,
        tuple(str(s) for s in value.required_sources),
        when=AT,
        checks=("claim_support", "public_disclosure"),
        actor=value.producer,
        tier=AuthorityTier.A1,
    )
    policy = ReviewPolicy(
        receipt.policy.policy_id,
        receipt.policy.policy_version,
        (VERIFIER,),
        (ContentDigest(digest(receipt)),),
    )
    return receipt, policy


class MediaFixture(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = source(self.root)

    def compile(self, options=None, **kwargs):
        return corpus.compile_corpus(
            self.source, options or CorpusOptions(), self.root, at=AT, **kwargs
        )

    def package(self, options=None):
        value = self.compile(options)
        output = self.root / "corpus"
        corpus.write_corpus(value, output)
        return value, output


class MediaContractTests(MediaFixture):
    def test_wire_round_trip_and_unknown_fields(self):
        self.assertEqual(MediaSource.from_dict(self.source.to_dict()), self.source)
        self.assertEqual(CorpusOptions.from_dict({}), CorpusOptions())
        for fields in (
            {"verified": True},
            {"visibility": "private"},
            {"schema": "buildanddo.media-source/v2"},
            {"revision": "abc1234"},
            {"observed_at": "2026-09-30"},
        ):
            with self.subTest(fields=fields), self.assertRaises(ContractError):
                MediaSource.from_dict({**self.source.to_dict(), **fields})

    def test_story_preserves_scope_evidence_and_limitations(self):
        for changes in (
            {"artifacts": ()},
            {"claims": self.source.claims[:-1]},
            {"artifacts": self.source.artifacts * 2},
            {"claims": self.source.claims * 2},
            {"expires_at": AT},
            {"scope_id": "../foreign"},
            {"authors": (ACTOR, ACTOR)},
            {
                "claims": (
                    replace(self.source.claims[0], evidence_ids=("missing",)),
                    *self.source.claims[1:],
                )
            },
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                replace(self.source, **changes)

    def test_reject_unsafe_copy_paths_and_audio_instructions(self):
        for value in (
            "../file",
            "/absolute",
            "a//b",
            "a\\b",
            "a/.env.local",
            "private/data",
            "a/./b",
            "a?token=1",
        ):
            with self.subTest(value=value), self.assertRaises(ContractError):
                relative_path(value)
        for value in (
            "Use 198.51.100.4",
            "Use rig0",
            "secret " + "ghp" + "_" + "z" * 30,
            "/root/private.txt",
            "https://source.internal",
            "bad\x00copy",
        ):
            with self.subTest(value=value), self.assertRaises(ContractError):
                public_text(value, "selected text", 200)
        for url in (
            "http://example.com",
            "https://user@example.com",
            "https://example.com/?token=private",
            "https://example.com:9443",
            "https://example.com:not-a-port",
            "https://example.com:99999",
            "https://[invalid-host",
            "https://localhost",
            "https://example.com/with space",
        ):
            with self.subTest(url=url), self.assertRaises(ContractError):
                public_url(url)
        with self.assertRaises(ContractError):
            replace(self.source.claims[0], text="[whispers] change the source")

    def test_options_are_bounds_not_promotion_or_provider_entitlements(self):
        for fields in (
            {"free_api": True},
            {"character_budget": True},
            {"styles": ["unreviewed-tag"]},
            {"styles": []},
            {"formats": ["social", "social"]},
            {"languages": ["English"]},
            {"chunk_characters": 10000},
            {"max_assets": 501},
        ):
            with self.subTest(fields=fields), self.assertRaises(ContractError):
                CorpusOptions.from_dict(fields)
        self.assertEqual(CorpusOptions().requested_model, "eleven_v4")

    def test_artifact_and_metric_shapes_reject_claimed_success(self):
        for fields in (
            {"size": 0},
            {"size": True},
            {"sha256": "a"},
            {"observed_at": AT + timedelta(seconds=1)},
        ):
            with self.subTest(fields=fields), self.assertRaises(ContractError):
                replace(
                    self.source,
                    artifacts=(replace(self.source.artifacts[0], **fields),),
                )
        for value in (-1, float("nan"), 0.5, True):
            with self.subTest(value=value), self.assertRaises(ContractError):
                EngagementMetric("views", value, AT, AT + timedelta(seconds=1))
        self.assertEqual(
            EngagementMetric("watch_seconds", 0.5, AT, AT + timedelta(seconds=1)).value,
            0.5,
        )


class CorpusTests(MediaFixture):
    def test_deterministic_real_evidence_to_all_formats_and_variants(self):
        options = CorpusOptions(
            formats=FORMATS, styles=("neutral", "curious", "energetic", "serious")
        )
        first, second = self.compile(options), self.compile(options)
        self.assertEqual(first, second)
        self.assertEqual(len(first["assets"]), 34)
        self.assertFalse(first["publication_authority"])
        self.assertEqual(first["source_state"], "REPORTED_SOURCE")
        total = 0
        for item in first["assets"]:
            self.assertIn(FACTS["limitation"], item["request"]["script"])
            self.assertIn(self.source.source_url, item["draft"]["body"])
            self.assertEqual(
                hashlib.sha256(item["draft"]["body"].encode()).hexdigest(),
                item["draft"]["body_sha256"],
            )
            if item["target_seconds"]:
                total += len(item["request"]["script"])
        self.assertEqual(first["generation_characters_per_lane"], total)
        self.assertEqual(first["production_plans"]["api"]["cost"], None)
        self.assertEqual(
            first["production_plans"]["elevencreative"]["promotion_eligibility"],
            "UNKNOWN",
        )

    def test_no_padding_fake_translation_or_free_generation(self):
        value = self.compile(CorpusOptions(languages=("en", "es")))
        self.assertEqual(value["translation_tasks"][0]["language"], "es")
        self.assertTrue(
            all(item["request"]["language"] == "en" for item in value["assets"])
        )
        debrief = next(
            item
            for item in value["assets"]
            if item["request"]["format"] == "guild_debrief"
        )
        self.assertEqual(debrief["duration_state"], "NEEDS_EDIT")
        self.assertIn("not quotations from real workers", debrief["request"]["script"])
        self.assertTrue(
            all(plan["state"] == "HOLD" for plan in value["production_plans"].values())
        )
        self.assertIsNone(
            value["production_plans"]["api"]["studio_promotion_covers_api"]
        )

    def test_large_scripts_chunk_at_claims_and_repeat_limitations(self):
        value = self.compile(
            CorpusOptions(formats=("daily_audio",), chunk_characters=300)
        )
        self.assertGreater(len(value["assets"]), 1)
        for item in value["assets"]:
            self.assertLessEqual(item["characters"], 300)
            self.assertIn(FACTS["limitation"], item["request"]["script"])
        self.assertEqual(
            {i for a in value["assets"] for i in a["claim_ids"]}, set(FACTS)
        )
        for options in (CorpusOptions(character_budget=1), CorpusOptions(max_assets=1)):
            with self.assertRaises(ContractError):
                self.compile(options)

    def test_missing_altered_and_uncited_bytes_fail_before_output(self):
        before = self.source.claims[0]
        self.source = replace(
            self.source,
            claims=(
                replace(before, text="An invented successful deployment."),
                *self.source.claims[1:],
            ),
        )
        with self.assertRaisesRegex(ContractError, "exact excerpt"):
            self.compile()
        self.source = source(self.root)
        (self.root / self.source.artifacts[0].path).write_text("changed")
        with self.assertRaisesRegex(ContractError, "digest mismatch"):
            self.compile()
        (self.root / self.source.artifacts[0].path).unlink()
        with self.assertRaisesRegex(ContractError, "unavailable"):
            self.compile()

    def test_future_stale_and_naive_clocks_never_become_current_source(self):
        self.assertEqual(
            corpus.validate_source(self.source, self.root, at=AT + timedelta(days=8)),
            "STALE",
        )
        for now in (AT - timedelta(seconds=1), AT.replace(tzinfo=None)):
            with self.assertRaises(ContractError):
                corpus.validate_source(self.source, self.root, at=now)

    def test_independent_receipt_and_receiving_pins_are_both_required(self):
        receipt, policy = reviewed(self.source)
        value = self.compile(verification=receipt, policy=policy)
        self.assertEqual(value["source_state"], "REVIEWED_SOURCE")
        self.assertIn(
            "human_script_approval", value["production_plans"]["api"]["holds"]
        )
        for kwargs in (
            {"verification": receipt},
            {"policy": policy},
            {"verification": receipt, "policy": replace(policy, receipt_digests=())},
        ):
            with self.assertRaises(ContractError):
                self.compile(**kwargs)

    def test_author_alias_and_changed_source_cannot_use_an_old_review(self):
        receipt, policy = reviewed(self.source)
        self.source = replace(self.source, authors=(VERIFIER,))
        other_receipt, other_policy = reviewed(self.source)
        with self.assertRaisesRegex(ContractError, "participants"):
            self.compile(verification=other_receipt, policy=other_policy)
        self.source = replace(self.source, authors=(), title="A different story")
        with self.assertRaises(ContractError):
            self.compile(verification=receipt, policy=policy)

    def test_write_inspect_and_reject_changed_or_extra_files(self):
        value, output = self.package()
        self.assertEqual(
            corpus.read_corpus(output)["corpus_digest"], value["corpus_digest"]
        )
        with self.assertRaises(ContractError):
            corpus.write_corpus(value, output)
        (output / "unexpected.txt").write_text("unreferenced")
        with self.assertRaisesRegex(ContractError, "unreferenced"):
            corpus.read_corpus(output)
        (output / "unexpected.txt").unlink()
        next((output / "scripts").iterdir()).write_text("altered narration")
        with self.assertRaisesRegex(ContractError, "digest mismatch"):
            corpus.read_corpus(output)

    def test_paths_symlinks_json_duplicates_and_binary_source_fail(self):
        original = self.root / self.source.artifacts[0].path
        copy = self.root / "copy.txt"
        original.rename(copy)
        original.symlink_to(copy)
        with self.assertRaisesRegex(ContractError, "symlink"):
            self.compile()
        original.unlink()
        original.write_bytes(b"\xff")
        self.source = replace(
            self.source,
            artifacts=(
                replace(
                    self.source.artifacts[0],
                    size=1,
                    sha256=hashlib.sha256(b"\xff").hexdigest(),
                ),
            ),
        )
        with self.assertRaisesRegex(ContractError, "UTF-8"):
            self.compile()
        path = self.root / "duplicate.json"
        path.write_text('{"schema": 1, "schema": 2}')
        with self.assertRaises(ContractError):
            corpus.load_object(path)

    def test_resigning_a_changed_file_manifest_does_not_rebind_the_original_job(self):
        value, output = self.package()
        item = value["assets"][0]
        name = f"scripts/{item['asset_id']}.txt"
        raw = b"Changed content with a different claim."
        (output / name).write_bytes(raw)
        manifest_path = output / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["files"][name] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "size": len(raw),
        }
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ContractError, "production request"):
            corpus.read_corpus(output)

    def test_non_english_source_requires_an_authored_template_and_review(self):
        self.source = replace(self.source, language="es")
        value = self.compile(CorpusOptions(languages=("es",)))
        self.assertEqual(value["assets"], [])
        self.assertEqual(value["translation_tasks"][0]["state"], "HOLD")
        self.assertEqual(value["generation_characters_per_lane"], 0)

    def test_actual_publication_projection_is_retained_and_bound(self):
        event = _event(
            "Synthetic public release",
            "Synthetic release observation.",
            {
                "build": "PASS",
                "limitation": FACTS["limitation"],
                "problem": FACTS["problem"],
            },
        )
        with _fleet_map(None):
            projection, finding = publisher.compile_public_projection(event)
        self.assertIsNone(finding)
        raw = json.dumps(projection).encode()
        reference = artifact(
            self.root,
            "source/public-activity.json",
            raw,
            datetime(2026, 9, 22, 10, 30, tzinfo=timezone.utc),
        )
        value = replace(
            self.source,
            event_id=projection["event_id"],
            title=projection["title"],
            revision="abc1234" + "0" * 33,
            observed_at=reference.observed_at,
            source_url=projection["public_url"],
            artifacts=(reference,),
            claims=tuple(
                MediaClaim(section, section, text, (reference.artifact_id,))
                for section, text in {
                    "problem": FACTS["problem"],
                    "action": projection["summary"],
                    "outcome": projection["deployment_state"],
                    "limitation": FACTS["limitation"],
                }.items()
            ),
        )
        corpus.validate_activity(value, self.root / reference.path)
        self.assertEqual(
            corpus.validate_source(value, self.root, at=AT), "REPORTED_SOURCE"
        )
        with self.assertRaises(ContractError):
            corpus.validate_activity(
                replace(value, revision="f" * 40), self.root / reference.path
            )
        with (
            mock.patch.multiple(
                publisher,
                build_release_event=mock.Mock(return_value=event),
                _load_ledger=mock.Mock(return_value={}),
                _save_ledger=mock.Mock(),
                _publish_wiki=mock.Mock(return_value={}),
                _publish_discord=mock.Mock(return_value={}),
                _publish_reddit=mock.Mock(return_value={}),
            ),
            _fleet_map(None),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            result = publisher.publish("ignored", "ignored", {})
        self.assertEqual(result["public_event"], projection)

    def test_cli_compiles_and_inspects_without_importing_the_deploy_secret_loader(self):
        source_path = self.root / "source.json"
        source_path.write_text(json.dumps(self.source.to_dict()))
        options = self.root / "options.json"
        options.write_text(json.dumps(CorpusOptions().to_dict()))
        output = self.root / "cli-output"
        with (
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(
                corpus.main(
                    [
                        "compile",
                        str(source_path),
                        "--options",
                        str(options),
                        "--evidence-root",
                        str(self.root),
                        "--at",
                        AT.isoformat(),
                        "--output",
                        str(output),
                    ]
                ),
                0,
            )
            self.assertEqual(corpus.main(["inspect", str(output)]), 0)
            self.assertEqual(corpus.main(["schema", "source"]), 0)
            self.assertEqual(corpus.main(["schema", "options"]), 0)
            self.assertEqual(corpus.main(["schema", "observation"]), 0)
            self.assertEqual(corpus.main(["inspect", str(self.root / "absent")]), 1)


class MediaLibraryTests(MediaFixture):
    def setUp(self):
        super().setUp()
        self.value, self.output = self.package(CorpusOptions(formats=("daily_audio",)))
        self.asset = self.value["assets"][0]
        self.evidence = artifact(
            self.root, "receipts/provider.json", '{"synthetic": true}', AT
        )
        self.media = artifact(
            self.root,
            "media/synthetic.wav",
            b"RIFFsynthetic bytes; not actual audio",
            AT,
        )
        self.generation = MediaObservation(
            "buildanddo.media-observation/v1",
            "generation-1",
            self.asset["asset_id"],
            self.asset["request_digest"],
            "attempt-1",
            "generation",
            "elevenlabs",
            AT,
            "succeeded",
            self.evidence,
            self.media,
        )
        self.publication = MediaObservation(
            "buildanddo.media-observation/v1",
            "publication-1",
            self.asset["asset_id"],
            self.asset["request_digest"],
            "publish-1",
            "publication",
            "metricool",
            AT + timedelta(seconds=1),
            "succeeded",
            self.evidence,
            media_sha256=self.media.sha256,
            publication_id="synthetic-post",
            publication_url="https://example.com/post",
        )
        self.engagement = MediaObservation(
            "buildanddo.media-observation/v1",
            "engagement-1",
            self.asset["asset_id"],
            self.asset["request_digest"],
            "read-1",
            "engagement",
            "metricool",
            AT + timedelta(hours=2),
            "succeeded",
            self.evidence,
            media_sha256=self.media.sha256,
            publication_id="synthetic-post",
            publication_url="https://example.com/post",
            metrics=(
                EngagementMetric(
                    "views", 10, AT + timedelta(seconds=2), AT + timedelta(hours=1)
                ),
            ),
        )

    def reconcile(self, rows=()):
        return library.reconcile(
            self.output, tuple(rows), self.root, at=AT + timedelta(hours=3)
        )

    def test_empty_library_is_unmeasured_and_does_not_invent_work(self):
        result = self.reconcile()
        self.assertEqual(result["counts"]["reported_generations"], 0)
        self.assertEqual(result["next_work"][0]["status"], "proposed")

    def test_lost_response_retry_and_out_of_order_history_count_once(self):
        unknown = replace(
            self.generation, observation_id="unknown-1", state="unknown", media=None
        )
        success = replace(self.generation, observed_at=AT + timedelta(milliseconds=1))
        rows = (unknown, success, self.publication, self.engagement, success)
        first, second = self.reconcile(rows), self.reconcile(reversed(rows))
        self.assertEqual(first, second)
        self.assertEqual(first["counts"]["generation_attempts"], 1)
        self.assertEqual(first["counts"]["observations"], 4)
        self.assertEqual(first["counts"]["reported_publications"], 1)
        self.assertEqual(first["authentication"], "reported_observations_only")

    def test_later_repeat_receipt_preserves_original_generation_and_publication_time(
        self,
    ):
        rows = (
            self.generation,
            self.publication,
            self.engagement,
            replace(
                self.generation,
                observation_id="generation-recheck",
                observed_at=AT + timedelta(hours=2),
            ),
            replace(
                self.publication,
                observation_id="publication-recheck",
                observed_at=AT + timedelta(hours=2),
            ),
        )
        self.assertEqual(self.reconcile(rows)["counts"]["reported_publications"], 1)

    def test_engagement_replaces_same_window_and_preserves_overlapping_windows(self):
        newer = replace(
            self.engagement,
            observation_id="engagement-2",
            observed_at=AT + timedelta(hours=2, minutes=1),
            metrics=(replace(self.engagement.metrics[0], value=14),),
        )
        overlap = replace(
            newer,
            observation_id="engagement-3",
            metrics=(
                replace(
                    newer.metrics[0],
                    window_end=AT + timedelta(hours=1, minutes=30),
                    value=17,
                ),
            ),
        )
        result = self.reconcile(
            (self.generation, self.publication, self.engagement, newer, overlap)
        )
        self.assertEqual(
            sorted(m["value"] for m in result["engagement_snapshots"]), [14, 17]
        )
        self.assertEqual(result["next_work"], [])
        posthog = replace(
            self.engagement,
            observation_id="posthog-1",
            provider="posthog",
            publication_provider="metricool",
        )
        self.assertEqual(
            self.reconcile((self.generation, self.publication, posthog))[
                "engagement_snapshots"
            ][0]["provider"],
            "posthog",
        )

    def test_foreign_missing_changed_future_and_ambiguous_observations_fail(self):
        cases = (
            (replace(self.generation, asset_id="b" * 64),),
            (replace(self.generation, request_digest="b" * 64),),
            (replace(self.generation, observed_at=AT + timedelta(days=1)),),
            (self.publication,),
            (self.engagement,),
            (self.generation, replace(self.generation, state="failed", media=None)),
            (
                self.generation,
                replace(
                    self.generation,
                    observation_id="different",
                    state="failed",
                    media=None,
                ),
            ),
            (
                self.generation,
                self.publication,
                replace(
                    self.engagement, publication_url="https://example.com/different"
                ),
            ),
        )
        for rows in cases:
            with self.subTest(rows=rows), self.assertRaises(ContractError):
                self.reconcile(rows)
        (self.root / self.media.path).write_bytes(b"changed")
        with self.assertRaisesRegex(ContractError, "digest mismatch"):
            self.reconcile((self.generation,))

    def test_success_requires_original_media_publication_and_metric_evidence(self):
        for row, fields in (
            (self.generation, {"media": None}),
            (self.publication, {"publication_id": None}),
            (self.engagement, {"metrics": ()}),
            (self.engagement, {"metrics": self.engagement.metrics * 2}),
        ):
            with self.subTest(fields=fields), self.assertRaises(ContractError):
                replace(row, **fields)
        result = self.reconcile((replace(self.generation, state="failed", media=None),))
        self.assertEqual(result["counts"]["reported_generations"], 0)
        self.assertEqual(result["history"][0]["state"], "failed")

    def test_cli_writes_new_observation_index_and_preserves_previous_file(self):
        observations = self.root / "observation.json"
        observations.write_text(json.dumps(self.generation.to_dict()))
        output = self.root / "library.json"
        args = [
            str(self.output),
            str(observations),
            "--evidence-root",
            str(self.root),
            "--at",
            (AT + timedelta(hours=3)).isoformat(),
            "--output",
            str(output),
        ]
        with (
            contextlib.redirect_stdout(io.StringIO()),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(library.main(args), 0)
            before = output.read_bytes()
            self.assertEqual(library.main(args), 1)
            self.assertEqual(before, output.read_bytes())


if __name__ == "__main__":
    unittest.main()
