# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-AGENTCTX-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/agent_context.py, .bits/context.md
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/agent_context.py
# Intent:      Specify the context layer that stops every agent turn from rebootstrapping.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-AGENTCTX-001 — Durable agent context layer

**Status:** in_progress **Risk:** A0 **Seat:** BITS-CODEGEN

## Problem

Three agent sessions have now opened PRs against this repo, and every one of
them started by invoking a "bootstrap exception" because the governance layer
AGENTS.md assumes (`.bits/`) does not exist. Each session re-derived the same
facts by grepping, kept its findings in chat, and lost them at the end of the
turn. Nothing accumulated. Nothing was measured.

Meanwhile the repository contains real, checkable state that no document
tracks: which check scripts are wired into CI and which are not, whether a test
runner exists, which governance files are declared but missing.

A hand-written brief would go stale within a sprint — this repo's own history
shows exactly that failure mode (build scripts silently producing no output for
weeks, `.buildanddo/` ignore rules starving the boundary scanner).

## Intent

Give every agent turn the same measured view of the repository, derived from the
repository, plus a durable place to record backlog, dispatches and handoffs.

## Scope

- `.bits/context.md` — durable, human-written brief: mission, invariants, how to
  start a turn. Stable across sessions; changes rarely.
- `.bits/srs_registry.yml` — the codes a branch may claim, with status and risk.
- `.bits/srs/*.md` — one spec per proposed or active code.
- `.bits/queue/`, `.bits/handoffs/` — dispatch task tables and cross-seat notes.
- `scripts/ci/agent_context.py` — derives pipelines, gates, test surface,
  governance files and findings from the repo; writes `.bits/context.lock.json`.
- CI runs `--check` so the lock cannot drift from reality.
- Governance counters flow into the existing telemetry snapshot, so unwired
  gates and open findings are graphed like any other metric.

## Out of scope

- Fixing the findings the tool reports. Each has its own SRS code.
- Any private-stack dispatch infrastructure (VCC databases, NATS, memory MCP).
  This layer is a public-mirror subset that stands alone.

## Acceptance evidence

1. `python scripts/ci/agent_context.py` prints pipelines, gates, test surface,
   open SRS codes and findings with evidence for each.
2. `python scripts/ci/agent_context.py --check` passes on a clean tree and fails
   after any repository change that invalidates the lock.
3. Adding a spec file without registering it, or registering a code without a
   spec, is reported as a high finding.
4. `buildanddo.ci.governance.*` metrics appear in the telemetry snapshot.

## Verification

```bash
python scripts/ci/agent_context.py
python scripts/ci/agent_context.py --write && git diff --exit-code .bits/context.lock.json
python scripts/ci/agent_context.py --check
```
