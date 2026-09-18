# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/operator-plane.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/federal_foundry/operator.py, apps/pocketbase/pb_hooks/workspace-operator.js, apps/web/src/lib/operatorPlane.js, apps/web/src/pages/workspace/OperatorPage.jsx, docs/blueprints.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/federal_foundry/operator.py; CONSUMES apps/pocketbase/pb_hooks/workspace-operator.js; CONSUMES apps/web/src/lib/operatorPlane.js; CONSUMES apps/web/src/pages/workspace/OperatorPage.jsx; CONSUMES docs/blueprints.md
# DAG Node:    none
# Intent:      Make the public operator review loop usable with explicit evidence, freshness, authority and private receiving boundaries.
# ───────────────────────────────────────────────────────────────

# Operator review loop

Open **Operator** at `/app/operator` to review current workspace decisions and
follow them to existing mission, workflow, research and integration desks. The
page reads authenticated workspace records; it does not start workers, approve
plans or infer readiness percentages. Routine work remains in a separate queue.
Source coverage identifies unavailable collections and additional pages.

The compiler turns inspected public capabilities and an optional extracted PDF
blueprint into a portable build proposal. An explicit **Propose review mission**
action uses the existing mission command. The proposed mission still needs its
normal complete plan and approval before execution. Reading or importing a plan
does not write to the workspace.

## Compile and review a build

Run from this checkout or a freshly exported mission-suite archive:

```bash
python -m apps.federal_foundry operator --output /tmp/operator-review
```

For document-driven review, use **Export extracted blueprint** in
`/app/blueprints`, then supply that JSON to the same compiler:

```bash
python -m apps.federal_foundry operator \
  --output /tmp/document-review \
  --blueprint /tmp/extracted-blueprint.json \
  --problem "Review capability reuse for this specification"
```

The output directory must be new. It contains `operator-blueprint.json`,
`bits_tasks.json`, `operator-manifest.json` and their CGRF sidecars. Import
`operator-blueprint.json` into the Operator page to inspect source reuse,
capability gaps, proposed work, dependencies, opportunity deadlines, acceptance
criteria and conditional approval gates. Export preserves the imported plan.
The optional `--at` argument accepts an explicit timezone-aware compilation time
for reproducible local checks. An extraction timestamp later than that time is
rejected.

Compilation prepares the existing five federal lanes' builder and verifier
packets. It creates zero hosted dispatches. The receiving runtime still selects
providers, assigns distinct producer and verifier seats, enforces resource
bounds and retains exact receipts. Source paths absent from an extracted archive
remain listed as uninspected; packaging does not establish runtime readiness.

Publication requires Linux directory handles (`O_DIRECTORY` and `O_NOFOLLOW`)
and filesystem support for atomic `renameat2(RENAME_NOREPLACE)`. Unsupported
platforms fail closed. A fully prepared private directory is published without
adopting or overwriting an existing destination.

## Portable blueprint contract

The schema is `buildanddo.operator-blueprint/v1`:

| Field | Meaning |
| --- | --- |
| `problem`, `source_blueprint` | Operator intent and the optional unchanged document extraction; both remain user input |
| `evidence`, `evidence_refs` | Inspected file paths and SHA-256 fingerprints, plus extraction provenance when supplied |
| `existing_capabilities` | Reusable public implementations, inspected paths and missing source paths |
| `missing_capabilities`, `proposed_modules` | Discovery work and reasons to reuse, extend or investigate existing capabilities |
| `work_queue`, `dependencies`, `owner` | Acyclic proposed work with prerequisite references and unassigned owners |
| `tests`, `telemetry` | Proposed checks and required observations; compilation does not claim they ran |
| `risks`, `rollback`, `acceptance_criteria` | Review conditions and the evidence needed for acceptance |
| `opportunities` | Existing catalog lanes with unverified deadlines |
| `human_decisions` | Conditional future approval gates, separate from observed workspace decisions |
| `prepared_tasks` | Existing model-independent federal builder/verifier packets |

Every imported plan remains `authority: A0`, `status: proposal`,
`verified: false`. Document instructions, check commands and task descriptions
are displayed as text. They are not evaluated by the browser or compiler.
The existing mission proposal command creates its normal incomplete A1 draft;
its description requests an A0 inspection. Neither action changes authority
policy or grants execution authority.

The browser verifies bounded JSON, strict field sets, identifiers, references,
dependency cycles, temporal consistency and the content fingerprint. It rejects
claimed verification, assigned workers, fabricated known deadlines and live
health inside this proposal format. Integrity detects inconsistent bytes, not
authenticity or permission to execute.

