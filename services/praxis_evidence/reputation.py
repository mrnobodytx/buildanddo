#!/usr/bin/env python3
"""
reputation.py - XP (demonstrated experience) and TP (demonstrated trust),
kept separate (doc rule #20). Both settle ONLY from independently-verified
audit outcomes - never from raw submission volume, never from self-audit
(already blocked upstream in claims.audit_claim before this is ever called).
"""
from __future__ import annotations

from client import PocketBaseClient

# XP: awarded for producing an audit that resolved something (CONFIRMED or
# CONTRADICTED both count - correctly identifying a contradiction is real work).
# INCONCLUSIVE settles nothing: an audit that decided nothing earns nothing.
XP_PER_RESOLVED_AUDIT = 2

# TP: awarded only for CONFIRM (their claim held up under independent check) or
# for correctly CONTRADICTING/FLAGGING (catching a real problem is trust-building,
# not just "being active"). Both are small, deliberately - trust accrues slowly.
TP_DELTA = {"CONFIRMED": 1, "CONTRADICTED": 1, "FLAGGED": 1, "INCONCLUSIVE": 0}


def _get_or_create(client: PocketBaseClient, user_id: str, domain: str) -> dict:
    existing = client.list("contributor_reputation", filter_expr=f'user="{user_id}" && domain="{domain}"')
    if existing:
        return existing[0]
    return client.create("contributor_reputation", {"user": user_id, "domain": domain,
                                                       "xp": 0, "tp": 0, "verified_contributions": 0})


def settle_audit_reputation(client: PocketBaseClient, *, auditor_user_id: str, domain: str,
                             audit_result: str, was_independent: bool) -> dict:
    """Called AFTER an audit is recorded (claims.audit_claim already rejects
    self-audits before this runs, so was_independent here is a defense-in-depth
    assertion, not the only gate)."""
    if not was_independent:
        return {"settled": False, "reason": "not independent - no reputation change"}
    if audit_result == "INCONCLUSIVE":
        return {"settled": False, "reason": "INCONCLUSIVE resolves nothing - no reputation change"}

    rep = _get_or_create(client, auditor_user_id, domain)
    new_xp = (rep.get("xp") or 0) + XP_PER_RESOLVED_AUDIT
    new_tp = (rep.get("tp") or 0) + TP_DELTA.get(audit_result, 0)
    new_count = (rep.get("verified_contributions") or 0) + 1
    updated = client._request("PATCH", f"/api/collections/contributor_reputation/records/{rep['id']}",  # noqa: SLF001
                               {"xp": new_xp, "tp": new_tp, "verified_contributions": new_count})
    return {"settled": True, "xp": new_xp, "tp": new_tp, "verified_contributions": new_count, "record": updated}
