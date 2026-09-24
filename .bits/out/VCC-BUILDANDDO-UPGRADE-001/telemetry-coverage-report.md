# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/telemetry-coverage-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     docs/telemetry-coverage.md, .bits/handoffs/2026-09-24-bits-codegen-telemetry-runtime.md, tests/upgrade/telemetry-runtime.test.mjs, tests/upgrade/mutation-lifetime.test.mjs, tests/deploy/test_release_telemetry.py
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/telemetry-coverage.md; CONSUMES .bits/handoffs/2026-09-24-bits-codegen-telemetry-runtime.md; VERIFIED_BY tests/upgrade/telemetry-runtime.test.mjs; VERIFIED_BY tests/upgrade/mutation-lifetime.test.mjs; VERIFIED_BY tests/deploy/test_release_telemetry.py; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain actual local telemetry repair results, review corrections and unexecuted operational acceptance without upgrading source tests to live coverage.
# ----------------------------------------------------------------

# Telemetry coverage repair report

## Section 1: Summary

Status: PARTIAL for acceptance; public source repairs implemented.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. SRS: SRS-BUILDANDDO-UPGRADE-001.
Seat: BITS-CODEGEN. Risk: A2. Actor: actor:agent.
CKS Gate/CKS/CAPS/CK: pending.

The owner requested improvements from a reviewed September 24 audit. The supplied
later PostHog visit supersedes the earlier silence conclusion. This session made
no new vendor observations. Before editing, the session branch fast-forwarded to
public main `21ffb6bd492b2b62bf13008e9b6bf57518915d53`, which contains the prior
claim/isolation repairs. The audited release is not asserted to be this checkout
or the current backend. No external activation or deployment was performed.

## Section 2: Task results

| Phase | Source result | Acceptance boundary |
|---|---|---|
| TC-1 | ID-only identities, private names/URLs, SPA product views, release/environment tags, automation filtering, no intake self-measurement and no idle hidden-tab flush loops | Real SDK, built-browser and vendor behavior still require a provisioned runner and authorized readback |
| TC-2 | Dual-sink section/read/state/crash signals; validated and lifetime-bound mutation outcomes; public funnel/section actions and media observations | SDK, transport, clock and hook doubles establish local behavior, not live full-section coverage |
| TC-3 | Bounded backend request/cause diagnostics, sanitized persistence-preserving forwarding, unavailable classroom health 503, personless Discord/probe telemetry, release guards on both controllers | No shipper, runtime switch, monitor, mail/provider configuration or edge deployment is activated |
| TC-4 | Connected regression suites, adversarial review controls, source contract and receiving checklist | Rendered/native/full-release acceptance remains incomplete; inherited unrelated failures remain visible |

The implementation reuses existing owners rather than adding a second telemetry
transport, authentication owner, progression score or truth store. Public SDK
inputs remain separate from private vendor read credentials. PostHog uses memory
persistence deliberately: anonymous/session continuity across reloads is lost to
avoid using an unvalidated prior account on the initial pageview.
The existing required GitLab source-assurance matrix now includes both Python
release-guard suites and the existing swap regression; no new optional-only gate
or source/runtime acceptance profile is substituted for required execution.

## Section 3: Verification

The source suites use real production functions with explicit SDK, HTTP, device,
clock, native-storage and filesystem doubles. Some JSX tests extract actual
handler/effect bodies; these are source tests, not rendered React acceptance.

Observed red/green controls include:

- Malformed 200 write receipts, dropped fields and semantic unavailable results
  no longer emit success. Pending keys, retry payloads and deferred confirmation
  survive both accepted and rejected obsolete responses.
- Sixty-five late-rejection lifetime controls initially had 49 failures, then
  all passed. Account/workspace/session/permission and visit changes are tested.
- PostHog's actual envelope shape revealed that a blanket token filter removed
  the public routing key. The SDK boundary now restores only the configured key;
  arbitrary/nested application tokens remain removed. Fresh-document memory
  identity and opt-out controls also pass locally.
- ControlState originally discarded read metadata and turned cancellation into
  an outage. The targeted case failed before forwarding reason/status and passed
  after; notice transitions deduplicate rerenders and reset after recovery.
- Backend tests cover explicit and thrown statuses, logger errors, middleware
  callback isolation, exactly one cause owner, unknown paths and bounded tags.
  Two additional controls reject invented HTTP 500 tags for generic JS errors;
  these failures keep an unknown status until an actual status is observed.
- The first release gate missed the configured canonical controller, inferred
  reassigned JS initializers incorrectly and removed the integrity baseline.
  Review controls reproduced these defects. Both controllers now require the
  same artifact contract; a bounded real-adapter/SDK-stub check replaces the
  speculative interpreter, and the prior integrity manifest is retained.
