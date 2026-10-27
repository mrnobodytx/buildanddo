# ─── CGRF Header ──────────────────────────────
# File:        tests/trade_assist/test_trade_assist.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist, apps/web/src/data/personas.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/trade_assist; CONSUMES apps/web/src/data/personas.js
# DAG Node:    none
# Intent:      Prove the package never states what the record lacks, keeps producers and verifiers apart, and cannot deliver.
# ─────────────────────────────────────────────────────────────

"""Behaviour tests for the guildmaster content assist. All records are synthetic."""

from __future__ import annotations

import contextlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path

from apps.trade_assist import cli
from apps.trade_assist.drafting import ASSERTED, MEASURED, Section, Sentence, TemplateProvider
from apps.trade_assist.intake import BusinessRecord, IntakeError, gaps, normalize
from apps.trade_assist.package import DeliveryRefused, build_package, deliver, digest
from apps.trade_assist.roster import PRODUCERS, VERIFIERS, RosterError, producer, require_separation, slugs, verifier
from apps.trade_assist.verify import check_claims, check_safety, verify

ROOT = Path(__file__).resolve().parents[2]

WALKIN = {
    "business_name": "Example Plumbing Co",
    "trade": "Plumbing",
    "city": "Houston",
    "state": "TX",
    "phone": "(713) 555-0142",
    "email": "office@example-plumbing.test",
    "services": "Drain cleaning, Water heater repair, drain cleaning",
    "service_area": ["Houston", "Katy"],
    "hours": "Mon-Fri 8-5",
    "tagline": "Plain answers, clean work",
    "website": "https://example-plumbing.test",
    "license_number": "M-00001",
    "insured": "yes",
    "bonded": True,
    "certifications": "Backflow tester",
    "years_in_business": "12",
    "awards": ["Neighbourhood pick"],
    "guarantee": "one year on labour",
    "price_from": "$95",
    "free_estimates": "true",
    "favorite_color": "blue",
}

TRADEBUILDER = {
    "id": "tb_1",
    "guild": "builder",
    "tenant_slug": "example-roofing",
    "business_name": "Example Roofing",
    "city": "Katy",
    "state": "TX",
    "status": "demo",
    "elevenlabs_agent_id": "agent_x",
    "agent_phone": "832-555-0199",
    "tenant_id": "t_9",
}


def _all_text(package: dict) -> str:
    return " ".join(s["text"] for section in package["content"]["sections"] for s in section["sentences"])


class FabricatingProvider:
    """A provider that invents claims, to prove verification catches them."""

    name = "fabricating-test"

    def __init__(self, sentence: Sentence, role: str = "home_copy") -> None:
        self.sentence = sentence
        self.role = role

    def draft(self, record: BusinessRecord) -> list[Section]:
        sections = TemplateProvider().draft(record)
        return [
            Section(s.role, s.producer, s.title, s.sentences + (self.sentence,), s.notes) if s.role == self.role else s
            for s in sections
        ]


class IntakeTests(unittest.TestCase):
    def test_walkin_maps_aliases_types_and_keeps_unknown_keys_aside(self) -> None:
        record = normalize(WALKIN, "walkin")
        self.assertEqual(record.get("services"), ["Drain cleaning", "Water heater repair"])
        self.assertIs(record.get("insured"), True)
        self.assertEqual(record.get("years_in_business"), 12)
        self.assertEqual(record.unmapped, ("favorite_color",))
        self.assertEqual(record.provenance()["phone"], "MEASURED:walkin")
        self.assertNotIn("favorite_color", record.to_dict()["fields"])

    def test_tradebuilder_columns_map_and_agent_id_is_unmapped(self) -> None:
        record = normalize(TRADEBUILDER, "tradebuilder")
        self.assertEqual(record.get("phone"), "832-555-0199")
        self.assertEqual(record.get("tenant_slug"), "example-roofing")
        self.assertEqual(record.get("record_id"), "tb_1")
        self.assertEqual(record.unmapped, ("elevenlabs_agent_id",))
        self.assertEqual(gaps(record), ["trade", "services"])

    def test_false_and_empty_values_are_absent(self) -> None:
        record = normalize({"business_name": "X", "insured": "no", "services": "", "tagline": "  "}, "walkin")
        self.assertFalse(record.has("insured"))
        self.assertFalse(record.has("services"))
        self.assertFalse(record.has("tagline"))
        self.assertFalse(record.has("missing"))
        self.assertEqual(record.get("missing", "d"), "d")

    def test_gaps_name_missing_contact(self) -> None:
        self.assertIn("contact (phone or email)", gaps(normalize({"business_name": "X"}, "walkin")))

    def test_numeric_and_boolean_coercion(self) -> None:
        record = normalize({"business_name": "X", "rating": "4.5", "review_count": 3, "bonded": 1, "free_estimates": 0.0}, "walkin")
        self.assertEqual(record.get("rating"), 4.5)
        self.assertEqual(record.get("review_count"), 3)
        self.assertIs(record.get("bonded"), True)
        self.assertFalse(record.has("free_estimates"))

    def test_rejections(self) -> None:
        bad = [
            ({"business_name": "X"}, "crm"),
            ([], "walkin"),
            ({"trade": "Plumbing"}, "walkin"),
            ({"business_name": "X" * 501}, "walkin"),
            ({"business_name": "X", "services": ",".join(str(i) for i in range(26))}, "walkin"),
            ({"business_name": "X", "services": 5}, "walkin"),
            ({"business_name": "X", "insured": "maybe"}, "walkin"),
            ({"business_name": "X", "years_in_business": "ten"}, "walkin"),
            ({"business_name": "X", "years_in_business": True}, "walkin"),
            ({"business_name": "X", "years_in_business": -1}, "walkin"),
            ({"business_name": "X", "rating": "great"}, "walkin"),
            ({"business_name": "X", "rating": 7}, "walkin"),
            ({"business_name": "X", "city": {"a": 1}}, "walkin"),
        ]
        for raw, source in bad:
            with self.subTest(raw=str(raw)[:40], source=source):
                with self.assertRaises(IntakeError):
                    normalize(raw, source)  # type: ignore[arg-type]


