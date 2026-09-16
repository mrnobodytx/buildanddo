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

## Entity dossier continuation authorized 2026-09-15

The owner's current request extends this registered SRS at A2 for private
identity-linked entity storage/recall and source-backed activation diagnostics.
The local branch was reconciled with the already-merged PR 27 source before work.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| BN | Register dossier scope and inspect activation | `python scripts/ci/agent_context.py --check` | done |
| BO | Persist encrypted private dossiers with native identity and atomic retries | `node --test tests/upgrade/dossier-system.test.mjs` | partial — 19 local tests pass; native encryption/auth/concurrency acceptance pending |
| BP | Connect private Discord entity commands and recovery | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_dossier.py'` | partial — 15 connected source cases pass; native SDK/server acceptance pending |
| BQ | Add account-linked dossier editing and recall | `node --test tests/upgrade/dossier-client.test.mjs`; rendered suites in docs/private-dossiers.md | partial — 9 client cases pass; 16 rendered cases authored, runner unavailable |
| BR | Add read-only startup diagnostics and actual activation handoff | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_doctor.py'` | done — 7 cases pass; actual launcher remains unverified |
| BS | Verify connected source and record native/frontend limits | Node/Python, coverage, static and frontend gates | done — available source checks pass; unavailable acceptance recorded |
| BT | Preserve memory and refresh report, context and boundary evidence | Context, boundary and memory checks | done — see current §15 report and verified memory payload |

Current continuation evidence (2026-09-16): 227 Node passes; 129 Python passes
and six native skips. The targeted Python source checker passes 111 cases with
two skips and at least 83.72% statement coverage per module. Selected JavaScript
coverage is 99.85% lines, 92.87% branches, 99.04% functions. Source diagnostics
parse 231 modules with zero errors. Application smoke remains 4/7; native and
frontend acceptance must run on a dependency-enabled runner. No activation,
credential provisioning, command synchronization or external message occurred.

Memory brief at the PR 27 baseline: the public bot has 13 public and seven optional research
commands. Native Discord OAuth links and authenticated research service bindings
exist, but no dossier/entity store exists. The local Compose stack runs web and
PocketBase only. The old bot referenced a VPS service; its service definition is
not present. No deployed service, authenticated seat or live bot is attached.
The first source inspection confirms Discord.py, pypdf and the native PocketBase
executable are absent. Do not infer activation from merges or fixture results.
No seat message is fabricated. The initial dossier scope is private to each
canonical user, with explicit entry and no passive Discord collection.

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


## Motion continuation authorized 2026-09-15

The owner requested all 50 animation areas and organized Settings usage. The
existing A2 source dispatch covers personal frontend preferences and motion.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| AT | Reconcile PR 24 and register motion scope | `python scripts/ci/agent_context.py --check` | done — PR 24 baseline reconciled and motion scope registered |
| AU | Add shared policy, tokens and accessible personal preferences | Motion policy and lifecycle Node tests | done — bounded policy, storage and lifecycle source contracts pass |
| AV | Connect common controls, navigation, themes and existing effects | Source check and component motion suites | partial — shared source connected; component/browser execution pending |
| AW | Apply editorial, learning, workflow and record transitions | Motion interaction suites and usage review | partial — public and workspace effects implemented; rendered acceptance pending |
| AX | Organize Settings, previews and all 50 usage areas | Settings interaction and catalogue tests | partial — grouped controls, seven previews and all 50 uses implemented; React tests unexecuted |
| AY | Verify and document source/runtime evidence | Node/Python, frontend, context, boundary and memory gates | done — available gates pass and frontend/runtime blockers are recorded |

Memory brief: merged PR 24 is present in the local remote-tracking ref. The
resumed checkout was fast-forwarded to it before motion edits. React motion,
CSS transitions, count-up effects and a Three.js platform visualization already
exist, with inconsistent local motion controls. React, Vite, Vitest, jsdom and
framer-motion are still absent from the installed environment; the incomplete
lockfile is a previously recorded dependency blocker. No live PocketBase seat
or deployed frontend is available. Personal preferences carry no workspace
authority. Source acceptance must remain distinct from unexecuted UI checks.

