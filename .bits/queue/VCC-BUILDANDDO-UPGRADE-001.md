# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# DAG Node:    none
# Intent:      Track the authorized eight-area implementation and its verification gates.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-UPGRADE-001

**SRS:** SRS-BUILDANDDO-UPGRADE-001 **Risk:** A2 **Seat:** BITS-CODEGEN
**Status:** in_progress **Actor:** actor:agent

## Authorization and objective

Owner Dmitry Richard explicitly authorized task-table creation, SRS registration
and all eight upgrades in a single PR. The objective is the acceptance surface
in .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md and its four referenced telemetry specs.
Scope is local source implementation and review; shared/staging mutations are
excluded. Existing CGRF provenance is preserved. New files carry this dispatch.

## Task table

| Phase | Task | Gate command | Status |
|---|---|---|---|
| A | Register scope and dispatch | `python scripts/ci/agent_context.py --check` | done |
| B | Add five public pages and navigation | `npm --prefix apps/web test` | partial — source implemented; acceptance pending |
| C | Expand critical component coverage | `npm --prefix apps/web run test:coverage` | partial — source implemented; acceptance pending |
| D | Split routes and preserve recovery | `npm --prefix apps/web run build` | partial — source implemented; acceptance pending |
| E | Improve mobile layouts | Production-preview viewport and menu checks | partial — source implemented; acceptance pending |
| F | Complete public-plane telemetry scope | `node --test tests/upgrade/*.test.mjs` and `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | done — local adapters |
| G | Generate crawler assets and page metadata | `node --test tests/upgrade/build.test.mjs` | done — generator |
| H | Theme public, auth and workspace surfaces | Theme interaction suites and preview checks | partial — source implemented; acceptance pending |
| I | Verify keyboard access, labels and focus | `npm --prefix apps/web test` and preview checks | partial — source implemented; acceptance pending |
| J | Record memory, evidence and handoff | `python scripts/ci/agent_context.py --check` and `python scripts/ci/verify_public_boundary.py` | done |

## Smoke gates

```bash
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
node --test tests/upgrade/*.test.mjs
python -m unittest discover -s tests/upgrade -p 'test_*.py'
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

Emit PASS/FAIL after each phase. Diagnose failed gates before advancing; retain
root cause and retest evidence. No live PocketBase workspace or authenticated
seat is provided in this sandbox, so no seat event is fabricated or sent.

## Memory brief

The supplied source conversation and prior repository briefing were read. Prior
art includes the broadsheet UI, Vitest runner, page boundaries, browser telemetry
helpers and four proposed telemetry specifications. Private agent-system coupling
is a separate task and is excluded here.

## Acceptance state

Source implementation covers all eight areas. Node adapters pass 15 tests and
Python adapters/contrast pass 18. Vitest, production build, official lint and
browser acceptance are blocked by unavailable frontend dependencies and the
pre-existing incomplete lockfile. Registry audit and native PocketBase/Datadog
checks are not claimed. The dispatch remains in progress and the PR must remain
a draft until these acceptance gates run.

Evidence: .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md
Memory: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Private activation: .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md

Final local governance: context lock PASS (6 retained findings, 4 unwired gates);
public boundary PASS (397 files, zero failures). The provider actor label remains
a PR check. Dispatch smoke: 4/7; frontend environment failures are detailed in the report.

## Continuation authorized 2026-09-15

The owner's request to reuse backend functions from the logged-in sections
extends this in-progress dispatch under SRS-BUILDANDDO-UPGRADE-001 at A1.
PR 19 merged the initial implementation; its previously blocked frontend
checks are not inferred to have passed. The continuation adds these tasks:

| Phase | Task | Gate command | Status |
|---|---|---|---|
| K | Inventory and register backend reuse | `python scripts/ci/agent_context.py --check` | done |
| L | Connect home previews and challenge history to existing workspace hooks | Targeted home/selection suites | partial — source complete, selector tests pass; component execution unavailable |
| M | Share authenticated Field Manual and progress with Docs | Targeted tutorial/account-isolation suites | partial — source and regression suites complete; component execution unavailable |
| N | Verify and record continuation evidence | Web checks, Node tests, context, boundary and memory checks | done — blocked checks recorded |

Existing collections and access rules are the authorization boundary. No new
backend deployment or live workspace mutation is performed. The sandbox still
has no authenticated workspace for publishing a seat event; record local
evidence without fabricating a public event.

Continuation gate results: K PASS; L selector gate PASS (7/7), component gate
FAIL to start (Vitest absent); M source gate PASS, component gate FAIL to start;
N PASS for local evidence, with 4/7 dispatch smoke checks passing. Full Node
regression: 22/22. Python: 18/18. Offline source parser: 174 modules, no static
errors. Browser and native/live backend acceptance remain unverified. See the
updated cumulative report and memory payload for runnable commands and limits.

## Mission education continuation authorized 2026-09-15

The owner requested the mission system, its how/why instruction, NIST TEVV,
OWASP, clarification of "wor3 voc", and educational animation/rewards. This
continues the same in-progress A1 dispatch and registered umbrella. Prior
merged source remains the baseline; no shared backend is mutated in this run.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| O | Register the mission scope and inspect existing mission/evidence rules | `python scripts/ci/agent_context.py --check` | done |
| P | Persist plans and enforce lifecycle/evidence constraints | Node mission policy, migration and request-hook tests | partial — 20/20 local contract tests pass; native runtime acceptance pending |
| Q | Add guided planning, review and how/why learning | Targeted mission component suites | partial — source and suites complete; Vitest unavailable |
| R | Add educational rewards and accessible animation | Reward tests and reduced-motion UI checks | partial — reward selectors pass; component/browser checks unavailable |
| S | Record source, validation and memory evidence | Context, boundary, memory and web gates | done — unavailable acceptance checks recorded |

Memory brief: Missions already have CRUD and six status values but status
advancement is not evidence-gated. The Evidence Ledger has mission and workspace
relations. Reuse these instead of inventing another task store. Prior frontend
checks could not run because required packages were absent. NIST TEVV is a
method for gathering evidence, not a certificate produced by filling a form.

Mission gate results: O PASS; P local contract gate PASS (20/20), native acceptance
pending; Q component gate FAIL to start; R selector gate PASS, UI gate unexecuted;
S evidence gate PASS with smoke 4/7. Full Node regression: 42/42. Python: 18/18.
Source parsing: 180 modules, no static errors. Targeted Vitest and coverage are
unavailable, official lint lacks eslint-plugin-import, and Vite cannot start.
"wor3 voc" is provisionally treated as W3C Verifiable Credentials pending a reply;
the local learning download is explicitly unsigned. No live seat event, shared
mutation, deployment or credential signing was performed.

## Rig 1 continuation — handoff only, 2026-09-15

The owner specified a single private runtime on Rig 1 with Cloudflare event
ingress, registered GitLab clones and a persistent repository loop. The existing
A1 dispatch covers the public handoff of this mission-execution request. It does
not grant private runtime implementation, installation or shared-plane authority.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| T | Record Rig 1 scope and public/private boundary before writing the handoff | `python scripts/ci/agent_context.py --check` | done |
| U | File the private-seat handoff and its evidence | Context, boundary including the untracked handoff, memory and diff checks in the report | done — 4/4 handoff gates pass |

Memory brief: the mission UI records work and review; it does not start an agent.
The owner described assessment, bridge, driver, trigger and MCP facilities in
`data_dog_private`. None of those source contracts was inspected here. The
managed repository service rejected the private attachment because public and
private repositories cannot share this session. No private execution percentage
is claimed. The receiving seat must verify the bridge schema and strategy
mismatch first, then reuse the actual runtime facilities.

Handoff: .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md.
Private execution is blocked on a session for `data_dog_private` and its own
execution dispatch. The existing public mission implementation remains available
with its previously recorded frontend and native-runtime acceptance gaps.

Handoff gate results: T PASS; U PASS. Context, tracked/new-file boundary, memory
and diff checks pass (4/4). Runtime tests and installation remain unexecuted;
the application smoke remains the historical 4/7, not newly verified here.

## Workflow backend continuation authorized 2026-09-15

The owner requested the next BuildAndDo backend wave and set Rig 1 aside. The
existing A1 source dispatch now covers persistent workflow runs, approval
checkpoints and atomic mission-linked evidence as specified in the umbrella.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| V | Register the workflow backend scope and inspect current persistence | `python scripts/ci/agent_context.py --check` | done |
| W | Add bounded run storage, authenticated commands and atomic receipts | `node --test tests/upgrade/workflow-runs.test.mjs` | partial — 15/15 contract tests pass; native acceptance pending |
| X | Connect run history, approvals and outcome recording to the workspace | Workflow interaction suite and client contract tests | partial — 7/7 client tests pass; interaction suites cannot start |
| Y | Verify the backend wave and record evidence | Node/Python/web checks; context, boundary and memory verification | done — context, boundary and memory pass; unavailable acceptance recorded |

Memory brief: workflows have editable JSON steps and activation state, but no
run collection. Activation currently assigns last_run without recording an
outcome. Operations' run logs and the mission evidence flow establish the local
recording pattern. The next wave adds transactional run/evidence persistence;
external execution remains outside this source dispatch. Existing frontend
dependencies and native PocketBase were unavailable in earlier iterations.
No authenticated live workspace is supplied, so no seat event is fabricated.

Workflow phase gates: V PASS. W local contract gate PASS, native gate unexecuted
because the pinned PocketBase binary is unavailable. X client gate PASS; component
gate FAIL to start because Vitest is absent. The full Node suite passes 66/66 and
Python passes 18/18. Frontend coverage is also unavailable, official lint lacks
eslint-plugin-import and Vite cannot start. These are environment failures, not
successful acceptance. The source checker parses 185 modules without core errors.

An initial retry regression failed when stored JSON object keys were reordered.
Comparing command fields and scalar values independently of serialization order
fixed it. Replays, stale tabs, approval-role checks, mission approval changes and
run/evidence rollback are exercised against actual production source with doubles.
docs/workflow-system.md records the API, operator workflow, retention, native
concurrency and browser acceptance requirements. No external tool execution or
mission verification is inferred from a completed recorded workflow run.

Y evidence gate PASS (4/7 smoke). The boundary scanner checks all 428 tracked
files with no failures. The initial post-staging context mismatch was fixed by
regenerating the lock after the new files entered its tracked inventory. Memory
verification confirms 138 file vectors, 227 declared edges and 20 real events.
Native and frontend acceptance remain pending; no delivery status is claimed.

## Delivery continuation — private-agent handoff, 2026-09-15

The owner requested merging the session changes without relying on GitHub
Actions and using the private Datadog agent. This A1 continuation records the
source/merge investigation and prepares a public delivery handoff. Remote merge,
private-agent activation and deployment cannot be performed from this session.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| Z | Register delivery scope and establish current main/check state | `python scripts/ci/agent_context.py --check`; provider reads and ancestry commands in the handoff | done — provider main and session ancestry checked |
| AA | Prepare the private delivery handoff and evidence | Context, public-boundary and memory verification | done — public artifact prepared; private activation unavailable |

Memory brief: PRs 19, 20 and 21 merged the earlier upgrades. Workflow source
was added after PR 21. Candidate jobs have failed, including a billing lock,
and Cloudflare independently reports a failed build. A previous managed clone
request rejected combining public BuildAndDo and private data_dog_private in
one session. No private source, runner, credentials or deployment capability has
been verified. The earlier Rig 1 runtime handoff remains deferred.

Delivery gate Z PASS: provider main matches the local origin/main revision;
PRs 19–21 contain the first four session revisions, while workflow source is
still outside main. The candidate job is billing-blocked and the independent
Cloudflare build failed. AA records the runnable acceptance and release checks
in .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md. This
artifact does not activate a seat, merge source or deploy an application.

## ERP/content/tutorial continuation authorized 2026-09-15

The owner requested enhanced ERP and content production and 25 authored lessons
for testing. This is an A2 schema-source continuation; shared activation stays
with the private delivery handoff. Scope and acceptance are registered above
implementation in SRS-BUILDANDDO-UPGRADE-001.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| AB | Register the business and education scope; inspect current schemas | `python scripts/ci/agent_context.py --check` | done |
| AC | Add bounded fields, curriculum seed and server policies | Node migration and policy contract tests | partial — local contracts pass; native migration/hook acceptance pending |
| AD | Provide editable, linked ERP planning | ERP selector and component suites | partial — selectors pass; component execution unavailable |
| AE | Provide content drafting, preview and explicit review | Content policy and component suites | partial — policy contracts pass; component execution unavailable |
| AF | Author and display 25 complete tutorials with progress | Curriculum and reader/progress suites | partial — all 25 bodies and merge/progress contracts pass; reader execution unavailable |
| AG | Verify source and refresh delivery/report/memory evidence | Application, context, boundary and memory gates | done — available gates pass; frontend/native/delivery acceptance remains pending |

Memory brief: six tutorial seed records contain summaries only; the current
Start control writes progress without opening a lesson. ERP creates objectives,
tasks and contacts but offers no editing or task linking in its forms. The
social_content form accepts status directly, including published. Existing
workspace hooks, PocketBase role rules and workflow policy helpers are reusable.
Frontend packages and the native PocketBase binary are still absent locally.

Business phase gates: AB PASS; AC, AD, AE and AF local contract gates PASS.
The full Node regression passes 86/86, including 20 business/learning cases;
Python passes 18/18. Selected policy, hook, migration and selector coverage is
100% lines, 96.41% branches and 100% functions. The limited source checker
parses 191 frontend modules with zero core errors; 24 Vitest files are tracked.
Component and coverage gates FAIL to start because Vitest is absent; official
lint lacks eslint-plugin-import, and build cannot spawn Vite. These failures
remain acceptance blockers, along with native PocketBase 0.28.4 and browser
checks. No shared migration, external publication or private-agent execution ran.

docs/business-learning.md explains the ERP and editorial flows, five-path
curriculum, migration asset, retention and acceptance procedure. An old backend
that drops newly submitted fields now produces an incomplete-save error while
retaining input and the returned record ID. Reviewed copy and publication
receipts are server-attributed; opening a completed lesson preserves completion.
The delivery handoff requires the complete published source head, including
this business/learning wave, rather than the earlier workflow-only revision.

AG evidence gate PASS with 4/7 application smoke: context and boundary checks
pass for all 442 tracked files, and CGRF provenance is present on 88/88 files
new since the original base. Memory records 152 file vectors, 263 declared
edges and 24 observed events with no orphan vectors. Six existing findings
and four unwired gates remain visible; no complete TEVV or deployment is claimed.

## Workspace integration repair authorized 2026-09-15

The owner's report of disconnected or malfunctioning systems extends this A2
source dispatch. The current review baseline includes merged PR 22. Repair
measured record-path defects before adding further product subsystems.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| AH | Reconcile the merged source and register integration defects | `python scripts/ci/agent_context.py --check` | done |
| AI | Repair workspace discovery and shared evidence access | `node --test tests/upgrade/workspace-integration.test.mjs` | partial — 9/9 source contracts pass; native rules/hooks pending |
| AJ | Connect previous work to evidence/runs, restore rendering and isolate reads | History/JSX regressions and targeted component suites | partial — source contracts pass; component execution unavailable |
| AK | Verify connected behavior and refresh evidence | Node/Python, web, context, boundary and memory checks | done — available gates pass; native/frontend acceptance remains pending |

Memory brief: PR 22 is merged, but its governance and Cloudflare checks failed.
The resumed checkout was behind it and has been fast-forwarded to the merged
source. The 86 existing Node and 18 Python regressions pass on this baseline.
Workspace RBAC omitted the workspaces and evidence collections. Previous work
batch reads query only seat_events, so persisted mission evidence and workflow
runs do not appear. Independent shared reads use the SDK's default cancellation
key, and history has no guard against a response from an earlier scope. Existing
frontend dependencies and the native PocketBase binary remain unavailable.
No authenticated workspace is supplied; no live seat event is fabricated.

Repair results: all 110 Node and 18 Python regressions pass, including the
browser-command to server-transaction to history-reader connection with lost
responses and idempotent retries. The first eight history regressions failed
before the fix. The source checker also found the missing Plus import in the
shared layout; its JSX-binding checks now pass on all 192 frontend modules.
Selected evidence/history source coverage is 100% lines/functions and 96.83%
branches. Vitest and frontend coverage cannot start, lint lacks its import
plugin, and Vite is unavailable. The lock audit still finds eight missing
resolutions and two manifest differences. Native PocketBase and browser checks
remain pending. docs/workspace-integration.md defines the remaining acceptance.

AK evidence gate PASS with 4/7 application smoke. The context lock and public
boundary pass for 450 tracked files; all 96 files new since the original base
carry CGRF provenance. Memory verification passes for 163 file vectors, 292
declared edges and 28 observed events with complete IOO and no orphan vectors.
The cumulative report records 18/37 acceptance gates complete. Six existing
findings and four unwired gates remain visible. No live deployment, native
acceptance or private-agent execution is inferred from these source results.

## Administration and community continuation authorized 2026-09-15

The owner requested RBAC, row isolation, admin settings and control of sinks,
extensions, wiki, forums, Discord bot and Reddit. The existing A2 dispatch covers
their public source and application records; private execution remains a handoff.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| AL | Reconcile PR 23 and register administration scope | `python scripts/ci/agent_context.py --check` | done — PR 23 baseline reconciled and scope registered |
| AM | Enforce current membership and immutable record scope | Admin security and migration regressions | partial — current-role and migration source contracts pass; native rules pending |
| AN | Persist audited role, profile and integration commands | Admin command, retry and rollback regressions | partial — command, retry and rollback source contracts pass; native concurrency pending |
| AO | Persist wiki publication and moderated forums | Community policy and isolation regressions | partial — wiki/forum source policies pass; native acceptance pending |
| AP | Connect Settings, navigation and integration controls | Admin and integration component suites | partial — source and connected UI suites authored; frontend execution unavailable |
| AQ | Add wiki/forum readers, editors and moderation | Community interaction suites | partial — source and connected UI suites authored; frontend execution unavailable |
| AR | Verify the complete source wave | Node/Python, coverage, web and governance gates | done — available checks pass; frontend/native blockers recorded |
| AS | Record evidence and private executor contract | Context, boundary, provenance and memory verification | done — public handoff and evidence prepared; private activation pending |

Memory brief: PR 23 is merged and its source is locally available. The resumed
checkout was fast-forwarded to that source before edits. Existing membership
rules have no management UI, preserve a record-owner access shortcut and use
cross-collection role filters. Service/channel cards accept operator-entered
states. No wiki/forum store or private runtime transport exists in this public
repository. Frontend packages and the native PocketBase binary are still absent.
No authenticated live workspace is supplied; no seat event is fabricated.

Administration phase evidence: AL PASS. AM, AN and AO source gates PASS; native
rules, JSVM and concurrent transactions remain unverified. AP and AQ source and
interaction suites are authored; their frontend gates FAIL to start. AR and AS
available-evidence gates PASS. The full Node suite passes 144/144 and Python
passes 18/18. Selected administration/migration/browser-adapter coverage is
100% lines, 95.41% branches and 97.37% functions. The offline source checker
parses 204 frontend modules without core or JSX binding errors.

Vitest/coverage are unavailable; official lint cannot load eslint-plugin-import;
Vite cannot start. The lock audit still has eight missing resolutions and two
manifest differences. The native PocketBase binary is absent. These are open
acceptance gates, not successful skips. The context inventories 28 frontend
suites, six prior findings and four unwired gates. Boundary scanning passes all
475 tracked files and provenance passes 121/121 files new since the original base.
The cumulative acceptance count is 21/45, with application smoke still 4/7.

docs/workspace-administration.md records the role matrix, command/retry contract,
wiki/forum flows, integration request/observation distinction and native/browser
acceptance. The community-controls handoff specifies private execution and
minimal dated receipts. No live seat event, Discord/Reddit post, sink activation,
credential provisioning, shared migration or deployment occurred here.