class RosterTests(unittest.TestCase):
    def test_every_guildmaster_exists_in_the_persona_canon(self) -> None:
        canon = set(re.findall(r"persona\('([a-z-]+)'", (ROOT / "apps/web/src/data/personas.js").read_text(encoding="utf-8")))
        self.assertTrue(canon)
        self.assertLessEqual(set(slugs()), canon)
        self.assertEqual(len(set(slugs())), len(slugs()), "one guildmaster per role")

    def test_producers_and_verifiers_are_disjoint(self) -> None:
        self.assertFalse({a.guildmaster for a in PRODUCERS} & {a.guildmaster for a in VERIFIERS})

    def test_lookups_and_separation(self) -> None:
        self.assertEqual(producer("home_copy").guildmaster, "quill")
        self.assertEqual(verifier("claims").guildmaster, "oracle")
        with self.assertRaises(RosterError):
            producer("logo")
        with self.assertRaises(RosterError):
            verifier("legal")
        with self.assertRaises(RosterError):
            require_separation("oracle", "oracle")
        require_separation("quill", "oracle")


class DraftTests(unittest.TestCase):
    def test_full_record_drafts_every_section_with_provenance(self) -> None:
        sections = TemplateProvider().draft(normalize(WALKIN, "walkin"))
        self.assertEqual([s.role for s in sections], [a.role for a in PRODUCERS])
        for section in sections:
            self.assertEqual(section.producer, producer(section.role).guildmaster)
            for sentence in section.sentences:
                self.assertIn(sentence.provenance, (MEASURED, ASSERTED))
                if sentence.provenance == MEASURED:
                    self.assertTrue(sentence.fields)
                else:
                    self.assertFalse(sentence.fields)

    def test_full_record_uses_its_gated_facts(self) -> None:
        text = _all_text(build_package(normalize(WALKIN, "walkin")))
        for expected in ("M-00001", "Insured.", "Bonded.", "Backflow tester", "12 years", "Neighbourhood pick",
                         "one year on labour", "$95", "Estimates are free", "Plain answers, clean work",
                         "Serving Houston, Katy", "Mon-Fri 8-5", "https://example-plumbing.test"):
            self.assertIn(expected, text)

    def test_sparse_record_states_no_gated_claim(self) -> None:
        package = build_package(normalize({"business_name": "Bare Co"}, "walkin"))
        text = _all_text(package)
        for word in ("licen", "insured", "bonded", "certif", "years", "award", "guarantee", "$", "free"):
            self.assertNotIn(word, text.lower())
        self.assertIn("Use the contact form", text)
        notes = [note for section in package["content"]["sections"] for note in section["notes"]]
        self.assertTrue(any("no Services page" in note for note in notes))
        self.assertTrue(any("Contact page needs one" in note for note in notes))

    def test_location_and_contact_variants(self) -> None:
        city_only = _all_text(build_package(normalize({"business_name": "A", "city": "Waco", "email": "a@a.test"}, "walkin")))
        self.assertIn("A in Waco.", city_only)
        self.assertIn("To ask about a job, email a@a.test.", city_only)
        state_only = _all_text(build_package(normalize({"business_name": "B", "state": "TX", "years_in_business": 1}, "walkin")))
        self.assertIn("B in TX.", state_only)
        self.assertIn("for 1 year.", state_only)


class VerifyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.bare = normalize({"business_name": "Bare Co", "phone": "713-555-0100", "email": "a@bare.test"}, "walkin")

    def _findings(self, sentence: Sentence, record: BusinessRecord | None = None) -> list[dict]:
        return build_package(record or self.bare, FabricatingProvider(sentence))["findings"]

    def test_template_output_passes_both_checks(self) -> None:
        for raw, source in ((WALKIN, "walkin"), (TRADEBUILDER, "tradebuilder"), ({"business_name": "Bare"}, "walkin")):
            record = normalize(raw, source)
            self.assertEqual(verify(TemplateProvider().draft(record), record), [])

    def test_oracle_blocks_every_unbacked_gated_claim(self) -> None:
        claims = [
            "Fully licensed and insured.", "Licence no. 12345.", "Bonded crews.", "Certified technicians.",
            "Serving you for 20 years.", "Family owned since 1998.", "Rated 4.9 stars.", "Over 300 reviews.",
            "Award-winning service.", "Satisfaction guaranteed.", "Calls from $49.", "Free estimates.",
        ]
        for claim in claims:
            with self.subTest(claim=claim):
                for provenance in (ASSERTED, MEASURED):
                    findings = self._findings(Sentence(claim, provenance, ("business_name",) if provenance == MEASURED else ()))
                    self.assertTrue(any(f["check"] == "claims" and f["verifier"] == "oracle" for f in findings), claim)

    def test_oracle_blocks_superlatives_even_when_measured(self) -> None:
        findings = self._findings(Sentence("The best plumber in town.", MEASURED, ("business_name",)))
        self.assertTrue(any("superlative" in f["rule"] for f in findings))

    def test_oracle_blocks_a_claim_whose_value_differs_from_the_record(self) -> None:
        record = normalize({"business_name": "X", "license_number": "M-1"}, "walkin")
        findings = self._findings(Sentence("Licence number M-999.", MEASURED, ("license_number",)), record)
        self.assertTrue(any("license claim" in f["rule"] for f in findings))
        listed = normalize({"business_name": "X", "awards": ["Gold"]}, "walkin")
        self.assertTrue(self._findings(Sentence("Award: Silver.", MEASURED, ("awards",)), listed))

    def test_oracle_blocks_missing_fields_and_unknown_provenance(self) -> None:
        self.assertTrue(any("does not hold" in f["rule"] for f in self._findings(Sentence("Open late.", MEASURED, ("hours",)))))
        self.assertTrue(any("unknown provenance" in f["rule"] for f in self._findings(Sentence("Hi.", "GUESSED"))))

    def test_director_blocks_unsafe_content(self) -> None:
        unsafe = [
            "<script>alert(1)</script>",
            "Click javascript:void(0)",
            "SSN 123-45-6789 on file.",
            "Card 4111 1111 1111 1111.",
            "Email boss@elsewhere.test instead.",
            "Or call 281-555-0000.",
            "No shit, we fix it.",
        ]
        for text in unsafe:
            with self.subTest(text=text):
                findings = self._findings(Sentence(text, ASSERTED))
                self.assertTrue(any(f["check"] == "safety" and f["verifier"] == "director-nexus" for f in findings), text)

    def test_business_contact_details_pass_safety(self) -> None:
        self.assertEqual(self._findings(Sentence("Call 713-555-0100 or email a@bare.test.", MEASURED, ("phone", "email"))), [])

    def test_a_producer_cannot_verify_itself(self) -> None:
        section = Section("claims", "oracle", "self", (Sentence("x", ASSERTED),))
        with self.assertRaises(RosterError):
            check_claims(section, self.bare)
        section = Section("safety", "director-nexus", "self", (Sentence("x", ASSERTED),))
        with self.assertRaises(RosterError):
            check_safety(section, self.bare)


