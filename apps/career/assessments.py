# ─── CGRF Header ──────────────────────────────
# File:        apps/career/assessments.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/ledger.py, apps/career/passport.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/ledger.py; DEPENDS_ON apps/career/taxonomy.py; CONSUMES apps/career/imports.py; PRODUCES apps/career/passport.py
# DAG Node:    none
# Intent:      Test an imported or claimed capability with timed, limited, re-gradable quizzes whose answers the candidate never receives.
# ─────────────────────────────────────────────────────────────

"""Issue, grade and re-grade capability assessments.

- The grader holds the question bank; the candidate's form carries prompts and
  shuffled choices only, never answer keys.
- Each attempt draws ``ITEMS_PER_ATTEMPT`` items and shuffles choices from a seed.
- At most ``MAX_ATTEMPTS`` attempts per capability in ``WINDOW_DAYS``; every
  attempt, passed or failed, is recorded in a hash-chained ledger.
- A submission after the time limit fails regardless of score.
- A pass is ASSESSED/OBSERVED: the system graded a passing attempt, but who
  answered is not established. It is VERIFIED only when a proctor other than
  the candidate records a receipt.
- Any grade can be recomputed from the ledger and the bank (``regrade``).
"""

from __future__ import annotations

import hashlib
import random
from datetime import timedelta
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError, ClaimState, EvidenceRef, Participation, canonical_digest
from apps.career.ledger import append_chain, read_chain
from apps.career.passport import parse_instant
from apps.career.taxonomy import BY_ID

ITEMS_PER_ATTEMPT = 5
PASS_SCORE = 0.8
MAX_ATTEMPTS = 3
WINDOW_DAYS = 30
TIME_LIMIT_MINUTES = 30
KINDS = ("single", "multiple")


def load_bank(raw: Any) -> dict[str, Any]:
    """Validate a question bank and return it indexed by item id with its digest."""
    if not isinstance(raw, dict) or not isinstance(raw.get("items"), list) or not raw.get("bank_id"):
        raise CareerError("bank needs a bank_id and an items list")
    items: dict[str, dict[str, Any]] = {}
    for item in raw["items"]:
        ident = item.get("id") if isinstance(item, dict) else None
        if not isinstance(ident, str) or not ident or ident in items:
            raise CareerError("every bank item needs a unique id")
        choices, answer, kind = item.get("choices"), item.get("answer"), item.get("kind", "single")
        if item.get("capability") not in BY_ID:
            raise CareerError(f"{ident}: unknown capability")
        if not isinstance(item.get("prompt"), str) or not item["prompt"].strip():
            raise CareerError(f"{ident}: prompt is required")
        if not isinstance(choices, list) or len(choices) < 2 or len(set(map(str, choices))) != len(choices):
            raise CareerError(f"{ident}: needs at least two distinct choices")
        if kind not in KINDS or not isinstance(answer, list) or not answer or not all(
            isinstance(index, int) and 0 <= index < len(choices) for index in answer
        ) or (kind == "single" and len(answer) != 1):
            raise CareerError(f"{ident}: answer must index the choices ({kind})")
        items[ident] = {**item, "kind": kind}
    return {"bank_id": raw["bank_id"], "items": items, "digest": canonical_digest(raw)}


def _rng(*parts: object) -> random.Random:
    seed = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return random.Random(int(seed, 16))  # noqa: S311 - selection order, not secrecy


