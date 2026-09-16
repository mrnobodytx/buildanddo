# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-16-bits-codegen-cmax-b-federal-foundry.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/federal-foundry.md, apps/federal_foundry/protocol.py, apps/federal_foundry/opportunities.json
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON docs/federal-foundry.md; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/opportunities.json
# DAG Node:    none
# Intent:      Provide concrete model-independent portfolio intake to the existing private Bits runtime without claiming it was activated.
# ───────────────────────────────────────────────────────────────

# Federal portfolio runtime intake

From: BITS-CODEGEN
To: CMAX-B
Registration dispatch: VCC-BUILDANDDO-UPGRADE-001
Source SRS: SRS-BUILDANDDO-UPGRADE-001
Authority: public A2 source and local verification
State: public intake contract prepared; hosted scheduling and model execution unobserved

The owner asked for Influence, NAVAIR, low-SWaP, semantic ISR and Maritime as
parallel Datadog Bits work packages independent of the LLM provider. The public
compiler and five proposed lane specs are available in this repository and in
the portable suite archive. It emits ten builder/verifier packets and
evidence-derived proposal projections.

## Receiving work

1. Inspect the real Bits intake and model runtime in its authorized private
   source. There is no hosted scheduler API implementation in this public repo.
   The previous attempt to attach the private source to this public session was
   refused; no alternative private access is requested by this handoff.
2. Assign each lane a Ready/In-progress VCC execution dispatch referencing its
   registered SRS. Confirm actual source ownership and prior work. The packet's
   registration dispatch is not its execution dispatch.
3. Run `python -m apps.federal_foundry compile --output <new-directory>`.
   Feed the reviewed `bits-task.md` or portable JSON context to the existing
   intake adapter. Preserve the task/catalogue/source hashes. Do not treat the
   portable schema as an undocumented Datadog API payload.
4. Bind the existing model client through `ModelAdapter.complete` and supply
   the actual provider, model, version and configuration digest. Keep credentials
   in the runtime's current secret mechanism. The public contract requires code
   and structured-output capabilities and enforces request/response scope,
   timeout and byte limits. Provider token and tool budgets belong to that client.
5. Use at most five active lanes, one repository session per lane and a distinct
   verifier seat for each builder. The public session creates no extra worktrees,
   branches, PRs or background research jobs. Use existing sanctioned PR intake.
6. Verify official solicitation IDs, dates, eligibility, page/slide limits and
   data rights before relying on the owner's planning brief. Run CPU experiments
   where appropriate; use actual instrumented hardware for physical claims.
7. Keep public measurement/review receipts in the existing evidence pipeline.
   Verify runtime seat identity in addition to the compiler's digest/scope checks.
   The compiler accepts only explicit public exports and never executes commands
   from receipt content. Attach reviewed outputs through the existing mission
   and Evidence Ledger authority.
8. Preserve human gates for final claims, IP, certifications, costs, personnel,
   commitments and final submission. Record actual portal receipts separately.

## Acceptance evidence to return

- Runtime intake receipt for each actually created dispatch, with scope and seat.
- One real provider/model/version-bound request/response satisfying the public
  adapter contract; use a second configured model family to verify independence.
- Independent verifier identity and raw measurements for a bounded experiment.
- Rejection receipts for expired/incorrect dispatch scope, stale task, wrong
  response fingerprint, provider timeout, same-seat review and changed evidence.
- Device, instrument, measurement method and raw data for any physical claim.
- Actual CI artifact and installed suite source fingerprints; all proposals stay
  held until the owner's separate truth/eligibility/submission decisions exist.

The public source uses no new signing, memory, NATS, credential or release
authority. All CK/CAPS/CKS remain pending. Runtime activation and telemetry are
receiving-seat work.

## Rollback

Stop intake for this catalogue revision through the existing supervisor.
Preserve dispatched tasks and every experiment/review receipt. Revert source
through the normal PR flow if needed. Suite source identity changes with this
package; update or roll back the worker binding only through the existing
operator procedure. A stale worker must not finish a newly bound run.
