# ─── CGRF Header ───────────────────────────────────────────────
# File:        AGENTS.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BOOTSTRAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-09
# Depends:     CONTRIBUTING.md, .buildanddo/public/path-policy.json
# EnumType:    ConfigDoc
# EnumEdges:   GATES bits/SRS-* branches; VALIDATES .github/PULL_REQUEST_TEMPLATE.md
# Intent:      Define machine-facing governance for agents working in buildanddo.
# ───────────────────────────────────────────────────────────────

# AGENTS.md — buildanddo.tech

Machine-facing conventions for AI agents working in the React/Vite + PocketBase
monorepo behind buildanddo.tech, part of the Citadel Nexus estate. Humans should
read `CONTRIBUTING.md` first.

## What this repo is

- `apps/web` — React + Vite + TypeScript frontend (public site).
- `apps/pocketbase` — PocketBase backend, schema shipped via `pb_migrations/`.
- `services/praxis_evidence` — evidence fabric, tested against a live backend.
- `scripts/ci`, `scripts/deploy` — boundary scan and the real ship pipeline.
- GitHub is the public collaboration plane; the private GitLab mirror holds
  golden, infrastructure, release and deployment authority.

## Authorization

1. **A VCC Dispatch ID is required before any code change.** No dispatch, no
   commit — post a comment asking for one and stop.
2. Every change carries an **SRS code** (e.g. `SRS-BUILDANDDO-BOOTSTRAP-001`),
   used in the branch name, commit footer, and PR title.
3. Every PR carries exactly one **actor label**: `actor:human`, `actor:agent`,
   or `actor:mixed`. `AAXP` = approved for execution; `TEVV` = tested,
   evaluated, verified and validated — claim it only with observed results.
4. Risk tiers `A0`–`A2` are normal; `A3`+ (shared/staging mutation or beyond)
   needs explicit human approval before work starts.

**Bootstrap exception:** This file and its companion `CLAUDE.md` are exempt from
the pre-flight governance check during initial creation
(SRS-BUILDANDDO-BOOTSTRAP-001). All subsequent dispatches require normal pre-flight.

## Stack canon (do not substitute without a dispatch that says so)

| Layer         | Choice                                          |
|---------------|-------------------------------------------------|
| Frontend      | React 18+, Vite, TypeScript                     |
| Backend       | PocketBase (Go-based BaaS)                      |
| Hosting       | Cloudflare Pages / Hostinger VPS                |
| Event bus     | NATS JetStream `147.93.43.117:4222`             |
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