- A historical lesson test initially could not read its pinned Git objects.
  The exact objects were fetched/materialized and its original fingerprint then
  passed. No public capture, timestamp, digest or lesson evidence was rewritten.

| Check | Observed result |
|---|---|
| Full Node source runner on Node 22.17.0 | 1,359 cases: 1,358 passed, zero failures, one real-Vite prerequisite skip; HOLD |
| Full Python source runner on Python 3.12.13 | 1,289 cases: 1,274 passed, seven failures and eight dependency skips; FAIL |
| Combined release, ship, Discord telemetry, probe privacy and native-fixture source selection | 107 passed on both Python 3.11.15 and 3.12.13, zero failures/skips; includes required CI-wiring assertion |
| Scoped strict mypy for scripts/discordbot/service.py | PASS |
| Broader strict probe typing | Non-passing legacy untyped helpers; not represented as type-clean |
| Scoped Ruff check for changed Python modules/tests | PASS; the separately checked canonical controller retains its two baseline duplicate/unused tarfile diagnostics |
| Changed-web source diagnostic | 80 modules, zero new static errors; the six baseline HomePage diagnostics are retained |
| Full frontend source diagnostic | Six inherited duplicate workspace-key diagnostics in HomePage.test.jsx; no new diagnostic in the selected changed sources |
| Repository web lint/tests/build | Cannot execute usefully: eslint-plugin-import, Vitest and concurrently are absent |
| Disposable native classroom prerequisite | BLOCKED: declared PocketBase 0.39.8 absent; no native test ran |

The seven broad Python failures belong to unchanged readiness/submission tests
and unchanged profile/policy code in public main. The baseline contract has 12
milestones while the tests still expect 11; the baseline has 22 acceptance
profiles while one test expects 18. Other failures concern the existing
provisional submission fixture/admission contract. This telemetry continuation
does not change those counts or weaken their assertions. The six HomePage object
key diagnostics and duplicate tarfile import diagnostics in the release helper
were also confirmed against the baseline. Only the telemetry mock in the former
is updated. These inherited failures need a separate governance/test repair.

Working-tree receipts and logs are retained locally under
`/tmp/opencode/telemetry-coverage-checks`. They explicitly report an uncommitted
source tree and are diagnostics, not clean-candidate or deployment acceptance.
The complete current release acceptance matrix was not rerun. No native/API,
actual Discord serialization, real minifier, rendered or vendor result is inferred
from the passing doubles. Commands for reproduction are in
`docs/telemetry-coverage.md`; all required existing gates remain enabled.

## Section 4: Memory

Preserve the existing Type C history unchanged. Refresh file metadata and declared
edges, and append only observed source/review results and runtime limitations.
Exact counts live in the generated memory summary. Validate with
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## Section 5: Filing

Application helpers remain in their existing public 07_BUILD owners; regression
tests use 08_TEST. The source contract is 06_PLAN; dispatch, handoff, report and
memory are 11_COMMIT. New files carry CGRF metadata. CK/CAPS/CKS remain pending;
REFLEX remains a receiving/post-merge check, not a local stamp.

## Section 6: Governance and rollback

Entity: Citadel Nexus Inc. The pre-existing A2 upgrade dispatch covers source
repair. No production secret, raw private export, live seat event, provider
request, vendor event, event deletion, hosted pipeline or deployment was used.
The public boundary and reviewed source bindings are rechecked before handoff.
Exactly one `actor:agent` label remains required when publishing the review.

Use a coordinated source release. For unsafe collection, disable its authorized
transport while retaining the monitoring gap; do not restore raw IP/content
forwarding, permissive claims, stale artifact admission or a shared test target.
Native logs and existing vendor history are preserved. The old on-server journal
requires explicit operator retention review, not an unrequested deletion.

## Section 7: Next actions

The receiving owner must execute the real SDK/bundler/native/rendered checks,
ship sanitized stdout, configure exact service/environment/version tags, supply
missing mailer/provider configuration and verify vendor arrival. Monitors and
synthetics require their own authorized writes and readback controls. Never use
low ordinary traffic as a silence alarm: pair scheduled browser heartbeats with
matching expected vendor views. Review memory-only product identity before rollout.

The edge worker, live log retention/permissions, OCN health/signing and separate
OCN receipt-telemetry branch remain receiving work. Individual page actions beyond
the inspected paths and all 84 live coverage rows remain unaccepted until measured.
See `.bits/handoffs/2026-09-24-bits-codegen-telemetry-runtime.md`.
