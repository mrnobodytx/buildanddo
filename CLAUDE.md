# ─── CGRF Header ───────────────────────────────────────────────
# File:        CLAUDE.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     AGENTS.md, .bits/context.md, CONTRIBUTING.md
# EnumType:    ConfigDoc
# EnumEdges:   EXTENDS AGENTS.md; VALIDATES .bits/context.md; CONSUMES docs/hostinger-sprint-closure.md
# Intent:      Provide the human-facing companion AGENTS.md declares but the repo never had.
# ───────────────────────────────────────────────────────────────

# CLAUDE.md — working here as an IDE seat

`AGENTS.md` is the machine-facing rulebook and it binds you too. This file is
the shorter, human version: how to get oriented fast and where the traps are.

## Orient in one command

```bash
python scripts/ci/agent_context.py
```

That prints the pipelines that exist, which check scripts are actually wired
into CI, the real test surface, the open SRS codes and every current finding
with its evidence. It reads the repository, so it cannot be out of date. Then
read `.bits/context.md` for intent and priorities.
`python scripts/ci/system_growth.py` shows how each system is growing: size, tests,
README and CGRF coverage, and dispatch progress. Its `--history` is the record of every merge.

The Hostinger sprint also requires
`python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check` before choosing work and
before handoff. Read `docs/hostinger-sprint-closure.md` and the tracked readiness
contract for each piece's rationale, owner, dependencies and next action.
Review those fields when source changes, then refresh the source binding.
Refreshing cannot establish native, browser or deployed acceptance.

## Before you write code

Classify the effect first. A0 inspection needs no authorization. An agent seat
may self-authorize A1 additive work by creating the spec, registering it
`in_progress`, and creating the dispatch task table before implementation. A2
shared code/configuration/CI/governance changes need a pre-existing `ready` or
`in_progress` SRS and dispatch. A3 staging, production, external-write or secret
work always needs an explicit human dispatch. Then branch
`bits/<SRS-CODE>-<slug>`: one SRS and one `actor:` label per PR.

## The shape of this repo

`apps/web` is the React + Vite site, `apps/pocketbase` is the backend and its
migrations, `services/praxis_evidence` is the evidence fabric with its own
Python suites, `scripts/ci` holds the gates, `scripts/deploy` holds the real
ship pipeline. GitHub is the public collaboration plane; GitLab executes CI and
holds golden data, infrastructure and deployment authority. The Day-21 GitLab
job runs all eighteen acceptance profiles and retains the complete evidence
export. The briefing distinguishes reachable GitLab wiring from GitHub
definitions; neither source inventory nor a GitHub job failure establishes
GitLab runtime acceptance.
GitHub governance runs automatically for public PR changes, with an explicit
manual diagnostic also available. Both pin one reviewed head. The
GitLab source-validation include preserves the separate coverage matrices;
review pipelines require one actor label. Public GitHub review metadata and
GitLab status publication must come from the receiving CI integration.

## Traps that have already cost time

- npm scripts must not use shell chaining. `apps/web/tools/build.mjs` documents
  the weeks of silently empty builds that taught this.
- The root `npm test` and `npm run test:coverage` run the web Vitest suite.
  Missing dependencies or skipped runtime tests cannot establish acceptance.
- Praxis tests need real disposable PocketBase processes, not a shared backend.
  Their GitLab job runs both declared profiles through the isolated runner;
  missing binaries remain BLOCKED. Never point selftests at production or replace
  native acceptance with mocked results.
- Datadog steps are deliberately no-ops without `DD_API_KEY`. A `SKIP:` line in
  the log is expected behaviour, not a failure.
- After changing pipelines, gates or governance files, run
  `python scripts/ci/agent_context.py --write` and commit the lock, or CI fails.

## When you find something broken outside your scope

Record it as a finding or a spec. Do not fix it inline — a PR that quietly
repairs three unrelated things is unreviewable, and this repo's governance is
built on one change having one reason.