Motion phase evidence: AT, AU and AY available-source gates PASS. AV, AW and AX
source is implemented; their React/browser gates remain open. The full regression
run passes 163 Node tests (19 new motion cases) and 18 Python tests. Motion policy,
storage, catalogue and injectable browser lifecycle helpers measure 100% lines,
branches and functions. Source parsing passes 217 modules. Thirty Vitest files
are inventoried, including two new real component suites for motion settings,
previews, platform diagrams, interruption, keyboard recovery and visible activity.

Settings now has Appearance, Motion & interaction, Workspace and Account tabs.
Motion has six groups, 14 categories, seven opt-in preview collections and a
searchable reference for all 50 requested areas. Personal device choices sync
between tabs, migrate the older mission-effects choice and respect OS reduction.
Optional pointer/ambient/spatial effects default off. Actual record removal and
saved-state authority remain immediate; local examples cannot write records.

Vitest cannot start; lint lacks eslint-plugin-import and Vite is absent. The
existing lock still lacks eight resolutions and differs in two manifest groups.
No dependency install, substituted lock entry or weakened gate was used. Context
matches, boundary scanning passes 491 files and CGRF provenance passes 137/137 new
files cumulatively. Six earlier findings and four unwired gates remain visible.
Application smoke remains 4/7; cumulative completed acceptance gates are 24/51.

docs/motion-system.md contains every usage mapping and the runnable frontend and
browser matrix. Frontend execution, real device performance, screenshots, native
PocketBase and served-release verification remain unclaimed. Existing private
delivery handoffs still apply; this wave changes no backend, external integration,
workspace authority or deployment control.

## Discord bot continuation authorized 2026-09-15

The owner renewed the earlier Discord request. The existing public bot is in
scope under this same A2 source dispatch; hosting, credentials, integration
request consumption and live activation remain with the private receiving seat.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| AZ | Reconcile merged source and register the bot continuation | `python scripts/ci/agent_context.py --check` | done — PR 25 source reconciled; existing registered SRS extended before implementation |
| BA | Bound asynchronous public reads and source reporting | Discord public-client tests | done — real loopback HTTP, shared reads, cancellation, size limits and deadlines pass |
| BB | Add the command, lesson and quiz service | Discord command/content tests | done — all 25 authored lessons, public evidence states and scope failures pass |
| BC | Wire slash commands, private interactive replies and access limits | Discord adapter and lifecycle tests | partial — adapter contracts pass; native SDK and live Discord acceptance pending |
| BD | Generate shared public documentation/learning content | `node --test tests/upgrade/discord-catalogue.test.mjs` | done — five real generator tests pass; full Vite execution remains unavailable |
| BE | Verify and document bot behavior and activation limits | Python/Node regression, static and native SDK checks | done — available evidence recorded, runtime/package gates remain explicit |
| BF | Refresh dispatch, handoff, report and memory | Context, boundary and memory gates | done — current checks pass and all prior memory events are retained |

Memory brief: the resumed checkout was behind the locally available merge of
PR 25 and was fast-forwarded before implementation. scripts/discordbot/bot.py
is public application source and was unchanged by all earlier waves. Its three
commands use urllib synchronously in the Discord event loop and use older
buildanddo.com targets. The canonical public page catalogue names
https://buildanddo.tech. The existing community handoff covers private request
execution, not this command bot's source. No secondary source repository, live
PocketBase seat or bot session is attached. Discord.py and Python testing/HTTP
packages are absent; Python's unittest, Node, mypy and Ruff are available.
Do not fabricate seat events, runtime observations, source coverage or live
Discord evidence. Runtime dependency availability is an explicit acceptance gate.

Discord evidence: 52 bot tests pass; one native serialization case is explicitly
skipped because Discord.py is absent. The same suite uses the real SDK when it
is installed. Five generator tests execute the actual site projection; full
regression passes 168 Node tests and 70 Python tests, with the same one skip.
Python trace coverage exceeds 92% of statement lines in every bot module.
Core strict mypy and all bot/test Ruff checks pass. Full SDK typing cannot resolve
Discord.py; pytest/pytest-cov are absent. Vitest, eslint-plugin-import and Vite
are still unavailable. The source diagnostic parses 217 frontend modules.

Source review repaired delayed selection after reader expiry and identical
quiz-answer retry after a lost response. The HTTP client returns a bounded
timeout while keeping a stalled worker registered; retries cannot spawn an
unbounded set of replacement reads. Controls expire after ten minutes to permit
reading an actual starter lesson. No native Discord, live bot activation,
server command synchronization or integration-request execution is inferred.
docs/discord-bot.md and the extended community handoff define the receiving work.

