# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     docs/sprint-user-journey.md, docs/submission-guide.md, .gitlab/ci/day21-submission.yml, docs/business-execution.md, docs/workspace-assistant.md, apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/ContactPage.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/sprint-user-journey.md; CONSUMES docs/submission-guide.md; CONSUMES .gitlab/ci/day21-submission.yml; CONSUMES docs/business-execution.md; CONSUMES docs/workspace-assistant.md; CONSUMES apps/web/src/pages/PricingPage.jsx; CONSUMES apps/web/src/pages/ContactPage.jsx
# Intent:      Define the receiving evidence and verified rollback postconditions that separate source onboarding completion from a deployed Day-21 outcome.
# ───────────────────────────────────────────────────────────────

# Day-21 activation receiving work

To: CMAX-B, IDE1, the GitLab/release owner, and an independent verifier.
This file records requested work. No external notification, provider binding,
reviewer assignment or deployment occurred in the public coding session.
Continue the existing lanes; do not create another verifier or release system.

The public change supplies objective-first onboarding: six explicit choices,
one saved ERP objective, optional context and an existing starting lesson.
The source is based on the owner's audited public revision `5077a96`.
The candidate and local results are retained in the objective-closure report
under `.bits/out/VCC-BUILDANDDO-UPGRADE-001/`.

## 1. Execute the existing GitLab acceptance lane

Use the exact reviewed candidate, Node from `.nvmrc`, isolated declared Python
dependencies, the root npm lock and both disposable PocketBase profiles. Run
`day21_governance`, the existing source-validation jobs and
`day21_full_acceptance` from `.gitlab/ci/day21-submission.yml`. The latter invokes:

```bash
state/day21/venv/bin/python tools/day21/day21_acceptance.py --repo . --install-deps --evidence-dir reports/day21/acceptance --summary-output state/day21/evidence/acceptance-summary.json
```

Retain every receipt, log, JUnit result and original build path, even on failure.
Supply the real job/pipeline identities and same-candidate public review status.
A local invocation of that runner is not hosted GitLab evidence. This session's
source-control provider is read-only and scoped to the public GitHub repository;
it cannot start a private GitLab pipeline or publish its statuses. The hosting
owner must also supply the separate Cloudflare failure diagnostic.

## 2. Bind exactly three integrations and record one real journey

Require the receiving human dispatch, workspace/data scope and current binding
revision before activation. Keep credentials in the receiving secret store.

| Integration | Actual observation required |
|---|---|
| Firecrawl | Registered capture of an allowed source, exact retained text/digest, lost-response recovery, deduplication, and exactly one proposed mission. |
| n8n | Observed current health, one approved bounded effect, failure/uncertain-response reconciliation, and proof that retry did not duplicate the effect. |
| Assistant/inference | Approved existing endpoint/model and data handling, real scoped response, visible reviewed form action, native save, account/workspace denial, and retained personal-session behavior. |

Use real accounts for signup → intent → objective → workspace → first lesson →
live signal → mission → approval → ERP or n8n effect → evidence → different
verifier → capability → replay. Preserve revoked-session, password-recovery,
workspace-recovery and both native-runtime checks. The producer cannot author
the independent verification, and reading a lesson cannot grant a capability.
No authenticated workspace, approved runtime bindings, independent verifier or
live replay was supplied to this coding session.

### First paid-pilot lane

The public Pricing CTA now opens `/contact?interest=pilot#commercial-enquiry`.
It prepares a customer-reviewed email containing the recurring problem, desired
result and optional restrictions. It neither sends mail nor creates a billing
account, entitlement, approval or mission. Manual invoicing remains an operator
process after a written scope. A prepared enquiry is not a customer, payment,
booked pilot or accepted outcome.

Receiving owners: CMAX-B/IDE1 for registered runtimes; the commercial operator
for scope/payment/support/data terms; a separate native reviewer for acceptance.
The requested runtime dispatch, workspace ID, receiving operator and verifier
are still unsupplied. No n8n, Firecrawl or inference management tool is attached
to the public coding session. Resolve these inputs in the receiving plane;
do not put tokens, private endpoints or customer records in this handoff.

Use one workspace, one existing registered n8n operation and one bounded mission:

1. Agree the customer's actual recurring task, successful result, allowed
   input/output, duration, run ceiling and approval owner. Record the support
   contact/hours/response target, cancellation/refund terms, permitted data and
   providers, access, retention and deletion before accepting live inputs.
   A fee is quoted and invoiced manually. Run ceilings are agreed and enforced
   by the operator; this change adds no subscription or usage-limit mechanism.
