# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     scripts/estate_census.py, apps/estate/seal.py, .bits/srs/SRS-BUILDANDDO-ESTATE-001.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON scripts/estate_census.py; DEPENDS_ON apps/estate/seal.py; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-ESTATE-001.md
# DAG Node:    none
# Intent:      Document the estate compiler's reproducibility contract, evidence limits and graph-owner integration boundary.
# ───────────────────────────────────────────────────────────────

# Citadel Estate Intelligence

Compile BuildAndDo's existing filesystem, CGRF, SRS, import, manifest and
PocketBase evidence into a canonical module graph. Python 3.11+ and the standard
library are sufficient. The compiler uses CPU and local files only. It does not
execute application code or contact PocketBase, providers, telemetry or DKG.

```bash
python scripts/estate_census.py
python scripts/estate_census.py --report
python scripts/estate_census.py --module web
python scripts/estate_census.py --orphans
python scripts/estate_census.py --violations
python scripts/estate_census.py --delta ESTATE-YYYYMMDD-HASH
```

Use the actual seal ID printed by a prior run with --delta. All view flags use
cached evidence and never rescan source. --root selects another local repository;
--json emits the selected view as canonical JSON. A missing or corrupt cache
returns exit code 2. Structural defects are report data and leave exit code 0.

## Snapshot contract

The full run writes ignored local output to state/estate/seal.latest.json and
retains each source snapshot under state/estate/seals/SEAL_ID.json. No existing
application file is changed. The JSON document contains:

- seal: content identity, commit, stable timestamp, census Merkle root, module and
  edge counts, reconciliation totals and previous-seal linkage.
- snapshot: modules and typed edges, with census files, import/declaration
  receipts, routes, collections, SRS entries, reconciliation details, analysis
  notes and structural defects as attached evidence.
- delta: added/removed/modified modules and files, directory changes, exact edge
  changes and changes to snapshot metadata.
- document_sha256: the digest of the complete envelope except that digest field.

Graph Operator / DKG remains the canonical graph owner. Consumers may import
snapshot.modules and snapshot.edges; every edge endpoint is a module ID. Files,
routes, collections and external package references remain evidence leaves.
This local archive is a compiler output, not a competing graph database.

## Determinism and history

The source identity is SHA-256 of canonical snapshot JSON, including the Git
commit and all inventoried file hashes. File hashes stream in 256 KiB chunks.
Census leaves are sorted by relative path; the Merkle tree prefixes leaves with
0x00 and parents with 0x01, duplicating an odd final child. The empty census root
is SHA-256 of empty bytes.

Dates come from the local Git commit in UTC. Non-Git roots use
1970-01-01T00:00:00Z and commit unversioned. A seal ID uses that date and the first
16 hexadecimal characters of the source hash. A wall-clock timestamp or run
counter would make identical source states produce different seals.

Previous-seal linkage and delta describe local observation history. They are
covered by document_sha256, separately from seal.sha256, so restoring an earlier
source state restores its source identity while recording the actual predecessor.
Unchanged reruns preserve the complete cached document byte for byte. The archive
retains the first observation of each source identity; latest retains the most
recent transition. These digests are integrity checks, not signatures or CK stamps.

Directory sizes are zero; filesystem allocation sizes and mtimes do not enter
the census. The compiler excludes its own state/estate output and a state parent
containing only that output. The CLI suppresses bytecode writes.

## Evidence boundaries

- node_modules, .git, __pycache__, dist, virtual environments, tool caches,
  PocketBase data/snapshot directories and secret directories are opaque census
  entries. Lockfiles are hashed but not parsed.
- Symlinks are inventoried by their link text and never followed. Secret/key and
  runtime database files receive metadata only. Special files are never opened.
- Text analysis is bounded at 2 MiB per file; larger files still receive streamed
  hashes and bounded header inspection. Binary assets are hashed without parsing.
  Analysis omissions, malformed supported inputs and nonliteral dependencies
  remain visible as notes or unresolved references.
- Python uses AST imports and public symbols. JavaScript uses a comment/string
  aware token reader for imports, requires, re-exports, JSX bindings, native
  routerAdd calls and migration collection definitions. It is not a JS evaluator.
- JS aliases come from the nearest jsconfig/tsconfig paths declaration. The
  conventional @/ to module/src mapping is a lower-confidence fallback. Hook
  templates using __hooks and local workspace/file package dependencies resolve
  to actual census paths. Computed loaders and dynamic registrations are not
  inferred as proven implementations.
- CGRF metadata takes precedence over conventions. App, service, script and test
  boundaries group nested file evidence; separate manifests or explicit module
  declarations can establish narrower boundaries.
- SRS specifications alone are not implementation evidence. Missing registry
  paths, import/declaration differences and hook/schema differences retain their
  source receipts. Native PocketBase collection APIs can intentionally have no
  custom hook, so schema-without-hook findings do not imply a broken backend.

## Structural validation

ModuleShape checks identity, files, lifecycle, capability/utility role and CGRF or
manifest provenance. RouteShape checks handler presence, explicit auth/public
declaration and endpoint references in tests. GovernanceShape checks registration,
dispatch/spec presence and referenced paths. DependencyShape checks declared
resolution and module cycles through DEPENDS_ON/CONSUMES edges.

A test file mentioning a route is structural test evidence, not proof that the
test passed or that a deployed endpoint works. Likewise, a static handler is not
a runtime correctness claim. Existing defects remain untouched.

## Verification

```bash
python tests/estate/check_estate.py
python -m mypy --strict --explicit-package-bases --follow-imports=silent apps/estate scripts/estate_census.py
python -m ruff check apps/estate scripts/estate_census.py tests/estate
```

The offline fixtures cover the requested fifteen scenarios plus cache integrity,
byte-identical reruns, history restoration, declared/public authentication and
the CLI. The gate measures statement coverage with the repository's stdlib trace
pattern and requires at least 80 percent for each compiler module. It adds no CI
workflow or dependency and does not run live backend suites.

