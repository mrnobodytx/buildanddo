# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/README.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-AGENTCTX-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .bits/context.md, scripts/ci/agent_context.py
# EnumType:    Doc
# EnumEdges:   VALIDATES .bits/context.md
# Intent:      Explain the layout of the agent context layer to whoever opens the directory.
# ───────────────────────────────────────────────────────────────

# `.bits/` — agent working memory

Everything an agent needs to resume work on this repository without
re-deriving it, plus the machinery that keeps it honest.

| Path                      | What it is                                                        |
|---------------------------|-------------------------------------------------------------------|
| `context.md`              | Durable brief: intent, invariants, current plan. Hand-written.     |
| `context.lock.json`       | Measured repository state and findings. Generated, committed, CI-checked. |
| `srs_registry.yml`        | Every SRS code a branch may claim, with status and risk tier.      |
| `srs/<CODE>.md`           | One spec per proposed or active code.                              |
| `queue/<DISPATCH_ID>.md`  | Task table for an authorised dispatch.                             |
| `handoffs/<date>-<a>-<b>.md` | Work that belongs to another seat or the private mirror.        |

## The loop

```bash
python scripts/ci/agent_context.py            # rehydrate: what exists, what is broken
python scripts/ci/agent_context.py --write    # after changing pipelines, gates or governance
python scripts/ci/agent_context.py --check    # what CI runs; fails on a stale lock
```

The split matters. `context.md` states intent and cannot be verified by a
machine. `context.lock.json` states facts and is verified on every PR. Keeping
them apart is what stops this directory from becoming the stale onboarding doc
every repository eventually accumulates.

Human contributors want `CONTRIBUTING.md` and `CLAUDE.md` instead; `AGENTS.md`
holds the rules both audiences are bound by.
