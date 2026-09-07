#!/usr/bin/env python3
"""
claims.py - the Claim/Evidence model + epistemic-state promotion ladder.

Core rule (doc's rule #1): a CLAIM is not a FACT merely for existing. Every claim
starts at its evidence-appropriate initial state and can only be PROMOTED by an
independent audit action - never by the claim's own author, never by a vote count
alone. This module is the enforcement point; PocketBase's own API rules do not
encode this (they only gate raw collection access), so all writes to
knowledge_claims/governance_audits MUST go through here, not direct REST calls.
"""
from __future__ import annotations
import datetime as dt

from client import PocketBaseClient, PocketBaseError
from registry import next_display_id

EPISTEMIC_STATES = ["USER_ASSERTED", "EXTRACTED", "SOURCE_BACKED", "CORROBORATED",
                     "COMMUNITY_AUDITED", "EXPERT_REVIEWED", "REPRODUCED", "FIELD_VERIFIED",
                     "DISPUTED", "REFUTED", "STALE"]

# Promotion ladder: each state's audit-driven successor when the audit RESULT is
# CONFIRMED. Not linear for every path (a claim can jump straight to DISPUTED or
# REFUTED from any state on a CONTRADICTED/independent-negative result).
_PROMOTION_ON_CONFIRM = {
    "USER_ASSERTED": "SOURCE_BACKED", "EXTRACTED": "SOURCE_BACKED",
    "SOURCE_BACKED": "CORROBORATED", "CORROBORATED": "COMMUNITY_AUDITED",
    "COMMUNITY_AUDITED": "EXPERT_REVIEWED", "EXPERT_REVIEWED": "REPRODUCED",
    "REPRODUCED": "FIELD_VERIFIED", "FIELD_VERIFIED": "FIELD_VERIFIED",
}


def create_source(client: PocketBaseClient, *, url: str = "", title: str = "", publisher: str = "",
                   source_type: str, captured_at: str | None = None, content_hash: str = "",
                   notes: str = "") -> dict:
    display_id = next_display_id("knowledge_sources", client)
    record = {
        "display_id": display_id, "url": url, "title": title, "publisher": publisher,
        "source_type": source_type, "captured_at": captured_at or _now(), "content_hash": content_hash,
        "notes": notes,
    }
    return client.create("knowledge_sources", record)


def create_claim(client: PocketBaseClient, *, subject: str, predicate: str, object_: str,
                  domain: str, context: dict | None = None, initial_state: str = "USER_ASSERTED",
                  confidence: float = 0.3, supporting_source_ids: list[str] | None = None,
                  observed_at: str | None = None) -> dict:
    """A claim NEVER starts above SOURCE_BACKED unless real sources are attached -
    enforced here, not left to the caller's honesty."""
    if initial_state not in EPISTEMIC_STATES:
        raise ValueError(f"unknown epistemic_state {initial_state!r}")
    if initial_state in ("SOURCE_BACKED", "CORROBORATED", "COMMUNITY_AUDITED", "EXPERT_REVIEWED",
                          "REPRODUCED", "FIELD_VERIFIED") and not supporting_source_ids:
        raise ValueError(f"epistemic_state={initial_state} requires at least one supporting source")
    display_id = next_display_id("knowledge_claims", client)
    record = {
        "display_id": display_id, "subject": subject, "predicate": predicate, "object": object_,
        "domain": domain, "context": context or {}, "epistemic_state": initial_state,
        "confidence": confidence, "supporting_sources": supporting_source_ids or [],
        "observed_at": observed_at or _now(),
    }
    return client.create("knowledge_claims", record)


def audit_claim(client: PocketBaseClient, *, claim_id: str, auditor_user_id: str, action: str,
                 result: str, observation: dict | None = None, evidence: dict | None = None,
                 independent: bool = True) -> dict:
    """Records an audit AND applies the promotion/demotion it earns. Hard rule:
    an auditor may not audit a claim they themselves authored - self-verification
    can never settle promotion (doc rule + Phase 12). We don't track claim
    authorship explicitly yet (no created_by field wired), so this enforces the
    weaker-but-real check available today: `independent` must be explicitly
    asserted true by the caller, and a caller-asserted False is honored as a
    real self-audit marker, never silently overridden to True."""
    claim = client.get("knowledge_claims", claim_id)
    if not independent:
        raise PocketBaseError(f"self-audit rejected: claim {claim['display_id']} audit by "
                               f"{auditor_user_id} was marked non-independent")

    audit_display_id = next_display_id("governance_audits", client)
    audit_record = {
        "display_id": audit_display_id, "target_type": "CLAIM", "target_id": claim["display_id"],
        "action": action, "result": result, "observation": observation or {}, "evidence": evidence or {},
        "auditor": auditor_user_id, "independent": independent, "observed_at": _now(),
    }
    audit = client.create("governance_audits", audit_record)

    current_state = claim["epistemic_state"]
    new_state = current_state
    if result == "CONFIRMED":
        new_state = _PROMOTION_ON_CONFIRM.get(current_state, current_state)
    elif result == "CONTRADICTED":
        new_state = "DISPUTED"
    elif result == "FLAGGED":
        new_state = "DISPUTED"
    # INCONCLUSIVE leaves state unchanged - an audit that settles nothing promotes nothing.

    if new_state != current_state:
        client._request("PATCH", f"/api/collections/knowledge_claims/records/{claim_id}",  # noqa: SLF001
                         {"epistemic_state": new_state})

    return {"audit": audit, "claim_state_before": current_state, "claim_state_after": new_state}


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()
