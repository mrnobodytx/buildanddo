#!/usr/bin/env python3
"""selftest_reputation.py - proves real self-audit rejection (by actual
authorship, not caller-honesty) and XP/TP settlement against the live PocketBase."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient, PocketBaseError  # noqa: E402
from claims import create_source, create_claim, audit_claim  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []
cleanup: list[tuple[str, str]] = []


def _user(email: str) -> str:
    existing = client.list("users", filter_expr=f'email="{email}"')
    if existing:
        return existing[0]["id"]
    rec = client.create("users", {"email": email, "password": "RepTest123!", "passwordConfirm": "RepTest123!"})
    return rec["id"]


author = _user("selftest-rep-author@buildanddo.internal")
auditor = _user("selftest-rep-auditor@buildanddo.internal")

source = create_source(client, url="https://example.com/x", title="x", source_type="WEB")
cleanup.append(("knowledge_sources", source["id"]))
claim = create_claim(client, subject="test", predicate="requires", object_="thing", domain="selftest.reputation",
                      initial_state="SOURCE_BACKED", supporting_source_ids=[source["id"]], submitted_by=author)
cleanup.append(("knowledge_claims", claim["id"]))

try:
    audit_claim(client, claim_id=claim["id"], auditor_user_id=author, action="CORROBORATE",
                result="CONFIRMED", independent=True)  # independent=True asserted, but IS the real author
    checks.append(("real self-audit rejected even when caller asserts independent=True", False))
except PocketBaseError:
    checks.append(("real self-audit rejected even when caller asserts independent=True", True))

result_inconclusive = audit_claim(client, claim_id=claim["id"], auditor_user_id=auditor,
                                   action="EXPERT_REVIEW", result="INCONCLUSIVE", independent=True)
cleanup.append(("governance_audits", result_inconclusive["audit"]["id"]))
checks.append(("INCONCLUSIVE audit settles no reputation", result_inconclusive["reputation"]["settled"] is False))
checks.append(("INCONCLUSIVE audit does not change claim state",
                result_inconclusive["claim_state_before"] == result_inconclusive["claim_state_after"]))

result_confirmed = audit_claim(client, claim_id=claim["id"], auditor_user_id=auditor,
                                action="CORROBORATE", result="CONFIRMED", independent=True)
cleanup.append(("governance_audits", result_confirmed["audit"]["id"]))
checks.append(("CONFIRMED audit settles real XP/TP", result_confirmed["reputation"]["settled"] is True
                and result_confirmed["reputation"]["xp"] >= 2 and result_confirmed["reputation"]["tp"] >= 1))

rep_records = client.list("contributor_reputation", filter_expr=f'user="{auditor}" && domain="selftest.reputation"')
cleanup.append(("contributor_reputation", rep_records[0]["id"]) if rep_records else (None, None))
checks.append(("reputation persisted as its own real row (re-read, not cached)",
                len(rep_records) == 1 and rep_records[0]["verified_contributions"] == 1))

try:
    audit_claim(client, claim_id=claim["id"], auditor_user_id=auditor, action="NOT_A_REAL_ACTION",
                result="CONFIRMED", independent=True)
    checks.append(("unknown audit action is rejected", False))
except ValueError:
    checks.append(("unknown audit action is rejected", True))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for coll, rid in cleanup:
    if rid:
        client._request("DELETE", f"/api/collections/{coll}/records/{rid}")  # noqa: SLF001
for uid in (author, auditor):
    client._request("DELETE", f"/api/collections/users/records/{uid}")  # noqa: SLF001
print(f"cleaned up {len([c for c in cleanup if c[1]])} records + 2 test users")
sys.exit(0 if passed == len(checks) else 1)
