#!/usr/bin/env python3
"""selftest_logic.py - proves logic rules against the real live PocketBase."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient  # noqa: E402
from logic import create_logic_rule, record_falsification  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []
created_ids: list[str] = []

try:
    create_logic_rule(client, domain="culinary.baking", rule_type="HEURISTIC",
                       if_conditions={"dough_temperature_gt_c": 28, "fermentation_rate": "FAST"},
                       then_result={"candidate": "reduce_bulk_duration"}, falsifier="")
    checks.append(("HEURISTIC rule without a falsifier is rejected", False))
except ValueError:
    checks.append(("HEURISTIC rule without a falsifier is rejected", True))

rule = create_logic_rule(
    client, domain="culinary.baking", rule_type="HEURISTIC",
    if_conditions={"dough_temperature_gt_c": 28, "fermentation_rate": "FAST"},
    then_result={"candidate": "reduce_bulk_duration"},
    falsifier="acceptable outcome despite unchanged duration", certainty="HEURISTIC", status="COMMUNITY_TESTED")
created_ids.append(rule["id"])
checks.append(("HEURISTIC rule with a real falsifier is created", rule["status"] == "COMMUNITY_TESTED"))

deterministic = create_logic_rule(
    client, domain="software.build", rule_type="DETERMINISTIC",
    if_conditions={"exit_code": 0}, then_result={"outcome": "build_passed"})
created_ids.append(deterministic["id"])
checks.append(("DETERMINISTIC rule needs no falsifier", deterministic["falsifier"] == ""))

refuted = record_falsification(client, rule_id=rule["id"])
checks.append(("observed falsifier moves a rule to REFUTED, not left stale", refuted["status"] == "REFUTED"))

reread = client.get("knowledge_logic", rule["id"])
checks.append(("REFUTED state persisted on re-read", reread["status"] == "REFUTED"))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for rid in created_ids:
    client._request("DELETE", f"/api/collections/knowledge_logic/records/{rid}")  # noqa: SLF001
print(f"cleaned up {len(created_ids)} test rules")
sys.exit(0 if passed == len(checks) else 1)