def issue_attempt(bank: dict[str, Any], ledger: Path, *, person_id: str, capability: str, seed: str,
                  at: str) -> dict[str, Any]:
    """Record an issued attempt and return the candidate's form (no answers)."""
    now = parse_instant(at)
    if not person_id.strip():
        raise CareerError("person_id is required")
    pool = sorted(ident for ident, item in bank["items"].items() if item["capability"] == capability)
    if len(pool) < ITEMS_PER_ATTEMPT:
        raise CareerError(f"bank has {len(pool)} items for {capability}; {ITEMS_PER_ATTEMPT} are needed")
    events = read_chain(ledger)
    prior = [event for event in events if event.get("type") == "issued"
             and event.get("person_id") == person_id and event.get("capability") == capability]
    recent = [event for event in prior if now - parse_instant(event["issued_at"]) < timedelta(days=WINDOW_DAYS)]
    if len(recent) >= MAX_ATTEMPTS:
        raise CareerError(f"{MAX_ATTEMPTS} attempts at {capability} in the last {WINDOW_DAYS} days; wait to retake")
    rng = _rng(seed, person_id, capability, len(events))
    chosen = rng.sample(pool, ITEMS_PER_ATTEMPT)
    layout, form_items = [], []
    for ident in chosen:
        item = bank["items"][ident]
        order = list(range(len(item["choices"])))
        rng.shuffle(order)
        layout.append({"id": ident, "order": order})
        form_items.append({"item_id": ident, "kind": item["kind"], "prompt": item["prompt"],
                           "choices": [item["choices"][index] for index in order]})
    attempt_id = "A-" + hashlib.sha256(f"{person_id}|{capability}|{now.isoformat()}|{seed}|{len(events)}"
                                       .encode()).hexdigest()[:16]
    expires = now + timedelta(minutes=TIME_LIMIT_MINUTES)
    append_chain(ledger, {
        "type": "issued", "attempt_id": attempt_id, "person_id": person_id, "capability": capability,
        "bank_id": bank["bank_id"], "bank_digest": bank["digest"], "items": layout,
        "issued_at": now.isoformat(), "expires_at": expires.isoformat(), "attempt_number": len(prior) + 1,
    })
    return {
        "schema": "buildanddo.career.assessment-form/v1",
        "attempt_id": attempt_id,
        "capability": capability,
        "label": BY_ID[capability].label,
        "expires_at": expires.isoformat(),
        "items": form_items,
        "instructions": "Answer with the zero-based indices of the choices shown here. "
                        f"Pass mark {int(PASS_SCORE * 100)} percent; late submissions fail.",
    }


def score(bank: dict[str, Any], issued: dict[str, Any], responses: Any) -> tuple[int, int, dict[str, list[int]]]:
    """Grade responses keyed by item id against the bank; return correct, total and the normalized responses."""
    if not isinstance(responses, dict):
        raise CareerError("responses must map item ids to chosen indices")
    expected = {entry["id"]: entry["order"] for entry in issued["items"]}
    if set(responses) != set(expected):
        raise CareerError("responses must answer exactly the issued items")
    correct, normalized = 0, {}
    for ident, order in expected.items():
        picked = responses[ident]
        picked = [picked] if isinstance(picked, int) else picked
        if not isinstance(picked, list) or not all(isinstance(i, int) and 0 <= i < len(order) for i in picked):
            raise CareerError(f"{ident}: response indices are out of range")
        normalized[ident] = sorted(set(picked))
        original = {order[index] for index in normalized[ident]}
        correct += original == set(bank["items"][ident]["answer"])
    return correct, len(expected), normalized


def grade_attempt(bank: dict[str, Any], ledger: Path, *, attempt_id: str, responses: Any, at: str,
                  proctor_id: str | None = None, proctor_receipt: str | None = None) -> dict[str, Any]:
    """Grade one issued attempt once and record the result, passed or not."""
    events = read_chain(ledger)
    issued = next((event for event in events if event.get("type") == "issued"
                   and event.get("attempt_id") == attempt_id), None)
    if issued is None:
        raise CareerError(f"no issued attempt {attempt_id}")
    if any(event.get("type") == "graded" and event.get("attempt_id") == attempt_id for event in events):
        raise CareerError(f"{attempt_id} is already graded")
    if issued["bank_digest"] != bank["digest"]:
        raise CareerError("the bank changed since this attempt was issued")
    if bool(proctor_id) != bool(proctor_receipt):
        raise CareerError("a proctor needs both an id and a receipt")
    if proctor_id and proctor_id == issued["person_id"]:
        raise CareerError("a candidate cannot proctor their own attempt")
    submitted = parse_instant(at)
    within = parse_instant(issued["issued_at"]) <= submitted <= parse_instant(issued["expires_at"])
    correct, total, normalized = score(bank, issued, responses)
    ratio = round(correct / total, 3)
    return append_chain(ledger, {
        "type": "graded", "attempt_id": attempt_id, "person_id": issued["person_id"],
        "capability": issued["capability"], "bank_digest": issued["bank_digest"], "responses": normalized,
        "correct": correct, "total": total, "score": ratio, "within_time": within,
        "passed": within and ratio >= PASS_SCORE, "submitted_at": submitted.isoformat(),
        "proctor_id": proctor_id, "proctor_receipt": proctor_receipt, "attempt_number": issued["attempt_number"],
    })


