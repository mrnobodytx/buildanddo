# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-18-bits-codegen-c-one-capability-repair.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, apps/estate/README.md, docs/workspace-knowledge.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md; CONSUMES apps/estate/README.md; CONSUMES docs/workspace-knowledge.md; VERIFIED_BY .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# DAG Node:    none
# Intent:      Give the private repair owner concrete identity, ownership, selftest and materialization acceptance without copying private evidence or granting execution authority.
# ───────────────────────────────────────────────────────────────

# BITS-CODEGEN to C-ONE; independent verification requested from VCC

This is a repair and acceptance handoff in response to the owner's supplied
verification report. C-ONE remains the proposed implementer; VCC remains the
proposed independent verifier. No seat has been dispatched or contacted by this
file. Execution requires the receiving repository's existing authorization.

The private compiler and installer are absent from this checkout. Findings below
are operator-reported; only the public references and explicitly synthetic
diagnostics have been inspected here. Private datasets, receipts, host paths,
hashes and organization rosters remain on the private plane.

## Repair contracts

| Work item | Required behavior | Independent acceptance |
|---|---|---|
| CR-ID: capability identity | Select a validated, source-scoped tool identity; keep SRS values as metadata. Never stringify a list/dict into an ID or silently merge distinct tools. | Distinct paths sharing scalar/list SRS metadata stay distinct. Exercise missing, empty, numeric and structured candidate IDs; duplicate source records; conflicting payloads; repeated runs and input permutations. Account for every input. |
| CR-OWNER: ownership producer | Emit evidence-backed `OWNS_CAPABILITY` through the existing graph contract from an authorized roster/mapping source. Preserve the relation allowlist. | Accept one supported ownership edge; reject missing evidence, unknown owners/tools, wrong scope, stale/revoked mappings and conflicting claims. Keep `PART_OF`, `MATCHES` and lineage edges outside the ownership lane. |
| CR-SELFTEST: executable checks | Replace production selftest assertions with explicit failure handling, nonzero exits and a summary identifying executed checks. | Run the actual CLI with the installer-selected interpreter normally, with `-O` and with `-OO`. A deliberately broken fixture fails all three; a healthy fixture passes all three and reports checks executed. |
| CR-INSTALL: canonical keys and writes | Canonicalize registry and lookup paths consistently; preserve hash guards and report partial writes accurately. Bind each stage to the overlay bytes it actually consumes. | POSIX and Windows spellings resolve the same approved relative key; unknown hashes and path escapes remain denied. A late conflict is caught before writes; injected apply failure has truthful receipts/recovery; unchanged reruns are idempotent. |

CR-ID comes before regenerating graphs, ownership mappings, falsifier links and
surface contracts. Freeze the real input snapshot and tool revision privately
first. Run the selftest and installer negative controls before trusting their
gates to approve a repair. Then prove one complete ownership/workflow path before
expanding the queue.

### Identity repair and migration

The reported `path`-before-`srs` change addresses the observed collision mechanism,
but the exact precedence must follow the real catalog schema. Prefer a nonempty
stable tool ID when the source defines one; otherwise use a validated locator
scoped to its repository/catalog and, where needed, entrypoint. Equal paths in
different sources must remain distinct. Do not use mutable SRS membership as
tool identity, or assume every raw row is a different tool.

Require an accounting receipt: every raw row is emitted, explicitly linked to a
documented duplicate, or held with a reason. A conflicting identity cannot use
first-wins/last-wins behavior. Test byte-identical output for identical input and
stable identities under row ordering; preserve provenance for duplicate rows.

Rebuild downstream references from the frozen inputs and publish an old/new
identity reconciliation. A previously collapsed ID may map to several tools;
that alias is ambiguous and cannot safely route an old receipt to one new tool.
Hold unresolved historical references. Retain original receipts and add explicit
correction/supersession records instead of rewriting evidence history. Recompute
surface totals from eligible, resolved identities rather than retaining previous
counts as targets. No unmapped capability reference may silently survive.

### Ownership production and one complete proof

Inspect the existing private graph producer first. It must consume the canonical
roster read-only and an explicit, authorized ownership declaration. File placement,
matching text, SRS affiliation and category membership do not establish ownership.
Keep declared ownership separate from permission to execute and from measured
capability maturity. Broadening accepted predicates would hide the producer gap.

