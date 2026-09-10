# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/context.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     AGENTS.md, .bits/srs_registry.yml, scripts/ci/agent_context.py
# EnumType:    ConfigDoc
# EnumEdges:   GATES bits/SRS-* branches; VALIDATES .bits/srs_registry.yml
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

A dispatch ID plus an SRS code registered in `.bits/srs_registry.yml` are
required before any code change. One PR per SRS code. Branch
`bits/<SRS-CODE>-<slug>`. Exactly one actor label. If the registry has no code
for the work you were asked to do, propose a spec in `.bits/srs/` and stop —
proposing is cheap, unauthorised merging is not. `AGENTS.md` has the full rules
and the hard NO list; they are not duplicated here so they cannot drift.

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

Ordered by how much unmeasured risk each removes, not by effort. Full specs in
`.bits/srs/`; statuses in `.bits/srs_registry.yml`.

1. **SRS-BUILDANDDO-TEST-001** — a web test runner emitting JUnit. CI already
   uploads test results; nothing produces any. Highest ratio of safety gained to
   work done, and it lights up a telemetry path that is currently dark.
2. **SRS-BUILDANDDO-EVIDENCE-CI-001** — run the Praxis evidence suite on the
   public plane. Fourteen suites exist, CONTRIBUTING tells people to run them,
   and public CI never does.
3. **SRS-BUILDANDDO-RELEASE-TAG-001** — one version identifier across RUM, CI
   and DORA, so "did this deploy hurt users" becomes answerable.
4. **SRS-BUILDANDDO-SUPPLY-001** — vulnerability, license and lockfile-integrity
   telemetry for a 630-package dependency tree nobody currently watches.

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
