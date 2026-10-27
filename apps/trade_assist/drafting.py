# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/drafting.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist/intake.py, apps/trade_assist/roster.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/trade_assist/intake.py; DEPENDS_ON apps/trade_assist/roster.py; CONSUMED_BY apps/trade_assist/package.py
# DAG Node:    none
# Intent:      Draft every section of a trade site from the record alone, labelling each sentence with where it came from.
# ─────────────────────────────────────────────────────────────

"""Draft trade-site sections, sentence by sentence, with provenance.

A MEASURED sentence is built from record fields and names them. An ASSERTED sentence is
generic trade copy that states no fact about the business. A provider is any object with
``draft(record) -> list[Section]``; this slice ships only the deterministic template
provider, so the output depends on the record and nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from apps.trade_assist.intake import BusinessRecord
from apps.trade_assist.roster import producer

MEASURED = "MEASURED"
ASSERTED = "ASSERTED"


@dataclass(frozen=True)
class Sentence:
    """One sentence of site copy and the record fields it rests on."""

    text: str
    provenance: str
    fields: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, object]:
        """Serialize for packages."""
        return {"text": self.text, "provenance": self.provenance, "fields": list(self.fields)}


@dataclass(frozen=True)
class Section:
    """One section of the package, produced by one guildmaster."""

    role: str
    producer: str
    title: str
    sentences: tuple[Sentence, ...]
    notes: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, object]:
        """Serialize for packages."""
        return {
            "role": self.role,
            "producer": self.producer,
            "title": self.title,
            "sentences": [sentence.to_dict() for sentence in self.sentences],
            "notes": list(self.notes),
        }


class Provider(Protocol):
    """Anything that drafts sections from a record."""

    name: str

    def draft(self, record: BusinessRecord) -> list[Section]:
        """Return the drafted sections."""
        ...


def _m(text: str, *fields: str) -> Sentence:
    return Sentence(text, MEASURED, tuple(fields))


def _a(text: str) -> Sentence:
    return Sentence(text, ASSERTED)


def _section(role: str, title: str, sentences: list[Sentence], notes: list[str] | None = None) -> Section:
    return Section(role, producer(role).guildmaster, title, tuple(sentences), tuple(notes or ()))


def _where(record: BusinessRecord) -> tuple[str, tuple[str, ...]]:
    city, state = record.get("city"), record.get("state")
    if city and state:
        return f" in {city}, {state}", ("city", "state")
    if city:
        return f" in {city}", ("city",)
    if state:
        return f" in {state}", ("state",)
    return "", ()


def _contact(record: BusinessRecord) -> tuple[str, tuple[str, ...]] | None:
    if record.has("phone"):
        return f"call {record.get('phone')}", ("phone",)
    if record.has("email"):
        return f"email {record.get('email')}", ("email",)
    return None


class TemplateProvider:
    """Deterministic drafting from the record; never adds a fact the record does not hold."""

    name = "template-v1"

    def draft(self, record: BusinessRecord) -> list[Section]:
        """Draft all six producer sections."""
        return [
            self._site_plan(record),
            self._brand_brief(record),
            self._home_copy(record),
            self._service_explainers(record),
            self._offer(record),
            self._pricing(record),
        ]

    def _site_plan(self, record: BusinessRecord) -> Section:
        services = record.get("services", [])
        sentences = [_a("Page: Home, with the business name, what it does and how to get in touch.")]
        notes: list[str] = []
        if services:
            sentences.append(_m(f"Page: Services, one entry for each of the {len(services)} services listed.", "services"))
        else:
            notes.append("No services were provided, so there is no Services page yet.")
        sentences.append(_a("Page: About, holding only facts the business has supplied."))
        if record.has("phone") or record.has("email"):
            contact_fields = tuple(name for name in ("phone", "email") if record.has(name))
            sentences.append(_m("Page: Contact, with the contact details on record.", *contact_fields))
        else:
            notes.append("No phone or email is on record; the Contact page needs one before launch.")
        if record.has("website"):
            sentences.append(_m(f"Existing site to review before replacing it: {record.get('website')}.", "website"))
        return _section("site_plan", "Site plan", sentences, notes)

    def _brand_brief(self, record: BusinessRecord) -> Section:
        name = record.get("business_name")
        sentences = [
            _m(f"Lead with the name {name}, as the business writes it.", "business_name"),
            _a("Voice: plain, local and direct. Short sentences, no jargon."),
            _a("Imagery: real work and real people where photos exist; no stock claims of past jobs."),
        ]
        if record.has("tagline"):
            sentences.append(_m(f"Keep the business's own tagline: \"{record.get('tagline')}\".", "tagline"))
        return _section("brand_brief", "Brand brief", sentences)

    def _home_copy(self, record: BusinessRecord) -> Section:
        name = record.get("business_name")
        where, where_fields = _where(record)
        if record.has("trade"):
            headline = _m(f"{name}: {record.get('trade')}{where}.", "business_name", "trade", *where_fields)
        else:
            headline = _m(f"{name}{where}.", "business_name", *where_fields)
        sentences = [headline]
        if record.has("service_area"):
            areas = ", ".join(record.get("service_area"))
            sentences.append(_m(f"Serving {areas}.", "service_area"))
        if record.has("hours"):
            sentences.append(_m(f"Hours: {record.get('hours')}.", "hours"))
        sentences.append(_a("Tell us what needs doing and ask any questions you have before work starts."))
        sentences.extend(self._credentials(record))
        return _section("home_copy", "Home page copy", sentences)

    def _credentials(self, record: BusinessRecord) -> list[Sentence]:
        """Gated claims, each only when the record carries it."""
        out: list[Sentence] = []
        if record.has("license_number"):
            out.append(_m(f"Licensed, licence number {record.get('license_number')}.", "license_number"))
        if record.has("insured"):
            out.append(_m("Insured.", "insured"))
        if record.has("bonded"):
            out.append(_m("Bonded.", "bonded"))
        if record.has("certifications"):
            out.append(_m(f"Certifications: {', '.join(record.get('certifications'))}.", "certifications"))
        if record.has("years_in_business"):
            years = record.get("years_in_business")
            out.append(_m(f"In business for {years} {'year' if years == 1 else 'years'}.", "years_in_business"))
        if record.has("awards"):
            out.append(_m(f"Awards: {', '.join(record.get('awards'))}.", "awards"))
        if record.has("guarantee"):
            out.append(_m(f"Guarantee: {record.get('guarantee')}.", "guarantee"))
        return out

    def _service_explainers(self, record: BusinessRecord) -> Section:
        name = record.get("business_name")
        sentences = [
            _m(
                f"{service}: ask {name} what the job involves, how long it takes and what it will cost before work begins.",
                "services", "business_name",
            )
            for service in record.get("services", [])
        ]
        notes = [] if sentences else ["No services were provided, so there are no explainers yet."]
        return _section("service_explainers", "Service explainers", sentences, notes)

    def _offer(self, record: BusinessRecord) -> Section:
        contact = _contact(record)
        services = record.get("services", [])
        sentences: list[Sentence] = []
        notes: list[str] = []
        if contact and services:
            verb, fields = contact
            sentences.append(_m(f"To ask about {services[0].lower()}, {verb}.", "services", *fields))
        elif contact:
            verb, fields = contact
            sentences.append(_m(f"To ask about a job, {verb}.", *fields))
        else:
            sentences.append(_a("Use the contact form to ask about a job."))
            notes.append("Call to action falls back to a contact form; no phone or email is on record.")
        if record.has("free_estimates"):
            sentences.append(_m("Estimates are free.", "free_estimates"))
        return _section("offer", "Offer and call to action", sentences, notes)

    def _pricing(self, record: BusinessRecord) -> Section:
        if record.has("price_from"):
            sentences = [_m(f"Prices start at {record.get('price_from')}.", "price_from")]
        else:
            sentences = [_a("Prices are quoted per job; ask for a quote.")]
        return _section("pricing", "Pricing language", sentences)