The content identity excludes only `id`, `content_sha256` and `created_at`.
Python and JavaScript hash the same typed JSON tree: scalar values retain type,
numbers use big-endian binary64 hex, and object keys are sorted by UTF-16 code
units. Unsafe integers, nonfinite numbers, lone surrogates and excessive nesting
are rejected. The browser also rejects duplicate JSON keys. Recompiling unchanged
inputs at a different time therefore retains the same proposal identity.

Proposal retry keys include workspace, account and content identity. A lost
response reuses the existing command receipt across retries and page reloads.
Account/workspace changes fence late responses; failed or stale reads remove
write eligibility. A malformed successful receipt cannot promote a mission or
leave an exhausted request blocking recovery.

## Workspace observation contract

`GET /api/buildanddo/workspaces/{workspace}/operator?page=1` uses PocketBase's
native user authentication, current workspace membership and current record
visibility. The response is `Cache-Control: no-store`; this feature adds no
collection or migration.

The snapshot samples at most 20 visible rows per source: missions, signals,
evidence, workflow runs, research jobs, suite runs and seat events. Integration
summaries use the existing integration reader. Every source reports its page,
availability and whether more rows exist. A later page, unavailable source or
remaining rows prevents a claim of complete coverage. Missing data is not an
empty successful inventory.

The route returns small summaries. Document bodies, evidence content, workflow
input, execution results, credentials and integration configuration stay in
their existing authorized surfaces. Standalone and mission-linked workflows
retain their native visibility rules. Membership is checked again before the
snapshot is returned.

The projection surfaces complete proposed mission plans and workflow approval
waits as human decisions. Incomplete plans, routine starts, failed work and
expired leases remain ordinary work. Mission links select the visible mission
in the existing desk without performing an action.

Integration health needs a current observation receipt for the current
configuration revision. Both snapshot and observation must be no more than 15
minutes old and cannot be future-dated. Configuration alone does not establish
health. Recent seat activity is historical activity, not available GPU capacity;
completion remains terminal within the observed sample.

## Private receiving work

The page lists the requested ten system categories, but this checkout does not
provide the private NXC, Sentinel, cloud or fleet runtime. Their existing
adapters must be identified before connection work. No private system is made
writable by this change. See
`.bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md`.

The owner selected private `guilds/CNWB` for the runtime and supplied receiving
dispatch `VCC-BUILDANDDO-OPERATOR-RUNTIME-001` and SRS
`SRS-CN-BUILDANDDO-OPERATOR-RUNTIME-001`. The managed provider resolved its remote
but could not attach a GitLab project to this GitHub-only session. The handoff
retains that observation; private ref, registration, scope and adapters remain
unmeasured. The public repository is not the private runtime plane.

The first competition proof is one BuildAndDo evidence blocker through current
NXC context, a reusable capability, a bounded staging job, independent
verification and operator readback. Cultural Property and broader federal work
are deferred. The compiler's five proposed federal lanes do not authorize that
job; their deadlines remain unverified.

## Verification and rollback

```bash
python tests/upgrade/check_federal_foundry.py
node --test tests/upgrade/operator-*.test.mjs tests/upgrade/blueprint-client.test.mjs
python tests/upgrade/test_suite_native.py --require-binary
python -m mypy --strict --explicit-package-bases apps/federal_foundry
node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

The Node tests execute the actual hooks against the repository's explicit
storage/transport doubles and import real Python compiler output. The existing
native suite fixture now exercises operator authentication, native record rules,
role downgrade/revocation, bounded pages, missing sources, redacted job summaries,
no-store responses and readback after a real fixture job is claimed. It compares
read-only SQLite fingerprints before and after reads to detect unintended work
or receipt mutations. All accounts, data and jobs are disposable test fixtures.

Set `BUILDANDDO_TEST_POCKETBASE` to the installed test binary for the native
command. The existing CI matrix requires it for both declared PocketBase
runtimes. Missing binaries fail the required command; ordinary unittest
discovery records skips. Neither result is a private NXC or fleet proof.

Rendered cases live beside Operator, Missions and Blueprints. Run the existing
`npm --prefix apps/web test`, `npm --prefix apps/web run lint` and
`npm --prefix apps/web run build` with the locked dependencies installed. Source
diagnostics do not replace these checks. The owner's merge hold also requires
measured OP-00, a real NXC read, one staging loop with distinct producer/verifier
identities and the public/private boundary. The dispatch report distinguishes
authored tests from checks that actually ran.

Rollback removes the operator source feature through normal review; retain any
mission proposals and command receipts already recorded. No database rollback
is required. Including the compiler and parser in the portable archive changes
the suite source fingerprint. Existing private source bindings must remain
fenced until the receiving operator reviews the normal binding update.
