# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/broadcast-repairs-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     docs/classrooms.md, tests/upgrade/classroom-media.test.mjs, tests/upgrade/classroom-media-client.test.mjs, tests/upgrade/broadcast-lessons.test.mjs, tests/upgrade/test_native_fixture_contracts.py, apps/web/public/broadcast-repairs-source.txt
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/classrooms.md; VERIFIED_BY tests/upgrade/classroom-media.test.mjs; VERIFIED_BY tests/upgrade/classroom-media-client.test.mjs; VERIFIED_BY tests/upgrade/broadcast-lessons.test.mjs; VERIFIED_BY tests/upgrade/test_native_fixture_contracts.py; CONSUMES apps/web/public/broadcast-repairs-source.txt; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Record the classroom authorization and lifecycle repairs as reproducible source evidence while retaining unexecuted native, rendered and hosted acceptance.
# ----------------------------------------------------------------

# Broadcast repairs and learning evidence

## Section 1: Summary

Status: PARTIAL for operational acceptance. BR-1 through BR-3 source changes and
the expanded BR-4 test fixtures are implemented; actual native and rendered
execution is blocked. Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Authority: A2. CKS Gate/CKS/CAPS/CK: pending.

The owner requested fixes to the inspected PR 80 merge and lessons/evidence
inside the site. The base observation is ce1ce50fe408100bc617b33b5fed277efde64648;
earlier PR 81 evidence repairs remain intact. No provider activation, private
credential, external account change, deployment or shared-workspace write occurred.

## Section 2: Task results

BR-1: Source PASS. Every session binds an existing native account, workspace,
live classroom, fresh attendance revision and provider application. Push requires
current room-management authority plus the global publisher allowlist. Pull and
advertisement resolve exact server-recorded successful tracks in the same room.
Expired, foreign, closed, unbound and superseded sessions fail before a provider
effect. Permissions are rechecked after provider completion. Uncertain signalling
invalidates the binding rather than authorizing an automatic retry. Four usable
sessions per attendance are bounded to four hours; obsolete generations do not
trap a newly joined member behind unusable capacity.

BR-2: Source PASS; rendered acceptance blocked. A synchronous media lifetime owns
pending joins, actual tracks, timers, subscriptions and callbacks. Cancelling
camera/signalling work closes late resources without reviving state. The browser
requires the returned room to match, reads negotiated transceiver IDs after SDP
setup, and preserves subscription deduplication through token refresh. Agent
detail objects/arrays become bounded escaped text rather than React object
children or HTML. Actual rendering still requires the locked frontend runtime.

BR-3: Source PASS. The public Field Manual preview and installed curriculum gain
`broadcast-classroom-repair`, a practical lesson with negative controls, quiz,
source references and explicit evidence boundaries. `/app/evidence` has a separate
Source case studies section with a dated 121-test source observation, exact file
scope/fingerprint and a downloadable capture at `/broadcast-repairs-source.txt`.
These are public repository observations, not seeded workspace evidence, learner
progress, certificates, XP, attendance or independent verification. The original
25-lesson bundle and existing snapshots remain unchanged. Data migration replay
preserves operator edits; rollback keeps lesson and learner history.

BR-4: Source PASS; native execution blocked. The disposable fixtures load media,
presence, attendance, assistant usage and new lesson contracts. Twenty-three
native cases are defined: ten classroom, eight workspace and five learning.
Their provider transport/configuration doubles are explicit; actual native
auth/relations must still run against both binaries. Bootstrap filenames sort
before dependent migrations, and sanitized failure diagnostics survive cleanup.
Equivalent PocketBase index DDL no longer fails exact-string guards; altered
index structure/rules still fail. Request telemetry uses `routerUse`, not the
unavailable `onServe` registration, and the native fixture includes that hook.

## Section 3: Verification

The initial signalling regression run failed six of seven cases: foreign
attendance/session, ended-room and invented-track requests reached the provider
double. Both initial presence-denial cases also failed. Browser transport tests
then exposed missing room propagation, cancellation gaps and post-stop discovery.
Separate review reproduced unusable old-session capacity and null retained
advertisement failures, plus duplicate subscriptions during token refresh.
Those failures now pass their unchanged negative controls and positive controls.
Five canonical-index and fourteen middleware-registration red assertions preceded
their repairs. Rendered tests were authored but never claimed as executed reds.

Observed checks:

| Check | Result | Proof boundary |
|---|---|---|
| `node --test tests/upgrade/broadcast-lessons.test.mjs tests/upgrade/classroom-*.test.mjs` | 121/121, zero skipped, Node 22.17.0 | Explicit storage, provider and WebRTC doubles |
| `python -m unittest tests.upgrade.test_native_fixture_contracts` | 15/15 on Python 3.11 and 3.12 | Source fixture assembly/diagnostics, not a native server |
| Existing complete Node source command | 761/761, zero skipped | Node 22.17.0, existing installed ESLint prefix for the limited parser |
| Existing Python source command | 1,189 cases; 1,183 pass, six skipped, zero failures | HOLD; five pypdf cases and one Discord.py case lack dependencies |
| Ruff on the four changed Python test files | PASS | Source lint only |
| Existing frontend source diagnostic | 366 modules, zero static errors | Not configured repository lint or rendered acceptance |

V8 measured 100 percent lines/functions for the media policy, both new migrations
and the media-lifetime helper. Reported branches were 86.81, 82.76, 100 and 92.68
percent respectively. The connected browser-transport tests measured 84.36 percent
lines and 65.06 percent branches for its existing module. This does not measure
React rendering or native PocketBase execution.

The public capture preserves actual successful command output with a provenance
header. Its raw-output and capture digests are separate; the lesson's source
fingerprint covers its explicit file list, not all files or a deployed release.
The source test checks those hashes and counts without asserting reviewer identity.

Unavailable checks remain explicit:

- Rendered hook, broadcast, catalogue, Evidence Ledger and classroom suites cannot
  start: `vitest: not found`.
- `npm run build` cannot start: `concurrently: not found`.
- Repository lint cannot start: missing `eslint-plugin-import`.
- Each native entrypoint with `--require-binary` fails its prerequisite. Neither
  PocketBase 0.39.8 nor 0.28.4 is installed; zero native cases executed here.
- Actual Cloudflare API shapes, two-browser media, forced remote-stream revocation,
  hosted GitLab execution and staging/production readback remain unmeasured.

All eighteen acceptance profiles and prior coverage requirements remain enabled.
Pre-publication local receipts retain their dirty-source state; run the unchanged
full matrix against the committed candidate before receiving acceptance.

## Section 4: Memory

Preserve all 225 prior Type C events. Refresh Type A source metadata and Type B
declared edges; append only observed repair outcomes and receiving limitations.
Counts are in the payload summary. Verify:
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## Section 5: Filing

Implementation and migrations remain with their existing public owners at
07_BUILD; tests use 08_TEST. The public source capture is 05_EVIDENCE, product/API
guides are 06_PLAN, the spec is 04_HYPOTHESIZE and dispatch/report/memory are
11_COMMIT. New JSON carries a CGRF sidecar. REFLEX and CK are receiving/post-merge
work. The source evidence section remains distinct from the workspace ledger.

## Section 6: Governance and recovery

Entity: Citadel Nexus Inc. The existing license posture and native auth owners
are unchanged. No secret access, provider credential, private raw evidence,
payment action, hosted CI trigger, shared-database mutation or deployment was
performed. `actor:agent` still needs the publishing owner's actual label; this
session cannot apply it. No authenticated workspace is attached, so no external
seat event is fabricated.

Install the media-session and lesson migrations with their matching backend hooks
before the frontend. Old unbound sessions must rejoin; never invent ownership or
backfill successful publication from an advertisement. Media down removes its
protocol field, retaining history while disabling admission; re-up does not
reactivate old bindings. Lesson down is data-preserving. Native compatibility and
rollback require both declared runtimes before rollout. Do not restore the
unbound signalling handlers as a security rollback.

Local close stops browser resources and invalidates future signalling. It does
not prove provider-side termination of every previously negotiated remote stream.
That is an explicit live-revocation receiving test, not a source guarantee.

## Section 7: Next actions

1. Acceptance owner: provision the locked frontend toolchain, pypdf, Discord.py
   and both declared PocketBase binaries; run the full unchanged matrix and
   inspect actual migration/JSVM diagnostics, not only source doubles.
2. Backend release owner: install the matched migrations/hooks, use scoped native
   host/viewer accounts and measure denial/rejoin/rollback plus actual provider
   track responses and two-browser cleanup on staging before production.
3. Learning owner: verify the bundled preview, installed interactive lesson and
   source-evidence download without auto-enrolling anyone or adding verified
   workspace outcomes. An operator may later record actual release observations
   through the ordinary evidence flow with a separate independent review.

The receiving contract remains
`.bits/handoffs/2026-09-23-bits-codegen-c-one-broadcast-classroom.md`.
