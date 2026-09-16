# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs_registry.yml
# DAG Node:    none
# Intent:      Define acceptance evidence for the eight owner-authorized BuildAndDo upgrades.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-UPGRADE-001 — BuildAndDo site upgrades

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN
**Dispatch:** VCC-BUILDANDDO-UPGRADE-001 **Actor:** actor:agent

## Authorized continuation — private entity dossiers and activation evidence

The owner requested the remaining Discord gaps, correction of the assumed local
activation procedure, and secure entity storage/recall tied to user identity and
the user's dossier. This extends the existing in-progress A2 source dispatch
after PR 27. SRS self-bootstrap remains authorized. Runtime keys, shared services,
Discord registration/messages and private deployment remain receiving-seat work.

Acceptance:

1. Reuse canonical PocketBase `users` and native Discord OAuth links. Provide one
   private personal dossier per account, reachable from Settings and navigation.
   A workspace administrator receives no access to another user's dossier. The
   dossier remains personal across workspaces; Discord additionally requires the
   current registered bot, enabled server/channel binding and workspace membership.
2. Track explicitly saved entities (person, organization, project, place, topic)
   with names, aliases, tags, dated notes and explicit source references. Reuse
   entity IDs for additional notes; never silently merge people with equal names
   or collect channel conversation. Provide bounded search, detail, corrections,
   note removal, entity deletion and a history of content-free mutation receipts.
3. Encrypt dossier/entity content and retry fingerprints with PocketBase's native
   authenticated encryption and operator-provided key bindings. Bind ciphertext
   to account, dossier, record and revision. Lock raw collection APIs. Missing or
   unreadable keys fail closed; no plaintext fallback or generated secret. This
   is server-side encryption, not end-to-end encryption or a backup-erasure claim.
4. Authorize within atomic transactions; fence stale revisions and replay retries
   without duplication or resurrection after deletion. Do not retain old note
   text in audit records. Store no private dossier data in browser persistence,
   telemetry, public catalogues or bot caches beyond bounded undelivered intent.
   Discard late results after account/link changes; search terms stay out of URLs.
5. Connect website dossier editing and private Discord dossier/remember/recall/
   entity/forget commands to the same records. Keep Discord responses ephemeral,
   bounded and mention-suppressed. Preserve current research and teaching flows.
6. Add a read-only local startup diagnostic. Report actual package/configuration
   readiness without printing bindings, contacting services, logging in, syncing
   commands or implying the bot is running. Document that the inspected Compose
   stack starts web/PocketBase only and the deployed service configuration is
   outside this checkout. Extend the existing activation handoff with exact gaps.
7. Verify actual backend, migration, browser-client and Discord application modules
   for tenant isolation, identity changes, encrypted persistence, recovery,
   corrections, deletion, corruption and absent configuration. Add meaningful
   rendered and native acceptance checks; report unavailable runners separately.
   Preserve earlier governance events and record runnable evidence for this wave.

Private personal storage is the conservative initial scope while the owner can
clarify workspace sharing. Private key custody, transport termination, backup
retention/erasure and actual service launch ownership require runtime evidence.

Source outcome recorded 2026-09-16: the personal store, five Discord commands,
website dossier and read-only startup doctor are implemented. Connected tests
cover isolation, relinking, corrections, deletion and lost-response recovery.
The shared OAuth lookup now uses PocketBase's native ExternalAuth model and
transactional dossier requests preserve non-enumerable event properties.
An independent native CI matrix requires both declared PocketBase versions;
the local native SDK/parser/backend and rendered acceptance remain unavailable.
Verification and the retained event history are in the current dispatch report.

## Authority

Dmitry Richard (mr.nobody@citadel-nexus.com) explicitly authorized this dispatch,
its task table, SRS registration and implementation of all eight areas in one PR
in the session prompt on 2026-09-14. This umbrella records that single-PR scope.
It incorporates the existing SUPPLY-001, RUM-ACTIONS-001, RELEASE-TAG-001 and
public-plane PB-METRICS-001 specifications. It grants no deployment authority.

## Problem and intent

Visitors lack product, team, documentation and contact pages. Eager route imports
load workspace and visualization code for public visits. Sparse interaction
coverage, fixed layouts and incomplete theme/keyboard behavior obscure failures.
Dependency, release and mutation telemetry must describe observed outcomes.

## Scope and acceptance evidence

