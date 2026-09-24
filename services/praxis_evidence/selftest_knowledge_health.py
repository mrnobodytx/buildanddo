#!/usr/bin/env python3
# --- CGRF Header ------------------------------------------------
# File: services/praxis_evidence/selftest_knowledge_health.py
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
# EnumEdges: CONSUMES services/praxis_evidence/isolated_test.py; VALIDATES services/praxis_evidence/knowledge_health.py
# Intent: Exercise knowledge health against isolated native records without inheriting deployment targets.
# ----------------------------------------------------------------
"""selftest_knowledge_health.py - proves the scorecard reflects REAL per-
dimension differences, never one averaged number, against live data."""
from __future__ import annotations
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from isolated_test import isolated_client  # noqa: E402
from claims import create_source, create_claim, audit_claim  # noqa: E402
from knowledge_health import domain_health  # noqa: E402

client = isolated_client()
checks: list[tuple[str, bool]] = []
cleanup: list[tuple[str, str]] = []
DOMAIN = "selftest.knowledge_health"


def _user(email: str) -> str:
    existing = client.list("users", filter_expr=f'email="{email}"')
    if existing:
        return existing[0]["id"]
    password = secrets.token_urlsafe(24)  # throwaway user; never reused or printed
    return client.create("users", {"email": email, "password": password, "passwordConfirm": password})["id"]


auditor = _user("selftest-kh-auditor@buildanddo.internal")

empty = domain_health(client, "selftest.knowledge_health.nonexistent")
checks.append(("brand-new domain with zero claims returns NO_DATA, not a fabricated score", empty["state"] == "NO_DATA"))

source = create_source(client, url="https://example.com/kh", title="kh", source_type="WEB")
cleanup.append(("knowledge_sources", source["id"]))

sourced_claim = create_claim(client, subject="a", predicate="requires", object_="b", domain=DOMAIN,
                              initial_state="SOURCE_BACKED", supporting_source_ids=[source["id"]])
cleanup.append(("knowledge_claims", sourced_claim["id"]))
unsourced_claim = create_claim(client, subject="c", predicate="requires", object_="d", domain=DOMAIN,
                                initial_state="USER_ASSERTED")
cleanup.append(("knowledge_claims", unsourced_claim["id"]))
disputed_claim = create_claim(client, subject="e", predicate="requires", object_="f", domain=DOMAIN,
                               initial_state="SOURCE_BACKED", supporting_source_ids=[source["id"]])
cleanup.append(("knowledge_claims", disputed_claim["id"]))
dispute_audit = audit_claim(client, claim_id=disputed_claim["id"], auditor_user_id=auditor,
                             action="CONTRADICT", result="CONTRADICTED", independent=True)
cleanup.append(("governance_audits", dispute_audit["audit"]["id"]))

health = domain_health(client, DOMAIN)
checks.append(("n_claims reflects all 3 real claims", health["n_claims"] == 3))
checks.append(("factual_coverage counts only the 1 still-sourced claim (1/3) - a DISPUTED "
                "claim no longer counts positively even though it started SOURCE_BACKED",
                abs(health["factual_coverage"] - (1 / 3)) < 0.01))
checks.append(("reproducibility is 0% - none reached REPRODUCED/FIELD_VERIFIED", health["reproducibility"] == 0.0))
checks.append(("unresolved_disputes correctly counts the 1 real disputed claim", health["unresolved_disputes"] == 1))
checks.append(("factual_coverage and reproducibility are DIFFERENT numbers, not one averaged score",
                health["factual_coverage"] != health["reproducibility"]))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for coll, rid in cleanup:
    client._request("DELETE", f"/api/collections/{coll}/records/{rid}")  # noqa: SLF001
print(f"cleaned up {len(cleanup)} records")
sys.exit(0 if passed == len(checks) else 1)
