# ─── CGRF Header ───────────────────────────────────────────────
# File:        AGENTS.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BOOTSTRAP-001, SRS-BUILDANDDO-COMMUNITY-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-09
# Depends:     CONTRIBUTING.md, .buildanddo/public/path-policy.json
# EnumType:    ConfigDoc
# EnumEdges:   GATES bits/SRS-* branches; VALIDATES .github/PULL_REQUEST_TEMPLATE.md; CONSUMES docs/federal-foundry.md; CONSUMES .bits/hostinger-readiness.json; CONSUMES docs/hostinger-sprint-closure.md
# Intent:      Define machine-facing governance for agents working in buildanddo.
# ───────────────────────────────────────────────────────────────

# AGENTS.md — buildanddo.com

Machine-facing conventions for AI agents working in the React/Vite + PocketBase
monorepo behind buildanddo.com, part of the Citadel Nexus estate. Humans should
read `CONTRIBUTING.md` first.

## What this repo is

- `apps/web` — React + Vite + TypeScript frontend (public site).
- `apps/pocketbase` — PocketBase backend, schema shipped via `pb_migrations/`.
- `services/praxis_evidence` — evidence fabric, tested against a live backend.
- `scripts/ci`, `scripts/deploy` — boundary scan and the real ship pipeline.
- GitHub is the public collaboration plane; GitLab executes CI and holds
  golden, infrastructure, release and deployment authority. Inspect the root
  GitLab configuration and its reachable includes; GitHub job status does not
  establish GitLab execution or acceptance. Automatic public PR governance and manual diagnostics remain enabled
  alongside the required GitLab jobs. Gates must not be disabled to hide failures.

## Start here

Run `python scripts/ci/agent_context.py`. It reports which pipelines exist,
which gate scripts are configured for GitLab, the real test surface, the open SRS codes
and every current finding with its evidence — measured from the repository, not
remembered. Then read `.bits/context.md` for intent, invariants and the current
plan, and `.bits/srs/<CODE>.md` for the spec your dispatch names.

Before selecting work and before handing it off, run
`python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check`, then read
`docs/hostinger-sprint-closure.md` with `.bits/hostinger-readiness.json`.
This is mandatory sprint governance. Every milestone records why it exists,
its source, executable checks, receiving owner and next action. Follow its
dependencies; prioritize closing the existing demo before widening scope.
When governed source changes, review those fields, update them where needed,
then run `python scripts/ci/hostinger_readiness.py --refresh` and recheck.
Refreshing the binding acknowledges source review only. It cannot mark a test,
deployment or milestone complete. Missing, stale, skipped and synthetic evidence
must remain explicit. The CI `governance:readiness` gate enforces this binding.
The submission policy defines internal provisional standards. It does not invent
official rules, eligibility or deadlines. Read `docs/submission-guide.md` for the
eleven-checkpoint acceptance matrix, current source boundaries and owner actions.
The workspace assistant reuses native permissions; its inferred plans and personal
patterns cannot approve missions, verify claims or confer deployment authority.

## Authorization

```yaml
agent_authorization:
  # A0: read-only inspection; no authorization or evidence artefact required
  # A1: local additive docs, tests, scaffolding, README or new modules
  #     an agent may create, register and dispatch its SRS before implementation
  # A2: existing shared code, configuration, CI or governance mutation
  #     requires a pre-existing SRS and dispatch in Ready or In progress state
  # A3: staging, production, external writes or secret access
  #     always requires an explicit human dispatch
  self_authorize_threshold: A1
  auto_register_srs: true
```

1. **A0 is read-only.** Inspection and reporting need no authorization because
   they do not change the repository or an external system.
2. **Agent seats may self-authorize A1 work.** Before implementation, create the
   SRS spec, register it as `in_progress`, and create its VCC dispatch task table
   in one governance step. The fast path permits those three bookkeeping edits;
   it does not turn any other existing-file mutation into A1 work.
3. **A2 requires pre-existing authority.** The SRS must already be registered
   with status `ready` or `in_progress`, and its dispatch must exist before an
   agent changes existing shared code, configuration, CI, or governance.
4. **A3 always requires a human dispatch.** An agent may not self-authorize
   staging/production effects, external writes, secret access, or a higher-risk
   action even when the source change itself looks additive.
5. Every code change still carries an **SRS code and VCC Dispatch ID**. Use the
   SRS in the branch name, commit footer, and PR title; one PR carries one SRS.
   Self-authorization lowers coordination cost, not the evidence standard.
6. Every PR carries exactly one **actor label**: `actor:human`, `actor:agent`,
   or `actor:mixed`. Agent self-authorized work uses `actor:agent`. `AAXP` =
   approved for execution; `TEVV` = tested, evaluated, verified and validated —
   claim it only with observed results.

**Bootstrap exception:** This file and its companion `CLAUDE.md` were exempt
from pre-flight during initial creation (SRS-BUILDANDDO-BOOTSTRAP-001). Later
changes follow the tiered authorization rules above.

## Stack canon (do not substitute without a dispatch that says so)

| Layer         | Choice                                          |
|---------------|-------------------------------------------------|
| Frontend      | React 18+, Vite, TypeScript                     |
| Backend       | PocketBase (Go-based BaaS)                      |
| Hosting       | Cloudflare Pages / Hostinger VPS                |
| Event bus     | NATS JetStream `           |
| Auth          | PocketBase built-in auth                        |
| Observability | Datadog APM + Logs + RUM (pending instrumentation) |

## Branch + commit conventions

Branch: `bits/<SRS-CODE>-<short-slug>`. Commit:

```
<type>(<scope>): <imperative description>

<why, not what>