1. Add Pricing, About/Team, Docs, Blog and Contact at stable public routes,
   using existing broadsheet typography and primitives. Navigation links resolve;
   pricing, team and blog copy make no invented customer, price or release claims.
2. Expand Testing Library suites for public navigation, authentication and critical
   workspace flows, including mutation failure, recovery and loading states.
3. Lazy-load every route page with accessible Suspense feedback. Keep navigation
   mounted during workspace route loading and retain page error isolation.
4. Make public and workspace shells, forms, tables and dialogs usable at narrow
   widths. Verify mobile menu close/focus behavior and absence of page overflow.
5. Implement the four existing telemetry specs: report-only dependency audit with
   license and lock validation, real-result mutation actions and timing, one build
   release stamp, and opt-in PocketBase structured-log CRUD/request telemetry.
   No external telemetry service may be required for local product operation.
6. Generate sitemap/robots from one public route catalogue. Add canonical social
   metadata and valid JSON-LD; exclude auth and workspace routes from indexing.
7. Support persisted light/dark/system theme, public Header toggle and workspace
   Settings control. Theme auth flows and shared workspace components as well.
8. Provide skip navigation, visible keyboard focus, named controls, modal focus
   trapping/return, and navigation semantics covered by interaction tests.

## Invariants and boundaries

- Reuse React/Vite, PocketBase auth and installed dependencies.
- Never emit record contents, auth material or user identifiers in telemetry.
- Telemetry failures must preserve the operation's original result or exception.
- Supply audit unavailability is unknown, never a zero-vulnerability result.
- PocketBase instrumentation adds no schema and makes no network call. Host log
  ingestion and live Datadog verification require a private-plane handoff.
- The dispatch stays in progress until evidence and review; delivery means merged
  and verified, not merely edited. CK, CAPS and CKS remain pending.

## Verification