Use the receiver's established schema. Require the semantics of owner identity,
capability identity, relation, source revision, evidence reference, declaring
principal, scope and validity/freshness. These are acceptance requirements, not
a new wire format. Preserve unresolved declarations as holds; require an explicit
policy for joint ownership rather than assuming multiple owners are a conflict.

The first receiving acceptance path is:

`roster owner -> evidenced capability -> approved test workflow -> run receipt -> independent readback`

Bind the receipt to exact input/tool/workflow revisions and the execution scope.
Return actual postconditions, outcome, telemetry/privacy checks and freshness.
Exercise missing ownership, denied execution, failed postcondition and stale
receipt cases as well as success. Retain the failed attempts. Producer and
verifier are distinct; discovering or declaring a capability never mints VERIFIED.

### Installer and runtime gate details

Use one relative-path policy on both sides of the known-prior lookup. Native
`Path.as_posix()` handles paths constructed on that host; Windows strings tested
on Linux need explicit Windows parsing. Separator normalization alone does not
validate root containment. Reject absolute, drive-qualified, UNC and escaping
paths; validate symlink/reparse-point destinations before writing. Apply the
target filesystem's documented case policy without globally lowercasing IDs.

Preflight the complete materialization plan before its first write and recheck
expected hashes at application. Keep backups and a write journal. An interrupted
multi-file update may still be partial: report that state and recovery evidence;
do not call HOLD a rollback. Deleting conflicting files is not a repair. Identify
whether the downstream applier reads the packet overlay or materialized overlay,
verify that exact input manifest, and exercise the real installer orchestration.
A direct downstream run does not validate the whole installation sequence.

Explicit selftest failures must survive optimization. This requirement concerns
the production selftest, not ordinary pytest assertions. Missing pytest in the
installer environment is a distinct prerequisite failure; a passing suite under
another interpreter does not satisfy it. Report both interpreters and dependency
versions in private receipts. Do not turn unavailable tests into silent success.

## Public consumers already available

- `apps/estate/README.md`: the existing CPU-only compiler describes module and
  dependency evidence, source snapshots, reconciliation and integrity digests.
  Its canonical graph owner remains Graph Operator / DKG. Module ownership of a
  file is a containment relation, not organization ownership of a capability.
  Its output cannot supply the missing ownership declaration by inference.
- `docs/workspace-knowledge.md`: the existing PocketBase projection uses scoped
  record IDs, current read permissions, citations and incomplete-source markers.
  It can guide an eventual reviewed public view without another graph database.
  No importer for private capability state or ownership evidence is implemented
  or authorized by this handoff. Any future adapter needs an approved sanitized
  contract and must preserve scope, freshness, source state and access revocation.

Keep surface plans in their recorded execution state. `public_write_approval`
marks an approval requirement; it is not evidence of approval. PROPOSE_ONLY and
APPROVAL_REQUIRED contracts must not initiate public writes. Contract generation,
local discovery and a declared zero-action field do not establish runtime health.
An unauthenticated HTTP 401 establishes a reachable HTTP/authentication surface,
not authenticated MCP operation. The receiving seat must use its supported
authenticated read flow; no token request, probe or memory write occurs here.

## Synthetic diagnostic reproduction

Run from any directory with Python 3.11+. This demonstrates three language/path
mechanisms using invented inputs. It does not import the private implementation,
validate its proposed patch, measure real cardinality or prove ownership.

```bash
python - <<'PY'
import json
import subprocess
import sys
from pathlib import PureWindowsPath

def require(condition, message):
    if not condition:
        raise SystemExit(message)

rows = [
    {"srs": ["SRS-EXAMPLE-001"], "path": "tools/example_a.py"},
    {"srs": ["SRS-EXAMPLE-001"], "path": "tools/example_b.py"},
]
old = {str(row["srs"]) for row in rows}
locators = {("example-catalog", row["path"]) for row in rows}
require(len(old) == 1 and len(locators) == 2, "identity control failed")

key = "modules/example/repo_overlay/tools/example_a.py"
windows_key = PureWindowsPath(key)
known = {key: {"synthetic-prior"}}
require("synthetic-prior" not in known.get(str(windows_key), set()),
        "separator negative control failed")
require("synthetic-prior" in known.get(windows_key.as_posix(), set()),
        "canonical key control failed")
require("synthetic-unknown" not in known.get(windows_key.as_posix(), set()),
        "unknown content guard failed")

exits = {}
for mode in ([], ["-O"], ["-OO"]):
    codes = []
    for source in ("assert False, 'synthetic failure'",
                   "if True:\n    raise SystemExit(7)",
                   "if False:\n    raise SystemExit(7)"):
        result = subprocess.run([sys.executable, *mode, "-c", source],
                                capture_output=True, text=True, timeout=10)
        codes.append(result.returncode)
    require((codes[0] != 0) == (not mode), "assertion control failed")
    require(codes[1:] == [7, 0], "explicit exit controls failed")
    exits[mode[0] if mode else "normal"] = codes
print(json.dumps({"state": "PASS", "synthetic_only": True,
                  "identity_counts": [len(rows), len(old), len(locators)],
                  "canonical_key": "PASS", "exit_codes": exits}, sort_keys=True))
PY
```

