# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-REALTIME-TURN-001.md
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-REALTIME-TURN-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-REALTIME-TURN-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-REALTIME-TURN-001-* branches
# Intent:      Track the TURN slice and the operator steps it depends on.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-REALTIME-TURN-001

**SRS:** SRS-BUILDANDDO-REALTIME-TURN-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

A classroom viewer behind symmetric NAT or a UDP-blocking firewall gets a TURN relay to the SFU when the
owner configures a TURN key, and every other case joins exactly as before.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Server mints TURN ICE servers, degrades to STUN with a reason | `node --test tests/upgrade/classroom-ice.test.mjs` | done |
| 2 | Existing classroom contracts unchanged | `node --test tests/upgrade/classroom-media.test.mjs tests/upgrade/classroom-media-client.test.mjs tests/upgrade/classroom-presence.test.mjs tests/upgrade/classroom-client.test.mjs` | done |
| 3 | Hook prefetches ICE per scope without delaying the join | `npx vitest run --root apps/web src/hooks/__tests__/useClassroomMedia.test.jsx src/components/broadcast/__tests__/LiveBroadcast.test.jsx` | done |
| 4 | Governance and boundary | `python scripts/ci/agent_context.py --check` | done |
| 5 | Owner: TURN key on the PocketBase unit (A3) | `curl -s https://buildanddo.com/hcgi/platform/api/classroom/health \| python -c "import json,sys;print('PASS' if json.load(sys.stdin).get('turn_configured') else 'FAIL')"` | todo (owner) |

## Constraints

- Files this dispatch may touch: the classroom realtime hook/lib/route, `classroomRealtime.js`,
  `useClassroomMedia.js`, their tests, `.env.example`, this file, the SRS, the registry, generated locks.
- Files it must not touch: CI configuration, deploy scripts, other Workers, anything in Cloudflare.
- Raises the tier: setting the TURN key, changing zone routes, provisioning a MoQ relay.

## Definition of done

- [x] Every gate command passes and the output is in the PR (task 5 is the owner's).
- [ ] `python scripts/ci/agent_context.py --check` passes.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed (route namespace overlap; classroom node suites unwired in CI).