2. Bind that workspace/worker/operation using the existing contract in
   `docs/business-execution.md`. Retain the approved operation alias, binding
   revision and observed health. Confirm the n8n endpoint durably deduplicates
   `effect_key` and that its reconciliation GET can only read an existing
   receipt. A general webhook URL or a configured service name is insufficient.
3. Capture the permitted real public source through registered Firecrawl.
   Retain its exact text/digest and receipt. Recover the same capture after an
   authorized response-loss test, and propose exactly one mission from it.
4. Bind the existing inference endpoint under `docs/workspace-assistant.md`'s
   data contract. Demonstrate a real scoped response, reviewed form action and
   native save. Check the second account cannot read the first account's
   personal conversation. The assistant cannot approve or verify the mission.
5. Have the authorized person approve the bounded action and the existing
   workflow run. Execute the registered worker once. Retain the mission, run,
   job, effect key, provider execution ID, original reported-result digest and
   actual business readback. An HTTP success alone does not prove the outcome.
6. Exercise the approved uncertain-response case through the existing HOLD and
   reconciliation path. Re-read that same effect; never reissue it to recover
   a lost response. Preserve failed/uncertain results and the provider's
   deduplication observation, rather than replacing them with a success fixture.
7. A different authorized verifier inspects the original result and actual
   outcome, then records the existing native review. Export the complete
   mission at `/app/replay`. Recheck the exported result digest against native
   evidence and retain the candidate/release identities. The producer's export
   is not itself independent review or a capability grant.

Keep customer/provider evidence in its authorized receiving store. Return
sanitized receipt references, identities/digests and explicit PASS/FAIL/HOLD
outcomes to the existing Day-21 evidence process. Run its original GitLab,
browser/native and release checks; the commercial CTA changes none of them.
Do not advertise this lane as live until its real result and independent replay
exist. Official submission and the six materials still depend on sections 3–4.

## 3. Make rollback a verified release postcondition

Source inspection confirms that `scripts/deploy/ship.py:main` stops after a
failed production sync/probe without restoring a previous artifact. The existing
`tools/buildanddo_release.py:rollback_environment` restores a backup and records
`ROLLED_BACK_UNVERIFIED`; it does not prove the backup was a previously verified
release or perform the required restored-version external readback. These
functions were inspected as text, not imported or executed with credentials.

Extend the existing private receiving release path with these bounded checks:

1. Before any production mutation, retain the previous **verified** release's
   source SHA, manifest, artifact digest, successful external identity/health
   receipt and bounded restore target/command. Refuse promotion if the target
   is missing, tampered with, outside the registered root or not tied to that
   verification. A backup directory by itself is insufficient.
2. Stage and verify the candidate; promote those exact bytes. Bind source,
   GitLab pipeline, manifest and artifact identity to every phase.
3. On production sync or verification failure, preserve the failed candidate
   receipt, restore only that admitted prior artifact, and probe the external
   origin for health plus the prior SHA/manifest/digest. A generic SPA 200 or
   mismatching `_version` is a failed readback, not recovery.
4. Write a rollback receipt with the attempted/previous identities, failure,
   restore result and actual external observations. Failed or ambiguous restore
   remains HOLD/UNVERIFIED and stops further promotion; it cannot be marked a
   successful candidate deployment.
5. Exercise missing prior verification, wrong/tampered digest, partial sync,
   failed/ambiguous restore, stale external content and a successful restore in
   the receiving lane. Only then perform the governed staging recovery drill.

Capture `_version`, manifest/artifact hash, actual HTTP proof and observed
Datadog RUM/deploy/DORA acknowledgment for the accepted candidate. Missing
Datadog configuration may remain fail-soft at runtime but cannot satisfy this
acceptance obligation. Deployment-control changes and live actions belong to
the private release owner under AGENTS.md and the registered dispatch boundary.

## 4. Derive the submission from that accepted replay

Use the existing Day-21 capture/index/bundle commands in
`docs/submission-guide.md`. Supply candidate-bound acceptance, browser evidence,
product proofs, a complete non-synthetic replay, and independent owner review.
Capture and review actual organizer eligibility, deadline/time zone, hosting
and submission terms; internal policy does not establish official rules.

The six dated materials are `product_summary`, `evaluator_journey`,
`walkthrough`, `license_and_attribution`, `privacy_and_permissions`, and
`rollback_and_support`. Write the walkthrough and recovery claims from the
observations above. Keep the final bundle HOLD while required evidence is
missing. Private fleet/NXC, voice/video, automated social publishing and live
policy delivery remain outside the active demo promise.
