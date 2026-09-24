#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File: services/praxis_evidence/selftest_research_quests.py
# Stage: 08_TEST
# SRS: SRS-BUILDANDDO-UPGRADE-001
# CAPS: pending
# CK: pending
# Dispatch: VCC-BUILDANDDO-UPGRADE-001
# Seat: BITS-CODEGEN
# Owner: Citadel Nexus Inc.
# Created: 2026-09-23
# Depends: services/praxis_evidence/isolated_test.py
# EnumType: Test
# EnumEdges: CONSUMES services/praxis_evidence/isolated_test.py; VALIDATES services/praxis_evidence/research_quests.py
# Intent: Exercise quest compilation in a fresh local database without permanent live test records.
# ----------------------------------------------------------------
"""selftest_research_quests.py - proves the auto-compiler against real data:
a disputed claim gets a real quest, re-running doesn't duplicate it."""
from __future__ import annotations
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from isolated_test import isolated_client  # noqa: E402
from claims import create_source, create_claim, audit_claim  # noqa: E402
from research_quests import compile_quests_for_disputed_claims, open_research_quest  # noqa: E402

client = isolated_client()
checks: list[tuple[str, bool]] = []
cleanup: list[tuple[str, str]] = []


def _user(email: str) -> str:
    existing = client.list("users", filter_expr=f'email="{email}"')
    if existing:
        return existing[0]["id"]
    password = secrets.token_urlsafe(24)  # throwaway user; never reused or printed
    return client.create("users", {"email": email, "password": password, "passwordConfirm": password})["id"]


auditor = _user("selftest-rq-auditor@buildanddo.internal")
source = create_source(client, url="https://example.com/rq", title="rq", source_type="WEB")
cleanup.append(("knowledge_sources", source["id"]))
claim = create_claim(client, subject="test rq", predicate="requires", object_="thing",
                      domain="selftest.research_quests", initial_state="SOURCE_BACKED",
                      supporting_source_ids=[source["id"]])
cleanup.append(("knowledge_claims", claim["id"]))

audit_result = audit_claim(client, claim_id=claim["id"], auditor_user_id=auditor, action="CONTRADICT",
                            result="CONTRADICTED", independent=True)
cleanup.append(("governance_audits", audit_result["audit"]["id"]))
checks.append(("claim is genuinely DISPUTED after the contradiction", audit_result["claim_state_after"] == "DISPUTED"))

first_pass = compile_quests_for_disputed_claims(client)
matching = [r for r in first_pass if r["claim"] == claim["display_id"]]
checks.append(("compiler opens a real quest for the disputed claim", len(matching) == 1 and matching[0]["created"] is True))
if matching:
    cleanup.append(("governance_research_quests", matching[0]["quest"]["id"]))

second_pass = compile_quests_for_disputed_claims(client)
matching2 = [r for r in second_pass if r["claim"] == claim["display_id"]]
checks.append(("re-running the compiler does NOT open a duplicate quest",
                len(matching2) == 1 and matching2[0]["created"] is False))

try:
    open_research_quest(client, trigger_reason="NOT_A_REAL_TRIGGER", subject_type="CLAIM",
                         subject_id="x", question="x")
    checks.append(("unknown trigger_reason is rejected", False))
except ValueError:
    checks.append(("unknown trigger_reason is rejected", True))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for coll, rid in cleanup:
    client._request("DELETE", f"/api/collections/{coll}/records/{rid}")  # noqa: SLF001
print(f"cleaned up {len(cleanup)} records")
sys.exit(0 if passed == len(checks) else 1)