SRS: <SRS-CODE>
Dispatch: <DISPATCH_ID>
```

Types: `feat | fix | docs | refactor | test | chore | ci`. Scopes:
`web | pocketbase | evidence | ci | deploy | docs | governance`. One PR per SRS
code. Fill in the PR template; do not remove its sections.

## Seat communication protocol

Several seats — human contributors and agent seats — can hold the same workspace
at once. Announce, do not assume. Publishing through
`apps/web/src/lib/seatComms.js` writes an append-only row to the `seat_events`
collection and fans it out over PocketBase realtime, so every other seat on that
workspace sees it without polling.

| Event            | Publish it when                                                        |
|------------------|------------------------------------------------------------------------|
| `seat.joined`    | You take a workspace, before touching anything. Claims the ground.     |
| `seat.progress`  | A phase of your task table finishes. Carries what changed, not intent. |
| `seat.completed` | The subject is done and its evidence exists. Terminal.                 |
| `seat.blocked`   | You cannot continue. Say what is missing, not that you are stuck.      |
| `seat.handoff`   | Another seat must continue. Set `handoffTo` to the target seat.        |

Rules that make the protocol worth having:

- **Check before you claim.** `apps/web/src/lib/workHistory.js` answers "has
  anyone worked this" from `seat_events` plus the mission's `evidence` records.
  Missions and Workflows both render it as a *Previous work* panel. Read it
  before starting; duplicated effort is the failure this exists to prevent.
- **`seat.completed` is terminal.** Later chatter on finished work is commentary.
  Reopening is a new mission, not a new event on the old one.
- **A blocked event names the blocker.** "Waiting on schema for X" is useful;
  "blocked" is not.
- **A handoff is not a push.** It records the request; the cross-seat artefact
  still goes in `.bits/handoffs/<DATE>-<FROM>-<TO>.md`.
- **The server stamps the speaker.** A browser event is `actor_type: human`
  with `seat` = the signed-in account id; anything else is refused
  (SRS-BUILDANDDO-TRUST-001). Agent seats publish through the server.
- Seat events stay on the public plane inside PocketBase. Bridging them to
  `citadel.bits.*` on NATS is private-stack work — write a handoff and stop.

## Federal research work packages

The owner-requested Influence, NAVAIR, low-SWaP, semantic ISR and Maritime lanes
are registered as separate proposed SRS scopes. Use
`python -m apps.federal_foundry compile --output <new-directory>` to produce
their opportunity files, model-independent Bits builder/verifier packets and
evidence-driven proposal drafts. Read `docs/federal-foundry.md` for the contract.

The current upgrade dispatch implements the shared compiler and registers the
lanes. An execution runtime assigns each lane its own verified dispatch and
repository session. Select the provider/model/version at runtime by capability;
the Bits seat is an execution identity, not a model requirement. Keep producer
and verifier seats distinct, preserve exact receipts and failed experiments,
and require actual physical evidence for hardware claims. Prepared packets do
not launch hosted agents or approve federal claims or submission.

## Progression pipeline tags

`apps/web/src/components/workspace/ProgressionPipeline.jsx` is the single source
for the contribution flow, and the tags below are what each automated step
reports under. A step with no tag is human work with no automated gate, and the
component says so rather than implying a check exists.

| Tag                          | Step             | What it actually checks                                     |
|------------------------------|------------------|-------------------------------------------------------------|
| `ci:test`                    | Test             | GitLab source Node/Python and semantic-twin suites, membership/evidence/fault assurance, web coverage, native Discord/PDF and CPU blueprint checks, Python 3.11/3.12 foundry/portfolio/mission/career/knowledge-unit/integrity/world-twin coverage, isolated Praxis and PocketBase workspace/suite/learning/classroom/dossier checks on both declared runtimes, and manifest/lock integrity; an explicit full-assurance lane adds browser/accessibility/compatibility/load/restore checks |
| `ci:build`                   | Pull request     | `npm run build` produces `dist/apps/web/index.html`         |
| `governance:boundary-scan`   | Governance check | `verify_public_boundary.py`, secret scan, exactly one actor label on the current review, `agent_context.py --check` |
| `governance:readiness`       | Sprint readiness | All 11 milestones match reviewed source; acceptance, replay and provisional submission validators reject incomplete evidence and invented official rules |
| `deploy:staging-probe`       | Staging deploy   | Candidate mirror to the private plane succeeds on `main`    |
| `deploy:production`          | Production       | Release visible in RUM, no new error signature from the deploy |

Steps `Idea`, `Issue`, `Fork / branch`, `Code` and `Review` carry no tag. When you
add a gate, add its tag to the step in that component and to this table in the
same change — a tag that exists in one place only is a lie in the other.

## Hard NO

- Never commit secrets, tokens, keys, or `.env` files — use vault references.
- Never push directly to `main`; never force-push; never rewrite history.
- Never write "Citadel Nexus LLC" — the entity is **Citadel Nexus Inc.**
- Never add golden, infrastructure, private-evidence, or deployment-control
  files here; they belong on the private GitLab mirror.
- Never hand-edit a running PocketBase database — ship a migration; never
  bypass `scripts/ci/verify_public_boundary.py` or the actor-label gate.

## Output style

- No emoji in code or commits; no marketing adjectives in docs.
- TypeScript: explicit types on exported functions; no `any` in new code.
- No shell-dialect chaining in npm scripts — use Node wrapper scripts.
- PocketBase migrations are idempotent and carry explicit down-migrations.
- Evidence, not assertions: "it builds" is not proof a feature works.

## When uncertain

Smaller scope beats larger scope; read existing patterns before inventing new
ones. If the task is ambiguous, comment and stop rather than shipping baked-in
assumptions. If it implies private-stack work (infrastructure, deployment
authority, golden data), emit a handoff note and stop. Bugs found outside the
dispatch scope are reported as comments, not fixed inline.
