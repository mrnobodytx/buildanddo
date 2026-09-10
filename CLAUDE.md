# ─── CGRF Header ───────────────────────────────────────────────
# File:        CLAUDE.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     AGENTS.md, .bits/context.md, CONTRIBUTING.md
# EnumType:    ConfigDoc
# EnumEdges:   EXTENDS AGENTS.md; VALIDATES .bits/context.md
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

## Before you write code

You need a dispatch ID and an SRS code from `.bits/srs_registry.yml`. If neither
exists for what you were asked to do, write a spec into `.bits/srs/`, register
it as `proposed`, and stop there. Branch `bits/<SRS-CODE>-<slug>`, one PR per
code, exactly one `actor:` label, and fill in the PR template.

## The shape of this repo

`apps/web` is the React + Vite site, `apps/pocketbase` is the backend and its
migrations, `services/praxis_evidence` is the evidence fabric with its own
Python suites, `scripts/ci` holds the gates, `scripts/deploy` holds the real
ship pipeline. GitHub is the public collaboration plane; golden data,
infrastructure and deployment authority live on the private GitLab mirror.

## Traps that have already cost time

- npm scripts must not use shell chaining. `apps/web/tools/build.mjs` documents
  the weeks of silently empty builds that taught this.
- `npm test --if-present` currently passes because no test script exists. A green
  pipeline is not evidence that anything was tested — see SRS-BUILDANDDO-TEST-001.
- The Python evidence suites need a live PocketBase, which is why public CI does
  not run them yet. Do not "fix" that by mocking them out.
- Datadog steps are deliberately no-ops without `DD_API_KEY`. A `SKIP:` line in
  the log is expected behaviour, not a failure.
- After changing pipelines, gates or governance files, run
  `python scripts/ci/agent_context.py --write` and commit the lock, or CI fails.

## When you find something broken outside your scope

Record it as a finding or a spec. Do not fix it inline — a PR that quietly
repairs three unrelated things is unreviewable, and this repo's governance is
built on one change having one reason.
