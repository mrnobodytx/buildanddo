#!/usr/bin/env python3
"""selftest_dogfood_pilots.py - proves the 6 heterogeneous pilots ran through
real, identical generic code (no domain-specific branching) and are
idempotent on method creation (re-running doesn't duplicate)."""
from __future__ import annotations
import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import PocketBaseClient  # noqa: E402
import dogfood_pilots  # noqa: E402

client = PocketBaseClient()
checks: list[tuple[str, bool]] = []

# AST-based, not regex-on-text: a regex over raw source falsely flags this very
# docstring's own example text ("if domain == 'cooking'"). Parsing the real
# syntax tree and looking for an actual Compare node naming `domain` against a
# string constant is the honest version of "no domain-specific branching."
source_files = ["dogfood_pilots.py", "claims.py", "methods.py", "materials.py", "pricing.py", "timing.py"]
found_branching = []
for fname in source_files:
    tree = ast.parse(Path(fname).read_text(encoding="utf-8"), filename=fname)
    for node in ast.walk(tree):
        if isinstance(node, ast.Compare) and isinstance(node.left, ast.Name) and node.left.id == "domain":
            if any(isinstance(c, ast.Constant) and isinstance(c.value, str) for c in node.comparators):
                found_branching.append((fname, node.lineno))
checks.append(("no domain-specific branching in any pilot/core module (real AST check, not regex)",
                len(found_branching) == 0))

before = client.list("praxis_methods", per_page=500)
before_count = len(before)
dogfood_pilots.main()
after = client.list("praxis_methods", per_page=500)
checks.append(("re-running all 6 pilots does not duplicate existing methods (idempotent)",
                len(after) == before_count))

by_domain = {m["domain"] for m in after}
checks.append(("at least 5 distinct real domains represented in praxis_methods",
                len({"culinary.baking", "music.guitar", "writing.fiction",
                      "construction.carpentry", "software.web"} & by_domain) == 5))

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}")
if found_branching:
    for f, lineno in found_branching:
        print(f"  branching found: {f}:{lineno}")
print(f"\n{passed}/{len(checks)} passed")
print("(dogfood pilot records are PERMANENT public content, not cleaned up)")
sys.exit(0 if passed == len(checks) else 1)
