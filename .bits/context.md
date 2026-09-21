# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/context.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     AGENTS.md, .bits/srs_registry.yml, scripts/ci/agent_context.py
# EnumType:    ConfigDoc
# EnumEdges:   GATES bits/SRS-* branches; VALIDATES .bits/srs_registry.yml; CONSUMES .bits/hostinger-readiness.json
# Intent:      The durable brief an agent reads first; measured facts live in the lock beside it.
# ───────────────────────────────────────────────────────────────

# Agent context — buildanddo.tech

This file is the **durable** half of agent context: intent, invariants and
priorities that change rarely. The **measured** half is `.bits/context.lock.json`,
regenerated from the repository by `scripts/ci/agent_context.py`. When the two
disagree, the lock is right and this file needs editing.

## Start a turn like this

```bash
python scripts/ci/agent_context.py     # pipelines, gates, tests, open SRS, findings
```

Then read, in order: `AGENTS.md` (rules), this file (intent), the SRS spec named
in your dispatch. Do not start from a code search — the briefing already tells
you what exists and what is broken.

## Authorisation, in one paragraph

Authorization follows effect, not task size. A0 inspection is read-only and
needs no authorization. For A1 additive work (docs, tests, scaffolding, README
or a new module), an agent seat may self-authorize by creating the SRS spec,
registering it `in_progress`, and creating its dispatch before implementation.
A2 changes to existing shared code, configuration, CI or governance require a
pre-existing registered SRS in `ready` or `in_progress` state plus its dispatch.
A3 staging/production effects, external writes and secret access always require
an explicit human dispatch. Every A1+ change still uses one SRS, one dispatch,
one PR, branch `bits/<SRS-CODE>-<slug>`, and exactly one actor label. `AGENTS.md`
defines the precise tiers and hard NO list.

## What is already wired

Three pipelines: PR governance (boundary scan, lint, build, artifact), candidate
mirror to private GitLab on main, and DORA deployment reporting. Every run also
measures itself — bundle, dependencies, source volume, tests, lint, dead code,
boundary results — compares against the last main baseline, and publishes
metrics, deltas, events and logs to Datadog on us5. The browser ships RUM and
browser logs. Run the briefing for the current, measured version of this list.

## Invariants this repo has already paid for

These are not style preferences. Each one exists because it broke something.

- **No shell-dialect chaining in npm scripts.** `&&`/`||` in package scripts
  produced silent zero-output builds for weeks; the fix is Node wrapper scripts
  (`apps/web/tools/build.mjs` explains it). Do not reintroduce shell logic there.
- **The boundary scanner must be able to see its own policy.** A blanket
  `.buildanddo/` ignore once starved it on fresh checkouts. Anything added to
  `.gitignore` near that path needs the same scrutiny.
- **Evidence, not assertions.** "It builds" is not proof a feature works. Every
  acceptance claim in an SRS carries a command that produces the evidence.
- **Observability must not be able to break the build it observes.** Collectors
  are best-effort, publishers warn instead of failing, and a missing Datadog key
  is a `SKIP`, never an error.
- **Public plane is public.** Golden data, infrastructure, deployment authority
  and private evidence live on the GitLab mirror. If a task needs them, write a
  handoff note in `.bits/handoffs/` and stop.

## Current plan

The owner prioritizes the 21-day Hostinger demo under the existing upgrade
SRS/dispatch. Run `python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check` before
choosing work and before handoff. Read `docs/hostinger-sprint-closure.md` and
`.bits/hostinger-readiness.json`: every canonical milestone has rationale,
dependencies, required evidence, an owner and a next step. Follow those
dependencies and recheck them against changed source. Review, update and refresh
the source binding before final validation; never refresh as a substitute for
acceptance. The contract does not assert a percentage or rewrite sprint state.

1. Restore the ability to execute acceptance. GitHub check annotations observed
   on September 20 report an account billing lock; that needs the account owner.
   Then run the locked web toolchain and both declared disposable PocketBase
   profiles, retaining actual failure and skip counts. Vitest/JUnit, release
   tags and supply telemetry now exist; older proposed specs are not a current
   inventory of missing implementations.
2. Complete one connected small-business journey: saved signal, bounded mission,
   explicit approval, action, a different verifier, evidence and operator readback.
   The workflow desk now separates recorded procedures from frozen executable
   ERP, Firecrawl and registered n8n steps. The worker retains uncertain effects
   for reconciliation. Provider activation and current NXC context retain their
   receiving dispatch and scope. The assistant proposes visible form interactions
   under native permissions and keeps each user's session patterns personal.
3. Capture release/provider readback, reconcile it with the semantic twin and
   obtain owner review of the milestone evidence. A passing source test, prepared
   packet or synthetic replay cannot establish live deployment or competition
   readiness. Official competition rules and the submission deadline still need
   a cited owner confirmation.

`docs/submission-guide.md`, `docs/business-execution.md` and
`docs/workspace-assistant.md` explain the implemented paths, personal-data
boundaries, runtime bindings, acceptance commands and remaining owner decisions.

The live Praxis suite and fleet/deployment tools retain their separately scoped
runtime requirements. Do not silently run them against a shared backend or hide
unwired-gate findings to make a progress indicator green.

Findings that are not yet specs appear in the briefing with their evidence.
Promote one to a spec rather than fixing it inline in an unrelated PR.

## Working in this layer

- `.bits/srs/<CODE>.md` and a registry entry always land together; the briefing
  reports either half alone as a high finding.
- Dispatch task tables go in `.bits/queue/<DISPATCH_ID>.md` (see `TEMPLATE.md`).
- Cross-seat requests go in `.bits/handoffs/<DATE>-<FROM>-<TO>.md`.
- After any change that alters pipelines, gates, tests or governance files, run
  `python scripts/ci/agent_context.py --write` and commit the lock. CI checks it.
- Record what you learned that the next agent would otherwise rediscover. That
  is the entire point of this directory.
