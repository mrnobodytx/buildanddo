# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/verify.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist/intake.py, apps/trade_assist/drafting.py, apps/trade_assist/roster.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/trade_assist/drafting.py; CONSUMED_BY apps/trade_assist/package.py
# DAG Node:    none
# Intent:      Reject any section that claims what the record does not hold, or that is unsafe to publish, and say which rule it broke.
# ─────────────────────────────────────────────────────────────

"""Oracle's claim check and Director Nexus's safety check.

Both checks report findings; neither rewrites content. A section with any finding is
rejected, and the package that holds it is blocked until a person or a new draft fixes it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from apps.trade_assist.drafting import ASSERTED, MEASURED, Section, Sentence
from apps.trade_assist.intake import BusinessRecord
from apps.trade_assist.roster import require_separation, verifier

# Claim family -> (pattern, record field that licenses it). A sentence matching a family
# passes only when it is MEASURED, names that field, and the record holds that field.
GATED: dict[str, tuple[re.Pattern[str], str]] = {
    "license": (re.compile(r"\blicen[cs]ed?\b|\blic(?:en[cs]e)?\s*(?:#|no\.?|number)", re.I), "license_number"),
    "insurance": (re.compile(r"\binsured\b|\binsurance\b", re.I), "insured"),
    "bond": (re.compile(r"\bbonded\b", re.I), "bonded"),
    "certification": (re.compile(r"\bcertifi(?:ed|cation|cations)\b", re.I), "certifications"),
    "years": (re.compile(r"\b\d+\+?\s*(?:years?|yrs?)\b|\bsince\s+(?:18|19|20)\d\d\b|\bdecades?\b", re.I), "years_in_business"),
    "rating": (re.compile(r"\b\d(?:\.\d)?\s*(?:stars?|/\s*5)\b|\brated\b", re.I), "rating"),
    "reviews": (re.compile(r"\b\d+\s+reviews?\b", re.I), "review_count"),
    "award": (re.compile(r"\baward", re.I), "awards"),
    "guarantee": (re.compile(r"\bguarante|\bwarrant(?:y|ies|ied)\b", re.I), "guarantee"),
    "price": (re.compile(r"[$£€]\s?\d|\b\d+\s?(?:dollars|usd)\b", re.I), "price_from"),
    "free": (re.compile(r"\bfree\b", re.I), "free_estimates"),
}

# Never allowed: no record field can make these true.
SUPERLATIVE = re.compile(r"#\s?1\b|\bnumber one\b|\bbest\b|\bcheapest\b|\blowest\b|\btop[- ]rated\b|\bleading\b", re.I)

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?:\+?\d[\s().-]?){10,15}")
CARD = re.compile(r"\b(?:\d[ -]?){15,16}\b")
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
MARKUP = re.compile(r"<\s*/?\s*(?:script|iframe|object|embed|style)\b|javascript\s*:|\bon\w+\s*=", re.I)
BLOCKED_WORDS = re.compile(r"\b(?:fuck|shit|bitch|cunt|nigger|faggot|retard)\w*\b", re.I)


@dataclass(frozen=True)
class Finding:
    """One rule a sentence broke."""

    check: str
    verifier: str
    role: str
    rule: str
    text: str

    def to_dict(self) -> dict[str, str]:
        """Serialize for packages."""
        return {"check": self.check, "verifier": self.verifier, "role": self.role, "rule": self.rule, "text": self.text}


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value)


def _value_present(sentence: Sentence, record: BusinessRecord, field_name: str) -> bool:
    value = record.get(field_name)
    if isinstance(value, bool):
        return value
    if isinstance(value, (list, tuple)):
        return any(str(item).lower() in sentence.text.lower() for item in value)
    return str(value).lower() in sentence.text.lower()


def check_claims(section: Section, record: BusinessRecord) -> list[Finding]:
    """Oracle: every gated claim must be measured, named and held by the record."""
    seat = verifier("claims").guildmaster
    require_separation(section.producer, seat)
    findings: list[Finding] = []
    for sentence in section.sentences:
        if sentence.provenance not in (MEASURED, ASSERTED):
            findings.append(Finding("claims", seat, section.role, "unknown provenance", sentence.text))
            continue
        if sentence.provenance == MEASURED:
            for name in sentence.fields:
                if not record.has(name):
                    findings.append(Finding("claims", seat, section.role, f"cites {name}, which the record does not hold", sentence.text))
        if SUPERLATIVE.search(sentence.text):
            findings.append(Finding("claims", seat, section.role, "superlative claim the record cannot support", sentence.text))
        for family, (pattern, field_name) in GATED.items():
            if not pattern.search(sentence.text):
                continue
            allowed = (
                sentence.provenance == MEASURED
                and field_name in sentence.fields
                and record.has(field_name)
                and _value_present(sentence, record, field_name)
            )
            if not allowed:
                findings.append(Finding("claims", seat, section.role, f"{family} claim not backed by {field_name} in the record", sentence.text))
    return findings


def check_safety(section: Section, record: BusinessRecord) -> list[Finding]:
    """Director Nexus: no markup, personal identifiers, abuse, or contact details that are not the business's."""
    seat = verifier("safety").guildmaster
    require_separation(section.producer, seat)
    findings: list[Finding] = []
    known_email = str(record.get("email", "")).lower()
    known_phone = _digits(str(record.get("phone", "")))
    for sentence in section.sentences:
        text = sentence.text
        if MARKUP.search(text):
            findings.append(Finding("safety", seat, section.role, "markup or script in copy", text))
        if SSN.search(text):
            findings.append(Finding("safety", seat, section.role, "looks like a social security number", text))
        if CARD.search(text):
            findings.append(Finding("safety", seat, section.role, "looks like a payment card number", text))
        if BLOCKED_WORDS.search(text):
            findings.append(Finding("safety", seat, section.role, "abusive or slur language", text))
        for email in EMAIL.findall(text):
            if email.lower().rstrip(".") != known_email:
                findings.append(Finding("safety", seat, section.role, "email address that is not the business's", text))
        for phone in PHONE.findall(text):
            if _digits(phone) != known_phone:
                findings.append(Finding("safety", seat, section.role, "phone number that is not the business's", text))
    return findings


def verify(sections: list[Section], record: BusinessRecord) -> list[Finding]:
    """Run both checks on every section."""
    findings: list[Finding] = []
    for section in sections:
        findings.extend(check_claims(section, record))
        findings.extend(check_safety(section, record))
    return findings
