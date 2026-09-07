#!/usr/bin/env python3
"""
pricing.py - price as a dated/located/vendored observation, never a timeless
number (doc rule #3). Aggregates always carry sample_count + date_range +
geography alongside the statistic - never a bare point estimate.
"""
from __future__ import annotations
import datetime as dt
import statistics

from client import PocketBaseClient
from registry import next_display_id


def record_price(client: PocketBaseClient, *, material_id: str, amount: float, currency: str,
                  quantity_value: float, quantity_unit: str, channel: str,
                  vendor: str = "", country: str = "", region: str = "", locality: str = "",
                  membership_required: bool = False, sale: bool = False, bulk_quantity: float | None = None,
                  shipping_included: bool = False, tax_included: bool = False,
                  observed_at: str | None = None, source_url: str = "", evidence_hash: str = "") -> dict:
    display_id = next_display_id("praxis_pricing", client)
    record = {
        "display_id": display_id, "material": material_id, "amount": amount, "currency": currency,
        "quantity_value": quantity_value, "quantity_unit": quantity_unit, "channel": channel,
        "vendor": vendor, "country": country, "region": region, "locality": locality,
        "membership_required": membership_required, "sale": sale, "bulk_quantity": bulk_quantity,
        "shipping_included": shipping_included, "tax_included": tax_included,
        "observed_at": observed_at or dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_url": source_url, "evidence_hash": evidence_hash, "verification_state": "OBSERVED",
    }
    return client.create("praxis_pricing", record)


def price_aggregate(client: PocketBaseClient, *, material_id: str, region: str | None = None,
                     window_days: int = 30) -> dict:
    """Never returns a number without the sample it came from. A stale/empty
    window returns state=INSUFFICIENT_DATA rather than fabricating a range."""
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=window_days)
    filter_expr = f'material="{material_id}"'
    if region:
        filter_expr += f' && region="{region}"'
    observations = client.list("praxis_pricing", filter_expr=filter_expr, per_page=500)

    def _observed_at(o: dict) -> dt.datetime:
        raw = o.get("observed_at", "")
        try:
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return dt.datetime.min.replace(tzinfo=dt.timezone.utc)

    recent = [o for o in observations if _observed_at(o) >= cutoff]
    if not recent:
        return {"state": "INSUFFICIENT_DATA", "sample_count": 0, "window_days": window_days,
                 "material_id": material_id, "region": region}

    amounts = sorted(o["amount"] for o in recent)
    n = len(amounts)

    def _pct(p: float) -> float:
        if n == 1:
            return amounts[0]
        idx = p * (n - 1)
        lo, hi = int(idx), min(int(idx) + 1, n - 1)
        frac = idx - lo
        return amounts[lo] + (amounts[hi] - amounts[lo]) * frac

    return {
        "state": "OK", "sample_count": n, "window_days": window_days,
        "material_id": material_id, "region": region,
        "median": statistics.median(amounts), "p25": _pct(0.25), "p75": _pct(0.75),
        "min_observed": amounts[0], "max_observed": amounts[-1],
        "date_range": {"earliest": min(_observed_at(o) for o in recent).isoformat(),
                        "latest": max(_observed_at(o) for o in recent).isoformat()},
    }
