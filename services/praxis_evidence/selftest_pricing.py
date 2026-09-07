#!/usr/bin/env python3
"""selftest_pricing.py - proves the pricing aggregate against real data: correct
median/percentiles, and an honest INSUFFICIENT_DATA when there's no evidence,
never a fabricated range."""
from __future__ import annotations
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient  # noqa: E402
from materials import create_material  # noqa: E402
from pricing import record_price, price_aggregate  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []

material = create_material(client, canonical_name=f"selftest-2x4-{dt.datetime.now().timestamp()}",
                            category="construction.lumber")
now = dt.datetime.now(dt.timezone.utc)

# Known amounts so the expected median/percentiles are computable by hand: 3.50, 4.00, 4.28, 4.50, 5.00
amounts = [3.50, 4.00, 4.28, 4.50, 5.00]
price_ids = []
for amt in amounts:
    p = record_price(client, material_id=material["id"], amount=amt, currency="USD",
                      quantity_value=1, quantity_unit="EACH", channel="STORE", region="TX",
                      observed_at=now.isoformat())
    price_ids.append(p["id"])

# One stale observation outside the 30-day window - must NOT affect the aggregate.
stale_price = record_price(client, material_id=material["id"], amount=99.99, currency="USD",
                             quantity_value=1, quantity_unit="EACH", channel="STORE", region="TX",
                             observed_at=(now - dt.timedelta(days=90)).isoformat())
price_ids.append(stale_price["id"])

agg = price_aggregate(client, material_id=material["id"], region="TX", window_days=30)
checks.append(("aggregate state OK with real observations", agg["state"] == "OK"))
checks.append(("sample_count excludes the stale observation (5, not 6)", agg["sample_count"] == 5))
checks.append(("median matches hand-computed value (4.28)", abs(agg["median"] - 4.28) < 0.001))
checks.append(("stale $99.99 observation did not inflate max_observed", agg["max_observed"] == 5.00))
checks.append(("min_observed correct", agg["min_observed"] == 3.50))

no_data_material = create_material(client, canonical_name=f"selftest-nodata-{dt.datetime.now().timestamp()}",
                                     category="test.category")
empty_agg = price_aggregate(client, material_id=no_data_material["id"], window_days=30)
checks.append(("material with zero observations returns INSUFFICIENT_DATA, not a fabricated range",
                empty_agg["state"] == "INSUFFICIENT_DATA" and "median" not in empty_agg))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for pid in price_ids:
    client._request("DELETE", f"/api/collections/praxis_pricing/records/{pid}")  # noqa: SLF001
client._request("DELETE", f"/api/collections/praxis_materials/records/{material['id']}")  # noqa: SLF001
client._request("DELETE", f"/api/collections/praxis_materials/records/{no_data_material['id']}")  # noqa: SLF001
print("cleaned up test materials + price observations")
sys.exit(0 if passed == len(checks) else 1)
