#!/usr/bin/env python3
"""selftest.py - proves the claim/evidence/audit vertical slice against the REAL
live PocketBase, not a mock. Creates real records, asserts real state transitions."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient, PocketBaseError  # noqa: E402
from claims import create_source, create_claim, audit_claim  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []


def _ensure_user(email: str) -> str:
    existing = client.list("users", filter_expr=f'email="{email}"')
    if existing:
        return existing[0]["id"]
    rec = client.create("users", {"email": email, "password": "Sel3fT3stPassw0rd!", "passwordConfirm": "Sel3fT3stPassw0rd!",
                                    "name": email.split("@")[0], "emailVisibility": False, "verified": True})
    return rec["id"]


author_id = _ensure_user("selftest-author@buildanddo.internal")
independent_auditor_id = _ensure_user("selftest-auditor@buildanddo.internal")

source = create_source(client, url="https://example.com/coffee-brew-guide", title="V60 pour-over brewing guide",
                        publisher="example.com", source_type="WEB", content_hash="deadbeef")
checks.append(("source created with real display_id", source.get("display_id", "").startswith("SRC-")))

claim = create_claim(client, subject="V60 pour-over", predicate="typically requires",
                      object_="180g water at 92-96C for a 12g dose", domain="culinary.coffee",
                      context={"grind": "medium-fine"}, initial_state="SOURCE_BACKED",
                      confidence=0.55, supporting_source_ids=[source["id"]])
checks.append(("claim created at SOURCE_BACKED (has a real source)", claim["epistemic_state"] == "SOURCE_BACKED"))

try:
    create_claim(client, subject="x", predicate="y", object_="z", domain="test",
                 initial_state="CORROBORATED", supporting_source_ids=[])
    checks.append(("claim WITHOUT sources cannot start above SOURCE_BACKED", False))
except ValueError:
    checks.append(("claim WITHOUT sources cannot start above SOURCE_BACKED", True))

result = audit_claim(client, claim_id=claim["id"], auditor_user_id=independent_auditor_id,
                      action="CORROBORATE", result="CONFIRMED", independent=True,
                      observation={"replicated": True})
checks.append(("independent CONFIRMED audit promotes SOURCE_BACKED -> CORROBORATED",
                result["claim_state_before"] == "SOURCE_BACKED" and result["claim_state_after"] == "CORROBORATED"))
checks.append(("audit record has a real AUD- display_id", result["audit"]["display_id"].startswith("AUD-")))

try:
    audit_claim(client, claim_id=claim["id"], auditor_user_id=author_id, action="CORROBORATE",
                result="CONFIRMED", independent=False)
    checks.append(("self-audit (independent=False) is rejected", False))
except PocketBaseError:
    checks.append(("self-audit (independent=False) is rejected", True))

reread = client.get("knowledge_claims", claim["id"])
checks.append(("claim state persisted after audit (real re-read, not cached)", reread["epistemic_state"] == "CORROBORATED"))

contradicting_result = audit_claim(client, claim_id=claim["id"], auditor_user_id=independent_auditor_id,
                                     action="CONTRADICT", result="CONTRADICTED", independent=True,
                                     observation={"replicated": False, "reason": "different grind size"})
checks.append(("CONTRADICTED audit moves claim to DISPUTED regardless of prior state",
                contradicting_result["claim_state_after"] == "DISPUTED"))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")
print(f"\nLive records created: source={source['id']} claim={claim['id']} "
      f"(view at {client.base_url}/_/#/collections/knowledge_claims/records/{claim['id']})")
sys.exit(0 if passed == len(checks) else 1)