BF source evidence PASS: context matches with six earlier findings and four
unwired gates retained; public boundary passes 503 tracked files with zero
failures. Provenance covers 149/149 files new since the original base. Memory
verification passes 236 Type A vectors, 453 Type B relationships and 41 Type C
events; all 36 earlier events are unchanged, IOO is complete and no vector is
orphaned. Source acceptance now completes 30/58 cumulative gates; the dispatch
remains in progress until its explicit native, frontend and live gates run.

The existing PR governance workflow now has an independent ci:test / Discord SDK
job that installs the declared bot runtime and requires native serialization and
source coverage. The contribution step and AGENTS table describe the same check.
This hosted job has not executed here; its missing-SDK failure is observed locally.

## Mission research continuation authorized 2026-09-15

The owner requested connected Discord/website mission and evidence submissions,
self-hosted Firecrawl search and document/audio/video parsing. The current A2
source dispatch includes their public application contracts, schema and tests.
No private deployment, credentials or live workspace/Discord operation is granted.

| Phase | Task | Gate command | Status |
|---|---|---|---|
| BG | Register research scope after PR 26 | `python scripts/ci/agent_context.py --check` | done — existing SRS/dispatch extended before source implementation |
| BH | Persist protected sources with current authority and evidence review | Research policy/migration Node suites | done — local policy, migration, protected-file and atomic evidence contracts pass; native PocketBase acceptance pending |
| BI | Connect Discord identity, missions, evidence and explicit submissions | Discord research Python suites | partial — thirteen connected research/Discord tests pass; native SDK and approved-server acceptance pending |
| BJ | Connect website upload, research review and Discord linking | Research client/component suites | partial — twelve client contracts pass and twelve component/hook cases are authored; Vitest/browser execution unavailable |
| BK | Add bounded self-hosted processing adapters and leased results | Research processor Python suites | partial — local extraction, HTTP/provider and lease contracts pass; native PDF and deployed providers remain unverified |
| BL | Verify source and runtime limits | Node/Python, SDK, frontend and native checks | done — source evidence, red/green fixes and all unavailable gates recorded |
| BM | Record source evidence and private activation requirements | Context, boundary and memory checks | done — current report/memory/handoff, context and boundary checks prepared and verified |

Memory brief: PR 26 is merged and contains the 13-command public bot. Missions,
Evidence Ledger, current-member authorization, revisioned audited commands and
non-secret integration requests already exist. No Discord account mapping,
protected research intake or parser contract exists in this repository. Reuse
PocketBase users auth and OAuth links rather than introducing another login.
Firecrawl has a registered binding control but no inspected deployment/version;
media/document parser details are requested. No live seat is supplied, so no
seat event is fabricated. Frontend, Discord.py and native PocketBase were absent
on this resumed runner; their tests must remain explicit acceptance gates.

Research continuation evidence (current source):
199 Node and 107 Python tests pass; two native dependency tests are skipped.
The targeted bot/research checker passes 89 cases with the same two explicit
skips and at least 83.72% statement coverage in each Python module. Its required
native variant fails because Discord.py and pypdf are unavailable. Thirty-one
connected Node contracts measure 99.87% lines, 85.18% branches and 94.44%
functions across the selected backend, migration and browser/OAuth clients.
Ruff, strict typing for six new Python source files and the 225-module source
diagnostic pass. Full SDK typing, pytest/branch coverage, Vitest/coverage, official
web lint, Vite, native PocketBase, rendered/mobile/OAuth and live provider checks
remain open. No acceptance gate or dependency was removed.

Red/green source checks corrected bounded queue scans starving later eligible
work and non-BMP Unicode excerpts exceeding child-message/backend bounds. Earlier
adapter test-loader exception identities were corrected without changing the
production exception policy. Native and live limits are explicit in
docs/mission-research.md and the existing community handoff.

Source work covers all seven continuation phases; four phase gates are complete
and three retain native/rendered acceptance. Cumulative completed gates are 34/65;
application smoke remains 4/7. The dispatch remains in progress. Current memory
and provenance counts are recorded in the cumulative report, with all 41 baseline
memory events preserved. No Discord message, shared mutation or live seat event
was sent by this source session.
