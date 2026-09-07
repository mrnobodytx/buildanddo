#!/usr/bin/env python3
"""selftest_beliefs.py - proves a belief CANNOT be promoted to a claim, at
the schema level, not just by convention."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient, PocketBaseError  # noqa: E402
from beliefs import create_belief, coexisting_views  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []
created_ids: list[str] = []

belief_a = create_belief(client, proposition="Thumb should stay behind the neck for barre chords",
                          domain="music.guitar.technique", attributed_school="Classical technique school")
belief_b = create_belief(client, proposition="Thumb position is a matter of hand size, not doctrine",
                          domain="music.guitar.technique", attributed_school="Modern pragmatic school")
created_ids += [belief_a["id"], belief_b["id"]]
checks.append(("belief created with fixed epistemic_class", belief_a["epistemic_class"] == "ATTRIBUTED_BELIEF"))

try:
    client._request("PATCH", f"/api/collections/knowledge_beliefs/records/{belief_a['id']}",  # noqa: SLF001
                     {"epistemic_class": "FACT"})
    checks.append(("PocketBase schema itself rejects promoting epistemic_class to FACT", False))
except PocketBaseError:
    checks.append(("PocketBase schema itself rejects promoting epistemic_class to FACT", True))

views = coexisting_views(client, "music.guitar.technique")
checks.append(("both conflicting views coexist for the same domain (no forced consensus)",
                len(views) == 2))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for bid in created_ids:
    client._request("DELETE", f"/api/collections/knowledge_beliefs/records/{bid}")  # noqa: SLF001
print(f"cleaned up {len(created_ids)} test beliefs")
sys.exit(0 if passed == len(checks) else 1)
