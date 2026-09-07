#!/usr/bin/env python3
"""selftest_lineage.py - proves source-lineage collapsing against the real live
PocketBase: N copies of one origin must collapse to 1 independent lineage."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient  # noqa: E402
from claims import create_source  # noqa: E402
from source_lineage import record_lineage, independent_source_count  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []
created_ids: list[str] = []


def _src(title: str) -> str:
    s = create_source(client, url=f"https://example.com/{title}", title=title, source_type="WEB")
    created_ids.append(s["id"])
    return s["id"]


origin = _src("origin-article")
copy_b = _src("copy-b")
copy_c = _src("copy-c")
independent_d = _src("independent-observation")
reproduces_e = _src("reproduction-experiment")

record_lineage(client, source_id=copy_b, relation="derived_from", target_source_ids=[origin])
record_lineage(client, source_id=copy_c, relation="copies", target_source_ids=[origin])
record_lineage(client, source_id=reproduces_e, relation="reproduces", target_source_ids=[origin])

result = independent_source_count(client, [origin, copy_b, copy_c, independent_d, reproduces_e])
checks.append(("raw_count reflects all 5 sources", result["raw_count"] == 5))
checks.append(("independent_count collapses origin+2 copies to 1, "
                "keeps independent + reproduction separate (=> 3, not 5)",
                result["independent_count"] == 3))
checks.append(("origin is one of the collapsed lineage roots", origin in result["lineage_roots"]))
checks.append(("reproduction is NOT collapsed into origin's lineage (counts independently)",
                reproduces_e in result["lineage_roots"]))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
print(f"\n{passed}/{len(checks)} passed")

for sid in created_ids:
    client._request("DELETE", f"/api/collections/knowledge_sources/records/{sid}")  # noqa: SLF001
print(f"cleaned up {len(created_ids)} test sources")
sys.exit(0 if passed == len(checks) else 1)
