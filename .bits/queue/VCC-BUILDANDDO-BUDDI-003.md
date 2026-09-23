# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-003.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-BUDDI-003
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-003
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-003.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-BUDDI-003
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that puts Buddi's voice inside the home page, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-003

**SRS:** SRS-BUILDANDDO-BUDDI-003 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

A visitor can talk to Buddi without leaving the home page. They start it themselves, see what is happening
in words, and get the talk-to link whenever the page cannot use their microphone.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Add `@elevenlabs/react` (operator approved 2026-09-23: MIT, about 16 MB unpacked with its dependencies) | `npm ci` from the updated lock | pending |
| 2 | Agent id from the one source; microphone policy check | `vitest run src/components/voice/__tests__/TalkToBuddi.test.jsx` | pending |
| 3 | "Talk to Buddi" section, lazy session, fallback link | same test | pending |
| 4 | Staging nginx sends `microphone=(self)` | `grep Permissions-Policy apps/web/nginx.conf` | pending |
| 5 | Build splits the SDK into its own chunk; no leak in the build | `npm run build`, `public_redaction.py scan dist/apps/web` | pending |
| 6 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | pending |

## Operator steps (not performed here)

1. **Production header:** the production host's nginx sends `Permissions-Policy: camera=(), microphone=(self),
   geolocation=()`. Alternatively, the edge Worker's default changes the same way once SRS-BUILDANDDO-BUDDI-002
   puts its source in this repository and it is redeployed.
2. **Allowed origins:** the ElevenLabs agent accepts sessions from `https://buildanddo.com` (and staging).
3. **Deploy:** the web build, through the release rail.
4. **Buddi v2:** switch the agent to its v2 workflow after SRS-BUILDANDDO-BUDDI-002 is deployed and its tool
   secret is set.

## Constraints

- Files this dispatch may touch: `apps/web/package.json`, `package-lock.json`, `apps/web/src/lib/voiceAgent.js`,
  `apps/web/src/components/voice/*` and its tests, `apps/web/src/pages/HomePage.jsx`, `apps/web/nginx.conf`,
  this bookkeeping and the readiness and context locks.
- No key, token or secret in the page or the repository; the agent is public.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: deploy, push, any change to the live agent or to production headers. None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] The built page loads no voice code before Start.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
