# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-COMMUNITY-WEB-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     .bits/srs/SRS-BUILDANDDO-COMMUNITY-WEB-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-COMMUNITY-WEB-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch of the 2026-09-22 community-web directions with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-COMMUNITY-WEB-001

**SRS:** SRS-BUILDANDDO-COMMUNITY-WEB-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

Every community link on the site comes from one module, each guildmaster has a public profile that
says it is an automated agent, community health is shown on the domain without a fake green, and
the seat session script no longer publishes which machine each persona runs on.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Single source for community links (footer, contact, llms.txt, sameAs) | `npm --prefix apps/web exec -- vitest run src/lib/__tests__/communityLinks.test.jsx` | in_progress |
| 2 | Persona directory and profiles, classroom presence links | `npm --prefix apps/web exec -- vitest run src/pages/__tests__/GuildPages.test.jsx` | in_progress |
| 3 | Community status schema, roadmap group and same-domain status page | `npm --prefix apps/web exec -- vitest run src/lib/__tests__/communityStatus.test.js src/pages/__tests__/StatusPage.test.jsx` | in_progress |
| 4 | Seat identity from the box, refusal instead of a guess | `python -m unittest tests.upgrade.test_ocn_seat_session` | in_progress |
| 5 | Whole suite and production build | `npm test` then `npm run build` | in_progress |

## Constraints

- Files this dispatch may touch: `apps/web/src/lib/communityLinks.js`, `communityStatus.js`,
  `personas.js`, the new guild and status pages and their tests, `App.jsx`, `publicPages.js`,
  `Footer.jsx`, `ContactPage.jsx`, `Seo.jsx`, `generate-seo.mjs`, `RoadmapPage.jsx`,
  `ClassroomPage.jsx`, the pages whose status link leaves the domain, `public/llms.txt`,
  `public/community-status.json`, `scripts/ci/ocn_seat_session.py`, its new test, and this
  bookkeeping.
- Files it must not touch: the workspace assistant, `index.html`, public icons and manifest,
  `scripts/publish/activity_publish.py`, `apps/edge/`, `pb_hooks/public-api*`, the `buddi_*`
  migrations (owned by other dispatches), and `activity-status.json`.
- Raises the tier above A2: any deploy, push or external write. None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/agent_context.py --check` passes (blocked while the readiness review is stale).
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
