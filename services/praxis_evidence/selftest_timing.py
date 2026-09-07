#!/usr/bin/env python3
"""selftest_timing.py - proves timing distributions are honest: n=1 stays
n=1, NO_DATA stays NO_DATA, real percentiles for real samples."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient  # noqa: E402
from methods import create_method  # noqa: E402
from timing import record_timing, timing_distribution  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []

method = create_method(client, objective="reach clean F barre chord criterion", domain="music.guitar")

no_data = timing_distribution(client, method_id=method["id"])
checks.append(("brand-new method with zero observations returns NO_DATA", no_data["state"] == "NO_DATA"))

single = record_timing(client, method_id=method["id"], activity="barre chord practice",
                        duration_value=18, duration_unit="DAYS", confidence="USER_REPORTED",
                        experience_level="BEGINNER", criterion_met=True)
single_dist = timing_distribution(client, method_id=method["id"], experience_level="BEGINNER")
checks.append(("single observation reports n=1 honestly, not a fake distribution",
                single_dist["state"] == "SINGLE_OBSERVATION" and single_dist["n"] == 1))

timing_ids = [single["id"]]
for days in [14, 21, 25, 30]:
    t = record_timing(client, method_id=method["id"], activity="barre chord practice",
                       duration_value=days, duration_unit="DAYS", confidence="USER_REPORTED",
                       experience_level="BEGINNER", criterion_met=True)
    timing_ids.append(t["id"])

dist = timing_distribution(client, method_id=method["id"], experience_level="BEGINNER")
checks.append(("5 real observations now report a real distribution", dist["state"] == "DISTRIBUTION" and dist["n"] == 5))
checks.append(("median matches hand-computed value (21, sorted: 14,18,21,25,30)", dist["median"] == 21))

failed = record_timing(client, method_id=method["id"], activity="barre chord practice",
                        duration_value=200, duration_unit="DAYS", confidence="USER_REPORTED",
                        experience_level="BEGINNER", criterion_met=False)
timing_ids.append(failed["id"])
dist_excl = timing_distribution(client, method_id=method["id"], experience_level="BEGINNER", successful_only=True)
checks.append(("failed-criterion outlier excluded from success-conditioned distribution",
                dist_excl["n"] == 5 and 200 not in [dist_excl.get("median")]))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for tid in timing_ids:
    client._request("DELETE", f"/api/collections/praxis_timing/records/{tid}")  # noqa: SLF001
client._request("DELETE", f"/api/collections/praxis_methods/records/{method['id']}")  # noqa: SLF001
print("cleaned up test method + timing observations")
sys.exit(0 if passed == len(checks) else 1)