## §15 Report Template

### §1 SUMMARY

Status: COMPLETE for the public handoff; private fixes and verification pending.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Authority: existing A2 source dispatch, narrowed
to public documentation and local diagnostics. Actor: actor:agent.
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-fix-dora-timestamps.
Tasks: CR1/CR2/CR3 complete (3/3 public tasks). Documentation smoke: 4/4.
CKS Gate: independent receiving review. CKS, CAPS and CK: pending.
Source record: `git log -1 --format='%H %s' -- .bits/handoffs/2026-09-18-bits-codegen-c-one-capability-repair.md`.

### §2 TASK RESULTS

CR1: private repair modules absent in the tracked public tree; the two public
consumer documents above are present. Verify with
`git ls-files '*org_capability*' '*materialize_pack*' '*repo_apply*'` (empty) and
`git ls-files apps/estate/README.md docs/workspace-knowledge.md` (two paths).
CR2: the four repair contracts, negative controls and independent receiving
roles are specified above. Run the synthetic diagnostic block for its three
limited mechanism checks. CR3: run the documentation smoke below.
Files: this handoff, the existing SRS/dispatch, context lock and memory payload.
CKET: 11_COMMIT for handoff/evidence, 04_HYPOTHESIZE for the existing SRS.

### §3 SMOKE TEST RESULTS

| Command | Expected | Observed |
|---|---|---|
| Synthetic diagnostic block above | PASS; assertion failure suppressed only under optimization; explicit failures retained | PASS: synthetic identity 2/1/2; path controls pass; normal exits [1,7,0], optimized exits [0,7,0] |
| `python scripts/ci/agent_context.py --check` | Inventory matches; historical findings retained | PASS: six historical findings and four unwired gates retained |
| `python scripts/ci/verify_public_boundary.py` | Public paths and secret-pattern checks pass | PASS: 930 tracked files; zero failures; actor label not checked |
| `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | Current file vectors, declared edges and complete IOO | PASS: 600 file vectors, 1,273 edges, 122 events; no orphans |

No application code changed. Application suites, the private compiler/installer,
Windows execution, authenticated MCP and deployed surfaces are not tested here.
Public documentation checks cannot close those acceptance gaps.

### §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json. All 120 events
preceding this handoff are unchanged. Type A: 600. Type B: 1,273. Type C: 122.
IOO: complete. DKG orphans: zero. The dispatch-memory verifier passes.
Memory records describe public work and synthetic observations only; no direct
memory-service ingestion or private receipt publication is performed.

### §5 CKET FILING

One new 11_COMMIT handoff carries its CGRF header. Existing SRS/dispatch and
evidence retain their provenance. Verify with the dispatch-memory command above.
REFLEX validation remains a post-merge responsibility.

### §6 GOVERNANCE

Entity: Citadel Nexus Inc. Existing license posture retained. Private roster,
catalog, hashes and operational receipts are excluded. Local public-boundary
result is recorded above; grades/signatures remain pending. Stripe: not
applicable. Actor label application and private authorization are not claimed.

### §7 NEXT ACTIONS

Receiving blocker: private source, frozen inputs, an approved ownership mapping
and the receiving execution dispatch are not available in this public checkout.
Handoff requested: C-ONE implementation, VCC independent verification. This file
records the request only. Suggested receiving scope: the four contracts above;
no new dispatch ID is invented. Bugs filed externally: none.

Return sanitized before/after accounting, unresolved-ID disposition, ownership
acceptance/denial results, actual CLI negative controls and an installer recovery
receipt. Retain detailed evidence privately. Rollback of this documentation is
removal of this continuation with its local bookkeeping; it changes no runtime.
