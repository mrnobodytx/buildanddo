# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     docs/operator-plane.md, apps/federal_foundry/protocol.py, apps/mission_suite/worker.py, .bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/operator-plane.md; CONSUMES apps/federal_foundry/protocol.py; CONSUMES apps/mission_suite/worker.py; DEPENDS_ON .bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md
# DAG Node:    none
# Intent:      Bound private operator-plane receiving work to identified existing adapters, current evidence and explicit execution authority.
# ───────────────────────────────────────────────────────────────

# Operator plane receiving handoff

From BITS-CODEGEN to CMAX-B, with IDE1 for existing backend adapters.
Origin: `VCC-BUILDANDDO-UPGRADE-001`. The owner selects private `guilds/CNWB`
as the receiving runtime plane and supplies:

- Receiving dispatch: `VCC-BUILDANDDO-OPERATOR-RUNTIME-001`.
- Receiving SRS: `SRS-CN-BUILDANDDO-OPERATOR-RUNTIME-001`.
- Initial scope: OP-00 discovery, followed by one bounded BuildAndDo staging loop.

On 2026-09-18 the managed repository provider resolved the project to
`https://gitlab.citadel-nexus.com/guilds/cnwb` and rejected attachment because
this session only supports GitHub repositories. That remote is an observed
provider result; no private checkout, branch/ref, module or tenant was inspected.
Registration/status of the receiving identifiers remains unmeasured. Do not
attempt an alternate clone transport or implement the receiving runtime here.

## Supplied public capability

| Capability | Reuse boundary |
| --- | --- |
| Structured PDF extraction | Existing research worker, sandboxed parser, source hash and requirement provenance |
| Operator blueprint compiler | Existing federal catalog and builder/verifier protocol; source inspection precedes proposed modules |
| Read-first cockpit | Existing authenticated workspace records, bounded pages, freshness and explicit human decisions |
| Review proposals | Existing mission command and durable retry receipts; normal plan and approval gates remain |
| Runtime contract | Existing suite worker, task packets and source binding checks; no replacement dispatcher |
| Policy review | Existing portable policy packets and separate private Sentinel receiving handoff |

`docs/operator-plane.md` defines commands, schema and acceptance limits. The
portable archive now includes the compiler and extraction contract; update any
private source binding through its normal review process, never by bypassing
the fingerprint check.

## Receiving prerequisites

Use an authorized CNWB session to observe its current remote/ref and register or
verify the supplied receiving SRS/dispatch under that repository's conventions.
Bind the permitted tenant/workspace and staging resource scope before any job.
Credentials stay in the existing receiving secret provider. This public session
has not registered a private dispatch or inferred a tenant from a test fixture.

OP-00 must inspect the existing NXC, Sentinel, NATS, DKG/context graph, Datadog,
PostHog, GitHub/GitLab, Supabase, n8n, Cloudflare/DigitalOcean, Rig2/fleet and
GPT/Codex/model-dispatch adapters. For each, return its canonical module/path,
owner, read and write capabilities, required authority, tenant/workspace scope,
freshness/readback contract, last measured evidence and MEASURED/UNMEASURED/HOLD
state. In this session their private paths and evidence remain HOLD; public
module names and configured providers are not substitutes for that inventory.

The competition priority is BuildAndDo operating BuildAndDo. Cultural Property,
its dataset and the six-acquisition inventory are deferred and do not block this
demonstration. The public compiler's five federal lanes remain prepared proposals
with unverified deadlines, not the intended scope of the first staging job.

## Bounded task table

| Task | Work | Required evidence |
| --- | --- | --- |
| OP-00 | Map existing private adapters, owners and authorized scope | Repository paths, receiving dispatch and current capability inventory |
| OP-01 | Read canonical NXC context and compare direct source freshness | Tenant-scoped source receipts, observation times and stale/unavailable behavior |
| OP-02 | Connect existing Datadog, PostHog, GitHub, Supabase, n8n, cloud and fleet readers | Bounded read receipts; no configuration-only health claims |
| OP-03 | Deferred: reconcile official notices, amendments, deadlines and eligibility | Separate pursuit scope after the BuildAndDo loop is proven |
| OP-04 | Deferred: map Cultural Property reuse, data rights, taxonomy, evaluation and SME gaps | Separate pursuit scope after the BuildAndDo loop is proven |
| OP-05 | Bind a small job to the existing model/fleet dispatcher | Authorized resource limits, source binding, separate verifier and exact receipts |
| OP-06 | Exercise one BuildAndDo blocker-to-review-to-staging-outcome path | Actual NXC observation, blueprint, mission, job, distinct producer/verifier, receipts and readback |
| OP-07 | Deferred: broaden improvement candidates from observed telemetry | Separate comparison evidence after the BuildAndDo loop is proven |
| OP-08 | Resume routine work and recover uncertain effects | Receipt-first recovery with no duplicate jobs or writes; unresolved approvals remain human decisions |
| OP-09 | Run native backend and rendered/deployed acceptance | Authorized receiving environment, tenant isolation, revocation, retry and rollback results |

Run OP-00 first. Broaden only far enough to prove one live staging loop:
`/app/operator` reads sanitized current NXC state, identifies one real missing or
stale BuildAndDo evidence item, compiles one blueprint reusing the discovered
capability, creates one bounded review mission, dispatches one staging-safe job,
records its producer, independent verifier and receipt, reads the outcome back,
and updates the human-decision queue. The producer must differ from the verifier.
Record exact attempts, source revisions, observation times and retained failures;
a prepared task packet or this handoff is not an execution receipt.

## Merge hold

The owner requires all of the following before merge:

| Gate | Evidence required |
| --- | --- |
| Native and rendered UI acceptance | Real PocketBase operator/suite cases and existing rendered workspace tests pass |
| Lint and build | Repository lint passes and the normal Vite build produces its web artifact |
| Private OP-00 | Measured adapter inventory from the receiving CNWB ref |
| NXC read | A current, tenant-scoped observation with readback reference |
| One live operator loop | The bounded staging chain above, including UI outcome readback |
| Independent verification | Different producer and verifier identities bound to the actual job/result |
| Public/private boundary | Public boundary scan plus reviewed sanitized response/evidence references |

The public native gate is `python tests/upgrade/test_suite_native.py --require-binary`
with the existing test-binary binding. It now includes the
operator route and cannot succeed by skipping a missing binary. Local source
tests, authored native tests and compiler output do not clear the private or
rendered gates. No merge authorization is implied by source completion.

## Authority and evidence

Production deployment, external email, proposal submission, financial
commitments, credential changes, destructive actions and contract attestations
require separate explicit human approval. The supplied receiving scope permits
private reads, bounded snapshots, private test branches, A0/A1 proposals and
staging-only readback. Job/state writes must be bound to that registered dispatch,
permitted tenant, staging target and resource limits; they are not public-browser
provider credentials or unrestricted fleet authority.

Keep private telemetry, procurement-sensitive material, credentials and dataset
contents in the private evidence plane. Return only permitted sanitized
summaries and references. Hashes establish identity, not source authenticity,
legal rights, verification or approval. Do not publish an official acquisition
claim without its source and the responsible human's required review.

The current public source checks do not establish live NXC, PostHog, Sentinel,
fleet, government-source ingestion or deployed-browser acceptance. Preserve
these missing observations in the receiving report instead of filling them
with synthetic health or success values.
