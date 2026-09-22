# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/sprint-user-journey.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/hostinger-readiness.json, tests/upgrade/sprint-journey.test.mjs, tests/upgrade/test_workspace_native.py
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/hostinger-readiness.json; VERIFIED_BY tests/upgrade/sprint-journey.test.mjs; VERIFIED_BY tests/upgrade/test_workspace_native.py
# Intent:      Explain the ten source gaps closing the sprint's user journey and preserve the separate runtime acceptance obligations.
# ───────────────────────────────────────────────────────────────

# The remaining sprint user journey

BuildAndDo's product identity is educational collaboration: people and AI learn
by doing real projects together. The journey begins with an objective and a
relevant lesson or method, uses collaboration and bounded work, then retains
observations, verification, reflection and reusable experience. Classes,
tutorials, practices, evidence, replay and capability/progress views are core.
The ERP/provider acceptance lane below is one business-project application;
its required evidence does not define the platform's audience.

The sprint already had native onboarding, mission approval, immutable reviewed
evidence, executable workflows, connector workers, ERP records and strict
submission validators. This continuation repairs the gaps between those pieces.
Priority follows the dependency order in the eleven-milestone readiness contract:
an operator must enter the right workspace, retain the right records, execute
approved work, and inspect the result before any submission can be accepted.

| Sprint day | Gap observed in source | Implemented behavior | Acceptance still required |
|---|---|---|---|
| 3 | Persisted authentication was trusted without server revalidation; onboarding could retain the old selected workspace and a generic website-less name. | Native session refresh gates private routes, ignores old-account replies and offers recovery. Named onboarding selects the exact returned workspace. Selection is stored per account. | Render signup, revoked sessions, named setup recovery and workspace selection against both native profiles. |
| 5 | Collection filters did not group OR expressions; late reads/writes could return a previous scope's results. | Group extra predicates under the workspace filter, validate returned scope, verify update/delete targets, and suppress replies after account/workspace changes. | Native record rules and browser switching under outstanding requests. |
| 7 | Capture reload searched only the first receipt page and hid failure/recovery choices. | Read the exact receipt ID, retain the identity of an uncertain request, show failures and allow existing queued/claimed cancellation. Link directly to the receipt. | Registered Firecrawl capture, cancellation races and actual lost-response recovery. |
| 9 | Verification controls did not explain current role, approval, proposer and evidence-author constraints before submission. | Show actionable prerequisites; prevent verification controls from claiming readiness for an ineligible reviewer. Existing native policy remains authoritative. | Two distinct accounts completing the reviewed mission on native PocketBase. |
| 11 | A receipt or next-action link could not reopen a particular saved workflow run. | Resolve a durable run query parameter through the scoped API, loading the current snapshot/revision before a decision. Foreign/missing runs stay unavailable. | Render bookmarked approvals, concurrent decisions and rejection/reload behavior. |
| 13 | Action forms required typing a binding without explaining its current configuration or health. | Select the configured connector, display disabled/stale/unavailable states, and expire health locally. The server still checks the registered worker, revision and health before effects. | Real registered n8n/Firecrawl health, provider effects and uncertain-outcome reconciliation. |
| 15 | Existing ERP search/status/due-date controls lacked objective/contact drilldowns and exact task destinations. | Scope task filters by objective/contact/ID and connect tasks to their retained action, mission and evidence. | Browser and native task creation, relations, denial and follow-up. |
| 17 | The ledger list could not inspect a record alongside the exact evidence snapshot reviewed by its mission. | Add a durable evidence inspector, safe source navigation, current-versus-reviewed comparison and a local observation download. A typed label never becomes verification. | Native immutable evidence and rendered inspection of unchanged, altered and inaccessible records. |
| 19 | The overview summarized counts without a connected next step for current work. | Rank waiting approvals, blocked/planned missions, overdue tasks, missing evidence and independent reviews; suppress suggestions for incomplete reads or demo data. | Browser work across account/workspace changes and actual operator readback. |
| 21 | Replay exported a receipt page, leaving related runs, evidence, tasks and reviews disconnected. | Capture one complete bounded readable mission chain in one native transaction, validate content/leaf SHA-256 digests in the client and retain integrity gaps. | Both native profiles, browser download, independent replay and the existing submission gates. |

Automatic GitHub PR governance is restored, including label changes. Every job
still checks the same resolved candidate. GitLab retains its entire required
source, native, coverage and acceptance matrix. The earlier manual-only change
was premature because replacement enforcement had not been observed. No coverage
floor, actor requirement or submission dependency is removed by this repair.

## Objective-first entry

