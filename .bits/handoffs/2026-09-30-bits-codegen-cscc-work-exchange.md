# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-30-bits-codegen-cscc-work-exchange.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/mutual-development.md, libs/evolution/work.py, libs/evolution/work_exchange.py, .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/mutual-development.md; CONSUMES libs/evolution/work.py; CONSUMES libs/evolution/work_exchange.py; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json
# Intent:      Give CSCC and release owners a concrete public contract and acceptance matrix for the first independently verified reciprocal mission.
# ───────────────────────────────────────────────────────────────

# CSCC work exchange receiving handoff

From: BITS-CODEGEN. To: CMAX-B / IDE1, CSCC operator, identity and release owners.
Status: proposed receiving work; public source implementation only.
Authority here: A2 source, candidate-only exchange. Existing private execution
and explicit human A3 dispatches govern runtime effects, credentials and release.

The owner requests the BuildAndDo/Citadel mutual-development loop. This source
provides strict work/results, mission conversion, bounded evidence packages,
independent review admission, epoch inclusion and worker-history projection.
Use `docs/mutual-development.md` and the schema export commands there. No public
CSCC endpoint, authenticated live worker or successful receiving run is asserted.

| Receiving owner | Concrete next action | Acceptance evidence |
|---|---|---|
| CMAX-B / CSCC | Mount `WorkContract.from_dict` and `WorkSubmission` validation inside the existing authorized dispatch intake. Pin the accepted work digest, workspace/tenant and expected repository before assignment. Resolve registered Ready/In-progress SRS and dispatch authority through the existing owner. | Same work retry is idempotent; foreign scope, altered contract, expanded paths and unauthorized actor fail before dispatch. A public packet's SRS label alone cannot authorize execution. |
| Identity owner | Resolve canonical worker/contributor/verifier identities to authenticated GitHub and GitLab account IDs and the correct provider instance. Retain stable IDs independently of display names. | Producer and verifier are distinct real principals, including aliases and shared accounts; missing/conflicting mappings remain unresolved. Export only approved public metadata. |
| IDE1 / BuildAndDo | Bind accepted proposals to the existing native mission commands and the receiving workspace. Return result references through existing evidence commands and review policy. Preserve original work/result/attempt digests in the receiving store. | Browser clients cannot write verified status or agent identity; current membership and scope checks precede every command. Exact retries reuse the same attempt, changed bytes require a new attempt. |
| GitLab CI owner | Consume the existing candidate-to-GitLab path; verify the received commit object and check out that exact revision. Generate candidate provenance with `--work`, then run configured tests and required native/browser profiles. | Public and private candidate SHA agree; actual changed paths stay in scope; original logs/artifacts, failed/skipped counts and native versions are retained. Source-test success does not substitute for rendered or runtime checks. |
| CSCC result adapter | Construct `WorkResult` from observed job outcomes and sanitized bounded evidence. Use a stable attempt ID and preserve failure, HOLD, cancellation and rollback. Produce a new local bundle through `write_bundle`. | Candidate provenance, times, sizes and SHA-256 values validate against actual bytes. Missing artifacts/readback remain absent; no artificial PASS or seeded mission completion is emitted. |
| Independent verifier | Inspect the actual public candidate and its result. Obtain `WorkSubmission.subject` and `required_sources`; return the existing semantic `VerificationReceipt` covering every named check. Authenticate exact receipt pins into the receiving `ReviewPolicy` separately. | Worker/contributors/evidence authors cannot self-verify. Wrong candidate, changed content, omitted evidence, unpinned/stale review and missing deployment/runtime proof fail admission. Policy files are never accepted from submitted bundles. |
| Release owner | Apply the existing GitLab/private release-controller gates after candidate acceptance. Observe the deployed revision and external behavior under a separately authorized runtime dispatch. | Actual artifact, deployment and external readback evidence refers to the selected candidate. BuildAndDo cannot approve Citadel production, and Citadel cannot bypass BuildAndDo release policy. |
| Evidence / experience owner | Supply explicitly selected sanitized result bundles to the existing epoch builder and rederive `worker_experience` from the accepted work/candidate selections and current review policy. Keep private originals in private storage. | Root and artifact rechecks pass, historical failures/rollbacks remain visible, and repeated/later-reviewed attempts count once independent of arrival order. Epoch integrity is not independent verification. Signing/anchoring stays with its authorized owner. |

The first packet is
`.bits/out/VCC-BUILDANDDO-UPGRADE-001/mutual-development-dogfood.json`.
It uses the real source revision containing the earlier Buddi/workspace fixes
and the digest of the retained workspace repair report. It asks for source and
native/browser verification, bounded repairs when reproduced, and eventual
same-candidate release readback. Worker assignment and provider activation are
still pending. An A2 contract cannot grant its requested A3 runtime steps.
The packet pins the inspected local source revision; confirm public/private
availability before using it. If a newer starting revision is selected, reissue
and review the contract before assignment, retaining this proposal as history.

Run the new work gate on both declared Python versions and preserve its report.
Then execute one real receiving mission with the identities above. Retain at
least one controlled missing-evidence and wrong-scope rejection, plus a response
loss retry that produces no duplicate attempt or effect. Keep producer and
verifier identities separate through native mission, epoch and history views.

GitHub receives reviewed public candidates, sanitized source/evidence and release
descriptions. Private branches, telemetry bodies, credentials, topology and
deployment controls remain private. Outbound publication requires the existing
public boundary and receiving publication checks; it is a distinct flow from
inbound candidate evaluation.

Source acceptance can be checked locally with
`python tests/upgrade/check_work_exchange.py`. A passing source report cannot
close this receiving handoff. Closure requires the observed assigned mission,
GitLab result, independent receipt, release/readback, native evidence links and
derived experience for the same work/candidate.