```bash
npm --prefix apps/web test
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
node --test tests/upgrade/*.test.mjs
python -m unittest discover -s tests/upgrade -p 'test_*.py'
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

Inspect the production preview at mobile and desktop widths in both themes,
exercise public navigation and keyboard menus, and record the actual evidence.
Tests using SDK/JSVM doubles prove the adapter contract, not live ingestion.

## Authorized continuation — reuse existing backend flows

On 2026-09-15 the owner requested that existing frontend-only functions reuse
the backend integrations in the signed-in sections. This continues dispatch
VCC-BUILDANDDO-UPGRADE-001 at A1 under the same SRS; the first implementation
was merged as PR 19. It authorizes local source changes, not shared mutations.

- Replace the home page's permanent empty metrics, evidence, corrections and
  Daily Edition with records from the active workspace through the existing
  data hooks. Preserve separate loading, empty, unavailable and demo states.
- Reuse the existing challenge collection and mutation hook for intake and
  history. Show the saved backend status; a submission does not start a runner.
- Share the signed-in tutorial catalogue and progress flow with the home Field
  Manual and Docs. Catalogue access remains authenticated and demo cannot write.
- Clear records, drafts and pending results when the account or workspace
  changes. Anonymous visits must make no private collection request and must
  never render records left by an earlier signed-in session.
- Preserve source, timestamp and status on previews. Revenue remains separated
  by provider, currency and date range; pending connections are not payments.
- No new collection, access-rule relaxation, credential, payment integration,
  contact-delivery service or private-stack runner is included. Early access
  already persists to PocketBase; commercial email remains an explicit draft.

Verify the continuation with targeted Testing Library suites for the home page,
tutorials and account transitions, Node tests for record selection, the web
build/lint/coverage gates, the context check and the public-boundary scanner.
Record unavailable tools as blocked validation, never as passing evidence.

The offline diagnostic `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`
checks JavaScript/JSX syntax and core binding errors using local ESLint. It makes
no installation or network request and does not replace repository lint, Vitest,
coverage, or browser acceptance.

## Authorized continuation — mission building and education

On 2026-09-15 the owner requested a working mission system with how-to and why
guidance, NIST TEVV, OWASP, a third framework written as "wor3 voc", animations
and bonuses that aid education. This extends the existing A1 dispatch. The
third framework is being clarified; no internal acronym or certification is
invented. The prior backend-reuse revision is retained as the implementation
baseline. This remains one registered SRS and grants no deployment authority.

- Extend the existing missions collection with optional, bounded JSON plan,
  learning-answer and TEVV-review fields plus server-attributed approval/review
  receipts using an idempotent migration with a down migration. Existing records remain readable; new work starts proposed.
- Build a guided mission planner with purpose, beneficiary, scope, measurable
  success criteria, risk, rollback, four TEVV methods and practical OWASP checks.
  Save drafts and recover from backend failures without discarding entered work.
- Require a complete plan for approval. Use explicit lifecycle transitions;
  failed or verified work is terminal. Verification requires four passing TEVV
  observations and evidence from the same mission/workspace. Failed outcomes
  require a reflection and may retain checks that could not run. Enforce these checks
  on PocketBase requests as well as in the UI; retain existing access rules.
- Teach testing, evaluation, verification and validation as distinct activities.
  Cite NIST AI RMF and OWASP ASVS, distinguishing learning guidance and recorded
  reviewer assertions from external assessment, certification or test execution.
- Award bounded educational points for saved knowledge checks and useful plan
  milestones. Repeated clicks do not mint additional credit. Bonuses unlock
  examples and review prompts; they never grant authority or a verified status.
- Add restrained progress/reward animation, reduced-motion support, an effects
  toggle, keyboard access and visible textual feedback in both themes.
- Keep data scoped to the active account/workspace and demo mode read-only.
  Reuse mission/evidence hooks and browser outcome telemetry. No automation
  runner, signing service, money, secret or live workspace mutation is added.

Verify with Node policy/migration/request-hook suites and measured coverage;
Testing Library planner, review and reward suites; repository lint/build;
context, boundary and memory checks. Test denied writes and foreign evidence,
not just the successful path. Frontend dependency blockers remain explicit.

Framework interpretation: the owner was asked to clarify "wor3 voc". With no reply,
the education content provisionally uses W3C Verifiable Credentials Data Model
2.0 and clearly separates unsigned local learning records from signed credentials.
The mission system does not issue a VC or claim NIST/OWASP certification.

Mission implementation evidence: `docs/mission-system.md` explains the workflow,
trust boundaries, educational reward model and native/browser acceptance steps.
`tests/upgrade/mission-system.test.mjs` runs actual policy, request-hook, migration
and reward-selector source under Node. Frontend/native acceptance remains pending
as documented in the cumulative dispatch report.

## Rig 1 continuation — public handoff boundary

On 2026-09-15 the owner specified one governed `data_dog_private` runtime on
Rig 1, registered GitLab clones, Cloudflare Worker/Queue ingress, a persistent
repository supervisor, GitLab triggers and bounded MCP adapters. The owner
prioritized a dedicated bridge-gap strategy for `citadel.bridge.progression/v2`.
This continuation records that request under the existing umbrella and dispatch;
only its public handoff and evidence are in this repository's scope.

The public/private invariant in AGENTS.md and .bits/context.md still applies.
Runtime, credentials, project registrations, edge deployment and GitLab write
authority belong to the private plane. The managed repository service rejected
attaching the private runtime to this public session. No private source contract
or percentage of implementation readiness has been independently verified.

Public acceptance consists of:

1. A CMAX-B handoff that distinguishes observed repository/access facts from the
   owner's description of the private runtime, with the bridge-gap fix first.
2. Explicit receiving-seat criteria for schema-aware target selection, minimal
   GitLab ingress, durable queue receipts, exact-SHA isolation, stage recovery,
   bounded MCP calls, TEVV and controlled MR creation. These are requested
   behaviors, not implemented or tested runtime claims.
3. Updated dispatch/report/memory and passing context, boundary and memory
   checks. No new runtime, edge control, clone registry or deployment file is
   added to the public site. Prior frontend/native acceptance remains pending.

The receiving private seat must inspect its own governance and source, register
the execution scope and obtain the private dispatch before implementing it.
The public handoff does not authorize an installation or shared mutation.

## Authorized continuation — workflow runs and evidence

On 2026-09-15 the owner set Rig 1 aside and requested the next wave of
BuildAndDo backend systems. This continues VCC-BUILDANDDO-UPGRADE-001 at A1:
local PocketBase migrations/hooks and their web interfaces, with no shared
mutation or deployment. The connected next flow is workflow run persistence,
approval checkpoints and mission-linked evidence. Existing workflow activation
writes a last-run date without a run; that date is not execution evidence.

Acceptance for this wave:

1. Persist each run with an immutable copy of its saved workflow steps and,
   optionally, the running mission's approval receipt. Existing workflow edits
   cannot rewrite earlier runs. Only active workflows with valid bounded steps
   can start a run; activation alone does not set last_run.
2. Enforce ordered outcomes and owner/admin approval checkpoints in PocketBase.
   Workspace editors may start runs and record ordinary outcomes; viewers only
   read. Reject foreign workspaces, changed ownership, unapproved/paused missions,
   malformed steps, skipped steps and changes to terminal runs.
3. Create an Evidence Ledger receipt and append the run decision in one database
   transaction. Attribute account and time on the server. Retain observations
   in the run snapshot even if a separate evidence record later changes. Run
   completion never verifies a mission or asserts that an external tool ran.
4. Require a bounded request key and expected run revision. Identical retries
   return the saved result without duplicating runs/evidence; conflicting key
   reuse and stale revisions fail explicitly. Native collection writes to run
   state are locked; authenticated commands enforce the complete policy.
5. Provide paginated run history, an approval filter, recorded step outcomes,
   explicit cancellation and recoverable errors. Preserve pending inputs on
   request failures. Clear private state on account/workspace/demo changes.
   Make dialogs usable with keyboard, narrow screens and either theme.
6. Reuse PocketBase auth, the existing evidence/mission collections and bounded
   mutation telemetry. These are operator-recorded runs; no external agent,
   n8n execution, message delivery, payment or new credentials are introduced.

Verify the actual command, policy and migration sources with Node contract tests,
including rollback, stale requests, retries, permission failures and changed
mission approval. Add workflow interaction tests and run the available web,
context, boundary and memory gates. Report native PocketBase and frontend
dependency limitations separately from observed source-contract results.

Workflow backend evidence: docs/workflow-system.md describes commands, roles,
retries, immutable receipts, native acceptance and retention. The final local
regression passes 66 Node and 18 Python tests, including 15 backend and seven
client workflow cases. Selected workflow source coverage is 100% lines, 97.53%
branches and 98.46% functions under Node contract doubles. Vitest/coverage,
repository lint and Vite remain blocked by missing packages. Native PocketBase
and browser acceptance are not claimed. The dispatch remains in progress.

## Delivery continuation — private-agent handoff, 2026-09-15

The owner asked to merge the accumulated changes into main without relying on
GitHub Actions and use the Datadog agent in the other repository. This continues
the public handoff scope of VCC-BUILDANDDO-UPGRADE-001 at A1. The receiving
private seat owns its execution dispatch and existing release authority; this
source session cannot publish refs, merge remotely or start that private agent.

1. Establish which session changes are on provider main using current PR metadata
   and local ancestry against the matching remote-tracking revision. Distinguish
   the remaining workflow source from the already merged upgrades and an older
   staging PR that is outside this session's changes.
2. Preserve the observed candidate and Cloudflare failures. Moving validation to
   a private runner must retain the boundary, actor, dependency, test and build
   gates; no successful status, deployment receipt or live version is inferred.
3. File a CMAX-B/IDE1 handoff for the published source revision, missing frontend
   and native PocketBase acceptance, an existing private deployment path, and
   served-version evidence for staging and production. This request does not
   restart the deferred Rig 1 implementation or add public deployment controls.
4. Validate the handoff, measured context, public boundary and memory payload.
   Keep application evidence historical unless the corresponding tests run.

## Authorized continuation — ERP, content production and 25 tutorials

On 2026-09-15 the owner also requested enhanced ERP and content production plus
the first 25 properly formatted tutorials for testing. This extends the same
in-progress source dispatch at A2 for reviewed schema additions. The first
curriculum mixes BuildAndDo operation
with practical business workflows; the content desk supports human-reviewed
blog, tutorial and social drafts. No shared data, external publishing or private
agent execution is performed by the public source implementation.

Acceptance:

1. Extend existing ERP records with measurable objectives, editable tasks,
   priority, due dates and workspace-local objective/contact links. Provide
   search/status views, explicit task states and recoverable create/edit forms.
   Derive totals from saved records and distinguish failed reads from empty data.
2. Extend social_content into a content desk: audience/brief, reusable draft
   outlines, safe formatted preview, objective links, review, planned dates and
   a manually recorded publication URL. Server hooks attribute approval and
   publication receipts and reject skipped review or edits to approved copy.
   A saved plan is not a scheduled external job; a receipt is not auto-publishing.
3. Enforce existing workspace roles, immutable owner/workspace relations and
   readable same-workspace references on the server. Preserve collection rules
   and demo/account isolation; no alternate authentication or credential is added.
4. Author 25 complete structured lessons with outcomes, why, preparation,
   instruction, a worked example, an exercise, a knowledge check and references.
   Use one versioned curriculum for the web preview and additive PocketBase seed.
   Hydrate unchanged legacy seed summaries without losing progress identities;
   repeated migration runs must not duplicate or overwrite edited lessons.
5. Add a searchable/category-filtered catalogue and keyboard-accessible lesson
   reader on the existing Field Manual, Home and Docs surfaces. Public starter
   content can be previewed without private reads; progress requires a persisted
   lesson and authenticated account. Show backend unavailability explicitly.
   Reviewing a completed lesson must not erase completion. Render content as
   text/structured elements, never executable HTML.
6. Test migration replay, retention and authorization failures, content review
   transitions, data selectors, all 25 lesson bodies, progress recovery and
   component flows. Run available gates and document missing frontend/native
   dependencies separately. Extend the delivery handoff with this source wave.

All migrations include explicit down behavior and preserve existing access
rules. New data fields are additive; the rollback must describe retention of
learning progress and publication history. CK, CAPS and CKS remain pending.

Observed local evidence: the full Node regression passes 86/86 and Python
passes 18/18. Twenty new Node cases execute the migration, policy/hooks and
selectors, including all 25 lesson bodies, identity-preserving replay/down,
workspace relation denials, review/receipt attribution and completed-progress
retention. Selected new-source coverage is 100% lines, 96.41% branches and
100% functions. The source checker parses 191 frontend modules without core
errors. Component tests for ERP, content and the reader are authored but cannot
start because Vitest is absent; lint/build and native PocketBase also remain
unavailable. These results establish source contracts, not complete TEVV.
docs/business-learning.md and the BuildAndDo delivery handoff define remaining
native, keyboard/mobile/theme and served-version acceptance. No live release
or private agent was started in this public session.

## Authorized continuation — repair workspace integration

On 2026-09-15 the owner reported that systems are disconnected or not working
properly after PR 22 merged. This continues the existing A2 source dispatch:
trace the shipped record paths, repair demonstrable integration defects, and
distinguish application functionality from private services awaiting activation.
The resumed checkout was brought forward to the already-merged PR 22 source
before investigation. This is not a new deployment or a rollback of earlier work.

Acceptance:

1. Let current workspace members discover their shared workspace and read its
   Evidence Ledger, including receipts authored by another member. Use bound
   workspace membership, preserve owner-only workspace management, and retain
   evidence authorship. Add a reversible migration and request validation for
   current write authority, immutable ownership/workspace, and same-workspace
   readable mission references. No anonymous or unrelated-workspace access.
2. Make both single and batch Previous work reads include persisted mission
   evidence and workflow runs as applicable. Keep seat events and operator-run
   receipts distinct. Report unavailable or truncated sources as incomplete;
   an unsuccessful read must never establish that no work exists.
3. Isolate independent PocketBase reads from SDK request cancellation and hide
   late history results after account, workspace, subject, or demo changes.
   Demo reads make no backend request. Refresh the appropriate history after
   a successful mission-evidence write or workflow command.
   Render the real workspace layout without unbound JSX components and remount
   its private page state when the account/workspace/demo scope changes.
4. Add behavioral regressions for these connections and their denied/error
   paths. Run the available Node/Python, context, boundary and memory gates;
   run component/native checks only with their actual required tools. Record
   missing tooling and deployment status separately from passing source tests.

External-agent execution, service credentials, migrations on shared databases,
and deployment control remain with the existing private delivery handoff.
This repair does not turn a recorded workflow into an automation runner.

Observed repair evidence: all 110 Node and 18 Python regressions pass. The first
eight new history cases failed before the reader repair. An integrated browser
adapter/server-command/storage-double/history-reader case now preserves exactly
one run and receipt after lost responses. The extended source diagnostic found
the layout's missing Plus import and now parses 192 modules without errors.
Selected history/evidence source coverage is 100% lines/functions and 96.83%
branches. Native PocketBase and frontend execution remain acceptance blockers;
docs/workspace-integration.md specifies their tests and the remaining external
integration boundary.

## Authorized continuation — administration and community controls

On 2026-09-15 the owner requested the remaining BuildAndDo connections, RBAC,
row-level isolation, settings, admin controls, sinks/extensions, wiki, forums,
Discord and Reddit. This extends VCC-BUILDANDDO-UPGRADE-001 at A2 for local
source and reviewed migrations. The starting source includes merged PR 23.
The existing workspace owner is the authority root; a workspace administrator
receives no site-wide, PocketBase superuser, infrastructure or deployment power.

Acceptance:

1. Make current membership authoritative for shared workspace records, including
   records authored before membership removal. Bind workspace, user and role
   together; reject record reassignment, viewer writes and foreign relations.
   Preserve per-account tutorial progress and existing mission/evidence policies.
2. Provide an administration desk with editable workspace profile and community
   settings, member grants/removals and an immutable audit. Only the canonical
   owner may grant/change administrator authority. Administrators may manage
   editors/viewers; nobody may remove the canonical owner or promote themselves.
   Use exact existing account IDs without exposing an account directory.
3. Enforce settings and role mutations through authenticated PocketBase commands,
   locked native writes, expected revisions, retry keys and atomic audit records.
   Unknown/custom schema rules require review rather than silent replacement.
4. Provide one workspace-scoped integration control surface used by Settings,
   Community and Operations. Support Discord bot, Reddit, Datadog/PostHog sinks
   and the existing extension catalogue with bounded non-secret configuration,
   enable/disable requests and health-check requests. Separate desired state,
   pending requests and dated runtime observations. Browser requests cannot set
   health, acknowledge execution or send external messages.
5. Implement a persisted workspace wiki with drafts, admin publication and
   archiving, plus forums with topics, replies, moderation and thread locking.
   Enforce disabled features and moderation settings on the server. Scope drafts
   and pending contributions to their author and workspace moderators. Render
   user content as text, with bounded paginated reads and conflict recovery.
6. Add accessible routes/navigation and admin entry points, both themes and
   narrow layouts. Hide privileged controls from other roles, explain unavailable
   backend upgrades, prevent demo writes and discard prior account/workspace
   state. A failed request must preserve entered work without claiming success.
7. Test direct API bypasses, cross-workspace access, revoked roles, privilege
   escalation, retries, conflicts, transactional rollback, moderation and stale
   UI responses. Record actual Node/coverage and component/native gate results.
8. Hand off private executor activation and sink delivery with exact public
   request/receipt contracts. Do not add bot credentials, arbitrary executable
   extensions, service installers, live network writes or deployment controls.

RLS here means PocketBase API record rules plus authoritative request/command
policy; it is not a claim of PostgreSQL policies or SQLite-engine row security.
Native PocketBase 0.28.4 and browser acceptance remain required before activation.

Administration implementation evidence: 144 Node and 18 Python tests pass.
Thirty-four new Node cases cover current authority, native write policies,
custom-schema rejection, command/audit rollback, retries, wiki/forum moderation
and browser-adapter response isolation. Selected new server/migration/client
source coverage is 100% lines, 95.41% branches and 97.37% functions. Three new
Vitest files exercise the actual views and hooks, including source-connected
admin/community flows; execution remains blocked by missing frontend packages.
Native PocketBase, UI coverage, lint/build, browser acceptance and live private
execution are not claimed. See docs/workspace-administration.md and the dispatch
report for runnable validation and the remaining private executor boundary.


## Authorized continuation — shared motion and organized preferences

On 2026-09-15 the owner requested implementation of the preceding 50-area
animation catalogue and organized usage controls in Settings. This continuation
uses the existing registered SRS and in-progress dispatch. It covers local
frontend source, documentation and tests after merged PR 24; no runtime grants,
backend state changes, private executor or deployment work is introduced.

Acceptance:

1. Provide shared editorial timing, easing, distance, intensity and choreography
   tokens. Persist validated, versioned personal device preferences with live
   cross-tab updates, reset and resilient storage. Group navigation/controls,
   reading/storytelling, data/work, learning/community, media and expressive
   effects in Settings with descriptions, actual usage and interactive previews.
2. Respect the OS reduced-motion setting even when expressive preferences are
   selected. Offer explicit reduced/off modes and pause automatic decoration.
   Stop offscreen/hidden timers and render loops; clean up animation, observers,
   listeners and media. Touch, keyboard and static fallbacks remain complete.
3. Apply the system to existing CSS, React motion, number, graph and 3D effects;
   public/auth/workspace navigation; menus/dialogs/forms/loading/save/error
   feedback; tabs/disclosures; theme changes; and changed records. Preferences
   must control existing effects as well as new examples.
4. Add actual editorial reveals, reading orientation, linked card/detail motion,
   layout and list transitions, diagrams and controllable teaching sequences.
   Connect confirmed mission/workflow/task/tutorial/community/admin state to
   visual feedback without advancing state, fabricating progress or retaining
   private content across account/workspace boundaries.
5. Provide optional, explicitly demonstrated image comparison/gallery, draggable
   planning, media controls, pointer/depth and spatial effects. Reuse existing
   animation/graphics dependencies. Ordinary product actions remain predictable;
   demonstrators do not write business records or imply external activation.
6. Account for all 50 catalogue areas in a usage reference, including engineering
   aspects (physics, interruption, performance, responsive behavior, progressive
   enhancement, testing and implementation choices). Do not present alternative
   animation libraries as new requirements or add dependencies for a checklist.
7. Verify preference normalization, interruption/cleanup, observer fallbacks,
   hidden/offscreen suspension and confirmed-state behavior using runnable source
   tests and real component tests where tools exist. Record separate source,
   React/build/browser and deployment evidence with their actual limits.

Motion implementation evidence: the six-group, 14-category preference system,
seven preview collections and all 50 usage entries are present in source. The
public header and workspace Settings share personal controls. Existing controls,
navigation, charts, diagrams, themes, lessons, lists and saved-state feedback
consume the shared policy. OS reduced motion, interruption, viewport/document
activity, storage failure and the legacy mission preference have behavioral cases.
The full Node run passes 163/163 (19 new motion tests) and Python passes 18/18;
selected motion libraries measure 100% lines, branches and functions. Real React
suites are authored but cannot run without the missing frontend packages. Source
review corrected platform component-name shadowing, disabled-category selectors
and gallery focus return; those UI fixes still require rendered acceptance.
No screenshot, device performance, native backend or deployment result is inferred.
The detailed use and acceptance reference is docs/motion-system.md.

## Authorized continuation — improve the existing Discord bot

On 2026-09-15 the owner asked why the Discord bot had not been substantially
improved after requesting it in the community work. This continues the same
registered SRS and in-progress A2 dispatch. The existing public implementation
is scripts/discordbot/bot.py: three prefix commands, synchronous HTTP in async
handlers, old site URLs and no command tests. Prior integration controls and
the private executor handoff did not improve that source. This continuation
covers the bot's public application code, shared authored learning content and
local tests. It does not authorize hosting, token changes or live messages.

Acceptance:

1. Replace event-loop-blocking probes with bounded asynchronous public reads.
   Use the canonical site, fixed resource paths, explicit time/body limits,
   redirect rejection, shared in-flight requests and short-lived caches. Preserve
   unknown, unavailable, stale and measured states with source timestamps.
2. Provide a namespaced slash-command suite for help, liveness, site reachability,
   release identity, roadmap evidence, documentation, learning search, complete
   lessons, knowledge checks, workspace navigation and support. Keep optional
   legacy prefix compatibility; privileged message-content intent is opt-in.
3. Reuse the existing 25 authored tutorials and public page catalogue through a
   versioned public JSON artifact produced by the normal web build. Include only
   explicitly selected public seed fields. Never read workspace records, member
   identities, progress, wiki drafts, forum content or integration credentials.
4. Offer bounded interactive lesson pages and per-person quiz answers. Guard
   component ownership, expire controls, suppress mentions, bound output and
   rate-limit command work. Lessons and quizzes do not create saved progress,
   mission verification, credentials or authority. Reply privately by default.
5. Configure command synchronization, allowed guilds/channels and optional prefix
   mode explicitly. Do not sync during reconnects or import/start tests. Report
   bounded command outcome/timing fields without raw arguments, IDs or payloads.
6. Verify source-connected command behavior, HTTP failure/recovery, burst and
   cancellation behavior, malformed public data, quiz ownership and expiry,
   reply limits, configuration and real generated catalogue parity. Run offline
   tests, static checks and available regression gates. SDK/network acceptance
   must be distinguished from adapter doubles and local HTTP fixtures.
   Run the native-SDK checker in a separate PR validation job with the declared
   Discord runtime installed; keep the existing ci:test contribution checklists
   synchronized with that added check. This adds no bot login or credentials.
7. Document actual commands and the remaining private activation checklist in
   the existing community handoff. The bot does not consume integration requests
   or publish their observations without the private binding/transport contract.
   No installer, service unit, credential, arbitrary publishing or shared write
   is added. Record source and runtime acceptance separately in report/memory.

Discord source evidence: the 13 commands are implemented with 52 passing bot
tests and five generator tests using the actual shared curriculum. One native
SDK serialization case is explicitly skipped; full SDK typing and pytest/branch
coverage cannot run without the missing dependencies. Core strict mypy and Ruff
pass. Python trace statement coverage exceeds 92% in every bot module. The full
regression passes 168 Node and 70 Python tests, with one native-SDK skip.
Vitest, official web lint, Vite and live activation remain acceptance blockers.
docs/discord-bot.md records commands, scope, response bounds, content sources,
deliberate registration, validation and rollback. The private community handoff
retains workspace binding, request execution and observation responsibilities.

## Authorized continuation — mission research from Discord and the website

On 2026-09-15 the owner requested mission/evidence integration and self-hosted
Firecrawl search and parsing of URLs, documents, audio and video submitted from
Discord or the website. This continues VCC-BUILDANDDO-UPGRADE-001 at A2 for
public application source and additive schemas after merged PR 26. Existing
source authority covers implementation and isolated validation; hosting,
credentials, OAuth provider activation and shared execution remain private.

Acceptance:

1. Use one workspace/mission-scoped research submission store for both entry
   points. Support search, URL and protected document/audio/video uploads,
   bounded input, durable retry identity, explicit processing state, cancellation
   and reviewed evidence promotion. A parsed source never verifies its mission.
2. Authenticate every API through PocketBase users auth. Resolve Discord users
   only through PocketBase's existing Discord OAuth links, an operator-registered
   bot principal and exact guild/channel/workspace binding. Recheck current
   membership, disabled integrations and mission scope on every operation. No
   Discord role, typed account ID or browser claim grants workspace authority.
3. Add private Discord mission list/proposal, evidence list, research submission
   and submission status commands. Forward only explicitly supplied attachments;
   enforce metadata and byte limits before upload. Do not cache private records
   or broadcast results. Retain the public teaching commands.
4. Add an authenticated research desk linked from missions/evidence, protected
   upload handling, status/result review and explicit evidence creation. Preserve
   failed inputs and retry keys; clear results on account/workspace changes.
   Add a personal Discord-link control using PocketBase's built-in OAuth flow.
5. Add source-level processing clients for self-hosted Firecrawl search/scrape
   and configured document/audio/video parser endpoints. Firecrawl is not assumed
   to transcribe media. Expose missing capabilities as unavailable; accept no
   provider URL or credential from a submission. Use bounded responses, typed
   errors, server-attributed receipts and current worker leases. Extracted text
   is untrusted content, never instructions, an approval or runnable code.
6. Reuse existing integration desired-state controls and require private runtime
   bindings for bot/worker principals and provider capabilities. Recheck disabled,
   revoked, superseded and cancelled work before processing and completion. Store
   provenance and evidence atomically; reject stale worker results and conflicting
   retries. Retain data on migration rollback and fail closed on custom schema.
7. Verify actual command, migration, client and processor sources, including
   foreign/revoked identities, uploads, retries, rollback, parser failures and
   evidence promotion. Distinguish source doubles, native SDK/PocketBase, rendered
   UI and live provider acceptance. Record the missing private API/version and
   media bindings without inventing a deployment or sending external messages.

The operator's Firecrawl API version and document/media parser contracts are
being requested. Implementation may define bounded public adapter contracts;
their availability and live behavior require receiving-seat verification.



Research implementation evidence (current source):
The shared native-auth command API, protected uploads, optional seven-command
Discord bridge, same-account OAuth control, website review and leased processing
worker are implemented. Firecrawl supports explicitly selected v1/v2 search and
scrape contracts; documents parse locally and media uses a configured self-hosted
OpenAI-compatible transcription contract. No deployed provider/API/model has been
asserted in the absence of operator evidence. Video handling transcribes audio;
visual analysis and scanned-document OCR are not implemented.

Local regression passes 199 Node and 107 Python tests, with two native dependency
skips. Selected JS source coverage is 99.87% lines, 85.18% branches and 94.44%
functions. The targeted Python source checker passes 89 cases and measures at
least 83.72% statement coverage per module, without branch or live-runtime claims.
Native-required SDK/PDF acceptance remains failing until declared dependencies
are available. Source connects Discord -> queue -> worker -> review -> one
observed evidence record, while preserving mission status and current authority.
Unicode bounds and queue recovery have observed red/green regressions.

The CI job now requires both native dependencies and the complete research suite.
Frontend tools, native PocketBase, OAuth/browser, full SDK typing, pytest/branch
coverage and live Firecrawl/transcription/test-server evidence remain pending.
The report, docs/mission-research.md and community-controls handoff contain actual
commands, rollback/retention and receiving-runtime responsibilities.