class PackageTests(unittest.TestCase):
    def test_ready_package_is_an_open_mission_with_a_dry_run_envelope(self) -> None:
        package = build_package(normalize(WALKIN, "walkin"))
        self.assertEqual(package["status"], "ready_for_review")
        self.assertEqual(package["mission"]["status"], "open")
        self.assertTrue(package["mission"]["review_required"])
        self.assertEqual(package["mission"]["verifiers"], ["oracle", "director-nexus"])
        self.assertEqual(package["envelope"]["target"], "walkin")
        self.assertEqual(package["envelope"]["mode"], "dry_run")
        self.assertEqual(package["envelope"]["content_digest"], digest(package["content"]))
        self.assertEqual(package["package_id"], "tap-" + package["content_digest"][:16])

    def test_packages_are_deterministic_and_content_bound(self) -> None:
        first = build_package(normalize(WALKIN, "walkin"))
        second = build_package(normalize(WALKIN, "walkin"))
        self.assertEqual(first["content_digest"], second["content_digest"])
        changed = build_package(normalize(dict(WALKIN, city="Austin"), "walkin"))
        self.assertNotEqual(first["content_digest"], changed["content_digest"])

    def test_tradebuilder_envelope_references_the_tenant(self) -> None:
        package = build_package(normalize(TRADEBUILDER, "tradebuilder"))
        self.assertEqual(package["envelope"]["target"], "tradebuilder")
        self.assertEqual(package["envelope"]["reference"], "example-roofing")

    def test_blocked_package_names_its_rejected_sections(self) -> None:
        package = build_package(normalize({"business_name": "X"}, "walkin"), FabricatingProvider(Sentence("Free quotes.", ASSERTED), "offer"))
        self.assertEqual(package["status"], "blocked")
        self.assertEqual(package["rejected_sections"], ["offer"])
        self.assertEqual(package["mission"]["blocked_by"], ["offer"])
        receipt = deliver(package)
        self.assertFalse(receipt["eligible"])
        self.assertFalse(receipt["delivered"])

    def test_delivery_is_dry_run_only_and_checks_the_digest(self) -> None:
        package = build_package(normalize(WALKIN, "walkin"))
        receipt = deliver(package)
        self.assertEqual(receipt, {
            "mode": "dry_run", "delivered": False, "would_send_to": "walkin", "reference": "Example Plumbing Co",
            "content_digest": package["content_digest"], "eligible": True, "reason": "dry run",
        })
        for mode in ("live", "send", "production"):
            with self.assertRaises(DeliveryRefused):
                deliver(package, mode)
        package["content"]["sections"][0]["title"] = "tampered"
        with self.assertRaises(ValueError):
            deliver(package)


class CliTests(unittest.TestCase):
    def _run(self, argv: list[str]) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = cli.main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_draft_batch_and_verify(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "in").mkdir()
            (base / "in" / "a.json").write_text(json.dumps(WALKIN), encoding="utf-8")
            (base / "in" / "b.json").write_text(json.dumps([TRADEBUILDER, {"business_name": "Bare"}]), encoding="utf-8")
            code, out, _ = self._run(["draft", "--source", "walkin", "--input", str(base / "in" / "a.json"), "--output", str(base / "out")])
            self.assertEqual(code, 0)
            written = Path(json.loads(out)["packages"][0]["file"])
            self.assertTrue(written.exists())
            code, out, _ = self._run(["batch", "--source", "tradebuilder", "--input", str(base / "in"), "--output", str(base / "out")])
            self.assertEqual(code, 0)
            self.assertEqual(len(json.loads(out)["packages"]), 3)
            code, out, _ = self._run(["verify", "--package", str(written)])
            self.assertEqual(code, 0)
            self.assertTrue(json.loads(out)["digest_intact"])
            tampered = json.loads(written.read_text(encoding="utf-8"))
            tampered["content"]["provider"] = "edited"
            written.write_text(json.dumps(tampered), encoding="utf-8")
            code, out, _ = self._run(["verify", "--package", str(written)])
            self.assertEqual(code, 1)
            self.assertFalse(json.loads(out)["digest_intact"])
            code, out, _ = self._run(["draft", "--source", "walkin", "--input", str(base / "in" / "a.json")])
            self.assertEqual(code, 0)
            self.assertIsNone(json.loads(out)["packages"][0]["file"])

    def test_a_claim_typed_into_the_intake_blocks_the_package(self) -> None:
        raw = {"business_name": "X", "phone": "713-555-0100", "services": "Best drain cleaning in Houston"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            code, out, _ = self._run(["draft", "--source", "walkin", "--input", str(path)])
        self.assertEqual(code, 1)
        report = json.loads(out)["packages"][0]
        self.assertEqual(report["status"], "blocked")
        self.assertFalse(report["dry_run"]["eligible"])

    def test_bad_inputs_exit_two(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "bad.json").write_text("{not json", encoding="utf-8")
            (base / "noname.json").write_text(json.dumps({"trade": "x"}), encoding="utf-8")
            (base / "notpkg.json").write_text(json.dumps({"a": 1}), encoding="utf-8")
            (base / "big.json").write_bytes(b" " * (cli.MAX_INPUT + 1))
            cases = [
                ["draft", "--source", "walkin", "--input", str(base / "bad.json")],
                ["draft", "--source", "walkin", "--input", str(base / "noname.json")],
                ["draft", "--source", "walkin", "--input", str(base / "missing.json")],
                ["draft", "--source", "walkin", "--input", str(base / "big.json")],
                ["batch", "--source", "walkin", "--input", str(base / "bad.json")],
                ["verify", "--package", str(base / "notpkg.json")],
            ]
            for argv in cases:
                with self.subTest(argv=argv[0] + " " + Path(argv[-1]).name):
                    code, _, err = self._run(argv)
                    self.assertEqual(code, 2)
                    self.assertIn("error", json.loads(err))


if __name__ == "__main__":
    unittest.main()