def regrade(bank: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Recompute every graded result from its issued layout and the bank."""
    issued = {event["attempt_id"]: event for event in events if event.get("type") == "issued"}
    mismatches, checked, other_bank = [], 0, 0
    for event in events:
        if event.get("type") != "graded":
            continue
        source = issued.get(event["attempt_id"])
        if source is None:
            mismatches.append(f"{event['attempt_id']}: graded without an issued attempt")
            continue
        if source["bank_digest"] != bank["digest"]:
            other_bank += 1
            continue
        checked += 1
        correct, total, _ = score(bank, source, event["responses"])
        within = parse_instant(source["issued_at"]) <= parse_instant(event["submitted_at"]) \
            <= parse_instant(source["expires_at"])
        passed = within and round(correct / total, 3) >= PASS_SCORE
        if (correct, total, passed, within) != (event["correct"], event["total"], event["passed"],
                                               event["within_time"]):
            mismatches.append(f"{event['attempt_id']}: recorded {event['correct']}/{event['total']} "
                              f"passed={event['passed']}, regraded {correct}/{total} passed={passed}")
    return {"state": "MISMATCH" if mismatches else "PASS", "checked": checked,
            "graded_against_other_banks": other_bank, "mismatches": mismatches}


def assessment_evidence(events: list[dict[str, Any]], person_id: str) -> tuple[dict[str, Any], list[EvidenceRef]]:
    """Return passing results as ASSESSED evidence and a summary that includes every failure."""
    graded = [event for event in events if event.get("type") == "graded" and event.get("person_id") == person_id]
    evidence = []
    for event in graded:
        if not event["passed"]:
            continue
        proctored = bool(event.get("proctor_id"))
        state = ClaimState.VERIFIED if proctored else ClaimState.OBSERVED
        who = (f"proctored by {event['proctor_id']} ({event['proctor_receipt']})" if proctored
               else "unproctored; who answered is not established")
        evidence.append(EvidenceRef(
            "assessment", f"assessment:{event['attempt_id']}", event["capability"], Participation.ASSESSED, state,
            event["submitted_at"], f"scored {event['correct']}/{event['total']} on attempt "
            f"{event['attempt_number']}; bank {event['bank_digest'][7:19]}; {who}",
        ))
    summary = {
        "kind": "assessments",
        "attempts_graded": len(graded),
        "passed": sum(event["passed"] for event in graded),
        "failed": sum(not event["passed"] for event in graded),
        "proctored_passes": sum(event["passed"] and bool(event.get("proctor_id")) for event in graded),
        "issued_ungraded": sum(
            1 for event in events if event.get("type") == "issued" and event.get("person_id") == person_id
            and not any(g["attempt_id"] == event["attempt_id"] for g in graded)
        ),
    }
    return summary, evidence


def pending(inventory: dict[str, Any], bank: dict[str, Any], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Report, for each imported capability, whether it has been assessed and how it went."""
    person = inventory["person_id"]
    capabilities = sorted({cap for item in inventory["claims"] for cap in item["capabilities"]})
    rows = []
    for capability in capabilities:
        results = [event for event in events if event.get("type") == "graded"
                   and event.get("person_id") == person and event.get("capability") == capability]
        available = sum(item["capability"] == capability for item in bank["items"].values())
        if any(event["passed"] and event.get("proctor_id") for event in results):
            status = "VERIFIED"
        elif any(event["passed"] for event in results):
            status = "PASSED_UNPROCTORED"
        elif results:
            status = "FAILED"
        elif available < ITEMS_PER_ATTEMPT:
            status = "NO_ASSESSMENT_AVAILABLE"
        else:
            status = "NOT_TAKEN"
        rows.append({"capability": capability, "label": BY_ID[capability].label, "status": status,
                     "attempts": len(results), "bank_items": available,
                     "claims": [item["name"] for item in inventory["claims"] if capability in item["capabilities"]]})
    return rows