Onboarding now asks for one of six explicit intents, then a concrete objective,
then a workspace name. Business/organization and domain are optional context.
The domain field performs no search or lookup; the former illustrative results
are removed from this path. A saved domain remains selected, never verified.

The existing native setup transaction creates an active ERP objective, links it
to the workspace's intent, and retains the optional context and seven planned
service cards. No service becomes connected, no mission is approved and no
class enrollment is created by choosing an intent. All fields participate in
the existing canonical retry identity. Legacy name/domain requests keep their
original identity, and old workspaces need no invented goal or backfill.

The front page reads the goal through native workspace expansion and presents
a starting lesson, the exact ERP objective and the existing mission/classroom
or Field Manual route. Recommendations are fixed starting points by intent;
they do not infer competence or claim that a goal has been achieved. Missing
or foreign expanded objectives remain unavailable. Account changes clear the
form, and a confirmed setup whose workspace cannot yet load retries that read
without creating a second setup.

Migration `1791100000_objective_onboarding.js` adds optional fields without
changing access rules. Its down migration disables new objective setup by
removing a protocol marker; it retains saved goals, context, workspace links
and receipts. Reapplying it restores the command and its retry history.

Verify the connected behavior with
`node --test tests/upgrade/objective-onboarding.test.mjs tests/upgrade/sprint-integrity.test.mjs`.
Rendered onboarding/overview cases and the existing native workspace test cover
the form, expanded goal, retries, account transitions and migration restart.
Their required execution remains part of the existing Day-21 acceptance lane.

## Release and activation boundary

The current release code has two distinct gaps: `scripts/deploy/ship.py` stops
on a failed production probe without restoring the previous artifact, while
`tools/buildanddo_release.py` exposes rollback but records
`ROLLED_BACK_UNVERIFIED`. Neither proves restoration of a previously verified
SHA, manifest and artifact digest through external readback. This public source
continuation does not change private deployment control or activate providers.

The ordered receiving contract is
`.bits/handoffs/2026-09-22-bits-codegen-cmax-b-day21-activation.md`: hosted GitLab
acceptance, three registered runtime bindings, one real independently reviewed
journey, same-artifact release with verified rollback, and the final materials
derived from that replay. Source or fixture success cannot close these gates.

## Complete mission capture

`GET /api/buildanddo/workspaces/{workspace}/mission-replay/{mission}` uses the
existing PocketBase users authentication and current membership. It returns the
mission, workflow runs, business actions, evidence and ERP tasks from a single
read transaction. Business actions retain the existing command API's linked-record
read policy; the locked raw collection is not opened. Worker lease capabilities
are excluded. All other records must pass native view rules. Any unreadable
record rejects the capture instead of silently publishing a partial history.

Each record collection is limited to 200 rows. Captures above that bound, two
million serialized characters or 32 nesting levels are rejected. Capture is an
operator-invoked, read-only action. Larger histories require an operator export;
the web client does not raise the limit or omit rows to appear complete.

The content and each record use SHA-256 over sorted-key JSON, with stable array
order. Capture time is outside the content digest. A business result digest is
checked against its original reported payload. Missing task/evidence references,
changed reviews and altered result digests produce `HOLD` integrity. Current
membership and permissions are rechecked in the same transaction. The browser
also checks account/workspace/mission identity, inventory and digests before
offering the local download.

An observation export does not grant independent verification, release authority
or competition acceptance. It does not replace the Day-21 acceptance summary,
candidate index, exact deployment identity, browser journey or product proofs.

## Verification and receiving work

Source-connected behavior tests are in `tests/upgrade/sprint-journey.test.mjs`;
the existing upgrade suite continues to run every earlier regression. Rendered
cases cover onboarding, protected routes, workspace selection, workflow links,
capture recovery, connector expiry and evidence inspection. The native workspace
journey now validates the executed ERP chain and digests through the new route
with real authentication, including viewer access and foreign-account denial.

```bash
node --test tests/upgrade/sprint-journey.test.mjs
node --test tests/upgrade/*.test.mjs
python -m unittest tests.upgrade.test_gitlab_acceptance tests.upgrade.test_public_boundary -v
npm run test:coverage
npm run lint
npm run build
python tests/upgrade/test_workspace_native.py --require-binary
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
```

The repository's locked frontend dependencies and both declared PocketBase
runtimes remain required. The source fixture tests are not native acceptance.
The GitLab/private CI owner still owns candidate delivery, trusted review
metadata and status publication. The hosting owner owns the uninspected
Cloudflare diagnostic. Registered provider activation, inference binding, real
deployment/readback and browser/product receipts require their existing receiving
dispatches. Organizer requirements, owner sign-off, independent real outcome
grading and final submission remain separate obligations. None is marked done
by this source continuation.
